<template>
  <div class="shortcut-grid" aria-label="耐火材料问题分类">
    <article v-for="item in guides" :key="item.id" class="shortcut">
      <header class="shortcut__header">
        <span class="shortcut__icon"><AscIcon :name="item.icon" /></span>
        <strong>{{ item.title }}</strong>
        <button
          class="shortcut__refresh"
          type="button"
          :aria-label="`刷新${item.title}经典问题`"
          title="换一个经典问题"
          @click.stop="$emit('refresh', item.id)"
        >
          <AscIcon name="refresh" />
        </button>
      </header>
      <ul class="shortcut__questions" :aria-label="`${item.title}经典问题`">
        <li v-for="question in item.questions" :key="question">
          <button type="button" :title="question" @click="$emit('select', question)">
            <span aria-hidden="true"></span>
            <small>{{ question }}</small>
          </button>
        </li>
      </ul>
    </article>
  </div>
</template>

<script setup>
import AscIcon from '../../components/ui/AscIcon.vue'

defineProps({
  guides: {
    type: Array,
    required: true
  }
})

defineEmits(['select', 'refresh'])
</script>

<style scoped>
.shortcut-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--qa-space-3);
}

.shortcut {
  min-width: 0;
  min-height: 126px;
  display: grid;
  align-content: start;
  gap: var(--qa-space-2);
  padding: var(--qa-space-3);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface);
  color: var(--qa-text);
  transition: border-color var(--qa-transition), transform var(--qa-transition);
}

.shortcut:hover {
  border-color: #8fc2df;
  transform: translateY(-2px);
}

.shortcut__header {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--qa-space-2);
}

.shortcut__icon {
  width: var(--qa-space-10);
  height: var(--qa-space-10);
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--qa-radius-control);
  background: var(--qa-accent-soft);
  color: var(--qa-accent);
  font-size: 17px;
}

.shortcut__header strong {
  min-width: 0;
  display: block;
  flex: 1;
  color: var(--qa-heading);
  overflow: hidden;
  font-size: var(--qa-control-font);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut__refresh {
  width: var(--qa-control-h-sm);
  height: var(--qa-control-h-sm);
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--qa-radius-control);
  background: transparent;
  color: #8aa3b6;
  font-size: var(--qa-control-font);
  opacity: 0.72;
  transition: color var(--qa-transition), background var(--qa-transition), opacity var(--qa-transition), transform var(--qa-transition);
}

.shortcut:hover .shortcut__refresh,
.shortcut__refresh:focus-visible {
  opacity: 1;
}

.shortcut__refresh:hover,
.shortcut__refresh:focus-visible {
  background: var(--qa-accent-soft);
  color: var(--qa-accent);
  outline: none;
  transform: rotate(18deg);
}

.shortcut__questions {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.shortcut__questions button {
  width: 100%;
  min-height: var(--qa-space-10);
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  align-items: start;
  gap: var(--qa-space-2);
  padding: var(--qa-space-1) var(--qa-space-2);
  border: 0;
  border-radius: var(--qa-radius-control);
  background: transparent;
  color: #4f687d;
  text-align: left;
  transition: background var(--qa-transition), color var(--qa-transition);
}

.shortcut__questions button > span {
  width: 5px;
  height: 5px;
  margin-top: var(--qa-space-2);
  border-radius: 50%;
  background: #82b9d9;
}

.shortcut__questions small {
  display: -webkit-box;
  overflow: hidden;
  font-size: var(--qa-font-sm);
  font-weight: 500;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.shortcut__questions button:hover,
.shortcut__questions button:focus-visible {
  background: var(--qa-accent-soft);
  color: var(--qa-accent);
  outline: none;
}

@media (max-width: 1050px) {
  .shortcut-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .shortcut-grid {
    grid-template-columns: 1fr;
  }

  .shortcut {
    min-height: 126px;
  }
}
</style>
