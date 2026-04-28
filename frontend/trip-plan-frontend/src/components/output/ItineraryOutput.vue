<template>
  <div class="itinerary-output">
    <div class="output-header">
      <span class="output-dot" :class="{ active: isTyping }"></span>
      <span class="output-label">AI 路线规划助手</span>
      <button v-if="result" class="copy-btn" @click="copyOutput" title="复制内容">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <div ref="outputContent" class="output-content">
      <span v-if="!result" class="placeholder">{{ placeholder }}</span>
      <template v-else>
        <span class="typed-text" v-html="displayText"></span>
        <span v-if="isTyping" class="cursor"></span>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  result: {
    type: Object,
    default: null
  },
  placeholder: {
    type: String,
    default: '请填写上方表单，点击「生成路线规划」开始智能规划...'
  },
  typingSpeed: {
    type: Number,
    default: 25 // 每字符25ms
  }
})

const emit = defineEmits(['typed-complete'])

const outputContent = ref(null)
const displayText = ref('')
const isTyping = ref(false)
const copied = ref(false)
let typingTimer = null

// 格式化结果为可读文本
function formatResult(result) {
  if (!result || !result.routes || result.routes.length === 0) {
    return '抱歉，暂未生成有效的路线规划，请稍后重试。'
  }

  const lines = []

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('        🚀 智能旅行路线规划')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('')

  // 遍历扁平 routes 数组
  if (result.routes && result.routes.length > 0) {
    lines.push('📌 推荐路线:')
    lines.push('')

    result.routes.forEach((poi, index) => {
      const num = index + 1
      lines.push(`  ${num}. ${poi.name || '未知景点'}`)
      if (poi.time) {
        lines.push(`     🕐 时间: ${poi.time}`)
      }
      if (poi.rating) {
        lines.push(`     ⭐ 评分: ${poi.rating}`)
      }
      if (poi.duration) {
        lines.push(`     ⏳ 停留: ${poi.duration}`)
      }
      if (poi.reason) {
        lines.push(`     💡 推荐: ${poi.reason}`)
      }
      if (poi.transport) {
        lines.push(`     🚶 交通: ${poi.transport}`)
      }
      if (poi.location) {
        lines.push(`     📍 地址: ${poi.location}`)
      }
      // 显示 description（如果是 Markdown 格式的详细描述）
      if (poi.description) {
        lines.push('')
        lines.push(`     📝 详情:`)
        const descLines = poi.description.split('\n')
        descLines.forEach(line => {
          // 移除 Markdown 格式符号使文本更清晰
          const cleanLine = line.replace(/\*\*/g, '').replace(/^- /g, '   • ')
          lines.push(`        ${cleanLine}`)
        })
      }
      lines.push('')
    })
  }

  // 路线总结
  if (result.summary) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('')
    lines.push('📝 路线总结:')
    lines.push(`   ${result.summary}`)
    lines.push('')
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('        祝您旅途愉快！ 🌟')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return lines.join('\n')
}

// 格式化日期时间
function formatDateTime(dt) {
  if (!dt) return ''
  const date = new Date(dt)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day} ${hour}:${min}`
}

// 格式化时长
function formatDuration(minutes) {
  if (!minutes) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 24) {
    const days = Math.floor(hours / 24)
    const remainHours = hours % 24
    return `${days}天 ${remainHours}小时`
  }
  return hours > 0 ? `${hours}小时${mins > 0 ? mins + '分钟' : ''}` : `${mins}分钟`
}

// 格式化评分
function formatScore(score) {
  if (!score) return ''
  const stars = Math.round(score * 5)
  return '★'.repeat(stars) + '☆'.repeat(5 - stars)
}

// 打字机效果
function startTyping(text) {
  // 清除之前的定时器
  if (typingTimer) {
    clearTimeout(typingTimer)
  }

  displayText.value = ''
  isTyping.value = true

  let index = 0
  const chars = text.split('')

  function typeNext() {
    if (index < chars.length) {
      // 处理换行符和多个空格
      const char = chars[index]
      if (char === '\n') {
        displayText.value += '<br>'
      } else if (char === ' ' && chars[index - 1] === ' ') {
        displayText.value += '&nbsp;&nbsp;'
      } else {
        displayText.value += char
      }
      index++
      typingTimer = setTimeout(typeNext, props.typingSpeed)
    } else {
      isTyping.value = false
      emit('typed-complete')
    }
  }

  typeNext()
}

// 复制内容
async function copyOutput() {
  if (!props.result) return

  const text = formatResult(props.result)
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}

// 监听 result 变化
watch(() => props.result, (newResult) => {
  console.log('[ItineraryOutput] watch triggered, newResult:', newResult)
  if (newResult) {
    console.log('[ItineraryOutput] newResult.routes:', newResult.routes)
    const formattedText = formatResult(newResult)
    console.log('[ItineraryOutput] formattedText:', formattedText.substring(0, 200))
    nextTick(() => {
      startTyping(formattedText)
    })
  } else {
    displayText.value = ''
    isTyping.value = false
  }
}, { immediate: true })

// 清理定时器
import { onUnmounted } from 'vue'
onUnmounted(() => {
  if (typingTimer) {
    clearTimeout(typingTimer)
  }
})
</script>

<style scoped>
.itinerary-output {
  width: 100%;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  line-height: 2;
}

.output-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
}

.output-dot {
  width: 8px;
  height: 8px;
  background: var(--text-dim, #64748b);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--text-dim, #64748b);
  transition: all 0.3s ease;
}

.output-dot.active {
  background: var(--amber, #f59e0b);
  box-shadow: 0 0 10px var(--amber, #f59e0b);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
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
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary, #e2e8f0);
  font-size: 14px;
  line-height: 2;
  min-height: 160px;
}

.placeholder {
  color: var(--text-dim, #64748b);
  font-style: italic;
}

.typed-text {
  display: inline;
}

.cursor {
  display: inline-block;
  width: 8px;
  height: 18px;
  background: linear-gradient(180deg, var(--amber, #f59e0b), var(--coral, #f97316));
  animation: blink 0.8s infinite;
  vertical-align: middle;
  margin-left: 4px;
  border-radius: 2px;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
</style>