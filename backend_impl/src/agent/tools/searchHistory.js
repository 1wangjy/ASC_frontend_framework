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

// Bounded lexical aliases for field names, not a semantic model or an OR search.
// Every query term must still match the same saved message, and the returned
// text is always the original user/assistant record.
const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[‐‑‒–—−]/g, '-');
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FIELD_ALIASES = [
  {
    names: ['试样代号', '试样编号', '样品代号', '样品编号', '样本代号', '样本编号'],
    pattern: /(?:试样|样品|样本)(?:代号|编号)/,
  },
  {
    names: ['保温时间', '保温时长'],
    pattern: /保温(?:时间|时长)|保温(?:为|是|设为|设定为|改为|改成|调整为|[:=])?(?:\d+(?:\.\d+)?|[一二三四五六七八九十半]+)(?:小时|分钟|h\b|min\b|时|分)/,
  },
  {
    names: ['含量', '质量分数', '占比', '比例'],
    pattern: /含量|质量分数|占比|比例|\d+(?:\.\d+)?(?:wt%|mass%|%)/,
  },
  {
    names: ['温度', '试验温度', '实验温度', '烧成温度', '热处理温度'],
    pattern: /温度|摄氏|°c/,
  },
  {
    names: ['气氛', '试验气氛', '实验气氛'],
    pattern: /气氛|空气|氮气|氩气|氧气|真空|惰性气体/,
  },
];

function matchesTerm(text, term) {
  const compact = text.replace(/\s+/g, '');
  // Preserve the requested component instead of matching any percentage in a
  // message: "MgO含量" must not match "SiC为13 wt%" or the C in SiC.
  const component = term.match(/^(.+?)(?:的)?(?:含量|比例|质量分数|占比)$/)?.[1];
  if (component) {
    const boundary = /^[a-z0-9]/.test(component) ? '(?:^|[^a-z0-9])' : '';
    return new RegExp(boundary + escapeRegex(component)
      + '(?:的)?(?:(?:含量|比例|质量分数|占比)|(?:为|是|[:=])?\\d+(?:\\.\\d+)?)').test(compact);
  }
  if (/^\d/.test(term)) {
    return new RegExp('(?:^|[^0-9.])' + escapeRegex(term) + '(?![0-9.])').test(text);
  }
  if (text.includes(term)) return true;
  const field = FIELD_ALIASES.find(item => item.names.includes(term));
  return field ? field.pattern.test(compact) : false;
}

async function execute(rawArgs, ctx = {}) {
  const { query, limit } = validate(rawArgs);
  if (!ctx.hasSession) return { ok: false, summary: '历史检索需要当前 sessionId。', data: null };
  const terms = normalize(query).split(/[\s，,、/；;:：。！？!?（）()]+|(?:和|与|及)/u).filter(Boolean);
  const history = Array.isArray(ctx.history) ? ctx.history.slice(-200) : [];
  const matches = history.map((m, index) => ({ m, index })).filter(({ m }) => m
    && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string'
    && terms.length > 0 && terms.every((term) => matchesTerm(normalize(m.content), term)));
  const results = matches.slice(-limit).reverse().map(({ m, index }) => ({
    messageIndex: index, role: m.role, content: m.content.slice(0, 1000),
    evidenceStatus: m.role === 'assistant' ? 'historical_answer_unverified' : 'user_statement',
  }));
  return { ok: true, summary: `当前主题历史命中 ${matches.length} 条，返回 ${results.length} 条。`,
    data: { scope: 'current_session_active_topic', untrusted: true, usableAsEvidence: false,
      matching: 'normalized_terms_and_field_aliases', results } };
}

module.exports = { name: 'search_history', description: '检索当前会话当前主题的已保存历史。历史回答不属于已核验知识证据；不能检索其他会话。', parameters, validate, execute };
