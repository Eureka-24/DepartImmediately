# 智能路线规划系统 - 技术规格文档 (SPEC)

> 版本: v1.0
> 日期: 2026-04-27
> 状态: 待开发

---

## 1. 项目概述

### 1.1 项目名称
智能路线规划系统 (Wayfinder)

### 1.2 项目类型
全栈 Web 应用（前端 + 后端）

### 1.3 核心功能
用户输入旅行目的地、时间、偏好，系统通过 AI Agent 自动调用高德地图 API 生成个性化路线规划，并在地图上展示。

### 1.4 目标用户
有旅行规划需求的用户，需要个性化、智能化的路线推荐。

---

## 2. 技术架构

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                         前端 (Vite + Vue3)                    │
│   ┌─────────────────┐         ┌─────────────────────────┐   │
│   │ amap-jsapi-skill│         │      状态管理 (Pinia)    │   │
│   │  (地图渲染)      │         └─────────────────────────┘   │
│   └────────┬────────┘                                        │
└─────────────┼────────────────────────────────────────────────┘
              │ HTTP (JSON)
              ▼
┌──────────────────────────────────────────────────────────────┐
│                      后端 (Node.js + Express)                 │
│                                                                  │
│   ┌──────────────────────────────────────────────────────┐   │
│   │              Deepseek AI Agent (Function Calling)      │   │
│   │   工具: search_pois, route_planning, get_user_prefs  │   │
│   └──────────────────────────────────────────────────────┘   │
│                              │                                │
│                              ▼                                │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐ │
│   │ amap-lbs-   │     │ amap-lbs-   │     │  用户服务    │ │
│   │ skill (POI) │     │ skill (路径) │     │  (认证/偏好) │ │
│   └─────────────┘     └─────────────┘     └─────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

| 层级 | 技术 | 版本 |
|-----|------|-----|
| 前端框架 | Vue 3 | 3.x |
| 构建工具 | Vite | 5.x |
| 状态管理 | Pinia | 2.x |
| 地图渲染 | amap-jsapi-skill (高德 JS API) | 2.0 |
| 后端框架 | Express | 4.x |
| AI 服务 | Deepseek API (Function Calling) | - |
| POI/路径 | amap-lbs-skill (高德 Web 服务) | - |
| 数据库 | SQLite (开发) / PostgreSQL (生产) | - |
| 用户认证 | JWT | - |

### 2.3 环境变量

**前端 (.env)**
```
VITE_API_BASE_URL=http://localhost:3000/api
VITE_AMAP_JSAPI_KEY=your_amap_jsapi_key
```

**后端 (.env)**
```
PORT=3000
DEEPSEEK_API_KEY=your_deepseek_api_key
AMAP_WEBSERVICE_KEY=your_amap_webservice_key
JWT_SECRET=your_jwt_secret
```

---

## 3. 功能规格

### 3.1 前端功能

#### 3.1.1 页面结构

```
src/
├── views/
│   ├── HomeView.vue          # 首页（表单 + 地图 + 输出）
│   ├── LoginView.vue         # 登录页
│   └── RegisterView.vue     # 注册页
├── components/
│   ├── layout/
│   │   ├── AppHeader.vue     # 顶部导航
│   │   └── AppSidebar.vue    # 侧边栏（历史记录）
│   ├── form/
│   │   ├── CitySelect.vue    # 城市选择组件
│   │   ├── DateTimePicker.vue# 时间选择组件
│   │   └── PreferenceInput.vue# 偏好输入组件
│   ├── map/
│   │   └── AmapContainer.vue # 高德地图容器
│   └── output/
│       └── ItineraryOutput.vue# 路线输出展示
├── stores/
│   ├── auth.js              # 认证状态
│   ├── trip.js              # 行程数据
│   └── preferences.js       # 用户偏好
├── services/
│   ├── api.js               # API 封装
│   └── amap.js              # 地图服务封装
├── router/
│   └── index.js             # 路由配置
└── App.vue
```

#### 3.1.2 页面路由

