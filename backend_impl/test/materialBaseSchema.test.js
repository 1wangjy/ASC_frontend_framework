const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

const svc = require('../src/services/materialBaseService');

function withTempStore(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = new sqlite3.Database(path.join(dir, 'database.db'));
  const json = path.join(dir, 'material_base_map.json');
  svc.setDb(db);
  svc.setJsonPath(json);
  return { dir, db, json };
}

function closeStore({ db }) {
  return new Promise((resolve) => db.close(() => resolve()));
}

test('建表幂等；base 与规则可写入并回读', async () => {
  const store = withTempStore('asc-mbase-schema-');
  try {
    await svc.ensureMaterialBaseSchema(store.db);
    await svc.ensureMaterialBaseSchema(store.db); // 二次调用不应报错

    const { base, created } = await svc.upsertBase({ base_name: '棕刚玉', material_id: '61', aliases: ['一级白刚玉'] });
    assert.equal(created, true);
    assert.match(base.base_id, /^BASE_\d{6}$/);
    assert.equal(base.material_id, '61');
    assert.deepEqual(base.aliases, ['一级白刚玉']);

    const rule = await svc.addRule({ kind: 'alias', pattern: '白刚玉一级', target_base_id: base.base_id, priority: 10 });
    assert.match(rule.rule_id, /^MBR_\d{6}$/);
    assert.equal(rule.base_name, '棕刚玉');
    assert.equal(rule.priority, 10);

    const stats = await svc.stats();
    assert.deepEqual(stats, { total: 1, mapped: 1, unmapped: 0 });
  } finally {
    await closeStore(store);
  }
});

test('同名 base 二次 upsert 不重复建行，只合并别名/material_id', async () => {
  const store = withTempStore('asc-mbase-upsert-');
  try {
    await svc.ensureMaterialBaseSchema(store.db);
    const first = await svc.upsertBase({ base_name: '97黑碳化硅', material_id: '17' });
    const second = await svc.upsertBase({ base_name: '97黑碳化硅', aliases: ['黑碳化硅97'] });
    assert.equal(second.created, false);
    assert.equal(second.base.base_id, first.base.base_id);
    assert.deepEqual(second.base.aliases, ['黑碳化硅97']);
    assert.equal(second.base.material_id, '17', '未传 material_id 时应保留原值');
    assert.equal((await svc.listBases({})).length, 1);
  } finally {
    await closeStore(store);
  }
});

test('导出 JSON 落盘且与表一致；bootstrap 从 JSON 灌入幂等', async () => {
  const store = withTempStore('asc-mbase-json-');
  try {
    await svc.ensureMaterialBaseSchema(store.db);
    await svc.upsertBase({ base_name: '棕刚玉', material_id: '61' });
    await svc.upsertBase({ base_name: '80均质矾土', material_id: '9' });

    const snap = await svc.exportJson();
    assert.ok(snap.version >= 1 && snap.updated_at);
    assert.equal(snap.bases.length, 2);
    const onDisk = JSON.parse(fs.readFileSync(store.json, 'utf8'));
    assert.deepEqual(onDisk.bases.map((b) => b.base_name), snap.bases.map((b) => b.base_name));

    // 清空表后从 JSON 引导：应恢复同样内容
    await new Promise((resolve, reject) => store.db.run('DELETE FROM material_base', (e) => (e ? reject(e) : resolve())));
    assert.equal((await svc.listBases({})).length, 0);
    const boot = await svc.bootstrapFromJson();
    assert.equal(boot.inserted, 2);
    assert.equal((await svc.listBases({})).length, 2);
    const again = await svc.bootstrapFromJson();
    assert.equal(again.inserted, 0, '再次引导不应重复插入');
  } finally {
    await closeStore(store);
  }
});

test('规则校验：未知 kind / 未知 target 被拒绝', async () => {
  const store = withTempStore('asc-mbase-rule-');
  try {
    await svc.ensureMaterialBaseSchema(store.db);
    await assert.rejects(() => svc.addRule({ kind: 'fuzzy', pattern: 'x', target_base_id: 'BASE_000001' }), /rule kind/i);
    await assert.rejects(() => svc.addRule({ kind: 'alias', pattern: 'x', target_base_id: 'BASE_999999' }), /target_base_id/);
  } finally {
    await closeStore(store);
  }
});

test('种子快照（data/material_base_map.json）含 89 条且 material_id 唯一', async () => {
  const seeded = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'material_base_map.json'), 'utf8'));
  assert.equal(seeded.bases.length, 89, '注册表种子应为 89 条（datasetv2 全集）');
  const ids = seeded.bases.map((b) => b.material_id);
  assert.equal(new Set(ids).size, ids.length, 'material_id 必须唯一');
  assert.ok(seeded.bases.every((b) => b.base_name && b.base_id), '每条都要有 base_name 与 base_id');
});
