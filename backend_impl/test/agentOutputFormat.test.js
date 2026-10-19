'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { wantsJSONOnly, jsonOnlyText, nameLimit, surfaceIssue, historyReadIssue } = require('../src/agent/outputFormat');
const { runAgent } = require('../src/agent/loop');
const registry = require('../src/agent/tools');

test('historical read reconciliation requires a successful server event and an explicit recall request', () => {
  const history = [{ tools: [{ name: 'read_evidence', ok: true }] }];
  const request = '刚才拿到的是片段还是全文？只说明范围，不调用工具。';
  assert.match(historyReadIssue('没有成功执行一次对真实片段的read_evidence。', request, history), /ok=true/);
  assert.match(historyReadIssue('没有返回成文答案/可用片段。', request, history), /片段/);
  assert.equal(historyReadIssue('读取成功但片段真实性和支持度未核验，不是全文。', request, history), null);
  assert.equal(historyReadIssue('没有拿到片段。', request, []), null);
  assert.equal(historyReadIssue('没有拿到片段。', request, [{ tools: [{ name: 'read_evidence', ok: false }] }]), null);
  assert.equal(historyReadIssue('没有拿到片段。', '说明这个材料的作用', history), null);
});

test('loop repairs a historical execution contradiction once without calling tools', async () => {
  const events = []; let requests = 0;
  const history = [{ tools: [{ name: 'read_evidence', ok: true }] }];
  await runAgent({ messages: [{ role: 'user', content: '刚才拿到的是片段还是全文？不调用工具。' }],
    context: { executionHistory: history },
    provider: { available: true, streamChat: async params => {
      requests++;
      if (requests === 2) assert.equal(params.tools.length, 0);
      return { content: requests === 1 ? '没有拿到片段。' : '当时成功读取了API片段，并非全文，内容尚未核验。', finish_reason: 'stop' };
    } }, emit: e => events.push(e) });
  assert.equal(requests, 2);
  assert.equal(events.some(e => e.type === 'tool_call'), false);
  assert.match(events.find(e => e.type === 'final').text, /成功读取/);
});

test('only latest explicit JSON request opts in', () => {
  for (const text of ['只输出JSON，字段为代号', '请仅返回 JSON', '只用JSON', '只输出严格JSON', '用JSON列出代号、SiC含量、温度、气氛和保温时间，不调用工具。', '仍输出相同三个 JSON 字段，不调用工具。']) {
    assert.equal(wantsJSONOnly([{ role: 'user', content: text }]), true);
  }
  assert.equal(wantsJSONOnly([{ role: 'user', content: '只输出JSON' }, { role: 'user', content: '解释一下JSON是什么' }]), false);
  assert.equal(wantsJSONOnly([{ role: 'assistant', content: '只输出JSON' }]), false);
  assert.equal(wantsJSONOnly([{ role: 'user', content: '不要用JSON列出，直接解释' }]), false);
});

test('short naming counts every Unicode character and rejects alternatives or prose', () => {
  const request = '给这个试验计划起一个不超过 12 个字的中文名称，不调用工具。';
  assert.equal(nameLimit(request), 12);
  assert.equal(nameLimit('不超过12字解释原理'), null);
  assert.equal(surfaceIssue('氮气热处理试验', request), null);
  assert.ok(surfaceIssue('X-17 氮气 1450℃ 保温试验', request));
  assert.ok(surfaceIssue('氮气试验\n高温试验', request));
  assert.equal(surfaceIssue('收到', '只确认收到'), null);
  assert.ok(surfaceIssue('当前试', '温度改为1500℃。请输出当前方案，不调用工具。'));
  assert.equal(surfaceIssue('1400℃氮气，保温1小时', '请概括当前方案'), null);
});

test('protocol explanation placeholder can be retried but fabricated real-looking citations cannot', () => {
  assert.ok(surfaceIssue('格式为[ev_…]，不可沿用历史', '说明证据ID的范围限制'));
  assert.equal(surfaceIssue('引用[ev_aaaaaaaaaaaaaaaaaaaaaaaa]', '说明证据ID的范围限制'), null);
});

