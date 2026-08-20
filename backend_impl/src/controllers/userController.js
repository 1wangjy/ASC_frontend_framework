const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

// 身份验证中间件
function authenticateAdmin(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      code: 401,
      message: '未提供认证令牌'
    });
  }
  
  const { verifyToken } = require('../utils/jwt');
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({
      code: 401,
      message: '令牌无效或已过期'
    });
  }
  
  if (decoded.role !== 'admin') {
    return res.status(403).json({
      code: 403,
      message: '权限不足'
    });
  }
  
  req.user = decoded;
  next();
}

class UserController {
  static async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  static getUsersFilePath() {
    return path.resolve('./data/users.json');
  }

  static readUsers() {
    const usersFilePath = UserController.getUsersFilePath();
    try {
      if (fs.existsSync(usersFilePath)) {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        return JSON.parse(data).users || [];
      }
      return [];
    } catch (error) {
      console.error('Error reading users file:', error);
      return [];
    }
  }

  static writeUsers(users) {
    const usersFilePath = UserController.getUsersFilePath();
    try {
      // 确保目录存在
      const dirPath = path.dirname(usersFilePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(usersFilePath, JSON.stringify({ users }, null, 2));
      return true;
    } catch (error) {
      console.error('Error writing users file:', error);
      return false;
    }
  }

  // 身份验证中间件
  static authenticateAdmin(req, res, next) {
    authenticateAdmin(req, res, next);
  }

  static async getUsers(req, res) {
    try {
      const users = UserController.readUsers().filter(user => user.is_delete === 0);
      
      // 只返回需要的字段
      const filteredUsers = users.map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        create_time: user.create_time,
        update_time: user.update_time
      }));

      res.json({
        code: 200,
        message: '获取用户列表成功',
        data: filteredUsers
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        code: 500,
        message: '获取用户列表失败，请稍后重试'
      });
    }
  }

  static async addUser(req, res) {
    try {
      const { username, password, role = 'user' } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          code: 400,
          message: '用户名和密码不能为空'
        });
      }

      const hashedPassword = await UserController.hashPassword(password);
      const users = UserController.readUsers();

      // 检查用户名是否已存在
      const existingUser = users.find(user => user.username === username && user.is_delete === 0);

      if (existingUser) {
        return res.status(400).json({
          code: 400,
          message: '用户名已存在'
        });
      }

      // 生成新用户ID
      const newId = users.length > 0 ? Math.max(...users.map(user => user.id)) + 1 : 1;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

      // 添加用户
      const newUser = {
        id: newId,
        username,
        password: hashedPassword,
        role,
        create_time: now,
        update_time: now,
        is_delete: 0
      };

      users.push(newUser);
      const success = UserController.writeUsers(users);

      if (!success) {
        return res.status(500).json({
          code: 500,
          message: '添加用户失败，请稍后重试'
        });
      }

      res.json({
        code: 200,
        message: '添加用户成功'
      });
    } catch (error) {
      console.error('Add user error:', error);
      res.status(500).json({
        code: 500,
        message: '添加用户失败，请稍后重试'
      });
    }
  }

  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { username, password, role } = req.body;

      if (!id) {
        return res.status(400).json({
          code: 400,
          message: '用户ID不能为空'
        });
      }

      const users = UserController.readUsers();
      const userId = parseInt(id);
      const userIndex = users.findIndex(user => user.id === userId && user.is_delete === 0);

      if (userIndex === -1) {
        return res.status(400).json({
          code: 400,
          message: '用户不存在'
        });
      }

      // 检查新用户名是否已存在
      if (username && username !== users[userIndex].username) {
        const existingUser = users.find(user => user.username === username && user.is_delete === 0);
        if (existingUser) {
          return res.status(400).json({
            code: 400,
            message: '用户名已存在'
          });
        }
        users[userIndex].username = username;
      }

      // 更新密码
      if (password) {
        const hashedPassword = await UserController.hashPassword(password);
        users[userIndex].password = hashedPassword;
      }

      // 更新角色
      if (role) {
        users[userIndex].role = role;
      }

      // 更新时间
      users[userIndex].update_time = new Date().toISOString().replace('T', ' ').substring(0, 19);

      const success = UserController.writeUsers(users);

      if (!success) {
        return res.status(500).json({
          code: 500,
          message: '更新用户失败，请稍后重试'
        });
      }

      res.json({
        code: 200,
        message: '更新用户成功'
      });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        code: 500,
        message: '更新用户失败，请稍后重试'
      });
    }
  }

  static async deleteUser(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          code: 400,
          message: '用户ID不能为空'
        });
      }

      const users = UserController.readUsers();
      const userId = parseInt(id);
      const userIndex = users.findIndex(user => user.id === userId && user.is_delete === 0);

      if (userIndex === -1) {
        return res.status(400).json({
          code: 400,
          message: '用户不存在'
        });
      }

      // 不能删除admin用户
      if (users[userIndex].username === 'admin') {
        return res.status(400).json({
          code: 400,
          message: '不能删除admin用户'
        });
      }

      // 标记为已删除
      users[userIndex].is_delete = 1;
      users[userIndex].update_time = new Date().toISOString().replace('T', ' ').substring(0, 19);

      const success = UserController.writeUsers(users);

      if (!success) {
        return res.status(500).json({
          code: 500,
          message: '删除用户失败，请稍后重试'
        });
      }

      res.json({
        code: 200,
        message: '删除用户成功'
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        code: 500,
        message: '删除用户失败，请稍后重试'
      });
    }
  }



  static async generatePassword(req, res) {
    try {
      const { length = 8, includeUppercase = true, includeLowercase = true, includeNumbers = true, includeSymbols = true } = req.body;

      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const lowercase = 'abcdefghijklmnopqrstuvwxyz';
      const numbers = '0123456789';
      const symbols = '!@#$%^&*()_+[]{}|;:,.<>?';

      let characters = '';
      if (includeUppercase) characters += uppercase;
      if (includeLowercase) characters += lowercase;
      if (includeNumbers) characters += numbers;
      if (includeSymbols) characters += symbols;

      if (characters === '') {
        return res.status(400).json({
          code: 400,
          message: '至少需要选择一种字符类型'
        });
      }

      let password = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        password += characters[randomIndex];
      }

      const hashedPassword = await UserController.hashPassword(password);

      res.json({
        code: 200,
        message: '生成密码成功',
        data: {
          password,
          hashedPassword
        }
      });
    } catch (error) {
      console.error('Generate password error:', error);
      res.status(500).json({
        code: 500,
        message: '生成密码失败，请稍后重试'
      });
    }
  }
}

module.exports = UserController;