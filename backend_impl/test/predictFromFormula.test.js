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

/** 测试隔离：只用种子里的 bases（不带运行期新增的规则），避免线上规则泄漏进断言。 */
function basesOnlySeed(filePath) {
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const target = path.join(path.dirname(filePath), `seed-bases-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(target, JSON.stringify({ version: snapshot.version, bases: snapshot.bases, rules: [] }), 'utf8');
  return target;
}


async function withRegistry(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-predict-formula-'));
  const db = new sqlite3.Database(path.join(dir, 'database.db'));
  svc.setDb(db);
  svc.setJsonPath(path.join(dir, 'material_base_map.json'));
  await svc.ensureMaterialBaseSchema(db);
  await svc.bootstrapFromJson({ filePath: basesOnlySeed(SEED) });
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

test('未知 material_id：默认只告警 + 建议（不静默切换），显式开关才切换', async () => {
  await withRegistry(async () => {
    const ids = [{ material_id: '61', ratio_pct: 50 }, { material_id: '0', ratio_pct: 50 }];

    const def = await predictFromFormula({ components: ids }, { callPredict: stubModel([]) });
    const codes = def.warnings.map((w) => w.code);
    assert.ok(codes.includes('MATERIAL_NOT_IN_VOCAB'), '应告知 one-hot 恒 0 的原料');
    assert.ok(codes.includes('VARIANT_RECOMMENDED'), '应给出更优变体建议');
    assert.ok(!codes.includes('VARIANT_SWITCHED'), '默认不得静默切换权重');
    assert.equal(def.variant, 'yangquan', '默认仍用模型默认变体');
    assert.deepEqual(def.coverage.unknown, ['0'], 'coverage 描述最终使用的变体（yangquan）');
    assert.equal(def.coverageByVariant.find((c) => c.variant === 'yangquan').unknown.length, 1);

    const sw = await predictFromFormula({ components: ids, auto_switch_variant: true }, { callPredict: stubModel([]) });
    assert.ok(sw.warnings.some((w) => w.code === 'VARIANT_SWITCHED'));
    assert.equal(sw.variant, 'processed');
    assert.deepEqual(sw.coverage.unknown, [], '切换后的 coverage 应描述 processed');
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
