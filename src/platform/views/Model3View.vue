<template>
  <div class="platform-page">
    <div class="page-header"><h1>服役预测</h1><a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a></div>
    <div class="card">
      <h2>工况指标</h2>
      <form @submit.prevent="handleSubmit">
        <div class="form-group"><label>温度 (℃)</label><input v-model.number="temperature" type="number" step="0.1" placeholder="请输入温度"></div>
        <div class="form-group"><label>压力 (MPa)</label><input v-model.number="pressure" type="number" step="0.1" placeholder="请输入压力"></div>
        <div class="form-group"><label>时间 (h)</label><input v-model.number="time" type="number" step="1" placeholder="请输入时间"></div>
        <button type="submit" class="btn" :disabled="loading"><span v-if="loading" class="loading" />{{ loading ? '处理中...' : '提交' }}</button>
      </form>
    </div>
    <div v-if="errorMsg" class="status-message error">{{ errorMsg }}</div>
    <div v-if="result" class="card">
      <h2>结果</h2>
      <div class="result-item"><span class="result-label">工况ID:</span><span class="result-value">{{ result.conditionId }}</span></div>
      <div v-if="result.embedding" class="result-item"><span class="result-label">环境Embedding:</span><div class="vector-preview">{{ JSON.stringify(result.embedding).substring(0, 200) }}...</div></div>
      <div class="result-item"><span class="result-label">环境评分:</span><span class="result-value">{{ result.environmentScore !== undefined ? result.environmentScore.toFixed(2) : '模型服务暂未返回评分' }}</span></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { submitModel3 } from '../api/models'

const router = useRouter()
const temperature = ref(null)
const pressure = ref(null)
const time = ref(null)
const loading = ref(false)
const result = ref(null)
const errorMsg = ref('')

async function handleSubmit() {
  if (temperature.value === null || pressure.value === null || time.value === null || isNaN(temperature.value) || isNaN(pressure.value) || isNaN(time.value)) { errorMsg.value = '请输入有效的工况指标'; return }
  errorMsg.value = ''; loading.value = true
  try {
    const res = await submitModel3({ temperature: temperature.value, pressure: pressure.value, time: time.value })
    result.value = res
    if (res.modelResult?.status === 'error') errorMsg.value = '服役预测模型服务不可用: ' + (res.modelResult.message || '请启动本地模型服务')
  } catch (e) { errorMsg.value = '提交失败，请稍后重试'; console.error(e) }
  finally { loading.value = false }
}
</script>