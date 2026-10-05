'use strict';

/**
 * 粒径/粒度单位归一化（独立探索版本，迁移目标：backend_impl/src/services/*）。
 *
 * 设计依据（来自 ML 数据集实测）：
 *   _ref/handover/ML/*.npy 的 X_comp 第 3、4 列是 particle_size_min / particle_size_max，
 *   单位 mm，取值是**离散集合**：
 *     min ∈ {0, 0.001, 0.005, 0.025, 0.038, 0.045, 0.075, 0.08, 0.2, 1, 2.5, 3, 5, 8}
 *     max ∈ {0.001, 0.005, 0.025, 0.038, 0.045, 0.075, 0.08, 0.5, 1, 2, 2.5, 3, 5, 8, 15}
 *   其中 0.075 / 0.045 / 0.038 / 0.08 明显来自**筛网目数**（200/325/400/180 目），
 *   5-3mm、8-15mm 则是**级配区间**。因此解析结果需要：
 *     (1) 把各种写法（目/μm/mm/cm/D50/≤≥/区间）折算到 mm；
 *     (2) 优先**吸附到数据集实际取值**，保证与训练分布一致的量纲与量级。
 */

/** 标准筛网：目 → mm（GB/T 6003.1 常用筛孔，含数据集出现的 180/200/325/400 目）。 */
const MESH_TO_MM = {
  3.5: 5.6, 4: 4.75, 5: 4.0, 6: 3.35, 7: 2.8, 8: 2.36, 10: 2.0, 12: 1.7, 14: 1.4,
  16: 1.18, 18: 1.0, 20: 0.85, 24: 0.71, 25: 0.71, 28: 0.6, 30: 0.55, 32: 0.5,
  35: 0.5, 36: 0.5, 40: 0.425, 45: 0.355, 50: 0.3, 60: 0.25, 70: 0.212, 80: 0.18,
  100: 0.15, 120: 0.125, 140: 0.106, 150: 0.1, 160: 0.09, 170: 0.09, 180: 0.08,
  200: 0.075, 230: 0.063, 240: 0.061, 250: 0.063, 270: 0.053, 300: 0.05, 325: 0.045,
  350: 0.045, 400: 0.038, 500: 0.025, 600: 0.023, 625: 0.02, 800: 0.015, 1000: 0.013,
  1250: 0.01, 1500: 0.008, 2000: 0.0065, 2500: 0.005, 3000: 0.005, 4000: 0.0035,
  5000: 0.0026, 6250: 0.002, 8000: 0.0018, 10000: 0.0013, 12500: 0.001,
};

/** 数据集实测取值（mm）：解析结果优先吸附到这些值，避免量纲漂移。 */
const DATASET_MM = [
  0, 0.001, 0.002, 0.005, 0.008, 0.01, 0.013, 0.02, 0.025, 0.038, 0.045, 0.05,
  0.061, 0.063, 0.075, 0.08, 0.09, 0.1, 0.106, 0.125, 0.15, 0.18, 0.2, 0.212,
  0.25, 0.3, 0.355, 0.425, 0.5, 0.6, 0.71, 0.85, 1, 1.18, 1.4, 1.7, 2, 2.36,
  2.5, 2.8, 3, 3.35, 4, 4.75, 5, 5.6, 8, 12, 15,
];

/** 单位别名 → 到 mm 的换算系数；`mesh` 特判（非线性查表）。 */
const UNIT_TO_MM = {
  mm: 1, 毫米: 1, cm: 10, 厘米: 10, dm: 100, m: 1000, 米: 1000,
  um: 0.001, 'µm': 0.001, 'μm': 0.001, 微米: 0.001, nm: 1e-6, 纳米: 1e-6,
  mesh: 1, 目: 1, 目数: 1, 筛目: 1,
};

/** 粒度描述词 → 语义类别（帮助模型/人工理解，也用于缺规格时的兜底）。 */
const CLASS_HINTS = [
  { className: 'micro', re: /(微粉|超微粉|微米级|亚微米)/ },
  { className: 'fine', re: /(细粉|粉料|粉体|粉末|细料)/ },
  { className: 'aggregate', re: /(骨料|颗粒|粒料|粗粒|骨材)/ },
  { className: 'powder', re: /(粉)/ },
];

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** 目 → mm（查表；未列入的用经验式近似，并标注 approx）。 */
function meshToMm(mesh) {
  const value = toNumber(mesh);
  if (value === null || value <= 0) return null;
  if (MESH_TO_MM[value] !== undefined) return { mm: MESH_TO_MM[value], exact: true };
  const keys = Object.keys(MESH_TO_MM).map(Number).sort((a, b) => a - b);
  let nearest = keys[0];
  for (const key of keys) if (Math.abs(key - value) < Math.abs(nearest - value)) nearest = key;
  if (Math.abs(nearest - value) / value <= 0.06) return { mm: MESH_TO_MM[nearest], exact: false, snappedFrom: nearest };
  const approx = 0.15 / value * 200 / 200; // 15μm@100目 → 经验近似：150μm/目数
  const mm = 0.15 / value;
  return { mm, exact: false, approximate: true, fallback: approx };
}

