'use strict';

/**
 * 增强版智能解析原型（独立探索，迁移目标：materialEncoderService / recipe_processor）。
 *
 * 相对现有实现的增量（每项都对应一处已确认缺口）：
 *  1. 粒径/规格解析：目数(mesh)、mm、μm、cm、D50/D90、区间(5-3mm)、上下界(≤0.075/-0.075/3mm以下)、级配多段。
 *  2. base 名 → baseid：精确 → 别名 → 注册表规则 → 规格剥离后匹配 → 唯一包含 → 代号(代号61/#61)；
 *     多命中不猜，返回 candidates 供人工/LLM 裁决。
 *  3. 规格剥离：把 "325目棕刚玉"、"棕刚玉细粉" 拆成 {base 名, 粒径, 类别}，避免规格污染名称匹配。
 *  4. 配比归一化：% 直接采用；"份" 按总和归一化为百分比；混用/总和异常时给出诊断。
 *  5. 输出「规范组分」= 直接可转 X_comp 的字段集（material_id / ratio_pct / particle_size_min / particle_size_max / base）。
 */

const fs = require('fs');
const path = require('path');
const U = require('./units');

const REGISTRY_PATH = path.resolve(__dirname, '../../../data/material_base_map.json');
const MATERIAL_MAP_PATH = path.resolve(__dirname, '../../..', 'backend_impl/python/model_predict/FEATURE/outputs/material_map.json');

