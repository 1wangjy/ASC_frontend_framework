'use strict';
// Local development acceptance only. Saves full frames; never records credentials.
const fs = require('node:fs');
const path = require('node:path');
const { serviceAnswer } = require('./serviceAnswer');
const base = 'http://127.0.0.1:3001/api/agent';
const output = path.resolve(__dirname, '../../data/agent/integration/T3-waiting-20261009');
const question = 'ASC 材料中 SiC 主要有哪些作用？请通过知识检索回答。';
const context = { projectId: 'proj_65ac6094e268', graphId: 'nexus_2bdcb8bbccb04ea5' };
const options = { maxSteps: 6, maxTools: 8, timeoutMs: 300000 };
async function json(url, body) {
  const res = await fetch(base + url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  const previous = process.argv[2];
  if (previous) {
    const session = await json('/sessions/' + previous);
    if (session.activeTurn) throw new Error('Browser acceptance is still running; do not overlap trials.');
    const assistant = session.messages.find(m => m.role === 'assistant');
    if (session.messages[0]?.content !== question || !assistant?.timing) throw new Error('Browser baseline mismatch or missing timing');
    fs.writeFileSync(path.join(output, 'sample-1-browser-session.json'), JSON.stringify(session, null, 2));
    results.push({ sample: 1, source: 'browser', sessionId: previous, timing: assistant.timing,
      completed: assistant.answer_check?.status === 'knowledge_service_answer',
      referenceCount: assistant.service_references?.length || 0,
      toolCalls: assistant.toolCalls, passthroughMatch: null,
      note: 'UI/session sample; no raw tool payload saved, exact passthrough checked in offline tests and API samples.' });
  }
  for (let n = results.length + 1; n <= 3; n += 1) {
    const session = await json('/sessions', { title: `T3同题计时 ${n}`, context });
    const started = performance.now();
    const response = await fetch(base + '/stream', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId, modelId: 'default', context, options, messages: [{ role: 'user', content: question }] }),
      signal: AbortSignal.timeout(330000) });
    if (!response.ok) throw new Error(`stream HTTP ${response.status}`);
    const raw = await response.text();
    fs.writeFileSync(path.join(output, `sample-${n}.sse`), raw);
    const frames = raw.split(/\r?\n\r?\n/).flatMap(block => {
      const line = block.split(/\r?\n/).find(s => s.startsWith('data: '));
      return line ? [JSON.parse(line.slice(6))] : [];
    });
    const final = frames.findLast(f => f.type === 'final');
    const done = frames.findLast(f => f.type === 'done');
    const outcome = frames.find(f => f.type === 'tool_result' && f.name === 'kg_search' && f.ok);
    const publication = serviceAnswer(outcome, context);
    const saved = await json('/sessions/' + session.sessionId);
    fs.writeFileSync(path.join(output, `sample-${n}-session.json`), JSON.stringify(saved, null, 2));
    results.push({ sample: n, source: 'HTTP', sessionId: session.sessionId, timing: done?.timing,
      clientRequestMs: Math.round(performance.now() - started),
      completed: final?.answer_check?.status === 'knowledge_service_answer',
      referenceCount: final?.service_references?.length || 0,
      passthroughMatch: Boolean(publication && final.text === publication.text
        && JSON.stringify(final.service_references) === JSON.stringify(publication.service_references)
        && JSON.stringify(final.citation_bindings) === JSON.stringify(publication.citation_bindings)),
      toolCalls: saved.messages.find(m => m.role === 'assistant')?.toolCalls,
      errors: frames.filter(f => f.type === 'error'), usage: done?.usage });
    fs.writeFileSync(path.join(output, 'baseline.json'), JSON.stringify({ question, context, options, modelId: 'default', results }, null, 2));
    console.log(JSON.stringify(results.at(-1)));
  }
}
async function archive(ids) {
  for (const id of ids) {
    const session = await json('/sessions/' + id);
    if (session.activeTurn) throw new Error('Only archive completed turns');
    fs.writeFileSync(path.join(output, `archive-${id}-session.json`), JSON.stringify(session, null, 2));
    const response = await fetch(base + '/stream', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: id, resumeFromEventId: 0 }) });
    if (!response.ok) throw new Error(`archive HTTP ${response.status}`);
    const raw = await response.text();
    fs.writeFileSync(path.join(output, `archive-${id}.sse`), raw);
    const frames = raw.split(/\r?\n\r?\n/).flatMap(block => {
      const line = block.split(/\r?\n/).find(s => s.startsWith('data: '));
      return line ? [JSON.parse(line.slice(6))] : [];
    });
    const final = frames.findLast(f => f.type === 'final');
    const outcome = frames.find(f => f.type === 'tool_result' && f.name === 'kg_search' && f.ok);
    const publication = serviceAnswer(outcome, context);
    const summary = { sessionId: id, timing: session.messages.at(-1)?.timing,
      stopped: session.messages.at(-1)?.stopped === true,
      passthroughMatch: publication ? Boolean(final?.text === publication.text
        && JSON.stringify(final.service_references) === JSON.stringify(publication.service_references)
        && JSON.stringify(final.citation_bindings) === JSON.stringify(publication.citation_bindings)) : null,
      usage: frames.findLast(f => f.type === 'done')?.usage };
    fs.writeFileSync(path.join(output, `archive-${id}-summary.json`), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  }
}
(process.argv[2] === '--archive' ? archive(process.argv.slice(3)) : main())
  .catch(error => { console.error(error.message); process.exitCode = 1; });
