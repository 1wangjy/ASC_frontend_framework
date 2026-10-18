'use strict';

/**
 * route.js — HTTP surface of the agent module.
 *
 *   GET    /api/agent/tools            → { tools:[{name,description,parameters}], count, allowlist }
 *   POST   /api/agent/stream           → SSE (text/event-stream)
 *   POST   /api/agent/sessions         → { sessionId, title, createdAt }
 *   GET    /api/agent/sessions?limit=20→ [{ sessionId, title, createdAt, updatedAt, turns }]
 *   GET    /api/agent/sessions/:id     → { sessionId, title, messages, createdAt, updatedAt }
 *   DELETE /api/agent/sessions/:id     → { ok:true, deleted:boolean }  (idempotent)
 *   GET    /api/agent/metrics          → { turns, toolCalls, toolErrors, tokens, avgTurnMs, tools }
 *
 * Request body for /stream:
 *   { messages:[{role,content}], sessionId?, resumeFromEventId?,
 *     context?:{projectId?},
 *     options?:{maxSteps?, maxTools?, maxOptimize?, allowTools?, webAllowlist?} }
 *
 * `options.allowTools` and `options.webAllowlist` can only NARROW the operator
 * configuration (registry / AGENT_WEB_ALLOWLIST); quota options are clamped by
 * policy.resolveQuota and can never be raised by the client.
 *
 * SSE framing (T11)
 *   Every frame is written as `id: <seq>\n` + `data: <json>\n\n`; `<seq>` is
 *   per stream (per session once the turn belongs to one). `: open` marks the
 *   start of the stream and `: ping` is written at least every 15s, so a long
 *   tool call can never look like an idle connection to a proxy.
 *
 * Sessions (T3)
 *   A `sessionId` turn is appended to that session when it ends (user message +
 *   assistant reply carrying per-tool-call summaries) and its `done` frame
 *   carries `{sessionId, turnIndex}` — turnIndex is the 0-based index of the
 *   turn in the session, i.e. `turns` in the session list afterwards. Unknown
 *   sessionId → 404 before the stream opens; a second concurrent turn on the
 *   same session → 409. Files: ${AGENT_SESSION_DIR}/<sessionId>.json, written
 *   atomically by sessions.js — persistence failures only warn.
 *
 * Resume (T11)
 *   `{sessionId, resumeFromEventId}` replays the session's buffered frames with
 *   a higher id, then follows the still-running turn live until its `done`
 *   frame, or ends immediately when the session is idle. A resume request never
 *   starts a turn (that is what `messages` without `resumeFromEventId` does), so
 *   a reconnecting client can never double-append a turn. The buffer is process
 *   memory only — AGENT_SSE_BUFFER frames, default 200, NOT durable across a
 *   backend restart; persisted sessions are (GET /api/agent/sessions/:id).
 *   A session stream is not aborted when the client disconnects (that is what
 *   makes resume possible); it is bounded by the turn timeout.
 *
 * This router is self-contained: mounting it is the only wiring step, and
 * removing the `app.use('/api/agent', …)` line removes the feature entirely.
 */

const express = require('express');
const { prepareConversation } = require('./conversation');
const { EvidenceStore } = require('./evidence');
const toolRegistry = require('./tools');
const policy = require('./policy');
const { runAgent, normalizeMessages } = require('./loop');
const sessions = require('./sessions');
const { verifyToken } = require('../utils/jwt');
const activeTurns = new Map();
const metrics = require('./metrics');
const modelProfiles = require('./models');

/** Keep-alive cadence for SSE streams (long tool calls included). */
const HEARTBEAT_MS = 15000;

/**
 * Effective keep-alive cadence: AGENT_SSE_HEARTBEAT_MS (default 15000, capped
 * at one minute). Read per stream so an operator (or a test) can shrink it.
 */
function heartbeatMs(env = process.env) {
  return policy.clampInt(env.AGENT_SSE_HEARTBEAT_MS, HEARTBEAT_MS, 100, 60000);
}

/** `id: <seq>\ndata: <json>\n\n` — one SSE frame, exactly as the client parses it. */
function framePayload(id, frame) {
  return `id: ${id}\ndata: ${JSON.stringify(frame)}\n\n`;
}

/** `resumeFromEventId` is a body field; absent/invalid means "not a resume". */
function parseResumeFromEventId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

/**
 * One SSE response: heartbeats, id-prefixed frames, clean teardown.
 * `close()` is idempotent; a disconnected client simply stops receiving.
 */