/** 全角→半角、统一空白/破折号/乘号、去零宽字符。 */
function normalizeText(value) {
  return String(value ?? '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/[–—―﹣－]/g, '-')
    .replace(/[×✕⨯]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 名称归一化：用于同名判定（大小写、下划线/空格、全角、`α-` 前缀写法差异）。 */
function normalizeName(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_·・]/g, '')
    .replace(/[（）()]/g, '')
    .replace(/^α-?/, 'alpha')
    .replace(/^γ-?/, 'gamma');
}

/** 规格/类别词：出现在名称里时剥离，不参与名称匹配。 */
const CLASS_WORDS = ['超微粉', '微粉', '细粉', '粉末', '粉体', '粉料', '细料', '骨料', '颗粒', '粒料', '粗粒', '骨材', '粉'];
const CLASS_MAP = { 超微粉: 'micro', 微粉: 'micro', 细粉: 'fine', 粉末: 'fine', 粉体: 'fine', 粉料: 'fine', 细料: 'fine', 骨料: 'aggregate', 颗粒: 'aggregate', 粒料: 'aggregate', 粗粒: 'aggregate', 骨材: 'aggregate', 粉: 'powder' };

/**
 * 从一段文本中剥离规格（粒径 + 类别词），返回核心名与规格信息。
 */
function decomposeSegment(segment) {
  const text = normalizeText(segment);
  const sizes = U.parseParticleSizeList(text);
  const primary = sizes.length ? { ...sizes[0] } : null;
  let core = text;
  for (const size of sizes) {
    core = core.replace(size.raw, ' ');
  }
  // 去百分比与配比词
  core = core.replace(/\d+(?:\.\d+)?\s*%/g, ' ').replace(/\d+(?:\.\d+)?\s*(?:份|重量份|phr)/g, ' ');
  let className = null;
  for (const word of CLASS_WORDS) {
    if (core.includes(word)) {
      core = core.replace(new RegExp(word, 'g'), ' ');
      className = className || CLASS_MAP[word] || null;
      break;
    }
  }
  core = core.replace(/[，,、;；:：()（）【】\[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
  return { raw: text, core, sizes, primarySize: primary, className };
}

/** 配比：仅识别 % 与「份/phr」；名字里的数字（90矾土）不算配比。 */
function parseRatio(segment) {
  const text = normalizeText(segment);
  const pct = text.match(/(?:占比|配比|比例|含量)?\s*(\d+(?:\.\d+)?)\s*%/);
  if (pct) return { ratioPct: Number(pct[1]), unit: 'percent', raw: pct[0].trim() };
  const parts = text.match(/(\d+(?:\.\d+)?)\s*(?:份|重量份|phr)/);
  if (parts) return { ratioPct: null, ratioParts: Number(parts[1]), unit: 'parts', raw: parts[0].trim() };
  return { ratioPct: null, unit: null, raw: null };
}

class BaseRegistry {
  constructor(registry, materialMap) {
    const bases = (registry?.bases || []).filter((item) => item && item.enabled !== false);
    this.bases = bases.length ? bases : (materialMap?.materials || []).map((item) => ({
      base_id: `BASE_${String(Number(item.material_id) + 1).padStart(6, '0')}`,
      base_name: item.name,
      material_id: String(item.material_id),
      aliases: [],
    }));
    this.rules = (registry?.rules || [])
      .filter((rule) => rule && rule.enabled !== false)
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || String(a.rule_id).localeCompare(String(b.rule_id)));
    this.byBaseId = new Map(this.bases.map((item) => [item.base_id, item]));
    this.vocab = new Set();
    for (const base of this.bases) {
      this.vocab.add(base.base_name);
      (base.aliases || []).forEach((alias) => this.vocab.add(alias));
    }
    for (const rule of this.rules) this.vocab.add(rule.pattern);
    this.byNorm = new Map();
    for (const base of this.bases) {
      for (const name of [base.base_name, ...(base.aliases || [])]) {
        const key = normalizeName(name);
        if (!this.byNorm.has(key)) this.byNorm.set(key, []);
        this.byNorm.get(key).push({ base, via: name === base.base_name ? 'exact' : 'alias' });
      }
    }
  }

  static load(options = {}) {
    const registryPath = options.registryPath || REGISTRY_PATH;
    const materialMapPath = options.materialMapPath || MATERIAL_MAP_PATH;
    const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, 'utf8')) : null;
    const materialMap = fs.existsSync(materialMapPath) ? JSON.parse(fs.readFileSync(materialMapPath, 'utf8')) : null;
    if (!registry && !materialMap) throw new Error('缺少 material_base_map.json 与 material_map.json，无法解析 base');
    return new BaseRegistry(registry, materialMap);
  }

  /** 名称 → base（含匹配过程与置信度）。多命中不猜测，返回 candidates。 */
  resolve(rawName) {
    const name = normalizeText(rawName);
    const decomposed = decomposeSegment(name);
    const attempts = [];
    const tryKeys = [name, decomposed.core].filter(Boolean);

    for (const key of tryKeys) {
      const normalized = normalizeName(key);
      const hits = this.byNorm.get(normalized);
      if (hits && hits.length === 1) {
        return this.#hit(hits[0], normalized === normalizeName(name) ? hits[0].via : 'normalized', decomposed);
      }
    }

    // 注册表规则：kind ∈ exact / alias / normalize / regex / keyword，按 priority 升序取首个命中
    const ruleHits = [];
    for (const rule of this.rules) {
      const pattern = normalizeText(rule.pattern);
      if (!pattern) continue;
      const kind = String(rule.kind || 'alias').toLowerCase();
      let hit = false;
      if (kind === 'exact') hit = name === pattern;
      else if (kind === 'regex') {
        try { hit = new RegExp(rule.pattern).test(name); } catch { hit = false; }
      } else if (kind === 'keyword') hit = name.includes(pattern) || normalizeName(name).includes(normalizeName(pattern));
      else hit = name.includes(pattern) || normalizeName(name) === normalizeName(pattern);  // alias / normalize
      if (hit) {
        const base = this.byBaseId.get(rule.target_base_id);
        if (base) ruleHits.push({ base, via: `rule:${kind}`, priority: rule.priority ?? 100, pattern, ruleId: rule.rule_id });
      }
    }
    if (ruleHits.length === 1) return this.#hit(ruleHits[0], ruleHits[0].via, decomposed);
    if (ruleHits.length > 1) {
      const best = ruleHits[0];
      // 优先级最高的唯一命中可直接采纳；同级多命中才交给人工
      const sameRank = ruleHits.filter((item) => (item.priority ?? 100) === (best.priority ?? 100));
      if (sameRank.length === 1) return this.#hit(best, best.via, decomposed);
    }

    // 唯一包含匹配（双向），名称越长越优先
    const containment = [];
    const ranked = [...this.bases].sort((a, b) => b.base_name.length - a.base_name.length);
    for (const base of ranked) {
      const nn = normalizeName(base.base_name);
      for (const key of tryKeys) {
        const nk = normalizeName(key);
        if (!nk) continue;
        if (nn.includes(nk) || (nk.includes(nn) && nn.length >= 2)) {
          containment.push({ base, via: 'containment' });
          break;
        }
      }
    }
    if (containment.length === 1) return this.#hit(containment[0], 'containment', decomposed);

    // 代号：代号 61 / #61 / material_id=61
    const codeMatch = name.match(/(?:代号|编码|编号|material[_\s]?id|id)\s*[:：=]?\s*(\d+)|#(\d+)/i);
    if (codeMatch) {
      const id = String(codeMatch[1] || codeMatch[2]);
      const base = this.bases.find((item) => String(item.material_id) === id);
      if (base) return { ...this.#hit({ base, via: 'code' }, 'code', decomposed), code: id };
    }

    if (containment.length > 1 || ruleHits.length > 1) {
      const pool = (containment.length > 1 ? containment : ruleHits).map((item) => ({
        baseId: item.base.base_id, name: item.base.base_name, materialId: String(item.base.material_id), via: item.via,
      }));
      return { matched: false, ambiguous: true, candidates: pool, decomposed, attempts };
    }
    return { matched: false, ambiguous: false, candidates: [], decomposed, attempts,
             suggestions: this.suggest(decomposed.core || name) };
  }

  /** 未匹配时的候选建议：字符二元组 Dice 相似度，≥0.2 取前 5（对齐现有 UI 的 suggestions 行为）。 */
  suggest(query, limit = 5) {
    const score = (a, b) => {
      const grams = (value) => {
        const text = normalizeName(value);
        const set = new Set();
        for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2));
        if (!set.size) set.add(text);
        return set;
      };
      const left = grams(a); const right = grams(b);
      let shared = 0;
      for (const gram of left) if (right.has(gram)) shared += 1;
      return (2 * shared) / (left.size + right.size);
    };
    return this.bases
      .map((base) => ({ baseId: base.base_id, name: base.base_name, materialId: String(base.material_id), score: Number(score(query, base.base_name).toFixed(3)) }))
      .filter((item) => item.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  #hit(hit, via, decomposed) {
    return {
      matched: true,
      baseId: hit.base.base_id,
      baseName: hit.base.base_name,
      materialId: String(hit.base.material_id),
      resolvedBy: via,
      decomposed,
    };
  }
}

/** 配比归一化：% 直接用；「份」按总和换算；带诊断。 */
function normalizeRatios(components) {
  const diagnostics = [];
  const withPct = components.filter((item) => Number.isFinite(item.ratioPct));
  const withParts = components.filter((item) => !Number.isFinite(item.ratioPct) && Number.isFinite(item.ratioParts));
  if (withParts.length) {
    const total = withParts.reduce((sum, item) => sum + item.ratioParts, 0);
    if (total > 0) {
      for (const item of withParts) item.ratioPct = Math.round((item.ratioParts / total) * 10000) / 100;
      diagnostics.push({ code: 'PARTS_TO_PERCENT', message: `${withParts.length} 项以「份」给出，按其总和 ${total} 归一化为百分比。` });
    }
  }
  const sum = withPct.reduce((total, item) => total + item.ratioPct, 0) + withParts.reduce((total, item) => total + (item.ratioPct || 0), 0);
  if (withPct.length && Math.abs(sum - 100) > 1) {
    diagnostics.push({ code: 'PERCENT_SUM_UNUSUAL', message: `显式百分比合计 ${Math.round(sum * 100) / 100}%，不等于 100%。` });
  }
  const missing = components.filter((item) => !Number.isFinite(item.ratioPct)).map((item) => item.raw);
  if (missing.length) {
    diagnostics.push({ code: 'RATIO_MISSING', message: `${missing.length} 项未给出配比：${missing.join('、')}。` });
  }
  return diagnostics;
}

/**
 * 行分类（对齐前端 useRecipeParser 的文本约定）：
 *  - `*` 开头 → 测试行（性能实测值，如 `*常温耐压: 45 MPa`）
 *  - 含 `[...]` 且括号内出现 ':' → 属性字典行（组分属性，如 `棕刚玉 [Al2O3:98, d50:12]`）
 *  - 其余 → 组分行
 * 返回 { componentLines, testLines, propertyLines }；每项保留原文与行号。
 */
function classifyLines(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const componentLines = []; const testLines = []; const propertyLines = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^\*/.test(trimmed)) {
      testLines.push({ line: index + 1, raw: trimmed.replace(/^\*+/, '').trim() });
      return;
    }
    const bracket = trimmed.match(/\[([^\]]*)\]/);
    if (bracket && bracket[1].includes(':') ) {
      propertyLines.push({ line: index + 1, raw: trimmed, name: trimmed.slice(0, bracket.index).trim(), properties: bracket[1] });
      return;
    }
    componentLines.push({ line: index + 1, raw: trimmed });
  });
  return { componentLines, testLines, propertyLines };
}

