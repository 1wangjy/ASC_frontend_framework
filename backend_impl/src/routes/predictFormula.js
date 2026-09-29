/**
 * 从配方表（或内联组件）直接预测：POST /api/predict/from-formula
 *
 *   { mr_id }                              由 mr_formula 行展开组件
 *   { components: [{base_name|material_id, ratio_pct}], globals?, conditions?, properties?, variant? }
 *
 * 响应：{ code, data: { variant, components, predictions, coverage, warnings, request } }
 */
const express = require('express');
const router = express.Router();
const database = require('../config/database');
const { predictFromFormula, componentsFromMr } = require('../services/predictFormulaService');

router.post('/from-formula', async (req, res) => {
  try {
    const body = req.body || {};
    const input = {
      components: body.components,
      globals: body.globals,
      conditions: body.conditions,
      properties: body.properties,
      variant: body.variant,
      mr_id: body.mr_id || null,
    };

    if (!Array.isArray(input.components) || !input.components.length) {
      if (!body.mr_id) {
        return res.status(400).json({ code: 400, message: '需要 components 或 mr_id' });
      }
      const rows = await database.query('SELECT * FROM mr_formula WHERE mr_id = ? AND is_delete = 0', [body.mr_id]);
      if (!rows.length) return res.status(404).json({ code: 404, message: `未找到配方 ${body.mr_id}` });
      input.components = await componentsFromMr(rows[0]);
      input.mr_id = body.mr_id;
    }

    const data = await predictFromFormula(input);
    return res.json({ code: 200, message: '预测完成', data });
  } catch (error) {
    if (error && (error.code === 'UNRESOLVED_BASE' || error.code === 'COMPONENTS_REQUIRED')) {
      return res.status(error.status || 400).json({ code: error.code, message: error.message, ...(error.payload || {}) });
    }
    if (error && error.code === 'PREDICT_UPSTREAM_ERROR') {
      return res.status(error.status || 502).json({ code: error.code, message: error.message, ...(error.payload || {}) });
    }
    console.error('predict/from-formula error:', error);
    return res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;
