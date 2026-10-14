const path = require('path');
const bcrypt = require('bcrypt');
const database = require('../config/database');
const userService = require('../services/userService');

class AuthController {
  static async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  /**
   * 登录：状态判定（待审批/已拒绝/已禁用）+ 连续失败锁定，均走 userService。
   * 失败响应带 error_code，便于前端区分展示。
   */
  static async login(req, res) {
    try {
      const { username, password } = req.body || {};
      const result = await userService.authenticate({ username, password });
      if (!result.ok) {
        const httpStatus = {
          MISSING_CREDENTIALS: 400,
          USER_NOT_FOUND: 401,
          BAD_PASSWORD: 401,
          PENDING_APPROVAL: 403,
          REJECTED: 403,
          DISABLED: 403,
          LOCKED: 429,
        }[result.code] || 401;
        return res.status(httpStatus).json({
          code: httpStatus,
          error_code: result.code,
          message: result.message,
          ...(result.retryAfterMinutes ? { retry_after_minutes: result.retryAfterMinutes } : {}),
        });
      }

      const user = result.user;
      const { generateToken } = require('../utils/jwt');
      const token = generateToken({ id: user.id, username: user.username, role: user.role });
      res.json({
        code: 200,
        message: '登录成功',
        data: { token, user },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ code: 500, message: '登录失败，请稍后重试' });
    }
  }

  /** 注册：邮箱必填；注册成功后为 pending，需管理员审批 */
  static async register(req, res) {
    try {
      const { username, email, password, real_name: realName } = req.body || {};
      const result = await userService.register({ username, email, password, realName });
      if (!result.ok) {
        return res.status(400).json({ code: 400, error_code: result.code, message: result.message });
      }
      res.json({
        code: 200,
        message: result.message,
        data: { user: result.user, status: result.user?.status || 'pending' },
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ code: 500, message: '注册失败，请稍后重试' });
    }
  }

  /** 当前登录用户（用于前端刷新状态：被禁用/被拒后立即生效） */
  static async me(req, res) {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { verifyToken } = require('../utils/jwt');
      const decoded = token ? verifyToken(token) : null;
      if (!decoded) return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
      const user = await userService.findById(decoded.id);
      if (!user) return res.status(401).json({ code: 401, message: '账号不存在或已删除' });
      if (user.status !== 'approved') {
        return res.status(403).json({ code: 403, error_code: 'ACCOUNT_INACTIVE', message: `账号状态：${userService.STATUS_LABEL[user.status] || user.status}` });
      }
      res.json({ code: 200, data: { user: userService.safeUser(user) } });
    } catch (error) {
      console.error('Me error:', error);
      res.status(500).json({ code: 500, message: '获取当前用户失败' });
    }
  }

  static async logout(req, res) {
    res.json({
      code: 200,
      message: '退出登录成功'
    });
  }
}

module.exports = AuthController;