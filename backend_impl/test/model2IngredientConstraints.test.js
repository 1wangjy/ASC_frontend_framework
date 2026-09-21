'use strict';

/**
 * 配方优化的"逐成分约束"是新增请求字段（ingredient_constraints），控制器里有一层白名单
 * 重建 payload —— 这里锁定契约：合法规则原样透传给 service，非法项被丢弃而不是导致 500。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const model2OptimizationService = require('../src/services/model2OptimizationService');
const model2Controller = require('../src/controllers/model2Controller');

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

async function captureOptimize(body) {
  const captured = [];
  const original = model2OptimizationService.optimizeRecipe;
  model2OptimizationService.optimizeRecipe = async (payload) => {
    captured.push(payload);
    return { ok: true, algorithm: payload.algorithm, iterations: 1 };
  };
  try {
    const res = fakeRes();
    await model2Controller.optimizeRecipe({ body }, res);
    assert.equal(res.statusCode, 200);
    return captured[0];
  } finally {
    model2OptimizationService.optimizeRecipe = original;
  }
}

test('valid ingredient constraints are forwarded to the optimizer service', async () => {
  const payload = await captureOptimize({
    algorithm: 'nsga2',
    budget: 40,
    targets: [{ name: '耐压强度[110℃]', direction: 'maximize', lower: 50 }],
    ingredient_constraints: [
      { name: '90矾土', mode: 'range', min: 10, max: 25 },
      { name: 'FDN', mode: 'fixed', value: 0.8 },
      { name: '97黑碳化硅', mode: 'disabled' },
    ],
  });

  assert.deepEqual(payload.ingredient_constraints, [
    { name: '90矾土', mode: 'range', min: 10, max: 25 },
    { name: 'FDN', mode: 'fixed', value: 0.8 },
    { name: '97黑碳化硅', mode: 'disabled' },
  ]);
  assert.equal(payload.algorithm, 'nsga2');
  assert.equal(payload.budget, 40);
});

test('malformed constraint entries are dropped instead of failing the request', async () => {
  const payload = await captureOptimize({
    ingredient_constraints: [
      { name: '', mode: 'range', min: 1, max: 2 },
      { name: '90矾土', mode: 'unknown' },
      { name: '90矾土', mode: 'range', min: 'abc', max: 20 },
      null,
      'nonsense',
    ],
  });

  assert.deepEqual(payload.ingredient_constraints, [{ name: '90矾土', mode: 'range', max: 20 }]);
});

test('no ingredient_constraints field means nothing is added to the payload', async () => {
  const payload = await captureOptimize({ algorithm: 'random', budget: 10 });
  assert.equal('ingredient_constraints' in payload, false);
});

test('an empty or non-array field is ignored', async () => {
  const payload = await captureOptimize({ ingredient_constraints: [] });
  assert.equal('ingredient_constraints' in payload, false);
  const payload2 = await captureOptimize({ ingredient_constraints: 'nope' });
  assert.equal('ingredient_constraints' in payload2, false);
});
