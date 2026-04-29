import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

export const useTripStore = defineStore('trip', () => {
  // State
  const currentTrip = ref(null)
  const history = ref([])
  const isLoading = ref(false)
  const error = ref(null)
  const pendingTasks = ref(new Set()) // 记录正在异步等待的任务ID

  // Actions
  async function submitPlan(city, startTime, endTime, preferences) {
    isLoading.value = true
    error.value = null

    try {
      const response = await axios.post(`${API_BASE_URL}/agent/plan_async`, {
        city,
        startTime,
        endTime,
        preferences
      }, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      })

      console.log('[tripStore] API response:', response.data)

      // 解析后端响应结构: { success: true, data: { id, status: 'pending' } }
      const responseData = response.data
      const tripData = responseData.data || responseData

      // 添加到历史记录（初始状态为 pending）
      const historyItem = {
        id: tripData.id || Date.now(),
        city: tripData.city || city,
        startTime: tripData.startTime || startTime,
        endTime: tripData.endTime || endTime,
        preferences: tripData.preferences || preferences,
        result: null, // 异步任务，结果尚未生成
        status: 'pending',
        createdAt: new Date().toISOString()
      }

      // 检查是否已存在
      const existingIndex = history.value.findIndex(h => h.id === historyItem.id)
      if (existingIndex >= 0) {
        history.value[existingIndex] = historyItem
      } else {
        history.value.unshift(historyItem)
      }

      // 标记为待处理任务
      pendingTasks.value.add(historyItem.id)

      // 启动轮询
      pollTaskStatus(historyItem.id)

      console.log('[tripStore] historyItem:', historyItem)
      return tripData
    } catch (err) {
      error.value = err.response?.data?.error || err.message || 'Failed to generate trip plan'
      console.error('[tripStore] error:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  // 轮询任务状态
  async function pollTaskStatus(taskId, maxAttempts = 60) {
    let attempts = 0
    const pollInterval = 2000 // 2秒轮询一次

    const poll = async () => {
      if (!pendingTasks.value.has(taskId)) {
        return // 任务已被取消或完成
      }

      attempts++
      console.log(`[tripStore] Polling task ${taskId}, attempt ${attempts}`)

      try {
        const response = await axios.get(`${API_BASE_URL}/agent/task/${taskId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        })

        const taskData = response.data?.data
        if (!taskData) {
          console.warn('[tripStore] Invalid task response')
          return
        }

        // 更新历史记录中的状态和结果
        const historyIndex = history.value.findIndex(h => h.id === taskId)
        if (historyIndex >= 0) {
          history.value[historyIndex] = {
            ...history.value[historyIndex],
            status: taskData.status,
            result: taskData.result,
          }
        }

        // 如果任务完成或失败，停止轮询
        if (taskData.status === 'completed' || taskData.status === 'failed') {
          pendingTasks.value.delete(taskId)
          console.log(`[tripStore] Task ${taskId} ${taskData.status}`)
          return
        }

        // 如果超过最大轮询次数，停止轮询
        if (attempts >= maxAttempts) {
          console.warn(`[tripStore] Task ${taskId} polling timeout`)
          pendingTasks.value.delete(taskId)
          if (historyIndex >= 0) {
            history.value[historyIndex].status = 'failed'
          }
          return
        }

        // 继续轮询
        setTimeout(poll, pollInterval)
      } catch (err) {
        console.error('[tripStore] Poll error:', err)
        pendingTasks.value.delete(taskId)
      }
    }

    // 启动第一轮轮询
    setTimeout(poll, pollInterval)
  }

  async function loadHistory() {
    isLoading.value = true
    error.value = null

    try {
      const response = await axios.get(`${API_BASE_URL}/agent/history`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      })
      history.value = response.data?.data || []
      return true
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to load history'
      return false
    } finally {
      isLoading.value = false
    }
  }

  function setCurrentTrip(trip) {
    currentTrip.value = trip
  }

  function clearCurrentTrip() {
    currentTrip.value = null
  }

  async function deleteSession(id) {
    try {
      await axios.delete(`${API_BASE_URL}/agent/history/${id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      })
      // 从本地历史中移除
      history.value = history.value.filter(h => h.id !== id)
      return true
    } catch (err) {
      console.error('[tripStore] delete session error:', err)
      return false
    }
  }

  return {
    // State
    currentTrip,
    history,
    isLoading,
    error,
    // Actions
    submitPlan,
    loadHistory,
    setCurrentTrip,
    clearCurrentTrip,
    deleteSession
  }
})