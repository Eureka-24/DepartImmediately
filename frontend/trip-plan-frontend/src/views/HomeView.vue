<template>
  <div class="home-view">
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <div class="sidebar-logo-icon">✦</div>
          <div>
            <h2>Wayfinder</h2>
            <div class="sidebar-subtitle">智能路线规划</div>
          </div>
        </div>
        <div class="user-info">
          <span class="user-email">{{ authStore.user?.username || '未登录' }}</span>
        </div>
      </div>
      <div class="session-header">
        <span class="session-label">历史会话</span>
        <button class="new-session-btn" @click="handleNewSession" title="新建会话">
          +
        </button>
      </div>
      <div class="session-list">
        <div
          v-for="item in history"
          :key="item.id"
          class="session-item"
          :class="{ active: currentTripId === item.id, pending: item.status === 'pending' || item.status === 'processing' }"
          @click="loadTrip(item)"
        >
          <div class="session-content">
            <div class="session-title">
              {{ item.title || getTripTitle(item) }}
              <span v-if="item.status === 'pending'" class="status-badge pending">规划中</span>
              <span v-else-if="item.status === 'processing'" class="status-badge processing">处理中</span>
              <span v-else-if="item.status === 'failed'" class="status-badge failed">失败</span>
            </div>
            <div class="session-date">{{ formatDate(item.createdAt) }}</div>
          </div>
          <div class="session-status-indicator" v-if="item.status === 'pending' || item.status === 'processing'">
            <div class="spinner"></div>
          </div>
          <button class="delete-session-btn" @click.stop="handleDeleteSession(item.id, $event)" title="删除">×</button>
        </div>
        <div v-if="history.length === 0" class="session-item empty">
          <div class="session-title">暂无历史记录</div>
        </div>
      </div>
      <div class="sidebar-footer">
        <button class="logout-btn" @click="handleLogout">
          退出登录
        </button>
      </div>
    </aside>

    <main class="main-content">
      <button class="menu-toggle" @click="toggleSidebar">☰</button>

      <section class="form-section">
        <div class="form-container">
          <div class="form-header">
            <h1 class="form-title">智能旅行<span class="form-title-accent">路线规划</span></h1>
            <p class="form-subtitle">基于 AI 个性化定制您的专属旅程</p>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label for="city">旅行城市</label>
              <div class="custom-select" :class="{ open: cityDropdownOpen }" @click="toggleCityDropdown">
                <div class="custom-select-trigger">
                  <span>{{ cityOptions.find(o => o.value === formData.city)?.label || '请选择城市' }}</span>
                  <span class="custom-select-arrow">▼</span>
                </div>
                <div v-if="cityDropdownOpen" class="custom-select-options">
                  <div
                    v-for="option in cityOptions"
                    :key="option.value"
                    class="custom-select-option"
                    :class="{ selected: formData.city === option.value }"
                    @click.stop="selectCity(option.value)"
                  >
                    {{ option.label }}
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label for="startTime">出发时间</label>
              <DateTimePicker
                v-model="formData.startTime"
                id="startTime"
                placeholder="选择出发时间"
              />
            </div>

            <div class="form-group">
              <label for="endTime">结束时间</label>
              <DateTimePicker
                v-model="formData.endTime"
                id="endTime"
                placeholder="选择结束时间"
              />
            </div>

            <div class="form-group full-width">
              <label for="preferences">旅行偏好描述</label>
              <textarea
                id="preferences"
                v-model="formData.preferences"
                placeholder="请描述您的旅行偏好，例如：休闲度假、喜欢自然风光、想逛商业街、拍照出片、亲子游等..."
                required
              ></textarea>
            </div>

            <div class="form-group full-width" style="align-items: center;">
              <button
                type="button"
                class="submit-btn"
                @click="handleSubmit"
                :disabled="isLoading"
              >
                {{ isLoading ? '规划中...' : '生成路线规划' }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="map-section">
        <div class="map-wrapper">
          <div class="section-header">
            <h2 class="section-title">路线地图</h2>
            <span class="map-badge">高德地图</span>
          </div>
          <div class="map-toolbar">
            <div class="toolbar-search-row">
              <PoiSearchBar
                :addedPoiNames="addedPoiNames"
                @poi-select="handlePoiSelect"
                @search-results="handleSearchResults"
                @search-select="handleSearchSelect"
              />
            </div>
            <div class="toolbar-actions-row">
              <div class="toolbar-info">
                <span v-if="!canAddMorePois" class="toolbar-hint">
                  已达到景点添加上限（原始景点 + 3个）
                </span>
              </div>
              <div class="toolbar-actions">
                <button
                  class="toolbar-btn add-btn"
                  :disabled="!selectedSearchPoi || !canAddMorePois"
                  @click="handleAddSelected"
                >
                  添加{{ !canAddMorePois ? ` (${addedPois.length}/${pendingDeletePois.size + 3})` : '' }}
                </button>
                <button
                  class="toolbar-btn delete-btn"
                  :class="{ active: deleteMode }"
                  @click="handleDeleteModeToggle"
                >
                  {{ deleteMode ? '删除' : '批量删除' }}
                </button>
                <button
                  class="toolbar-btn confirm-btn"
                  :disabled="!hasChanges"
                  @click="handleConfirmReplan"
                >
                  确认重新规划
                </button>
              </div>
            </div>
          </div>
          <div class="map-container">
            <AmapContainer
              ref="mapRef"
              :city="formData.city"
              :pois="allRoutePois"
              :routeData="currentResult?.result || null"
              :searchResults="searchResults"
              :selectedSearchPoi="selectedSearchPoi"
              :selectedPois="selectedPois"
              @map-ready="onMapReady"
              @search-marker-click="handleSearchMarkerClick"
              @route-marker-click="handleRouteMarkerClick"
            />
            <!-- POI详情边栏 -->
            <div v-if="selectedPoiDetail" class="poi-detail-sidebar">
              <div class="poi-detail-header">
                <h3 class="poi-detail-title">{{ selectedPoiDetail.name }}</h3>
                <button class="poi-detail-close" @click="selectedPoiDetail = null">×</button>
              </div>
              <div class="poi-detail-body">
                <div class="poi-detail-row" v-if="selectedPoiDetail.type">
                  <span class="poi-detail-label">类型</span>
                  <span class="poi-detail-value">{{ selectedPoiDetail.type }}</span>
                </div>
                <div class="poi-detail-row" v-if="selectedPoiDetail.rating">
                  <span class="poi-detail-label">评分</span>
                  <span class="poi-detail-value">⭐ {{ selectedPoiDetail.rating }}</span>
                </div>
                <div class="poi-detail-row" v-if="selectedPoiDetail.address">
                  <span class="poi-detail-label">地址</span>
                  <span class="poi-detail-value">{{ selectedPoiDetail.address }}</span>
                </div>
                <div class="poi-detail-row" v-if="selectedPoiDetail.time">
                  <span class="poi-detail-label">游览时间</span>
                  <span class="poi-detail-value">{{ selectedPoiDetail.time }}</span>
                </div>
                <div class="poi-detail-row" v-if="selectedPoiDetail.duration">
                  <span class="poi-detail-label">停留时长</span>
                  <span class="poi-detail-value">{{ selectedPoiDetail.duration }}</span>
                </div>
                <div class="poi-detail-row" v-if="selectedPoiDetail.reason">
                  <span class="poi-detail-label">推荐理由</span>
                  <span class="poi-detail-value">{{ selectedPoiDetail.reason }}</span>
                </div>
                <div class="poi-detail-actions">
                  <button
                    v-if="!selectedPoiDetail._isPendingDelete && selectedPoiDetail._isOriginal"
                    class="poi-detail-btn delete"
                    @click="handleDeleteFromDetail"
                  >
                    删除此景点
                  </button>
                  <button
                    v-if="selectedPoiDetail._isPendingDelete"
                    class="poi-detail-btn restore"
                    @click="handleRestoreFromDetail"
                  >
                    恢复此景点
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="output-section">
        <div class="output-container">
          <ItineraryOutput
            :result="currentResult?.result || null"
            :status="currentResult?.status || null"
            placeholder="请填写上方表单，点击「生成路线规划」开始智能规划..."
            @switch-transport="handleSwitchTransport"
          />
        </div>
      </section>
    </main>

    <div class="loading-overlay" :class="{ active: isLoading }">
      <div class="loader"></div>
      <span class="loader-text">AI 规划中，请稍候...</span>
    </div>

    <!-- 自定义删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="deletePopup.show" class="delete-popup-overlay" @click="cancelDelete">
        <div class="delete-popup" :style="deletePopup.position" @click.stop>
          <div class="delete-popup-content">
            <p class="delete-popup-text">确定要删除这个会话吗？</p>
            <div class="delete-popup-actions">
              <button class="delete-popup-cancel" @click="cancelDelete">取消</button>
              <button class="delete-popup-confirm" @click="confirmDelete">删除</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- POI删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="poiDeletePopup.show" class="poi-delete-popup-overlay" @click="cancelPoiDelete">
        <div class="poi-delete-popup" @click.stop>
          <div class="poi-delete-popup-content">
            <div class="poi-delete-popup-header">
              <h3 class="poi-delete-popup-title">确认删除</h3>
              <button class="poi-delete-popup-close" @click="cancelPoiDelete">×</button>
            </div>
            <div class="poi-delete-popup-body">
              <p class="poi-delete-popup-text" v-if="poiDeletePopup.originalNames.length > 0 || poiDeletePopup.userAddedNames.length > 0">
                确定要删除以下景点吗？
              </p>
              <ul class="poi-delete-popup-list" v-if="poiDeletePopup.originalNames.length > 0">
                <li class="poi-delete-popup-item" v-for="name in poiDeletePopup.originalNames" :key="name">
                  <span class="poi-delete-popup-icon">🗑</span>
                  <span class="poi-delete-popup-name">{{ name }}</span>
                  <span class="poi-delete-popup-hint">（可恢复）</span>
                </li>
              </ul>
              <ul class="poi-delete-popup-list danger" v-if="poiDeletePopup.userAddedNames.length > 0">
                <li class="poi-delete-popup-item" v-for="name in poiDeletePopup.userAddedNames" :key="name">
                  <span class="poi-delete-popup-icon">🗑</span>
                  <span class="poi-delete-popup-name">{{ name }}</span>
                  <span class="poi-delete-popup-hint">（不可恢复）</span>
                </li>
              </ul>
              <p class="poi-delete-popup-warning" v-if="poiDeletePopup.originalNames.length > 0">
                ⚠️ 删除后可在地图上点击灰色标记恢复
              </p>
            </div>
            <div class="poi-delete-popup-actions">
              <button class="poi-delete-popup-cancel" @click="cancelPoiDelete">取消</button>
              <button class="poi-delete-popup-confirm" @click="confirmPoiDelete">确认删除</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTripStore } from '../stores/trip'
