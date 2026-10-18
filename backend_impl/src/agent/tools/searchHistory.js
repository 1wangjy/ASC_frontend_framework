'use strict';

const parameters = {
  type: 'object',
  properties: {
    query: { type: 'string', description: '检索当前会话当前主题的关键词；不是知识证据。', minLength: 1, maxLength: 200 },
    limit: { type: 'number', minimum: 1, maximum: 10 },
  },
  required: ['query'], additionalProperties: false,
};

function validate(args = {}) {
  if (typeof args.query !== 'string' || !args.query.trim()) throw new Error('query must not be empty');
  return { query: args.query.trim().slice(0, 200), limit: Math.min(10, Math.max(1, Math.floor(args.limit || 5))) };
}

async function execute(rawArgs, ctx = {}) {
  const { query, limit } = validate(rawArgs);
  if (!ctx.hasSession) return { ok: false, summary: '历史检索需要当前 sessionId。', data: null };
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const history = Array.isArray(ctx.history) ? ctx.history.slice(-200) : [];
  const matches = history.map((m, index) => ({ m, index })).filter(({ m }) => m
    && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string'
    && terms.every((term) => m.content.toLowerCase().includes(term)));
  const results = matches.slice(-limit).reverse().map(({ m, index }) => ({
    messageIndex: index, role: m.role, content: m.content.slice(0, 1000),
    evidenceStatus: m.role === 'assistant' ? 'historical_answer_unverified' : 'user_statement',
  }));
  return { ok: true, summary: `当前主题历史命中 ${matches.length} 条，返回 ${results.length} 条。`,
    data: { scope: 'current_session_active_topic', untrusted: true, usableAsEvidence: false, results } };
}

module.exports = { name: 'search_history', description: '检索当前会话当前主题的已保存历史。历史回答不属于已核验知识证据；不能检索其他会话。', parameters, validate, execute };
