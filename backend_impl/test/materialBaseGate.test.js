const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('../node_modules/sqlite3').verbose();
const express = require('../node_modules/express');

const svc = require('../src/services/materialBaseService');
const newDbService = require('../src/services/newDbService');
const newDataController = require('../src/controllers/newDataController');

const SEED = path.join(__dirname, '..', '..', 'data', 'material_base_map.json');

/** 测试隔离：只用种子里的 bases（不带运行期新增的规则），避免线上规则泄漏进断言。 */
function basesOnlySeed(filePath) {
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const target = path.join(path.dirname(filePath), `seed-bases-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(target, JSON.stringify({ version: snapshot.version, bases: snapshot.bases, rules: [] }), 'utf8');
  return target;
}


function exec(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function cb(e) { e ? reject(e) : resolve(this) }));
}

/** 起一个只挂 /api/new-data 的临时 app；mc_material/mp_properties 用最小 DDL。 */
async function startApi() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-mbase-gate-'));
  const db = new sqlite3.Database(path.join(dir, 'database.db'));
  await exec(db, `CREATE TABLE mp_properties (mp_id TEXT PRIMARY KEY, fixed_properties TEXT, custom_properties TEXT, mc_ids TEXT, create_time TIMESTAMP, update_time TIMESTAMP, is_delete INTEGER DEFAULT 0)`);
  await exec(db, `CREATE TABLE mc_material (mc_id TEXT PRIMARY KEY, batch_no TEXT, type TEXT, component_list TEXT, is_mixed INTEGER, create_time TIMESTAMP, update_time TIMESTAMP, is_delete INTEGER DEFAULT 0)`);
  await exec(db, `INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, mc_ids, create_time, update_time) VALUES ('MP_000001','[]','[]','[]','now','now')`);

  svc.setDb(db);
  svc.setJsonPath(path.join(dir, 'material_base_map.json'));
  await svc.ensureMaterialBaseSchema(db);
  await svc.bootstrapFromJson({ filePath: basesOnlySeed(SEED) });

  const prevDb = newDbService.db;
  newDbService.db = db;

  const app = express();
  app.use(express.json());
  app.post('/api/new-data/mc', newDataController.createMc);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const postMc = async (componentList) => {
    const res = await fetch(`${base}/api/new-data/mc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_no: 'No.T1', type: '支撑骨料', component_list: componentList }),
    });
    return { status: res.status, body: await res.json() };
  };
  const close = () => new Promise((resolve) => server.close(() => { newDbService.db = prevDb; db.close(() => resolve()); }));
  return { postMc, close, db };
}

test('未映射原料名被拒（400 UNRESOLVED_BASE，含 raw/建议/规则模板）', async () => {
  const api = await startApi();
  try {
    const res = await api.postMc([['高铝铝土', 'MP_000001', '{}', 100]]);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'UNRESOLVED_BASE');
    assert.equal(res.body.raw, '高铝铝土');
    assert.ok(res.body.suggestions.length >= 1, '应给出候选 base');
    assert.ok(res.body.ruleTemplate && res.body.ruleTemplate.kind, '应给出可一键新建的规则模板');
    const rows = await new Promise((resolve) => api.db.all('SELECT * FROM mc_material', (e, r) => resolve(r || [])));
    assert.equal(rows.length, 0, '拒绝时不得写库');
  } finally {
    await api.close();
  }
});

test('新建规则后同一名称可入库，且 meta 写入 base_id / material_id', async () => {
  const api = await startApi();
  try {
    const target = (await svc.listBases({ keyword: '80均质矾土' }))[0];
    await svc.addRule({ kind: 'alias', pattern: '高铝铝土', target_base_id: target.base_id, priority: 20 });

    const res = await api.postMc([['高铝铝土', 'MP_000001', '{}', 100]]);
    assert.equal(res.status, 200);
    const row = await new Promise((resolve) => api.db.get('SELECT component_list FROM mc_material LIMIT 1', (e, r) => resolve(r)));
    const tuple = JSON.parse(row.component_list)[0];
    const meta = JSON.parse(tuple[2]);
    assert.equal(meta.base_id, target.base_id);
    assert.equal(meta.material_id, target.material_id);
    assert.equal(meta.raw, '高铝铝土');
  } finally {
    await api.close();
  }
});

test('可解析名称（含归一化/拆解）入表后 meta 带 material_id', async () => {
  const api = await startApi();
  try {
    const res = await api.postMc([['325目棕刚玉', 'MP_000001', '{}', 100]]);
    assert.equal(res.status, 200);
    const row = await new Promise((resolve) => api.db.get('SELECT component_list FROM mc_material LIMIT 1', (e, r) => resolve(r)));
    const meta = JSON.parse(JSON.parse(row.component_list)[0][2]);
    assert.equal(meta.material_id, '61', '棕刚玉 → 61');
  } finally {
    await api.close();
  }
});

test('旧元组（meta 为字符串 {}）读取兼容：闸门只看名称，不因旧 meta 报错', async () => {
  const api = await startApi();
  try {
    const res = await api.postMc([['棕刚玉', 'MP_000001', '{}', 100]]);
    assert.equal(res.status, 200);
    assert.equal(svc.parseComponentMeta('{}').base_id, undefined);
    assert.equal(svc.parseComponentMeta(JSON.stringify({ base_id: 'B', material_id: '61' })).material_id, '61');
  } finally {
    await api.close();
  }
});
