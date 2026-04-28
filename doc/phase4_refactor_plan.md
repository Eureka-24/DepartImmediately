# Phase 4 重构方案：引入 Structured Agent

> 版本: v1.1
> 日期: 2026-04-28
> 状态: 待实施

---

## 1. 背景与问题

### 1.1 当前问题

Planning Agent 被要求直接输出 JSON 格式，但 LLM 更擅长输出自然语言/Markdown 描述的旅行规划。这导致：

- 提示词要求 JSON，但 LLM 倾向于 Markdown 格式
- 输出不稳定，偶尔 Markdown，偶尔 JSON
- 两边拉扯导致解析失败率上升

### 1.2 解决思路

将「生成旅行规划」和「输出格式化」两个职责分离：
- **Planning Agent**: 专注生成高质量的旅行规划描述（Markdown/自然语言）
- **Structured Agent**: 专责将描述转换为标准 JSON 结构

---

## 2. 重构后的双 Agent 架构

```
用户输入
    │
    ▼
Intent Agent（意图理解，输出结构化 intent） ← 保持不变
    │
    ▼
Planning Agent（旅行规划，输出自然语言/Markdown 描述） ← 简化
    │
    ▼
Structured Agent（结构化输出，负责 JSON 格式化和验证） ← 新增
    │
    ▼
返回前端
```

### 各模块职责

| 模块 | 输入 | 输出 | 职责 |
|-----|------|------|------|
| **Intent Agent** | 用户偏好、上下文 | intent 对象 | 理解用户意图，提取结构化参数 |
| **Planning Agent** | intent + POI 数据 | Markdown/自然语言规划描述 | 生成旅行建议、路线、景点描述 |
| **Structured Agent** | Planning Agent 的原始输出 | JSON 格式的结构化结果 | 解析、转换、验证、格式化 |

---

## 3. Structured Agent 设计

### 3.1 核心职责

1. 接收 Planning Agent 的自然语言输出
2. 解析并转换为标准 JSON 结构
3. 验证 JSON 有效性，无效则重试或降级
4. 返回结构化结果给前端

### 3.2 输入输出

| 项目 | 说明 |
|-----|------|
| **输入** | Planning Agent 的 Markdown/文本输出 |
| **输出** | 标准 JSON 结构（包含 routes, alternatives 等字段） |
| **验证** | 失败时返回降级 JSON 或错误标记 |

### 3.3 Prompt 设计

```
你是一个结构化旅行规划输出助手。
输入是一段旅行规划文本，你需要将其转换为 JSON 格式。

【输出格式】
{
  "routes": [
    {
      "day": 1,
      "date": "2026-04-29",
      "theme": "历史文化之旅",
      "pois": [
        { "name": "景点名", "time": "09:00", "duration": "2小时", "description": "描述" }
      ]
    }
  ],
  "alternatives": [],
  "summary": "总体概述"
}

【规则】
1. 严格按照上述 JSON Schema 输出
2. 不要输出任何 Markdown 格式
3. 如果解析失败，返回 { "routes": [], "error": "原因" }
```

### 3.4 错误处理策略

| 场景 | 处理方式 |
|-----|---------|
| JSON 解析成功 | 直接返回 |
| JSON 解析失败 | 重试 1 次（调整 prompt） |
| 重试仍失败 | 返回降级 JSON + error 标记，Planning Agent 结果存 raw 字段 |

---

## 4. 文件变更计划

### 4.1 变更清单

| 文件 | 操作 | 说明 |
|-----|------|------|
| `planningAgent.js` | 修改 | 移除 JSON 输出要求，简化 prompt |
| `structuredAgent.js` | 新增 | 结构化输出 agent |
| `agentService.js` | 修改 | 串联逻辑调整：intent → planning → structured |
| `prompts.js` | 修改 | 更新 Planning Agent prompt，添加 Structured Agent prompt |

### 4.2 详细变更

#### 4.2.1 planningAgent.js（修改）

**变更内容**：
- 移除 `extractResult()` 函数（JSON 解析相关）
- Prompt 简化为生成 Markdown 描述，不要求 JSON 输出
- 输出直接为自然语言规划结果

**修改前后对比**：

| 项目 | 修改前 | 修改后 |
|-----|-------|-------|
| 输出格式 | JSON（强制要求） | Markdown/自然语言 |
| Prompt | 包含 JSON Schema 定义 | 纯旅行规划建议生成 |
| 解析逻辑 | `extractResult()` 函数 | 无，直接返回 LLM 输出 |

