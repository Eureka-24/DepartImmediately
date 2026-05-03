<template>
  <div class="amap-container">
    <div ref="mapContainer" class="map-wrapper"></div>
    <div v-if="!isMapReady" class="map-loading">
      <div class="loading-spinner"></div>
      <span>地图加载中...</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'

const props = defineProps({
  city: {
    type: String,
    default: 'beijing'
  },
  pois: {
    type: Array,
    default: () => []
  },
  routeData: {
    type: Object,
    default: null
  },
  // 搜索结果（完整列表，用于展示）
  searchResults: {
    type: Array,
    default: () => []
  },
  // 当前搜索选中的 POI（单个，用于地图上显示蓝色虚线标记）
  selectedSearchPoi: {
    type: Object,
    default: null
  },
  // 当前选中的路线景点名称集合
  selectedPois: {
    type: Set,
    default: () => new Set()
  }
})

const emit = defineEmits(['map-ready', 'marker-click', 'search-marker-click', 'route-marker-click'])

// 搜索临时标记（当前选中的那个 POI）
const searchSelectedMarker = shallowRef(null)
const mapContainer = ref(null)
const isMapReady = ref(false)
const map = shallowRef(null)
const markers = shallowRef([])
const polylines = shallowRef([])
const geocoder = shallowRef(null)
const geocodeCache = shallowRef(new Map())

// 城市坐标映射
const cityCoordinates = {
  beijing: [116.397428, 39.90923],
  shanghai: [121.473658, 31.230416],
  hangzhou: [120.15507, 30.27415],
  chengdu: [104.065735, 30.659462],
  xian: [108.940175, 34.341568],
  chongqing: [106.551556, 29.56301]
}

// 城市名称映射
const cityNames = {
  beijing: '北京',
  shanghai: '上海',
  hangzhou: '杭州',
  chengdu: '成都',
  xian: '西安',
  chongqing: '重庆'
}

// 初始化地图
async function initMap() {
  if (!mapContainer.value) return

  const jsApiKey = import.meta.env.VITE_AMAP_JSAPI_KEY
  const securityCode = import.meta.env.VITE_AMAP_SECURITY_CODE

  if (!jsApiKey || jsApiKey === 'your_amap_jsapi_key') {
    console.warn('高德地图 JS API Key 未配置')
    return
  }

  try {
    // 配置安全密钥
    if (securityCode && securityCode !== 'your_amap_security_code') {
      window._AMapSecurityConfig = {
        securityJsCode: securityCode
      }
    }

    const AMap = await AMapLoader.load({
      key: jsApiKey,
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.Marker', 'AMap.Geocoder']
    })

    // 设置应用标识
    AMap.getConfig().appname = 'trip-plan-frontend'

    // 创建地图实例
    const mapInstance = new AMap.Map(mapContainer.value, {
      viewMode: '2D',
      zoom: 12,
      center: cityCoordinates[props.city] || cityCoordinates.beijing,
      mapStyle: 'amap://styles/dark' // 深色主题
    })

    // 添加控件
    mapInstance.addControl(new AMap.Scale())
    mapInstance.addControl(new AMap.ToolBar({ position: 'RB' }))

    // 创建地理编码器
    geocoder.value = new AMap.Geocoder({
      radius: 1000,
      extensions: 'base'
    })

    // 加载缓存
    loadGeocodeCache()

    map.value = mapInstance
    isMapReady.value = true
    emit('map-ready', mapInstance)
  } catch (error) {
    console.error('[AmapContainer] 地图加载失败:', error)
  }
}

// 在指定位置显示标记
function showMarker(lng, lat, options = {}) {
  if (!map.value || !isMapReady.value) return

  const AMap = window.AMap
  if (!AMap) return

  const marker = new AMap.Marker({
    position: new AMap.LngLat(lng, lat),
    title: options.title || '',
    label: options.label ? {
      content: options.label,
      direction: 'top'
    } : undefined,
    icon: options.icon || undefined,
    extData: options.extData
  })

  // 点击事件
  if (options.onClick) {
    marker.on('click', () => options.onClick(marker))
  }

  map.value.add(marker)
  markers.value.push(marker)

  return marker
}

