# 代码审查报告

## 总体评分: 5.5/10

## 可访问性: 6/10

- 表单使用自定义下拉组件替代原生 `<select>`，缺少 ARIA `role="listbox"`、`aria-expanded`、`aria-selected` 等属性 → 在 `custom-select` 组件上添加适当的 ARIA 属性以提升可访问性
- 日期选择器输入框使用 `readonly` 属性但缺少 `aria-readonly` 或替代方案说明 → 为 flatpickr 输入框添加适当的 ARIA 标签描述
- Emoji 图标用于 POI 列表的时间、评分等元数据标记（`🕐`、`⭐`、`⏳`），屏幕阅读器会直接读出 Unicode 字符 → 替换为 `<span aria-label="...">` 语义的图标或纯文本标签
- 地图容器的 `role` 和 `aria-label` 未定义 → 添加 `role="application"` 和描述性 `aria-label`
- 表单提交按钮缺少 `aria-disabled` 状态表达 → 在 `isLoading` 时设置 `aria-disabled="true"`
- 侧边栏历史会话列表缺少 `role="list"` 和 `role="listitem"` 语义 → 添加适当的 ARIA 角色

## 性能: 5/10

- 高德地图 JS API 直接在组件 mount 时加载，未实现懒加载 → 考虑在用户实际需要交互地图时才加载 API（交互式加载）
- `trip_plan.html` 的 CSS 变量在 `:root` 重复定义，与 Vue 项目的 `style.css` 高度相似但未复用 → 建立统一的 design tokens 文件
- `AmapContainer.vue` 中使用 `watch` 深度监听 `routeData`，每次都触发完整的 `drawRoute` 流程，可能导致重复渲染 → 添加变更检测逻辑，避免不必要的重绘
- 地理编码缓存存储在 `localStorage`，每次组件挂载都尝试加载，大数据量时可能影响初始化性能 → 实现缓存大小限制和 LRU 淘汰
- 外部 CDN 资源（flatpickr、Google Fonts）未配置 `preconnect` 或 `dns-prefetch` → 添加 `<link rel="preconnect">` 减少 DNS 解析延迟
- `trip_store.js` 的 `submitPlan` 每次调用都重新构建完整的 `historyItem` 对象 → 考虑对象复用减少 GC 压力

## 安全性: 5/10

- `trip_plan.html` 中直接使用 `<script src="config.js">` 加载 API 密钥，`config.js` 泄露风险高 → 通过服务器端代理或环境变量注入，避免前端直接暴露密钥
- 用户偏好文本 `preferences` 直接拼接进路线生成逻辑，未做输入长度限制或特殊字符过滤 → 实现输入验证和长度限制防止注入
- `AmapContainer.vue` 的 `InfoWindow` 内容通过模板字符串拼接 POI 数据，若 POI 数据包含用户输入内容则存在 XSS 风险 → 使用 Vue 的模板语法或对输出内容进行转义
- `localStorage` 存储 token 和地理编码缓存，数据未加密存储在浏览器端 → 敏感信息建议加密或使用 sessionStorage 配合后端刷新机制
- API 错误处理中使用 `window.location.href` 进行重定向而非 Vue Router，可能导致 SPA 路由丢失 → 使用 `router.push('/login')` 保持 SPA 导航
- 缺少 CSRF 保护机制，API 请求仅依赖 JWT → 为非简单请求添加 CSRF token

## 代码质量: 6/10

