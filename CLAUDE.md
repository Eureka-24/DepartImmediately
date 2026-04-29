# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在本代码库中工作时提供指导。

## 项目概述

这是一个本地智能路线规划系统（智能路线规划系统），使用 AI 生成个性化旅游行程并通过地图可视化展示。

**技术架构**：Vue 3 前端 + Express.js 后端，集成 LangChain/OpenAI。

## 项目结构

```
├── trip_plan.html         # 旧版单文件前端（已过时）
├── frontend/
│   └── trip-plan-frontend/ # Vue 3 + Vite 前端
│       ├── src/
│       │   ├── components/ # Vue 组件
│       │   ├── views/     # 页面视图
│       │   ├── services/  # API 服务
│       │   ├── stores/    # Pinia 状态管理
│       │   └── router/    # Vue Router 配置
│       └── dist/          # 构建输出
├── backend/
│   └── server/            # Node.js + Express 后端
│       ├── src/
│       │   └── index.js   # 服务器入口
│       └── data/          # sql.js 数据库文件
├── skills/
│   └── amap-jsapi-skill/  # 高德地图 JS API 文档
└── .env                   # 环境变量（不提交到 git）
```

## 运行项目

### 后端
```bash
cd backend/server
npm install
npm run dev    # 开发模式（nodemon）
npm start      # 生产模式
```

### 前端
```bash
cd frontend/trip-plan-frontend
npm install
npm run dev    # Vite 开发服务器
npm run build  # 生产构建
```

## 环境配置

分别参考 `backend/server/.env.example` 和 `frontend/trip-plan-frontend/.env.example` 创建 `.env` 文件。

**后端环境变量**：
- `OPENAI_API_KEY` - OpenAI API 密钥（用于 LangChain）
- `AMAP_KEY` / `AMAP_SECURITY_CODE` - 高德地图 API 凭据
- `JWT_SECRET` - JWT 签名密钥

## 核心依赖

### 后端
- **Express** - Web 框架
- **LangChain + OpenAI** - AI 路线生成
- **sql.js** - 浏览器内 SQLite 数据库
- **JWT + bcryptjs** - 身份认证

### 前端
- **Vue 3** - UI 框架
- **Vite** - 构建工具
- **Pinia** - 状态管理
- **Vue Router** - 路由管理

### 外部 API
- **高德地图 JS API v2.0** - 地图可视化
- **OpenAI** - AI 驱动路线生成

## 后端 API

后端提供 REST 接口（详情见 `backend/server/src/index.js`）。前端通过 services 层与后端通信。

## 重要说明

- 旧版 `trip_plan.html` 文件已过时，请勿作为新开发的参考
- 运行前需在 `.env` 文件中配置 API 密钥（不提交到 git）
- `.gitignore` 排除了根目录 `config.js` 及所有 `.env` 文件