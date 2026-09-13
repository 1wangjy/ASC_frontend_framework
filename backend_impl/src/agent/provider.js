'use strict';

/**
 * provider.js — the single LLM integration point for the agent ("ai" layer).
 *
 * Default provider is an OpenAI-compatible chat-completions client
 * (LLM_API_URL + LLM_API_KEY, here DeepSeek) with function/tool calling.
 * Swapping providers means replacing/adding a class implementing
 * `streamChat({messages, tools, onDelta, signal})` and returning it from
 * `createProvider()`; nothing else in the agent imports HTTP directly.
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_LLM_TIMEOUT_MS || 180000);

/** Accept "…/chat/completions", "…/v1" or a bare base URL. */
function normalizeChatCompletionsUrl(raw) {
  const base = String(raw || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('LLM_API_URL is not configured');
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v\d+$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function emptyToolCallAccumulator() {
  return { id: '', type: 'function', function: { name: '', arguments: '' } };
}

class OpenAICompatibleProvider {
  /**
   * @param {{apiUrl?:string, apiKey?:string, model?:string, timeoutMs?:number, fetchImpl?:Function}} options
   */
  constructor(options = {}) {
    this.chatUrl = normalizeChatCompletionsUrl(options.apiUrl || process.env.LLM_API_URL);
    this.apiKey = options.apiKey !== undefined ? options.apiKey : process.env.LLM_API_KEY;
    this.model = options.model || process.env.AGENT_LLM_MODEL || 'deepseek-flash';
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  get available() {
    return Boolean(this.chatUrl && this.apiKey);
  }

  buildBody({ messages, tools, stream, temperature }) {
    const body = {
      model: this.model,
      messages,
      temperature: temperature === undefined ? 0.2 : temperature,
      stream: !!stream,
    };
    if (Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    return body;
  }

  async post(body, signal) {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await this.fetchImpl(this.chatUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: combined,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`LLM request failed (HTTP ${response.status}): ${detail.slice(0, 400)}`);
    }
    return response;
  }

  /** Non-streaming completion → assembled assistant message. */
  async chat({ messages, tools, signal, temperature }) {
    const response = await this.post(this.buildBody({ messages, tools, stream: false, temperature }), signal);
    const payload = await response.json();
    const choice = payload.choices && payload.choices[0];
    if (!choice) throw new Error('LLM response contained no choices');
    const message = choice.message || {};
    return {
      role: 'assistant',
      content: message.content || '',
      tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
      finish_reason: choice.finish_reason,
    };
  }

  /**
   * Streaming completion. Calls `onDelta(text)` for every content fragment and
   * resolves with the assembled assistant message (content + tool_calls).
   * Falls back to a non-streaming call if the stream yields nothing usable.
   */
  async streamChat({ messages, tools, signal, temperature, onDelta }) {
    const response = await this.post(this.buildBody({ messages, tools, stream: true, temperature }), signal);
    if (!response.body) {
      const message = await this.chat({ messages, tools, signal, temperature });
      if (message.content) onDelta(message.content);
      return message;
    }

    const decoder = new TextDecoder();
    const content = [];
    const toolCalls = new Map();
    let buffer = '';
    let sawFinish = false;

    const consumeLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        return;
      }
      const choice = json.choices && json.choices[0];
      if (!choice) return;
      if (choice.finish_reason) sawFinish = true;
      const delta = choice.delta || {};
      if (delta.content) {
        content.push(delta.content);
        onDelta(delta.content);
      }
      for (const fragment of delta.tool_calls || []) {
        const key = fragment.index === undefined ? 0 : fragment.index;
        if (!toolCalls.has(key)) toolCalls.set(key, emptyToolCallAccumulator());
        const acc = toolCalls.get(key);
        if (fragment.id) acc.id = fragment.id;
        if (fragment.type) acc.type = fragment.type;
        const fn = fragment.function || {};
        if (fn.name && acc.function.name !== fn.name) acc.function.name += fn.name;
        if (fn.arguments) acc.function.arguments += fn.arguments;
      }
    };

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        consumeLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer) consumeLine(buffer);

    const text = content.join('');
    const calls = [...toolCalls.values()].filter((call) => call.function.name);
    if (!text && calls.length === 0 && !sawFinish) {
      // Provider ignored `stream` (or sent an empty stream) — retry once unabridged.
      const message = await this.chat({ messages, tools, signal, temperature });
      if (message.content) onDelta(message.content);
      return message;
    }

    return { role: 'assistant', content: text, tool_calls: calls, finish_reason: calls.length ? 'tool_calls' : 'stop' };
  }
}

/** Provider factory — the single swap point. */
function createProvider(options = {}) {
  const kind = process.env.AGENT_LLM_PROVIDER || 'openai-compatible';
  if (kind !== 'openai-compatible') {
    throw new Error(`Unknown AGENT_LLM_PROVIDER "${kind}" (supported: openai-compatible)`);
  }
  return new OpenAICompatibleProvider(options);
}

module.exports = { createProvider, OpenAICompatibleProvider, normalizeChatCompletionsUrl };
