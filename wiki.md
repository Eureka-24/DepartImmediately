# 智能路线规划系统 - 开发 Wiki

> 本文档面向 AI 助手，用于二次开发时快速建立对项目的准确理解。

---

## 1. 项目概述

**项目名称**：Wayfinder - 智能路线规划系统

**核心功能**：用户输入游玩目的地、时间、偏好，系统结合 POI 数据与服务、用户评价语料等，自动生成多维度最优路线方案，支持按时空、偏好等约束动态调整。

**技术架构**：
- **前端**：Vue 3 + Vite + Pinia + Vue Router + 高德地图 JS API v2.0
- **后端**：Python + FastAPI + LangChain + PostgreSQL + pgvector
- **AI**：DeepSeek API（通过 LangChain 调用）
- **数据库**：PostgreSQL 16 + pgvector（向量存储）

**目标用户**：有旅行规划需求的用户

---

## 2. 项目结构

```
d:\Agent\DepartImmediately\
├── frontend/trip-plan-frontend/src/
│   ├── components/
│   ├── views/
│   ├── stores/
│   ├── services/
│   └── router/
│
├── backend/server/src/              # Node.js 后端（旧版，已废弃）
│
├── backend_new/src/                 # Python + FastAPI 后端（当前版本）
│   ├── main.py                      # FastAPI 入口
│   ├── config.py                    # 环境变量配置
│   ├── database.py                  # PostgreSQL 连接
│   ├── models/                      # SQLAlchemy 模型
│   │   ├── user.py                 # 用户模型
│   │   ├── task.py                 # 任务模型
│   │   ├── session.py              # 会话模型
│   │   ├── preference.py           # 用户偏好模型（含 task_id）
│   │   └── preference_lib.py       # 标准偏好库模型
│   ├── routes/                      # API 路由
│   │   ├── auth.py                 # 认证端点
│   │   ├── agent.py                # Agent 端点
│   │   └── preferences.py          # 偏好管理端点
│   ├── services/                    # Agent 服务
│   │   ├── intent_agent.py         # 意图识别
│   │   ├── planning_agent.py       # 路线规划
│   │   ├── structured_agent.py    # 结构化输出
│   │   ├── preference_agent.py    # 偏好提取/存储/语义扩展
│   │   └── task_queue.py          # 后台任务队列
│   ├── tools/                       # 工具模块
│   │   ├── search_pois.py         # 高德 POI 搜索
│   │   └── route_planning.py      # 高德路径规划
│   └── llm/                         # LLM 封装
│       ├── chat.py                  # DeepSeek 聊天
│       └── embedding.py            # Zhipu AI embedding
│
├── backend_new/scripts/
│   ├── init_db.py                  # 数据库初始化脚本
│   ├── init_db.sql                 # 数据库 DDL
│   └── generate_preference_lib.py # 生成标准偏好库脚本
│
├── backend_new/docs/
│   └── preference_refactor_design.md # 偏好重构设计方案
│
├── skills/
│   └── amap-jsapi-skill/            # 高德地图 JS API 文档
```

---

## 3. 模块职责边界

### 后端 - Agent 服务链

| 模块 | 职责 | 不负责 |
|------|------|--------|
| `intentAgent` | 接收用户原始输入 + 扩展偏好 → 调用 LLM 解析为结构化意图（JSON） | 不生成路线、不调用外部 API |
| `planningAgent` | 接收结构化意图 → 调用 `searchPois`/`routePlanning` 工具搜索 POI → 生成 Markdown 规划 | 不解析 JSON 输出、不管理任务状态 |
| `structuredAgent` | 接收 Markdown → 调用 LLM 转换为 JSON 结构 | 不做规划、不调用工具 |
| `taskQueue` | 管理异步任务队列 → 存储任务状态到 PostgreSQL → 提供轮询接口 | 不做 AI 推理 |

### 后端 - 偏好服务（preference_agent）

| 函数 | 职责 |
|------|------|
| `extract_single_preferences(raw_input)` | 从用户输入提取标准偏好标签（查 preference_lib 表匹配），不存储 |
| `save_preferences(user_id, task_id, preferences)` | 批量存储偏好列表，关联 task_id |
| `query_extended_preferences(user_id, top_k)` | 查询历史偏好 → 语义检索标准库 → 返回扩展偏好 |

### 后端 - 工具模块（Agent 可调用）

| 工具 | 功能 | 限流处理 |
|------|------|----------|
| `searchPois` | 调用高德地图 POI 搜索 API | 检测到 `CUQPS_HAS_EXCEEDED` 立即停止，使用已有数据继续 |
| `routePlanning` | 调用高德地图路径规划 API | 同上 |

---

## 4. 任务执行流程

### 完整流程（含偏好处理）

```
任务开始
    │
    ▼
Step 0a: 偏好提取
    └── extract_single_preferences(preferences)
    │   └── 从 preference_lib 表获取标签列表 → LLM 参考标准库提取 → 返回标准标签
    │
    ▼
Step 0b: 存储本次偏好
    └── save_preferences(user_id, task_id, std_prefs)
    │   └── 批量插入 user_preferences，关联 task_id
    │
    ▼
Step 0c: 语义扩展偏好
    └── query_extended_preferences(user_id, top_k=5)
    │   └── 查询历史偏好 → 加权平均向量 → 语义检索 preference_lib → 返回扩展偏好
    │
    ▼
Step 0d: 传入意图识别
    └── parse_intent(..., extended_prefs)
    │
    ▼
Step 1: Intent Agent → 结构化意图 JSON
Step 2: Planning Agent → 调用高德 API → 生成 Markdown
Step 3: Structured Agent → 转换为 JSON
任务完成
```

### 偏好语义扩展机制

