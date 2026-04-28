<template>
  <div class="itinerary-output">
    <div class="output-header">
      <span class="output-label">AI 路线规划助手</span>
      <button v-if="result" class="copy-btn" @click="copyOutput" title="复制内容">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <div ref="outputContent" class="output-content">
      <span v-if="!result" class="placeholder">{{ placeholder }}</span>
      <span v-else class="formatted-text" v-html="displayText"></span>
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
  placeholder: {
    type: String,
    default: '请填写上方表单，点击「生成路线规划」开始智能规划...'
  }
})

const outputContent = ref(null)
const displayText = ref('')
const copied = ref(false)

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

// 将纯文本转换为 HTML（处理换行和空格）
function textToHtml(text) {
  return text
    .replace(/\n/g, '<br>')
    .replace(/  /g, '&nbsp;&nbsp;')
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
  if (newResult) {
    const formattedText = formatResult(newResult)
    displayText.value = textToHtml(formattedText)
  } else {
    displayText.value = ''
  }
}, { immediate: true })
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

.formatted-text {
  display: block;
}
</style>