/** 测试行 → { key, value, unit }（数值+单位；无单位则 unit=null）。 */
function parseTestLine(raw) {
  const text = normalizeText(raw);
  const match = text.match(/^([^:：]*)[:：]?\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Z%℃°µμm/·.]*)/);
  if (!match) return { key: text, value: null, unit: null };
  return { key: match[1].trim() || text, value: Number(match[2]), unit: match[3] || null };
}

/**
 * 解析自然语言配方 → { components, tests, properties, unmatched, diagnostics, method }。
 * components 每项即「规范组分」：可直接转 X_comp 行。
 */
function parseRecipeText(text, registry, options = {}) {
  const source = normalizeText(text);
  if (!source) throw new Error('请输入要解析的配方描述');
  const classified = classifyLines(String(text ?? '').replace(/\u3000/g, ' '));
  // 组分行内部再按顿号/逗号切段；测试行与属性行单独输出，不参与组分解析
  const separator = /[，,、;；]+|\s{2,}/;
  const segments = (classified.componentLines.length ? classified.componentLines.map((item) => normalizeText(item.raw)) : [source])
    .flatMap((line) => line.split(separator))
    .map((part) => part.trim())
    .filter(Boolean);

  const components = [];
  const unmatched = [];
  const ambiguous = [];
  const usedMaterialIds = new Set();

  for (const segment of segments) {
    const ratio = parseRatio(segment);
    const resolved = registry.resolve(segment);
    if (resolved.matched) {
      if (usedMaterialIds.has(resolved.materialId)) {
        // 同名多规格：合并配比（同一 base 的不同粒级视为多行，保留粒度）
        const existing = components.find((item) => item.materialId === resolved.materialId && item.raw === segment);
        if (existing) {
          existing.ratioPct = Number.isFinite(ratio.ratioPct) ? ratio.ratioPct : existing.ratioPct;
          continue;
        }
      }
      usedMaterialIds.add(resolved.materialId);
      const size = resolved.decomposed?.primarySize || null;
      components.push({
        raw: segment,
        baseId: resolved.baseId,
        baseName: resolved.baseName,
        materialId: resolved.materialId,
        resolvedBy: resolved.resolvedBy,
        ratioPct: ratio.ratioPct,
        ratioParts: ratio.ratioParts ?? null,
        ratioUnit: ratio.unit,
        particleSize: size ? {
          minMm: size.minMm ?? null,
          maxMm: size.maxMm ?? null,
          representativeMm: size.representativeMm ?? null,
          measurement: size.notation,
          raw: size.raw,
          mesh: size.mesh ?? null,
          unit: size.unit ?? null,
        } : null,
        sizeClass: resolved.decomposed?.className || (size ? size.class : null),
        specText: size ? size.raw : null,
      });
    } else if (resolved.ambiguous) {
      ambiguous.push({ raw: segment, candidates: resolved.candidates, ratioPct: ratio.ratioPct });
    } else {
      unmatched.push({ raw: segment, ratioPct: ratio.ratioPct });
    }
  }

  const tests = classified.testLines.map((item) => ({ line: item.line, ...parseTestLine(item.raw) }));
  const properties = classified.propertyLines.map((item) => ({ line: item.line, name: item.name, properties: item.properties }));
  const diagnostics = normalizeRatios(components);
  if (ambiguous.length) {
    diagnostics.push({ code: 'AMBIGUOUS_BASE', message: `${ambiguous.length} 段名称在多条 base 间歧义，需人工确认。` });
  }
  if (unmatched.length) {
    diagnostics.push({ code: 'UNMATCHED_SEGMENT', message: `${unmatched.length} 段未匹配到 base：${unmatched.map((item) => item.raw).join('、')}。` });
  }
  return {
    components,
    tests,
    properties,
    ambiguous,
    unmatched,
    diagnostics,
    method: 'rule',
    summary: {
      components: components.length,
      withParticleSize: components.filter((item) => item.particleSize).length,
      ratioCoverage: components.length ? Number((components.filter((item) => Number.isFinite(item.ratioPct)).length / components.length).toFixed(3)) : 0,
    },
  };
}