// 地理编码：将地址转换为坐标
function geocodeAddress(address, cityName = '') {
  return new Promise((resolve) => {
    if (!geocoder.value || !address) {
      resolve(null)
      return
    }

    let cleanedAddress = address
      .replace(/附近$/, '')
      .replace(/\/.*$/, '')
      .replace(/、.*$/, '')

    if (cityName && cleanedAddress.startsWith(cityName)) {
      cleanedAddress = cleanedAddress.substring(cityName.length)
    }

    let fullAddress = cityName ? `${cityName}${cleanedAddress}` : cleanedAddress

    if (geocodeCache.value.has(fullAddress)) {
      resolve(geocodeCache.value.get(fullAddress))
      return
    }

    function doGeocode(addr) {
      return new Promise((res) => {
        const timeoutId = setTimeout(() => {
          res(null)
        }, 5000)

        geocoder.value.getLocation(addr, (status, result) => {
          clearTimeout(timeoutId)
          if (status === 'complete' && result.geocodes && result.geocodes.length > 0) {
            const { lng, lat } = result.geocodes[0].location
            const position = new window.AMap.LngLat(lng, lat)
            geocodeCache.value.set(addr, position)
            saveGeocodeCache()
            res(position)
          } else {
            res(null)
          }
        })
      })
    }

    async function tryGeocode() {
      let position = await doGeocode(fullAddress)

      if (!position) {
        const simplified = cleanedAddress.replace(/[A-Za-z0-9]+号$/, '').replace(/[A-Za-z0-9]+弄$/, '')
        if (simplified && simplified !== cleanedAddress) {
          const simpleFullAddr = cityName ? `${cityName}${simplified}` : simplified
          position = await doGeocode(simpleFullAddr)
        }
      }

      if (!position && cityName) {
        const nearbyAddr = `${fullAddress}附近`
        position = await doGeocode(nearbyAddr)
      }

      resolve(position)
    }

    tryGeocode()
  })
}

// 保存地理编码缓存到 localStorage
function saveGeocodeCache() {
  try {
    const cacheObj = Object.fromEntries(geocodeCache.value)
    localStorage.setItem('amap_geo_cache', JSON.stringify(cacheObj))
  } catch (e) {
    console.warn('[AmapContainer] 缓存保存失败:', e)
  }
}

// 从 localStorage 加载地理编码缓存
function loadGeocodeCache() {
  try {
    const cached = localStorage.getItem('amap_geo_cache')
    if (cached) {
      const cacheObj = JSON.parse(cached)
      for (const [address, pos] of Object.entries(cacheObj)) {
        if (pos && pos.lng !== undefined && pos.lat !== undefined) {
          geocodeCache.value.set(address, new window.AMap.LngLat(pos.lng, pos.lat))
        }
      }
    }
  } catch (e) {
    console.warn('[AmapContainer] 缓存加载失败:', e)
  }
}

