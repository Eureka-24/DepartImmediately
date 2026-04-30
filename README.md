# Wayfinder - 智能路线规划系统

基于 AI 的个性化旅行路线规划系统，用户输入目的地、时间、偏好，系统自动生成旅行规划并在地图上可视化展示。

## 功能特性

- **AI 智能规划**：基于 Deepseek AI Agent 自动生成个性化旅行路线
- **地图可视化**：集成高德地图 JS API，展示 POI 标记和路线连线
- **用户认证**：JWT 身份验证，支持注册/登录
- **历史会话**：保存并管理历史规划记录
- **响应式设计**：支持桌面端和移动端

## 技术栈

### 前端
- Vue 3 + Vite
- Pinia（状态管理）
- Vue Router（路由）
- amap-jsapi-loader（高德地图）
- Axios（HTTP 客户端）
- Flatpickr（日期选择）

### 后端
- Node.js + Express
- LangChain + OpenAI（AI Agent）
- JWT + bcryptjs（身份认证）
- sql.js（SQLite 数据库）

### 外部 API
- 高德地图 JS API / Web Service
- Deepseek API（AI 驱动）

## 项目结构

```
├── frontend/
│   └── trip-plan-frontend/     # Vue 3 前端应用
│       ├── src/
│       │   ├── components/      # Vue 组件
│       │   │   ├── common/       # 通用组件
│       │   │   ├── map/          # 地图组件
│       │   │   └── output/       # 输出组件
│       │   ├── views/            # 页面视图
│       │   ├── stores/           # Pinia 状态
│       │   ├── services/         # API 服务
│       │   └── router/           # 路由配置
│       └── dist/                 # 构建输出
├── backend/
│   └── server/                   # Express 后端服务
│       └── src/
│           ├── routes/            # API 路由
│           ├── services/          # 业务逻辑
│           ├── middleware/        # 中间件
│           ├── config/            # 配置
│           ├── db/                # 数据库
│           └── utils/             # 工具函数
├── doc/                          # 项目文档
├── skills/                       # 技能文档
└── CLAUDE.md                     # 开发指南
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd DepartImmediately

# 安装后端依赖
cd backend/server
npm install

# 安装前端依赖
cd ../../frontend/trip-plan-frontend
npm install
```

### 配置

分别创建前端和后端的 `.env` 文件：

**后端** `backend/server/.env`：
```
PORT=3000
DEEPSEEK_API_KEY=your_deepseek_api_key
AMAP_WEBSERVICE_KEY=your_amap_webservice_key
JWT_SECRET=your_jwt_secret
```

**前端** `frontend/trip-plan-frontend/.env`：
```
VITE_API_BASE_URL=http://localhost:3000/api
VITE_AMAP_JSAPI_KEY=your_amap_jsapi_key
```

### 运行

```bash
# 启动后端（开发模式）
cd backend/server
npm run dev

# 启动前端（新终端）
cd frontend/trip-plan-frontend
npm run dev
```

访问 http://localhost:5173 查看应用。

## API 文档

### 认证接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| GET | `/api/auth/profile` | 获取用户信息 |
| PUT | `/api/auth/preferences` | 更新用户偏好 |

### AI 规划接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/agent/plan` | 生成旅行规划（同步） |
| POST | `/api/agent/plan_async` | 异步生成规划 |
| GET | `/api/agent/task/:taskId` | 查询任务状态 |
| GET | `/api/agent/history` | 获取历史记录 |
| GET | `/api/agent/history/:id` | 获取单条记录 |
| DELETE | `/api/agent/history/:id` | 删除记录 |

## 许可证

MIT
