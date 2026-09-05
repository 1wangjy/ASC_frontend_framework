const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Model1 性能预测服务 (GET /api/model1/materials · POST /api/model1/predict)
 *
 * Spawns backend_impl/python/recipe_predict_bridge.py with the request JSON on
 * stdin and resolves with the parsed payload. Mirrors the spawn-python pattern
 * used by model2OptimizationService / batchRecipeController / model4Controller
 * (PYTHON_CMD || 'python3') and the timeout/output-guard pattern of
 * pdfMetadataExtractorService.
 *
 * The bridge is deterministic single-shot: cold-loading the recipe_opt
 * predictor pipeline takes ~7s, so a request needs a generous timeout; the
 * /materials action only reads the map file and returns in <1s.
 */

const DEFAULT_TIMEOUT_MS = 120000; // predictor cold-load (~7s) + predict
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;
const BRIDGE_SCRIPT = path.join(__dirname, '../../python/recipe_predict_bridge.py');

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function predictionError(message, code = 'MODEL1_PREDICTION_FAILED') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function runBridge({ payload, timeoutMs }) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BRIDGE_SCRIPT)) {
      reject(predictionError(`未找到性能预测脚本: ${BRIDGE_SCRIPT}`));
      return;
    }

    const command = process.env.PYTHON_CMD || 'python3';
    const child = spawn(command, [BRIDGE_SCRIPT], {
      env: process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const appendOutput = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        throw predictionError('性能预测脚本输出过大');
      }
      return next;
    };

    child.stdout.on('data', (chunk) => {
      try {
        stdout = appendOutput(stdout, chunk);
      } catch (error) {
        finish(() => reject(error));
      }
    });

    child.stderr.on('data', (chunk) => {
      try {
        stderr = appendOutput(stderr, chunk);
      } catch (error) {
        finish(() => reject(error));
      }
    });

    child.once('error', (error) => {
      finish(() => reject(
        predictionError(
          `无法启动性能预测脚本 (${command}): ${error.message}`,
          'MODEL1_PREDICTION_START_FAILED',
        ),
      ));
    });

    child.once('close', (exitCode) => {
      finish(() => {
        let result;
        try {
          result = JSON.parse(stdout.trim());
        } catch {
          reject(predictionError(stderr.trim() || '性能预测脚本未返回有效 JSON'));
          return;
        }
        if (exitCode !== 0 || result?.ok !== true) {
          reject(predictionError(
            result?.message || result?.error || stderr.trim() || `性能预测脚本退出码: ${exitCode}`,
          ));
          return;
        }
        resolve(result);
      });
    });

    child.stdin.on('error', (error) => {
      finish(() => reject(predictionError(`无法写入性能预测脚本: ${error.message}`)));
    });

    // 发送请求后关闭 stdin，等待脚本输出
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();

    timer = setTimeout(() => {
      child.kill();
      finish(() => reject(predictionError('性能预测超时', 'MODEL1_PREDICTION_TIMEOUT')));
    }, timeoutMs);
  });
}

function timeoutFor() {
  return parsePositiveNumber(process.env.MODEL1_PREDICT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

/**
 * 列出预测器的 96 原料空间 (GET /api/model1/materials)。
 * @returns {Promise<object>} { ok, source, count, materials: [{name,index}] }
 */
async function listMaterials() {
  return runBridge({ payload: { action: 'list_materials' }, timeoutMs: timeoutFor() });
}

/**
 * 对一份配方执行一次确定性性能预测 (POST /api/model1/predict)。
 * @param {object} recipe - { <material_name>: <percent 0..100>, ... }
 * @returns {Promise<object>} { ok, source, predicted, used, unused,
 *   normalization, property_names, material_count }
 */
async function predictRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    throw predictionError('缺少配方参数: recipe 必须是 {<原料名>: <百分比>} 对象');
  }
  const percentEntries = Object.entries(recipe).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!percentEntries.length) {
    throw predictionError('配方为空: 请至少添加一种原料及其百分比');
  }
  return runBridge({ payload: { action: 'predict', recipe }, timeoutMs: timeoutFor() });
}

module.exports = { listMaterials, predictRecipe };
