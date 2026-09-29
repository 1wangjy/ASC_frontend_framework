const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('../node_modules/sqlite3').verbose();

const svc = require('../src/services/materialBaseService');
const vocab = require('../src/services/vocabService');
const { predictFromFormula, componentsFromMr } = require('../src/services/predictFormulaService');

const SEED = path.join(__dirname, '..', '..', 'data', 'material_base_map.json');

async function withRegistry(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-predict-formula-'));
  const db = new sqlite3.Database(path.join(dir, 'database.db'));
  svc.setDb(db);
  svc.setJsonPath(path.join(dir, 'material_base_map.json'));
  await svc.ensureMaterialBaseSchema(db);
  await svc.bootstrapFromJson({ filePath: SEED });
  await vocab.refreshVocab({ variants: ['yangquan', 'processed'] });
  try {
    return await run(db);
  } finally {
    await new Promise((resolve) => db.close(() => resolve()));
  }
}

/** 假模型：断言载荷并回一个预测结构 */
function stubModel(captured) {
  return async (payload) => {
    captured.push(payload);
    return { status: 200, body: { predictions: [{ property: 'bulk_density', condition: payload.conditions?.[0] || '110℃', value: 3.14, unit: 'g/cm3' }], warnings: [] } };
  };
}

test('按 base 名预测：短行 X_comp + X_global + 覆盖报告', async () => {
  await withRegistry(async () => {
    const captured = [];
    const out = await predictFromFormula({
      components: [{ base_name: '棕刚玉', ratio_pct: 70 }, { base_name: '97黑碳化硅', ratio_pct: 30 }],
      globals: { water_amount: 3.6, hardening_time: 10, hardening_time_uncertainty: 0 },
      conditions: ['110℃'], properties: ['bulk_density'],
    }, { callPredict: stubModel(captured) });

    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].X_comp, [['61', 70], ['17', 30]]);
    assert.deepEqual(captured[0].X_global, [3.6, 10, 0]);
    assert.equal(captured[0].variant, 'yangquan', '无未知原料时应保留默认变体');
    assert.equal(out.predictions.length, 1);
    assert.equal(out.coverage.unknown.length, 0);
    assert.deepEqual(out.components.map((c) => c.material_id), ['61', '17']);
    assert.equal(out.warnings.length, 0);
  });
});

test('拆解/归一化名称同样可用（325目棕刚玉、全角 ９７黑碳化硅）', async () => {
  await withRegistry(async () => {
    const out = await predictFromFormula({
      components: [{ base_name: '325目棕刚玉', ratio_pct: 60 }, { base_name: '９７黑碳化硅', ratio_pct: 40 }],
    }, { callPredict: stubModel([]) });
    assert.deepEqual(out.request.X_comp, [['61', 60], ['17', 40]]);
  });
});

test('未映射原料：400 UNRESOLVED_BASE，不调用模型', async () => {
  await withRegistry(async () => {
    const captured = [];
    await assert.rejects(
      () => predictFromFormula({ components: [{ base_name: '高铝铝土', ratio_pct: 100 }] }, { callPredict: stubModel(captured) }),
      (error) => {
        assert.equal(error.code, 'UNRESOLVED_BASE');
        assert.equal(error.status, 400);
        assert.equal(error.payload.raw, '高铝铝土');
        assert.ok(error.payload.ruleTemplate && error.payload.ruleTemplate.kind);
        return true;
      },
    );
    assert.equal(captured.length, 0, '未解析时不得调用模型');
  });
});

test('未知 material_id 进入覆盖告警并自动切换到覆盖更好的变体', async () => {
  await withRegistry(async () => {
    const out = await predictFromFormula({
      components: [{ material_id: '61', ratio_pct: 50 }, { material_id: '0', ratio_pct: 50 }],
    }, { callPredict: stubModel([]) });
    const codes = out.warnings.map((w) => w.code);
    assert.ok(codes.includes('MATERIAL_NOT_IN_VOCAB'));
    assert.ok(codes.includes('VARIANT_SWITCHED'));
    assert.equal(out.variant, 'processed', '0 号原料只在 processed/base/fill 词表内');
    // coverage 描述“最终使用的变体”（processed 覆盖 0 号原料）
    assert.deepEqual(out.coverage.unknown, []);
    assert.equal(out.coverage.variant, 'processed');
    // 各变体对照里仍能看到默认变体 yangquan 的缺口
    const yq = out.coverageByVariant.find((c) => c.variant === 'yangquan');
    assert.deepEqual(yq.unknown, ['0']);
    const warn = out.warnings.find((w) => w.code === 'MATERIAL_NOT_IN_VOCAB');
    assert.equal(warn.evaluatedVariant, 'yangquan');
  });
});

test('配比合计不为 100 时给出告警但不阻断', async () => {
  await withRegistry(async () => {
    const out = await predictFromFormula({ components: [{ base_name: '棕刚玉', ratio_pct: 70 }] }, { callPredict: stubModel([]) });
    assert.ok(out.warnings.some((w) => w.code === 'RATIO_NOT_100'));
  });
});

test('componentsFromMr：业务表 mr 行 → 组件（含 meta 里的 material_id）', async () => {
  await withRegistry(async () => {
    const mrRow = {
      mr_id: 'MR_X',
      component_list: JSON.stringify([
        ['铝土', 'MC_1', JSON.stringify({ base_id: 'BASE_000012', material_id: '11', base_name: '倒焰90矾土', raw: '铝土' }), 60],
        ['碳化硅', 'MC_2', '{}', 40],
      ]),
    };
    const components = await componentsFromMr(mrRow);
    assert.equal(components.length, 2);
    assert.equal(components[0].material_id, '11');
    assert.equal(components[0].ratio_pct, 60);
    assert.equal(components[1].base_name, '碳化硅', '旧元组回退用原始名');
  });
});
