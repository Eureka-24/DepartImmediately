<template>
  <div class="auth-container">
    <div class="auth-card">
      <h1 class="auth-title">欢迎回来</h1>
      <p class="auth-subtitle">登录您的账户以继续</p>

      <div v-if="error" class="error-message">{{ error }}</div>

      <form class="auth-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">用户名</label>
          <input
            type="text"
            id="username"
            v-model="username"
            placeholder="请输入用户名"
            required
          />
        </div>

        <div class="form-group">
          <label for="password">密码</label>
          <input
            type="password"
            id="password"
            v-model="password"
            placeholder="请输入密码"
            required
          />
        </div>

        <button type="submit" class="submit-btn" :disabled="isLoading">
          {{ isLoading ? '登录中...' : '登录' }}
        </button>
      </form>

      <div class="auth-footer">
        还没有账户? <router-link to="/register">立即注册</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')

async function handleLogin() {
  error.value = ''

  const success = await authStore.login(username.value, password.value)

  if (success) {
    router.push('/')
  } else {
    error.value = authStore.error || '登录失败'
  }
}
</script>