| 路径 | 组件 | 权限 |
|-----|------|-----|
| `/` | HomeView | 需登录 |
| `/login` | LoginView | 公开 |
| `/register` | RegisterView | 公开 |

#### 3.1.3 表单功能

| 字段 | 组件 | 说明 |
|-----|------|-----|
| 城市选择 | CitySelect (自定义下拉) | 6城市：北京、上海、杭州、成都、西安、重庆 |
| 开始时间 | DateTimePicker (Flatpickr) | datetime-local，精确到15分钟 |
| 结束时间 | DateTimePicker (Flatpickr) | 同上，最小值=开始时间 |
| 偏好描述 | PreferenceInput (textarea) | 多行文本，placeholder 引导输入 |
| 提交按钮 | SubmitButton | 渐变背景，loading 状态 |

#### 3.1.4 地图功能

| 功能 | 实现 | 说明 |
|-----|------|-----|
| 地图初始化 | amap-jsapi-skill | viewMode: '2D'，深色主题 |
| POI 标记 | Marker | 自定义图标，显示序号 |
| 路线绘制 | Polyline | 渐变色，起点绿色终点红色 |
| 信息窗体 | InfoWindow | 点击 POI 显示详情 |
| 自动视野 | setFitView | 路线绘制后自适应 |

#### 3.1.5 输出展示

| 功能 | 实现 | 说明 |
|-----|------|-----|
| 终端风格 | ItineraryOutput | 打字机效果，30ms/字符 |
| 光标 | cursor | 闪烁动画 |
| 格式化 | 结构化文本 | 景点、时间、交通方式 |

#### 3.1.6 用户认证

| 功能 | 实现 | 说明 |
|-----|------|-----|
| 注册 | 表单 + API | email + password |
| 登录 | 表单 + API | 返回 JWT token |
| 登出 | 清除本地存储 | 跳转登录页 |
| Token 存储 | localStorage | 自动附加到请求头 |

### 3.2 后端功能

#### 3.2.1 项目结构

```
server/
├── src/
│   ├── index.js              # 入口文件
│   ├── config/
│   │   └── index.js          # 配置加载
│   ├── routes/
│   │   ├── auth.js           # 认证路由
│   │   └── agent.js          # AI Agent 路由
│   ├── services/
│   │   ├── authService.js    # 认证逻辑
│   │   ├── agentService.js   # AI Agent 核心
│   │   └── tools/
│   │       ├── searchPois.js # POI 搜索工具
│   │       ├── routePlanning.js # 路径规划工具
│   │       └── userPrefs.js  # 用户偏好工具
│   ├── middleware/
│   │   ├── auth.js           # JWT 验证
│   │   └── errorHandler.js   # 错误处理
│   ├── db/
│   │   ├── schema.sql        # 数据库 schema
│   │   └── index.js          # 数据库连接
│   └── utils/
│       └── deepseek.js       # Deepseek API 封装
├── package.json
└── .env.example
```

#### 3.2.2 API 端点

**认证 API**

| 方法 | 路径 | 描述 | 认证 |
|-----|------|-----|-----|
| POST | /api/auth/register | 用户注册 | 否 |
| POST | /api/auth/login | 用户登录 | 否 |
| GET | /api/auth/profile | 获取用户信息 | 是 |
| PUT | /api/auth/preferences | 更新偏好 | 是 |

**AI Agent API**

| 方法 | 路径 | 描述 | 认证 |
|-----|------|-----|-----|
| POST | /api/agent/plan | 生成旅行规划 | 是 |

#### 3.2.3 数据库 Schema

