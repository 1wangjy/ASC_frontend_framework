'use strict';

/**
 * webBrowse — controlled HTTP GET.
 *
 * Policy (enforced here, no exceptions):
 *   - scheme: https required; plain http is accepted ONLY for a host that is
 *     explicitly present in AGENT_WEB_ALLOWLIST (operator opt-in).
 *   - host: must be in AGENT_WEB_ALLOWLIST (deny-by-default). Entries are exact
 *     hosts or `*.suffix` wildcards.
 *   - private/link-local/loopback/metadata literals are always blocked, and the
 *     hostname is DNS-resolved so an allowlisted name pointing at a private
 *     address is rejected too (SSRF guard).
 *   - redirects are followed manually (max 4) and every hop is re-validated.
 *   - timeout 15s, response body capped at 2MB, HTML stripped to text.
 *
 * file://, data:, ftp: and every other scheme are rejected before any I/O.
 */

const dns = require('node:dns');
const {
  isBlockedHost,
  isBlockedIp,
  parseHostAllowlist,
  isHostAllowlisted,
} = require('../policy');

const DEFAULT_ALLOWLIST = 'en.wikipedia.org,api.github.com,raw.githubusercontent.com';
const TIMEOUT_MS = Number(process.env.AGENT_WEB_TIMEOUT_MS || 15000);
const MAX_BYTES = Number(process.env.AGENT_WEB_MAX_BYTES || 2 * 1024 * 1024);
const MAX_TEXT_CHARS = Number(process.env.AGENT_WEB_MAX_TEXT_CHARS || 8000);
const MAX_REDIRECTS = 4;

const TEXTUAL_CONTENT = /^(text\/|application\/(json|xml|xhtml\+xml|rss\+xml|atom\+xml|javascript|ld\+json))/i;

function allowlist() {
  return parseHostAllowlist(process.env.AGENT_WEB_ALLOWLIST || DEFAULT_ALLOWLIST);
}

const parameters = {
  type: 'object',
  properties: {
    url: { type: 'string', description: '要抓取的 URL。仅允许白名单主机；必须使用 https（白名单主机可用 http）。' },
  },
  required: ['url'],
  additionalProperties: false,
};

function validate(rawArgs) {
  const args = rawArgs || {};
  const raw = typeof args.url === 'string' ? args.url.trim() : '';
  if (!raw) throw new Error('web_browse: url must be a non-empty string');
  if (raw.length > 2000) throw new Error('web_browse: url is too long');
  return { url: raw };
}

/** Throws when the URL violates scheme/host/DNS policy. Returns the parsed URL. */
async function assertAllowed(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('web_browse: invalid URL');
  }

  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname;
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error(`web_browse: scheme "${protocol.replace(':', '')}" is not allowed (https only; http for allowlisted hosts)`);
  }

  const list = allowlist();
  if (!isHostAllowlisted(host, list)) {
    throw new Error(`web_browse: host "${host}" is not in AGENT_WEB_ALLOWLIST (allowlist: ${list.join(', ') || 'empty'})`);
  }
  if (isBlockedHost(host)) {
    throw new Error(`web_browse: host "${host}" is private/link-local/metadata and is always blocked`);
  }

  // DNS guard: even an allowlisted name must not resolve into private space.
  let addresses = [];
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch (error) {
    throw new Error(`web_browse: DNS lookup failed for "${host}" (${error.code || error.message})`);
  }
  if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error(`web_browse: "${host}" resolves to a blocked address`);
  }
  return parsed;
}

/** Read at most MAX_BYTES from a fetch Response body. */
async function readCapped(response) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer: buffer.subarray(0, MAX_BYTES), truncated: buffer.length > MAX_BYTES };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    const remaining = MAX_BYTES - size;
    if (chunk.length >= remaining) {
      chunks.push(chunk.subarray(0, remaining));
      size = MAX_BYTES;
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(chunk);
    size += chunk.length;
  }
  return { buffer: Buffer.concat(chunks), truncated };
}

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
};

/** Strip HTML to readable text. */
function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => (ENTITIES[entity.toLowerCase()] !== undefined ? ENTITIES[entity.toLowerCase()] : entity))
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n').map((line) => line.trim()).join('\n')
    .trim();
}

/** Perform the GET with manual, re-validated redirects. */
async function fetchControlled(startUrl, signal) {
  let current = (await assertAllowed(startUrl)).toString();
  const hops = [];

  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5',
        'user-agent': 'ASC-Agent/1.0 (+controlled web_browse tool)',
      },
    });

    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      const next = new URL(response.headers.get('location'), current).toString();
      if (hops.length >= MAX_REDIRECTS) throw new Error(`web_browse: too many redirects (>${MAX_REDIRECTS})`);
      hops.push(next);
      current = (await assertAllowed(next)).toString();
      continue;
    }
    return { response, finalUrl: current, hops };
  }
  throw new Error(`web_browse: too many redirects (>${MAX_REDIRECTS})`);
}

async function execute(args, ctx) {
  const { url } = validate(args);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = ctx && ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

  let response;
  let finalUrl;
  let hops;
  try {
    ({ response, finalUrl, hops } = await fetchControlled(url, signal));
  } catch (error) {
    const reason = error && error.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS}ms` : error.message;
    return { ok: false, summary: `web_browse blocked/failed: ${reason}`, data: { url } };
  }

  try {
    const contentType = response.headers.get('content-type') || '';
    const { buffer, truncated } = await readCapped(response);
    const isTextual = TEXTUAL_CONTENT.test(contentType);

    if (!isTextual && buffer.length > 0) {
      return {
        ok: response.ok,
        summary: `web_browse: ${response.status} ${contentType} (binary, ${buffer.length}B, body omitted)`,
        data: { url: finalUrl, status: response.status, contentType, bytes: buffer.length, hops },
      };
    }

    const raw = buffer.toString('utf8');
    const text = /html/i.test(contentType) || /^\s*<(?:!doctype|html)/i.test(raw) ? htmlToText(raw) : raw.trim();
    const clipped = text.slice(0, MAX_TEXT_CHARS);

    return {
      ok: response.ok,
      summary: `web_browse: HTTP ${response.status} ${contentType} — ${clipped.slice(0, 400)}`,
      data: {
        url: finalUrl,
        status: response.status,
        contentType,
        bytes: buffer.length,
        truncated: truncated || text.length > clipped.length,
        hops,
        text: clipped,
      },
    };
  } catch (error) {
    return { ok: false, summary: `web_browse: failed reading response (${error.message})`, data: { url: finalUrl } };
  }
}

module.exports = {
  name: 'web_browse',
  description:
    '受控网页抓取（HTTP GET，仅白名单主机，https；15 秒超时、2MB 上限、HTML 转纯文本）。'
    + '用于查询公开资料（如维基百科、GitHub API）；私网/本地/元数据地址一律禁止。',
  parameters,
  validate,
  execute,
  // exported for tests / reuse
  assertAllowed,
  htmlToText,
};