import AmapContainer from '../components/map/AmapContainer.vue'
import ItineraryOutput from '../components/output/ItineraryOutput.vue'
import DateTimePicker from '../components/common/DateTimePicker.vue'
import PoiSearchBar from '../components/common/PoiSearchBar.vue'

const router = useRouter()
const authStore = useAuthStore()
const tripStore = useTripStore()

const mapRef = ref(null)
const sidebarOpen = ref(false)
const currentTripId = ref(null)

// 搜索相关状态
const searchResults = ref([])
const selectedSearchPoi = ref(null) // 当前搜索选中的 POI（地图上显示蓝色虚线）
const addedPoiNames = ref(new Set()) // 已添加的 POI 名称集合
const addedPois = ref([]) // 用户添加的 POI 列表

// 路线相关状态
const selectedPois = ref(new Set()) // 当前选中的路线景点（用于删除）
const pendingDeletePois = ref(new Set()) // 待删除的原始景点名称集合
const selectedPoiDetail = ref(null) // 当前选中的POI详情（用于边栏显示）
const deleteMode = ref(false) // 批量删除模式

// 是否有待确认的增删操作
const hasChanges = computed(() => {
  return addedPois.value.length > 0 || pendingDeletePois.value.size > 0
})

// 是否可以继续添加POI
// 限制条件：总景点数(剩余原始 + 已添加) < 原始景点数 + 3
// 即：addedPois.length < (pendingDeletePois.size + 3)
const canAddMorePois = computed(() => {
  return addedPois.value.length < pendingDeletePois.value.size + 3
})

