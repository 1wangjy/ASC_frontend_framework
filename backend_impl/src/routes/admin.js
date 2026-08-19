const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// 获取数据库路径
router.get('/database-paths', adminController.getDatabasePaths);

// 获取表格数据
router.get('/data/:table', adminController.getTableData);

// 添加数据
router.post('/data/:table', adminController.addData);

// 更新数据
router.put('/data/:table/:id', adminController.updateData);

// 删除数据
router.delete('/data/:table/:id', adminController.deleteData);

module.exports = router;
