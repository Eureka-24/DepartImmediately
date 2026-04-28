# 智能路线规划系统 - 开发任务清单

> 版本: v1.0
> 日期: 2026-04-27
> 参考: SPEC.md

---

## 开发阶段总览

| 阶段 | 任务 | 周期 | 交付物 |
|-----|------|-----|-------|
| **Phase 1** | 项目初始化与后端基础设施 | Day 1-2 | 后端服务跑通 |
| **Phase 2** | 前端基础架构搭建 | Day 3-4 | Vue 项目 + 路由 |
| **Phase 3** | 认证系统实现 | Day 5-6 | 登录/注册功能 |
| **Phase 4** | AI Agent 核心 | Day 7-9 | Deepseek Function Calling |
| **Phase 5** | 前端功能集成 | Day 10-12 | 表单 + 地图 + 输出 |
| **Phase 6** | 联调与优化 | Day 13-14 | 完整功能可用 |

---

## Phase 1: 项目初始化与后端基础设施 ✅ 完成

### 1.1 后端项目初始化 ✅

```
任务 1.1.1: 创建后端项目结构 ✅
  - 创建目录: server/src/{config,routes,services,middleware,db,utils}
  - 创建 package.json，包含依赖:
    - express
    - @amap/amap-services (amap-lbs-skill)
    - openai (或 Deepseek SDK)
    - better-sqlite3 (开发用)
    - jsonwebtoken
    - bcryptjs
    - dotenv
    - cors
    - nodemon (开发)
  - 创建 .env.example 配置文件模板

任务 1.1.2: 配置加载 ✅
  - 创建 src/config/index.js
  - 从 .env 加载环境变量
  - 导出配置对象

任务 1.1.3: 数据库初始化 ✅
  - 创建 src/db/schema.sql
    - users 表
    - user_preferences 表
    - trip_history 表
  - 创建 src/db/index.js
    - SQLite 连接初始化
    - 表自动创建逻辑
```

### 1.2 后端服务入口 ✅

```
任务 1.2.1: 创建 Express 入口 ✅
  - 创建 src/index.js
  - 配置中间件: cors, json, express.static
  - 挂载路由
  - 错误处理中间件
  - 监听端口

任务 1.2.2: 错误处理中间件 ✅
  - 创建 src/middleware/errorHandler.js
  - 统一错误响应格式: { success: false, error: "message" }
  - 区分 400/401/403/404/500 错误
```

**验收: 后端服务启动成功，访问 /api/health 返回正常 ✅**

---

## Phase 2: 前端基础架构搭建 ✅ 完成

### 2.1 前端项目初始化 ✅

```
任务 2.1.1: 创建 Vue3 + Vite 项目 ✅
  - 使用 npm create vite@latest
  - 选择 Vue + JavaScript 模板
  - 安装依赖:
    - vue-router@4
    - pinia
    - @amap/amap-jsapi-loader (amap-jsapi-skill)
    - flatpickr
    - axios

任务 2.1.2: 配置文件 ✅
  - 创建 .env.example
    - VITE_API_BASE_URL
    - VITE_AMAP_JSAPI_KEY
  - 创建 vite.config.js 配置代理
```

### 2.2 目录结构 ✅

```
任务 2.2.1: 创建目录结构 ✅
  - src/views/
  - src/components/layout/
  - src/components/form/
  - src/components/map/
  - src/components/output/
  - src/stores/
  - src/services/
  - src/router/
  - src/assets/

任务 2.2.2: 迁移全局样式 ✅
  - 将 trip_plan.html 中的 CSS 迁移到 style.css
  - 定义 CSS 变量（颜色、间距、圆角）
  - 保留现有深色主题
```

### 2.3 路由配置 ✅

```
任务 2.3.1: 安装 vue-router ✅
  - 创建 src/router/index.js
  - 配置路由:
    - / -> HomeView (需登录)
    - /login -> LoginView (公开)
    - /register -> RegisterView (公开)

任务 2.3.2: 路由守卫 ✅
  - 全局前置守卫检查登录状态
  - 未登录访问 / 重定向到 /login
```

### 2.4 Pinia 状态管理 ✅

