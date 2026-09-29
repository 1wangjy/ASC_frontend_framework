const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('../node_modules/express');
const sqlite3 = require('../node_modules/sqlite3').verbose();

const svc = require('../src/services/materialBaseService');
const router = require('../src/routes/materialBase');

const SEED = path.join(__dirname, '..', '..', 'data', 'material_base_map.json');

/** 测试隔离：只用种子里的 bases（不带运行期新增的规则），避免线上规则泄漏进断言。 */
function basesOnlySeed(filePath) {
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const target = path.join(path.dirname(filePath), `seed-bases-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(target, JSON.stringify({ version: snapshot.version, bases: snapshot.bases, rules: [] }), 'utf8');
  return target;
}


/** 起一个只挂该路由的临时 app（端口 0），用 fetch 验证 HTTP 契约。 */
async function startApi() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-mbase-api-'));
  const db = new sqlite3.Database(path.join(dir, 'database.db'));
  svc.setDb(db);
  svc.setJsonPath(path.join(dir, 'material_base_map.json'));
  await svc.ensureMaterialBaseSchema(db);
  await svc.bootstrapFromJson({ filePath: basesOnlySeed(SEED) });

  const app = express();
  app.use(express.json());
  app.use('/api/material-base', router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const close = () => new Promise((resolve) => server.close(() => db.close(() => resolve())));
  return { call, close };
}

test('GET 列表返回 89 条种子与统计', async () => {
  const api = await startApi();
  try {
    const { status, body } = await api.call('GET', '/api/material-base');
    assert.equal(status, 200);
    assert.equal(body.data.bases.length, 89);
    assert.deepEqual(body.data.stats, { total: 89, mapped: 89, unmapped: 0 });
  } finally {
    await api.close();
  }
});

test('未解析 → 建规则 → 同名可解析（“新建 base 映射规则从而支持入库”的关键闭环）', async () => {
  const api = await startApi();
  try {
    const before = await api.call('POST', '/api/material-base/resolve', { name: '高铝铝土' });
    assert.equal(before.body.data.resolved, false);
    assert.ok(before.body.data.suggestedRules.some((r) => r.kind === 'alias'));

    const target = (await api.call('GET', '/api/material-base?keyword=80均质矾土')).body.data.bases[0];
    assert.ok(target, '应有 80均质矾土');
    const rule = await api.call('POST', '/api/material-base/rules', {
      kind: 'alias', pattern: '高铝铝土', target_base_id: target.base_id, priority: 20,
    });
    assert.equal(rule.status, 200);
    assert.equal(rule.body.data.base_name, '80均质矾土');

    const after = await api.call('POST', '/api/material-base/resolve', { name: '高铝铝土' });
    assert.equal(after.body.data.resolved, true);
    assert.equal(after.body.data.via, 'rule');
    assert.equal(after.body.data.base.material_id, target.material_id);

    // 规则禁用后回到未命中
    await api.call('PUT', `/api/material-base/rules/${rule.body.data.rule_id}`, { enabled: false });
    const disabled = await api.call('POST', '/api/material-base/resolve', { name: '高铝铝土' });
    assert.equal(disabled.body.data.resolved, false);
  } finally {
    await api.close();
  }
});

test('新增 base 并启停；缺参数与未知 kind 返回 400', async () => {
  const api = await startApi();
  try {
    const created = await api.call('POST', '/api/material-base', {
      base_name: '测试新材料X', material_id: '', aliases: ['测试别名X'], category: '支撑骨料',
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.data.created, true);
    const baseId = created.body.data.base.base_id;

    const off = await api.call('PUT', `/api/material-base/${baseId}`, { enabled: false });
    assert.equal(off.body.data.enabled, false);
    const listed = await api.call('GET', '/api/material-base?keyword=测试新材料X');
    assert.equal(listed.body.data.bases[0].enabled, false, '禁用后仍可列出但 enabled=false');

    assert.equal((await api.call('POST', '/api/material-base', {})).status, 400);
    assert.equal((await api.call('POST', '/api/material-base/rules', { kind: 'fuzzy', pattern: 'x', target_base_id: baseId })).status, 400);
    assert.equal((await api.call('POST', '/api/material-base/resolve', {})).status, 400);
  } finally {
    await api.close();
  }
});

test('导出 JSON 与表一致；import 幂等', async () => {
  const api = await startApi();
  try {
    const exported = await api.call('GET', '/api/material-base/export');
    assert.equal(exported.status, 200);
    assert.equal(exported.body.data.bases.length, 89);
    const onDisk = JSON.parse(fs.readFileSync(svc.getJsonPath(), 'utf8'));
    assert.equal(onDisk.bases.length, 89);

    const imported = await api.call('POST', '/api/material-base/import', {});
    assert.equal(imported.status, 200);
    assert.equal(imported.body.data.inserted, 0, '已存在的 base 不应重复插入');
  } finally {
    await api.close();
  }
});
