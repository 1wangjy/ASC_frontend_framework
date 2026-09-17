<template>
  <div class="qa-mode-switcher" role="group" aria-label="问答模式">
    <button
      v-for="option in qaModeOptions"
      :key="option.id"
      type="button"
      :class="{ active: mode === option.id }"
      :aria-pressed="mode === option.id"
      :disabled="disabled"
      @click="$emit('update:mode', option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { qaModeOptions } from './qaDemoModel.js'

defineProps({
  mode: {
    type: String,
    default: 'single'
  },
  disabled: Boolean
})

defineEmits(['update:mode'])
</script>

<style scoped>
.qa-mode-switcher {
  width: fit-content;
  display: inline-flex;
  justify-self: center;
  padding: var(--qa-space-1);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: rgba(255, 255, 255, .72);
}

.qa-mode-switcher button {
  min-height: var(--qa-control-h);
  padding: 0 var(--qa-space-4);
  border: 0;
  border-radius: var(--qa-radius-control);
  background: transparent;
  color: var(--qa-muted);
  font: inherit;
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-bold);
  cursor: pointer;
}

.qa-mode-switcher button.active {
  background: var(--qa-accent);
  color: #fff;
  box-shadow: 0 4px 12px rgba(8, 105, 173, .18);
}

.qa-mode-switcher button:disabled {
  cursor: not-allowed;
  opacity: .58;
}

@media (max-width: 560px) {
  .qa-mode-switcher {
    width: 100%;
  }

  .qa-mode-switcher button {
    flex: 1;
  }
}
</style>
