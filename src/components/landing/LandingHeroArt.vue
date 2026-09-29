<template>
  <!-- 研究链路轨道插画：品牌核心 + 五个链路节点 + 流动虚线（纯 SVG，无外部图片依赖） -->
  <svg
    class="hero-art"
    viewBox="0 0 560 400"
    role="img"
    :aria-label="alt"
    preserveAspectRatio="xMidYMid meet"
  >
    <defs>
      <linearGradient id="ha-core" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7fd9f7" />
        <stop offset="55%" stop-color="#1a8fd0" />
        <stop offset="100%" stop-color="#0b5f96" />
      </linearGradient>
      <radialGradient id="ha-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(160,229,255,.55)" />
        <stop offset="60%" stop-color="rgba(26,143,208,.16)" />
        <stop offset="100%" stop-color="rgba(11,95,150,0)" />
      </radialGradient>
      <linearGradient id="ha-node" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#dff3ff" />
        <stop offset="100%" stop-color="#8ccbf0" />
      </linearGradient>
      <linearGradient id="ha-orbit" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(214,240,255,.55)" />
        <stop offset="45%" stop-color="rgba(214,240,255,.16)" />
        <stop offset="100%" stop-color="rgba(214,240,255,.5)" />
      </linearGradient>
    </defs>

    <!-- 外环 + 轨道（仅两条同心线，避免与辐条抢视觉） -->
    <circle class="hero-art__ring" cx="280" cy="205" r="238" />
    <circle class="hero-art__orbit" cx="280" cy="205" r="168" />

    <!-- 核心光晕 + 核心 -->
    <circle cx="280" cy="205" r="84" fill="url(#ha-halo)" />
    <circle class="hero-art__core" cx="280" cy="205" r="40" fill="url(#ha-core)" />
    <path
      class="hero-art__core-mark"
      d="M280 183.5 298.5 194v21L280 226.5 261.5 215v-21z"
    />
    <circle class="hero-art__pulse" cx="280" cy="205" r="40" />

    <!-- 链路节点 -->
    <g v-for="node in nodes" :key="node.label" class="hero-art__node">
      <line class="hero-art__spoke" :x1="280" :y1="205" :x2="node.x" :y2="node.y" />
      <circle class="hero-art__node-halo" :cx="node.x" :cy="node.y" r="15" />
      <circle class="hero-art__node-dot" :cx="node.x" :cy="node.y" r="7" fill="url(#ha-node)" />
      <text
        class="hero-art__label"
        :x="node.x + node.dx"
        :y="node.y + node.dy"
        :text-anchor="node.anchor"
      >{{ node.label }}</text>
    </g>
  </svg>
</template>

<script setup>
defineProps({
  alt: { type: String, default: '研究链路示意：文献入库、图谱构建、问题研究、性能预测、报告沉淀' },
})

// 五个链路节点沿同一轨道均布（与平台真实模块一致）
const R = 168
const CX = 280
const CY = 205
const STEPS = ['文献入库', '图谱构建', '问题研究', '性能预测', '报告沉淀']
const ANGLES = [-90, -18, 54, 126, 198]

const nodes = STEPS.map((label, i) => {
  const rad = (ANGLES[i] * Math.PI) / 180
  const x = CX + R * Math.cos(rad)
  const y = CY + R * Math.sin(rad)
  // 标签沿辐条向外推：上下象限走纵向，左右象限走横向，避免压到核心光环与轨道线
  const vertical = y > CY + 60 ? 26 : y < CY - 60 ? -17 : 20
  const horizontal = x > CX + 40 ? 14 : x < CX - 40 ? -14 : 0
  return {
    label,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    dx: horizontal,
    dy: vertical,
    anchor: x > CX + 40 ? 'start' : x < CX - 40 ? 'end' : 'middle',
  }
})
</script>

<style scoped>
.hero-art { display: block; width: 100%; height: 100%; }

.hero-art__ring {
  fill: none;
  stroke: rgba(214, 240, 255, 0.1);
  stroke-width: 1;
}

.hero-art__orbit {
  fill: none;
  stroke: url(#ha-orbit);
  stroke-width: 1.4;
  stroke-dasharray: 5 9;
  transform-origin: 280px 205px;
  animation: hero-art-spin 46s linear infinite;
}

.hero-art__spoke {
  stroke: rgba(190, 226, 248, 0.24);
  stroke-width: 1;
  stroke-dasharray: 3 6;
}

.hero-art__node-halo { fill: rgba(150, 214, 248, 0.14); }
.hero-art__node-dot {
  stroke: rgba(240, 250, 255, 0.85);
  stroke-width: 1.2;
}

.hero-art__label {
  fill: rgba(234, 246, 254, 0.92);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.hero-art__core { stroke: rgba(255, 255, 255, 0.35); stroke-width: 1.2; }
.hero-art__core-mark {
  fill: none;
  stroke: rgba(255, 255, 255, 0.85);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.hero-art__pulse {
  fill: none;
  stroke: rgba(180, 232, 255, 0.5);
  stroke-width: 1.2;
  transform-origin: 280px 205px;
  animation: hero-art-pulse 3.6s ease-out infinite;
}

@keyframes hero-art-spin {
  to { transform: rotate(360deg); }
}
@keyframes hero-art-pulse {
  0% { opacity: 0.55; transform: scale(1); }
  70% { opacity: 0; transform: scale(1.75); }
  100% { opacity: 0; transform: scale(1.75); }
}

/* 尊重系统「减少动态效果」设置 */
@media (prefers-reduced-motion: reduce) {
  .hero-art__orbit, .hero-art__pulse { animation: none; }
  .hero-art__pulse { opacity: 0.35; }
}
</style>
