'use strict';

/**
 * MongoDB 可视化管理路由（挂载于 `/api/mongo`）。
 * 只读浏览 + 索引管理 + 聚合统计；不提供任意写文档/删文档。
 */

const express = require('express');
const controller = require('../controllers/mongoAdminController');

const router = express.Router();

router.get('/status', controller.status);
router.get('/collections', controller.collections);
router.post('/find', controller.find);
router.get('/collections/:name/indexes', controller.listIndexes);
router.post('/collections/:name/indexes', controller.createIndex);
router.delete('/collections/:name/indexes/:indexName', controller.dropIndex);
router.post('/aggregate', controller.aggregate);
router.get('/files', controller.files);
router.get('/buckets/:bucket/files', controller.bucketFiles);

module.exports = router;
