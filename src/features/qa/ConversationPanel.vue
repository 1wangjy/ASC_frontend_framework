<template>
  <section class="conversation" aria-live="polite">
    <div class="message-row message-row--user">
      <div class="avatar avatar--user">你</div>
      <div class="user-message">{{ state.question }}</div>
    </div>

    <div v-if="state.phase === 'loading'" class="message-row">
      <div class="avatar avatar--asc">ASC</div>
      <div class="answer-card answer-card--loading">
        <span />
        <span />
        <span />
        <p>正在检索文献、核对证据并组织回答…</p>
      </div>
    </div>

    <div v-else-if="state.answer" class="message-row">
      <div class="avatar avatar--asc">ASC</div>
      <article class="answer-card">
        <header>
          <div>
            <span>ASC QA</span>
            <strong>基于 {{ state.references.length }} 篇证据文献生成</strong>
          </div>
          <button type="button" @click="$emit('open-evidence')">查看证据评估</button>
        </header>

        <p class="answer-summary">{{ state.answer.summary }}</p>

        <ol class="answer-sections">
          <li v-for="section in state.answer.sections" :key="section.title">
            <div>
              <strong>{{ section.title }}</strong>
              <p>
                {{ section.body }}
                <button
                  v-for="citation in section.citations"
                  :key="citation"
                  type="button"
                  class="citation"
                  @click="$emit('citation', citation)"
                >
                  [{{ citation }}]
                </button>
              </p>
            </div>
          </li>
        </ol>

        <footer>
          <span>研究路径</span>
          <template v-for="(step, index) in state.answer.researchPath" :key="step">
            <strong>{{ step }}</strong>
            <AscIcon v-if="index < state.answer.researchPath.length - 1" name="chevron" />
          </template>
        </footer>
      </article>
    </div>
  </section>
</template>

<script setup>
import AscIcon from '../../components/ui/AscIcon.vue'

defineProps({
  state: {
    type: Object,
    required: true
  }
})

defineEmits(['citation', 'open-evidence'])
</script>

<style scoped>
.conversation {
  width: 100%;
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  gap: 22px;
}

.message-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.avatar {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 900;
}

.avatar--user {
  border: 1px solid #bedaf0;
  background: #e9f5fd;
  color: var(--asc-primary);
}

.avatar--asc {
  background: var(--asc-primary);
  color: #fff;
}

.user-message {
  justify-self: stretch;
  padding: 15px 18px;
  border: 1px solid #c9e0f0;
  border-radius: 8px;
  background: #eaf5fc;
  color: var(--asc-heading);
  font-size: 15px;
}

.answer-card {
  padding: 20px 22px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
}

.answer-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--asc-border);
}

.answer-card header div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.answer-card header span {
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.05em;
}

.answer-card header strong {
  color: var(--asc-muted);
  font-size: 11px;
}

.answer-card header button {
  border: 0;
  background: transparent;
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 750;
}

.answer-summary {
  margin: 17px 0;
  color: var(--asc-heading);
  font-size: 14px;
  line-height: 1.75;
}

.answer-sections {
  display: grid;
  gap: 13px;
  margin: 0;
  padding-left: 22px;
}

.answer-sections li {
  padding-left: 4px;
  color: var(--asc-heading);
}

.answer-sections strong {
  font-size: 14px;
}

.answer-sections p {
  display: inline;
  margin: 0 0 0 6px;
  color: var(--asc-text);
  font-size: 13px;
  line-height: 1.75;
}

.citation {
  display: inline;
  margin-left: 3px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 800;
}

.answer-card footer {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #f4f8fb;
  color: var(--asc-muted);
  font-size: 10px;
}

.answer-card footer span {
  margin-right: 4px;
  font-weight: 700;
}

.answer-card footer strong {
  color: var(--asc-text);
  font-weight: 650;
}

.answer-card--loading {
  min-height: 160px;
  overflow: hidden;
}

.answer-card--loading span {
  display: block;
  height: 12px;
  margin-bottom: 12px;
  border-radius: 4px;
  background: #e8eff5;
  animation: pulse 1.1s ease-in-out infinite alternate;
}

.answer-card--loading span:nth-child(2) {
  width: 84%;
}

.answer-card--loading span:nth-child(3) {
  width: 64%;
}

.answer-card--loading p {
  margin: 24px 0 0;
  color: var(--asc-muted);
  font-size: 12px;
}

@keyframes pulse {
  to {
    background: #d4e3ee;
  }
}

@media (max-width: 620px) {
  .message-row {
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 8px;
  }

  .avatar {
    width: 30px;
    height: 30px;
    font-size: 9px;
  }

  .answer-card {
    padding: 15px;
  }

  .answer-card header {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}
</style>
