const jwt = require('jsonwebtoken');

// 生成 JWT token
function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role
  };
  
  // 使用环境变量或默认密钥
  const secretKey = process.env.JWT_SECRET || 'your-secret-key';
  const options = {
    expiresIn: '24h' // token 有效期 24 小时
  };
  
  return jwt.sign(payload, secretKey, options);
}

// 验证 JWT token
function verifyToken(token) {
  try {
    const secretKey = process.env.JWT_SECRET || 'your-secret-key';
    return jwt.verify(token, secretKey);
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken
};