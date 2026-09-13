'use strict';

/**
 * predict — call the local prediction model service through its STANDARD API.
 *
 * Transport is HTTP only: POST {PREDICT_BASE_URL}/api/v1/predict/simple.
 * The tool never touches model files, joblib artifacts or datasets — swapping
 * the model behind that service changes nothing here.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:8100';
const TIMEOUT_MS = Number(process.env.AGENT_PREDICT_TIMEOUT_MS || 180000);

function predictBaseUrl() {
  const raw = String(process.env.PREDICT_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return raw;
}

function simplePredictUrl() {
  const base = predictBaseUrl();
  return /\/api\/v1$/.test(base) ? `${base}/predict/simple` : `${base}/api/v1/predict/simple`;
}

const parameters = {
  type: 'object',
  properties: {
    X_comp: {
      type: 'array',
      items: { type: 'array', items: { type: 'number' } },
      description:
        '组分矩阵，每行一条组分记录。最短形式为 [material_id, ratio_pct]，例如 [[61,70],[42,30]]；'
        + '也接受完整 51 列特征行（缺失列由模型服务自动补齐）。',
    },
    X_global: {
      type: 'array',
      items: { type: 'number' },
      description: '全局工艺参数 [water_amount, hardening_time, hardening_time_uncertainty]，例如 [3.6, 10, 0]。',
    },
    conditions: {
      type: 'array',
      items: { type: 'string' },
      description: '温度工况，例如 ["110℃","1500℃"]；不传则返回全部已训练工况。',
    },
    properties: {
      type: 'array',
      items: { type: 'string' },
      description:
        '目标属性，可选 bulk_density(体积密度,g/cm3) / cold_modulus(常温抗折,MPa) / '
        + 'crushing_strength(耐压,MPa) / linear_change(线变化率,%)；不传则返回全部。',
    },
  },
  required: ['X_comp'],
  additionalProperties: false,
};

function validate(rawArgs) {
  const args = rawArgs || {};
  const Xcomp = args.X_comp;
  if (!Array.isArray(Xcomp) || Xcomp.length === 0 || Xcomp.length > 64) {
    throw new Error('predict: X_comp must be a non-empty array (max 64 rows)');
  }
  Xcomp.forEach((row, i) => {
    if (!Array.isArray(row) || row.length < 2 || row.length > 51) {
      throw new Error(`predict: X_comp[${i}] must be an array of 2..51 numbers`);
    }
    if (row.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error(`predict: X_comp[${i}] contains a non-finite value`);
    }
  });

  const body = { X_comp: Xcomp };
  if (args.X_global !== undefined) {
    if (!Array.isArray(args.X_global) || args.X_global.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error('predict: X_global must be an array of finite numbers');
    }
    body.X_global = args.X_global;
  }
  if (args.conditions !== undefined) {
    if (!Array.isArray(args.conditions) || args.conditions.some((v) => typeof v !== 'string')) {
      throw new Error('predict: conditions must be an array of strings');
    }
    body.conditions = args.conditions.slice(0, 8);
  }
  if (args.properties !== undefined) {
    if (!Array.isArray(args.properties) || args.properties.some((v) => typeof v !== 'string')) {
      throw new Error('predict: properties must be an array of strings');
    }
    body.properties = args.properties.slice(0, 8);
  }
  return body;
}

function summarizePredictions(predictions) {
  if (!Array.isArray(predictions) || predictions.length === 0) return 'no predictions returned';
  return predictions
    .slice(0, 8)
    .map((p) => `${p.property_name_zh || p.property}@${p.condition ?? 'n/a'} = ${p.value}${p.unit ? ` ${p.unit}` : ''}`)
    .join('; ');
}

async function execute(rawArgs, ctx) {
  const body = validate(rawArgs);
  const url = simplePredictUrl();
  const signal = ctx && ctx.signal
    ? AbortSignal.any([ctx.signal, AbortSignal.timeout(TIMEOUT_MS)])
    : AbortSignal.timeout(TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    const reason = error && error.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS}ms` : error.message;
    return { ok: false, summary: `predict: model service unreachable at ${url} (${reason})`, data: { url } };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      summary: `predict: model service returned HTTP ${response.status}`,
      data: { url, status: response.status, body: text.slice(0, 800) },
    };
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, summary: 'predict: model service returned non-JSON', data: { url, body: text.slice(0, 800) } };
  }

  const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
  return {
    ok: true,
    summary: summarizePredictions(predictions),
    data: payload,
  };
}

module.exports = {
  name: 'predict',
  description:
    '调用本地配方性能预测模型（标准 API /api/v1/predict/simple），根据组分矩阵 X_comp、'
    + '可选的全局参数 X_global 与温度工况 conditions 返回真实预测值（如体积密度 bulk_density）。'
    + '需要数值预测时使用本工具，不要凭空推算。',
  parameters,
  validate,
  execute,
};
