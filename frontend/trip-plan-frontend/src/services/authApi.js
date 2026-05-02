/**
 * 认证 API 模块
 * 封装所有认证相关的 API 调用
 */

import apiClient from './api'

/**
 * 用户注册
 * @param {string} username - 用户名
 * @param {string} password - 用户密码
 * @returns {Promise<{token: string, user: {id: string, username: string}}>}
 */
export async function register(username, password) {
  const data = await apiClient.post('/auth/register', { username, password })
  return data
}

/**
 * 用户登录
 * @param {string} username - 用户名
 * @param {string} password - 用户密码
 * @returns {Promise<{token: string, user: {id: string, username: string}}>}
 */
export async function login(username, password) {
  const data = await apiClient.post('/auth/login', { username, password })
  return data
}

/**
 * 获取用户信息
 * @returns {Promise<{id: string, email: string, createdAt: string, preferences: object}>}
 */
export async function getProfile() {
  const data = await apiClient.get('/auth/profile')
  return data
}

/**
 * 更新用户偏好
 * @param {object} preferences - 用户偏好设置
 * @param {string[]} preferences.favoriteCities - 喜欢的城市
 * @param {string[]} preferences.favoriteTypes - 喜欢的景点类型
 * @param {string} preferences.travelStyle - 旅行风格
 * @returns {Promise<object>}
 */
export async function updatePreferences(preferences) {
  const data = await apiClient.put('/auth/preferences', preferences)
  return data
}

export default {
  register,
  login,
  getProfile,
  updatePreferences,
}