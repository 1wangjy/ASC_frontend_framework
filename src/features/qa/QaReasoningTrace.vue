<template>
  <article class="reasoning-trace" :class="`reasoning-trace--${trace.mode || 'route'}`">
    <header class="reasoning-trace__header">
      <div class="reasoning-trace__mode">
        <span>推理模式</span>
        <strong>{{ trace.modeLabel || '自适应路由' }}</strong>
      </div>
      <div v-if="trace.routeLabel" class="reasoning-trace__route">
        <span>路由选择</span>
        <strong>{{ trace.routeLabel }}</strong>
      </div>
      <p v-if="trace.reason">{{ trace.reason }}</p>
    </header>

    <QaReasoningCanvas
      v-if="trace.topology"
      :topology="trace.topology"
      :question="question"
      :root-label="trace.rootLabel"
      :mode="trace.mode"
      :domain-terms="domainTerms"
    />

    <section v-else-if="trace.paths?.length" class="reasoning-trace__cot">
      <div class="reasoning-trace__cot-heading">
        <span>CoT</span>
        <strong>逐步验证主链</strong>
      </div>
      <div v-for="path in trace.paths" :key="path.id" class="reasoning-trace__cot-chain">
        <template v-for="(node, nodeIndex) in path.nodes" :key="`${path.id}-${nodeIndex}`">
          <div class="reasoning-trace__cot-step">
            <span>{{ nodeIndex + 1 }}</span>
            <strong><QaAnswerText :text="node" :domain-terms="domainTerms" /></strong>
          </div>
          <div v-if="nodeIndex < path.nodes.length - 1" class="reasoning-trace__cot-edge">
            <small v-if="path.relations[nodeIndex]">
              <QaAnswerText :text="path.relations[nodeIndex]" :domain-terms="domainTerms" />
            </small>
            <i aria-hidden="true">↓</i>
          </div>
        </template>
      </div>
    </section>

    <p v-else class="reasoning-trace__empty">本次回答返回了推理模式，但没有返回可展示的路径。</p>
  </article>
</template>

<script setup>
import QaAnswerText from './QaAnswerText.js'
import QaReasoningCanvas from './QaReasoningCanvas.vue'

