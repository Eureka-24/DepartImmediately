# Structured Agent 重构方案

> 版本: v2.0
> 日期: 2026-04-28
> 状态: 待实施

---

## 1. 背景与目标

### 1.1 当前问题

1. **数据结构不匹配** - 当前 `routes[day].pois` 分层结构与 Planning Agent 输出的 Markdown 不对齐
2. **字段缺失** - 缺少 rating, duration, description, transport 等关键信息
3. **location 格式问题** - 当前使用 `[lng, lat]` 经纬度数组，但用户要求使用地址字符串

### 1.2 目标

重构 Structured Agent 输出格式，使其：
- 输出扁平 POI 列表（按时间顺序）
- 每个 POI 包含完整信息：name, time, rating, duration, description, reason, transport
- location 使用地址字符串（前端通过高德 API 查询坐标）

---

## 2. 新数据结构定义

### 2.1 目标格式

```json
{
  "routes": [
    {
      "name": "北京动物园",
      "location": "西直门外大街137号",
      "time": "第一天（4月28日）17:00 — 19:00",
      "rating": "4.8",
      "duration": "约2小时",
      "description": "经典亲子景点，小朋友超爱看大熊猫！4月底天气舒适，适合户外漫步。\n\n**地址：** 西直门外大街137号\n**交通：** 地铁4号线【动物园站】直达，出站即到",
      "reason": "经典亲子景点，小朋友超爱看大熊猫！4月底天气舒适，适合户外漫步",
      "transport": "起始点"
    },
    {
      "name": "北京环球度假区",
      "location": "通州区梨园镇环球大道",
      "time": "第二天（4月29日）09:00 — 16:00",
      "rating": "4.9",
      "duration": "约7小时",
      "description": "北京顶级亲子乐园！有**小黄人乐园、功夫熊猫盖世之地、侏罗纪世界**等适合小朋友的区域。\n\n**推荐项目：**\n- 🐼 功夫熊猫盖世之地（全年龄）\n- 🟡 小黄人乐园（3岁+）\n- 🦕 侏罗纪世界大冒险（5岁+）\n\n**交通：** 地铁7号线/八通线【环球度假区站】直达",
      "reason": "北京顶级亲子乐园，适合全年龄段亲子家庭，一天时间刚好能玩得尽兴又不赶",
      "transport": "地铁7号线/八通线【环球度假区站】直达"
    }
  ],
  "summary": "北京亲子1日半游，推荐环球度假区+北京动物园组合"
}
```

### 2.2 字段说明

| 字段 | 类型 | 说明 |
|-----|------|------|
| `name` | string | POI 名称 |
| `location` | string | 地址字符串（如 "西直门外大街137号"），非经纬度 |
| `time` | string | 计划时间（如 "第一天（4月28日）17:00 — 19:00"） |
| `rating` | string | 评分（如 "4.8"，带单位） |
| `duration` | string | 时长（如 "约2小时"、"约7小时"） |
| `description` | string | Markdown 格式详细描述，包含地址、交通、注意事项等 |
| `reason` | string | 推荐理由，简短描述 |
| `transport` | string | 交通信息，"起始点" 或交通方式描述 |

---

## 3. 修改计划

### 3.1 Structured Agent 修改

**文件**: `src/services/structuredAgent.js`

| 修改项 | 内容 |
|-------|------|
| Prompt 更新 | 重新定义输出格式 prompt，要求输出扁平 POI 列表 |
| parse() 修改 | 适配新的 JSON 结构 |
| validateResult() 修改 | 验证扁平 POI 结构 |
| getErrorResult() 修改 | 返回新的降级 JSON 格式 |

**Prompt 核心要求**:
- 输出扁平 `routes` 数组（不是按 day 分组）
- 每个 POI 包含: name, location, time, rating, duration, description, reason, transport
- description 使用 Markdown 格式
- transport: 第一个 POI 为 "起始点"，后续为交通方式

### 3.2 prompts.js 修改

**文件**: `src/config/prompts.js`

更新 `structuredAgentPrompt`，新的 JSON Schema:

