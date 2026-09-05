const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Model2 配方优化服务 (POST /api/model2/optimize)
 *
 * Spawns backend_impl/python/recipe_opt_bridge.py with the request JSON on
 * stdin and resolves with the parsed `data` contract object. Mirrors the
 * spawn-python pattern used by batchRecipeController / model4Controller
 * (PYTHON_CMD || 'python3') and the timeout/output-guard pattern of
 * pdfMetadataExtractorService.
 */

const DEFAULT_TIMEOUT_MS = 240000; // predictor cold-load (~6-15s) + optimization
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;
const BRIDGE_SCRIPT = path.join(__dirname, '../../python/recipe_opt_bridge.py');

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optimizationError(message, code = 'MODEL2_OPTIMIZE_FAILED') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function runOptimizer({ payload, command, timeoutMs }) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BRIDGE_SCRIPT)) {
      reject(optimizationError(`未找到配方优化脚本: ${BRIDGE_SCRIPT}`));
      return;
    }

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
        throw optimizationError('配方优化脚本输出过大');
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
        optimizationError(`无法启动配方优化脚本 (${command}): ${error.message}`, 'MODEL2_OPTIMIZE_START_FAILED'),
      ));
    });

    child.once('close', (exitCode) => {
      finish(() => {
        let result;
        try {
          result = JSON.parse(stdout.trim());
        } catch {
          reject(optimizationError(stderr.trim() || '配方优化脚本未返回有效 JSON'));
          return;
        }
        if (exitCode !== 0 || result?.ok !== true) {
          reject(optimizationError(
            result?.message || result?.error || stderr.trim() || `配方优化脚本退出码: ${exitCode}`,
          ));
          return;
        }
        resolve(result);
      });
    });

    child.stdin.on('error', (error) => {
      finish(() => reject(optimizationError(`无法写入配方优化脚本: ${error.message}`)));
    });

    // 发送请求后关闭 stdin，等待脚本输出
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();

    timer = setTimeout(() => {
      child.kill();
      finish(() => reject(optimizationError('配方优化超时', 'MODEL2_OPTIMIZE_TIMEOUT')));
    }, timeoutMs);
  });
}

/**
 * 运行一次配方优化。
 * @param {object} request - { algorithm, budget, targets? }
 * @returns {Promise<object>} data contract: { ok, algorithm, iterations,
 *   best_recipe, best_objective, best_predicted, trace, pareto_front,
 *   hypervolume, target_met }
 */
async function optimizeRecipe(request) {
  if (!request || typeof request !== 'object') {
    throw optimizationError('缺少优化请求参数');
  }
  const command = process.env.PYTHON_CMD || 'python3';
  const timeoutMs = parsePositiveNumber(
    process.env.MODEL2_OPTIMIZE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  return runOptimizer({ payload: request, command, timeoutMs });
}

/**
 * 流式配方优化 (POST /api/model2/optimize/stream)
 *
 * Spawns the same bridge with `stream: true`. Each stdout line is parsed as
 * JSON and dispatched live:
 *   {"type":"progress",...} -> onProgress(msg)
 *   {"type":"result","data":{...}} -> onDone(data)
 * Any process failure / timeout / script error without a result line ->
 * onError(err). Returns a small handle with abort() so the caller can kill
 * the child when the HTTP client disconnects mid-stream.
 *
 * @param {object} options
 * @param {object} options.request - { algorithm, budget, targets? }
 * @param {(msg: object) => void} options.onProgress
 * @param {(data: object) => void} options.onDone
 * @param {(err: Error) => void} options.onError
 * @returns {{ abort: () => void }}
 */
function streamingOptimize({ request, onProgress, onDone, onError }) {
  if (!request || typeof request !== 'object') {
    throw optimizationError('缺少优化请求参数');
  }
  const command = process.env.PYTHON_CMD || 'python3';
  const timeoutMs = parsePositiveNumber(
    process.env.MODEL2_OPTIMIZE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const payload = Object.assign({}, request, { stream: true });

  if (!fs.existsSync(BRIDGE_SCRIPT)) {
    // Defer to the caller's error callback so behaviour matches async failures.
    process.nextTick(() => onError(optimizationError(`未找到配方优化脚本: ${BRIDGE_SCRIPT}`)));
    return { abort() {} };
  }

  const child = spawn(command, [BRIDGE_SCRIPT], {
    env: process.env,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  let stderr = '';
  let settled = false;
  let timer;

  const settle = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
  };
  const fail = (err) => {
    if (settled) return;
    settle();
    try { child.kill(); } catch { /* already gone */ }
    onError(err);
  };

  const handleLine = (line) => {
    const text = line.trim();
    if (!text || settled) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return; // ignore stray/non-JSON stdout noise
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'progress') {
      onProgress(msg);
    } else if (msg.type === 'result') {
      settle();
      try { child.kill(); } catch { /* already exited */ }
      onDone(msg.data);
    }
  };

  child.stdout.on('data', (chunk) => {
    if (settled) return;
    stdoutBuf += chunk.toString('utf8');
    if (Buffer.byteLength(stdoutBuf, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
      fail(optimizationError('配方优化脚本输出过大'));
      return;
    }
    let idx;
    while (!settled && (idx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      handleLine(line);
    }
  });

  child.stderr.on('data', (chunk) => {
    if (settled) return;
    stderr = (stderr + chunk.toString('utf8')).slice(-MAX_PROCESS_OUTPUT_BYTES);
  });

  child.once('error', (error) => {
    fail(optimizationError(
      `无法启动配方优化脚本 (${command}): ${error.message}`,
      'MODEL2_OPTIMIZE_START_FAILED',
    ));
  });

  child.once('close', (exitCode) => {
    if (settled) return;
    settle();
    onError(optimizationError(
      stderr.trim() || `配方优化脚本异常退出 (exit ${exitCode})，未返回结果`,
    ));
  });

  child.stdin.on('error', (error) => {
    fail(optimizationError(`无法写入配方优化脚本: ${error.message}`));
  });

  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();

  timer = setTimeout(() => {
    fail(optimizationError('配方优化超时', 'MODEL2_OPTIMIZE_TIMEOUT'));
  }, timeoutMs);

  return {
    abort() {
      if (settled) return;
      settle();
      try { child.kill(); } catch { /* already gone */ }
    },
  };
}

module.exports = { optimizeRecipe, streamingOptimize };
