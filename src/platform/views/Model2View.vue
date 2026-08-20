<template>
  <div class="platform-page">
    <div class="page-header"><h1>配方优化</h1><a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a></div>
    <div class="card">
      <h2>测试指标</h2>
      <form @submit.prevent="handleSubmit">
        <div class="form-group"><label>指标数值</label><input v-model.number="value" type="number" step="0.01" placeholder="请输入测试指标数值"></div>
        <div class="form-group"><label>指标类型</label><select v-model="type"><option value="strength">强度</option><option value="hardness">硬度</option><option value="elasticity">弹性</option><option value="conductivity">导电性</option></select></div>
        <div class="form-group checkbox-group"><input v-model="loadEmbedding" type="checkbox" id="loadEmbedding"><label for="loadEmbedding">是否加载服役预测embedding文件</label></div>
        <button type="submit" class="btn" :disabled="loading"><span v-if="loading" class="loading" />{{ loading ? '处理中...' : '提交' }}</button>
      </form>
    </div>
    <div v-if="errorMsg" class="status-message error">{{ errorMsg }}</div>
    <div v-if="result" class="card">
      <h2>结果</h2>
      <div class="result-item"><span class="result-label">指标ID:</span><span class="result-value">{{ result.metricId }}</span></div>
      <div class="result-item"><span class="result-label">优化配方:</span>
        <div class="optimized-recipe">
          <ul class="ingredient-list" v-if="result.modelResult?.optimizedRecipe">
            <li v-for="(ing, i) in result.modelResult.optimizedRecipe.ingredients" :key="i">{{ ing }}: {{ (result.modelResult.optimizedRecipe.proportions[i] * 100).toFixed(2) }}%</li>
          </ul>
          <p v-else style="color:var(--text-secondary)">模型服务暂未返回结果</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { submitModel2 } from '../api/models'

const router = useRouter()
const value = ref(null)
const type = ref('strength')
const loadEmbedding = ref(false)
const loading = ref(false)
const result = ref(null)
const errorMsg = ref('')

async function handleSubmit() {
  if (value.value === null || isNaN(value.value)) { errorMsg.value = '请输入有效的指标数值'; return }
  errorMsg.value = ''; loading.value = true
  try {
    const res = await submitModel2({ metrics: { value: value.value, type: type.value }, loadEmbedding: loadEmbedding.value })
    result.value = res
    if (res.modelResult?.status === 'error') errorMsg.value = '配方优化模型服务不可用: ' + (res.modelResult.message || '请启动本地模型服务')
  } catch (e) { errorMsg.value = '提交失败，请稍后重试'; console.error(e) }
  finally { loading.value = false }
}
</script>