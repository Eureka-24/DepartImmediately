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
      const response = await axios.post(`${API_BASE_URL}/agent/plan`, {
        city,
        startTime,
        endTime,
        preferences
      })

      currentTrip.value = response.data

      // Add to history
      if (currentTrip.value) {
        history.value.unshift({
          id: currentTrip.value.id || Date.now(),
          city,
          startTime,
          endTime,
          preferences,
          result: currentTrip.value,
          createdAt: new Date().toISOString()
        })
      }

      return currentTrip.value
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to generate trip plan'
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function loadHistory() {
    isLoading.value = true
    error.value = null

    try {
      const response = await axios.get(`${API_BASE_URL}/agent/history`)
      history.value = response.data || []
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