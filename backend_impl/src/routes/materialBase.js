/**
 * 原料 base 注册表与解析规则 API。
 *
 *   GET    /api/material-base                 列表 + 统计
 *   POST   /api/material-base                 新增/更新 base（按 base_name 去重）
 *   PUT    /api/material-base/:baseId         启停 base
 *   GET    /api/material-base/rules           规则列表
 *   POST   /api/material-base/rules           新增规则（建完即可入库）
 *   PUT    /api/material-base/rules/:ruleId   启停规则
 *   DELETE /api/material-base/rules/:ruleId   删除规则
 *   POST   /api/material-base/resolve         解析一个名称（含建议与规则模板）
 *   GET    /api/material-base/export          导出注册表（并刷新 data/material_base_map.json）
 *   POST   /api/material-base/import          从快照导入（默认读磁盘文件，也可传 {snapshot}）
 *
 * 统一响应：{ code, message?, data }；失败 { code: 4xx, message, code? }
 */
const express = require('express');
const router = express.Router();
const svc = require('../services/materialBaseService');

function fail(res, status, message, extra = {}) {
  return res.status(status).json({ code: status, message, ...extra });
}

function ok(res, data, message) {
  return res.json({ code: 200, message, data });
}

router.get('/', async (req, res) => {
  try {
    const [bases, stats] = await Promise.all([
      svc.listBases({ keyword: req.query.keyword || '', enabled: req.query.enabled === undefined ? null : req.query.enabled !== 'false' }),
      svc.stats(),
    ]);
    return ok(res, { bases, stats });
  } catch (error) {
    return fail(res, 500, error.message);
  }
});

router.post('/', async (req, res) => {
  try {
    const { base_name, material_id, aliases, category } = req.body || {};
    const result = await svc.upsertBase({ base_name, material_id, aliases, category });
    return ok(res, result, result.created ? 'base 已创建' : 'base 已更新');
  } catch (error) {
    return fail(res, error.code === 'BASE_NAME_REQUIRED' ? 400 : 500, error.message);
  }
});

router.put('/:baseId', async (req, res) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') return fail(res, 400, 'enabled(boolean) is required');
    const base = await svc.setBaseEnabled(req.params.baseId, enabled);
    if (!base) return fail(res, 404, `unknown base_id: ${req.params.baseId}`);
    return ok(res, base);
  } catch (error) {
    return fail(res, 500, error.message);
  }
});

router.get('/rules', async (req, res) => {
  try {
    return ok(res, { rules: await svc.listRules() });
  } catch (error) {
    return fail(res, 500, error.message);
  }
});

router.post('/rules', async (req, res) => {
  try {
    const { kind, pattern, target_base_id, priority, note } = req.body || {};
    const rule = await svc.addRule({ kind, pattern, target_base_id, priority, note });
    return ok(res, rule, '规则已创建');
  } catch (error) {
    const bad = ['RULE_KIND_INVALID', 'RULE_PATTERN_REQUIRED', 'RULE_TARGET_UNKNOWN'].includes(error.code);
    return fail(res, bad ? 400 : 500, error.message);
  }
});

router.put('/rules/:ruleId', async (req, res) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') return fail(res, 400, 'enabled(boolean) is required');
    const rule = await svc.setRuleEnabled(req.params.ruleId, enabled);
    if (!rule) return fail(res, 404, `unknown rule_id: ${req.params.ruleId}`);
    return ok(res, rule);
  } catch (error) {
    return fail(res, 500, error.message);
  }
});

router.delete('/rules/:ruleId', async (req, res) => {
  try {
    const removed = await svc.removeRule(req.params.ruleId);
    if (!removed) return fail(res, 404, `unknown rule_id: ${req.params.ruleId}`);
    return ok(res, { rule_id: req.params.ruleId });
  } catch (error) {
    return fail(res, 500, error.message);
  }
});

router.post('/resolve', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) return fail(res, 400, 'name is required');
    return ok(res, await svc.resolveMaterialBase(name));
  } catch (error) {
    return fail(res, 500, error.message);
  }
});

router.get('/export', async (req, res) => {
  try {
    return ok(res, await svc.exportJson());
  } catch (error) {
    return fail(res, 500, error.message);
  }
});

router.post('/import', async (req, res) => {
  try {
    const snapshot = req.body && req.body.snapshot;
    if (snapshot && Array.isArray(snapshot.bases)) {
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const tmp = path.join(os.tmpdir(), `material-base-import-${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(snapshot), 'utf8');
      const result = await svc.bootstrapFromJson({ filePath: tmp });
      fs.rmSync(tmp, { force: true });
      return ok(res, result, '导入完成');
    }
    return ok(res, await svc.bootstrapFromJson(), '导入完成（磁盘快照）');
  } catch (error) {
    return fail(res, 500, error.message);
  }
});

module.exports = router;
