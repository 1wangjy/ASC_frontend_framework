'use strict';

/**
 * 物料词表 canonical 访问层。
 *
 * 唯一权威是 `data/material_vocab.json`（由 `backend_impl/scripts/build_material_vocab.py` 以脚本流生成，
 * **不入 SQLite**）。本服务只做三件事：
 *   1. listMaterials()  → canonical 物料（material_id 冻结 0..88），供解析/预测等按名匹配
 *   2. resolveName()    → 名称（含别名/牌号/工艺参数）→ canonical 物料
 *   3. stats()          → 覆盖率与人工队列规模，供 UI 展示
 *
 * 需求/约定见 docs/material-vocabulary-unification-plan.md（S5/S9）。快照缺失时返回空并在 meta 里标注，
 * 由调用方决定回退策略（绝不编造数据）。
 */

const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOT_PATH = path.join(__dirname, '..', '..', '..', 'data', 'material_vocab.json');

let cache = null;          // { loadedAt, snapshot, mtimeMs }
let cacheError = null;

function loadSnapshot() {
  let stat;
  try {
    stat = fs.statSync(SNAPSHOT_PATH);
  } catch (error) {
    cacheError = `未找到词表快照 ${SNAPSHOT_PATH}（先运行 build_material_vocab.py）`;
    return null;
  }
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.snapshot;
  try {
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    cache = { loadedAt: Date.now(), snapshot, mtimeMs: stat.mtimeMs };
    cacheError = null;
    return snapshot;
  } catch (error) {
    cacheError = `词表快照解析失败：${error.message}`;
    return null;
  }
}

/** 与生成器一致的归一化（保持同一实现，避免两侧漂移） */
function normalizeName(value) {
  const GREEK = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta' };
  const CLASS_WORDS = ['超微粉', '微粉', '细粉', '粉料', '粉体', '粉末', '颗粒', '粒料', '骨料', '细料', '粉'];
  let text = String(value ?? '').trim().replace(/\u3000/g, ' ');
  text = text.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).toLowerCase();
  for (const [greek, latin] of Object.entries(GREEK)) text = text.split(greek).join(latin);
  text = text.replace(/(?<![a-z0-9])a[-\u2010-\u2015]?(?=al2o3| alumina)/, 'alpha-');
  text = text.replace(/[（(][^）)]*[）)]/g, '');
  const stripped = CLASS_WORDS.reduce((acc, word) => acc.split(word).join(''), text);
  if (stripped.trim()) text = stripped;
  return text.replace(/[\s_·・\-—－#/]/g, '');
}

/** canonical 物料清单（含别名），按 material_id 升序 */
function listMaterials() {
  const snapshot = loadSnapshot();
  if (!snapshot) return { materials: [], error: cacheError };
  const aliasesByMaterial = new Map();
  for (const alias of snapshot.aliases || []) {
    if (!aliasesByMaterial.has(alias.material_id)) aliasesByMaterial.set(alias.material_id, []);
    aliasesByMaterial.get(alias.material_id).push(alias.alias);
  }
  const materials = (snapshot.materials || [])
    .slice()
    .sort((a, b) => a.material_id - b.material_id)
    .map((item) => ({ ...item, aliases: aliasesByMaterial.get(item.material_id) || [] }));
  return { materials, meta: { version: snapshot.version, generated_at: snapshot.generated_at } };
}

/** 名称 → canonical 物料（精确归一 → 别名键），返回 { material, matchedBy } 或 null */
function resolveName(name) {
  const snapshot = loadSnapshot();
  if (!snapshot) return null;
  const key = normalizeName(name);
  if (!key) return null;
  const base = (snapshot.materials || []).find((item) => normalizeName(item.name) === key);
  if (base) return { material: base, matchedBy: 'base-name' };
  const hit = (snapshot.aliases || []).find((alias) => alias.alias_norm === key);
  if (!hit) return null;
  const material = (snapshot.materials || []).find((item) => item.material_id === hit.material_id);
  return material ? { material, matchedBy: `alias:${hit.source}:${hit.kind}` } : null;
}

/** 覆盖率与队列规模（供 UI/接口汇报） */
function stats() {
  const snapshot = loadSnapshot();
  if (!snapshot) return { error: cacheError };
  return { ...(snapshot.stats || {}), version: snapshot.version, generated_at: snapshot.generated_at };
}

function clearCache() {
  cache = null;
}

module.exports = {
  SNAPSHOT_PATH,
  loadSnapshot,
  normalizeName,
  listMaterials,
  resolveName,
  stats,
  clearCache,
};