```sql
-- 用户表
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用户偏好表
CREATE TABLE user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    favorite_cities TEXT,           -- JSON: ["北京", "上海"]
    favorite_types TEXT,            -- JSON: ["景点", "美食"]
    travel_style TEXT,              -- JSON: ["亲子", "休闲"]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 历史规划表
CREATE TABLE trip_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    city TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    preferences TEXT NOT NULL,      -- JSON
    result TEXT NOT NULL,          -- JSON: AI 返回的规划结果
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 4. AI Agent 设计

### 4.1 Deepseek Function Calling 配置

#### 4.1.1 三 Agent 架构

**Intent Agent（意图识别）**
- 类型：LangChain LLM + JSON 解析
- 输入：用户偏好描述 + 历史偏好数据
- 输出：结构化意图数据
- 无需工具调用

```javascript
// Intent Agent 输出结构
{
  city: "hangzhou",
  startTime: "2026-05-01 09:00",
  endTime: "2026-05-01 18:00",
  duration: 540,
  interests: ["景点", "美食", "拍照"],
  travelStyle: "休闲",
  budget: "中等",
  specialRequirements: "不想太累，适合亲子"
}
```

**Planning Agent（旅行规划）**
- 类型：LangGraph Prebuilt ReAct Agent
- 输入：Intent Agent 输出的结构化意图 + POI 数据
- 工具：search_pois, route_planning, get_user_preferences
- 输出：Markdown/自然语言旅行规划描述（**不直接输出 JSON**）

**Structured Agent（结构化输出）**
- 类型：LangChain LLM + JSON 解析
- 输入：Planning Agent 输出的 Markdown 描述
- 输出：标准 JSON 结构（routes, alternatives 等字段）
- 职责：将自然语言转换为结构化 JSON，并进行验证

```javascript
// Structured Agent 输出结构
{
  routes: [{
    day: 1,
    date: "2026-04-29",
    theme: "历史文化之旅",
    pois: [{
      name: "西湖",
      time: "09:30",
      duration: 120,
      description: "杭州标志性景点，适合休闲"
    }]
  }],
  alternatives: [],
  summary: "杭州一日休闲游路线"
}
```

#### 4.1.2 技术选型

| 组件 | 选择 | 理由 |
|-----|------|------|
| Agent 框架 | LangChain.js | 内置 ReAct Agent，开箱即用自动工具调用循环 |
| LLM | Deepseek Chat (ChatOpenAI 兼容) | 支持 Function Calling |
| Planning Agent | LangGraph Prebuilt ReAct Agent | 减少自行实现循环逻辑 |
| Intent Agent | LangChain LLM + JSON 解析 | 纯 LLM，无需工具 |
| Structured Agent | LangChain LLM + JSON 解析 | 专责格式化输出，提高 JSON 稳定性 |

#### 4.1.3 可用工具（LangChain Tool）

```javascript
const tools = [
  {
    type: "function",
    function: {
      name: "search_pois",
      description: "搜索城市中的POI地点，如景点、餐厅、酒店等",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" },
          keywords: { type: "string", description: "搜索关键词，多个用逗号分隔" },
          type: { type: "string", description: "POI类型：景点、餐饮、住宿、购物" }
        },
        required: ["city", "keywords"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "route_planning",
      description: "规划两个位置之间的路线",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "起点经纬度，格式：lng,lat" },
          destination: { type: "string", description: "终点经纬度，格式：lng,lat" },
          mode: { type: "string", description: "出行方式：walking/driving/riding/transfer" }
        },
        required: ["origin", "destination", "mode"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_preferences",
      description: "获取用户的历史偏好，用于个性化推荐",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "用户ID" }
        },
        required: ["user_id"]
      }
    }
  }
];
```

#### 4.1.2 系统提示词

```javascript
const systemPrompt = `你是一位专业的旅行规划师，擅长根据用户需求规划个性化旅行路线。

【核心能力】
1. 理解用户模糊需求（如"亲子游"、"吃货"、"不想排队"）
2. 搜索合适的 POI 地点
3. 规划合理的路线顺序
4. 计算预估时间，确保符合用户时间范围
5. 生成详细的行程安排

【工具使用】
- search_pois: 搜索城市中的POI
- route_planning: 计算两个地点之间的路线和时间
- get_user_preferences: 获取用户历史偏好

【规划原则】
1. 优先考虑用户明确提出的需求
2. 结合用户历史偏好进行个性化推荐
3. 确保路线时间逻辑合理（不在时间范围外）
4. 景点之间距离适中，避免过长途程
5. 提供备选方案

【输出格式】
必须返回 JSON 格式：
{
  "routes": [{
    "pois": [{
      "name": "景点名",
      "arrival": "09:30",
      "duration": 120,
      "transport": "步行",
      "reason": "推荐理由"
    }],
    "totalDuration": 480,
    "score": 0.95,
    "summary": "路线总结"
  }],
  "alternatives": [...]
}

【约束】
- 每个 POI 停留时间默认 60-180 分钟
- 出行时间超过 30 分钟需注明交通方式
- 总时长不能超过用户指定的时间范围`;
```

### 4.2 Agent 工作流程

```
1. 接收用户请求 (city, startTime, endTime, preferences, userId)
2. 获取用户历史偏好（调用 get_user_preferences）
3. Intent Agent 处理
   3.1 解析用户偏好，提取关键词
   3.2 生成结构化意图数据
