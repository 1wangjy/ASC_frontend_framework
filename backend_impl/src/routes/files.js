'use strict';

/**
 * 统一文件管理路由（挂载于 `/api/files`）。
 * 注意：DOI 形如 `10.1002/srin.201800383`（含 `/`），因此按 DOI 的路由用正则捕获整段。
 */

const express = require('express');
const multer = require('multer');
const controller = require('../controllers/filesController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
});

const router = express.Router();

function withDoi(handler) {
  return (req, res, next) => {
    const raw = req.params[0] || '';
    try {
      req.params.doi = decodeURIComponent(raw);
    } catch {
      req.params.doi = raw;
    }
    return handler(req, res, next);
  };
}

router.get('/health', controller.health);
router.get('/stats', controller.stats);
router.post('/upload', upload.single('file'), controller.upload);

// DOI 相关（正则路由，允许 DOI 内含 '/'）
router.get(/^\/by-doi\/(.+)\/stream$/, withDoi(controller.byDoiStream));
router.get(/^\/by-doi\/(.+)$/, withDoi(controller.byDoi));

router.get('/by-lit/:litId', controller.byLitId);
router.get('/:fileId/meta', controller.meta);
router.get('/:fileId/stream', controller.stream);
router.patch('/:fileId/visibility', controller.setVisibility);
router.delete('/:fileId', controller.remove);

module.exports = router;
