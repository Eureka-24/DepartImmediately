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
  }
})

const emit = defineEmits(['map-ready', 'marker-click'])

// Refs
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

    console.log('[AmapContainer] 地图初始化成功')
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

    // 清理地址：移除"附近"、多余的斜杠、特殊字符等
    let cleanedAddress = address
      .replace(/附近$/, '')  // 移除末尾的"附近"
      .replace(/\/.*$/, '')  // 移除第一个斜杠后的所有内容（如"田子坊/新天地" → "田子坊"）
      .replace(/、.*$/, '')  // 移除顿号后的所有内容（如"外白渡桥、乍浦路桥" → "外白渡桥"）

    // 清理重复的城市名前缀
    if (cityName && cleanedAddress.startsWith(cityName)) {
      cleanedAddress = cleanedAddress.substring(cityName.length)
    }

    // 构建完整地址
    let fullAddress = cityName ? `${cityName}${cleanedAddress}` : cleanedAddress

    // 检查缓存
    if (geocodeCache.value.has(fullAddress)) {
      resolve(geocodeCache.value.get(fullAddress))
      return
    }

    // 执行地理编码
    function doGeocode(addr) {
      return new Promise((res) => {
        const timeoutId = setTimeout(() => {
          console.warn('[AmapContainer] geocode timeout for:', addr)
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
            console.warn('[AmapContainer] 地理编码失败:', addr, status)
            res(null)
          }
        })
      })
    }

    // 尝试编码，如果失败则尝试简化版本
    async function tryGeocode() {
      let position = await doGeocode(fullAddress)

      // 如果失败，尝试简化地址（移除区/路号等细节，保留主要地名）
      if (!position) {
        // 尝试去掉区信息，直接用路名
        const simplified = cleanedAddress.replace(/[A-Za-z0-9]+号$/, '').replace(/[A-Za-z0-9]+弄$/, '')
        if (simplified && simplified !== cleanedAddress) {
          const simpleFullAddr = cityName ? `${cityName}${simplified}` : simplified
          console.log('[AmapContainer] trying simplified:', simpleFullAddr)
          position = await doGeocode(simpleFullAddr)
        }
      }

      // 如果还是失败，尝试加"附近"后缀（针对某些精确地址）
      if (!position && cityName) {
        const nearbyAddr = `${fullAddress}附近`
        console.log('[AmapContainer] trying with 附近:', nearbyAddr)
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
  console.log('[AmapContainer] showPois called, pois count:', pois?.length || 0)
  if (!map.value || !pois || pois.length === 0) {
    console.log('[AmapContainer] showPois skipped: invalid map or pois')
    return
  }

  clearMarkers()

  const total = pois.length
  console.log('[AmapContainer] showPois processing', total, 'pois')

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i]
    console.log('[AmapContainer] showPois processing pois[' + i + ']:', poi.name, 'location:', poi.location)
    let position

    if (!poi.location) {
      console.warn('[AmapContainer] POI 缺少 location:', poi.name)
      continue
    }

    // 判断是经纬度格式还是地址字符串
    if (poi.location.includes(',')) {
      const parts = poi.location.split(',')
      const [lng, lat] = parts.map(Number)
      if (!isNaN(lng) && !isNaN(lat)) {
        position = new window.AMap.LngLat(lng, lat)
        console.log('[AmapContainer] showPois using lnglat for', poi.name, ':', lng, lat)
      } else {
        console.warn('[AmapContainer] invalid coords in location:', poi.location)
      }
    } else {
      // 地址字符串，需要地理编码
      console.log('[AmapContainer] showPois geocoding address for:', poi.name, poi.location)
      position = await geocodeAddress(poi.location, cityNames[props.city] || '')
    }

    if (!position) {
      console.warn('[AmapContainer] 无法获取 POI 坐标:', poi.name, poi.location)
      continue
    }

    console.log('[AmapContainer] showPois adding marker for', poi.name, 'at', position.lng, position.lat)

    // 判断标记类型：起始点、终点、中间点
    const isStart = i === 0
    const isEnd = i === total - 1 && total > 1
    const markerColor = isStart ? '#22c55e' : (isEnd ? '#ef4444' : '#f59e0b')

    // 创建自定义标记容器
    const markerContent = document.createElement('div')
    markerContent.className = 'poi-marker-container'

    // 创建标记主体
    const markerInner = document.createElement('div')
    markerInner.className = 'poi-marker'
    markerInner.style.backgroundColor = markerColor
    if (isStart || isEnd) {
      markerInner.style.width = '36px'
      markerInner.style.height = '36px'
    }

    // 标记上的文字
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

    // POI 名称标签
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
    console.log('[AmapContainer] marker created for', poi.name, 'position:', position.lng, position.lat)

    // 信息窗口
    marker.on('click', () => {
      const infoWindow = new window.AMap.InfoWindow({
        content: createInfoWindowContent(poi, i),
        offset: new window.AMap.Pixel(0, -30)
      })
      infoWindow.open(map.value, marker.getPosition())
    })

    map.value.add(marker)
    markers.value.push(marker)
    console.log('[AmapContainer] marker added to map, total markers:', markers.value.length)
  }

  console.log('[AmapContainer] showPois completed, total markers added:', markers.value.length)

  // 调整视野
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
  console.log('[AmapContainer] drawRoute START')
  try {
    if (!map.value || !routeData) {
      console.log('[AmapContainer] drawRoute skipped: map or routeData is empty')
      return
    }

    console.log('[AmapContainer] drawRoute called with:', routeData)

  // 支持两种格式：1) routeData.routes 扁平数组  2) routeData.pois 数组
  const routePois = routeData.routes || routeData.pois || []
  console.log('[AmapContainer] pois extracted:', routePois.length, 'items')
  routePois.forEach((p, i) => console.log(`  pois[${i}]:`, p.name, '- location:', p.location))

  if (routePois.length === 0) {
    console.log('[AmapContainer] no pois to display')
    return
  }

  clearPolylines()
  clearMarkers()

  // 先处理所有 POI，收集坐标
  const poisWithCoords = []

  for (let i = 0; i < routePois.length; i++) {
    console.log('[AmapContainer] Processing POI index:', i, routePois[i].name)
    const poi = routePois[i]
    const poiWithCoord = { ...poi }  // 浅拷贝，避免修改原数据

    if (!poi.location) {
      console.log('[AmapContainer] poi missing location:', poi.name)
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
          console.log('[AmapContainer] using lnglat for', poi.name, ':', lng, lat)
        }
      } else {
        // 地址字符串，需要地理编码
        console.log('[AmapContainer] geocoding:', poi.location, 'with city:', cityNames[props.city] || '(none)')
        position = await geocodeAddress(poi.location, cityNames[props.city] || '')
        console.log('[AmapContainer] geocoded result for', poi.name, ':', position)
      }
    } catch (err) {
      console.error('[AmapContainer] ERROR processing poi', poi.name, ':', err)
    }

    poisWithCoords.push({ ...poiWithCoord, _position: position })

    // Progress indicator every 3 POIs
    if ((i + 1) % 3 === 0 || i === routePois.length - 1) {
      console.log('[AmapContainer] Geocoding progress:', i + 1, '/', routePois.length)
    }
  }

  console.log('[AmapContainer] === Geocoding loop DONE === poisWithCoords:', poisWithCoords.length)
  console.log('[AmapContainer] === ALL geocoding complete ===')
  console.log('[AmapContainer] poisWithCoords length:', poisWithCoords.length)
  console.log('[AmapContainer] First poi:', poisWithCoords[0]?.name, 'has position:', !!poisWithCoords[0]?._position)

  // 收集有效路径点
  const path = poisWithCoords
    .filter(p => p._position)
    .map(p => p._position)

  console.log('[AmapContainer] path collected:', path.length, 'points')

  // 绘制路线
  if (path.length >= 2) {
    console.log('[AmapContainer] drawing polyline with', path.length, 'points')

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

    // 绘制方向箭头
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

  // 显示 POI 标记
  console.log('[AmapContainer] calling showPoisWithCoords')
  try {
    await showPoisWithCoords(poisWithCoords)
    console.log('[AmapContainer] showPoisWithCoords returned')
  } catch (err) {
    console.error('[AmapContainer] showPoisWithCoords error:', err)
  }

  // 调整视野
  console.log('[AmapContainer] markers.value.length:', markers.value.length)
  if (markers.value.length > 0) {
    console.log('[AmapContainer] setFitView with', markers.value.length, 'markers')
    try {
      map.value.setFitView(markers.value, false, [50, 50, 50, 50])
      console.log('[AmapContainer] setFitView executed')
    } catch (err) {
      console.error('[AmapContainer] setFitView error:', err)
    }
  }

  console.log('[AmapContainer] drawRoute completed')
  } catch (err) {
    console.error('[AmapContainer] drawRoute ERROR:', err)
  }
}