function openStream(res) {
  let detached = false;
  const heartbeat = setInterval(() => {
    if (detached || res.writableEnded) return;
    try {
      res.write(': ping\n\n');
    } catch {
      detached = true;
    }
  }, heartbeatMs());
  if (typeof heartbeat.unref === 'function') heartbeat.unref();
  res.on('close', () => {
    detached = true;
    clearInterval(heartbeat);
  });

  const writable = () => !detached && !res.writableEnded;
  return {
    comment(text) {
      if (writable()) res.write(`: ${text}\n\n`);
    },
    frame(id, frame) {
      if (writable()) res.write(framePayload(id, frame));
    },
    close() {
      detached = true;
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
  };
}

/**
 * Bind the turn's `emit(frame)` to the SSE response and, for a session stream,
 * to the session's frame ring buffer (ids + fan-out to resuming clients).
 *
 * @param {{stream:object, sessionId?:string, endOnDone?:boolean}} params
 */
function attachEmitter({ stream, sessionId, endOnDone = false }) {
  let closed = false;
  let counter = 1;
  const finish = () => {
    if (closed) return;
    closed = true;
    if (unsubscribe) unsubscribe();
    stream.close();
  };
  const deliver = (id, frame) => {
    stream.frame(id, frame);
    if (endOnDone && frame.type === 'done') finish();
  };
  const unsubscribe = sessionId ? sessions.subscribe(sessionId, deliver) : null;

  return {
    get closed() {
      return closed;
    },
    finish,
    /**
     * Replay one buffered frame verbatim: it keeps its original id and is NOT
     * re-buffered (only new frames are published).
     */
    replay(entry) {
      if (closed) return;
      deliver(entry.id, entry.frame);
    },
    emit(frame) {
      if (closed) return;
      if (sessionId) {
        sessions.publish(sessionId, frame); // assigns the id, buffers, fans out
        return;
      }
      deliver(counter, frame);
      counter += 1;
    },
  };
}

/**
 * What the session file must remember about the turn: user message, assistant
 * text, tool-call summaries (paired by tool-call id) and any error frame.
 */
function createTurnLog(user) {
  return { user, finalText: '', deltaText: '', reasoningText: '', toolCalls: [], pending: new Map(), error: null };
}

function noteFrame(log, frame) {
  switch (frame.type) {
    case 'message_delta':
      log.deltaText += frame.text || '';
      break
    case 'reasoning_delta':
      // 思考过程单独累计，落库后可在会话回看时折叠展开。
      log.reasoningText += frame.text || '';
      break;
    case 'tool_call': {
      const entry = {
        name: frame.name,
        argsSummary: policy.summarizeArgs(frame.name, frame.args),
        ok: false,
        ms: 0,
        startedAt: frame.startedAt,
      };
      log.toolCalls.push(entry);
      if (frame.id !== undefined && frame.id !== null) log.pending.set(String(frame.id), entry);
      break;
    }
    case 'tool_result': {
      const entry = log.pending.get(String(frame.id));
      if (entry) {
        entry.ok = frame.ok === true;
        if (frame.ok === false && (frame.data?.retrieval_budget_exhausted === true || frame.data?.quota_exceeded === true)) entry.budgetDenied = true;
        entry.ms = Number.isFinite(frame.ms) ? frame.ms : 0;
        entry.finishedAt = frame.finishedAt;
        entry.resultSummary = frame.summary;
        entry.code = frame.data?.code;
        entry.requestTiming = frame.data?.request_timing;
        if (frame.stopped) entry.stopped = true;
        log.pending.delete(String(frame.id));
      }
      break;
    }
    case 'final':
      log.finalText = typeof frame.text === 'string' ? frame.text : '';
      log.answerCheck = frame.answer_check;
      log.citations = frame.citations;
      log.serviceReferences = frame.service_references;
      log.citationBindings = frame.citation_bindings;
      break;
    case 'model_selected':
      log.model = { id: frame.modelId, name: frame.model };
      break;
    case 'done':
      log.timing = frame.timing;
      break;
    case 'error':
      log.error = frame.code ? { code: frame.code, message: frame.message } : { message: frame.message };
      if (frame.code === 'turn_stopped') {
        for (const entry of log.pending.values()) entry.stopped = true;
      }
      break;
    default:
      break;
  }
}

/** Summary-only assistant message: never tool payloads, never file contents. */
function assistantMessage(log) {
  const message = { role: 'assistant', content: log.finalText || log.deltaText || '' };
  if (log.reasoningText) message.reasoning = log.reasoningText;
  if (log.toolCalls.length) {
    message.toolCalls = log.toolCalls.map(({ name, argsSummary, ok, ms, budgetDenied, stopped, startedAt, finishedAt, resultSummary, code, requestTiming }) => ({ name, argsSummary, ok: ok === true, ms, startedAt, finishedAt,
      resultSummary, code, requestTiming,
      ...(stopped ? { stopped: true } : {}),
      ...(budgetDenied ? { budgetDenied: true } : {}) }));
  }
  if (log.error) message.error = log.error;
  if (log.error?.code === 'turn_stopped') message.stopped = true;
  if (log.answerCheck) message.answer_check = log.answerCheck;
  if (log.model) message.model = log.model;
  if (log.timing) message.timing = log.timing;
  if (log.citations) message.citations = log.citations;
  if (log.serviceReferences) message.service_references = log.serviceReferences;
  if (log.citationBindings) message.citation_bindings = log.citationBindings;
  if (log.evidenceStore && log.evidenceStore.records.size) message.evidence = log.evidenceStore.snapshot();
  return message;
}

/** Last user message of the request — the turn the session has to remember. */
function lastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return { role: 'user', content: messages[i].content };
  }
  return null;
}

