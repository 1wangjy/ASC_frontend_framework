<template>
  <div class="platform-page">
    <div class="page-header"><h1>性能预测</h1><a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a></div>
    <RecipeParserPanel :show-submit="false" :show-embedding="true" @parse="onParse" />
    <div v-if="showResult" class="card">
      <h2>性能预测结果</h2>
      <div class="result-item"><span class="result-label">Embedding形状:</span><span class="result-value">{{ embeddingShape }}</span></div>
      <div class="result-item"><span class="result-label">Embedding预览 (前5行前10列):</span><div class="vector-preview">{{ embeddingPreview }}</div></div>
      <div class="result-item" style="margin-top:24px">
        <button class="btn" :disabled="predictLoading" @click="runPrediction"><span v-if="predictLoading" class="loading" />{{ predictLoading ? '预测中...' : '运行性能预测 (Python后端)' }}</button>
      </div>
      <div v-if="showPrediction" style="margin-top:24px">
        <div class="result-item"><span class="result-label">性能预测:</span><span class="result-value">{{ prediction }}</span></div>
        <div class="result-item"><span class="result-label">置信度:</span><span class="result-value">{{ confidence }}</span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import RecipeParserPanel from '../components/RecipeParserPanel.vue'
import { submitModel1 } from '../api/models'
import { useRecipeParser } from '../composables/useRecipeParser'

const router = useRouter()
const recipeParser = useRecipeParser()
const showResult = ref(false)
const embeddingShape = ref('')
const embeddingPreview = ref('')
const currentEmbedding = ref(null)
const prediction = ref('')
const confidence = ref('')
const showPrediction = ref(false)
const predictLoading = ref(false)

function onParse(result) {
  currentEmbedding.value = result.embedding ?? null
  showResult.value = true
  if (result.embeddingShape) embeddingShape.value = JSON.stringify(result.embeddingShape)
  if (result.embedding && result.embedding.length > 0) {
    let preview = ''
    result.embedding.slice(0, 5).forEach((row, i) => { preview += `行 ${i+1}: [${row.slice(0,10).map(x => x.toFixed(4)).join(', ')}]\n` })
    embeddingPreview.value = preview
  }
}

async function runPrediction() {
  if (!currentEmbedding.value) return
  predictLoading.value = true
  try {
    const res = await submitModel1({ content: recipeParser.rawText?.value || '' })
    showPrediction.value = true
    prediction.value = String(res.prediction ?? JSON.stringify(res))
    confidence.value = String(res.confidence ?? 'N/A')
  } catch (e) { console.error('Prediction error:', e); alert('预测请求失败') }
  finally { predictLoading.value = false }
}
</script>