/** 吸附到数据集取值：相对误差 ≤ 2% 或极差 ≤ 0.002mm 视为同一档。 */
function snapToDataset(mm) {
  const value = toNumber(mm);
  if (value === null || value < 0) return null;
  let best = DATASET_MM[0];
  for (const candidate of DATASET_MM) {
    if (Math.abs(candidate - value) < Math.abs(best - value)) best = candidate;
  }
  const tolerance = Math.max(0.0002, best * 0.01);
  return Math.abs(best - value) <= tolerance ? { mm: best, snapped: best !== value } : { mm: value, snapped: false };
}

/** 任意数值+单位 → mm。 */
function toMm(value, unitRaw) {
  const raw = String(unitRaw || 'mm').trim().toLowerCase();
  const unit = UNIT_TO_MM[raw] !== undefined ? raw : (UNIT_TO_MM[raw.replace(/\s+/g, '')] !== undefined ? raw.replace(/\s+/g, '') : null);
  if (!unit) return { mm: null, unit: raw, unknownUnit: true };
  const normalized = UNIT_TO_MM[unit];
  const numeric = toNumber(value);
  if (numeric === null) return { mm: null, unit: raw };
  if (normalized === 1 && (unit === 'mesh' || unit === '目' || unit === '目数' || unit === '筛目')) {
    const result = meshToMm(numeric);
    return { mm: result ? result.mm : null, unit: 'mesh', mesh: numeric, exact: result ? result.exact : false };
  }
  return { mm: numeric * normalized, unit };
}

/**
 * 解析一段粒度文本 → { minMm, maxMm, notation, class, raw, single, unit }。
 * 支持：区间(5-3mm / 5~3 / 3至5)、单值(0.075mm / 200目 / 15μm)、
 *      上下界(≤0.075 / <200目 / ≥1mm / 3mm以下 / 5mm以上 / -0.075mm)、
 *      D值(D50=10μm / D90 20μm)。
 */
function parseParticleSize(text) {
  const source = String(text || '');
  const segment = findSizeSegment(source);
  if (!segment) return null;
  const cls = classify(source);
  return { ...segment, class: cls };
}

