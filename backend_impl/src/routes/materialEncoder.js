/**
 * 材料编码：自然语言配方 → 材料代号 + 百分比。
 *
 *   POST /api/material-encoder/encode   { text, useLlm? } ->
 *     { code:200, data:{ items:[{materialId,name,ratioPct,source}], unmatched, reasoning, method } }
 *
 * 独立于 /api/model1（旧占位预测，已废弃）与 /api/v1（对 Python 预测服务的透传代理），
 * 这是 Node 侧新增的解析能力，不属于任何既有 API 的版本语义。
 */
const express = require('express');
const router = express.Router();
const materialEncoderService = require('../services/materialEncoderService');

router.post('/encode', async (req, res) => {
  try {
    const text = req.body?.text;
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ code: 400, message: '请提供 text（自然语言配方）' });
      return;
    }
    const useLlm = req.body?.useLlm !== false;
    const data = await materialEncoderService.encodeRecipe(text, { useLlm });
    res.json({ code: 200, data });
  } catch (error) {
    console.error('Error encoding materials:', error);
    res.status(500).json({ code: 500, message: error.message || '配方解析失败' });
  }
});

module.exports = router;