// 显示 POI 标记（使用预计算的坐标）
async function showPoisWithCoords(poisWithCoords) {
  console.log('[AmapContainer] showPoisWithCoords called, count:', poisWithCoords?.length || 0)

  if (!map.value || !poisWithCoords || poisWithCoords.length === 0) {
    console.log('[AmapContainer] showPoisWithCoords skipped')
    return
  }

  clearMarkers()

  const total = poisWithCoords.length

  for (let i = 0; i < poisWithCoords.length; i++) {
    const poi = poisWithCoords[i]
    const position = poi._position

    if (!position) {
      console.warn('[AmapContainer] no position for poi:', poi.name)
      continue
    }

    const isStart = i === 0
    const isEnd = i === total - 1 && total > 1
    const markerColor = isStart ? '#22c55e' : (isEnd ? '#ef4444' : '#f59e0b')

    // 创建自定义标记容器
    const markerContent = document.createElement('div')
    markerContent.className = 'poi-marker-container'

    // 创建标记主体
    const markerInner = document.createElement('div')
    markerInner.className = 'poi-marker'
    markerInner.style.backgroundColor = markerColor
    if (isStart || isEnd) {
      markerInner.style.width = '36px'
      markerInner.style.height = '36px'
    }

    // 标记上的文字
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

    // POI 名称标签
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

    // 信息窗口
    marker.on('click', () => {
      const infoWindow = new window.AMap.InfoWindow({
        content: createInfoWindowContent(poi, i),
        offset: new window.AMap.Pixel(0, -30)
      })
      infoWindow.open(map.value, marker.getPosition())
    })

    map.value.add(marker)
    markers.value.push(marker)
    console.log('[AmapContainer] marker added:', poi.name, 'at', position.lng, position.lat)
  }

  console.log('[AmapContainer] showPoisWithCoords completed, markers:', markers.value.length)
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
  if (!map.value) {
    console.log('[AmapContainer] setFitView skipped: map is null')
    return
  }
  console.log('[AmapContainer] setFitView called with', markers.value.length, 'markers')
  if (markers.value.length === 0) {
    console.log('[AmapContainer] setFitView skipped: no markers')
    return
  }
  map.value.setFitView(markers.value, false, [50, 50, 50, 50])
  console.log('[AmapContainer] setFitView executed')
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
  // Don't trigger showPois here - drawRoute handles POI display
  // This watcher is kept only for cases where routeData is not set but pois are provided directly
}, { deep: true })

watch(() => props.routeData, (newRoute) => {
  console.log('[AmapContainer] routeData changed:', newRoute)
  console.log('[AmapContainer] isMapReady.value:', isMapReady.value)
  if (newRoute && isMapReady.value) {
    console.log('[AmapContainer] calling drawRoute')
    drawRoute(newRoute)
  } else {
    console.log('[AmapContainer] drawRoute skipped')
  }
}, { immediate: true, deep: true })

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