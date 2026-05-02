# 智能路线规划系统 - 开发 Wiki

> 本文档面向 AI 助手，用于二次开发时快速建立对项目的准确理解。

---

## 1. 项目概述

**项目名称**：Wayfinder - 智能路线规划系统

**核心功能**：用户输入游玩目的地、时间、偏好，系统结合 POI 数据与服务、用户评价语料等，自动生成多维度最优路线方案，支持按时空、偏好等约束动态调整。

**技术架构**：
- **前端**：Vue 3 + Vite + Pinia + Vue Router + 高德地图 JS API v2.0
- **后端**：Express.js + Node.js + LangChain + sql.js
- **AI**：OpenAI/DeepSeek API（通过 LangChain 调用）
- **数据库**：sql.js（浏览器内 SQLite，适合 Demo）

**目标用户**：有旅行规划需求的用户

---

## 2. 项目结构

```
d:\Agent\DepartImmediately\
├── frontend/trip-plan-frontend/src/
│   ├── components/
│   │   ├── map/
│   │   │   └── AmapContainer.vue        # 高德地图容器组件
│   │   ├── common/
│   │   │   └── DateTimePicker.vue       # 日期时间选择组件
│   │   └── output/
│   │       └── ItineraryOutput.vue      # 行程输出展示（Markdown 渲染）
│   ├── views/
│   │   ├── HomeView.vue                 # 首页（主要交互页）
│   │   ├── LoginView.vue                # 登录页
│   │   └── RegisterView.vue             # 注册页
│   ├── stores/
│   │   ├── auth.js                      # 认证状态（token, user, initialized）
│   │   ├── trip.js                      # 行程规划状态 + 轮询逻辑
│   │   └── preferences.js               # 用户偏好设置
│   ├── services/
│   │   ├── api.js                       # 通用 API 封装
│   │   └── authApi.js                   # 认证 API
│   ├── router/
│   │   └── index.js                     # 路由配置 + 导航守卫
│   ├── App.vue                          # 根组件
│   ├── main.js                          # 应用入口
│   └── style.css                        # 全局样式
│
├── backend/server/src/
│   ├── routes/
│   │   ├── auth.js                      # 认证端点
│   │   └── agent.js                      # Agent 端点（核心业务）
│   ├── services/
│   │   ├── intentAgent.js               # 意图识别（输入 → 结构化 JSON）
│   │   ├── planningAgent.js             # 路线规划（LangGraph ReAct Agent）
│   │   ├── structuredAgent.js           # 输出结构化（Markdown → JSON）
│   │   ├── agentService.js              # 异步任务管理 + 任务状态存储
│   │   └── tools/
│   │       ├── searchPois.js             # 高德 POI 搜索工具
│   │       ├── routePlanning.js          # 路线规划工具
│   │       └── userPrefs.js             # 用户偏好提取工具
│   ├── config/
│   │   ├── llm.js                       # LLM 实例创建（OpenAI/DeepSeek）
│   │   ├── prompts.js                   # Prompt 模板（默认路线、Markdown 格式）
│   │   └── index.js                     # 环境变量配置
│   ├── middleware/
│   │   ├── auth.js                      # JWT 验证中间件
│   │   └── errorHandler.js              # 统一错误处理
│   ├── db/
│   │   ├── index.js                     # sql.js 初始化
│   │   ├── schema.sql                   # 数据库 Schema
│   │   └── fixData.js                   # 固定数据初始化
│   └── index.js                         # 服务器入口
│
├── skills/
│   └── amap-jsapi-skill/                # 高德地图 JS API 文档（本地参考）
```

---

## 3. 模块职责边界

### 后端 - Agent 服务链

| 模块 | 职责 | 不负责 |
|------|------|--------|
| `intentAgent` | 接收用户原始输入 → 调用 LLM 解析为结构化意图（JSON） | 不生成路线、不调用外部 API |
| `planningAgent` | 接收结构化意图 → 调用 `searchPois`/`routePlanning` 工具搜索 POI → 生成 Markdown 规划 | 不解析 JSON 输出、不管理任务状态 |
| `structuredAgent` | 接收 Markdown → 调用 LLM 转换为 JSON 结构 | 不做规划、不调用工具 |
| `agentService` | 管理异步任务队列（内存 Map）→ 存储任务状态到 sql.js → 提供轮询接口 | 不做 AI 推理 |

