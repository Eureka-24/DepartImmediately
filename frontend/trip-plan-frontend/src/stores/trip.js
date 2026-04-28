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

  // Actions
  async function submitPlan(city, startTime, endTime, preferences) {
    isLoading.value = true
    error.value = null

    try {
      const response = await axios.post(`${API_BASE_URL}/agent/plan_test`, {
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

      // 解析后端响应结构: { success: true, data: { id, city, startTime, endTime, result } }
      const responseData = response.data
      const tripData = responseData.data || responseData
      const result = tripData.result || tripData

      console.log('[tripStore] tripData:', tripData)
      console.log('[tripStore] result (inner):', result)

      currentTrip.value = tripData.result || tripData

      // Add to history - 确保 result 结构正确
      const historyItem = {
        id: tripData.id || Date.now(),
        city: tripData.city || city,
        startTime: tripData.startTime || startTime,
        endTime: tripData.endTime || endTime,
        preferences: tripData.preferences || preferences,
        result: result, // 这是实际的路线规划结果 { routes, alternatives }
        createdAt: new Date().toISOString()
      }

      console.log('[tripStore] historyItem:', historyItem)

      // 在添加前检查是否已存在
      const existingIndex = history.value.findIndex(h => h.id === historyItem.id)
      if (existingIndex >= 0) {
        history.value[existingIndex] = historyItem
      } else {
        history.value.unshift(historyItem)
      }

      console.log('[tripStore] returning tripData:', tripData)
      return tripData
    } catch (err) {
      error.value = err.response?.data?.error || err.message || 'Failed to generate trip plan'
      console.error('[tripStore] error:', err)
      return null
    } finally {
      isLoading.value = false
    }
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
    clearCurrentTrip
  }
})