/**
 * 智能路线规划系统 - 后端服务入口
 * Express + Node.js
 */

const express = require('express');
const cors = require('cors');
const config = require('./config');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const db = require('./db');

// 初始化 Express 应用
const app = express();

// ============================================
// 中间件配置
// ============================================

// CORS 配置
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// JSON 解析中间件
app.use(express.json());

// 请求日志中间件（开发环境）
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================
// 路由配置
// ============================================

// 健康检查路由
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '服务运行正常',
    timestamp: new Date().toISOString(),
  });
});

// 认证路由（Phase 3 实现）
// app.use('/api/auth', require('./routes/auth'));

// AI Agent 路由（Phase 4 实现）
// app.use('/api/agent', require('./routes/agent'));

// ============================================
// 错误处理
// ============================================

// 404 处理
app.use(notFoundHandler);

// 统一错误处理
app.use(errorHandler);

// ============================================
// 服务启动
// ============================================

async function startServer() {
  try {
    // 初始化数据库
    await db.initializeDatabase();

    // 启动服务器
    app.listen(config.port, () => {
      console.log(`
╔═══════════════════════════════════════════════════╗
║     智能路线规划系统 - 后端服务                    ║
║     Wayfinder Backend Server                     ║
╠═══════════════════════════════════════════════════╣
║  端口: ${config.port}                                    ║
║  环境: ${process.env.NODE_ENV || 'development'}                        ║
║  状态: 运行中                                     ║
╚═══════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
