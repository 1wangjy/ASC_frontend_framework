const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');

router.post('/register', AuthController.register);   // 邮箱注册 → pending，待管理员审批
router.post('/login', AuthController.login);
router.get('/me', AuthController.me);                // 刷新当前用户状态（含被禁用/被拒）
router.post('/logout', AuthController.logout);

module.exports = router;
