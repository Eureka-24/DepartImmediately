/**
 * JWT 认证中间件
 * 从 Authorization header 提取并验证 JWT token
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('./errorHandler');

/**
 * JWT 认证中间件
 * 验证请求头中的 JWT token 并将用户信息挂载到 req 对象
 */
function authMiddleware(req, res, next) {
  try {
    // 获取 Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AppError('未提供认证 token', 401);
    }

    // 检查 Bearer token 格式
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AppError('Token 格式无效，应为 Bearer <token>', 401);
    }

    const token = parts[1];

    // 验证并解码 token
    const decoded = jwt.verify(token, config.jwt.secret);

    // 将 userId 和 email 挂载到 req 对象
    req.userId = decoded.userId;
    req.userEmail = decoded.email;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(new AppError('无效的 token', 401));
    } else if (error.name === 'TokenExpiredError') {
      next(new AppError('Token 已过期', 401));
    } else {
      next(error);
    }
  }
}

module.exports = authMiddleware;