defineProps({
  trace: {
    type: Object,
    required: true
  },
  domainTerms: {
    type: Array,
    default: () => []
  },
  question: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.reasoning-trace { display: grid; gap: 20px; white-space: normal; }
.reasoning-trace__header { display: grid; grid-template-columns: auto auto minmax(220px, 1fr); align-items: center; gap: 20px; padding: 15px 18px; border: 1px solid #cfe2ef; border-radius: 10px; background: #f6fbfe; }
.reasoning-trace__mode, .reasoning-trace__route { display: grid; gap: 3px; padding-right: 20px; border-right: 1px solid #d8e7ef; }
.reasoning-trace__header span, .reasoning-trace__family-heading span { color: var(--asc-muted); font-size: 10px; font-weight: 800; letter-spacing: .06em; }
.reasoning-trace__mode strong { color: var(--asc-primary); font-size: 18px; }
.reasoning-trace__route strong { color: var(--asc-heading); font-size: 13px; }
.reasoning-trace__header p { margin: 0; color: var(--asc-text); font-size: 12px; line-height: 1.7; }
.reasoning-trace__tot { display: grid; justify-items: center; }
.reasoning-trace__root { display: grid; min-width: 210px; justify-items: center; gap: 3px; padding: 11px 20px; border: 2px solid #3485b8; border-radius: 10px; background: #eef8fd; color: var(--asc-heading); }
.reasoning-trace__root span { color: var(--asc-primary); font-size: 9px; font-weight: 800; letter-spacing: .1em; }
.reasoning-trace__trunk { width: 2px; height: 26px; background: #9ec6dd; }
.reasoning-trace__families { width: 100%; display: grid; gap: 18px; }
.reasoning-trace__family { position: relative; display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 24px; padding: 16px; border: 1px solid #d7e5ee; border-radius: 12px; background: #fbfdfe; }
.reasoning-trace__family::before { position: absolute; top: -19px; left: 104px; width: 2px; height: 18px; background: #9ec6dd; content: ''; }
.reasoning-trace__family-heading { align-self: start; display: grid; gap: 5px; padding: 12px 14px; border-left: 4px solid #3485b8; border-radius: 7px; background: #eef7fc; }
.reasoning-trace__family-heading strong { color: var(--asc-heading); font-size: 13px; }
.reasoning-trace__family-heading small { color: var(--asc-muted); font-size: 10px; }
.reasoning-trace__branches { display: grid; gap: 12px; }
.reasoning-trace__branch { position: relative; min-width: 0; padding: 13px 14px; border: 1px solid #d7e5ee; border-radius: 10px; background: #fff; }
.reasoning-trace__branch::before { position: absolute; top: 28px; left: -25px; width: 24px; height: 1px; background: #9ec6dd; content: ''; }
.reasoning-trace__branch.is-primary { border-color: #74b5d8; box-shadow: inset 3px 0 #1682bd; }
.reasoning-trace__branch > header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.reasoning-trace__branch > header span { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 50%; background: #eaf5fb; color: var(--asc-primary); font-size: 10px; font-weight: 800; }
.reasoning-trace__branch > header strong { color: var(--asc-heading); font-size: 12px; }
.reasoning-trace__branch > header small { margin-left: auto; color: #08745f; font-size: 10px; font-weight: 700; }
.reasoning-trace__chain { display: flex; align-items: center; gap: 7px; overflow-x: auto; padding: 3px 0 8px; }
.reasoning-trace__node { flex: 0 0 auto; max-width: 210px; padding: 8px 11px; border: 1px solid #b9d8eb; border-radius: 8px; background: #f2f9fd; color: var(--asc-heading); font-size: 11px; font-weight: 700; }
.reasoning-trace__edge { flex: 0 0 auto; display: grid; max-width: 160px; justify-items: center; color: var(--asc-muted); text-align: center; }
.reasoning-trace__edge small { overflow-wrap: anywhere; font-size: 9px; line-height: 1.35; }
.reasoning-trace__edge i { color: var(--asc-primary); font-size: 17px; font-style: normal; }
.reasoning-trace__branch details { margin-top: 7px; color: var(--asc-muted); font-size: 10px; }
.reasoning-trace__branch summary { width: fit-content; cursor: pointer; font-weight: 700; }
.reasoning-trace__branch ul { display: grid; gap: 5px; margin: 8px 0 0; padding-left: 18px; color: var(--asc-text); line-height: 1.6; }
.reasoning-trace__cot { display: grid; justify-items: center; gap: 14px; }
.reasoning-trace__cot-heading { display: flex; align-items: center; gap: 9px; padding: 9px 16px; border-radius: 999px; background: #eaf6fc; color: var(--asc-heading); }
.reasoning-trace__cot-heading span { color: var(--asc-primary); font-size: 10px; font-weight: 800; }
.reasoning-trace__cot-chain { width: min(100%, 720px); display: grid; justify-items: center; }
.reasoning-trace__cot-step { width: min(100%, 540px); display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 10px; padding: 11px 14px; border: 1px solid #c9dfec; border-radius: 9px; background: #f6fbfe; }
.reasoning-trace__cot-step span { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 50%; background: var(--asc-primary); color: #fff; font-size: 10px; font-weight: 800; }
.reasoning-trace__cot-step strong { color: var(--asc-heading); font-size: 12px; }
.reasoning-trace__cot-edge { display: grid; justify-items: center; min-height: 40px; color: var(--asc-muted); }
.reasoning-trace__cot-edge small { font-size: 9px; }
.reasoning-trace__cot-edge i { color: var(--asc-primary); font-size: 17px; font-style: normal; }
.reasoning-trace__empty { margin: 0; padding: 18px; border-radius: 9px; background: #f7f9fb; color: var(--asc-muted); text-align: center; }
@media (max-width: 900px) {
  .reasoning-trace__header { grid-template-columns: 1fr 1fr; }
  .reasoning-trace__header p { grid-column: 1 / -1; }
  .reasoning-trace__family { grid-template-columns: 1fr; }
  .reasoning-trace__family::before, .reasoning-trace__branch::before { display: none; }
}
@media (max-width: 560px) {
  .reasoning-trace__header { grid-template-columns: 1fr; }
  .reasoning-trace__mode, .reasoning-trace__route { padding: 0 0 10px; border-right: 0; border-bottom: 1px solid #d8e7ef; }
  .reasoning-trace__header p { grid-column: auto; }
}
</style>