// 显示 POI 标记列表（支持地址字符串或经纬度）
async function showPois(pois) {
  if (!map.value || !pois || pois.length === 0) return

  clearMarkers()

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i]
    let position

    if (!poi.location) continue

    if (poi.location.includes(',')) {
      const parts = poi.location.split(',')
      const [lng, lat] = parts.map(Number)
      if (!isNaN(lng) && !isNaN(lat)) {
        position = new window.AMap.LngLat(lng, lat)
      }
    } else {
      position = await geocodeAddress(poi.location, cityNames[props.city] || '')
    }

    if (!position) continue

    const isStart = i === 0
    const isEnd = i === pois.length - 1 && pois.length > 1
    const markerColor = isStart ? '#22c55e' : (isEnd ? '#ef4444' : '#f59e0b')

    const markerContent = document.createElement('div')
    markerContent.className = 'poi-marker-container'

    const markerInner = document.createElement('div')
    markerInner.className = 'poi-marker'
    markerInner.style.backgroundColor = markerColor
    if (isStart || isEnd) {
      markerInner.style.width = '36px'
      markerInner.style.height = '36px'
    }

    const markerText = document.createElement('span')
    markerText.className = 'poi-marker-text'
    if (isStart) {
      markerText.textContent = '起'
    } else if (isEnd) {
      markerText.textContent = '终'
    } else {
      markerText.textContent = i + 1
    }
    markerInner.appendChild(markerText)
    markerContent.appendChild(markerInner)

    const nameLabel = document.createElement('div')
    nameLabel.className = 'poi-name-label'
    nameLabel.textContent = poi.name || '未知景点'
    markerContent.appendChild(nameLabel)

    const marker = new window.AMap.Marker({
      position: position,
      content: markerContent,
      offset: new window.AMap.Pixel(-30, -60),
      extData: poi
    })

    marker.on('click', () => {
      const infoWindow = new window.AMap.InfoWindow({
        content: createInfoWindowContent(poi, i),
        offset: new window.AMap.Pixel(0, -30)
      })
      infoWindow.open(map.value, marker.getPosition())
    })

    map.value.add(marker)
    markers.value.push(marker)
  }

  setFitView()
}

// 创建信息窗口内容
function createInfoWindowContent(poi, index) {
  const name = poi.name || '未知景点'
  const rating = poi.rating || ''
  const time = poi.time || ''
  const duration = poi.duration || ''
  const reason = poi.reason || ''
  const location = poi.location || ''

  return `
    <div class="info-window">
      <div class="info-window-header">
        <span class="info-window-number">${index + 1}</span>
        <h3 class="info-window-title">${name}</h3>
      </div>
      <div class="info-window-body">
        ${rating ? `<div class="info-row"><span class="info-label">评分:</span> ${rating}</div>` : ''}
        ${time ? `<div class="info-row"><span class="info-label">时间:</span> ${time}</div>` : ''}
        ${duration ? `<div class="info-row"><span class="info-label">时长:</span> ${duration}</div>` : ''}
        ${reason ? `<div class="info-row"><span class="info-label">推荐:</span> ${reason}</div>` : ''}
        ${location ? `<div class="info-row"><span class="info-label">地址:</span> ${location}</div>` : ''}
      </div>
    </div>
  `
}

// 绘制路线（支持新的扁平 POI 结构）
async function drawRoute(routeData) {
  try {
    if (!map.value || !routeData) return

    const routePois = routeData.routes || routeData.pois || []
    if (routePois.length === 0) return

    clearPolylines()
    clearMarkers()

    const poisWithCoords = []

    for (let i = 0; i < routePois.length; i++) {
      const poi = routePois[i]
      const poiWithCoord = { ...poi }

      if (!poi.location) {
        poisWithCoords.push({ ...poiWithCoord, _position: null })
        continue
      }

      let position = null

      try {
        if (poi.location.includes(',')) {
          const parts = poi.location.split(',')
          const [lng, lat] = parts.map(Number)
          if (!isNaN(lng) && !isNaN(lat)) {
            position = new window.AMap.LngLat(lng, lat)
          }
        } else {
          position = await geocodeAddress(poi.location, cityNames[props.city] || '')
        }
      } catch (err) {
        console.error('[AmapContainer] POI 坐标处理错误:', poi.name, err)
      }

      poisWithCoords.push({ ...poiWithCoord, _position: position })
    }

    const path = poisWithCoords.filter(p => p._position).map(p => p._position)

    if (path.length >= 2) {
      const polyline = new window.AMap.Polyline({
        path: path,
        strokeColor: '#f59e0b',
        strokeWeight: 6,
        strokeOpacity: 0.8,
        showDir: true,
        lineJoin: 'round'
      })

      map.value.add(polyline)
      polylines.value.push(polyline)

      for (let i = 0; i < path.length - 1; i++) {
        const start = path[i]
        const end = path[i + 1]
        const midPoint = new window.AMap.LngLat(
          (start.lng + end.lng) / 2,
          (start.lat + end.lat) / 2
        )
        const angle = Math.atan2(end.lat - start.lat, end.lng - start.lng) * 180 / Math.PI

        const arrow = new window.AMap.Marker({
          position: midPoint,
          icon: new window.AMap.Icon({
            size: new window.AMap.Size(16, 16),
            image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"%3E%3Cpath d="M8 0L16 12H0Z" fill="%23f59e0b"/%3E%3C/svg%3E',
            imageSize: new window.AMap.Size(16, 16)
          }),
          offset: new window.AMap.Pixel(-8, -8),
          rotation: angle
        })
        map.value.add(arrow)
        polylines.value.push(arrow)
      }
    }

    await showPoisWithCoords(poisWithCoords)

    if (markers.value.length > 0) {
      map.value.setFitView(markers.value, false, [50, 50, 50, 50])
    }
  } catch (err) {
    console.error('[AmapContainer] drawRoute ERROR:', err)
  }
}

