/**
 * 配置加载模块
 * 从 .env 文件加载环境变量并导出配置对象
 */

require('dotenv').config();

const config = {
  // 服务端口
  port: process.env.PORT || 3000,

  // Deepseek API 配置
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseURL: 'https://api.deepseek.com/v1',
  },

  // 高德地图 Web 服务配置
  amap: {
    webServiceKey: process.env.AMAP_WEBSERVICE_KEY || '',
  },

  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
    expiresIn: '7d',
  },

  // 数据库配置
  database: {
    path: process.env.DB_PATH || './data/wayfinder.db',
  },
};

module.exports = config;
