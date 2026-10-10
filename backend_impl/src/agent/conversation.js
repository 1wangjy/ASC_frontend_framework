'use strict';

// Conversation context is discussion data, not a source of scientific evidence.
// Conservative rules: keep the user's wording rather than infer missing conditions.
const RESET_TOPIC = /换个话题|切换话题|新话题|重新开始|(?:现在|接下来)(?:改为|改讨论|讨论)|不再讨论/;
const plainMessages = (raw) => (Array.isArray(raw) ? raw : [])
  .filter((m) => m && ['user', 'assistant'].includes(m.role)
    && typeof m.content === 'string' && m.content.trim())
  .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));
const scopeId = (value) => typeof value === 'string' ? value.trim().slice(0, 128) : '';

function updateConditions(conditions, text) {
  const next = { ...conditions };
  // Store complete condition phrases so comparisons, ranges and negation are
  // not silently converted into a single numeric experimental condition.
  const phrases = text.split(/[，。；;!?！？\n]/).map((s) => s.trim()).filter(Boolean);
  const temperature = phrases.filter((s) => /\d\s*(?:℃|°\s*C|摄氏度)|(?:温度|摄氏)\s*\d/i.test(s));
  const atmosphere = phrases.filter((s) => /空气|氮气|氩气|氧气|真空|气氛|惰性气体/.test(s));
  if (temperature.length) next.temperature = temperature.join('；').slice(0, 600);
  if (atmosphere.length) next.atmosphere = atmosphere.join('；').slice(0, 600);
  if (/取消温度条件|不限定温度|温度不限/.test(text)) delete next.temperature;
  if (/取消气氛条件|不限定气氛|气氛不限/.test(text)) delete next.atmosphere;
  return next;
}

function prepareConversation(record, incoming, requested = {}) {
  const last = incoming[incoming.length - 1];
  if (!last || last.role !== 'user') throw new Error('a new turn must end with a user message');
  const stored = record && Array.isArray(record.messages) ? record.messages : [];
  const previous = record && record.researchState && record.researchState.version === 1
    ? record.researchState : null;
  const oldScope = previous && previous.scope || {};
  const projectId = scopeId(requested.projectId);
  const graphId = scopeId(requested.graphId);
  const hadScope = Boolean(oldScope.projectId || oldScope.graphId);
  const projectChanged = Boolean(hadScope && projectId && projectId !== oldScope.projectId);
  const graphChanged = Boolean(hadScope && graphId && graphId !== oldScope.graphId);
  const scopeChanged = projectChanged || graphChanged;
  const reset = requested.resetTopic === true || RESET_TOPIC.test(last.content) || scopeChanged;
  const historyStart = reset ? stored.length : Math.min(stored.length,
    Math.max(0, Number.isInteger(previous && previous.historyStart) ? previous.historyStart : 0));
  const activeHistory = plainMessages(stored.slice(historyStart));
  // Old sessions without structured state remain readable; reconstruct their
  // conditions from user turns only (never from generated assistant answers).
  let conditions = previous && previous.conditions && typeof previous.conditions === 'object'
    ? Object.fromEntries(['temperature', 'atmosphere'].filter((key) => typeof previous.conditions[key] === 'string')
      .map((key) => [key, previous.conditions[key].slice(0, 600)])) : {};
  if (!previous) {
    for (const message of activeHistory) {
      if (message.role === 'user') conditions = updateConditions(conditions, message.content);
    }
  }
  if (reset) conditions = {};
  const scope = {};
  if (projectId || (!graphChanged && oldScope.projectId)) scope.projectId = projectId || oldScope.projectId;
  if (graphId || (!projectChanged && oldScope.graphId)) scope.graphId = graphId || oldScope.graphId;
  const state = {
    version: 1, scope, historyStart,
    turn: Math.max(0, Number.isSafeInteger(previous && previous.turn) ? previous.turn : 0) + 1,
    topicRequest: (reset || !previous ? last.content : previous.topicRequest || last.content).slice(0, 1000),
    conditions: updateConditions(conditions, last.content),
    resetReason: scopeChanged ? 'scope_changed' : reset ? 'topic_reset' : null,
    interpretation: 'user_wording_only_not_verified_facts',
  };
  return {
    // Only server-stored history is authoritative for a session. A client may
    // still send its whole transcript, but it is neither duplicated nor trusted.
    messages: record ? [...activeHistory.slice(-39), last] : incoming,
    context: { ...scope, researchState: state, history: record ? activeHistory : [], hasSession: Boolean(record) },
  };
}

module.exports = { prepareConversation, updateConditions };
