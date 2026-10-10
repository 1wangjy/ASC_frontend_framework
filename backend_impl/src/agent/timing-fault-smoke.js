'use strict';
// Real HTTP timeout check with an intentionally tiny local turn budget.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:3001/api/agent';
const output = path.resolve(__dirname, '../../data/agent/integration/T3-waiting-20261009');
async function main() {
  const session = await (await fetch(base + '/sessions', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'T3主动短超时验收' }) })).json();
  const response = await fetch(base + '/stream', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: session.sessionId, options: { timeoutMs: 50 },
      messages: [{ role: 'user', content: 'ASC 材料中 SiC 主要有哪些作用？请通过知识检索回答。' }] }) });
  const raw = await response.text();
  fs.writeFileSync(path.join(output, 'real-short-timeout.sse'), raw);
  const saved = await (await fetch(base + '/sessions/' + session.sessionId)).json();
  fs.writeFileSync(path.join(output, 'real-short-timeout-session.json'), JSON.stringify(saved, null, 2));
  const assistant = saved.messages.find(m => m.role === 'assistant');
  assert.equal(assistant.error.code, 'turn_timeout');
  assert.equal(assistant.timing.schema, 'agent.timing.v1');
  assert.ok(assistant.timing.modelMs > 0);
  assert.equal(assistant.content, '');
  console.log(JSON.stringify({ sessionId: session.sessionId, error: assistant.error.code, timing: assistant.timing,
    note: '故意设置50ms回合预算，验证本端超时收尾；不是知识服务超时率测试。' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