/**
 * Run one turn, streaming frames and (for a session) persisting it.
 *
 * The turn is appended to the session BEFORE its `done` frame is published, so
 * a client that reloads the session on `done` never races the file write.
 */
async function runTurn({ stream, messages, context, options, sessionId, signal, provider }) {
  context = { ...context, evidenceStore: new EvidenceStore(context),
    answerMode: process.env.AGENT_ANSWER_MODE === 'evidence_draft' ? 'evidence_draft' : 'knowledge_service' };
  const emitter = attachEmitter({ stream, sessionId });
  const turnIndex = sessionId ? sessions.turnCount(sessionId) : undefined;
  const log = createTurnLog(lastUserMessage(messages));
  log.evidenceStore = context.evidenceStore;
  const started = Date.now();

  const emit = (frame) => {
    if (frame.type === 'done') {
      const done = sessionId ? { ...frame, sessionId, turnIndex } : frame;
      noteFrame(log, done);
      if (sessionId && log.user) sessions.appendTurn(sessionId, {
        user: log.user,
        assistant: assistantMessage(log),
        researchState: context.researchState,
        workspace: { projectId: context.projectId, graphId: context.graphId },
      });
      emitter.emit(done);
      return;
    }
    noteFrame(log, frame);
    emitter.emit(frame);
  };
  if (provider && provider.model) emit({ type: 'model_selected', modelId: provider.profileId || 'default', model: provider.model });

  let result;
  try {
    result = await runAgent({
      messages,
      context,
      options: { ...options, sessionId },
      emit,
      signal,
      provider,
    });
  } catch (error) {
    // runAgent reports its own failures; this is the last-resort HTTP path.
    emit({ type: 'error', message: String(error && error.message ? error.message : error).slice(0, 600) });
    emit({ type: 'done', steps: 0 });
  }

  metrics.recordTurn({ ms: Date.now() - started, usage: result && result.usage, tools: log.toolCalls });
  emitter.finish();
}

/**
 * POST /api/agent/stream
 * @param {{provider?:object}} [deps] test seam; production uses the configured client
 */
/**
 * 当前用户 id（来自平台 JWT）。多用户：会话按 userId 隔离；
 * 未携带令牌（如独立 agent 入口/测试）落入 `anonymous` 命名空间。
 */
function authOf(req) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const decoded = token ? verifyToken(token) : null;
    if (decoded && decoded.id !== undefined && decoded.id !== null) {
      return { userId: String(decoded.id), role: String(decoded.role || '') };
    }
  } catch { /* 令牌无效 → 匿名 */ }
  return { userId: 'anonymous', role: '' };
}

function userIdOf(req) {
  return authOf(req).userId;
}