/**
 * 规范组分 → X_comp 行（列序同 metadata_yangquan.json 的 component_feature_names）。
 * 仅能由配方文本推导的列会被填值；实测列（PC/化学/物性）留 null 并登记 missing。
 */
function toXComp(components, componentFeatureNames) {
  const names = componentFeatureNames || ['material_id', 'ratio_pct', 'particle_size_min', 'particle_size_max', 'base'];
  const derived = new Set(['material_id', 'ratio_pct', 'particle_size_min', 'particle_size_max', 'base']);
  const rows = [];
  for (const item of components) {
    const mapping = {
      material_id: item.materialId === null || item.materialId === undefined ? null : Number(item.materialId),
      ratio_pct: Number.isFinite(item.ratioPct) ? item.ratioPct : null,
      particle_size_min: item.particleSize ? item.particleSize.minMm : null,
      particle_size_max: item.particleSize ? item.particleSize.maxMm : null,
      base: item.baseName,
    };
    rows.push(names.map((name) => (derived.has(name) ? (mapping[name] ?? null) : null)));
  }
  const missing = names.filter((name) => !derived.has(name));
  return { rows, derivableColumns: [...derived].filter((name) => names.includes(name)), missingColumns: missing,
           coverage: Number(((names.length - missing.length) / names.length).toFixed(3)) };
}

/** 组装 X_global（water_amount, hardening_time, hardening_time_uncertainty）。 */
function toXGlobal(globalFields) {
  const names = ['water_amount', 'hardening_time', 'hardening_time_uncertainty'];
  return names.map((name) => (globalFields && Number.isFinite(Number(globalFields[name])) ? Number(globalFields[name]) : null));
}

module.exports = { BaseRegistry, normalizeText, normalizeName, decomposeSegment, parseRatio, normalizeRatios, parseRecipeText, toXComp, toXGlobal, classifyLines, parseTestLine, CLASS_WORDS, CLASS_MAP };