```
用户历史偏好（user_preferences）
    │
    ▼
计算时间衰减权重：weight = exp(-0.01 × 天数)
    │
    ▼
加权平均向量
    │
    ▼
向量检索 preference_lib（标准偏好库）
    │
    ▼
返回 cosine similarity 最高的 top_k=5 个标签
如：["亲子游", "家庭游", "儿童乐园", "自然风光", "户外探险"]
```

---

## 5. API 契约

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
| `/api/agent/task/:id` | GET | - (Bearer Token) | `{ success: true, data: { id, status, result } }` |
| `/api/agent/history` | GET | - (Bearer Token) | `{ success: true, data: [{ id, city, startTime, endTime, preferences, result, status }] }` |
| `/api/agent/history/:id` | DELETE | - (Bearer Token) | `{ success: true }` |

### 偏好接口

| 端点 | 方法 | 请求体 | 响应格式 |
|------|------|--------|----------|
| `/api/preferences` | GET | - (Bearer Token) | `{ success: true, data: [{ id, text, source, weight, similarity, final_score }] }` |
| `/api/preferences` | POST | `{ text }` | `{ success: true }` |
| `/api/preferences/conflicts` | GET | `?threshold=0.3` | `{ success: true, data: [{ pref_a, pref_b, distance }] }` |

### 健康检查

| 端点 | 方法 | 响应 |
|------|------|------|
| `/api/health` | GET | `{ success: true, message: '服务运行正常', timestamp }` |

---

## 6. 数据模型

### user_preferences 表

```sql
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    task_id VARCHAR(64),                    -- 关联任务ID
    preference_text VARCHAR(255) NOT NULL, -- 标准偏好标签
    preference_vector JSONB,              -- 1024维向量
    source TEXT DEFAULT 'input',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### preference_lib 表（标准偏好库）

```sql
CREATE TABLE preference_lib (
    id SERIAL PRIMARY KEY,
    tag VARCHAR(64) NOT NULL UNIQUE,     -- 偏好标签，如"亲子游"
    description TEXT,                     -- 标签描述
    synonyms TEXT,                        -- 同义词列表
    embedding_vector JSONB,              -- 1024维向量
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**生成标准偏好库**：
```bash
python scripts/generate_preference_lib.py --save-db
```

---

## 7. 前端路由与权限

| 路径 | 组件 | 权限 | 说明 |
|------|------|------|------|
| `/` | HomeView | 需要认证 | 首页，未登录重定向到 /login |
| `/login` | LoginView | 游客可访问 | 已登录用户访问重定向到 / |
| `/register` | RegisterView | 游客可访问 | 已登录用户访问重定向到 / |

---

## 8. 环境变量清单

### 后端（backend_new/.env）

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `DEEPSEEK_API_KEY` | 是 | DeepSeek API 密钥 |
| `ZHIPU_API_KEY` | 是 | Zhipu AI API 密钥（用于 embedding） |
| `AMAP_KEY` | 是 | 高德地图 Web API Key |
| `AMAP_SECURITY_CODE` | 是 | 高德地图安全密钥 |
| `JWT_SECRET` | 是 | JWT 签名密钥 |
| `PORT` | 否 | 服务器端口，默认 8000 |
| `CORS_ORIGIN` | 否 | CORS 允许的源，默认 http://localhost:5173 |

### 前端（frontend/trip-plan-frontend/.env）

| 变量 | 必填 | 说明 |
|------|------|------|
| `VITE_API_BASE_URL` | 否 | API 基础 URL，默认 http://localhost:8000/api |
| `VITE_AMAP_JSAPI_KEY` | 是 | 高德地图 JS API Key |
| `VITE_AMAP_SECURITY_CODE` | 是 | 高德地图安全密钥 |

---

## 9. 运行项目

### 数据库初始化

```bash
cd backend_new
python scripts/init_db.py
python scripts/generate_preference_lib.py --save-db  # 生成标准偏好库
```

### 后端

```bash
conda activate wayfinder
cd backend_new
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

### 前端

```bash
cd frontend/trip-plan-frontend
npm install
npm run dev
```

---

## 10. 技术债务与已知限制

| 项目 | 说明 |
|------|------|
| `trip_plan.html` | 旧版单文件前端实现，已废弃 |
| `backend/server/` | Node.js 后端，已废弃，不应作为新功能开发参考 |
| 当前后端 | `backend_new/`（Python + FastAPI）为活跃开发版本 |
| 任务超时 | 当前没有实现，未来可加 `updated_at` 超时检测 |
| 数据库迁移 | 使用简单 SQL 脚本，未来可引入 Alembic |

---

## 11. 新增功能检查清单

当 AI 助手进行二次开发时，应确认：

- [ ] 新功能属于哪个模块？（前端组件 / 后端路由 / Agent 服务 / 工具）
- [ ] 是否需要新增 API 接口？如是，添加到本文档第 5 节
- [ ] 是否需要修改数据库 Schema？如是，添加到本文档第 6 节
- [ ] 是否涉及 Agent Prompt 修改？如是，更新相关文档
- [ ] 是否需要新增环境变量？如是，添加到本文档第 8 节
- [ ] 新功能是否影响现有数据流？如是，同步更新本文档第 4 节
- [ ] 是否需要修改偏好相关逻辑？如是，参考 preference_agent.py 和 preference_refactor_design.md

---

## 12. 参考文档

| 文档 | 说明 |
|------|------|
| `docs/preference_refactor_design.md` | 偏好查询与存储重构方案（2026-05-02） |
| `docs/SPEC.md` | 技术规格文档（历史版本，待更新） |
| `CLAUDE.md` | Claude Code 项目指导 |

---

*最后更新：2026-05-02*