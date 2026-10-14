'use strict';

/**
 * 用户管理控制器（多用户：管理员 CRUD + 注册审批 + 自助改密）。
 *
 * 存储统一在 SQLite `users` 表（经 `services/userService`）。
 * 鉴权：
 *   authenticateAdmin —— 仅管理员（`/api/user/*` 的默认门槛）
 *   authenticateUser  —— 任意已通过审批的登录用户（用于自助改密 / me）
 */

const { verifyToken } = require('../utils/jwt');
const userService = require('../services/userService');

function readToken(req) {
  return (req.headers.authorization || '').replace('Bearer ', '').trim();
}

function authenticateAdmin(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ code: 401, message: '未提供认证令牌' });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ code: 401, message: '令牌无效或已过期' });
  if (decoded.role !== 'admin') return res.status(403).json({ code: 403, message: '权限不足：需要管理员' });
  req.user = decoded;
  return next();
}

async function authenticateUser(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ code: 401, message: '未提供认证令牌' });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ code: 401, message: '令牌无效或已过期' });
  const account = await userService.findById(decoded.id);
  if (!account) return res.status(401).json({ code: 401, message: '账号不存在或已删除' });
  if (account.status !== userService.STATUS.APPROVED) {
    return res.status(403).json({
      code: 403, error_code: 'ACCOUNT_INACTIVE',
      message: `账号状态：${userService.STATUS_LABEL[account.status] || account.status}`,
    });
  }
  req.user = { id: account.id, username: account.username, role: account.role };
  return next();
}

class UserController {
  static authenticateAdmin(req, res, next) { return authenticateAdmin(req, res, next); }
  static authenticateUser(req, res, next) { return authenticateUser(req, res, next); }

  /** GET /api/user/users?status=&keyword=&page=&pageSize= */
  static async getUsers(req, res) {
    try {
      const { status = '', keyword = '', page = 1, pageSize = 50 } = req.query || {};
      const data = await userService.listUsers({ status, keyword, page, pageSize });
      res.json({ code: 200, data });
    } catch (error) {
      console.error('getUsers error:', error);
      res.status(500).json({ code: 500, message: '获取用户列表失败' });
    }
  }

  /** GET /api/user/users/stats —— 各状态计数（供管理页徽章） */
  static async getUserStats(req, res) {
    try {
      res.json({ code: 200, data: { counts: await userService.counts(), max_login_fails: userService.MAX_LOGIN_FAILS, lock_minutes: userService.LOCK_MINUTES } });
    } catch (error) {
      console.error('getUserStats error:', error);
      res.status(500).json({ code: 500, message: '获取用户统计失败' });
    }
  }

  /** POST /api/user/users —— 管理员直接创建（默认 approved） */
  static async addUser(req, res) {
    try {
      const { username, password, role = 'user', email = '', real_name: realName = '', status = 'approved' } = req.body || {};
      const created = await userService.register({ username, email: email || `${String(username || '').trim()}@local`, password, realName });
      if (!created.ok) {
        return res.status(400).json({ code: 400, error_code: created.code, message: created.message });
      }
      const id = created.user.id;
      if (role === 'admin') await userService.setRole(id, 'admin', req.user.username);
      if (status === 'approved') await userService.approve(id, req.user.username, '管理员创建');
      res.json({ code: 200, message: '用户已创建', data: { user: await userService.safeUser(await userService.findById(id)) } });
    } catch (error) {
      console.error('addUser error:', error);
      res.status(500).json({ code: 500, message: '创建用户失败' });
    }
  }

  /** PUT /api/user/users/:id —— 改资料 / 角色 / 状态 */
  static async updateUser(req, res) {
    try {
      const id = Number(req.params.id);
      const { role, status, email, real_name: realName } = req.body || {};
      if (email !== undefined && email !== '') {
        const error = userService.validateEmail(email);
        if (error) return res.status(400).json({ code: 400, error_code: 'INVALID_EMAIL', message: error });
      }
      if (role !== undefined) {
        const result = await userService.setRole(id, role, req.user.username);
        if (!result.ok) return res.status(400).json({ code: 400, error_code: result.code, message: result.message });
      }
      if (status !== undefined) {
        const result = await userService.setStatus(id, String(status).toLowerCase(), req.user.username);
        if (!result.ok) return res.status(400).json({ code: 400, error_code: result.code, message: result.message });
      }
      if (email !== undefined || realName !== undefined) {
        const account = await userService.findById(id);
        if (!account) return res.status(404).json({ code: 404, message: '用户不存在' });
        await require('../config/database').execute(
          'UPDATE users SET email = ?, real_name = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?',
          [email !== undefined ? userService.normalizeEmail(email) : account.email,
           realName !== undefined ? String(realName) : account.real_name, id],
        );
      }
      res.json({ code: 200, message: '用户已更新', data: { user: userService.safeUser(await userService.findById(id)) } });
    } catch (error) {
      console.error('updateUser error:', error);
      res.status(500).json({ code: 500, message: '更新用户失败' });
    }
  }

