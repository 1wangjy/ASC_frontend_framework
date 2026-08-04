<template>
  <div
    ref="root"
    class="library-overview"
    @keydown.esc.stop="closeAndRestoreFocus"
  >
    <button
      ref="trigger"
      class="library-overview__trigger"
      type="button"
      aria-controls="library-overview-panel"
      :aria-expanded="open"
      @click="open = !open"
    >
      <AscIcon name="database" />
      馆藏概览
      <AscIcon class="library-overview__chevron" name="chevron" />
    </button>

    <transition name="overview-popover">
      <section
        v-if="open"
        id="library-overview-panel"
        class="library-overview__panel"
        aria-label="馆藏概览"
      >
        <header>
          <strong>馆藏概览</strong>
          <span>随文献库实时更新</span>
        </header>
        <div class="library-overview__grid">
          <article v-for="metric in metrics" :key="metric.label">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small :class="{ success: metric.success }">{{ metric.note }}</small>
          </article>
        </div>
      </section>
    </transition>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'

defineProps({
  metrics: {
    type: Array,
    required: true
  }
})

const open = ref(false)
const root = ref(null)
const trigger = ref(null)

function closeAndRestoreFocus() {
  if (!open.value) return
  open.value = false
  nextTick(() => trigger.value?.focus())
}

function handleOutsidePointerDown(event) {
  if (open.value && !root.value?.contains(event.target)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointerDown))
</script>

<style scoped>
.library-overview {
  position: relative;
  z-index: 20;
  flex: 0 0 auto;
}

.library-overview__trigger {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid #c8dce9;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.72);
  color: #56758b;
  font-size: 10px;
  font-weight: 750;
  transition: border-color var(--asc-transition), background var(--asc-transition), color var(--asc-transition);
}

.library-overview__trigger:hover,
.library-overview__trigger:focus-visible,
.library-overview__trigger[aria-expanded='true'] {
  border-color: #84b7d6;
  background: #fff;
  color: var(--asc-primary);
  outline: none;
}

.library-overview__trigger :deep(.asc-icon) {
  width: 14px;
  height: 14px;
}

.library-overview__chevron {
  transform: rotate(90deg);
  transition: transform var(--asc-transition);
}

.library-overview__trigger[aria-expanded='true'] .library-overview__chevron {
  transform: rotate(-90deg);
}

.library-overview__panel {
  position: absolute;
  top: calc(100% + 9px);
  left: 0;
  width: 356px;
  max-width: calc(100vw - 32px);
  padding: 14px;
  border: 1px solid #c9dce9;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14px 34px rgba(32, 73, 101, 0.15);
}

.library-overview__panel::before {
  position: absolute;
  top: -5px;
  left: 24px;
  width: 9px;
  height: 9px;
  border-top: 1px solid #c9dce9;
  border-left: 1px solid #c9dce9;
  background: #fff;
  content: '';
  transform: rotate(45deg);
}

.library-overview__panel > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.library-overview__panel > header strong {
  color: var(--asc-heading);
  font-size: 12px;
}

.library-overview__panel > header span {
  color: var(--asc-muted);
  font-size: 9px;
}

.library-overview__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.library-overview__grid article {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 10px 11px;
  border: 1px solid #e0eaf0;
  border-radius: 8px;
  background: #f8fbfd;
}

.library-overview__grid article > span {
  color: #617d91;
  font-size: 9px;
}

.library-overview__grid article > strong {
  color: #123f67;
  font-size: 21px;
  line-height: 1.15;
}

.library-overview__grid article > small {
  overflow: hidden;
  color: var(--asc-muted);
  font-size: 8px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-overview__grid article > small.success {
  color: var(--asc-success);
}

.overview-popover-enter-active,
.overview-popover-leave-active {
  transition: opacity var(--asc-transition), transform var(--asc-transition);
  transform-origin: top left;
}

.overview-popover-enter-from,
.overview-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

@media (max-width: 420px) {
  .library-overview__panel {
    position: fixed;
    top: 108px;
    right: 12px;
    left: 12px;
    width: auto;
    max-width: none;
  }

  .library-overview__panel::before {
    display: none;
  }
}
</style>
