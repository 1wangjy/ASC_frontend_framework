'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createRouter } = require('../src/agent/route');
const profiles = require('../src/agent/models');

test('server model catalog selects actual providers, protects credentials, and persists per-turn model', async (t) => {
  const parent = path.resolve(__dirname, '../data/agent/test-runs');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'models-'));
  const keys = ['AGENT_MODELS_FILE', 'AGENT_SESSION_DIR', 'AGENT_LLM_AUTH_MODE', 'AGENT_LLM_API_KEY', 'LOCAL_TEST_KEY'];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.AGENT_SESSION_DIR = dir;
  process.env.AGENT_LLM_AUTH_MODE = 'bearer';
  process.env.AGENT_LLM_API_KEY = 'cloud-sentinel';
  process.env.LOCAL_TEST_KEY = 'local-sentinel';
  const observed = [];
  const service = express(); service.use(express.json());
  service.post('/v1/chat/completions', (req, res) => {
    observed.push({ model: req.body.model, auth: req.headers.authorization });
    res.type('text/event-stream').end('data: ' + JSON.stringify({ choices: [{ delta: { content: '测试回答' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  });
  const listen = (app) => new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const server = await listen(service);
  const url = `http://127.0.0.1:${server.address().port}`;
  const file = path.join(dir, 'profiles.json');
  const models = [{ id: 'local-a', label: '本地 A', kind: 'local', model: 'ft-a', apiUrl: url, authMode: 'none' },
    { id: 'local-b', label: '本地 B', kind: 'local', model: 'ft-b', apiUrl: url, authMode: 'bearer', keyEnv: 'LOCAL_TEST_KEY' },
    { id: 'pending', label: '待部署', kind: 'local', model: 'ft-pending', apiUrl: '', authMode: 'none', enabled: false }];
  fs.writeFileSync(file, JSON.stringify({ models }));
  process.env.AGENT_MODELS_FILE = file;
  const app = express(); app.use(express.json()); app.use('/api/agent', createRouter());
  const agent = await listen(app);
  t.after(async () => {
    for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; }
    for (const s of [agent, server]) { s.closeAllConnections(); await new Promise((resolve) => s.close(resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${agent.address().port}/api/agent`;
  const post = (endpoint, body) => fetch(base + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const catalog = await (await fetch(base + '/models')).json();
  assert.equal(catalog.models.find((m) => m.id === 'pending').configured, false);
  for (const secret of ['cloud-sentinel', 'local-sentinel', url, 'LOCAL_TEST_KEY']) assert.ok(!JSON.stringify(catalog).includes(secret));
  const { sessionId } = await (await post('/sessions', {})).json();
  for (const modelId of ['local-a', 'local-b']) {
    const response = await post('/stream', { modelId, sessionId, messages: [{ role: 'user', content: '测试' }] });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes('model_selected'));
    assert.ok(text.includes(modelId));
    assert.ok(text.includes('"type":"done"'));
  }
  assert.deepEqual(observed, [{ model: 'ft-a', auth: undefined }, { model: 'ft-b', auth: 'Bearer local-sentinel' }]);
  const detail = await (await fetch(base + '/sessions/' + sessionId)).json();
  assert.deepEqual(detail.messages.filter((m) => m.role === 'assistant').map((m) => m.model),
    [{ id: 'local-a', name: 'ft-a' }, { id: 'local-b', name: 'ft-b' }]);
  for (const extra of [{ modelId: 'unknown' }, { modelId: 'pending' }, { modelId: 42 },
    { modelId: 'local-a', apiUrl: 'https://attacker.invalid' }, { apiKey: 'do-not-echo' }]) {
    const response = await post('/stream', { messages: [{ role: 'user', content: '测试' }], ...extra });
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes('do-not-echo'));
  }
  assert.equal(observed.length, 2, 'invalid selections must not contact a model service');
  assert.throws(() => profiles.resolve(''), /invalid_model_id/);
  fs.writeFileSync(file, '{bad json');
  assert.equal((await fetch(base + '/models')).status, 503);
});
