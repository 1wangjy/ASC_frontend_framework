<template>
  <div class="shortcut-grid" aria-label="耐火材料问题分类">
    <article v-for="item in guides" :key="item.id" class="shortcut">
      <header class="shortcut__header">
        <span class="shortcut__icon"><AscIcon :name="item.icon" /></span>
        <strong>{{ item.title }}</strong>
      </header>
      <ul class="shortcut__questions" :aria-label="`${item.title}经典问题`">
        <li v-for="question in item.questions" :key="question">
          <button type="button" @click="$emit('select', question)">
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

defineEmits(['select'])
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
  min-height: 184px;
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 12px;
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
  color: var(--asc-heading);
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-height: 36px;
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
  padding: 6px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--asc-muted);
  text-align: left;
  transition: background var(--asc-transition), color var(--asc-transition);
}

.shortcut__questions button > span {
  width: 4px;
  height: 4px;
  margin-top: 6px;
  border-radius: 50%;
  background: #82b9d9;
}

.shortcut__questions small {
  display: -webkit-box;
  overflow: hidden;
  font-size: 10px;
  line-height: 1.45;
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
}
</style>