4. Planning Agent 处理（ReAct + Tools）
   4.1 调用 search_pois 搜索相关 POI
   4.2 根据搜索结果，初步筛选 5-8 个候选 POI
   4.3 计算 POI 之间的路线（调用 route_planning）
   4.4 基于时间和偏好，优化 POI 顺序
   4.5 生成 Markdown/自然语言格式的旅行规划
5. Structured Agent 处理
   5.1 解析 Planning Agent 的 Markdown 输出
   5.2 转换为标准 JSON 结构
   5.3 验证 JSON 有效性，无效则重试或降级
6. 返回结构化 JSON 结果给前端
```

### 4.3 Structured Agent 设计

#### 核心职责
1. 接收 Planning Agent 的自然语言输出
2. 解析并转换为标准 JSON 结构
3. 验证 JSON 有效性，无效则重试或降级
4. 返回结构化结果给前端

#### 输入输出
| 项目 | 说明 |
|-----|------|
| **输入** | Planning Agent 的 Markdown/文本输出 |
| **输出** | 标准 JSON 结构（包含 routes, alternatives 等字段） |
| **验证** | 失败时返回降级 JSON 或 error 标记 |

#### 错误处理策略
| 场景 | 处理方式 |
|-----|---------|
| JSON 解析成功 | 直接返回 |
| JSON 解析失败 | 重试 1 次（调整 prompt） |
| 重试仍失败 | 返回降级 JSON + error 标记，保留原始输出 |

### 4.4 错误处理

| 错误情况 | 处理方式 |
|---------|---------|
| Deepseek API 超时 | 返回默认路线（使用高德热门 POI） |
| 高德 API 返回空 | 提示用户"该城市暂无可用数据" |
| 用户未登录 | 返回 401，前端跳转登录页 |
| 参数缺失 | 返回 400，提示缺少参数 |
| Intent Agent 解析失败 | 返回 400，让用户重新描述需求 |
| Planning Agent 工具调用失败 | 降级返回默认路线 |
| Structured Agent 解析失败 | 重试 1 次，仍失败返回 error 标记 + 降级 JSON |

---

## 5. UI/UX 规格

### 5.1 视觉规范

#### 颜色系统

| 变量 | 色值 | 用途 |
|-----|------|-----|
| `--midnight-deep` | #0a0e1a | 页面背景 |
| `--midnight` | #0f1629 | 侧边栏背景 |
| `--navy` | #141e33 | 卡片背景 |
| `--amber` | #f59e0b | 主色调/强调 |
| `--coral` | #f97316 | 次要色调 |
| `--text-bright` | #f8fafc | 主文字 |
| `--text-primary` | #e2e8f0 | 次要文字 |
| `--text-muted` | #94a3b8 | 辅助文字 |
| `--success` | #4ade80 | 起点标记 |
| `--danger` | #e94560 | 终点标记/错误 |

#### 字体

| 用途 | 字体 | 备选 |
|-----|------|-----|
| 标题 | Cormorant Garamond | serif |
| 正文 | DM Sans | system-ui, sans-serif |
| 代码/输出 | DM Sans | monospace |

#### 间距

| 名称 | 值 | 用途 |
|-----|---|-----|
| xs | 4px | 紧凑间距 |
| sm | 8px | 小间距 |
| md | 16px | 中等间距 |
| lg | 24px | 大间距 |
| xl | 32px | 区块间距 |
| 2xl | 48px | 页面边距 |

#### 圆角

| 名称 | 值 | 用途 |
|-----|---|-----|
| sm | 8px | 按钮、输入框 |
| md | 12px | 卡片 |
| lg | 20px | 大卡片 |
| xl | 28px | 主容器 |

### 5.2 组件规格

#### 5.2.1 按钮

```css
.submit-btn {
  background: linear-gradient(135deg, var(--amber) 0%, var(--coral) 100%);
  color: var(--midnight-deep);
  padding: 16px 48px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 1px;
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.3);
  transition: all 0.3s ease;
}