// 获取原始路线景点（用于地图显示）
const originalRoutePois = computed(() => {
  if (!currentResult.value?.result?.routes) return []
  return currentResult.value.result.routes.map((poi, index) => ({
    ...poi,
    _isOriginal: true,
    _index: index
  }))
})

// 合并展示的景点（原始 + 新增），用于地图显示
const allRoutePois = computed(() => {
  const original = originalRoutePois.value.map(poi => ({
    ...poi,
    _isUserAdded: false,
    _isPendingDelete: pendingDeletePois.value.has(poi.name)
  }))
  const userAdded = addedPois.value.map((poi, index) => ({
    ...poi,
    _isOriginal: false,
    _isUserAdded: true,
    _isPendingDelete: false,
    _index: original.length + index
  }))
  return [...original, ...userAdded]
})

// 当前结果
const currentResult = computed(() => {
  if (!currentTripId.value) return null
  const trip = history.value.find(h => h.id === currentTripId.value)
  return trip || null
})

// 删除确认弹窗状态
const deletePopup = ref({
  show: false,
  id: null,
  position: { top: '0px', left: '0px' }
})

// POI删除确认弹窗状态
const poiDeletePopup = ref({
  show: false,
  originalNames: [],  // 原始景点名称（可恢复）
  userAddedNames: []  // 用户添加的景点名称（不可恢复）
})

