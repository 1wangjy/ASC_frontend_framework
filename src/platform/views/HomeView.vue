<template>
  <div class="platform-page">
    <div class="platform-hero">
      <h1 class="platform-hero-title">ASC Design Platform</h1>
      <p class="platform-hero-subtitle">数智材料设计平台</p>
    </div>
    <div class="platform-models-grid">
      <div v-for="model in models" :key="model.route" class="platform-model-card" @click="router.push(model.route)">
        <div class="platform-model-icon">{{ model.icon }}</div>
        <h2>{{ model.title }}</h2>
        <p>{{ model.desc }}</p>
        <button class="btn">进入模型</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
const models = [
  { icon: '📈', title: '性能预测', desc: '提交配方信息，生成原料向量，预测材料性能', route: '/platform/model1' },
  { icon: '⚗️', title: '配方优化', desc: '提交测试指标，优化配方参数，提高材料性能', route: '/platform/model2' },
  { icon: '🌡️', title: '服役预测', desc: '提交工况指标，生成环境嵌入，评估服役性能', route: '/platform/model3' },
  { icon: '🎨', title: '3D温度场重建', desc: '加载结构拓扑文件和温度点文件，重构3D可视化图形', route: '/platform/model4' },
]
</script>

<style scoped>
.platform-page { padding: 20px; max-width: 1200px; margin: 0 auto; }
.platform-hero { text-align: center; padding: 60px 20px 40px; }
.platform-hero-title { font-size: 42px; font-weight: 800; background: linear-gradient(135deg, #005bac 0%, #004275 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -1px; margin-bottom: 12px; }
.platform-hero-subtitle { font-size: 18px; color: #6c757d; }
.platform-models-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; margin-top: 40px; }
.platform-model-card { background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 18px rgba(0,0,0,.07); cursor: pointer; transition: all .2s ease; text-align: center; border: 2px solid transparent; }
.platform-model-card:hover { transform: translateY(-8px); box-shadow: 0 20px 40px rgba(0,0,0,.12); border-color: #005bac; }
.platform-model-icon { font-size: 48px; margin-bottom: 20px; }
.platform-model-card h2 { color: #212529; margin-bottom: 12px; font-size: 20px; font-weight: 700; }
.platform-model-card p { color: #6c757d; font-size: 14px; line-height: 1.5; margin-bottom: 20px; }
</style>