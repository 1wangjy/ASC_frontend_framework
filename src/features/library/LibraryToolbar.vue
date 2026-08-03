<template>
  <div class="library-toolbar">
    <label class="search-field">
      <AscIcon name="search" />
      <input
        :value="filters.query"
        type="search"
        placeholder="搜索标题、DOI、作者或关键词"
        aria-label="搜索文献"
        @input="update('query', $event.target.value)"
      />
    </label>

    <select :value="filters.type" aria-label="文献类型" @change="update('type', $event.target.value)">
      <option value="">文献类型</option>
      <option value="journal">期刊论文</option>
      <option value="conference">会议论文</option>
      <option value="book">手册/图书</option>
      <option value="patent">专利</option>
    </select>

    <select :value="filters.year" aria-label="年份" @change="update('year', $event.target.value)">
      <option value="">年份</option>
      <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
    </select>

    <select
      :value="filters.expertStatus"
      aria-label="专家状态"
      @change="update('expertStatus', $event.target.value)"
    >
      <option value="">专家状态</option>
      <option value="selected">专家精选</option>
      <option value="unselected">未精选</option>
    </select>

    <select
      :value="filters.parsingStatus"
      aria-label="解析状态"
      @change="update('parsingStatus', $event.target.value)"
    >
      <option value="">解析状态</option>
      <option value="indexed">已索引</option>
      <option value="parsing">解析中</option>
      <option value="reindex">重建索引</option>
    </select>

    <select
      :value="filters.language"
      aria-label="语言"
      @change="update('language', $event.target.value)"
    >
      <option value="">语言</option>
      <option value="English">English</option>
      <option value="中文">中文</option>
    </select>

    <button class="reset-button" type="button" @click="$emit('reset')">重置</button>
  </div>
</template>

<script setup>
import AscIcon from '../../components/ui/AscIcon.vue'

defineProps({
  filters: {
    type: Object,
    required: true
  },
  years: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:filters', 'reset'])

function update(key, value) {
  emit('update:filters', { [key]: value })
}
</script>

<style scoped>
.library-toolbar {
  display: grid;
  grid-template-columns: minmax(230px, 1fr) repeat(5, auto) auto;
  gap: 8px;
  padding: 11px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
}

.search-field {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-control-radius);
  color: var(--asc-muted);
}

.search-field:focus-within {
  border-color: #78b4d8;
}

.search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 12px;
}

.library-toolbar > select,
.reset-button {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-control-radius);
  background: #fff;
  color: var(--asc-text);
  font-size: 11px;
  font-weight: 650;
}

.reset-button:hover {
  border-color: #8cbad5;
  color: var(--asc-primary);
}

@media (max-width: 1260px) {
  .library-toolbar {
    grid-template-columns: minmax(260px, 1fr) repeat(3, auto);
  }
}

@media (max-width: 760px) {
  .library-toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .search-field {
    grid-column: 1 / -1;
  }
}
</style>
