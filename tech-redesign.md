# 智能路线规划系统 - Python 重构技术设计文档

> 本文档记录从 Node.js/Express.js 到 Python/FastAPI 的重构技术方案。

---

## 1. 概述

### 1.1 背景

当前系统使用 Express.js + LangChain (Node.js) + sql.js 构建原型，存在以下局限：
- LangChain Node.js 版本功能不如 Python 完整
- sql.js 浏览器内 SQLite，不适合生产环境和持久化需求
- 用户偏好存储为简单标签，无法实现语义检索和时间衰减

### 1.2 重构目标

1. 迁移到 Python 技术栈，利用 LangChain 0.3.x 完整功能
2. 使用 PostgreSQL + pgvector 实现用户偏好向量存储，支持语义检索和时间衰减
3. 任务状态持久化到 PostgreSQL，支持 Docker 重启后恢复
4. 保持前端零改动，仅调整 API 地址

### 1.4 Python 环境规范

**所有 Python 后端开发必须使用 conda 虚拟环境 `wayfinder`**，不允许使用系统 Python 或其他环境。

```bash
# 创建环境（如尚未创建）
conda create -n wayfinder python=3.12 -y

# 激活环境
conda activate wayfinder

# 安装依赖
pip install -r backend_new/requirements.txt
```

环境路径：`D:\Tools\Anaconda\Anaconda3\envs\wayfinder`

---

## 2. 技术栈选择

### 2.1 后端技术栈

| 模块 | 技术选型 | 理由 |
|------|----------|------|
| 语言 | Python 3.12 | AI 应用生态最完整 |
| Web 框架 | FastAPI 0.3.x | 原生异步、自动 OpenAPI、类型安全 |
| ASGI 服务器 | Uvicorn | FastAPI 官方推荐 |
| ORM | SQLAlchemy 2.x + asyncpg | 异步支持好，与 PostgreSQL 集成佳 |
| Agent 框架 | LangChain 0.3.x LCEL | 替代 LangGraph，仅用 LCEL 足够线性链 |
| 任务队列 | PostgreSQL 自建 | asyncio 协程轮询 `tasks` 表，不需要额外中间件 |
| 偏好向量 | pgvector (Zhipu AI embedding-3) | 1024 维向量，支持 cosine similarity |
| 地图 API | Python requests | 参考 `skills/amap-lbs-skill/gaode_skill.py` 重写 |

### 2.2 数据库技术栈

| 数据库 | 用途 | 扩展性 |
|--------|------|--------|
| PostgreSQL 16 + pgvector | 用户数据、Sessions、任务状态、偏好向量 | 可升级为独立实例 |
| 自建队列 | 异步任务管理 | 单实例轮询，多实例需 `FOR UPDATE SKIP LOCKED` |

### 2.3 不引入的技术

