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
          <span class="user-email">{{ authStore.user?.email || '未登录' }}</span>
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
          :class="{ active: currentTripId === item.id }"
          @click="loadTrip(item)"
        >
          <div class="session-content">
            <div class="session-title">{{ item.title || getTripTitle(item) }}</div>
            <div class="session-date">{{ formatDate(item.createdAt) }}</div>
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
        <div class="section-header">
          <h2 class="section-title">路线地图</h2>
          <span class="map-badge">高德地图</span>
        </div>
        <div class="map-container">
          <AmapContainer
            ref="mapRef"
            :city="formData.city"
            :pois="currentResult?.routes || []"
            :routeData="currentResult || null"
            @map-ready="onMapReady"
          />
        </div>
      </section>

      <section class="output-section">
        <div class="output-container">
          <ItineraryOutput
            :result="currentResult"
            placeholder="请填写上方表单，点击「生成路线规划」开始智能规划..."
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

const router = useRouter()
const authStore = useAuthStore()
const tripStore = useTripStore()

const mapRef = ref(null)
const sidebarOpen = ref(false)
const currentTripId = ref(null)
const currentResult = ref(null)

// 删除确认弹窗状态
const deletePopup = ref({
  show: false,
  id: null,
  position: { top: '0px', left: '0px' }
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
  currentResult.value = trip.result

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
    console.log('[HomeView] handleSubmit result:', result)
    console.log('[HomeView] result.result:', result.result)
    currentTripId.value = result.id || result._id || Date.now()
    currentResult.value = result.result || result
    console.log('[HomeView] currentResult set to:', currentResult.value)
    await loadHistory()
  }
}

function onMapReady(map) {
  console.log('[HomeView] 地图已就绪')
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

function handleNewSession() {
  currentTripId.value = null
  currentResult.value = null
  formData.city = ''
  formData.startTime = ''
  formData.endTime = ''
  formData.preferences = ''
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
</style>