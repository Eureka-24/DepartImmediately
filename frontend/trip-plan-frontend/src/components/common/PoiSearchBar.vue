<template>
  <div class="poi-search-bar">
    <div class="search-input-wrapper">
      <input
        v-model="keyword"
        type="text"
        class="search-input"
        placeholder="搜索景点..."
        @keyup.enter="handleSearch"
        :disabled="isSearching"
      />
      <button
        class="search-btn"
        @click="handleSearch"
        :disabled="isSearching || !keyword.trim()"
      >
        {{ isSearching ? '搜索中...' : '搜索' }}
      </button>
    </div>

    <!-- 搜索结果列表 -->
    <div v-if="searchResults.length > 0" class="search-results">
      <div
        v-for="(poi, index) in searchResults"
        :key="index"
        class="search-result-item"
        :class="{
          'selected': selectedSearchPoi?.name === poi.name,
          'already-added': addedPoiNames.has(poi.name)
        }"
        @click="handleSelectPoi(poi)"
      >
        <div class="result-main">
          <div class="result-name">{{ poi.name }}</div>
          <div class="result-type">{{ poi.type || '景点' }}</div>
        </div>
        <div class="result-meta">
          <span v-if="poi.rating" class="result-rating">⭐ {{ poi.rating }}</span>
          <span v-if="poi.address" class="result-address">{{ poi.address }}</span>
        </div>
        <div class="result-status">
          <span v-if="addedPoiNames.has(poi.name)" class="added-badge">✓已添加</span>
        </div>
      </div>
    </div>

    <!-- 无搜索结果 -->
    <div v-else-if="hasSearched && searchResults.length === 0" class="no-results">
      未找到相关景点
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMsg" class="search-error">{{ errorMsg }}</div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { searchPois } from '../../services/api'

const props = defineProps({
  // 已添加的 POI 名称集合（用于显示"✓已添加"状态）
  addedPoiNames: {
    type: Set,
    default: () => new Set()
  }
})

const emit = defineEmits(['poi-select', 'search-results', 'search-select'])

const keyword = ref('')
const isSearching = ref(false)
const hasSearched = ref(false)
const errorMsg = ref('')
const searchResults = ref([])

// 当前搜索选中的 POI（地图上显示蓝色虚线标记的那个）
const selectedSearchPoi = ref(null)

async function handleSearch() {
  const kw = keyword.value.trim()
  if (!kw || isSearching.value) return

  isSearching.value = true
  errorMsg.value = ''
  searchResults.value = []
  hasSearched.value = false
  selectedSearchPoi.value = null // 清空选择状态

  try {
    const results = await searchPois(kw, 'beijing')
    searchResults.value = results || []
    hasSearched.value = true
  } catch (err) {
    errorMsg.value = '搜索失败，请稍后重试'
    console.error('[PoiSearchBar] search error:', err)
  } finally {
    isSearching.value = false
  }
}

// 点击列表项：切换搜索选中状态
function handleSelectPoi(poi) {
  // 如果点击的是已添加的 POI，不切换选择状态
  if (props.addedPoiNames.has(poi.name)) return

  // 切换选中状态
  if (selectedSearchPoi.value?.name === poi.name) {
    // 再次点击同一项 → 取消选择
    selectedSearchPoi.value = null
  } else {
    // 点击不同项 → 选中新项
    selectedSearchPoi.value = poi
  }

  // 通知父组件地图上应该显示哪个蓝色虚线标记
  emit('search-select', selectedSearchPoi.value)
}

// 添加到已选列表后调用此方法标记为"已添加"
function markAsAdded(poiName) {
  // 组件内部不管理 addedPoiNames，由父组件通过 props 传入
  // 这里只是从 selectedSearchPoi 中移除
  if (selectedSearchPoi.value?.name === poiName) {
    selectedSearchPoi.value = null
    emit('search-select', null)
  }
}

// 暴露给父组件调用
defineExpose({
  markAsAdded
})

// 搜索结果变化时通知父组件
watch(searchResults, (newResults) => {
  emit('search-results', newResults)
})
</script>

<style scoped>
.poi-search-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-input-wrapper {
  display: flex;
  gap: 8px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  background: var(--card-bg, rgba(20, 30, 51, 0.6));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
  border-radius: var(--radius-md, 12px);
  color: var(--text-primary, #e2e8f0);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--amber, #f59e0b);
}

.search-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.search-btn {
  padding: 10px 20px;
  background: var(--amber, #f59e0b);
  border: none;
  border-radius: var(--radius-md, 12px);
  color: var(--midnight-deep, #0a0e1a);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.search-btn:hover:not(:disabled) {
  background: var(--coral, #f97316);
}

.search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.search-results {
  max-height: 300px;
  overflow-y: auto;
  background: var(--card-bg, rgba(20, 30, 51, 0.8));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
  border-radius: var(--radius-md, 12px);
}

.search-result-item {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background: var(--glass, rgba(255, 255, 255, 0.03));
}

.search-result-item.selected {
  background: rgba(59, 130, 246, 0.15);
  border-left: 3px solid #3b82f6;
}

.search-result-item.already-added {
  opacity: 0.6;
  cursor: default;
}

.search-result-item.already-added:hover {
  background: var(--glass, rgba(255, 255, 255, 0.03));
}

.result-main {
  flex: 1;
}

.result-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #e2e8f0);
  margin-bottom: 2px;
}

.result-type {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
}

.result-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  margin-right: 10px;
}

.result-rating {
  font-size: 12px;
  color: var(--amber, #f59e0b);
}

.result-address {
  font-size: 11px;
  color: var(--text-dim, #64748b);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-status {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.added-badge {
  padding: 2px 8px;
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.no-results {
  padding: 16px;
  text-align: center;
  color: var(--text-muted, #94a3b8);
  font-size: 14px;
}

.search-error {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-sm, 8px);
  color: #ef4444;
  font-size: 13px;
}
</style>