### 后端 - 工具模块（Agent 可调用）

| 工具 | 功能 | 限流处理 |
|------|------|----------|
| `searchPois` | 调用高德地图 POI 搜索 API | 检测到 `CUQPS_HAS_EXCEEDED` 立即停止，使用已有数据继续 |
| `routePlanning` | 调用高德地图路径规划 API | 同上 |
| `userPrefs` | 从数据库获取用户历史偏好 | 无 |

### 前端 - Store 职责

| Store | 状态 | 关键方法 |
|-------|------|----------|
| `auth` | `token`, `user`, `initialized` | `login()`, `register()`, `logout()`, `init()` |
| `trip` | `currentTrip`, `history`, `isLoading`, `pendingTasks` | `submitPlan()`（自动启动轮询）, `loadHistory()`, `deleteSession()` |
| `preferences` | 用户偏好设置 | - |

**关键约定**：`tripStore.submitPlan()` 内部自动调用 `pollTaskStatus()`，不需要在组件中手动触发轮询。

---

## 4. API 契约

### 认证接口

| 端点 | 方法 | 请求体 | 响应格式 |
|------|------|--------|----------|
| `/api/auth/register` | POST | `{ username, password }` | `{ success: true, data: { token, user } }` |
| `/api/auth/login` | POST | `{ username, password }` | `{ success: true, data: { token, user } }` |
| `/api/auth/verify` | GET | - (Bearer Token) | `{ success: true, data: { user } }` |

### Agent 接口（核心业务）

| 端点 | 方法 | 请求体 | 响应格式 |
|------|------|--------|----------|
| `/api/agent/plan_async` | POST | `{ city, startTime, endTime, preferences }` | `{ success: true, data: { id, status: 'pending' } }` |
| `/api/agent/task/:id` | GET | - (Bearer Token) | `{ success: true, data: { id, status: 'pending'/'completed'/'failed', result } }` |
| `/api/agent/history` | GET | - (Bearer Token) | `{ success: true, data: [{ id, city, startTime, endTime, preferences, result, status }] }` |
| `/api/agent/history/:id` | DELETE | - (Bearer Token) | `{ success: true }` |

### 健康检查

| 端点 | 方法 | 响应 |
|------|------|------|
| `/api/health` | GET | `{ success: true, message: '服务运行正常', timestamp }` |

---

## 5. 关键数据流

### 用户生成路线完整流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. 前端：用户填写表单，点击"生成路线"                                         │
│    → HomeView.vue 调用 tripStore.submitPlan()                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. 前端 → 后端                                                             │
│    POST /api/agent/plan_async                                               │
│    Body: { city, startTime, endTime, preferences }                          │
│    Header: Authorization: Bearer <token>                                    │
│                                                                             │
│    后端响应：{ success: true, data: { id: 'task_xxx', status: 'pending' } }  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. 后端：异步任务处理（agentService）                                        │
│    a) 创建任务，存入内存 Map + sql.js，状态 = pending                        │
│    b) 启动异步处理（不阻塞 HTTP 响应）                                       │
│       ├── intentAgent.parseIntent() → 结构化意图 JSON                       │
│       ├── planningAgent.generatePlan() → Markdown 规划                      │
│       ├── structuredAgent.parseOutput() → JSON 结果                        │
│       └── 更新 sql.js 中任务状态 = completed                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. 前端：轮询任务状态                                                      │
│    tripStore.pollTaskStatus() 每 2 秒轮询 GET /api/agent/task/:id           │
│    当 status === 'completed' 时，停止轮询，显示 result                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. 前端：展示结果                                                          │
│    ItineraryOutput.vue 使用 marked 库渲染 Markdown                          │
│    AmapContainer.vue 在高德地图上可视化路线                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 任务状态机

```
pending → completed（成功）
       → failed（失败/超时）

前端轮询超时：60 次 × 2 秒 = 120 秒后标记为 failed
```

---

