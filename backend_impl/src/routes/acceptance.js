'use strict';

/**
 * 验收测试路由（独立挂载在 /api/acceptance，不影响其它路由）。
 *
 *   GET  /api/acceptance/checks      验收项与检查清单（声明式）
 *   POST /api/acceptance/run/:id     运行单条检查 → JSON
 *   POST /api/acceptance/run         批量运行 → SSE（event: check / done / error）
 */

const express = require('express');
const controller = require('../controllers/acceptanceController');

const router = express.Router();

router.get('/checks', controller.listChecks);
router.post('/run/:id', controller.runOne);
router.post('/run', controller.runAll);

module.exports = router;
