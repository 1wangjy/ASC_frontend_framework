const express = require('express');
const router = express.Router();
const embeddingController = require('../controllers/embeddingController');

// 上传embedding文件
router.post('/upload', embeddingController.uploadFile, embeddingController.handleFileUpload);

// 向量搜索
router.post('/search', embeddingController.searchVectors);

module.exports = router;
