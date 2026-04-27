/**
 * API 基础服务模块
 * 基于 axios 封装请求拦截器和响应拦截器
 */

import axios from 'axios'

// API 基础路径
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：附加 JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器：统一处理错误
apiClient.interceptors.response.use(
  (response) => {
    // 如果是标准响应格式 { success, data }，直接返回 data
    if (response.data && typeof response.data.success === 'boolean') {
      if (response.data.success) {
        return response.data.data
      } else {
        // 服务器返回错误
        const error = new Error(response.data.error || '请求失败')
        error.response = response
        return Promise.reject(error)
      }
    }
    return response.data
  },
  (error) => {
    // 处理网络错误或服务器未响应
    if (!error.response) {
      const networkError = new Error('网络连接失败，请检查网络')
      return Promise.reject(networkError)
    }

    // 根据 HTTP 状态码处理
    switch (error.response.status) {
      case 401:
        // Token 过期或无效，清除本地存储并跳转登录
        localStorage.removeItem('token')
        window.location.href = '/login'
        break
      case 403:
        error.message = '禁止访问'
        break
      case 404:
        error.message = '请求的资源不存在'
        break
      case 500:
        error.message = '服务器内部错误'
        break
      default:
        // 从响应数据中提取错误信息
        if (error.response.data && error.response.data.error) {
          error.message = error.response.data.error
        }
    }

    return Promise.reject(error)
  }
)

export default apiClient