<template>
  <article class="logic-derivation">
    <section
      v-for="section in derivation.sections"
      :key="section.label"
      class="logic-derivation__section"
    >
      <div class="logic-derivation__label">{{ section.label }}</div>
      <div class="logic-derivation__content">
        <p v-if="section.content">
          <QaAnswerText :text="section.content" :domain-terms="domainTerms" />
        </p>
        <div
          v-if="section.label === '本体约束' && derivation.ontologyTerms?.length"
          class="logic-derivation__terms"
          aria-label="本体约束对象"
        >
          <span v-for="term in derivation.ontologyTerms" :key="term">{{ term }}</span>
        </div>
        <ol v-if="section.items?.length">
          <li v-for="item in section.items" :key="item">
            <QaAnswerText :text="item" :domain-terms="domainTerms" />
          </li>
        </ol>
      </div>
    </section>
  </article>
</template>

<script setup>
import QaAnswerText from './QaAnswerText.js'

defineProps({
  derivation: {
    type: Object,
    required: true
  },
  domainTerms: {
    type: Array,
    default: () => []
  }
})
</script>

<style scoped>
.logic-derivation { display: grid; gap: var(--qa-space-3); white-space: normal; }
.logic-derivation__section { display: grid; grid-template-columns: 128px minmax(0, 1fr); overflow: hidden; border: 1px solid var(--qa-border-color); border-radius: var(--qa-radius-card); background: var(--qa-surface); }
.logic-derivation__label { padding: var(--qa-panel-pad); border-right: 1px solid var(--qa-border-color); background: var(--qa-surface-soft); color: var(--qa-heading); font-size: var(--qa-font-sm); font-weight: var(--qa-weight-heavy); }
.logic-derivation__content { min-width: 0; padding: var(--qa-space-3) var(--qa-panel-pad); }
.logic-derivation__content p { margin: 0; line-height: 1.8; }
.logic-derivation__content ol { display: grid; gap: var(--qa-space-2); margin: 0; padding-left: var(--qa-space-5); }
.logic-derivation__terms { display: flex; flex-wrap: wrap; gap: var(--qa-space-2); margin-top: var(--qa-space-2); }
.logic-derivation__terms span { min-height: var(--qa-chip-h); display: inline-flex; align-items: center; padding: 0 var(--qa-space-2); border: 1px solid #add8ca; border-radius: var(--qa-radius-chip); background: var(--qa-success-soft); color: #08745f; font-size: var(--qa-control-font); font-weight: var(--qa-weight-bold); }
@media (max-width: 760px) {
  .logic-derivation__section { grid-template-columns: 1fr; }
  .logic-derivation__label { border-right: 0; border-bottom: 1px solid var(--qa-border-color); }
}
</style>