```
任务 2.4.1: 创建 auth store ✅
  - state: user, token, isLoggedIn
  - actions: login(), register(), logout(), fetchProfile()

任务 2.4.2: 创建 trip store ✅
  - state: currentTrip, history[], isLoading
  - actions: submitPlan(), loadHistory()

任务 2.4.3: 创建 preferences store ✅
  - state: preferences
  - actions: fetchPreferences(), updatePreferences()
```

**验收: 前端项目启动，访问 localhost:5173 显示首页（未登录跳转登录页） ✅**

---

## Phase 3: 认证系统实现 ✅ 完成

### 3.1 后端认证 API ✅

```
任务 3.1.1: 用户注册 API ✅
  - POST /api/auth/register
  - 密码 bcrypt 加密
  - 创建用户返回 JWT token

任务 3.1.2: 用户登录 API ✅
  - POST /api/auth/login
  - 验证 email + password
  - 登录成功返回 JWT token

任务 3.1.3: 获取用户信息 ✅
  - GET /api/auth/profile
  - JWT 中间件验证
  - 返回用户信息（不含密码）

任务 3.1.4: 更新用户偏好 ✅
  - PUT /api/auth/preferences
  - JWT 中间件验证
  - 更新 user_preferences 表

任务 3.1.5: JWT 中间件 ✅
  - 创建 src/middleware/auth.js
  - 从 Authorization header 提取 token
  - 验证并解码 JWT
  - 将 userId 挂载到 req
```

### 3.2 前端认证页面 ✅

```
任务 3.2.1: 登录页面 ✅
  - LoginView.vue
  - 表单: email, password
  - 调用 authStore.login()
  - 成功跳转首页，失败显示错误

任务 3.2.2: 注册页面 ✅
  - RegisterView.vue
  - 表单: email, password, confirmPassword
  - 调用 authStore.register()
  - 成功跳转登录页，失败显示错误
```

### 3.3 API 服务封装 ✅

```
任务 3.3.1: API 基础封装 ✅
  - src/services/api.js
  - axios 实例 + 请求/响应拦截器

任务 3.3.2: 认证 API 封装 ✅
  - authApi.login()
  - authApi.register()
  - authApi.getProfile()
  - authApi.updatePreferences()
```

**验收: 可以完成注册、登录、查看个人信息 ✅**

---

## Phase 4: AI Agent 核心（LangChain.js 双 Agent 架构） ✅ 完成

### 技术方案变更
- **原方案**: 单 Agent + 纯手写工具调用循环
- **新方案**: 双 Agent (Intent + Planning) + LangChain.js
- **理由**: LangChain.js 提供开箱即用的 ReAct Agent，自动处理工具调用循环

### 4.1 依赖安装与配置 ✅

```
任务 4.1.1: 安装 LangChain.js 依赖 ✅
  - @langchain/core
  - @langchain/openai
  - langchain

任务 4.1.2: LLM 配置 ✅
  - 创建 src/config/llm.js
  - 配置 Deepseek ChatOpenAI 兼容接口
  - baseURL: https://api.deepseek.com/v1

任务 4.1.3: 更新 .env 配置 ✅
  - DEEPSEEK_API_KEY
  - AMAP_WEBSERVICE_KEY
```

### 4.2 工具函数（LangChain Tool 包装） ✅

```
任务 4.2.1: search_pois 工具 ✅
  - 创建 src/services/tools/searchPois.js
  - 使用 LangChain Tool 包装
  - 调用高德 POI 搜索 API
  - 返回格式化结果: [{ name, location, type, rating }]

任务 4.2.2: route_planning 工具 ✅
  - 创建 src/services/tools/routePlanning.js
  - 使用 LangChain Tool 包装
  - 调用高德路径规划 API
  - 支持 walking/driving/riding/transfer
  - 返回: { distance, duration, path }

任务 4.2.3: userPrefs 工具 ✅
  - 创建 src/services/tools/userPrefs.js
  - 使用 LangChain Tool 包装
  - 从数据库查询用户偏好
  - 返回: { favoriteCities, favoriteTypes, travelStyle }

任务 4.2.4: 工具导出 ✅
  - 创建 src/services/tools/index.js
  - 导出所有工具数组
```

