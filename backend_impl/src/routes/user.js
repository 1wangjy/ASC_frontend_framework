const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');

// 身份验证中间件
router.use(UserController.authenticateAdmin);

// 获取用户列表
router.get('/users', UserController.getUsers);

// 添加用户
router.post('/users', UserController.addUser);

// 更新用户
router.put('/users/:id', UserController.updateUser);

// 删除用户
router.delete('/users/:id', UserController.deleteUser);



// 生成密码
router.post('/generate-password', UserController.generatePassword);

module.exports = router;