const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('../node_modules/sqlite3').verbose();

const svc = require('../src/services/materialBaseService');
const vocab = require('../src/services/vocabService');

function tempRegistry() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-mbase-vocab-'));
  const db = new sqlite3.Database(path.join(dir, 'database.db'));
  svc.setDb(db);
  svc.setJsonPath(path.join(dir, 'material_base_map.json'));
  return db;
}

test('刷新词表：yangquan=26、processed=89（与实测一致），并落 material_vocab', async () => {
  const db = tempRegistry();
  try {
    const result = await vocab.refreshVocab({ variants: ['yangquan', 'processed'] });
    assert.deepEqual(result.variants.sort(), ['processed', 'yangquan']);

    const sizes = Object.fromEntries((await vocab.listVocab()).map((v) => [v.variant, v.size]));
    assert.equal(sizes.yangquan, 26, 'yangquan 词表应为 26（实测）');
    assert.equal(sizes.processed, 89, 'processed 词表应为 89（实测）');

    const yq = await vocab.vocabIds('yangquan');
    assert.ok(yq.includes('61'), 'yangquan 应认识棕刚玉(61)');
    assert.ok(!yq.includes('0'), 'yangquan 不应认识 0 号原料');
  } finally {
    db.close();
  }
});

test('覆盖报告：unknown 即 one-hot 全 0 的原料，并给出更优变体建议', async () => {
  const db = tempRegistry();
  try {
    await vocab.refreshVocab({ variants: ['yangquan', 'processed'] });

    const onlyYq = await vocab.coverageFor('yangquan', ['61', '17']);
    assert.deepEqual(onlyYq.unknown, []);
    assert.equal(onlyYq.hitRate, 1);

    const unknownId = '0'; // 只在 processed/base/fill 词表里
    const withUnknown = await vocab.coverageReport({ variant: 'yangquan', materialIds: ['61', unknownId] });
    assert.deepEqual(withUnknown.coverage.known, ['61']);
    assert.deepEqual(withUnknown.coverage.unknown, [unknownId]);
    assert.equal(withUnknown.coverage.hitRate, 0.5);
    assert.equal(withUnknown.recommendedVariant, 'processed', 'processed 覆盖更好时应给建议');
    assert.ok(withUnknown.perVariant.length >= 2);
  } finally {
    db.close();
  }
});

test('未刷新词表时报告标记 vocabMissing，不伪造覆盖', async () => {
  const db = tempRegistry();
  try {
    const report = await vocab.coverageReport({ variant: 'yangquan', materialIds: ['61'] });
    assert.equal(report.vocabMissing, true);
    assert.equal(report.coverage, null);
    assert.equal(report.recommendedVariant, null);
  } finally {
    db.close();
  }
});

test('词表刷新是覆盖式：同一变体重复刷新不累积重复行', async () => {
  const db = tempRegistry();
  try {
    await vocab.refreshVocab({ variants: ['yangquan'] });
    const first = (await vocab.listVocab())[0].size;
    await vocab.refreshVocab({ variants: ['yangquan'] });
    const second = (await vocab.listVocab())[0].size;
    assert.equal(second, first);
    assert.equal(second, 26);
  } finally {
    db.close();
  }
});
