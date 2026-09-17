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
.reasoning-trace { display: grid; gap: var(--qa-space-5); white-space: normal; }
.reasoning-trace__header { display: grid; grid-template-columns: auto auto minmax(220px, 1fr); align-items: center; gap: var(--qa-space-5); padding: var(--qa-panel-pad); border: 1px solid var(--qa-border-color); border-radius: var(--qa-radius-card); background: var(--qa-surface-soft); }
.reasoning-trace__mode, .reasoning-trace__route { display: grid; gap: var(--qa-space-1); padding-right: var(--qa-space-5); border-right: 1px solid var(--qa-border-color); }
.reasoning-trace__header span, .reasoning-trace__family-heading span { color: var(--qa-muted); font-size: var(--qa-font-sm); font-weight: var(--qa-weight-heavy); letter-spacing: .06em; }
.reasoning-trace__mode strong { color: var(--qa-accent); font-size: var(--qa-heading-size); }
.reasoning-trace__route strong { color: var(--qa-heading); font-size: var(--qa-control-font); }
.reasoning-trace__header p { margin: 0; color: var(--qa-text); font-size: var(--qa-control-font); line-height: 1.7; }
.reasoning-trace__tot { display: grid; justify-items: center; }
.reasoning-trace__root { display: grid; min-width: 210px; justify-items: center; gap: var(--qa-space-1); padding: var(--qa-space-3) var(--qa-space-5); border: 2px solid #3485b8; border-radius: var(--qa-radius-card); background: var(--qa-accent-soft); color: var(--qa-heading); }
.reasoning-trace__root span { color: var(--qa-accent); font-size: 9px; font-weight: var(--qa-weight-heavy); letter-spacing: .1em; }
.reasoning-trace__trunk { width: 2px; height: var(--qa-space-6); background: #9ec6dd; }
.reasoning-trace__families { width: 100%; display: grid; gap: var(--qa-space-5); }
.reasoning-trace__family { position: relative; display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: var(--qa-space-6); padding: var(--qa-panel-pad); border: 1px solid var(--qa-border-color); border-radius: var(--qa-radius-container); background: var(--qa-surface-soft); }
.reasoning-trace__family::before { position: absolute; top: -19px; left: 104px; width: 2px; height: var(--qa-space-5); background: #9ec6dd; content: ''; }
.reasoning-trace__family-heading { align-self: start; display: grid; gap: var(--qa-space-1); padding: var(--qa-space-3); border-left: 4px solid #3485b8; border-radius: var(--qa-radius-control); background: var(--qa-accent-soft); }
.reasoning-trace__family-heading strong { color: var(--qa-heading); font-size: var(--qa-control-font); }
.reasoning-trace__family-heading small { color: var(--qa-muted); font-size: var(--qa-font-xs); }
.reasoning-trace__branches { display: grid; gap: var(--qa-space-3); }
.reasoning-trace__branch { position: relative; min-width: 0; padding: var(--qa-space-3); border: 1px solid var(--qa-border-color); border-radius: var(--qa-radius-card); background: var(--qa-surface); }
.reasoning-trace__branch::before { position: absolute; top: 28px; left: -25px; width: var(--qa-space-6); height: 1px; background: #9ec6dd; content: ''; }
.reasoning-trace__branch.is-primary { border-color: #74b5d8; box-shadow: inset 3px 0 #1682bd; }
.reasoning-trace__branch > header { display: flex; align-items: center; gap: var(--qa-space-2); margin-bottom: var(--qa-space-3); }
.reasoning-trace__branch > header span { display: grid; width: var(--qa-chip-h); height: var(--qa-chip-h); place-items: center; border-radius: var(--qa-radius-chip); background: var(--qa-accent-soft); color: var(--qa-accent); font-size: 10px; font-weight: var(--qa-weight-heavy); }
.reasoning-trace__branch > header strong { color: var(--qa-heading); font-size: var(--qa-font-sm); }
.reasoning-trace__branch > header small { margin-left: auto; color: #08745f; font-size: 10px; font-weight: var(--qa-weight-bold); }
.reasoning-trace__chain { display: flex; align-items: center; gap: var(--qa-space-2); overflow-x: auto; padding: var(--qa-space-1) 0 var(--qa-space-2); }
.reasoning-trace__node { flex: 0 0 auto; max-width: 210px; padding: var(--qa-space-2) var(--qa-space-3); border: 1px solid var(--qa-border-strong); border-radius: var(--qa-radius-control); background: var(--qa-accent-soft); color: var(--qa-heading); font-size: var(--qa-font-xs); font-weight: var(--qa-weight-bold); }
.reasoning-trace__edge { flex: 0 0 auto; display: grid; max-width: 160px; justify-items: center; color: var(--qa-muted); text-align: center; }
.reasoning-trace__edge small { overflow-wrap: anywhere; font-size: 9px; line-height: 1.35; }
.reasoning-trace__edge i { color: var(--qa-accent); font-size: 17px; font-style: normal; }
.reasoning-trace__branch details { margin-top: var(--qa-space-2); color: var(--qa-muted); font-size: 10px; }
.reasoning-trace__branch summary { width: fit-content; cursor: pointer; font-weight: var(--qa-weight-bold); }
.reasoning-trace__branch ul { display: grid; gap: var(--qa-space-1); margin: var(--qa-space-2) 0 0; padding-left: var(--qa-space-5); color: var(--qa-text); line-height: 1.6; }
.reasoning-trace__cot { display: grid; justify-items: center; gap: var(--qa-space-3); }
.reasoning-trace__cot-heading { display: flex; align-items: center; gap: var(--qa-space-2); padding: var(--qa-space-2) var(--qa-panel-pad); border-radius: var(--qa-radius-chip); background: var(--qa-accent-soft); color: var(--qa-heading); }
.reasoning-trace__cot-heading span { color: var(--qa-accent); font-size: var(--qa-font-sm); font-weight: var(--qa-weight-heavy); }
.reasoning-trace__cot-chain { width: min(100%, 720px); display: grid; justify-items: center; }
.reasoning-trace__cot-step { width: min(100%, 540px); display: grid; grid-template-columns: var(--qa-control-h-sm) minmax(0, 1fr); align-items: center; gap: var(--qa-space-2); padding: var(--qa-space-3); border: 1px solid var(--qa-border-color); border-radius: var(--qa-radius-control); background: var(--qa-surface-soft); }
.reasoning-trace__cot-step span { display: grid; width: var(--qa-chip-h); height: var(--qa-chip-h); place-items: center; border-radius: var(--qa-radius-chip); background: var(--qa-accent); color: #fff; font-size: 10px; font-weight: var(--qa-weight-heavy); }
.reasoning-trace__cot-step strong { color: var(--qa-heading); font-size: var(--qa-control-font); }
.reasoning-trace__cot-edge { display: grid; justify-items: center; min-height: var(--qa-space-10); color: var(--qa-muted); }
.reasoning-trace__cot-edge small { font-size: var(--qa-font-sm); }
.reasoning-trace__cot-edge i { color: var(--qa-accent); font-size: 17px; font-style: normal; }
.reasoning-trace__empty { margin: 0; padding: var(--qa-panel-pad); border-radius: var(--qa-radius-card); background: var(--qa-surface-soft); color: var(--qa-muted); text-align: center; }
@media (max-width: 900px) {
  .reasoning-trace__header { grid-template-columns: 1fr 1fr; }
  .reasoning-trace__header p { grid-column: 1 / -1; }
  .reasoning-trace__family { grid-template-columns: 1fr; }
  .reasoning-trace__family::before, .reasoning-trace__branch::before { display: none; }
}
@media (max-width: 560px) {
  .reasoning-trace__header { grid-template-columns: 1fr; }
  .reasoning-trace__mode, .reasoning-trace__route { padding: 0 0 var(--qa-space-3); border-right: 0; border-bottom: 1px solid var(--qa-border-color); }
  .reasoning-trace__header p { grid-column: auto; }
}
</style>
