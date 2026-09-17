'use strict';

/**
 * route.js — HTTP surface of the agent module.
 *
 *   GET  /api/agent/tools   → { tools: [{name, description, parameters}] }
 *   POST /api/agent/stream  → SSE (text/event-stream)
 *
 * Request body for /stream:
 *   { messages:[{role,content}], sessionId?, context?:{projectId?},
 *     options?:{maxSteps?, maxTools?, maxOptimize?, allowTools?, webAllowlist?} }
 *
 * `options.allowTools` and `options.webAllowlist` can only NARROW the operator
 * configuration (registry / AGENT_WEB_ALLOWLIST); quota options are clamped by
 * policy.resolveQuota and can never be raised by the client.
 *
 * This router is self-contained: mounting it is the only wiring step, and
 * removing the `app.use('/api/agent', …)` line removes the feature entirely.
 */

const express = require('express');
const toolRegistry = require('./tools');
const { runAgent, normalizeMessages } = require('./loop');

const HEARTBEAT_MS = 15000;

function sendFrame(res, frame) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(frame)}\n\n`);
}

/** POST /api/agent/stream */
async function streamHandler(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  let messages;
  try {
    messages = normalizeMessages(body.messages);
  } catch (error) {
    // Validation failures are ordinary JSON errors, not a half-open SSE stream.
    res.status(400).json({ code: 400, message: error.message });
    return;
  }

  const context = body.context && typeof body.context === 'object' ? body.context : {};
  const options = body.options && typeof body.options === 'object' ? body.options : {};
  const requestedTools = Array.isArray(options.allowTools) ? options.allowTools.slice(0, 32) : undefined;
  const requestedWebHosts = Array.isArray(options.webAllowlist)
    ? options.webAllowlist.filter((entry) => typeof entry === 'string').slice(0, 16)
    : undefined;
  const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : undefined;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    try {
      res.write(': ping\n\n');
    } catch {
      /* client gone; the close handler tears everything down */
    }
  }, HEARTBEAT_MS);

  let closed = false;
  res.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
    if (!controller.signal.aborted) controller.abort();
  });

  try {
    // Flush a bounded, harmless preamble so proxies/client see the stream open.
    res.write(': open\n\n');
    await runAgent({
      messages,
      context,
      options: {
        maxSteps: options.maxSteps,
        maxTools: options.maxTools,
        maxOptimize: options.maxOptimize,
        allowTools: requestedTools,
        webAllowlist: requestedWebHosts,
        sessionId,
      },
      emit: (frame) => sendFrame(res, frame),
      signal: controller.signal,
    });
  } catch (error) {
    sendFrame(res, { type: 'error', message: String(error && error.message ? error.message : error).slice(0, 600) });
    sendFrame(res, { type: 'done', steps: 0 });
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
}

const router = express.Router();

router.get('/tools', (req, res) => {
  const registered = toolRegistry.registeredNames();
  res.json({
    tools: toolRegistry.listTools(),
    count: registered.length,
    // Deny-by-default: only registered names can ever be requested.
    allowlist: registered,
  });
});

router.post('/stream', streamHandler);

module.exports = { router };