## 6. 前端路由与权限

| 路径 | 组件 | 权限 | 说明 |
|------|------|------|------|
| `/` | HomeView | 需要认证 | 首页，未登录重定向到 /login |
| `/login` | LoginView | 游客可访问 | 已登录用户访问重定向到 / |
| `/register` | RegisterView | 游客可访问 | 已登录用户访问重定向到 / |

**首次加载逻辑**：
1. `App.vue` 挂载时调用 `authStore.init()`
2. `init()` 从 localStorage 恢复 token 并验证
3. 路由守卫检查 `authStore.initialized` 后再放行

---

## 7. Agent Prompt 模板位置

| 文件 | 内容 |
|------|------|
| `backend/server/src/config/prompts.js` | 默认路线模板、Markdown 输出格式约定 |
| `backend/server/src/config/llm.js` | LLM 实例配置（model、温度等） |
| `backend/server/src/services/intentAgent.js` | `buildPrompt()` 方法 - 意图识别 Prompt，输出 JSON |
| `backend/server/src/services/planningAgent.js` | `PLANNING_SYSTEM_PROMPT` 常量 - Planning Agent 系统提示词 |

**限流降级策略**（在 `planningAgent.js` 中）：
```
当调用 searchPois 或 routePlanning 时：
1. 检测响应是否包含 'CUQPS_HAS_EXCEEDED' / 'rate limit' / '频率'
2. 如果触发限流 → 立即停止 API 调用
3. 使用已有的 POI 数据继续规划（不重试）
4. 如果没有足够 POI → 返回降级结果
```

---

## 8. 环境变量清单

### 后端（backend/server/.env）

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENAI_API_KEY` | 是 | OpenAI 或 DeepSeek API 密钥 |
| `AMAP_KEY` | 是 | 高德地图 Web API Key |
| `AMAP_SECURITY_CODE` | 是 | 高德地图安全密钥 |
| `JWT_SECRET` | 是 | JWT 签名密钥 |
| `PORT` | 否 | 服务器端口，默认 3000 |
| `NODE_ENV` | 否 | development / production |
| `CORS_ORIGIN` | 否 | CORS 允许的源 |

### 前端（frontend/trip-plan-frontend/.env）

| 变量 | 必填 | 说明 |
|------|------|------|
| `VITE_API_BASE_URL` | 否 | API 基础 URL，默认 http://localhost:3000/api |
| `VITE_AMAP_KEY` | 是 | 高德地图 JS API Key |

### 参考文件

- 后端示例：`backend/server/.env.example`
- 前端示例：`frontend/trip-plan-frontend/.env.example`

---

## 9. 数据库 Schema（sql.js）

### 用户表

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 会话/历史记录表

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  city TEXT,
  start_time TEXT,
  end_time TEXT,
  preferences TEXT,
  result TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 用户偏好表

```sql
CREATE TABLE user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  favorite_cities TEXT,
  favorite_types TEXT,
  travel_style TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 10. 技术债务与已知限制

| 项目 | 说明 |
|------|------|
| `trip_plan.html` | 旧版单文件前端实现，已废弃，不应作为新功能开发参考 |
| POI 数据 | 当前为固定/模拟数据，非真实高德数据源 |
| 数据库 | sql.js 运行在浏览器端，非真实数据库，不适合生产环境 |
| 任务队列 | 存储在内存 Map 中，服务重启会丢失 |
| Session ID | 使用简单递增 ID 或时间戳，非 UUID |

---

## 11. 新增功能检查清单

当 AI 助手进行二次开发时，应确认：

- [ ] 新功能属于哪个模块？（前端组件 / 后端路由 / Agent 服务 / 工具）
- [ ] 是否需要新增 API 接口？如是，添加到本文档第 4 节
- [ ] 是否需要修改数据库 Schema？如是，添加到本文档第 9 节
- [ ] 是否涉及 Agent Prompt 修改？如是，更新本文档第 7 节
- [ ] 是否需要新增环境变量？如是，添加到本文档第 8 节
- [ ] 新功能是否影响现有数据流？如是，同步更新本文档第 5 节

---

*最后更新：2026-05-01*