| 技术 | 原因 |
|------|------|
| Redis | 原型阶段不需要高性能队列，PostgreSQL 自建足够 |
| Neo4j | 偏好关系不复杂，pgvector + SQL 足够处理矛盾检测 |
| LangGraph | 当前是线性三步链（intent → planning → structured），LCEL 足够 |
| 流式输出 | 保持当前轮询模式 |

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│  Vue 3 前端 (不改)                                          │
│  POST /api/agent/plan_async → GET /api/agent/task/:id     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP (JSON)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  FastAPI (Python) - Uvicorn ASGI                            │
│                                                              │
│  ┌─ 路由层 ─────────────────────────────────────────────┐   │
│  │  /api/auth/*     认证端点                             │   │
│  │  /api/agent/*    Agent 端点（plan_async, task, history）│   │
│  │  /api/preferences/* 偏好管理端点                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ 后台协程 ───────────────────────────────────────────┐   │
│  │  TaskQueueWorker: 轮询 tasks 表，执行 pending 任务    │   │
│  │  - intentAgent.parseIntent()                          │   │
│  │  - planningAgent.generatePlan()                       │   │
│  │  - structuredAgent.parseOutput()                      │   │
│  │  - preferenceAgent.extractAndSave()                   │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  PostgreSQL     │  │  高德地图 API    │  │  LLM API        │
│  (tasks 表)     │  │  (Python 重写)  │  │  (DeepSeek)     │
│  (sessions)     │  └─────────────────┘  └─────────────────┘
│  (users)        │
│  (preferences)  │
│   + pgvector    │
└─────────────────┘
```

---

## 4. 数据库 Schema

### 4.1 用户表

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 Sessions 表

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    city TEXT,
    start_time TEXT,
    end_time TEXT,
    preferences TEXT,
    result TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 用户偏好表

```sql
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    preference_text TEXT NOT NULL,           -- 原始偏好描述："亲子游"、"放松一点"
    preference_vector VECTOR(1024),          -- Zhipu AI embedding-3 维度
    source TEXT DEFAULT 'input',            -- 'input' | 'history' | 'manual'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 向量索引（IVFFlat 加速 cosine similarity 查询）
CREATE INDEX ON user_preferences USING ivfflat (preference_vector cosine_ops);
-- 时间索引
CREATE INDEX ON user_preferences (user_id, created_at);
```

### 4.4 任务表

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    input JSONB NOT NULL,                   -- { city, startTime, endTime, preferences }
    result JSONB,                           -- 完成时写入
    error TEXT,                             -- 失败时写入
    status TEXT DEFAULT 'pending',          -- 'pending' | 'processing' | 'completed' | 'failed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ON tasks (status, created_at);
CREATE INDEX ON tasks (user_id, status);
```

### 4.5 权重衰减计算（查询时在 Python 后端计算）

```python
from datetime import datetime, timedelta

def calculate_weight(created_at: datetime) -> float:
    """
    指数衰减：每天衰减约 1%
    - 今天: weight = 1.0
    - 7 天前: weight ≈ 0.93
    - 30 天前: weight ≈ 0.74
    - 90 天前: weight ≈ 0.41
    """
    days_elapsed = (datetime.now() - created_at).days
    return math.exp(-0.01 * days_elapsed)
```

### 4.6 矛盾检测逻辑（Python 后端计算）

```python
async def detect_conflicts(user_id: int, threshold: float = 0.3) -> list[dict]:
    """
    检测用户在近期内（7天）偏好差异过大的情况
    threshold: cosine distance 阈值，超过该值视为矛盾
    """
    recent_prefs = await db.fetch_all("""
        SELECT preference_text, preference_vector, created_at
        FROM user_preferences
        WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
    """, user_id)

    conflicts = []
    for i, pref_a in enumerate(recent_prefs):
        for pref_b in recent_prefs[i+1:]:
            distance = await compute_cosine_distance(pref_a['preference_vector'], pref_b['preference_vector'])
            if distance > threshold:
                conflicts.append({
                    'pref_a': pref_a['preference_text'],
                    'pref_b': pref_b['preference_text'],
                    'distance': distance
                })

    return conflicts
```

---

## 5. API 契约

### 5.1 认证接口

| 端点 | 方法 | 请求体 | 响应格式 |
|------|------|--------|----------|
| `/api/auth/register` | POST | `{ username, password }` | `{ success: true, data: { token, user } }` |
| `/api/auth/login` | POST | `{ username, password }` | `{ success: true, data: { token, user } }` |
| `/api/auth/verify` | GET | - (Bearer Token) | `{ success: true, data: { user } }` |

### 5.2 Agent 接口

| 端点 | 方法 | 请求体 | 响应格式 |
|------|------|--------|----------|
| `/api/agent/plan_async` | POST | `{ city, startTime, endTime, preferences }` | `{ success: true, data: { id, status: 'pending' } }` |
| `/api/agent/task/:id` | GET | - (Bearer Token) | `{ success: true, data: { id, status, result?, error? } }` |
| `/api/agent/history` | GET | - (Bearer Token) | `{ success: true, data: [{ id, city, startTime, endTime, result, status }] }` |
| `/api/agent/history/:id` | DELETE | - (Bearer Token) | `{ success: true }` |

### 5.3 偏好接口

| 端点 | 方法 | 请求体 | 响应格式 |
|------|------|--------|----------|
| `/api/preferences` | GET | - (Bearer Token) | `{ success: true, data: [{ id, text, weight }] }` |
| `/api/preferences` | POST | `{ text }` | `{ success: true }` |
| `/api/preferences/conflicts` | GET | - (Bearer Token) | `{ success: true, data: [{ pref_a, pref_b, distance }] }` |

### 5.4 健康检查

| 端点 | 方法 | 响应 |
|------|------|------|
| `/api/health` | GET | `{ success: true, message: '服务运行正常', timestamp }` |

---

## 6. 目录结构

```
d:\Agent\DepartImmediately\
├── backend_new/                       # Python 重构后端（新建目录）
│   ├── src/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI 入口
│   │   ├── config.py               # 环境变量配置
│   │   ├── database.py             # PostgreSQL 连接 + 初始化
│   │   ├── models/                 # SQLAlchemy 模型
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── session.py
│   │   │   ├── task.py
│   │   │   └── preference.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── agent.py
│   │   │   └── preferences.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── intent_agent.py      # 意图识别
│   │   │   ├── planning_agent.py    # 路线规划
│   │   │   ├── structured_agent.py  # 结构化输出
│   │   │   ├── preference_agent.py  # 偏好提取/存储/查询
│   │   │   └── task_queue.py        # 后台任务队列协程
│   │   ├── tools/
│   │   │   ├── __init__.py
│   │   │   ├── search_pois.py       # 高德 POI 搜索
│   │   │   └── route_planning.py    # 高德路径规划
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   ├── chat.py              # DeepSeek 聊天封装
│   │   │   └── embedding.py         # DeepSeek embedding 封装
│   │   └── middleware/
│   │       ├── __init__.py
│   │       ├── auth.py              # JWT 验证
│   │       └── error_handler.py     # 统一错误处理
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_auth.py
│   │   ├── test_agent.py
│   │   └── test_preferences.py
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── requirements.txt
│   └── .env.example
│
├── backend/                             # 原 Node.js 后端（保留或删除）
│
├── frontend/                             # 不改动
│   └── trip-plan-frontend/
│
├── docker/
│   └── postgres/
│       └── data/                      # PostgreSQL 数据持久化（不加入 git）
│
├── skills/
│   └── amap-lbs-skill/                  # 参考高德地图 Python 重写
│
└── docs/
    └── tech-redesign.md                 # 本文档
```

---

## 7. 核心模块设计

### 7.1 任务队列协程

```python
# task_queue.py
import asyncio
from sqlalchemy import text

async def task_queue_worker(app):
    """后台协程：轮询 tasks 表，处理 pending 任务"""
    while True:
        try:
            # 原子性获取一个 pending 任务
            result = await db.fetch_one(text("""
                UPDATE tasks
                SET status = 'processing', updated_at = NOW()
                WHERE id = (
                    SELECT id FROM tasks
                    WHERE status = 'pending'
                    ORDER BY created_at ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, user_id, input
            """))

            if result:
                task_id = result['id']
                try:
                    # 执行任务链
                    result_data = await execute_task_chain(result['input'])
                    await db.execute(text("""
                        UPDATE tasks SET status = 'completed', result = :result, updated_at = NOW()
                        WHERE id = :id
                    """), {'id': task_id, 'result': json.dumps(result_data)})
                except Exception as e:
                    await db.execute(text("""
                        UPDATE tasks SET status = 'failed', error = :error, updated_at = NOW()
                        WHERE id = :id
                    """), {'id': task_id, 'error': str(e)})
            else:
                await asyncio.sleep(1)  # 无任务时休眠
        except Exception as e:
            logger.error(f"Task queue error: {e}")
            await asyncio.sleep(5)
```

### 7.2 偏好 Agent

```python
# preference_agent.py
from langchain.prompts import ChatPromptTemplate
from langchain.chat_models import ChatDeepSeek

MAX_PREFERENCES_PER_USER = 100

async def extract_and_save_preferences(user_id: int, raw_input: str, db):
    """
    1. 调用 LLM 提取结构化偏好
    2. 生成 embedding 向量
    3. 存入 PostgreSQL
    4. 超过上限时删除最老的
    """
    # LLM 提取
    prompt = ChatPromptTemplate.from_messages([
        ("system", "你是一个旅行偏好提取助手，从用户输入中提取关键词偏好。"),
        ("user", "{input}")
    ])
    chain = prompt | ChatDeepSeek(model="deepseek-chat")
    preference_text = await chain.ainvoke({"input": raw_input})

    # 生成 embedding
    vector = await get_embedding(preference_text)

    # 存入数据库
    await db.execute(text("""
        INSERT INTO user_preferences (user_id, preference_text, preference_vector, source)
        VALUES ($1, $2, $3, 'input')
    """), (user_id, preference_text, vector))

    # 清理超过上限的记录
    await db.execute(text("""
        DELETE FROM user_preferences
        WHERE id IN (
            SELECT id FROM user_preferences
            WHERE user_id = $1
            ORDER BY created_at ASC
            LIMIT GREATEST(0, (
                SELECT COUNT(*) FROM user_preferences WHERE user_id = $1
            ) - $2)
        )
    """), (user_id, MAX_PREFERENCES_PER_USER))


async def query_weighted_preferences(user_id: int, current_input: str, db, top_k: int = 5):
    """
    查询用户偏好，带时间衰减权重
    """
    # 当前输入的 embedding
    current_vector = await get_embedding(current_input)

    # 取出所有偏好
    prefs = await db.fetch_all(text("""
        SELECT preference_text, preference_vector, created_at
        FROM user_preferences
        WHERE user_id = $1
    """), (user_id))

    # Python 后端计算权重
    weighted_results = []
    for pref in prefs:
        weight = calculate_weight(pref['created_at'])
        similarity = 1 - await compute_cosine_distance(current_vector, pref['preference_vector'])
        weighted_results.append({
            'text': pref['preference_text'],
            'similarity': similarity,
            'weight': weight,
            'final_score': similarity * weight
        })

    # 返回加权后得分最高的
    return sorted(weighted_results, key=lambda x: x['final_score'], reverse=True)[:top_k]
```

### 7.3 高德地图工具（Python 重写参考）

参考 `skills/amap-lbs-skill/gaode_skill.py` 的逻辑，用 Python `requests` 重写：

```python
# tools/search_pois.py
import requests
from functools import lru_cache

AMAP_KEY = os.getenv("AMAP_KEY")
AMAP_SECURITY_CODE = os.getenv("AMAP_SECURITY_CODE")

async def search_pois(keywords: str, city: str, types: str = None):
    """高德 POI 搜索"""
    url = "https://restapi.amap.com/v3/place/text"
    params = {
        "key": AMAP_KEY,
        "keywords": keywords,
        "city": city,
        "types": types,
        "output": "json"
    }

    # 签名（如果需要）
    if AMAP_SECURITY_CODE:
        params["sig"] = generate_sig(params, AMAP_SECURITY_CODE)

    response = requests.get(url, params=params)
    data = response.json()

    # 限流检测
    if "CUQPS_HAS_EXCEEDED" in str(data) or "rate limit" in str(data).lower():
        # 返回空列表，使用已有数据继续
        return []

    return data.get("pois", [])
```

---

## 8. Docker 部署

### 8.1 docker-compose.yml（位于 backend_new/）

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: wayfinder_postgres
    environment:
      POSTGRES_USER: wayfinder
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-wayfinder_secret}
      POSTGRES_DB: wayfinder
    volumes:
      - ./docker/postgres/data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wayfinder"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend_new
      dockerfile: Dockerfile
    container_name: wayfinder_backend
    environment:
      DATABASE_URL: postgresql+asyncpg://wayfinder:${POSTGRES_PASSWORD:-wayfinder_secret}@postgres:5432/wayfinder
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      AMAP_KEY: ${AMAP_KEY}
      AMAP_SECURITY_CODE: ${AMAP_SECURITY_CODE}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
```

### 8.2 Dockerfile (backend)

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 8.3 requirements.txt

```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
sqlalchemy[asyncio]>=2.0.0
asyncpg>=0.30.0
langchain>=0.3.0
langchain-deepseek>=0.1.0
pgvector>=0.3.0
psycopg2-binary>=2.9.0
pydantic>=2.0.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.0
python-multipart>=0.0.9
requests>=2.32.0
```

---

## 9. 前端适配

### 9.1 需要修改的配置

前端 `.env` 文件：

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

### 9.2 CORS 配置

FastAPI 默认不开启 CORS，需在 `main.py` 中配置：

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # 前端地址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 10. 已知限制与后续工作

| 项目 | 说明 |
|------|------|
| 任务超时 | 当前没有实现，未来可加 `updated_at` 超时检测 |
| 多实例扩展 | 任务获取使用 `FOR UPDATE SKIP LOCKED`，支持多实例 |
| 数据库迁移 | 使用简单 SQL 脚本，未来可引入 Alembic |
| 偏好过期 | 目前无主动过期，仅通过上限控制 |

---

## 11. 参考资料

- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [LangChain Python 版](https://python.langchain.com/)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [DeepSeek API](https://platform.deepseek.com/)
- 高德地图 POI 搜索：`skills/amap-lbs-skill/gaode_skill.py`

---

*文档版本：1.1*
*最后更新：2026-05-02*