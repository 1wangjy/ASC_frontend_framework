'use strict';

/**
 * 粒径/单位归一化测试（node --test）。
 * 期望值取自 ML 数据集实测取值集合（_ref/handover/ML/*.npy 的 particle_size_min/max）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../lib/units');

test('目数 → mm 使用标准筛表（数据集出现过的档位）', () => {
  const cases = { 200: 0.075, 325: 0.045, 400: 0.038, 180: 0.08, 100: 0.15, 60: 0.25, 10: 2.0 };
  for (const [mesh, mm] of Object.entries(cases)) {
    assert.equal(U.meshToMm(Number(mesh)).mm, mm, `${mesh} 目应为 ${mm}mm`);
  }
});

test('区间写法（含全角/波浪/到至/正反序）归一化为 min ≤ max', () => {
  const cases = [['5-3mm', 3, 5], ['3~1mm', 1, 3], ['1-0mm', 0, 1], ['8-15mm', 8, 15],
                 ['3至5mm', 3, 5], ['12-8mm', 8, 12], ['325-200目', 0.045, 0.075]];
  for (const [text, min, max] of cases) {
    const parsed = U.parseParticleSize(text);
    assert.equal(parsed.minMm, min, `${text} min`);
    assert.equal(parsed.maxMm, max, `${text} max`);
  }
});

test('上下界写法：≤X / <X / -X / X以下 → 上限，min 取 0（数据集惯例）', () => {
  for (const text of ['≤0.075mm', '<200目', '-0.075mm', '0.075mm以下', '3mm以下']) {
    const parsed = U.parseParticleSize(text);
    assert.equal(parsed.notation, 'upper', text);
    assert.equal(parsed.minMm, 0, text);
    assert.ok(parsed.maxMm > 0, text);
  }
  for (const text of ['≥1mm', '5mm以上']) {
    const parsed = U.parseParticleSize(text);
    assert.equal(parsed.notation, 'lower', text);
    assert.equal(parsed.maxMm, null, text);
    assert.ok(parsed.minMm > 0, text);
  }
});

test('单值写法：mm / μm / um / 目 / D50', () => {
  assert.deepEqual([U.parseParticleSize('0.045mm').minMm, U.parseParticleSize('0.045mm').maxMm], [0.045, 0.045]);
  assert.equal(U.parseParticleSize('325目').minMm, 0.045);
  assert.equal(U.parseParticleSize('15μm').minMm, 0.015);
  assert.equal(U.parseParticleSize('15um').minMm, 0.015);
  const d50 = U.parseParticleSize('D50=10μm');
  assert.equal(d50.notation, 'D50');
  assert.equal(d50.representativeMm, 0.01);
});

test('显式数值不被吸附扭曲；近似值才吸附到数据集档位', () => {
  assert.equal(U.parseParticleSize('15μm').minMm, 0.015);       // 0.013 是近邻但不该吸附
  assert.equal(U.parseParticleSize('0.075mm').minMm, 0.075);    // 精确档位
  assert.equal(U.parseParticleSize('0.0745mm').minMm, 0.075);   // 1% 内吸附
});

test('名称中的数字与百分比不会被误判为粒径', () => {
  assert.equal(U.parseParticleSize('90矾土'), null);
  assert.equal(U.parseParticleSize('97黑碳化硅'), null);
  assert.equal(U.parseParticleSize('CaO 0.5%'), null);
  assert.equal(U.parseParticleSize('FS20'), null);
});

test('级配多段解析', () => {
  const list = U.parseParticleSizeList('5-3mm、3-1mm、1-0mm 各10%');
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((item) => [item.minMm, item.maxMm]), [[3, 5], [1, 3], [0, 1]]);
});

test('粒度类别词识别', () => {
  assert.equal(U.classify('棕刚玉微粉'), 'micro');
  assert.equal(U.classify('97黑碳化硅细粉'), 'fine');
  assert.equal(U.classify('棕刚玉骨料'), 'aggregate');
  assert.equal(U.classify('棕刚玉'), null);
});