async function streamHandler(req, res, deps = {}) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const resumeFromEventId = parseResumeFromEventId(body.resumeFromEventId);

  let messages;
  try {
    messages = normalizeMessages(body.messages);
  } catch (error) {
    // A resume request may carry no messages: it never starts a turn.
    if (resumeFromEventId === null) {
      res.status(400).json({ code: 400, message: error.message });
      return;
    }
    messages = [];
  }

  const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : undefined;
  if (resumeFromEventId !== null && !sessionId) {
    res.status(400).json({ code: 400, message: 'resumeFromEventId requires sessionId' });
    return;
  }
  if (sessionId && !sessions.isValidSessionId(sessionId)) {
    res.status(400).json({ code: 400, message: 'sessionId must match /^[A-Za-z0-9_-]{1,64}$/' });
    return;
  }
  const record = sessionId ? sessions.readSession(sessionId) : null;
  if (sessionId && (!record || !sessions.ownsSession(record, userIdOf(req)))) {
    // 不区分「不存在」与「不属于你」，避免泄漏他人会话是否存在
    res.status(404).json({ code: 404, message: `unknown sessionId "${sessionId}"` });
    return;
  }
  const isResume = resumeFromEventId !== null;
  if (sessionId && !isResume && sessions.isTurnActive(sessionId)) {
    res.status(409).json({ code: 409, message: `a turn is already running for session "${sessionId}"` });
    return;
  }

  let context = body.context && typeof body.context === 'object' ? body.context : {};
  if (!isResume) {
    try {
      const prepared = prepareConversation(record, messages, context);
      messages = prepared.messages;
      context = prepared.context;
    } catch (error) {
      res.status(400).json({ code: 400, message: error.message });
      return;
    }
  }
  const options = body.options && typeof body.options === 'object' ? body.options : {};
  let provider;
  if (!isResume) {
    try {
      if (['apiUrl', 'apiKey', 'provider', 'model'].some((key) => Object.hasOwn(body, key))) throw new Error('model_id_only');
      provider = deps.provider || modelProfiles.resolve(body.modelId);
    } catch (error) {
      const known = ['invalid_model_id', 'unknown_model_id', 'model_not_configured', 'model_id_only'];
      res.status(400).json({ code: known.includes(error.message) ? error.message : 'model_configuration_invalid', message: '模型选择无效或服务端配置不可用；只能选择已登记的模型 ID。' });
      return;
    }
  }
  const requestedTools = Array.isArray(options.allowTools) ? options.allowTools.slice(0, 32) : undefined;
  const requestedWebHosts = Array.isArray(options.webAllowlist)
    ? options.webAllowlist.filter((entry) => typeof entry === 'string').slice(0, 16)
    : undefined;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const stream = openStream(res);
  const controller = new AbortController();
  // A session stream survives its client (that is what resume is for) and is
  // bounded by the turn timeout; a plain stream stops when the client leaves.
  if (!sessionId) {
    res.on('close', () => {
      if (!controller.signal.aborted) controller.abort();
    });
  }
  stream.comment(isResume ? 'resume' : 'open');

  if (isResume) {
    // Replay, then follow the live turn — never start one.
    const resumed = attachEmitter({ stream, sessionId, endOnDone: true });
    for (const entry of sessions.replay(sessionId, resumeFromEventId)) {
      resumed.replay(entry);
      if (resumed.closed) break;
    }
    // Nothing more will ever arrive when the buffer already ends with `done`
    // (checked, not inferred from the turn flag, to close the window between
    // publishing `done` and releasing the turn slot) or when no turn is running.
    const head = sessions.lastBufferedFrame(sessionId);
    const finished = Boolean(head && head.frame && head.frame.type === 'done');
    if (!resumed.closed && (finished || !sessions.isTurnActive(sessionId))) resumed.finish();
    return;
  }

  const claimed = sessionId ? sessions.beginTurn(sessionId) : true;
  if (sessionId && claimed) activeTurns.set(sessionId, { controller,
    question: lastUserMessage(messages)?.content || '',
    fromEventId: sessions.lastEventId(sessionId),
    scope: { projectId: context.projectId, graphId: context.graphId } });
  try {
    await runTurn({
      stream,
      messages,
      context,
      options: {
        maxSteps: options.maxSteps,
        maxTools: options.maxTools,
        maxOptimize: options.maxOptimize,
        allowTools: requestedTools,
        webAllowlist: requestedWebHosts,
        timeoutMs: options.timeoutMs,
      },
      sessionId,
      signal: controller.signal,
      provider,
    });
  } finally {
    if (sessionId && claimed) { activeTurns.delete(sessionId); sessions.endTurn(sessionId); }
  }
}

/**
 * Build the agent router.
 *
 * @param {{provider?:object}} [config] `provider` is an injection seam for
 *   offline tests (anything implementing `{available, streamChat}`); production
 *   omits it so the loop builds the configured OpenAI-compatible client. It is
 *   never client-controllable.
 */
