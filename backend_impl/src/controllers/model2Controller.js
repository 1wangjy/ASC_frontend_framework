const database = require('../config/database');
const vectorService = require('../services/vectorService');
const localModelService = require('../services/localModelService');
const model2OptimizationService = require('../services/model2OptimizationService');

const { spawn } = require('node:child_process');
const path = require('node:path');

// 逐成分约束：只允许已定义的三种模式，数值字段必须有限。
// 原料名是否合法由 Python 侧用真实材料表判定（错误信息原样回给前端）。
const INGREDIENT_MODES = new Set(['range', 'fixed', 'disabled', 'interval', 'bounds', 'disable', 'exclude']);

function sanitizeIngredientConstraints(raw) {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const mode = typeof item.mode === 'string' ? item.mode.trim().toLowerCase() : '';
    if (!name || !INGREDIENT_MODES.has(mode)) continue;
    const entry = { name, mode };
    for (const key of ['min', 'max', 'value']) {
      const value = item[key];
      if (typeof value === 'number' && Number.isFinite(value)) entry[key] = value;
    }
    cleaned.push(entry);
  }
  return cleaned.length ? cleaned : undefined;
}

const BRIDGE_SCRIPT = path.join(__dirname, '..', '..', 'python', 'recipe_opt_bridge.py');
let materialsCache = null;

class Model2Controller {
  // 提交测试指标
  async submitTestMetrics(req, res) {
    try {
      const { metrics, loadEmbedding } = req.body;
      
      // 存储测试指标到数据库
      let metricId;
      if (database.dbType === 'sqlite') {
        const result = await database.execute(
          'INSERT INTO test_indicators (recipe_id, value, type) VALUES (?, ?, ?)',
          [null, metrics.value, metrics.type]
        );
        metricId = result.lastID;
      } else if (database.dbType === 'mongodb') {
        const { TestMetric } = require('../models/mongodb');
        const metric = await TestMetric.create({ value: metrics.value, type: metrics.type });
        metricId = metric._id;
      }
      
      // 处理embedding文件加载
      let embeddingData = null;
      if (loadEmbedding) {
        embeddingData = await vectorService.loadEmbeddingFile('./embeddings/environment.emb');
      }
      
      // 与本地配方优化模型通信
      const modelResult = await localModelService.communicateWithModel2({
        metrics,
        embeddingData
      });
      
      res.json({
        code: 200,
        message: 'Test metrics submitted successfully',
        data: {
          metricId,
          loadEmbedding,
          modelResult
        }
      });
    } catch (error) {
      console.error('Error submitting test metrics:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }

  // 配方优化 (POST /api/model2/optimize)
  async optimizeRecipe(req, res) {
    try {
      const { targets, algorithm, budget } = req.body || {};

      const payload = {
        algorithm: (typeof algorithm === 'string' && algorithm) || 'nsga2',
        budget: (typeof budget === 'number' && Number.isFinite(budget) && budget > 0)
          ? Math.round(budget)
          : 60
      };
      if (Array.isArray(targets)) {
        payload.targets = targets;
      }
      const ingredientConstraints = sanitizeIngredientConstraints(req.body?.ingredient_constraints);
      if (ingredientConstraints) {
        payload.ingredient_constraints = ingredientConstraints;
      }

      const data = await model2OptimizationService.optimizeRecipe(payload);

      if (!data || data.ok !== true) {
        res.status(500).json({
          code: 500,
          message: (data && (data.message || data.error)) || '配方优化失败'
        });
        return;
      }

      res.json({ code: 200, data });
    } catch (error) {
      console.error('Error optimizing recipe:', error);
      res.status(500).json({
        code: 500,
        message: error.message || '配方优化失败'
      });
    }
  }

  // 可优化原料清单 (GET /api/model2/materials)
  // 走 recipe_opt_bridge.py --list-materials —— 与优化器共用同一份映射，Node 侧不重复解析路径；
  // 结果在进程内缓存（映射随模型产物更新，需重启后端进程刷新）。
  async listMaterials(req, res) {
    try {
      if (!materialsCache) {
        const command = process.env.PYTHON_CMD || 'python3';
        const output = await new Promise((resolve, reject) => {
          const child = spawn(command, [BRIDGE_SCRIPT, '--list-materials'], { env: process.env });
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', (chunk) => { stdout += chunk; });
          child.stderr.on('data', (chunk) => { stderr += chunk; });
          child.on('error', reject);
          child.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(stderr.trim() || `原料清单获取失败（退出码 ${code}）`));
              return;
            }
            resolve(stdout);
          });
        });
        const parsed = JSON.parse(output);
        materialsCache = Array.isArray(parsed.materials) ? parsed.materials : [];
      }
      res.json({ code: 200, data: { materials: materialsCache } });
    } catch (error) {
      console.error('Error listing model2 materials:', error);
      res.status(500).json({ code: 500, message: error.message || '原料清单获取失败' });
    }
  }

  // 流式配方优化 (POST /api/model2/optimize/stream)
  //
  // SSE-over-POST: the bridge's NDJSON progress lines are re-framed as SSE
  // `data:` events while the search runs; the final result is sent as an
  // `event: done` frame followed by res.end(). Heartbeat comments keep
  // proxies/clients from timing out during predictor cold-load gaps.
  async streamOptimizeRecipe(req, res) {
    const { targets, algorithm, budget } = req.body || {};

    const payload = {
      algorithm: (typeof algorithm === 'string' && algorithm) || 'nsga2',
      budget: (typeof budget === 'number' && Number.isFinite(budget) && budget > 0)
        ? Math.round(budget)
        : 60
    };
    if (Array.isArray(targets)) {
      payload.targets = targets;
    }
    const ingredientConstraints = sanitizeIngredientConstraints(req.body?.ingredient_constraints);
    if (ingredientConstraints) {
      payload.ingredient_constraints = ingredientConstraints;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    let heartbeat = null;
    const stopHeartbeat = () => {
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    };
    const send = (text) => {
      if (!res.writableEnded) {
        try { res.write(text); } catch { /* socket gone */ }
      }
    };
    heartbeat = setInterval(() => {
      try { send(': heartbeat\n\n'); } catch { stopHeartbeat(); }
    }, 5000);

    const cleanupAndEnd = (frame) => {
      stopHeartbeat();
      send(frame);
      try { res.end(); } catch { /* already ended */ }
    };

    let handle = null;
    try {
      handle = model2OptimizationService.streamingOptimize({
        request: payload,
        onProgress: (msg) => {
          if (!res.writableEnded) send(`data: ${JSON.stringify(msg)}\n\n`);
        },
        onDone: (data) => {
          cleanupAndEnd(`event: done\ndata: ${JSON.stringify(data)}\n\n`);
        },
        onError: (error) => {
          console.error('Error streaming recipe optimization:', error && error.message);
          cleanupAndEnd(
            `event: error\ndata: ${JSON.stringify({ message: (error && error.message) || '配方优化失败' })}\n\n`
          );
        }
      });
    } catch (error) {
      cleanupAndEnd(
        `event: error\ndata: ${JSON.stringify({ message: error.message || '配方优化失败' })}\n\n`
      );
      return;
    }

    // Client disconnected mid-stream: stop heartbeats and kill the python child.
    // Note: listen on the *response* — req 'close' on a POST fires as soon as
    // the request body has been consumed, which would kill the stream instantly.
    res.on('close', () => {
      stopHeartbeat();
      if (handle && typeof handle.abort === 'function') {
        handle.abort();
      }
    });
  }
}

module.exports = new Model2Controller();