// 显示 POI 标记（使用预计算的坐标）
async function showPoisWithCoords(poisWithCoords) {
  if (!map.value || !poisWithCoords || poisWithCoords.length === 0) return

  const poisWithPosition = []

  for (let i = 0; i < poisWithCoords.length; i++) {
    const poi = poisWithCoords[i]
    let position = poi._position

    if (!position) {
      if (poi.lng && poi.lat) {
        position = new window.AMap.LngLat(poi.lng, poi.lat)
      } else if (poi.location && poi.location.includes(',')) {
        const parts = poi.location.split(',')
        const [lng, lat] = parts.map(Number)
        if (!isNaN(lng) && !isNaN(lat)) {
          position = new window.AMap.LngLat(lng, lat)
        }
      } else if (poi.location) {
        try {
          position = await geocodeAddress(poi.location, cityNames[props.city] || '')
        } catch (err) {
          console.warn('[AmapContainer] geocode failed for', poi.name)
        }
      }
    }

    if (position) {
      poisWithPosition.push({ ...poi, _position: position })
    }
  }

  if (poisWithPosition.length === 0) return

  clearMarkers()

  const total = poisWithPosition.length

  for (let i = 0; i < poisWithPosition.length; i++) {
    const poi = poisWithPosition[i]
    const position = poi._position

    if (!position) continue

    const isStart = i === 0
    const isEnd = i === total - 1 && total > 1 && !poi._isUserAdded

    let markerColor
    let markerClass = 'poi-marker'

    if (poi._isUserAdded) {
      markerColor = '#22c55e'
      markerClass += ' user-added'
    } else if (poi._isPendingDelete) {
      markerColor = '#9ca3af'
      markerClass += ' pending-delete'
    } else {
      markerColor = isStart ? '#22c55e' : (isEnd ? '#ef4444' : '#f59e0b')
    }

    if (props.selectedPois && props.selectedPois.has(poi.name)) {
      markerClass += ' selected'
    }

    const markerContent = document.createElement('div')
    markerContent.className = 'poi-marker-container'

    const markerInner = document.createElement('div')
    markerInner.className = markerClass
    markerInner.style.backgroundColor = markerColor
    if (isStart || isEnd) {
      markerInner.style.width = '36px'
      markerInner.style.height = '36px'
    }

    const markerText = document.createElement('span')
    markerText.className = 'poi-marker-text'
    if (poi._isPendingDelete) {
      markerText.textContent = '×'
    } else if (poi._isUserAdded) {
      markerText.textContent = '+'
    } else if (isStart) {
      markerText.textContent = '起'
    } else if (isEnd) {
      markerText.textContent = '终'
    } else {
      markerText.textContent = i + 1
    }
    markerInner.appendChild(markerText)
    markerContent.appendChild(markerInner)

    const nameLabel = document.createElement('div')
    nameLabel.className = 'poi-name-label'
    if (poi._isPendingDelete) {
      nameLabel.className += ' pending-delete'
    }
    nameLabel.textContent = poi.name || '未知景点'
    markerContent.appendChild(nameLabel)

    const marker = new window.AMap.Marker({
      position: position,
      content: markerContent,
      offset: new window.AMap.Pixel(-30, -60),
      extData: poi
    })

    marker.on('click', () => {
      emit('route-marker-click', poi)
    })

    map.value.add(marker)
    markers.value.push(marker)
  }
}