function createRouter(config = {}) {
  const deps = { provider: config.provider };
  const instance = express.Router();
  instance.get('/models', (_req, res) => {
    try { res.json(modelProfiles.catalog()); }
    catch { res.status(503).json({ code: 'model_configuration_invalid', message: '服务端模型名单配置无效，请检查本地配置。' }); }
  });

  instance.get('/tools', (req, res) => {
    const registered = toolRegistry.registeredNames();
    res.json({
      tools: toolRegistry.listTools(),
      count: registered.length,
      // Deny-by-default: only registered names can ever be requested.
      allowlist: registered,
    });
  });

  // --- T3: sessions -------------------------------------------------------

  instance.post('/sessions', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const record = sessions.createSession({
      title: body.title,
      userId: userIdOf(req),
      workspace: body.workspace,
      mode: body.mode,
    });
    res.json({
      sessionId: record.sessionId,
      title: record.title,
      createdAt: record.createdAt,
      mode: record.mode,
      workspace: record.workspace || null,
    });
  });

  instance.get('/sessions', (req, res) => {
    const { userId, role } = authOf(req);
    // 管理员首次访问时，把没有归属的旧会话认领到自己名下（保留历史，同时保持严格隔离）
    if (role === 'admin') sessions.claimOrphans(userId);
    res.json(sessions.listSessions({ limit: req.query.limit, userId, mode: req.query.mode }));
  });

  instance.get('/sessions/:id', (req, res) => {
    const { id } = req.params;
    if (!sessions.isValidSessionId(id)) {
      res.status(400).json({ code: 400, message: 'invalid sessionId' });
      return;
    }
    const record = sessions.readSession(id);
    if (!record || !sessions.ownsSession(record, userIdOf(req))) {
      res.status(404).json({ code: 404, message: `unknown sessionId "${id}"` });
      return;
    }
    res.json({
      sessionId: record.sessionId,
      title: record.title,
      messages: record.messages,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      mode: record.mode,
      workspace: record.workspace,
      ...(activeTurns.has(id) ? { activeTurn: (({ question, fromEventId, scope }) =>
        ({ question, fromEventId, scope }))(activeTurns.get(id)) } : {}),
      ...(record.researchState ? { researchState: record.researchState } : {}),
    });
  });

  // 非流式会话（如「深度研究」单轮问答）：追加一轮问答，供右侧目录恢复
  instance.post('/sessions/:id/turns', (req, res) => {
    const { id } = req.params;
    if (!sessions.isValidSessionId(id)) return res.status(400).json({ code: 400, message: 'invalid sessionId' });
    const existing = sessions.readSession(id);
    if (!existing || !sessions.ownsSession(existing, userIdOf(req))) {
      return res.status(404).json({ code: 404, message: `unknown sessionId "${id}"` });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const clean = (message) => {
      if (!message || typeof message !== 'object') return null;
      const content = typeof message.content === 'string' ? message.content.slice(0, 60000) : '';
      if (!content) return null;
      return { role: message.role === 'assistant' ? 'assistant' : 'user', content };
    };
    const user = clean(body.user);
    const assistant = clean(body.assistant);
    if (!user && !assistant) return res.status(400).json({ code: 400, message: 'empty turn' });
    const record = sessions.appendTurn(id, { user, assistant });
    res.json({ ok: Boolean(record), sessionId: id, updatedAt: record?.updatedAt || existing.updatedAt });
  });

  instance.post('/sessions/:id/stop', (req, res) => {
    const { id } = req.params;
    if (!sessions.isValidSessionId(id)) return res.status(400).json({ message: 'invalid sessionId' });
    const owned = sessions.readSession(id);
    if (!owned || !sessions.ownsSession(owned, userIdOf(req))) return res.status(404).json({ message: 'unknown sessionId' });
    const active = activeTurns.get(id);
    if (active) active.controller.abort();
    res.json({ ok: true, stopping: Boolean(active) });
  });

  instance.delete('/sessions/:id', (req, res) => {
    const { id } = req.params;
    if (!sessions.isValidSessionId(id)) {
      res.status(400).json({ code: 400, message: 'invalid sessionId' });
      return;
    }
    // 归属校验：不属于当前用户的会话按"不存在"处理
    const existing = sessions.readSession(id);
    if (existing && !sessions.ownsSession(existing, userIdOf(req))) {
      res.status(404).json({ code: 404, message: `unknown sessionId "${id}"` });
      return;
    }
    // Idempotent: deleting an unknown session is not an error for a client.
    const deleted = sessions.deleteSession(id);
    sessions.resetRuntime(id);
    res.json({ ok: true, deleted });
  });

  // --- T9: metrics --------------------------------------------------------

  instance.get('/metrics', (req, res) => {
    res.json(metrics.snapshot());
  });

  instance.post('/stream', (req, res) => {
    streamHandler(req, res, deps);
  });

  return instance;
}

const router = createRouter();

module.exports = { router, createRouter, HEARTBEAT_MS, heartbeatMs };
