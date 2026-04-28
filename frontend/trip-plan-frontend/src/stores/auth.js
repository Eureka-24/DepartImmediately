import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '../services/authApi'

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref(null)
  const token = ref(localStorage.getItem('token') || null)
  const isLoading = ref(false)
  const error = ref(null)
  const initialized = ref(false)

  // Getters
  const isLoggedIn = computed(() => !!token.value && !!user.value)

  // Actions
  async function login(email, password) {
    isLoading.value = true
    error.value = null

    try {
      const data = await authApi.login(email, password)
      token.value = data.token
      user.value = data.user
      localStorage.setItem('token', data.token)
      return true
    } catch (err) {
      error.value = err.message || '登录失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function register(email, password) {
    isLoading.value = true
    error.value = null

    try {
      await authApi.register(email, password)
      return true
    } catch (err) {
      error.value = err.message || '注册失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }

  async function fetchProfile() {
    if (!token.value) return false

    isLoading.value = true
    error.value = null

    try {
      const data = await authApi.getProfile()
      user.value = {
        id: data.id,
        email: data.email,
        createdAt: data.createdAt,
        preferences: data.preferences,
      }
      return true
    } catch (err) {
      error.value = err.message || '获取用户信息失败'

      // If token is invalid, logout
      if (err.response?.status === 401) {
        logout()
      }
      return false
    } finally {
      isLoading.value = false
    }
  }

  // Initialize auth state on store creation
  async function init() {
    if (token.value) {
      await fetchProfile()
    }
    initialized.value = true
  }

  return {
    // State
    user,
    token,
    isLoading,
    error,
    initialized,
    // Getters
    isLoggedIn,
    // Actions
    login,
    register,
    logout,
    fetchProfile,
    init,
  }
})