### 4.3 Intent Agent（意图识别） ✅

```
任务 4.3.1: Intent Agent 实现 ✅
  - 创建 src/services/intentAgent.js
  - 使用 LangChain LLM + JSON 解析
  - 无需工具调用，纯 LLM 处理

任务 4.3.2: Intent Schema 定义 ✅
  - 使用 JSON 解析替代 Zod（Deepseek 不支持 withStructuredOutput）
  - 字段: city, startTime, endTime, duration, interests, travelStyle, budget, specialRequirements

任务 4.3.3: 系统提示词 ✅
  - 创建 src/config/prompts.js
  - 包含意图识别角色定义和输出格式要求
```

### 4.4 Planning Agent（旅行规划） ✅

```
任务 4.4.1: Planning Agent 实现 ✅
  - 创建 src/services/planningAgent.js
  - 使用 LangGraph createReactAgent
  - 绑定所有工具

任务 4.4.2: 系统提示词 ✅
  - 包含旅行规划角色定义
  - 工具使用说明
  - 输出格式要求（routes, alternatives）
  - API 限流处理说明

任务 4.4.3: 工具调用测试 ✅
  - 验证 search_pois 被正确调用
  - 验证 route_planning 被正确调用
  - 修复高德 API v3/v4 版本差异
```

### 4.5 Agent Service 与路由 ✅

```
任务 4.5.1: Agent Service（编排主逻辑） ✅
  - 创建 src/services/agentService.js
  - 串联: 用户偏好 → Intent Agent → Planning Agent
  - 保存到 trip_history

任务 4.5.2: Agent 路由 ✅
  - 创建 src/routes/agent.js
  - POST /api/agent/plan
  - JWT 验证
  - 请求体验证
```

### 4.6 错误处理与降级 ✅

```
任务 4.6.1: 超时控制 ✅
  - Deepseek API 超时 15s
  - 降级返回默认路线

任务 4.6.2: API 失败降级 ✅
  - 高德 API 返回空时返回友好提示
  - Planning Agent 工具调用失败降级
  - API 限流时停止调用并使用已有数据

任务 4.6.3: 参数验证 ✅
  - Intent Agent 解析失败返回 400
```

**验收: POST /api/agent/plan 返回完整路线规划** ✅

---

## Phase 5: 前端功能集成 ✅ 完成

### 5.1 表单组件 ✅

```
任务 5.1.1: CitySelect 组件 ✅
  - 创建 src/components/form/CitySelect.vue
  - 自定义下拉选择器
  - 6 个城市: 北京、上海、杭州、成都、西安、重庆
  - 支持键盘导航
  - 与 trip store 联动

任务 5.1.2: DateTimePicker 组件 ✅
  - 创建 src/components/form/DateTimePicker.vue
  - 使用 Flatpickr
  - 深色主题匹配
  - 开始时间: minDate = today
  - 结束时间: minDate = 开始时间

任务 5.1.3: PreferenceInput 组件 ✅
  - 使用原生 textarea
  - 添加 placeholder 引导
  - 高度 120px
```

### 5.2 地图组件 ✅

```
任务 5.2.1: AmapContainer 组件 ✅
  - 创建 src/components/map/AmapContainer.vue
  - 使用 @amap/amap-jsapi-loader 初始化
  - 配置: viewMode: '2D', 深色主题
  - 导出方法:
    - initMap(city): 初始化地图
    - drawRoute(pois): 绘制路线
    - showMarker(poi): 显示标记

任务 5.2.2: POI 标记 ✅
  - 自定义标记样式（带序号）
  - 点击显示 InfoWindow
  - 起点绿色，终点红色

任务 5.2.3: 路线绘制 ✅
  - Polyline 连接各 POI
  - 渐变色线条
  - 绘制完成后 setFitView
```

### 5.3 输出组件 ✅

```
任务 5.3.1: ItineraryOutput 组件 ✅
  - 创建 src/components/output/ItineraryOutput.vue
  - 终端风格展示
  - 实现打字机效果（25ms/字符）
  - 光标闪烁动画
  - 格式化输出内容

任务 5.3.2: 加载状态 ✅
  - 显示 loading overlay
  - 加载动画
```

