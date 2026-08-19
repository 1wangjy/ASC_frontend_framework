const express = require('express');
const router = express.Router();
const model1Controller = require('../controllers/model1Controller');

// 提交配方信息
router.post('/submit', model1Controller.submitRecipe);

module.exports = router;