```javascript
{
  "routes": [
    {
      "name": "景点名称",
      "location": "地址字符串",
      "time": "计划时间",
      "rating": "评分",
      "duration": "时长",
      "description": "Markdown 格式详细描述",
      "reason": "推荐理由",
      "transport": "起始点" | "交通方式描述"
    }
  ],
  "summary": "总体描述"
}
```

### 3.3 前端 ItineraryOutput.vue 修改

**文件**: `frontend/trip-plan-frontend/src/components/output/ItineraryOutput.vue`

| 修改项 | 当前 | 目标 |
|-------|------|------|
| formatResult() | 遍历 `result.routes[0].pois` | 遍历 `result.routes`（扁平） |
| poi 字段 | name, arrival, duration, transport, reason, location | name, time, duration, description, reason, transport, location |
| 显示内容 | arrival 时间 | time 字段（完整时间范围） |
| 新增 | - | description 字段（Markdown 渲染） |

### 3.4 前端 AmapContainer.vue 修改

**文件**: `frontend/trip-plan-frontend/src/components/map/AmapContainer.vue`

| 修改项 | 当前 | 目标 |
|-------|------|------|
| showPois() | `poi.location` 需为 "lng,lat" 格式 | `poi.location` 为地址字符串 |
| 坐标获取 | 直接使用经纬度 | 调用高德地理编码 API 将地址转为坐标 |

**修改说明**:
- AmapContainer 需要具备地址转坐标能力
- 可通过 `AMap.Geocoder` 插件实现
- 对于每个 POI，先调用地理编码获取坐标，再显示标记

---

## 4. 实施步骤

| 步骤 | 任务 | 文件 |
|-----|------|------|
| 1 | 更新 structuredAgentPrompt | `src/config/prompts.js` |
| 2 | 修改 structuredAgent.js | `src/services/structuredAgent.js` |
| 3 | 修改 ItineraryOutput.vue | `src/components/output/ItineraryOutput.vue` |
| 4 | 修改 AmapContainer.vue | `src/components/map/AmapContainer.vue` |
| 5 | 更新 defaultPopularRoute 格式 | `src/config/prompts.js` |
| 6 | 测试完整流程 | - |

---

## 5. 高德地理编码集成（AmapContainer）

### 5.1 需要的插件

```javascript
AMap.Geocoder  // 地址转坐标
```

### 5.2 实现思路

```javascript
// showPois 改造
async function showPois(pois) {
  if (!map.value || !pois || pois.length === 0) return

  clearMarkers()

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i]
    let position

    if (poi.location.includes(',')) {
      // 已经是经纬度格式
      const [lng, lat] = poi.location.split(',').map(Number)
      position = new AMap.LngLat(lng, lat)
    } else {
      // 地址字符串，需要地理编码
      position = await geocodeAddress(poi.location)
    }

    // 创建标记...
  }
}

// 地理编码函数
async function geocodeAddress(address) {
  return new Promise((resolve) => {
    geocoder.getLocation(address, (status, result) => {
      if (status === 'complete' && result.geocodes.length) {
        const { lng, lat } = result.geocodes[0].location
        resolve(new AMap.LngLat(lng, lat))
      } else {
        resolve(null) // 解析失败
      }
    })
  })
}
```

### 5.3 缓存策略

- 已解析的地址缓存到 localStorage
- 避免重复调用地理编码 API
- 缓存 key: `geo_cache_${address}`

---

## 6. 数据流示例

```
Planning Agent 输出 (Markdown)
    ↓
Structured Agent 解析
    ↓
{
  "routes": [
    { name, location, time, rating, duration, description, reason, transport },
    { name, location, time, rating, duration, description, reason, transport }
  ],
  "summary": "..."
}
    ↓
前端接收
    ↓
ItineraryOutput: 显示 Markdown 格式的 description
    ↓
AmapContainer: location 地址 → 高德地理编码 → 显示标记
```

---

## 7. 备选方案

如果高德地理编码 API 调用频繁导致性能问题，可以：

1. **延迟加载**: 先显示列表，地图标记在用户滚动到地图区域时才解析坐标
2. **批量编码**: 收集所有地址，一次性批量调用
3. **降级显示**: 地理编码失败时显示城市中心点，不阻塞地图显示

---

> 文档结束