### 5.4 HomeView 集成 ✅

```
任务 5.4.1: 首页布局 ✅
  - 更新 src/views/HomeView.vue
  - 左侧: 表单区域
  - 中间: 地图区域
  - 下方: 输出区域

任务 5.4.2: 表单提交 ✅
  - 收集表单数据
  - 调用 tripStore.submitPlan()
  - 显示加载状态
  - 完成后触发打字机效果

任务 5.4.3: 侧边栏 ✅
  - 历史记录列表
  - 点击加载历史规划
```

### 5.5 侧边栏组件 ✅

```
任务 5.5.1: AppSidebar 组件 ✅
  - 更新 HomeView.vue 中的侧边栏
  - 显示标题 "Wayfinder"
  - 历史会话列表
  - 点击切换当前会话

任务 5.5.2: 历史记录 ✅
  - 从 tripStore 获取 history
  - 每条显示: 标题、日期
  - 当前选中高亮
```

**验收: 完整流程可运行：填写表单 -> 提交 -> AI规划 -> 地图展示 -> 输出显示** ✅

---

## Phase 6: 联调与优化

### 6.1 联调测试

```
任务 6.1.1: 前后端联调
  - 解决 CORS 问题
  - 确认代理配置正确
  - 测试完整流程

任务 6.1.2: AI Agent 调试
  - 测试 Function Calling 是否正常
  - 确认高德 API 返回数据正确
  - 优化 Prompt 提高准确性
```

### 6.2 性能优化

```
任务 6.2.1: 前端优化
  - 地图使用 2D 模式
  - 减少不必要的 re-render
  - 懒加载路由

任务 6.2.2: 后端优化
  - 添加请求缓存（热门 POI）
  - 数据库索引优化
  - 超时控制
```

### 6.3 UI 细节

```
任务 6.3.1: 样式微调
  - 确保响应式布局正常
  - 移动端侧边栏隐藏/展开
  - 表单输入框焦点效果

任务 6.3.2: 错误提示
  - 表单验证错误提示
  - API 错误友好提示
  - 网络错误重试
```

### 6.4 文档

```
任务 6.4.1: README.md
  - 项目介绍
  - 环境配置说明
  - 启动命令
  - API 文档

任务 6.4.2: 最终验收检查
  - [ ] 用户可以注册和登录
  - [ ] 提交表单后 AI 返回路线规划
  - [ ] 地图正确显示 POI 和路线
  - [ ] 输出区域显示打字机效果
  - [ ] 历史记录可保存和加载
  - [ ] 响应式布局正常
```

**验收: 项目完整可用，符合 SPEC.md 所有功能要求**

---

## 每日任务分配

| 日期 | 任务 |
|-----|------|
| Day 1 | Phase 1: 后端基础设施搭建 |
| Day 2 | Phase 1: 数据库 + 服务入口 |
| Day 3 | Phase 2: Vue 项目初始化 + 路由 |
| Day 4 | Phase 2: Pinia Store + 样式迁移 |
| Day 5 | Phase 3: 后端认证 API |
| Day 6 | Phase 3: 前端登录/注册页面 |
| Day 7 | Phase 4: Deepseek 封装 + 工具函数 |
| Day 8 | Phase 4: AI Agent 核心逻辑 |
| Day 9 | Phase 4: Agent 路由 + Prompt 优化 |
| Day 10 | Phase 5: 表单组件 |
| Day 11 | Phase 5: 地图组件 |
| Day 12 | Phase 5: 输出组件 + HomeView |
| Day 13 | Phase 6: 联调测试 |
| Day 14 | Phase 6: 优化 + README + 验收 |

---

## 注意事项

1. **先跑通再完善**: 每个阶段完成后先验证核心功能，再进行细节优化
2. **API 错误处理**: 所有外部 API 调用都要有错误处理和降级方案
3. **环境变量**: 不要硬编码任何密钥，使用 .env 文件
4. **代码风格**: 遵循 ESLint 配置，保持代码一致
5. **提交规范**: 每完成一个任务记得验证功能正常

---

> 任务清单结束。完成所有任务后，对照 SPEC.md 进行最终验收。
