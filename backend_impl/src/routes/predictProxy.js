const express = require('express');
const axios = require('axios');

const router = express.Router();

// 预测模型服务基址（example 推理服务的内嵌实例，uvicorn）。
const PREDICT_BASE_URL = (process.env.PREDICT_BASE_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');

/**
 * 透明反向代理：把 /api/v1/* 原样转发到预测模型服务。
 * 目的：对外 API 与 example 项目完全一致且稳定；以后仅替换模型文件/服务地址，
 * API/数据格式不变（PREDICT_BASE_URL 可配置）。
 */
router.all('/*', async (req, res) => {
  const sub = req.originalUrl.replace(/^\/api\/v1/, '');
  const url = `${PREDICT_BASE_URL}/api/v1${sub}`;
  try {
    const headers = { 'content-type': req.headers['content-type'] || 'application/json' };
    if (req.headers['x-api-key']) headers['x-api-key'] = req.headers['x-api-key'];

    const upstream = await axios({
      url,
      method: req.method,
      headers,
      data: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      params: req.query,
      timeout: 120000,
      validateStatus: () => true,
      responseType: 'arraybuffer',
    });

    res.status(upstream.status);
    const ct = upstream.headers['content-type'];
    if (ct) res.setHeader('content-type', ct);
    res.send(Buffer.from(upstream.data));
  } catch (error) {
    console.error('predict proxy error:', error.message);
    res.status(502).json({
      code: 502,
      message: '预测模型服务不可用',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
      base: PREDICT_BASE_URL,
    });
  }
});

module.exports = router;