/** 从长文本里找出第一个粒度片段（避免 "90矾土" 的 90 被当成粒度）。 */
function findSizeSegment(text) {
  if (!text) return null;
  const clean = text.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ');

  // D 值：D50=10μm / D90:20um / d10 5 μm
  const dMatch = clean.match(/\bD\s*(10|50|90|97)\s*[:：=约]?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|um|µm|μm|微米|nm|纳米)?/i);
  if (dMatch) {
    const converted = toMm(dMatch[2], dMatch[3] || 'um');
    const mm = converted.mm === null ? null : snapToDataset(converted.mm).mm;
    if (mm !== null) {
      return { minMm: null, maxMm: null, representativeMm: mm, notation: `D${dMatch[1]}`, raw: dMatch[0].trim(), unit: converted.unit, dValue: Number(dMatch[1]) };
    }
  }

  const unitPattern = '(mm|毫米|cm|厘米|dm|m|米|um|µm|μm|微米|nm|纳米|mesh|目数|目|筛目)';
  const numPattern = '(\\d+(?:\\.\\d+)?)';

  // 区间优先（避免 "5-3mm" 被裸 "-" 上界规则误读成 "-3mm"）
  const range = clean.match(new RegExp(`${numPattern}\\s*${unitPattern}?\\s*(?:[-~～–—到至]|--)\\s*${numPattern}\\s*${unitPattern}`, 'i'));
  if (range) {
    const [, aRaw, unit1, bRaw, unit2] = range;
    const unitStart = unit1 || unit2;
    const first = toMm(aRaw, unitStart);
    const second = toMm(bRaw, unit2);
    if (first.mm !== null && second.mm !== null) {
      const snappedLo = snapToDataset(Math.min(first.mm, second.mm)).mm;
      const snappedHi = snapToDataset(Math.max(first.mm, second.mm)).mm;
      return { minMm: snappedLo, maxMm: snappedHi, notation: 'range', raw: range[0].trim(), unit: unitStart,
               mesh: (unitStart === 'mesh' || unitStart === '目') ? Number(aRaw) : undefined };
    }
  }

  // 上界：≤0.075mm / <200目 / 不超过 0.075 mm / 3mm 以下 / -0.075mm / 最大粒径 3mm
  const upper = clean.match(new RegExp(`(?:≤|<=|≦|<|不超过|不大于|最大(?:粒径)?|至多|最多|(?<![\\d.])-)\\s*${numPattern}\\s*${unitPattern}`, 'i'))
    || clean.match(new RegExp(`${numPattern}\\s*${unitPattern}\\s*(?:以下|以内|以下者|下述|筛下)`, 'i'));
  if (upper) {
    const converted = toMm(upper[upper.length - 2], upper[upper.length - 1]);
    const snapped = converted.mm === null ? null : snapToDataset(converted.mm);
    // 上界规格（≤X / X以下）下限按数据集惯例取 0（实测 min 唯一值含 0）
    if (snapped) return { minMm: 0, maxMm: snapped.mm, notation: 'upper', raw: upper[0].trim(), unit: converted.unit, mesh: converted.mesh };
  }

  // 下界：≥1mm / >5mm / 3mm 以上 / 最小粒径 1mm
  const lower = clean.match(new RegExp(`(?:≥|>=|≧|>|不小于|最少|最小(?:粒径)?|至少)\\s*${numPattern}\\s*${unitPattern}`, 'i'))
    || clean.match(new RegExp(`${numPattern}\\s*${unitPattern}\\s*(?:以上|起)`, 'i'));
  if (lower) {
    const converted = toMm(lower[lower.length - 2], lower[lower.length - 1]);
    const snapped = converted.mm === null ? null : snapToDataset(converted.mm);
    if (snapped) return { minMm: snapped.mm, maxMm: null, notation: 'lower', raw: lower[0].trim(), unit: converted.unit, mesh: converted.mesh };
  }

  // 单值：0.075mm / 200目 / 15μm（要求带单位，避免误抓 "90矾土"）
  const single = clean.match(new RegExp(`${numPattern}\\s*${unitPattern}`, 'i'));
  if (single) {
    const converted = toMm(single[1], single[2]);
    const snapped = converted.mm === null ? null : snapToDataset(converted.mm);
    if (snapped) return { minMm: snapped.mm, maxMm: snapped.mm, notation: 'single', raw: single[0].trim(), unit: converted.unit, mesh: converted.mesh };
  }
  return null;
}

/** 级配多段：把 "5-3mm、3-1mm、1-0mm" 这类拆成多段（供一条原料声明多个粒级）。 */
function parseParticleSizeList(text) {
  const source = String(text || '');
  const clean = source.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ');
  const unitPattern = '(mm|毫米|cm|厘米|dm|m|米|um|µm|μm|微米|nm|纳米|mesh|目数|目|筛目)';
  const numPattern = '(\\d+(?:\\.\\d+)?)';
  const bound = '(?:≤|<=|≦|<|≥|>=|≧|>|不超过|不大于|不小于|至少|至多|最大(?:粒径)?|最小(?:粒径)?|约|(?<![\\d.])-)?\\s*';
  const tail = '(?:以下|以内|以上|起)?';
  const pattern = new RegExp(`${bound}${numPattern}\\s*${unitPattern}?\\s*(?:[-~～–—到至]|--)\\s*${numPattern}\\s*${unitPattern}${tail}|${bound}${numPattern}\\s*${unitPattern}${tail}`, 'gi');
  const results = [];
  let match;
  while ((match = pattern.exec(clean)) !== null) {
    const segment = parseParticleSize(match[0]);
    if (segment) results.push({ ...segment, raw: match[0].trim(), span: [match.index, match.index + match[0].length] });
  }
  return results;
}

function classify(text) {
  for (const hint of CLASS_HINTS) if (hint.re.test(String(text || ''))) return hint.className;
  return null;
}

module.exports = { MESH_TO_MM, DATASET_MM, UNIT_TO_MM, meshToMm, snapToDataset, toMm, parseParticleSize, parseParticleSizeList, findSizeSegment, classify };
