/**
 * 统一错误处理中间件
 * 区分不同类型的 HTTP 错误并返回统一格式的响应
 */

/**
 * 自定义错误类，支持 HTTP 状态码
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 创建常见类型错误的工厂函数
 */
const createError = {
  badRequest: (message = '请求参数错误') => new AppError(message, 400),
  unauthorized: (message = '未授权访问') => new AppError(message, 401),
  forbidden: (message = '禁止访问') => new AppError(message, 403),
  notFound: (message = '资源不存在') => new AppError(message, 404),
  internal: (message = '服务器内部错误') => new AppError(message, 500),
};

/**
 * 错误处理中间件
 * @param {Error} err - 错误对象
 * @param {Request} req - 请求对象
 * @param {Response} res - 响应对象
 * @param {Function} next - 下一个中间件
 */
function errorHandler(err, req, res, next) {
  // 默认错误值
  let statusCode = err.statusCode || 500;
  let message = err.message || '服务器内部错误';

  // 开发环境显示详细错误信息
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // 记录错误日志
  console.error(`[Error] ${new Date().toISOString()} - ${statusCode}: ${message}`);
  if (!err.isOperational && isDevelopment) {
    console.error(err.stack);
  }

  // 处理特定错误类型
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = '无效的 token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'token 已过期';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  }

  // 发送统一格式的错误响应
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(isDevelopment && !err.isOperational && { stack: err.stack }),
  });
}

/**
 * 404 处理中间件
 * 处理所有未匹配的路由
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: 'API 路由不存在',
  });
}

module.exports = {
  AppError,
  createError,
  errorHandler,
  notFoundHandler,
};