.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

#### 5.2.2 输入框

```css
.form-input {
  background: linear-gradient(135deg, rgba(15, 22, 41, 0.9) 0%, rgba(10, 14, 26, 0.95) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  padding: 16px 18px;
  font-size: 15px;
  color: var(--text-bright);
  transition: all 0.4s ease;
}

.form-input:hover {
  border-color: rgba(245, 158, 11, 0.25);
}

.form-input:focus {
  outline: none;
  border-color: var(--amber);
  box-shadow: 0 0 0 3px var(--amber-soft);
}
```

#### 5.2.3 卡片

```css
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-xl);
  padding: 40px;
  box-shadow: var(--shadow-lg);
}
```

### 5.3 响应式断点

| 断点 | 宽度 | 布局变化 |
|-----|------|---------|
| mobile | < 768px | 单列，侧边栏隐藏 |
| tablet | 768px - 1024px | 双列，侧边栏可折叠 |
| desktop | > 1024px | 完整布局 |

### 5.4 动画规范

| 动画 | 时长 | 缓动 | 用途 |
|-----|------|-----|-----|
| fade | 300ms | ease | 显示/隐藏 |
| slide | 400ms | cubic-bezier(0.4, 0, 0.2, 1) | 侧边栏 |
| scale | 200ms | ease | 标记点 |
| typing | 30ms/char | linear | 打字机效果 |

---

## 6. 验收标准

### 6.1 功能验收

| 功能 | 验收条件 |
|-----|---------|
| 用户注册 | 可以注册并收到 JWT token |
| 用户登录 | 可以登录并保存 token 到 localStorage |
| 表单提交 | 填写完整后点击提交，触发 AI 规划 |
| AI 规划 | 返回结构化路线，包含 3-6 个 POI |
| 地图展示 | 正确显示 POI 标记和路线连线 |
| 打字机效果 | 文字逐字显示，有光标闪烁 |
| 侧边栏 | 显示历史记录，可切换 |

### 6.2 性能验收

| 指标 | 目标 |
|-----|------|
| 首屏加载 | < 3s |
| AI 规划响应 | < 8s (95分位) |
| 地图渲染 | < 1s |
| 打字机效果 | 30ms/字符 |

### 6.3 兼容性验收

| 环境 | 要求 |
|-----|------|
| Chrome | 最新版本 |
| Firefox | 最新版本 |
| Safari | 最新版本 |
| Edge | 最新版本 |
| 移动端 | iOS Safari, Android Chrome |

---

## 7. 项目初始化命令

```bash
# 前端
cd trip-plan-frontend
npm install
npm run dev

# 后端
cd trip-plan-server
npm install
npm run dev
```

---

## 8. 文件清单

### 8.1 前端文件

```
trip-plan-frontend/
├── index.html
├── vite.config.js
├── package.json
├── .env.example
├── public/
└── src/
    ├── main.js
    ├── App.vue
    ├── style.css
    ├── views/
    ├── components/
    ├── stores/
    ├── services/
    └── router/
```

### 8.2 后端文件

```
trip-plan-server/
├── package.json
├── .env.example
├── src/
    ├── index.js
    ├── config/
    ├── routes/
    ├── services/
    ├── middleware/
    ├── db/
    └── utils/
```

---

> 本文档为智能路线规划系统的技术规格，编码前请务必通读并理解全部内容。