  /** POST /api/user/users/:id/approve */
  static async approveUser(req, res) {
    try {
      const result = await userService.approve(Number(req.params.id), req.user.username, req.body?.note || '');
      res.status(result.ok ? 200 : 400).json({ code: result.ok ? 200 : 400, error_code: result.code, message: result.message, data: { user: result.user } });
    } catch (error) {
      console.error('approveUser error:', error);
      res.status(500).json({ code: 500, message: '审批失败' });
    }
  }

  /** POST /api/user/users/:id/reject */
  static async rejectUser(req, res) {
    try {
      const result = await userService.reject(Number(req.params.id), req.user.username, req.body?.note || '');
      res.status(result.ok ? 200 : 400).json({ code: result.ok ? 200 : 400, error_code: result.code, message: result.message, data: { user: result.user } });
    } catch (error) {
      console.error('rejectUser error:', error);
      res.status(500).json({ code: 500, message: '拒绝失败' });
    }
  }

  /** POST /api/user/users/:id/reset-password —— 管理员重置（password 可省略则自动生成） */
  static async resetPassword(req, res) {
    try {
      const id = Number(req.params.id);
      let password = String(req.body?.password || '');
      if (!password) password = UserController.generatePasswordValue({ length: 12, includeUppercase: true, includeLowercase: true, includeNumbers: true, includeSymbols: false });
      const result = await userService.setPassword(id, password);
      if (!result.ok) return res.status(400).json({ code: 400, error_code: result.code, message: result.message });
      res.json({ code: 200, message: '密码已重置', data: { password } });
    } catch (error) {
      console.error('resetPassword error:', error);
      res.status(500).json({ code: 500, message: '重置密码失败' });
    }
  }

  /** POST /api/user/password/change —— 自助改密（任意已登录用户） */
  static async changePassword(req, res) {
    try {
      const { old_password: oldPassword, new_password: newPassword } = req.body || {};
      const result = await userService.changeOwnPassword(req.user.id, oldPassword, newPassword);
      res.status(result.ok ? 200 : 400).json({ code: result.ok ? 200 : 400, error_code: result.code, message: result.message });
    } catch (error) {
      console.error('changePassword error:', error);
      res.status(500).json({ code: 500, message: '修改密码失败' });
    }
  }

  /** GET /api/user/me —— 当前登录用户（含状态与角色） */
  static async me(req, res) {
    try {
      res.json({ code: 200, data: { user: userService.safeUser(await userService.findById(req.user.id)) } });
    } catch (error) {
      console.error('me error:', error);
      res.status(500).json({ code: 500, message: '获取当前用户失败' });
    }
  }

  /** DELETE /api/user/users/:id —— 软删除 */
  static async deleteUser(req, res) {
    try {
      const result = await userService.softDelete(Number(req.params.id), req.user);
      res.status(result.ok ? 200 : 400).json({ code: result.ok ? 200 : 400, error_code: result.code, message: result.message });
    } catch (error) {
      console.error('deleteUser error:', error);
      res.status(500).json({ code: 500, message: '删除用户失败' });
    }
  }

  /** 随机密码（保留原能力：POST /api/user/generate-password） */
  static generatePasswordValue({ length = 12, includeUppercase = true, includeLowercase = true, includeNumbers = true, includeSymbols = false } = {}) {
    let characters = '';
    if (includeUppercase) characters += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeLowercase) characters += 'abcdefghijklmnopqrstuvwxyz';
    if (includeNumbers) characters += '0123456789';
    if (includeSymbols) characters += '!@#$%^&*';
    if (!characters) characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i += 1) password += characters.charAt(Math.floor(Math.random() * characters.length));
    return password;
  }

  static async generatePassword(req, res) {
    try {
      const { length = 12, includeUppercase = true, includeLowercase = true, includeNumbers = true, includeSymbols = false } = req.body || {};
      res.json({ code: 200, data: { password: UserController.generatePasswordValue({ length: Number(length) || 12, includeUppercase, includeLowercase, includeNumbers, includeSymbols }) } });
    } catch (error) {
      res.status(500).json({ code: 500, message: '生成密码失败' });
    }
  }
}

module.exports = UserController;