#### 4.2.2 structuredAgent.js（新增）

**核心功能**：
- `parse(markdownText)` - 将 Markdown 转换为 JSON
- 重试逻辑（最多 2 次）
- 降级处理（失败时返回 error 标记）

**文件位置**：`src/services/structuredAgent.js`

#### 4.2.3 agentService.js（修改）

**调用流程调整**：

```javascript
// 修改后的流程
async function generatePlan({ city, startTime, endTime, preferences, userId }) {
  // Step 1-3: 保持不变（Intent Agent + 预搜索 POI）

  // Step 4: Planning Agent（输出 Markdown）
  const planningOutput = await planningAgent.generatePlan({ intent, pois, userId });
  // planningOutput 是自然语言/Markdown 描述

  // Step 5: Structured Agent（转换为 JSON） ← 新增
  const structuredResult = await structuredAgent.parse(planningOutput);

  return structuredResult;
}
```

#### 4.2.4 prompts.js（修改）

**新增内容**：
- `structuredAgentPrompt` - Structured Agent 的系统提示词
- 保留 `planningAgentPrompt` - 简化为生成 Markdown 描述

---

## 5. 数据流示例

### 5.1 Planning Agent 输出示例

```markdown
## 📋 北京3日游规划

### Day 1 - 历史文化之旅
- **09:00** 天安门广场
- **12:00** 故宫博物院（游览约3小时）
- **15:00** 景山公园（俯瞰故宫全景）

### Day 2 - 现代都市游
- **09:00** 颐和园
- **13:00** 圆明园遗址

---

总预算建议: ¥1500-2000
最佳出行季节: 春秋两季
```

### 5.2 Structured Agent 输出示例

```json
{
  "routes": [
    {
      "day": 1,
      "date": "2026-04-29",
      "theme": "历史文化之旅",
      "pois": [
        { "name": "天安门广场", "time": "09:00", "duration": "1小时", "description": "世界上最大的城市广场" },
        { "name": "故宫博物院", "time": "12:00", "duration": "3小时", "description": "中国明清两代的皇家宫殿" },
        { "name": "景山公园", "time": "15:00", "duration": "1小时", "description": "可俯瞰故宫全景的最佳位置" }
      ]
    },
    {
      "day": 2,
      "date": "2026-04-30",
      "theme": "现代都市游",
      "pois": [
        { "name": "颐和园", "time": "09:00", "duration": "3小时", "description": "中国皇家园林的典范" },
        { "name": "圆明园遗址", "time": "13:00", "duration": "2小时", "description": "历史遗址公园" }
      ]
    }
  ],
  "alternatives": [],
  "summary": "北京3日游，聚焦历史文化与现代园林体验",
  "budget": "¥1500-2000",
  "bestSeason": "春秋两季"
}
```

---

## 6. API 保持不变

**无需新增/修改 API** - Structured Agent 是内部串联逻辑，前端收到的 response 格式保持不变。

```
前端请求 → POST /api/agent/plan
         ↓
    Intent Agent
         ↓
    Planning Agent
         ↓
    Structured Agent  ← 新增
         ↓
    返回 { success: true, data: {...} }
```

---

## 7. 实施步骤

| 步骤 | 任务 | 说明 |
|-----|------|------|
| 1 | 创建 `src/services/structuredAgent.js` | 新增结构化 agent |
| 2 | 更新 `src/config/prompts.js` | 添加 structuredAgentPrompt |
| 3 | 修改 `src/services/planningAgent.js` | 移除 JSON 输出要求 |
| 4 | 修改 `src/services/agentService.js` | 串联 structuredAgent |
| 5 | 测试完整流程 | 验证 Markdown → JSON 转换 |

---

## 8. 风险与备选方案

### 8.1 风险

| 风险 | 缓解措施 |
|-----|---------|
| Structured Agent 解析失败 | 重试 1 次 + 降级 JSON |
| LLM 输出格式不稳定 | prompt 优化 + 明确规则 |
| 解析结果不完整 | 保留 rawOutput 字段供调试 |

### 8.2 备选方案

如果方案 A（LLM Structured Agent）效果不佳，可切换为：

**方案 B: 规则解析器**
- 使用正则从 Markdown 提取关键信息
- 更快、更可控，但不智能
- 作为最终降级方案

---

> 文档结束