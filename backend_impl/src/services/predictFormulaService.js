/**
 * 从业务表配方直接预测：`POST /api/predict/from-formula`
 *
 * 流程：解析组件（base_name / material_id）→ 取 material_id 与配比 → 组装模型侧短行 X_comp
 * （[[material_id, ratio_pct], …]，由模型补齐 48 列）+ X_global → 调预测服务 `/api/v1/predict/simple`
 * → 返回预测结果 + 覆盖报告（未覆盖原料 = one-hot 全 0）+ 解析明细 + 告警。
 *
 * 设计：模型调用通过 `deps.callPredict` 注入（默认走 HTTP），测试可用 stub 确定性验证。
 */
const axios = require('axios');
const materialBase = require('./materialBaseService');
const vocab = require('./vocabService');

const PREDICT_BASE_URL = (process.env.PREDICT_BASE_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
const GLOBAL_FIELDS = ['water_amount', 'hardening_time', 'hardening_time_uncertainty'];
// 模型服务的默认变体（model_predict API/app.py 的 DEFAULT_VARIANT）；与环境保持一致，可用 env 覆盖
const DEFAULT_VARIANT = process.env.PREDICT_DEFAULT_VARIANT || 'yangquan';

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 默认模型调用：POST /api/v1/predict/simple */
async function callPredict(payload) {
  const response = await axios.post(`${PREDICT_BASE_URL}/api/v1/predict/simple`, payload, {
    timeout: 120000, validateStatus: () => true,
  });
  return { status: response.status, body: response.data };
}

/** 解析单个组件 → {raw, material_id, base_id, base_name, ratio_pct, via} */
async function resolveComponent(component, { db } = {}) {
  const ratio = toNumberOrNull(component && (component.ratio_pct ?? component.ratio));
  const baseName = component && (component.base_name ?? component.name ?? component.raw);
  const givenId = component && (component.material_id ?? component.materialId);
  const raw = String(baseName || givenId || '').trim();

  if (baseName) {
    const resolved = await materialBase.resolveMaterialBase(String(baseName), { db });
    if (resolved.resolved) {
      return { raw, ratio_pct: ratio, material_id: resolved.base.material_id, base_id: resolved.base.base_id, base_name: resolved.base.base_name, via: resolved.via, unresolved: false };
    }
    return { raw, ratio_pct: ratio, material_id: givenId ? String(givenId) : '', base_id: '', base_name: String(baseName), via: 'none', unresolved: true, suggestions: resolved.suggestions, suggestedRules: resolved.suggestedRules };
  }
  if (givenId !== undefined && givenId !== null && String(givenId) !== '') {
    const byId = (await materialBase.listBases({})).find((b) => String(b.material_id) === String(givenId));
    return {
      raw, ratio_pct: ratio, material_id: String(givenId),
      base_id: byId ? byId.base_id : '', base_name: byId ? byId.base_name : '',
      via: byId ? 'material_id' : 'material_id-unregistered', unresolved: false,
      unregistered: !byId,
    };
  }
  return { raw, ratio_pct: ratio, material_id: '', base_id: '', base_name: '', via: 'none', unresolved: true, suggestions: [], suggestedRules: [] };
}

/**
 * @param {object} input {mr_id?, components?, globals?, conditions?, properties?, variant?}
 * @param {object} deps  {callPredict?, db?}
 */
async function predictFromFormula(input = {}, deps = {}) {
  const call = deps.callPredict || callPredict;
  const db = deps.db;
  const warnings = [];

  const components = Array.isArray(input.components) ? input.components : [];
  if (!components.length) {
    const error = new Error('components 不能为空（或提供 mr_id 由调用方展开为 components）');
    error.code = 'COMPONENTS_REQUIRED';
    error.status = 400;
    throw error;
  }

  const resolved = [];
  for (const component of components) resolved.push(await resolveComponent(component, { db }));

  const unresolved = resolved.filter((r) => r.unresolved);
  if (unresolved.length) {
    const first = unresolved[0];
    const error = new Error(`原料未映射到规范 base：${unresolved.map((u) => u.raw).join('、')}`);
    error.code = 'UNRESOLVED_BASE';
    error.status = 400;
    error.payload = {
      unresolved: unresolved.map((u) => ({ raw: u.raw, suggestions: u.suggestions || [], suggestedRules: u.suggestedRules || [] })),
      raw: first.raw,
      suggestions: first.suggestions || [],
      ruleTemplate: (first.suggestedRules || [])[0] || null,
    };
    throw error;
  }

  const withoutVocabId = resolved.filter((r) => !r.material_id);
  if (withoutVocabId.length) {
    warnings.push({
      code: 'MATERIAL_WITHOUT_ID',
      message: `以下原料缺少模型 material_id（无法落到 one-hot 位）：${withoutVocabId.map((r) => r.raw).join('、')}`,
      materials: withoutVocabId.map((r) => r.raw),
    });
  }
  const unregistered = resolved.filter((r) => r.unregistered);
  if (unregistered.length) {
    warnings.push({
      code: 'MATERIAL_NOT_IN_REGISTRY',
      message: `以下 material_id 不在注册表中：${unregistered.map((r) => r.material_id).join('、')}`,
      materials: unregistered.map((r) => r.material_id),
    });
  }

  const ratioSum = resolved.reduce((sum, r) => sum + (r.ratio_pct || 0), 0);
  if (resolved.some((r) => r.ratio_pct === null) || Math.abs(ratioSum - 100) > 0.1) {
    warnings.push({ code: 'RATIO_NOT_100', message: `配比合计为 ${Number(ratioSum.toFixed(2))}，建议为 100 ± 0.1`, ratioSum: Number(ratioSum.toFixed(2)) });
  }

  const globals = input.globals || {};
  const xGlobal = GLOBAL_FIELDS.map((field) => toNumberOrNull(globals[field]));
  if (xGlobal.every((v) => v === null)) {
    warnings.push({ code: 'GLOBALS_MISSING', message: '未提供 X_global（加水量/硬化时间/不确定性），模型将按缺省处理' });
  }

  // 变体：显式传入 > 模型默认变体；默认变体覆盖不足时自动切到覆盖更好的变体并告警
  const materialIds = resolved.map((r) => r.material_id);
  const coverageReport = await vocab.coverageReport({ variant: input.variant, materialIds, defaultVariant: DEFAULT_VARIANT });
  let variant = coverageReport.variant;
  // 词表覆盖与指标质量是两个维度：自动切换会换掉整套权重（例如 base/processed 的 bulk_density 量纲异常），
  // 因此默认只「告警 + 建议」，只有显式 auto_switch_variant: true 才切换。
  if (!input.variant && coverageReport.recommendedVariant) {
    if (input.auto_switch_variant === true) {
      variant = coverageReport.recommendedVariant;
      warnings.push({
        code: 'VARIANT_SWITCHED',
        message: `默认变体 ${coverageReport.variant} 对当前原料覆盖不足（未覆盖 ${coverageReport.coverage?.unknown?.length ?? 0} 种），已按请求切换为 ${variant}；切换会改变模型权重，请核对指标`,
      });
    } else {
      warnings.push({
        code: 'VARIANT_RECOMMENDED',
        message: `默认变体 ${coverageReport.variant} 未覆盖 ${coverageReport.coverage?.unknown?.length ?? 0} 种原料，变体 ${coverageReport.recommendedVariant} 覆盖更好；如切换请显式传 auto_switch_variant: true 或 variant 并核对指标`,
        recommendedVariant: coverageReport.recommendedVariant,
      });
    }
  }
  if (coverageReport.coverage && coverageReport.coverage.unknown.length) {
    warnings.push({
      code: 'MATERIAL_NOT_IN_VOCAB',
      message: `以下 material_id 不在变体 ${coverageReport.variant} 的 one-hot 词表中（该位恒为 0）：${coverageReport.coverage.unknown.join('、')}`,
      materials: coverageReport.coverage.unknown,
      recommendedVariant: coverageReport.recommendedVariant,
      evaluatedVariant: coverageReport.variant,
    });
  }
  // 覆盖报告描述“最终使用的变体”
  const finalCoverage = variant === coverageReport.variant
    ? coverageReport.coverage
    : await vocab.coverageFor(variant, materialIds);

  const payload = {
    X_comp: resolved.map((r) => [r.material_id, r.ratio_pct]),
    X_global: xGlobal,
    ...(input.conditions ? { conditions: input.conditions } : {}),
    ...(input.properties ? { properties: input.properties } : {}),
    ...(variant ? { variant } : {}),
  };

  const upstream = await call(payload);
  if (upstream.status !== 200) {
    const error = new Error(`预测模型服务返回 ${upstream.status}`);
    error.code = 'PREDICT_UPSTREAM_ERROR';
    error.status = 502;
    error.payload = { upstream: upstream.body };
    throw error;
  }

  return {
    variant,
    request: payload,
    components: resolved.map((r) => ({
      raw: r.raw, material_id: r.material_id, base_id: r.base_id, base_name: r.base_name, ratio_pct: r.ratio_pct, via: r.via,
    })),
    predictions: upstream.body.predictions || [],
    modelWarnings: upstream.body.warnings || [],
    coverage: finalCoverage,
    coverageByVariant: coverageReport.perVariant,
    recommendedVariant: coverageReport.recommendedVariant,
    warnings,
    mr_id: input.mr_id || null,
  };
}

/** 由 mr_formula 行展开为 components（业务表 → 预测输入）。 */
async function componentsFromMr(mrRow) {
  const list = typeof mrRow.component_list === 'string' ? JSON.parse(mrRow.component_list || '[]') : (mrRow.component_list || []);
  return list.map((tuple) => {
    const [name, refId, meta] = tuple;
    const parsed = materialBase.parseComponentMeta(meta);
    return {
      raw: name,
      ratio_pct: tuple[3],
      ...(parsed.material_id ? { material_id: parsed.material_id } : {}),
      base_name: parsed.base_name || name,
      ref: refId,
    };
  });
}

module.exports = { predictFromFormula, componentsFromMr, resolveComponent, callPredict, PREDICT_BASE_URL, DEFAULT_VARIANT };
