<template>
  <div class="shortcut-grid">
    <button
      v-for="item in shortcuts"
      :key="item.title"
      type="button"
      class="shortcut"
      @click="$emit('select', item.prompt)"
    >
      <span class="shortcut__icon"><AscIcon :name="item.icon" /></span>
      <span>
        <strong>{{ item.title }}</strong>
        <small>{{ item.description }}</small>
      </span>
      <AscIcon class="shortcut__arrow" name="chevron" />
    </button>
  </div>
</template>

<script setup>
import AscIcon from '../../components/ui/AscIcon.vue'

defineEmits(['select'])

const shortcuts = [
  {
    title: '宏观性能分析',
    description: '分析热震、抗侵蚀与氧化行为',
    prompt: '分析 ASC Al₂O₃-SiC-C 材料体系的热震稳定性及主要影响因素。',
    icon: 'model'
  },
  {
    title: '配方与工艺映射',
    description: '比较原料比例和烧成制度',
    prompt: '比较不同 SiC 和碳含量对 ASC 耐火材料性能的影响。',
    icon: 'database'
  },
  {
    title: '机理与物相分析',
    description: '解释相组成、界面和反应路径',
    prompt: '梳理 ASC 耐火材料氧化过程中的物相演变和保护层形成机理。',
    icon: 'graph'
  },
  {
    title: '文献证据检索',
    description: '检索可靠文献并生成引用',
    prompt: '检索近十年关于 Al₂O₃-SiC-C 耐火材料抗热震性能的核心文献。',
    icon: 'document'
  }
]
</script>

<style scoped>
.shortcut-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.shortcut {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
  color: var(--asc-text);
  text-align: left;
  transition: border-color var(--asc-transition), transform var(--asc-transition);
}

.shortcut:hover {
  border-color: #8fc2df;
  transform: translateY(-2px);
}

.shortcut__icon {
  width: 34px;
  height: 34px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
  font-size: 17px;
}

.shortcut strong,
.shortcut small {
  display: block;
}

.shortcut strong {
  color: var(--asc-heading);
  font-size: 12px;
}

.shortcut small {
  margin-top: 3px;
  overflow: hidden;
  color: var(--asc-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut__arrow {
  margin-left: auto;
  color: #91a8ba;
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