- `trip_plan.html` 和 Vue 项目的 CSS 存在大量重复（如 `.sidebar`、`form-section`、`map-container`），后者应该是前者的模块化重构但未彻底完成 → 抽取为共享的 CSS 模块或 SCSS
- `HomeView.vue` 中的 `getTripTitle` 函数逻辑重复，可抽取为工具函数 → 重构为共享工具函数
- `AmapContainer.vue` 中同时使用 `markers` 和 `polylines` 两个浅引用数组，但在 `destroy` 时未检查地图实例状态 → 添加防御性检查防止报错
- 城市坐标映射在 `AmapContainer.vue` 和 `trip_plan.html` 中各自维护一份，容易产生不一致 → 抽取为共享配置
- `custom-select` 组件没有使用 Vue 的响应式状态管理，直接操作 DOM 更新选中态 → 改用 Vue 响应式系统管理状态
- `handleSubmit` 成功回调中 `currentTripId.value = result.id || result._id || Date.now()` 使用 `Date.now()` 作为 fallback 不够可靠 → 使用稳定的唯一 ID 生成策略
- API 响应结构解析在 `tripStore.submitPlan` 中存在多层 fallback，但缺少统一的响应格式文档 → 建立 TypeScript 类型定义或 JSDoc 文档

## 响应式设计: 5.5/10

- 地图容器最小高度在 768px 断点设为 350px，但 480px 以下的小屏设备未做适配 → 添加 480px 断点样式
- 侧边栏移动端遮挡问题：`sidebar.open` 使用 `transform` 动画，但关闭按钮位置固定在小屏时可能超出视口 → 调整关闭按钮位置或使用媒体查询重新定位
- 表单栅格布局在移动端直接降为单列，但标签和输入框的触摸目标尺寸可能不足 44x44px → 确保触摸目标足够大，并增加间距
- 地图控件（比例尺、工具栏）在小屏上可能重叠或被遮挡 → 使用 `position: absolute` 定位时添加响应式适配
- 删除确认弹窗在移动端位置计算使用固定像素偏移，可能超出视口 → 使用视口相对定位（`viewport center`）并添加边界检测
- 侧边栏的 `z-index: 100` 与加载遮罩的 `z-index: 150` 数值间距过大，后续新增层级难以插入 → 使用更规范的 z-index 层级系统（如 100、110、120）

---

## 优先修复（高优先级）

1. **安全性 - API 密钥泄露风险**：`config.js` 在 `trip_plan.html` 中直接引入，密钥暴露在前端。请移除前端直接引用，改为通过 Vite 环境变量（`VITE_AMAP_JSAPI_KEY`）或后端代理模式。

2. **安全性 - XSS 风险**：`AmapContainer.vue` 中 InfoWindow 内容通过字符串模板拼接用户数据（POI name、description）。请改用 Vue 模板或对内容进行 HTML 转义。

3. **性能 - 地图 API 加载**：`AmapContainer.vue` 在组件 mount 时直接加载高德 JS API，未实现懒加载。建议改为交互式加载（用户点击地图或滚动到视口时加载）。

4. **可访问性 - ARIA 属性缺失**：自定义下拉组件缺少完整的 ARIA 属性（`role="listbox"`、`aria-expanded`、`aria-selected` 等），屏幕阅读器无法正确识别。

5. **代码质量 - 重复代码**：CSS 变量和样式定义在 `trip_plan.html` 和 `style.css` 中重复，维护成本高且容易不一致。请抽取为共享的 CSS/Design Tokens 文件。

---

## 优化建议（中低优先级）

1. **性能优化**：添加 `dns-prefetch` 和 `preconnect` 到 Google Fonts 和 flatpickr CDN，减少连接建立时间。

2. **性能优化**：实现地理编码缓存的大小限制（如最多 100 条），避免 localStorage 无限增长。

3. **响应式设计**：在 480px 及以下添加额外的断点样式，确保小屏设备上地图控件和表单输入有足够的触摸目标尺寸（至少 44x44px）。

4. **代码质量**：抽取 `cityCoordinates` 和 `cityNames` 到共享配置模块，避免在多个地方维护。

5. **可访问性**：将 POI 列表中的 Emoji 图标（`🕐`、`⭐`）替换为带 `aria-label` 的语义化元素或纯文本标签。

6. **安全性**：API 错误重定向登录使用 `window.location.href` 而非 Vue Router，建议统一使用 router.push 保持 SPA 导航。

7. **代码质量**：为 API 响应结构添加 TypeScript 类型定义或 JSDoc 文档，提高代码可维护性和类型安全。