const isLoading = computed(() => tripStore.isLoading)
const history = computed(() => tripStore.history || [])

// 城市下拉选项
const cityOptions = [
  { value: 'beijing', label: '北京' },
  { value: 'shanghai', label: '上海' },
  { value: 'hangzhou', label: '杭州' },
  { value: 'chengdu', label: '成都' },
  { value: 'xian', label: '西安' },
  { value: 'chongqing', label: '重庆' }
]

const cityDropdownOpen = ref(false)

function toggleCityDropdown() {
  cityDropdownOpen.value = !cityDropdownOpen.value
}

function selectCity(value) {
  formData.city = value
  cityDropdownOpen.value = false
}

function handleClickOutside(event) {
  if (!event.target.closest('.custom-select')) {
    cityDropdownOpen.value = false
  }
}

const formData = reactive({
  city: '',
  startTime: '',
  endTime: '',
  preferences: ''
})

onMounted(async () => {
  // Auth state is now handled by router guard initialization
  await loadHistory()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function getTripTitle(item) {
  const cityNames = {
    beijing: '北京',
    shanghai: '上海',
    hangzhou: '杭州',
    chengdu: '成都',
    xian: '西安',
    chongqing: '重庆'
  }
  return cityNames[item.city] || item.city + ' 旅行'
}

function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}/${month}/${day}`
}

async function loadHistory() {
  await tripStore.loadHistory()
}

function loadTrip(trip) {
  currentTripId.value = trip.id || trip._id
  // currentResult 现在是 computed，会自动从 history 中获取最新数据

  formData.city = trip.city || ''
  formData.startTime = trip.startTime || ''
  formData.endTime = trip.endTime || ''
  formData.preferences = trip.preferences || ''
}

async function handleSubmit() {
  if (!formData.city || !formData.startTime || !formData.endTime || !formData.preferences) {
    alert('请填写完整信息')
    return
  }

  if (new Date(formData.endTime) <= new Date(formData.startTime)) {
    alert('结束时间必须晚于开始时间')
    return
  }

  const result = await tripStore.submitPlan(
    formData.city,
    formData.startTime,
    formData.endTime,
    formData.preferences
  )

  if (result) {
    currentTripId.value = result.id || result._id || Date.now()
    await loadHistory()
  }
}

function onMapReady(map) {
  // 地图就绪
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

function handleNewSession() {
  currentTripId.value = null
  formData.city = ''
  formData.startTime = ''
  formData.endTime = ''
  formData.preferences = ''
  searchResults.value = []
  selectedSearchPoi.value = null
  addedPoiNames.value = new Set()
  addedPois.value = []
  selectedPois.value = new Set()
  pendingDeletePois.value = new Set()
  deleteMode.value = false
}

function handlePoiSelect(poi) {
  // 用户从列表选择 POI → 从搜索结果移除
  searchResults.value = searchResults.value.filter(p => p.name !== poi.name)
}

function handleSearchResults(results) {
  searchResults.value = results
}

// 处理搜索选中状态变化（用户点击列表项）
function handleSearchSelect(poi) {
  selectedSearchPoi.value = poi
}

// 添加选中的 POI 到已添加列表
function handleAddSelected() {
  if (!selectedSearchPoi.value) return
  if (!canAddMorePois.value) {
    alert(`最多只能添加 ${pendingDeletePois.size + 3} 个景点`)
    return
  }
  const poi = selectedSearchPoi.value
  addedPois.value.push(poi)
  addedPoiNames.value = new Set([...addedPoiNames.value, poi.name])
  selectedSearchPoi.value = null
  refreshRouteMarkers()
}

// 刷新地图上的路线标记
function refreshRouteMarkers() {
  if (!mapRef.value) return

  const allPois = allRoutePois.value
  const poisWithPosition = allPois.map(p => ({
    ...p,
    _position: p.lng && p.lat ? new window.AMap.LngLat(p.lng, p.lat) : null
  }))

  mapRef.value.showPoisWithCoords(poisWithPosition)
}

// 确认重新规划
async function handleConfirmReplan() {
  if (!hasChanges.value) return

  const remainingOriginalPois = originalRoutePois.value
    .filter(p => !pendingDeletePois.value.has(p.name))
    .map(p => ({
      name: p.name,
      location: p.location,
      lng: p.lng,
      lat: p.lat,
      type: p.type
    }))

  const userAddedPois = addedPois.value.map(p => ({
    name: p.name,
    location: p.location,
    lng: p.lng,
    lat: p.lat,
    type: p.type
  }))

  const allPois = [...remainingOriginalPois, ...userAddedPois]

  const trip = currentResult.value
  const result = await tripStore.replan(
    trip.city,
    trip.startTime,
    trip.endTime,
    trip.preferences,
    allPois
  )

  if (result) {
    currentTripId.value = result.id || Date.now()
    addedPois.value = []
    addedPoiNames.value = new Set()
    selectedPois.value = new Set()
    pendingDeletePois.value = new Set()
    searchResults.value = []
    selectedSearchPoi.value = null
  }
}

function handleSearchMarkerClick(poi) {
  selectedSearchPoi.value = null
}

// 处理路线标记点击
function handleRouteMarkerClick(poi) {
  const name = poi.name

  if (poi._isPendingDelete) {
    restorePoi(name)
    selectedPoiDetail.value = null
    return
  }

  if (deleteMode.value) {
    // 批量删除模式：点击切换选中状态
    const newSelected = new Set(selectedPois.value)
    if (newSelected.has(name)) {
      newSelected.delete(name)
      if (selectedPoiDetail.value?.name === name) {
        selectedPoiDetail.value = null
      }
    } else {
      newSelected.add(name)
      selectedPoiDetail.value = poi
    }
    selectedPois.value = newSelected
  } else {
    // 普通模式：点击选中 POI，显示在右边栏
    if (selectedPois.value.has(name)) {
      selectedPois.value = new Set()
      selectedPoiDetail.value = null
    } else {
      selectedPois.value = new Set([name])
      selectedPoiDetail.value = poi
    }
  }

  refreshRouteMarkers()
}

// 切换批量删除模式
function handleDeleteModeToggle() {
  if (deleteMode.value) {
    // 当前是批量删除模式，点击"删除"执行删除
    if (selectedPois.value.size > 0) {
      handleDeleteSelected()
    }
    deleteMode.value = false
    selectedPois.value = new Set()
  } else {
    // 进入批量删除模式
    deleteMode.value = true
    selectedPois.value = new Set()
    selectedPoiDetail.value = null
  }
  refreshRouteMarkers()
}

// 删除选中的景点（显示确认弹窗）
function handleDeleteSelected() {
  if (selectedPois.value.size === 0) return

  // 区分原始景点和新添加景点
  const originalNames = []
  const userAddedNames = []

  selectedPois.value.forEach(name => {
    // 检查是原始景点还是用户添加的
    const isOriginal = originalRoutePois.value.some(p => p.name === name)
    if (isOriginal) {
      originalNames.push(name)
    } else {
      userAddedNames.push(name)
    }
  })

  // 显示确认弹窗
  poiDeletePopup.value = {
    show: true,
    originalNames,
    userAddedNames
  }
}

// 确认删除 POI
function confirmPoiDelete() {
  const { originalNames, userAddedNames } = poiDeletePopup.value

  originalNames.forEach(name => {
    pendingDeletePois.value = new Set([...pendingDeletePois.value, name])
  })

  if (userAddedNames.length > 0) {
    addedPois.value = addedPois.value.filter(p => !userAddedNames.includes(p.name))
    userAddedNames.forEach(name => {
      addedPoiNames.value = new Set([...addedPoiNames.value].filter(n => n !== name))
    })
  }

  selectedPois.value = new Set()
  selectedPoiDetail.value = null
  poiDeletePopup.value.show = false
  deleteMode.value = false

  refreshRouteMarkers()
}

// 取消删除 POI
function cancelPoiDelete() {
  poiDeletePopup.value.show = false
  selectedPois.value = new Set()
  deleteMode.value = false
}

// 恢复待删除的原始景点
function restorePoi(name) {
  if (!pendingDeletePois.value.has(name)) return
  pendingDeletePois.value = new Set([...pendingDeletePois.value].filter(n => n !== name))
  refreshRouteMarkers()
}

// 从详情边栏删除景点
function handleDeleteFromDetail() {
  if (!selectedPoiDetail.value) return
  const name = selectedPoiDetail.value.name
  selectedPois.value = new Set([name])
  handleDeleteSelected()
  selectedPoiDetail.value = null
}

// 从详情边栏恢复景点
function handleRestoreFromDetail() {
  if (!selectedPoiDetail.value) return
  restorePoi(selectedPoiDetail.value.name)
  selectedPoiDetail.value = null
}

function handleDeleteSession(id, event) {
  const rect = event.target.getBoundingClientRect()
  deletePopup.value = {
    show: true,
    id: id,
    position: {
      top: `${rect.top - 80}px`,
      left: `${rect.left - 60}px`
    }
  }
}

async function confirmDelete() {
  const id = deletePopup.value.id
  deletePopup.value.show = false
  if (id) {
    await tripStore.deleteSession(id)
    if (currentTripId.value === id) {
      handleNewSession()
    }
  }
}

function cancelDelete() {
  deletePopup.value.show = false
}

async function handleSwitchTransport({ index, mode }) {
  if (!currentResult.value?.result?.routes) return

  const routes = currentResult.value.result.routes
  if (index >= routes.length - 1) return

  const fromPoi = routes[index]
  const toPoi = routes[index + 1]

  const segment = await tripStore.fetchRouteSegment(
    { name: fromPoi.name, lng: fromPoi.lng, lat: fromPoi.lat, departure_time: fromPoi.departure_time },
    { name: toPoi.name, lng: toPoi.lng, lat: toPoi.lat },
    mode,
    fromPoi.departure_time
  )

  if (segment) {
    // Use store method to ensure Vue reactivity
    tripStore.updateRouteSegment(currentTripId.value, index, segment)
    // 触发更新地图路线
    if (mapRef.value) {
      mapRef.value.drawRoute(currentResult.value.result)
    }
  }
}
</script>

<style scoped>
.home-view {
  display: flex;
  min-height: 100vh;
}

.sidebar-footer {
  padding: 20px;
  border-top: 1px solid var(--card-border);
}

.logout-btn {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.logout-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.user-info {
  padding: 8px 16px;
  border-top: 1px solid var(--card-border);
}

.user-email {
  font-size: 12px;
  color: var(--text-muted);
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.session-label {
  font-size: 11px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.new-session-btn {
  width: 24px;
  height: 24px;
  background: var(--amber);
  border: none;
  border-radius: 50%;
  color: var(--midnight-deep);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.new-session-btn:hover {
  transform: scale(1.1);
  background: var(--coral);
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}

.session-item:hover {
  background: var(--glass);
}

.session-item.active {
  background: var(--glass);
  border-left-color: var(--amber);
}

.session-content {
  flex: 1;
  overflow: hidden;
}

.status-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  margin-left: 6px;
  vertical-align: middle;
}

.status-badge.pending {
  background: rgba(245, 158, 11, 0.2);
  color: var(--amber, #f59e0b);
}

.status-badge.processing {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.status-badge.failed {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.session-status-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(245, 158, 11, 0.2);
  border-top-color: var(--amber, #f59e0b);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.session-item.pending {
  opacity: 0.8;
}

.session-item.pending .session-title {
  color: var(--text-muted, #94a3b8);
}

.delete-session-btn {
  width: 20px;
  height: 20px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-dim);
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-item:hover .delete-session-btn {
  opacity: 1;
}

.delete-session-btn:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: white;
}

.loading-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 26, 0.92);
  z-index: 150;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  gap: 20px;
}

.loading-overlay.active {
  display: flex;
}

.loader {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(245, 158, 11, 0.15);
  border-top-color: var(--amber);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loader-text {
  color: var(--text-muted);
  font-size: 14px;
  letter-spacing: 1px;
}

.session-item.empty {
  opacity: 0.5;
  cursor: default;
}

.session-item.empty:hover {
  transform: none;
  background: var(--glass);
}

/* 自定义城市选择下拉框样式 */
.custom-select {
  position: relative;
  width: 100%;
  cursor: pointer;
}

.custom-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--card-bg, rgba(20, 30, 51, 0.6));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
  border-radius: var(--radius-md, 12px);
  color: var(--text-primary, #e2e8f0);
  font-size: 14px;
  transition: all 0.2s ease;
}

.custom-select-trigger:hover {
  border-color: var(--amber, #f59e0b);
}

.custom-select.open .custom-select-trigger {
  border-color: var(--amber, #f59e0b);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.custom-select-arrow {
  font-size: 10px;
  color: var(--text-muted, #94a3b8);
  transition: transform 0.2s ease;
}

.custom-select.open .custom-select-arrow {
  transform: rotate(180deg);
}

.custom-select-options {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--card-bg, rgba(20, 30, 51, 0.98));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--radius-md, 12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
  overflow: hidden;
  animation: dropdownFadeIn 0.2s ease;
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.custom-select-option {
  padding: 12px 16px;
  font-size: 14px;
  color: var(--text-primary, #e2e8f0);
  transition: all 0.15s ease;
}

.custom-select-option:hover {
  background: var(--amber, #f59e0b);
  color: var(--midnight-deep, #0a0e1a);
}

.custom-select-option.selected {
  background: rgba(245, 158, 11, 0.15);
  color: var(--amber, #f59e0b);
}

/* 删除确认弹窗 */
.delete-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: transparent;
}

.delete-popup {
  position: fixed;
  z-index: 1001;
  min-width: 160px;
}

.delete-popup-content {
  background: var(--card-bg, rgba(20, 30, 51, 0.98));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--radius-md, 12px);
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.delete-popup-text {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-primary, #e2e8f0);
}

.delete-popup-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.delete-popup-cancel,
.delete-popup-confirm {
  padding: 6px 14px;
  border-radius: var(--radius-sm, 8px);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.delete-popup-cancel {
  background: transparent;
  border-color: var(--card-border, rgba(255, 255, 255, 0.1));
  color: var(--text-muted, #94a3b8);
}

.delete-popup-cancel:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

.delete-popup-confirm {
  background: var(--danger, #ef4444);
  color: white;
}

.delete-popup-confirm:hover {
  background: #dc2626;
}

.map-section {
  padding: 24px 48px;
  position: relative;
}

.map-wrapper {
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #e2e8f0);
  margin: 0;
}

.map-badge {
  font-size: 11px;
  color: var(--text-dim, #64748b);
  background: rgba(255, 255, 255, 0.03);
  padding: 4px 10px;
  border-radius: 12px;
}

.map-toolbar {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toolbar-search-row {
  width: 100%;
}

.toolbar-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-info {
  flex: 1;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.toolbar-hint {
  padding: 6px 12px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-sm, 8px);
  color: var(--amber, #f59e0b);
  font-size: 12px;
}

.toolbar-btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-md, 12px);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-btn {
  background: var(--amber, #f59e0b);
  color: var(--midnight-deep, #0a0e1a);
}

.add-btn:hover:not(:disabled) {
  background: var(--coral, #f97316);
}

.delete-btn {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.delete-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

.delete-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.delete-btn.active {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
}

.delete-btn.active:hover {
  background: #dc2626;
}

.confirm-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-primary, #e2e8f0);
}

.confirm-btn:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: var(--amber, #f59e0b);
}

.map-container {
  width: 100%;
  background: var(--card-bg);
  border-radius: var(--radius-xl);
  overflow: hidden;
  height: 520px;
  position: relative;
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.04);
  box-shadow: var(--shadow-lg);
}

/* POI详情边栏样式 */
.poi-detail-sidebar {
  position: absolute;
  right: 0;
  top: 0;
  width: 300px;
  height: 100%;
  background: rgba(10, 14, 26, 0.95);
  backdrop-filter: blur(12px);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  animation: slideIn 0.25s ease;
  z-index: 10;
  display: flex;
  flex-direction: column;
}

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.poi-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.poi-detail-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-bright, #f8fafc);
  margin: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poi-detail-close {
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-muted, #94a3b8);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.poi-detail-close:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

.poi-detail-body {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.poi-detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.poi-detail-row:last-child {
  margin-bottom: 0;
}

.poi-detail-label {
  font-size: 11px;
  color: var(--text-dim, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.poi-detail-value {
  font-size: 14px;
  color: var(--text-primary, #e2e8f0);
  line-height: 1.5;
}

.poi-detail-actions {
  margin-top: auto;
  padding-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.poi-detail-btn {
  padding: 12px 16px;
  border-radius: var(--radius-md, 12px);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  width: 100%;
}

.poi-detail-btn.delete {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #ef4444;
}

.poi-detail-btn.delete:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

.poi-detail-btn.restore {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.25);
  color: #22c55e;
}

.poi-detail-btn.restore:hover {
  background: rgba(34, 197, 94, 0.25);
  border-color: rgba(34, 197, 94, 0.5);
}

/* POI删除确认弹窗 */
.poi-delete-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: rgba(10, 14, 26, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.poi-delete-popup {
  width: 90%;
  max-width: 400px;
  background: var(--card-bg, rgba(20, 30, 51, 0.98));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--radius-xl, 20px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.poi-delete-popup-content {
  padding: 0;
}

.poi-delete-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--card-border, rgba(255, 255, 255, 0.1));
}

.poi-delete-popup-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #e2e8f0);
  margin: 0;
}

.poi-delete-popup-close {
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: var(--text-muted, #94a3b8);
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.poi-delete-popup-close:hover {
  background: var(--glass, rgba(255, 255, 255, 0.05));
  color: var(--text-primary);
}

.poi-delete-popup-body {
  padding: 20px 24px;
  max-height: 300px;
  overflow-y: auto;
}

.poi-delete-popup-text {
  font-size: 14px;
  color: var(--text-primary, #e2e8f0);
  margin: 0 0 16px 0;
}

.poi-delete-popup-list {
  list-style: none;
  padding: 0;
  margin: 0 0 12px 0;
}

.poi-delete-popup-list.danger {
  border-top: 1px solid rgba(239, 68, 68, 0.2);
  padding-top: 12px;
  margin-top: 12px;
}

.poi-delete-popup-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
  color: var(--text-primary, #e2e8f0);
}

.poi-delete-popup-icon {
  margin-right: 10px;
  font-size: 16px;
}

.poi-delete-popup-name {
  flex: 1;
}

.poi-delete-popup-hint {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
}

.poi-delete-popup-list.danger .poi-delete-popup-hint {
  color: rgba(239, 68, 68, 0.8);
}

.poi-delete-popup-warning {
  font-size: 13px;
  color: var(--amber, #f59e0b);
  margin: 16px 0 0 0;
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
}

.poi-delete-popup-actions {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--card-border, rgba(255, 255, 255, 0.1));
}

.poi-delete-popup-cancel,
.poi-delete-popup-confirm {
  flex: 1;
  padding: 12px 20px;
  border-radius: var(--radius-md, 12px);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.poi-delete-popup-cancel {
  background: var(--glass, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.1));
  color: var(--text-primary, #e2e8f0);
}

.poi-delete-popup-cancel:hover {
  background: var(--glass, rgba(255, 255, 255, 0.1));
  border-color: var(--text-muted, #94a3b8);
}

.poi-delete-popup-confirm {
  background: var(--danger, #ef4444);
  color: white;
}

.poi-delete-popup-confirm:hover {
  background: #dc2626;
}
</style>