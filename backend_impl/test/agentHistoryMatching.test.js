'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const historyTool = require('../src/agent/tools/searchHistory');
const { prepareConversation } = require('../src/agent/conversation');
const user = content => ({ role: 'user', content });
const sample = user('补充虚构历史记录：试样代号 LONG-X73，SiC为13 wt%，1450℃氮气，保温2小时。');
const search = (query, history = [sample], extra = {}) => historyTool.execute({ query, limit: 10 }, { hasSession: true, history, ...extra });

test('original failed query finds the unchanged sample record with all three fields', async () => {
  const result = await search('试样代号 SiC含量 保温时间');
  assert.equal(result.ok, true);
  assert.equal(result.data.results.length, 1);
  assert.equal(result.data.results[0].content, sample.content);
  assert.equal(result.data.results[0].evidenceStatus, 'user_statement');
  assert.equal(result.data.usableAsEvidence, false);
});

test('field aliases accept punctuation and conjunctions without requiring exact field labels', async () => {
  for (const query of ['样品编号、SiC含量、保温时长', '试样代号与SiC的含量及保温时间', '试样编号 / SiC质量分数 / 保温时长']) {
    assert.equal((await search(query)).data.results.length, 1, query);
  }
});

test('matching normalizes letter case, fullwidth digits, subscripts and identifier hyphens', async () => {
  const record = user('样品编号 Q-2，Al₂O₃为７０ wt%，保温 30 min，温度为1200℃。');
  assert.equal((await search('Q–2 AL2O3含量 保温时长', [record])).data.results.length, 1);
  assert.equal((await search('实验温度', [record])).data.results.length, 1);
});

test('component aliases work beyond SiC and do not match a different component or a substring', async () => {
  const record = user('试样编号 M-3，MgO为8 wt%，保温 1 h。');
  assert.equal((await search('样品代号 MgO含量 保温时间', [record])).data.results.length, 1);
  assert.equal((await search('SiC含量', [record])).data.results.length, 0);
  assert.equal((await search('C含量')).data.results.length, 0);
  assert.equal((await search('C含量', [user('SiC含量为13 wt%')])).data.results.length, 0);
  assert.equal((await search('SiC含量', [user('讨论SiC的作用，MgO为8 wt%')])).data.results.length, 0);
});

test('all terms must match one message and explicit numeric restrictions remain exact', async () => {
  assert.equal((await search('试样代号 SiC含量 不存在的实体')).data.results.length, 0);
  assert.equal((await search('SiC 20 wt%')).data.results.length, 0);
  assert.equal((await search('SiC 3 wt%')).data.results.length, 0);
  assert.equal((await search('试样代号 SiC含量 保温时间', [user('试样代号A，SiC为13 wt%'), user('保温2小时')])).data.results.length, 0);
  assert.equal((await search('、 / ；')).data.results.length, 0);
});

test('aliases retain recency, limits and unverified labels for assistant records', async () => {
  const messages = [sample, { role: 'assistant', content: '试样编号 B，SiC为14 wt%，保温3小时。' }];
  const result = await historyTool.execute({ query: 'SiC含量 保温时长', limit: 1 }, { hasSession: true, history: messages });
  assert.equal(result.data.results.length, 1);
  assert.equal(result.data.results[0].content, messages[1].content);
  assert.equal(result.data.results[0].evidenceStatus, 'historical_answer_unverified');
});

test('field matching does not restore reset topics or allow another-session history', async () => {
  const record = { messages: [sample, { role: 'assistant', content: '收到' }] };
  const reset = prepareConversation(record, [user('换个话题，讨论MgO')]);
  assert.deepEqual((await historyTool.execute({ query: '试样代号 SiC含量 保温时间' }, reset.context)).data.results, []);
  assert.equal((await search('FOREIGN-B-92')).data.results.length, 0);
  assert.equal((await search('SiC含量', [sample], { hasSession: false })).ok, false);
});
