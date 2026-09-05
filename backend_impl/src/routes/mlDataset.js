const express = require('express');
const router = express.Router();
const database = require('../config/database');

// 只读暴露统一 ML 预测数据集（表 ml_formula / ml_formula_component）。
// 汇总：各来源样本数 + 组分总数 + PC 特征数等。
router.get('/summary', async (req, res) => {
  try {
    const formulas = await database.query('SELECT COUNT(*) AS n FROM ml_formula');
    const comps = await database.query('SELECT COUNT(*) AS n FROM ml_formula_component');
    const bySource = await database.query(
      'SELECT dataset_source, COUNT(*) AS n FROM ml_formula GROUP BY dataset_source'
    );
    const yValid = await database.query(
      "SELECT COUNT(*) AS n FROM ml_formula WHERE json_valid(y_labels) AND length(y_labels) > 2"
    );
    res.json({
      code: 200,
      data: {
        formulas: formulas[0]?.n || 0,
        components: comps[0]?.n || 0,
        bySource,
        yLabelsValid: yValid[0]?.n || 0,
      },
    });
  } catch (e) {
    console.error('ml-dataset summary error:', e.message);
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 配方列表（可选 source/limit/offset）。不展开组分特征(数据大)，返回行含 n_components/x_global/y_labels。
router.get('/formulas', async (req, res) => {
  try {
    const source = req.query.source;
    const limit = Math.min(Number(req.query.limit) || 50, 2000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const where = source ? 'WHERE dataset_source = ?' : '';
    const params = source ? [source, limit, offset] : [limit, offset];
    const rows = await database.query(
      `SELECT id, dataset_source, recipe_id, n_components, x_global_names,
              x_global, y_labels, remark, create_time
         FROM ml_formula ${where}
        ORDER BY dataset_source, recipe_id
        LIMIT ? OFFSET ?`, params);
    res.json({ code: 200, data: rows });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 某配方下的组分特征行。
router.get('/components', async (req, res) => {
  try {
    const { source, recipe_id: recipeId } = req.query;
    if (!source || !recipeId) return res.status(400).json({ code: 400, message: 'source & recipe_id required' });
    const rows = await database.query(
      `SELECT comp_index, material_id, ratio_pct, component_features
         FROM ml_formula_component
        WHERE dataset_source = ? AND recipe_id = ?
        ORDER BY comp_index`, [source, recipeId]);
    res.json({ code: 200, data: rows });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});


// 数据集元数据（每源 feature 名/sample 数/version）。
router.get('/meta', async (req, res) => {
  try {
    const rows = await database.query(
      'SELECT dataset_source, sample_count, total_component_count, comp_feature_names, global_feature_names, y_feature_keys, dataset_version, ingested_at FROM ml_dataset_meta ORDER BY dataset_source'
    );
    res.json({ code: 200, data: rows });
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

// 特征归一化统计（source + feature 粒度），支持 feature 过滤。供后续训练归一化口径。
router.get('/stats', async (req, res) => {
  try {
    const { feature, source } = req.query;
    let sql = 'SELECT dataset_source, feature_name, feature_kind, count, mean, std, min, max FROM ml_feature_stats';
    const cond = []; const params = [];
    if (source) { cond.push('dataset_source = ?'); params.push(source); }
    if (feature) { cond.push('feature_name = ?'); params.push(feature); }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY dataset_source, feature_kind, feature_name';
    const rows = await database.query(sql, params);
    res.json({ code: 200, data: rows });
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

module.exports = router;

