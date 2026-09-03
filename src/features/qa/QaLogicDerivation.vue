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
.logic-derivation { display: grid; gap: 12px; white-space: normal; }
.logic-derivation__section { display: grid; grid-template-columns: 128px minmax(0, 1fr); overflow: hidden; border: 1px solid #d7e5ee; border-radius: 10px; background: #fff; }
.logic-derivation__label { padding: 14px 16px; border-right: 1px solid #d7e5ee; background: #f3f8fb; color: var(--asc-heading); font-size: 12px; font-weight: 800; }
.logic-derivation__content { min-width: 0; padding: 13px 16px; }
.logic-derivation__content p { margin: 0; line-height: 1.8; }
.logic-derivation__content ol { display: grid; gap: 8px; margin: 0; padding-left: 20px; }
.logic-derivation__terms { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
.logic-derivation__terms span { padding: 4px 9px; border: 1px solid #add8ca; border-radius: 999px; background: #effaf6; color: #08745f; font-size: 13px; font-weight: 700; }
@media (max-width: 760px) {
  .logic-derivation__section { grid-template-columns: 1fr; }
  .logic-derivation__label { border-right: 0; border-bottom: 1px solid #d7e5ee; }
}
</style>
