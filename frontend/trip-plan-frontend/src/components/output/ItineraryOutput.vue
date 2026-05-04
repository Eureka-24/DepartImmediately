<template>
  <div class="itinerary-output">
    <div class="output-header">
      <span class="output-label">AI 路线规划助手</span>
      <button v-if="result" class="copy-btn" @click="copyOutput" title="复制内容">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <div ref="outputContent" class="output-content">
      <span v-if="!result && (!status || status === 'pending' || status === 'processing')" class="placeholder pending-text">
        <template v-if="status === 'processing'">正在规划路线，请稍候...</template>
        <template v-else-if="status === 'pending'">路线规划已提交，等待处理...</template>
        <template v-else>{{ placeholder }}</template>
      </span>
      <span v-else-if="!result" class="placeholder">{{ placeholder }}</span>
      <template v-else>
        <div class="routes-list">
          <div
            v-for="(poi, index) in result.routes"
            :key="index"
            class="poi-item"
            :class="{ expanded: expandedIndex === index }"
            @click="toggleExpand(index)"
          >
            <div class="poi-header">
              <div class="poi-marker">
                <span class="poi-number">{{ index + 1 }}</span>
                <span class="poi-connector" v-if="index < result.routes.length - 1"></span>
              </div>
              <div class="poi-info">
                <div class="poi-name">{{ poi.name || '未知景点' }}</div>
                <div class="poi-meta">
                  <span v-if="poi.time" class="meta-item">
                    <span class="meta-icon">🕐</span>
                    {{ poi.time }}
                  </span>
                  <span v-if="poi.rating" class="meta-item">
                    <span class="meta-icon">⭐</span>
                    {{ poi.rating }}
                  </span>
                  <span v-if="poi.duration" class="meta-item">
                    <span class="meta-icon">⏳</span>
                    {{ poi.duration }}
                  </span>
                </div>
                <div class="poi-details" v-if="poi.location || poi.reason || poi.transport">
                  <span v-if="poi.location" class="detail-item">
                    <span class="detail-icon">📍</span>
                    {{ poi.location }}
                  </span>
                  <span v-if="poi.reason" class="detail-item">
                    <span class="detail-icon">💡</span>
                    {{ poi.reason }}
                  </span>
                  <span v-if="poi.transport" class="detail-item">
                    <span class="detail-icon">🚶</span>
                    {{ poi.transport }}
                  </span>
                </div>
              </div>
              <div class="poi-expand-icon">{{ expandedIndex === index ? '−' : '+' }}</div>
            </div>
            <div v-if="expandedIndex === index && poi.description" class="poi-description-card">
              <div class="description-content" v-html="formatDescription(poi.description)"></div>
            </div>
            <div v-if="expandedIndex === index && poi.segment_to_next" class="segment-card">
              <div class="segment-summary">
                <span class="transport-icon">🚌</span>
                <span v-if="poi.departure_time" class="departure-time">{{ poi.departure_time }} 出发</span>
                <span class="duration">{{ poi.segment_to_next.duration }}</span>
                <span class="distance">({{ poi.segment_to_next.distance }})</span>
              </div>
              <div class="transport-modes">
                <button
                  v-for="mode in transportModes"
                  :key="mode.value"
                  :class="{ active: currentTransportMode[index] === mode.value }"
                  @click.stop="switchTransport(index, mode.value)"
                >
                  {{ mode.label }}
                </button>
              </div>
              <div class="segment-detail" v-if="showSegmentDetail[index]">
                <div class="road-list">{{ poi.segment_to_next.road_summary }}</div>
                <div class="steps-list">
                  <div v-for="(step, si) in poi.segment_to_next.steps" :key="si" class="step-item">
                    <span class="step-instruction">{{ step.instruction }}</span>
                    <span class="step-distance">{{ step.distance }}</span>
                  </div>
                </div>
              </div>
              <button class="toggle-detail" @click.stop="toggleSegmentDetail(index)">
                {{ showSegmentDetail[index] ? '收起' : '详情' }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="result.summary" class="summary-section">
          <div class="summary-header">📝 路线总结</div>
          <div class="summary-content">{{ result.summary }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  result: {
    type: Object,
    default: null
  },
  status: {
    type: String,
    default: null
  },
  placeholder: {
    type: String,
    default: '请填写上方表单，点击「生成路线规划」开始智能规划...'
  }
})

const outputContent = ref(null)
const expandedIndex = ref(null)
const copied = ref(false)
const showSegmentDetail = ref({})
const currentTransportMode = ref({})

const transportModes = [
  { value: 'transit', label: '公交' },
  { value: 'driving', label: '驾车' },
  { value: 'walking', label: '步行' },
  { value: 'riding', label: '骑行' },
]

function toggleExpand(index) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}

function toggleSegmentDetail(index) {
  showSegmentDetail.value[index] = !showSegmentDetail.value[index]
}

function switchTransport(index, mode) {
  currentTransportMode.value[index] = mode
  // Emit event to parent to refetch segment data
  emit('switch-transport', { index, mode })
}

const emit = defineEmits(['switch-transport'])

function formatDescription(desc) {
  if (!desc) return ''
  return desc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/^- /gm, '• ')
}