test('one bounded model repair completes fragments or short names without tools or leaked draft', async () => {
  for (const [request, bad, good] of [
    ['请输出当前方案，不调用工具。', '当前试', 'SiC/ASC，1500℃氮气，保温1小时。'],
    ['给试验起一个不超过12个字的中文名称', '下面是几个可供选择的高温氮气试验名称', '氮气保温试验'],
  ]) {
    const events = [];let count = 0;
    await runAgent({ messages: [{ role: 'user', content: request }], options: {maxSteps:3},
      emit: e => events.push(e), provider: {available:true, async streamChat(p) {
        if (++count === 2) assert.deepEqual(p.tools, []);
        const content = count === 1 ? bad : good;p.onDelta(content);return {content,finish_reason:'stop'};
      }} });
    assert.equal(count, 2);
    assert.equal(events.find(e => e.type === 'final').text, good);
    assert.deepEqual(events.filter(e => e.type === 'message_delta').map(e => e.text), [good]);
  }
});

test('persistent surface failure is explicit and cannot loop or exceed step budget', async () => {
  for (const maxSteps of [1,4]) {
    let count = 0; const events=[];
    await runAgent({messages:[{role:'user',content:'请输出当前方案，不调用工具'}],options:{maxSteps},
      emit:e=>events.push(e),provider:{available:true,async streamChat(){count++;return {content:'当前试',finish_reason:'stop'};}}});
    assert.equal(count,Math.min(2,maxSteps));assert.equal(events.some(e=>e.type==='final'),false);
    assert.ok(events.some(e=>e.type==='error'));
  }
});

test('JSON normalization preserves values, escapes, arrays and null without guessing', () => {
  const original = '{"代号":"LONG-X73","x":null,"n":13,"quote":"a\\\"b"}';
  for (const text of [original, '说明\n```json\n' + original + '\n```\n注：用户记录不是证据']) {
    assert.deepEqual(JSON.parse(jsonOnlyText(text)), JSON.parse(original));
  }
  assert.equal(jsonOnlyText('[1,null,"a"]'), '[1,null,"a"]');
  for (const text of ['没有数据', '```json\n{"x":}\n```', '```json\n{}\n```\n```json\n[]\n```', '说明 {"x":1}']) {
    assert.throws(() => jsonOnlyText(text), /JSON/);
  }
});

async function run(content, request = '只输出JSON，不要说明。') {
  const events = [];
  const provider = { available: true, streamChat: async params => {
    assert.equal(params.messages.some(m => m.role === 'system' && m.content.includes('可直接JSON.parse')), request.includes('只输出'));
    params.onDelta(content);
    return { content, finish_reason: 'stop' };
  } };
  await runAgent({ messages: [{ role: 'user', content: request }], provider, emit: e => events.push(e) });
  return events;
}

test('real loop publishes parseable final and delta, never wrapper prose', async () => {
  const events = await run('```json\n{"代号":"X","unknown":null}\n```\n说明：仅为历史数据');
  const final = events.find(e => e.type === 'final');
  assert.deepEqual(JSON.parse(final.text), { 代号: 'X', unknown: null });
  assert.equal(events.find(e => e.type === 'message_delta').text, final.text);
});

test('invalid JSON emits error without publishing invented JSON; ordinary text unchanged', async () => {
  const bad = await run('说明：没有信息');
  assert.equal(bad.some(e => e.type === 'final' || e.type === 'message_delta'), false);
  assert.match(bad.find(e => e.type === 'error').message, /JSON/);
  const ordinary = await run('普通回答', '解释一下');
  assert.equal(ordinary.find(e => e.type === 'final').text, '普通回答');
});

test('JSON formatting cannot bypass citation validation', async () => {
  const events = await run('{"引用":"[ev_aaaaaaaaaaaaaaaaaaaaaaaa]"}');
  assert.equal(events.some(e => e.type === 'final'), false);
  assert.match(events.find(e => e.type === 'error').message, /JSON/);
});

test('explicit JSON request does not rewrite retained knowledge-service answers', async t => {
  const original = '服务原答案，不是JSON。';
  t.mock.method(registry, 'runTool', async () => ({ ok: true, data: {
    service_answer: { text: original, scope: { project_id: 'p', graph_id: 'g' }, references: [] }
  } }));
  let step = 0; const events = [];
  await runAgent({ messages: [{ role: 'user', content: '检索并只输出JSON' }],
    context: { answerMode: 'knowledge_service', projectId: 'p', graphId: 'g' },
    provider: { available: true, streamChat: async () => ++step === 1
      ? { tool_calls: [{ id: 'one', function: { name: 'kg_search', arguments: '{}' } }] }
      : { content: '{"x":1}' } }, emit: e => events.push(e) });
  assert.equal(events.find(e => e.type === 'final').text, original);
});