// 显示搜索结果临时标记（蓝色虚线边框）- 单个 POI
function showSearchMarker(poi) {
  if (!map.value) return

  if (!poi || !poi.lng || !poi.lat) return

  clearSearchMarker()

  const position = new window.AMap.LngLat(poi.lng, poi.lat)

  const markerContent = document.createElement('div')
  markerContent.className = 'search-marker-container'

  const markerInner = document.createElement('div')
  markerInner.className = 'search-marker'
  markerContent.appendChild(markerInner)

  const marker = new window.AMap.Marker({
    position: position,
    content: markerContent,
    offset: new window.AMap.Pixel(-15, -15),
    extData: { ...poi, _isSearchResult: true }
  })

  map.value.add(marker)
  searchSelectedMarker.value = marker

  if (props.selectedSearchPoi && poi) {
    map.value.setCenter(position)
    map.value.setZoom(15, true, 500)
  }
}

// 清除搜索临时标记（保留路线标记）
function clearSearchMarker() {
  if (!map.value) return

  if (searchSelectedMarker.value) {
    map.value.remove(searchSelectedMarker.value)
    searchSelectedMarker.value = null
  }
}

// 清除所有标记
function clearMarkers() {
  if (!map.value) return
  markers.value.forEach(marker => {
    map.value.remove(marker)
  })
  markers.value = []
}

// 清除所有线
function clearPolylines() {
  if (!map.value) return
  polylines.value.forEach(polyline => {
    map.value.remove(polyline)
  })
  polylines.value = []
}

// 调整视野
function setFitView() {
  if (!map.value || markers.value.length === 0) return
  map.value.setFitView(markers.value, false, [50, 50, 50, 50])
}

// 切换城市
function setCity(cityCode) {
  if (!map.value || !cityCoordinates[cityCode]) return
  map.value.setCenter(cityCoordinates[cityCode])
  map.value.setZoom(12)
  clearMarkers()
  clearPolylines()
}

// 销毁地图
function destroy() {
  if (map.value) {
    map.value.destroy()
    map.value = null
    isMapReady.value = false
  }
  markers.value = []
  polylines.value = []
  geocoder.value = null
  geocodeCache.value.clear()
}

// 监听 props 变化
watch(() => props.city, (newCity) => {
  if (newCity && isMapReady.value) {
    setCity(newCity)
  }
})

watch(() => props.pois, (newPois) => {
  if (!props.routeData && newPois && newPois.length > 0) {
    const poisWithPosition = newPois.map(p => ({
      ...p,
      _position: p.lng && p.lat ? new window.AMap.LngLat(p.lng, p.lat) : null
    }))
    showPoisWithCoords(poisWithPosition)
  }
}, { deep: true })

watch(() => props.routeData, (newRoute) => {
  if (newRoute && isMapReady.value) {
    drawRoute(newRoute)
  }
}, { immediate: true, deep: true })

watch(() => props.searchResults, () => {
  // 搜索结果由 selectedSearchPoi 控制显示
}, { deep: true })

watch(() => props.selectedSearchPoi, (newPoi) => {
  if (newPoi) {
    showSearchMarker(newPoi)
  } else {
    clearSearchMarker()
  }
}, { immediate: true })

watch(() => props.selectedPois, () => {
  // 选中状态变化由父组件处理
}, { deep: true })

watch(() => isMapReady.value, (ready) => {
  if (ready && props.selectedSearchPoi) {
    showSearchMarker(props.selectedSearchPoi)
  }
})

// 生命周期
onMounted(() => {
  initMap()
})

onUnmounted(() => {
  destroy()
})

// 暴露方法给父组件
defineExpose({
  initMap,
  showMarker,
  showPois,
  showPoisWithCoords,
  drawRoute,
  clearMarkers,
  clearPolylines,
  setFitView,
  setCity,
  destroy
})
</script>