async function copyOutput() {
  if (!props.result) return

  const lines = []
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('        🚀 智能旅行路线规划')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('')

  if (props.result.routes && props.result.routes.length > 0) {
    props.result.routes.forEach((poi, index) => {
      const num = index + 1
      lines.push(`  ${num}. ${poi.name || '未知景点'}`)
      if (poi.time) lines.push(`     🕐 时间: ${poi.time}`)
      if (poi.rating) lines.push(`     ⭐ 评分: ${poi.rating}`)
      if (poi.duration) lines.push(`     ⏳ 停留: ${poi.duration}`)
      if (poi.location) lines.push(`     📍 地址: ${poi.location}`)
      if (poi.reason) lines.push(`     💡 推荐: ${poi.reason}`)
      if (poi.transport) lines.push(`     🚶 交通: ${poi.transport}`)
      if (poi.description) {
        lines.push('')
        lines.push(`     📝 详情:`)
        poi.description.split('\n').forEach(line => {
          lines.push(`        ${line.replace(/\*\*/g, '')}`)
        })
      }
      lines.push('')
    })
  }

  if (props.result.summary) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('')
    lines.push('📝 路线总结:')
    lines.push(`   ${props.result.summary}`)
    lines.push('')
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('        祝您旅途愉快！ 🌟')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}

watch(() => props.result, () => {
  expandedIndex.value = null
}, { immediate: true })
</script>

<style scoped>
.itinerary-output {
  width: 100%;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
}

.output-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
}

.output-label {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  flex: 1;
}

.copy-btn {
  background: transparent;
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
  border-radius: var(--radius-sm, 8px);
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  transition: all 0.3s ease;
}

.copy-btn:hover {
  border-color: var(--amber, #f59e0b);
  color: var(--amber, #f59e0b);
}

.output-content {
  color: var(--text-primary, #e2e8f0);
  font-size: 14px;
  line-height: 1.6;
  min-height: 160px;
}

.placeholder {
  color: var(--text-dim, #64748b);
  font-style: italic;
}

.pending-text {
  color: var(--amber, #f59e0b);
  font-style: normal;
  display: flex;
  align-items: center;
  gap: 8px;
}

.routes-list {
  display: flex;
  flex-direction: column;
}

.poi-item {
  cursor: pointer;
  transition: all 0.2s ease;
}

.poi-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md, 12px);
  transition: background 0.2s ease;
}

.poi-header:hover {
  background: var(--glass, rgba(255, 255, 255, 0.03));
}

.poi-item.expanded .poi-header {
  background: var(--glass, rgba(255, 255, 255, 0.05));
}

.poi-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 28px;
}

.poi-number {
  width: 28px;
  height: 28px;
  background: var(--amber, #f59e0b);
  color: var(--midnight-deep, #0a0e1a);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  font-style: normal !important;
  font-variant-numeric: normal !important;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  transform: none !important;
  flex-shrink: 0;
  text-rendering: auto;
  -webkit-font-smoothing: antialiased;
  letter-spacing: 0;
}

.poi-connector {
  width: 2px;
  height: 24px;
  background: linear-gradient(to bottom, var(--amber, #f59e0b), transparent);
  margin-top: 4px;
}

.poi-info {
  flex: 1;
  min-width: 0;
}

.poi-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary, #e2e8f0);
  margin-bottom: 6px;
}

.poi-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 6px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
}

.meta-icon {
  font-size: 11px;
}

.poi-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim, #64748b);
}

.detail-icon {
  flex-shrink: 0;
}

.poi-expand-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-dim, #64748b);
  flex-shrink: 0;
}

.poi-description-card {
  margin: 0 0 8px 40px;
  padding: 16px;
  background: var(--card-bg, rgba(20, 30, 51, 0.4));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
  border-radius: var(--radius-md, 12px);
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.description-content {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-muted, #94a3b8);
}

.description-content :deep(strong) {
  color: var(--text-primary, #e2e8f0);
  font-weight: 500;
}

.summary-section {
  margin-top: 20px;
  padding: 16px;
  background: var(--glass, rgba(255, 255, 255, 0.03));
  border-radius: var(--radius-md, 12px);
  border-left: 3px solid var(--amber, #f59e0b);
}

.summary-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #e2e8f0);
  margin-bottom: 8px;
}

.summary-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-muted, #94a3b8);
}

.segment-card {
  margin: 0 0 8px 40px;
  padding: 16px;
  background: var(--card-bg, rgba(20, 30, 51, 0.4));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
  border-radius: var(--radius-md, 12px);
  animation: slideDown 0.2s ease;
}

.segment-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-primary, #e2e8f0);
}

.transport-icon {
  font-size: 16px;
}

.departure-time {
  color: var(--amber, #f59e0b);
  font-weight: 500;
}

.transport-modes {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.transport-modes button {
  padding: 4px 12px;
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
  border-radius: 16px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.transport-modes button:hover {
  border-color: var(--amber, #f59e0b);
  color: var(--amber, #f59e0b);
}

.transport-modes button.active {
  background: var(--amber, #f59e0b);
  border-color: var(--amber, #f59e0b);
  color: var(--midnight-deep, #0a0e1a);
}

.segment-detail {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
}

.road-list {
  font-size: 12px;
  color: var(--text-dim, #64748b);
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 12px;
}

.step-instruction {
  color: var(--text-muted, #94a3b8);
  flex: 1;
}

.step-distance {
  color: var(--text-dim, #64748b);
  flex-shrink: 0;
  margin-left: 12px;
}

.toggle-detail {
  background: transparent;
  border: none;
  color: var(--text-dim, #64748b);
  font-size: 12px;
  cursor: pointer;
  padding: 8px 0 0 0;
  transition: color 0.2s ease;
}

.toggle-detail:hover {
  color: var(--amber, #f59e0b);
}
</style>