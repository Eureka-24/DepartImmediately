# Phase 4: AI Agent 核心（LangChain.js 方案）

> 版本: v1.1
> 日期: 2026-04-28
> 状态: 待开发

---

## 1. 架构设计

### 1.1 双 Agent 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer (/api/agent/plan)              │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Intent Agent (LLM Only)                      │
│  输入: 用户偏好 + 历史数据                                        │
│  输出: 结构化意图 { city, timeRange, interests[], style, ... }   │
│  无需工具调用                                                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼ 结构化意图
┌─────────────────────────────────────────────────────────────────┐
│                 Planning Agent (ReAct + Tools)                   │
│  输入: 结构化意图                                                 │
│  工具: search_pois, route_planning, get_user_preferences        │
│  输出: 最终路线规划                                               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Response                                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 技术选型

| 组件 | 选择 | 理由 |
|-----|------|------|
| Agent 框架 | LangChain.js | 内置 ReAct Agent，开箱即用自动工具调用循环 |
| LLM | Deepseek Chat (ChatOpenAI 兼容) | 支持 Function Calling |
| Planning Agent 类型 | LangGraph Prebuilt ReAct Agent | 减少自行实现循环逻辑 |
| Intent Agent 类型 | LangChain LLM + Structured Output | 纯 LLM，无需工具 |

---

## 2. 数据结构设计

### 2.1 Intent Agent 输出（结构化意图）

```json
{
  "city": "hangzhou",
  "startTime": "2026-05-01 09:00",
  "endTime": "2026-05-01 18:00",
  "duration": 540,
  "interests": ["景点", "美食", "拍照"],
  "travelStyle": "休闲",
  "budget": "中等",
  "specialRequirements": "不想太累，适合亲子"
}
```

### 2.2 Planning Agent 输出（最终路线）

```json
{
  "routes": [{
    "pois": [
      {
        "name": "西湖",
        "lng": 120.148287,
        "lat": 30.265221,
        "arrival": "09:30",
        "duration": 120,
        "transport": "步行",
        "reason": "杭州标志性景点，适合休闲"
      }
    ],
    "totalDuration": 540,
    "score": 0.95,
    "summary": "杭州一日休闲游路线"
  }],
  "alternatives": []
}
```

---

## 3. 文件结构

```
backend/server/src/
├── index.js                    # 入口（不变）
├── config/
│   ├── index.js               # 环境变量（不变）
│   ├── llm.js                  # NEW: LLM 配置
│   └── prompts.js             # NEW: 系统提示词
├── routes/
│   └── agent.js               # MODIFIED: 调用 agent 服务
├── services/
│   ├── agentService.js        # NEW: Agent 编排主逻辑
│   ├── intentAgent.js         # NEW: 意图识别 Agent
│   ├── planningAgent.js       # NEW: 旅行规划 Agent（ReAct）
│   └── tools/
│       ├── index.js           # NEW: 工具导出
│       ├── searchPois.js      # MODIFIED: 包装为 LangChain Tool
│       ├── routePlanning.js   # MODIFIED: 包装为 LangChain Tool
│       └── userPrefs.js       # MODIFIED: 包装为 LangChain Tool
├── middleware/                 # 不变
├── db/                         # 不变
└── utils/                      # 不变
```

---

## 4. 依赖配置

### 4.1 新增依赖（package.json）

```json
{
  "dependencies": {
    "@langchain/core": "^0.3.x",
    "@langchain/openai": "^0.3.x",
    "langchain": "^0.3.x"
  }
}
```

### 4.2 环境变量（.env）

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
AMAP_WEBSERVICE_KEY=your_amap_webservice_key
```

---

## 5. 组件详细设计

### 5.1 LLM 配置

**文件**: `src/config/llm.js`

```javascript
import { ChatOpenAI } from '@langchain/openai';

const llm = new ChatOpenAI({
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
  configuration: {
    baseURL: 'https://api.deepseek.com/v1'
  },
  temperature: 0.7
});

export { llm };
```

---

### 5.2 工具定义

**文件**: `src/services/tools/searchPois.js`

```javascript
import { Tool } from '@langchain/core/tools';

