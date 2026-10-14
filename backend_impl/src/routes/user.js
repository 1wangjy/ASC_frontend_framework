const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');

/**
 * 用户管理（多用户：注册审批 + 管理员 CRUD + 自助改密）。
 *   - 自助接口（任意已登录用户）：/password/change、/me
 *   - 管理员接口（authenticateAdmin）：其余全部
 */

// ── 任意已登录用户 ──
router.post('/password/change', UserController.authenticateUser, UserController.changePassword);
router.get('/me', UserController.authenticateUser, UserController.me);

// ── 以下仅管理员 ──
router.use(UserController.authenticateAdmin);

router.get('/users', UserController.getUsers);                        // 列表（status/keyword/page/pageSize）
router.get('/users/stats', UserController.getUserStats);              // 各状态计数
router.post('/users', UserController.addUser);                        // 管理员创建
router.put('/users/:id', UserController.updateUser);                  // 改资料/角色/状态
router.post('/users/:id/approve', UserController.approveUser);        // 审批通过
router.post('/users/:id/reject', UserController.rejectUser);          // 审批拒绝
router.post('/users/:id/reset-password', UserController.resetPassword); // 重置密码
router.delete('/users/:id', UserController.deleteUser);               // 软删除
router.post('/generate-password', UserController.generatePassword);   // 随机密码

module.exports = router;
