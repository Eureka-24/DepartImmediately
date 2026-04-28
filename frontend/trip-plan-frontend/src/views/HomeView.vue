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
      </div>
      <div class="session-list">
        <div
          v-for="item in history"
          :key="item.id"
          class="session-item"
          :class="{ active: currentTripId === item.id }"
          @click="loadTrip(item)"
        >
          <div class="session-title">{{ item.title || getTripTitle(item) }}</div>
          <div class="session-date">{{ formatDate(item.createdAt) }}</div>
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
              <select id="city" v-model="formData.city" required>
                <option value="">请选择城市</option>
                <option value="beijing">北京</option>
                <option value="shanghai">上海</option>
                <option value="hangzhou">杭州</option>
                <option value="chengdu">成都</option>
                <option value="xian">西安</option>
                <option value="chongqing">重庆</option>
              </select>
            </div>

            <div class="form-group">
              <label for="startTime">出发时间</label>
              <input
                type="datetime-local"
                id="startTime"
                v-model="formData.startTime"
                required
              />
            </div>

            <div class="form-group">
              <label for="endTime">结束时间</label>
              <input
                type="datetime-local"
                id="endTime"
                v-model="formData.endTime"
                required
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTripStore } from '../stores/trip'
import AmapContainer from '../components/map/AmapContainer.vue'
import ItineraryOutput from '../components/output/ItineraryOutput.vue'

const router = useRouter()
const authStore = useAuthStore()
const tripStore = useTripStore()

const mapRef = ref(null)
const sidebarOpen = ref(false)
const currentTripId = ref(null)
const currentResult = ref(null)

const isLoading = computed(() => tripStore.isLoading)
const history = computed(() => tripStore.history || [])

const formData = reactive({
  city: '',
  startTime: '',
  endTime: '',
  preferences: ''
})

onMounted(() => {
  loadHistory()
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
</style>