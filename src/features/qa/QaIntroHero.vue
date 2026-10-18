<template>
  <!-- 两种问答模式共用的首页标题区：位于「智能会话 / 深度研究」切换器下方，
       无边框；可手动收起/展开，发送提问或打开历史会话时自动收起。 -->
  <div class="qa-intro-hero" :class="{ 'qa-intro-hero--open': open }">
    <div class="qa-intro-hero__collapsible" :aria-hidden="open ? undefined : 'true'">
      <div class="qa-intro-hero__inner">
        <h1>今天想研究什么？</h1>
        <p>围绕耐火材料配方、工艺、组织结构、服役性能与失效机理提出问题</p>
      </div>
    </div>

    <button
      type="button"
      class="qa-intro-hero__toggle"
      :aria-expanded="open"
      :aria-label="open ? '收起标题区' : '展开标题区'"
      :title="open ? '收起' : '展开'"
      @click="emit('toggle')"
    >
      <svg
        class="qa-intro-hero__chevron"
        :class="{ 'qa-intro-hero__chevron--up': open }"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        aria-hidden="true"
      >
        <path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  // 展开状态由页面控制：首页展开，开始问答/打开历史会话后自动收起
  open: { type: Boolean, default: true }
})
const emit = defineEmits(['toggle'])
</script>

<style scoped>
.qa-intro-hero {
  width: 100%;
  display: grid;
  justify-items: center;
  text-align: center;
  margin-top: var(--qa-space-2, 8px);
}

/* 0fr ↔ 1fr 过渡：高度平滑收起/展开，无需测量像素 */
.qa-intro-hero__collapsible {
  display: grid;
  grid-template-rows: 0fr;
  width: 100%;
  opacity: 0;
  transition:
    grid-template-rows 0.42s cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 0.3s ease;
}

.qa-intro-hero--open .qa-intro-hero__collapsible {
  grid-template-rows: 1fr;
  opacity: 1;
}

.qa-intro-hero__inner {
  min-height: 0;
  overflow: hidden;
}

.qa-intro-hero__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: 6px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #6b8aa5;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.qa-intro-hero__toggle:hover {
  color: var(--qa-accent, #0869ad);
  background: rgba(8, 105, 173, 0.08);
}

.qa-intro-hero__toggle:focus-visible {
  outline: 2px solid rgba(8, 105, 173, 0.35);
  outline-offset: 2px;
}

.qa-intro-hero__chevron {
  transition: transform 0.42s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.qa-intro-hero__chevron--up {
  transform: rotate(180deg);
}
</style>
