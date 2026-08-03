<template>
  <div class="shortcut-grid" aria-label="耐火材料问题分类">
    <article v-for="item in guides" :key="item.id" class="shortcut">
      <button class="shortcut__main" type="button" @click="$emit('select', item.question)">
        <span class="shortcut__icon"><AscIcon :name="item.icon" /></span>
        <span class="shortcut__copy">
          <strong>{{ item.title }}</strong>
          <small>{{ item.question }}</small>
        </span>
      </button>
      <button
        class="shortcut__refresh"
        type="button"
        :aria-label="`刷新${item.title}示例问题`"
        title="换一个问题"
        @click.stop="$emit('refresh', item.id)"
      >
        <AscIcon name="refresh" />
      </button>
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
  position: relative;
  min-width: 0;
  height: 76px;
  display: flex;
  align-items: center;
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

.shortcut__main {
  min-width: 0;
  height: 100%;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  padding: 10px 36px 10px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
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

.shortcut__copy {
  min-width: 0;
}

.shortcut strong,
.shortcut small {
  display: block;
}

.shortcut strong {
  color: var(--asc-heading);
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut small {
  margin-top: 3px;
  overflow: hidden;
  color: var(--asc-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut__refresh {
  position: absolute;
  top: 50%;
  right: 9px;
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #7c99ad;
  transform: translateY(-50%);
}

.shortcut__refresh:hover {
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
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
