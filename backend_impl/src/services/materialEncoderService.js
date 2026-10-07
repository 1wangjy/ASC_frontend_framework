'use strict';

/**
 * materialEncoderService — 把"自然语言配方"解析成模型需要的材料代号 + 百分比。
 *
 * 为什么要它：预测接口的输入是 material_id（数字代号，来自 material_map.json），
 * 但使用者是用"90矾土 12%、FDN 0.8%"这种方式描述配方的；让界面直接暴露数字代号
 * 既不直观也容易填错。
 *
 * 解析策略：
 *   1. 规则优先——用真实材料表做最长匹配，并在名字附近抓百分比；也接受显式代号
 *      （"代号 61" / "#61"）。规则能解释的部分不需要模型参与，快且可复现。
 *   2. 规则没覆盖到的片段才交给 LLM 兜底（复用 agent 的 provider，带 reasoning），
 *      返回值里的候选名字必须落在真实材料表内，否则丢弃。
 * 响应始终带 reasoning 文本：UI 默认收起、可展开，说明"为什么这么编码"。
 */

const { createProvider } = require('../agent/provider');
const materialVocabService = require('./materialVocabService');

const MATERIALS_TIMEOUT_MS = Number(process.env.MATERIAL_ENCODER_TIMEOUT_MS || 20000);
const PREDICT_BASE_URL = (process.env.PREDICT_BASE_URL || 'http://127.0.0.1:8100').replace(/\/+$/, '');

let materialsCache = null;