export const searchPoisTool = new Tool({
  name: 'search_pois',
  description: '搜索城市中的POI地点，如景点、餐厅、酒店等',
  args: {
    city: { type: 'string', description: '城市名称' },
    keywords: { type: 'string', description: '搜索关键词，多个用逗号分隔' },
    type: { type: 'string', description: 'POI类型：景点、餐饮、住宿、购物' }
  },
  async execute({ city, keywords, type }) {
    // 调用高德 POI API
    return formattedResults;
  }
});
```

**文件**: `src/services/tools/routePlanning.js`

```javascript
import { Tool } from '@langchain/core/tools';

export const routePlanningTool = new Tool({
  name: 'route_planning',
  description: '规划两个位置之间的路线',
  args: {
    origin: { type: 'string', description: '起点经纬度，格式：lng,lat' },
    destination: { type: 'string', description: '终点经纬度，格式：lng,lat' },
    mode: { type: 'string', description: '出行方式：walking/driving/riding/transfer' }
  },
  async execute({ origin, destination, mode }) {
    // 调用高德路径规划 API
    return { distance, duration, path };
  }
});
```

**文件**: `src/services/tools/userPrefs.js`

```javascript
import { Tool } from '@langchain/core/tools';

export const userPrefsTool = new Tool({
  name: 'get_user_preferences',
  description: '获取用户的历史偏好，用于个性化推荐',
  args: {
    user_id: { type: 'string', description: '用户ID' }
  },
  async execute({ user_id }) {
    // 从数据库查询用户偏好
    return { favoriteCities, favoriteTypes, travelStyle };
  }
});
```

**文件**: `src/services/tools/index.js`

```javascript
import { searchPoisTool } from './searchPois.js';
import { routePlanningTool } from './routePlanning.js';
import { userPrefsTool } from './userPrefs.js';

export const tools = [searchPoisTool, routePlanningTool, userPrefsTool];
```

---

### 5.3 Intent Agent

**文件**: `src/services/intentAgent.js`

```javascript
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { llm } from '../config/llm.js';
import { z } from 'zod';

const intentSchema = z.object({
  city: z.string().describe('城市名称'),
  startTime: z.string().describe('开始时间 ISO 格式'),
  endTime: z.string().describe('结束时间 ISO 格式'),
  duration: z.number().describe('总时长（分钟）'),
  interests: z.array(z.string()).describe('兴趣点列表'),
  travelStyle: z.string().describe('旅行风格'),
  budget: z.string().optional().describe('预算'),
  specialRequirements: z.string().optional().describe('特殊需求')
});

const intentPrompt = ChatPromptTemplate.fromMessages([
  ['system', `你是一位专业的旅行规划师，擅长理解用户模糊需求。

【核心能力】
1. 从用户的描述中提取关键信息（城市、时间、偏好）
2. 将模糊描述转化为结构化数据
3. 识别用户可能的兴趣点

【输入格式】
用户输入: {userInput}
历史偏好: {userPrefs}

【输出要求】
必须返回结构化的 JSON 数据，涵盖所有必要信息。`],
  ['user', '用户输入: {userInput}\n历史偏好: {userPrefs}']
]);

const intentAgent = intentPrompt.pipe(
  llm.withStructuredOutput(intentSchema)
);

export async function recognizeIntent(userInput, userPrefs) {
  return await intentAgent.invoke({
    userInput,
    userPrefs: JSON.stringify(userPrefs)
  });
}
```

---

### 5.4 Planning Agent（LangGraph ReAct）

**文件**: `src/services/planningAgent.js`

```javascript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { llm } from '../config/llm.js';
import { tools } from './tools/index.js';

const planningPrompt = `你是一位专业的旅行规划师，擅长根据用户意图规划个性化旅行路线。

【核心能力】
1. 理解 Intent Agent 输出的结构化意图
2. 调用 search_pois 搜索相关 POI
3. 调用 route_planning 计算景点间路线
4. 生成最终路线规划

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
      "lng": 经度,
      "lat": 纬度,
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
}`;

const planningAgent = createReactAgent({
  llm,
  tools,
  prompt: planningPrompt
});

