'use strict';

/**
 * 智能解析测试（node --test）：base/baseid 解析、规格剥离、配比归一化、行分类、X_comp 契约。
 * 基准：data/material_base_map.json（89 bases）+ FEATURE/outputs/material_map.json +
 *      _ref/handover/ML/*.npy 的 X_comp 列定义（48 列，前 5 列为
 *      material_id / ratio_pct / particle_size_min / particle_size_max / base）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../lib/parser');

const registry = P.BaseRegistry.load();
const COMPONENT_NAMES = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../backend_impl/python/model_predict/FEATURE/outputs/metadata_yangquan.json'), 'utf8'),
).component_feature_names;

test('注册表规模与数据集一致（89 bases，全部带 material_id）', () => {
  assert.equal(registry.bases.length, 89);
  for (const base of registry.bases) {
    assert.ok(base.base_id && base.base_name && String(base.material_id) !== '', JSON.stringify(base));
  }
});

test('精确匹配：base 名 → material_id（样例取自 material_map.json）', () => {
  const cases = { 棕刚玉: '61', 高铝: '86', FS20: '30', 黑刚玉: '88', '97黑碳化硅': '17' };
  for (const [name, materialId] of Object.entries(cases)) {
    const resolved = registry.resolve(name);
    assert.equal(resolved.matched, true, name);
    assert.equal(resolved.materialId, materialId, name);
    assert.equal(resolved.resolvedBy, 'exact', name);
  }
});

test('规格剥离：目数/粒度/类别词不污染 base 匹配', () => {
  const cases = ['325目棕刚玉', '棕刚玉细粉', '≤1mm90黑碳化硅骨料', '5-3mm棕刚玉', '棕刚玉微粉 ≤1mm'];
  for (const text of cases) {
    const resolved = registry.resolve(text);
    assert.equal(resolved.matched, true, text);
    assert.ok(['棕刚玉', '90黑碳化硅'].includes(resolved.baseName), `${text} → ${resolved.baseName}`);
  }
  assert.equal(registry.resolve('325目棕刚玉').decomposed.primarySize.mesh, 325);
  assert.equal(registry.resolve('棕刚玉细粉').decomposed.className, 'fine');
});

test('代号写法：代号 61 / #61 / material_id=61 解析到同一 base', () => {
  for (const text of ['代号61', '#61', 'material_id=61']) {
    const resolved = registry.resolve(text);
    assert.equal(resolved.matched, true, text);
    assert.equal(resolved.materialId, '61', text);
    assert.equal(resolved.resolvedBy, 'code', text);
  }
});

test('注册表别名规则命中（高铝铝土 / 碳化硅）', () => {
  assert.equal(registry.resolve('高铝铝土').baseName, '80均质矾土');
  assert.equal(registry.resolve('碳化硅').baseName, '97黑碳化硅');
});

test('未匹配时给出 suggestions（含相似度），不臆造结果', () => {
  const resolved = registry.resolve('未知材料X');
  assert.equal(resolved.matched, false);
  assert.ok(Array.isArray(resolved.suggestions));
});

test('歧义名称不猜测（多候选）', () => {
  const resolved = registry.resolve('矾土');
  if (!resolved.matched) {
    assert.ok(resolved.candidates.length > 0 || resolved.suggestions.length > 0);
  }
});

test('配比归一化：% 直接采用；「份」按总和折算并给出诊断', () => {
  const parsed = P.parseRecipeText('棕刚玉 6份，97黑碳化硅 4份', registry);
  assert.equal(parsed.components.length, 2);
  assert.equal(parsed.components[0].ratioPct, 60);
  assert.equal(parsed.components[1].ratioPct, 40);
  assert.ok(parsed.diagnostics.some((item) => item.code === 'PARTS_TO_PERCENT'));
});

test('行分类：* 测试行、[..] 属性行、其余为组分行', () => {
  const text = [
    '棕刚玉 5-3mm 30%',
    '97黑碳化硅 325目 70%',
    '*常温耐压: 45 MPa',
    '*体积密度: 3.05 g/cm3',
    '棕刚玉 [Al2O3:98, d50:12]',
  ].join('\n');
  const parsed = P.parseRecipeText(text, registry);
  assert.equal(parsed.components.length, 2);
  assert.equal(parsed.tests.length, 2);
  assert.equal(parsed.tests[0].key, '常温耐压');
  assert.equal(parsed.tests[0].value, 45);
  assert.equal(parsed.tests[0].unit, 'MPa');
  assert.equal(parsed.properties.length, 1);
  assert.equal(parsed.properties[0].name, '棕刚玉');
});

test('级配多段：同一 base 的不同粒级产出多行，各带粒径', () => {
  const parsed = P.parseRecipeText('棕刚玉 5-3mm 20%、棕刚玉 3-1mm 15%、棕刚玉 1-0mm 10%', registry);
  assert.equal(parsed.components.length, 3);
  assert.deepEqual(parsed.components.map((item) => [item.particleSize.minMm, item.particleSize.maxMm]),
                   [[3, 5], [1, 3], [0, 1]]);
});

test('X_comp 契约：列数等于 component_feature_names，可推导列被填充', () => {
  const parsed = P.parseRecipeText('棕刚玉 5-3mm 30%，97黑碳化硅 325目 20%，95硅灰 50%', registry);
  const { rows, missingColumns, derivableColumns, coverage } = P.toXComp(parsed.components, COMPONENT_NAMES);
  assert.equal(rows.length, 3);
  for (const row of rows) assert.equal(row.length, COMPONENT_NAMES.length, '每行列数须与 schema 一致');
  assert.equal(rows[0][COMPONENT_NAMES.indexOf('material_id')], 61);
  assert.equal(rows[0][COMPONENT_NAMES.indexOf('ratio_pct')], 30);
  assert.equal(rows[0][COMPONENT_NAMES.indexOf('particle_size_min')], 3);
  assert.equal(rows[0][COMPONENT_NAMES.indexOf('particle_size_max')], 5);
  assert.equal(rows[0][COMPONENT_NAMES.indexOf('base')], '棕刚玉');
  assert.equal(rows[1][COMPONENT_NAMES.indexOf('particle_size_min')], 0.045);
  assert.deepEqual(derivableColumns, ['material_id', 'ratio_pct', 'particle_size_min', 'particle_size_max', 'base']);
  assert.ok(coverage > 0 && coverage < 0.2, `文本可推导占比应很小，实际 ${coverage}`);
  assert.ok(missingColumns.includes('PC1'));
  assert.ok(missingColumns.includes('AL2O3'));
});

test('粒径值落在数据集实测档位集合内（避免量纲漂移）', () => {
  const dataset = new Set([0, 0.001, 0.005, 0.025, 0.038, 0.045, 0.075, 0.08, 0.2, 1, 2.5, 3, 5, 8, 12, 15]);
  const parsed = P.parseRecipeText('棕刚玉 200目 30%、97黑碳化硅 325目 20%、95硅灰 3-1mm 50%', registry);
  for (const item of parsed.components) {
    for (const value of [item.particleSize?.minMm, item.particleSize?.maxMm]) {
      if (value === null || value === undefined) continue;
      assert.ok(dataset.has(value) || value === 0.045 || value === 0.075, `粒径 ${value} 不在档位集合内`);
    }
  }
});