<style scoped>
.amap-container {
  width: 100%;
  height: 100%;
  position: relative;
  border-radius: var(--radius-xl, 20px);
  overflow: hidden;
}

.map-wrapper {
  width: 100%;
  height: 100%;
  min-height: 450px;
}

.map-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--card-bg, rgba(20, 30, 51, 0.7));
  color: var(--text-muted, #94a3b8);
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(245, 158, 11, 0.1);
  border-top-color: var(--amber, #f59e0b);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

<style>
/* 全局样式 - 信息窗口和标记 */
.poi-marker-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.poi-marker {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, var(--amber) 0%, var(--coral) 100%);
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.poi-marker-text {
  transform: rotate(45deg);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.poi-name-label {
  margin-top: 4px;
  padding: 2px 6px;
  background: rgba(20, 30, 51, 0.9);
  border-radius: 4px;
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

/* 待删除状态的样式 */
.poi-marker.pending-delete {
  background: #9ca3af !important;
  animation: shake 0.5s infinite;
}

/* 用户新增景点样式 - 圆形绿色（无旋转） */
.poi-marker.user-added {
  background: #22c55e !important;
  border-radius: 50% !important;
  transform: none !important;
  width: 32px;
  height: 32px;
}

.poi-marker.user-added .poi-marker-text {
  transform: none !important;
}

/* 选中状态样式 - 白色高亮边框 */
.poi-marker.selected {
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.9), 0 3px 10px rgba(0, 0, 0, 0.4) !important;
  z-index: 10;
}

/* 用户新增景点选中样式 */
.poi-marker.user-added.selected {
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.9), 0 3px 10px rgba(0, 0, 0, 0.4) !important;
  background: #16a34a !important; /* 更深的绿色表示选中 */
}

.poi-name-label.pending-delete {
  text-decoration: line-through;
  color: #9ca3af;
}

@keyframes shake {
  0%, 100% { transform: rotate(-45deg) translateX(0); }
  25% { transform: rotate(-45deg) translateX(-2px); }
  75% { transform: rotate(-45deg) translateX(2px); }
}

/* 搜索结果临时标记样式 */
.search-marker-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
}

.search-marker {
  width: 36px;
  height: 36px;
  background: transparent;
  border: 4px dashed #3b82f6;
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.8), 0 0 4px rgba(59, 130, 246, 0.6);
  animation: pulse-blue 1.5s infinite;
}

@keyframes pulse-blue {
  0%, 100% { box-shadow: 0 0 12px rgba(59, 130, 246, 0.8), 0 0 4px rgba(59, 130, 246, 0.6); }
  50% { box-shadow: 0 0 20px rgba(59, 130, 246, 1), 0 0 8px rgba(59, 130, 246, 0.8); }
}

.info-window {
  padding: 12px 16px;
  min-width: 200px;
}

.info-window-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
}

.info-window-number {
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, var(--amber) 0%, var(--coral) 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--midnight-deep, #0a0e1a);
  font-size: 12px;
  font-weight: 600;
}

.info-window-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-bright, #f8fafc);
  margin: 0;
}

.info-window-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  font-size: 13px;
  color: var(--text-primary, #e2e8f0);
}

.info-label {
  color: var(--text-muted, #94a3b8);
  margin-right: 6px;
}

/* 高德地图信息窗口样式覆盖 */
.amap-info-content {
  background: var(--card-bg, rgba(20, 30, 51, 0.95)) !important;
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06)) !important;
  border-radius: var(--radius-md, 12px) !important;
  padding: 0 !important;
}

.amap-info-sharp {
  border-top: 8px solid var(--card-bg, rgba(20, 30, 51, 0.95)) !important;
}

.amap-info-title {
  background: transparent !important;
  color: var(--text-bright, #f8fafc) !important;
  font-weight: 600 !important;
}

.amap-info-close {
  color: var(--text-muted, #94a3b8) !important;
}
</style>