export async function generatePlan(intent) {
  return await planningAgent.invoke({
    input: `请根据以下意图规划旅行路线：\n${JSON.stringify(intent)}`
  });
}
```

---

### 5.5 Agent Service（编排主逻辑）

**文件**: `src/services/agentService.js`

```javascript
import { recognizeIntent } from './intentAgent.js';
import { generatePlan } from './planningAgent.js';
import { db } from '../db/index.js';
import { v4 as uuid } from 'uuid';

export async function handleTripPlanning({ userId, city, startTime, endTime, preferences }) {
  // 1. 获取用户偏好
  const userPrefs = await db.query(
    'SELECT * FROM user_preferences WHERE user_id = ?',
    [userId]
  );

  // 2. Intent Agent 处理
  const intent = await recognizeIntent(preferences, userPrefs);
  intent.city = city || intent.city;
  intent.startTime = startTime;
  intent.endTime = endTime;

  // 3. Planning Agent 处理
  const plan = await generatePlan(intent);

  // 4. 保存到历史记录
  const historyId = uuid();
  await db.run(
    `INSERT INTO trip_history (id, user_id, city, start_time, end_time, preferences, result)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [historyId, userId, city, startTime, endTime, preferences, JSON.stringify(plan)]
  );

  return plan;
}
```

---

### 5.6 Agent 路由

**文件**: `src/routes/agent.js`

```javascript
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { handleTripPlanning } from '../services/agentService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

router.post('/plan', authenticate, async (req, res, next) => {
  try {
    const { city, startTime, endTime, preferences } = req.body;

    if (!city || !startTime || !endTime || !preferences) {
      throw AppError.badRequest('缺少必要参数');
    }

    const result = await handleTripPlanning({
      userId: req.userId,
      city,
      startTime,
      endTime,
      preferences
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
```

---

## 6. 系统提示词配置

**文件**: `src/config/prompts.js`

```javascript
export const systemPrompt = `你是一位专业的旅行规划师，擅长根据用户需求规划个性化旅行路线。

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

---

## 7. 错误处理

| 错误情况 | 处理方式 |
|---------|---------|
| Deepseek API 超时 | 返回默认路线（使用高德热门 POI） |
| 高德 API 返回空 | 提示用户"该城市暂无可用数据" |
| 用户未登录 | 返回 401，前端跳转登录页 |
| 参数缺失 | 返回 400，提示缺少参数 |
| Intent Agent 解析失败 | 返回 400，让用户重新描述需求 |
| Planning Agent 工具调用失败 | 降级返回默认路线 |

---

## 8. 验收标准

| 检查项 | 预期结果 |
|-------|---------|
| POST /api/agent/plan 返回成功 | `{ success: true, data: {...} }` |
| Intent Agent 输出结构化数据 | 包含 city, duration, interests 等字段 |
| Planning Agent 使用工具 | 至少调用一次 search_pois |
| 最终输出包含 3-6 个 POI | routes[0].pois.length >= 3 |
| 路线时间合理 | 总时长不超过用户指定范围 |

---

## 9. 开发任务清单

### 任务 4.1: 依赖安装与配置

```
- [ ] 安装 @langchain/core, @langchain/openai, langchain
- [ ] 配置 LLM（Deepseek endpoint）
- [ ] 更新 .env.example
```

### 任务 4.2: 工具函数（LangChain Tool 包装）

```
- [ ] searchPois.js → 包装为 LangChain Tool
- [ ] routePlanning.js → 包装为 LangChain Tool
- [ ] userPrefs.js → 包装为 LangChain Tool
- [ ] tools/index.js → 导出所有工具
```

### 任务 4.3: Intent Agent

```
- [ ] intentAgent.js → 结构化输出
- [ ] 定义 intentSchema (Zod)
- [ ] 测试意图识别
```

### 任务 4.4: Planning Agent

```
- [ ] planningAgent.js → LangGraph ReAct Agent
- [ ] 配置 prompt
- [ ] 测试工具调用循环
```

### 任务 4.5: Agent Service 与路由

```
- [ ] agentService.js → 编排逻辑
- [ ] routes/agent.js → POST /api/agent/plan
- [ ] 保存到 trip_history
```

### 任务 4.6: 错误处理与降级

```
- [ ] 超时控制（15s）
- [ ] API 失败降级
- [ ] 空结果处理
```

---

> 本文档为 Phase 4 LangChain.js 方案，完成后对照 SPEC.md 进行验收。