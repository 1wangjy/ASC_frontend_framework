const path = require('path');
const bcrypt = require('bcrypt');
const database = require('../config/database');

class AuthController {
  static async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  /**
   * 从数据库 users 表查询用户（通过 database 抽象层，支持 SQLite 和 MongoDB）
   */
  static async getUserFromDb(username) {
    const rows = await database.query(
      'SELECT id, username, password, role FROM users WHERE username = ? AND is_delete = 0',
      [username]
    );
    return rows[0] || null;
  }

  static async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          code: 400,
          message: '用户名和密码不能为空'
        });
      }

      const user = await AuthController.getUserFromDb(username);

      if (!user) {
        return res.status(401).json({
          code: 401,
          message: '用户名或密码错误'
        });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({
          code: 401,
          message: '用户名或密码错误'
        });
      }

      const { generateToken } = require('../utils/jwt');
      const token = generateToken({ id: user.id, username: user.username, role: user.role });

      res.json({
        code: 200,
        message: '登录成功',
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role
          }
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        code: 500,
        message: '登录失败，请稍后重试'
      });
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