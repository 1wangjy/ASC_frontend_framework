<template>
  <div
    v-if="open"
    class="qa-project-selector"
    role="presentation"
    @click.self="emit('close')"
  >
    <section
      ref="dialog"
      class="qa-project-selector__dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qa-project-selector-title"
      tabindex="-1"
      @keydown.stop="handleKeydown"
    >
      <header>
        <div>
          <h2 id="qa-project-selector-title">选择问答项目</h2>
          <p>仅显示已完成并保存报告的图谱项目</p>
        </div>
        <button type="button" aria-label="关闭项目选择" @click="emit('close')">×</button>
      </header>

      <div v-if="loading" class="qa-project-selector__state">
        正在读取可问答项目…
      </div>

      <div v-else-if="error" class="qa-project-selector__state qa-project-selector__state--error">
        <span>{{ error }}</span>
        <button type="button" @click="emit('refresh')">刷新</button>
      </div>

      <div v-else-if="!projects.length" class="qa-project-selector__state">
        暂无已完成报告的图谱项目
      </div>

      <ul v-else class="qa-project-selector__list">
        <li v-for="project in projects" :key="`${project.projectId}:${project.reportId}`">
          <button
            type="button"
            :class="{ selected: project.projectId === selectedProjectId }"
            :aria-current="project.projectId === selectedProjectId ? 'true' : undefined"
            @click="emit('select', project.projectId)"
          >
            <span>
              <strong>{{ project.projectName || project.projectId }}</strong>
              <small>已完成报告</small>
            </span>
            <b>{{ project.projectId === selectedProjectId ? '当前' : '选择' }}</b>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  projects: { type: Array, default: () => [] },
  selectedProjectId: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
})

const emit = defineEmits(['select', 'close', 'refresh'])
const dialog = ref(null)
let previousFocus = null

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function focusableElements() {
  if (typeof dialog.value?.querySelectorAll !== 'function') return []
  return [...dialog.value.querySelectorAll(FOCUSABLE_SELECTOR)]
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return

  const elements = focusableElements()
  if (!elements.length) {
    event.preventDefault()
    dialog.value?.focus?.()
    return
  }

  const activeElement = dialog.value?.ownerDocument?.activeElement
  const first = elements[0]
  const last = elements.at(-1)
  if (event.shiftKey && (
    activeElement === dialog.value
    || activeElement === first
    || !dialog.value?.contains?.(activeElement)
  )) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (
    activeElement === dialog.value
    || activeElement === last
    || !dialog.value?.contains?.(activeElement)
  )) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      previousFocus = globalThis.document?.activeElement || null
      nextTick(() => {
        if (!previousFocus) previousFocus = dialog.value?.ownerDocument?.activeElement || null
        if (typeof dialog.value?.focus === 'function') dialog.value.focus()
      })
    } else if (previousFocus) nextTick(() => {
      previousFocus?.focus?.()
      previousFocus = null
    })
  }
)
</script>

<style scoped>
.qa-project-selector {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: start end;
  padding: 68px 28px 28px;
  background: rgba(14, 40, 60, 0.2);
}

.qa-project-selector__dialog {
  width: min(390px, calc(100vw - 32px));
  max-height: min(620px, calc(100vh - 96px));
  overflow: auto;
  border: 1px solid var(--asc-border);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(21, 52, 74, 0.2);
}

.qa-project-selector__dialog > header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 18px 14px;
  border-bottom: 1px solid var(--asc-border);
  background: #fff;
}

.qa-project-selector h2,
.qa-project-selector p {
  margin: 0;
}

.qa-project-selector h2 {
  color: var(--asc-heading);
  font-size: 15px;
}

.qa-project-selector p,
.qa-project-selector small {
  color: var(--asc-muted);
  font-size: 11px;
}

.qa-project-selector header button {
  border: 0;
  background: transparent;
  color: var(--asc-muted);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.qa-project-selector__state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 18px;
  color: var(--asc-muted);
  font-size: 12px;
}

.qa-project-selector__state--error {
  color: #9e4037;
}

.qa-project-selector__state button {
  padding: 6px 10px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: #fff;
  color: inherit;
}

.qa-project-selector__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px;
  list-style: none;
}

.qa-project-selector__list button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--asc-border);
  border-radius: 8px;
  background: #fff;
  color: var(--asc-heading);
  text-align: left;
  cursor: pointer;
}

.qa-project-selector__list button:hover,
.qa-project-selector__list button.selected {
  border-color: #8cbfdd;
  background: #f3f9fc;
}

.qa-project-selector__list span {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.qa-project-selector__list strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qa-project-selector__list b {
  color: var(--asc-primary);
  font-size: 11px;
}

@media (max-width: 560px) {
  .qa-project-selector {
    place-items: start center;
    padding: 68px 16px 16px;
  }
}
</style>
