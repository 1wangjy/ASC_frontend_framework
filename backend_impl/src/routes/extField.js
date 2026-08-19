const express = require('express');
const router = express.Router();
const extFieldController = require('../controllers/extFieldController');

// 添加维度
router.post('/add', extFieldController.addExtField);

// 编辑维度
router.post('/update', extFieldController.updateExtField);

// 删除维度
router.post('/delete', extFieldController.deleteExtField);

// 查询包含扩展字段的数据
router.post('/query', extFieldController.queryWithExtFields);

// 获取所有扩展字段的键
router.get('/keys', extFieldController.getExtFieldKeys);

module.exports = router;
