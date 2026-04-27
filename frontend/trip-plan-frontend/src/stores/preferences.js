import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

export const usePreferencesStore = defineStore('preferences', () => {
  // State
  const preferences = ref({
    favoriteCities: [],
    favoriteTypes: [],
    travelStyle: []
  })
  const isLoading = ref(false)
  const error = ref(null)

  // Actions
  async function fetchPreferences() {
    isLoading.value = true
    error.value = null

    try {
      const response = await axios.get(`${API_BASE_URL}/auth/preferences`)

      if (response.data) {
        preferences.value = {
          favoriteCities: response.data.favorite_cities || [],
          favoriteTypes: response.data.favorite_types || [],
          travelStyle: response.data.travel_style || []
        }
      }

      return true
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch preferences'

      // If no preferences exist yet, that's ok - use defaults
      if (err.response?.status === 404) {
        preferences.value = {
          favoriteCities: [],
          favoriteTypes: [],
          travelStyle: []
        }
        return true
      }
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function updatePreferences(newPreferences) {
    isLoading.value = true
    error.value = null

    try {
      const payload = {
        favorite_cities: newPreferences.favoriteCities || [],
        favorite_types: newPreferences.favoriteTypes || [],
        travel_style: newPreferences.travelStyle || []
      }

      const response = await axios.put(`${API_BASE_URL}/auth/preferences`, payload)

      preferences.value = {
        favoriteCities: response.data.favorite_cities || [],
        favoriteTypes: response.data.favorite_types || [],
        travelStyle: response.data.travel_style || []
      }

      return true
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to update preferences'
      return false
    } finally {
      isLoading.value = false
    }
  }

  function resetPreferences() {
    preferences.value = {
      favoriteCities: [],
      favoriteTypes: [],
      travelStyle: []
    }
  }

  return {
    // State
    preferences,
    isLoading,
    error,
    // Actions
    fetchPreferences,
    updatePreferences,
    resetPreferences
  }
})