/** 全角 → 半角 + 压缩空白，便于规则匹配（中文配方里两种写法都常见）。 */
function normalizeText(value) {
  return String(value || '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadMaterials(fetchImpl = fetch) {
  if (materialsCache) return materialsCache;
  // 首选：归束后的 canonical 词表（data/material_vocab.json，含别名，单一权威）
  try {
    const canonical = materialVocabService.listMaterials();
    const list = Array.isArray(canonical?.materials) ? canonical.materials : [];
    const normalized = [];
    for (const item of list) {
      const materialId = String(item?.material_id ?? '').trim();
      if (!materialId || !item?.name) continue;
      for (const name of [item.name, ...(item.aliases || [])]) {
        const text = String(name || '').trim();
        if (text) normalized.push({ materialId, name: text });
      }
    }
    if (normalized.length) {
      materialsCache = normalized;
      return materialsCache;
    }
  } catch (error) {
    console.warn('[material-encoder] canonical 词表不可用，回退预测服务清单：', error.message);
  }
  // 回退：预测服务的 material_map（89 条，无别名）
  const response = await fetchImpl(`${PREDICT_BASE_URL}/api/v1/model/materials`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(MATERIALS_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`原料清单获取失败（HTTP ${response.status}）`);
  }
  const payload = await response.json();
  const list = Array.isArray(payload?.materials) ? payload.materials : [];
  materialsCache = list
    .map((item) => ({
      materialId: String(item?.material_id ?? '').trim(),
      name: String(item?.name ?? '').trim(),
    }))
    .filter((item) => item.materialId && item.name);
  if (!materialsCache.length) throw new Error('原料清单为空');
  return materialsCache;
}

function clearMaterialsCache() {
  materialsCache = null;
}

/** 抓百分比：名字前后都可能写，"12%"、"12 %"、"占比12" 都认。 */
function ratioNear(text, start, end) {
  const before = text.slice(Math.max(0, start - 16), start);
  const after = text.slice(end, Math.min(text.length, end + 16));
  const patterns = [
    /(\d+(?:\.\d+)?)\s*%\s*(?:的)?\s*$/,              // "12% 的 90矾土"
    /(\d+(?:\.\d+)?)\s*%\s*$/,                        // "12% 90矾土"
    /^\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/,               // "90矾土: 12%"
    /^\s*(\d+(?:\.\d+)?)\s*%/,                        // "90矾土 12%"
  ];
  for (const pattern of patterns.slice(0, 2)) {
    const match = before.match(pattern);
    if (match) return { ratio: Number(match[1]), consumed: [start - match[0].length, start] };
  }
  for (const pattern of patterns.slice(2)) {
    const match = after.match(pattern);
    if (match) return { ratio: Number(match[1]), consumed: [end, end + match[0].length] };
  }
  return { ratio: null, consumed: null };
}

/** 片段 → 候选名 token：去掉"12%""12 %"这类比值，保留名字里的数字（90矾土 的 90 不能丢）。 */
function segmentToken(segment) {
  return normalizeText(segment)
    .replace(/\d+(?:\.\d+)?\s*%/g, ' ')
    .replace(/[，,、;；:：()（）\s]+/g, ' ')
    .trim();
}

/**
 * 片段级包含匹配：用户常写简写（"90矾土"），而原料表里是"倒焰90矾土"。
 * 只有当片段在原料表里**唯一**命中时才采纳，避免把近义原料张冠李戴；
 * 命中不到就留给模型兜底（模型有上下文，能解释取舍）。
 */
function matchByContainment(segments, materials, alreadyMatched) {
  const items = [];
  for (const segment of segments) {
    const token = segmentToken(segment);
    if (token.length < 2) continue;
    const hits = materials.filter((material) => {
      if (alreadyMatched.has(material.materialId)) return false;
      const name = material.name;
      return name.includes(token) || token.includes(name);
    });
    if (hits.length !== 1) continue;
    const material = hits[0];
    const ratioMatch = normalizeText(segment).match(/(\d+(?:\.\d+)?)\s*%/);
    items.push({
      materialId: material.materialId,
      name: material.name,
      ratioPct: ratioMatch ? Number(ratioMatch[1]) : null,
      source: 'rule',
    });
    alreadyMatched.add(material.materialId);
  }
  return items;
}

/** 规则解析：返回 { items, matchedSpans, leftover }。 */
function encodeByRules(text, materials) {
  const names = materials.map((m) => m.name).sort((a, b) => b.length - a.length);
  const items = [];
  const spans = [];
  for (const name of names) {
    let from = 0;
    while (from <= text.length) {
      const at = text.indexOf(name, from);
      if (at < 0) break;
      const end = at + name.length;
      const overlaps = spans.some(([s, e]) => at < e && end > s);
      if (!overlaps) {
        const material = materials.find((m) => m.name === name);
        const { ratio, consumed } = ratioNear(text, at, end);
        items.push({
          materialId: material.materialId,
          name,
          ratioPct: ratio,
          source: 'rule',
        });
        spans.push([at, end]);
        if (consumed) spans.push(consumed);
      }
      from = end;
    }
  }
  // 显式代号："代号 61" / "#61"
  const codePattern = /(?:代号|编码|code)\s*[:：]?\s*(\d+)|#(\d+)/gi;
  let match;
  while ((match = codePattern.exec(text)) !== null) {
    const code = match[1] || match[2];
    const material = materials.find((m) => m.materialId === String(code));
    if (material && !items.some((item) => item.materialId === material.materialId)) {
      items.push({ materialId: material.materialId, name: material.name, ratioPct: null, source: 'rule' });
      spans.push([match.index, match.index + match[0].length]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const leftover = [];
  let cursor = 0;
  for (const [start, end] of spans) {
    if (start > cursor) leftover.push(text.slice(cursor, start));
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) leftover.push(text.slice(cursor));
  const rest = leftover.join(' ').replace(/[，,、;；:：\s]+/g, ' ').trim();
  return { items, leftover: rest };
}

/** 先精确匹配，再对剩余片段做一次唯一的包含匹配（减少不必要的模型调用）。 */
function resolveByRules(text, materials) {
  const exact = encodeByRules(text, materials);
  if (!exact.leftover) return exact;
  const alreadyMatched = new Set(exact.items.map((item) => item.materialId));
  const segments = exact.leftover.split(/[，,、;；\n]+/).map((part) => part.trim()).filter(Boolean);
  const extra = matchByContainment(segments, materials, alreadyMatched);
  if (!extra.length) return exact;
  const restUnmatched = segments.filter((segment) => {
    const token = segmentToken(segment);
    if (token.length < 2) return false;
    return !materials.some((material) => extra.some((item) => item.materialId === material.materialId)
      && (material.name.includes(token) || token.includes(material.name)));
  });
  return {
    items: [...exact.items, ...extra],
    leftover: restUnmatched.join(' ').replace(/[，,、;；:：\s]+/g, ' ').trim(),
  };
}

/** LLM 兜底：只让模型在真实材料表里挑名字，返回必须能被校验通过。 */
async function encodeByLlm(text, materials, provider) {
  const catalogue = materials.map((m) => `${m.name}`).join('、');
  const messages = [
    {
      role: 'system',
      content: [
        '你是耐火材料配方录入助手。把用户的自然语言配方解析成结构化条目。',
        `只能使用下列原料名（不得改写、不得创造）：${catalogue}`,
        '只输出 JSON，格式：{"items":[{"name":"原料名","ratio_pct":数字或null}],"reasoning":"一句话说明如何理解原文"}',
        'ratio_pct 只能来自原文显式给出的百分比；没写就填 null。不要输出解释性文字。',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ];
  const reply = await provider.chat({ messages, temperature: 0 });
  const raw = String(reply?.content || '');
  const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let parsed = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { items: [], reasoning: raw.trim().slice(0, 400) };
  }
  const items = [];
  for (const entry of Array.isArray(parsed?.items) ? parsed.items : []) {
    const name = String(entry?.name || '').trim();
    const material = materials.find((m) => m.name === name);
    if (!material) continue;      // 模型幻觉出来的名字直接丢
    const ratio = Number(entry?.ratio_pct);
    items.push({
      materialId: material.materialId,
      name: material.name,
      ratioPct: Number.isFinite(ratio) ? ratio : null,
      source: 'llm',
    });
  }
  return { items, reasoning: String(parsed?.reasoning || reply?.reasoning || '').trim() || raw.trim().slice(0, 400) };
}

/**
 * @param {string} rawText 用户输入的自然语言配方
 * @param {{useLlm?: boolean, provider?: object, fetchImpl?: Function}} [options]
 * @returns {Promise<{items:Array, unmatched:string, reasoning:string, method:string}>}
 */
async function encodeRecipe(rawText, options = {}) {
  const text = normalizeText(rawText);
  if (!text) throw new Error('请输入要解析的配方描述');
  const materials = await loadMaterials(options.fetchImpl || fetch);

  const ruled = resolveByRules(text, materials);
  const items = [...ruled.items];
  let reasoning = ruled.items.length
    ? `规则匹配到 ${ruled.items.length} 种原料` + (ruled.leftover ? `，剩下“${ruled.leftover}”交给模型理解。` : '。')
    : '';
  let method = 'rule';

  const useLlm = options.useLlm !== false;
  let unmatched = ruled.leftover;
  if (useLlm && unmatched) {
    const provider = options.provider || createProvider();
    if (provider.available) {
      const llm = await encodeByLlm(unmatched, materials, provider);
      const fresh = llm.items.filter((item) => !items.some((kept) => kept.materialId === item.materialId));
      items.push(...fresh);
      // method 反映"这一轮是怎么得出结果的"：咨询过模型就如实标注，哪怕模型也没认出原料
      method = ruled.items.length ? 'rule+llm' : 'llm';
      if (llm.reasoning) reasoning = [reasoning, llm.reasoning].filter(Boolean).join(' ');
      if (fresh.length) unmatched = '';
    } else {
      reasoning = [reasoning, '模型未配置（缺少 LLM_API_URL / LLM_API_KEY），仅做了规则匹配。'].filter(Boolean).join(' ');
    }
  }

  return { items, unmatched, reasoning, method };
}

module.exports = { encodeRecipe, loadMaterials, clearMaterialsCache, normalizeText, encodeByRules, resolveByRules };
