const express = require('express');
const router = express.Router();
const model3Controller = require('../controllers/model3Controller');

// 提交工况指标
router.post('/submit', model3Controller.submitWorkingConditions);

module.exports = router;
