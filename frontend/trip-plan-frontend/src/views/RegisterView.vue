<template>
  <div class="auth-container">
    <div class="auth-card">
      <h1 class="auth-title">创建账户</h1>
      <p class="auth-subtitle">注册后开启您的智能旅行规划</p>

      <div v-if="error" class="error-message">{{ error }}</div>

      <form class="auth-form" @submit.prevent="handleRegister">
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
            minlength="6"
          />
        </div>

        <button type="submit" class="submit-btn" :disabled="isLoading">
          {{ isLoading ? '注册中...' : '注册' }}
        </button>
      </form>

      <div class="auth-footer">
        已有账户? <router-link to="/login">立即登录</router-link>
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

async function handleRegister() {
  error.value = ''

  if (password.value.length < 6) {
    error.value = '密码长度至少为6个字符'
    return
  }

  const success = await authStore.register(username.value, password.value)

  if (success) {
    router.push('/login')
  } else {
    error.value = authStore.error || '注册失败'
  }
}
</script>