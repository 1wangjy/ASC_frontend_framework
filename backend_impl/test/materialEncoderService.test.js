'use strict';

/**
 * 材料编码服务：规则解析必须确定、可复现，模型兜底不能把不存在的原料写进配方。
 * fetch 与 provider 都用桩替换，因此这里不触网。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const encoder = require('../src/services/materialEncoderService');

const MATERIALS = [
  { material_id: '61', name: '90矾土' },
  { material_id: '42', name: '一级白刚玉' },
  { material_id: '17', name: '97黑碳化硅' },
  { material_id: '84', name: 'FDN' },
];

function stubFetch() {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ materials: MATERIALS }),
  });
}

function stubFetchWith(materials) {
  return async () => ({ ok: true, status: 200, json: async () => ({ materials }) });
}

function reset() {
  encoder.clearMaterialsCache();
}

test('name + percentage pairs are resolved to material codes', async () => {
  reset();
  const result = await encoder.encodeRecipe('90矾土 12%、FDN 0.8%', { useLlm: false, fetchImpl: stubFetch() });
  assert.equal(result.method, 'rule');
  assert.deepEqual(
    result.items.map((item) => [item.name, item.materialId, item.ratioPct]),
    [['90矾土', '61', 12], ['FDN', '84', 0.8]],
  );
});

test('percentages written before the material name are accepted too', async () => {
  reset();
  const result = await encoder.encodeRecipe('12% 的 90矾土，8% 97黑碳化硅', { useLlm: false, fetchImpl: stubFetch() });
  const byName = Object.fromEntries(result.items.map((item) => [item.name, item.ratioPct]));
  assert.equal(byName['90矾土'], 12);
  assert.equal(byName['97黑碳化硅'], 8);
});

test('full-width digits and separators are normalised', async () => {
  reset();
  const result = await encoder.encodeRecipe('９０矾土　12％', { useLlm: false, fetchImpl: stubFetch() });
  assert.deepEqual(
    result.items.map((item) => [item.name, item.ratioPct]),
    [['90矾土', 12]],
  );
});

test('an explicit code is accepted as an escape hatch', async () => {
  reset();
  const result = await encoder.encodeRecipe('代号 42 占 20%', { useLlm: false, fetchImpl: stubFetch() });
  assert.deepEqual(
    result.items.map((item) => [item.name, item.materialId]),
    [['一级白刚玉', '42']],
  );
});

test('unknown text stays unmatched instead of inventing a material', async () => {
  reset();
  const result = await encoder.encodeRecipe('某种没听过的骨料 30%', { useLlm: false, fetchImpl: stubFetch() });
  assert.deepEqual(result.items, []);
  assert.match(result.unmatched, /某种没听过的骨料/);
});

test('llm fallback may only return materials that exist', async () => {
  reset();
  const provider = {
    available: true,
    chat: async () => ({
      content: JSON.stringify({
        items: [
          { name: '一级白刚玉', ratio_pct: 15 },
          { name: '不存在的神奇骨料', ratio_pct: 5 },
        ],
        reasoning: '原文提到白刚玉与一种未登记骨料。',
      }),
    }),
  };
  const result = await encoder.encodeRecipe('白刚玉那种细粉 15%，另加奇怪骨料', {
    provider,
    fetchImpl: stubFetch(),
  });
  assert.deepEqual(result.items.map((item) => item.name), ['一级白刚玉']);
  assert.equal(result.items[0].source, 'llm');
  assert.match(result.reasoning, /白刚玉/);
});

test('the model is skipped (and said so) when no provider is configured', async () => {
  reset();
  const result = await encoder.encodeRecipe('奇怪骨料 5%', {
    provider: { available: false },
    fetchImpl: stubFetch(),
  });
  assert.match(result.reasoning, /模型未配置/);
  assert.deepEqual(result.items, []);
});

test('empty input is rejected', async () => {
  reset();
  await assert.rejects(() => encoder.encodeRecipe('   ', { fetchImpl: stubFetch() }), /请输入/);
});

test('a shorthand name resolves to the only catalogue entry containing it', async () => {
  reset();
  const result = await encoder.encodeRecipe('90矾土 12%', {
    useLlm: false,
    fetchImpl: stubFetchWith([{ material_id: '46', name: '倒焰90矾土' }, { material_id: '17', name: '97黑碳化硅' }]),
  });
  assert.equal(result.method, 'rule');
  assert.deepEqual(
    result.items.map((item) => [item.name, item.materialId, item.ratioPct]),
    [['倒焰90矾土', '46', 12]],
  );
});

test('an ambiguous shorthand stays unresolved rather than guessing', async () => {
  reset();
  const result = await encoder.encodeRecipe('硅灰 5%', {
    useLlm: false,
    fetchImpl: stubFetchWith([{ material_id: '20', name: '92硅灰' }, { material_id: '21', name: '95硅灰' }]),
  });
  assert.deepEqual(result.items, []);
  assert.match(result.unmatched, /硅灰/);
});

test('a shorthand keeps its digits when picking the catalogue entry', async () => {
  reset();
  const result = await encoder.encodeRecipe('90矾土 12%', {
    useLlm: false,
    fetchImpl: stubFetchWith([
      { material_id: '46', name: '倒焰90矾土' },
      { material_id: '45', name: '80均质矾土' },
      { material_id: '17', name: '97黑碳化硅' },
    ]),
  });
  assert.equal(result.method, 'rule');
  assert.deepEqual(
    result.items.map((item) => [item.name, item.materialId, item.ratioPct]),
    [['倒焰90矾土', '46', 12]],
  );
});

test('the method reports the model was consulted even when it matched nothing', async () => {
  reset();
  const provider = { available: true, chat: async () => ({ content: '{"items":[],"reasoning":"减水剂不在允许清单中。"}' }) };
  const result = await encoder.encodeRecipe('再加一点减水剂 0.5%', { provider, fetchImpl: stubFetch() });
  assert.equal(result.method, 'llm');
  assert.deepEqual(result.items, []);
  assert.match(result.reasoning, /减水剂/);
});
