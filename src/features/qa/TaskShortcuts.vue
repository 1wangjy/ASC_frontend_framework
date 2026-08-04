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
          title="换一组经典问题"
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
  gap: 12px;
}

.shortcut {
  min-width: 0;
  min-height: 126px;
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 13px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
  color: var(--asc-text);
  transition: border-color var(--asc-transition), transform var(--asc-transition);
}

.shortcut:hover {
  border-color: #8fc2df;
  transform: translateY(-2px);
}

.shortcut__header {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.shortcut__icon {
  width: 40px;
  height: 40px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
  font-size: 17px;
}

.shortcut__header strong {
  min-width: 0;
  display: block;
  flex: 1;
  color: var(--asc-heading);
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut__refresh {
  width: 28px;
  height: 28px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #8aa3b6;
  font-size: 13px;
  opacity: 0.72;
  transition: color var(--asc-transition), background var(--asc-transition), opacity var(--asc-transition), transform var(--asc-transition);
}

.shortcut:hover .shortcut__refresh,
.shortcut__refresh:focus-visible {
  opacity: 1;
}

.shortcut__refresh:hover,
.shortcut__refresh:focus-visible {
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
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
  min-height: 43px;
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
  padding: 6px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #4f687d;
  text-align: left;
  transition: background var(--asc-transition), color var(--asc-transition);
}

.shortcut__questions button > span {
  width: 5px;
  height: 5px;
  margin-top: 7px;
  border-radius: 50%;
  background: #82b9d9;
}

.shortcut__questions small {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.shortcut__questions button:hover,
.shortcut__questions button:focus-visible {
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
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
