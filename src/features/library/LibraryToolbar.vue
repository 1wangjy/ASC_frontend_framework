<template>
  <section class="library-toolbar" aria-label="文献快速检索">
    <div class="toolbar-main">
      <label class="search-field">
        <AscIcon name="search" />
        <input
          :value="filters.query"
          type="search"
          placeholder="搜索标题、DOI、作者、摘要或关键词…"
          aria-label="搜索文献"
          @input="update('query', $event.target.value)"
        />
      </label>

      <select :value="filters.type" aria-label="文献类型" @change="update('type', $event.target.value)">
        <option value="">全部类型</option>
        <option value="journal">期刊论文</option>
        <option value="conference">会议论文</option>
        <option value="book">手册/图书</option>
        <option value="patent">专利</option>
      </select>

      <button v-if="hasFilters" class="clear-button" type="button" @click="$emit('reset')">
        清除条件
      </button>
    </div>

    <div class="year-row">
      <span>年份</span>
      <div class="year-options" role="group" aria-label="按年份多选">
        <button
          type="button"
          :class="{ active: filters.yearPartitions.length === 0 }"
          :aria-pressed="filters.yearPartitions.length === 0"
          @click="update('yearPartitions', [])"
        >
          全部
        </button>
        <button
          v-for="year in yearPartitions.years"
          :key="year"
          type="button"
          :class="{ active: filters.yearPartitions.includes(String(year)) }"
          :aria-pressed="filters.yearPartitions.includes(String(year))"
          @click="toggleYear(String(year))"
        >
          {{ year }}
        </button>
        <button
          v-if="yearPartitions.olderBefore"
          type="button"
          :class="{ active: filters.yearPartitions.includes(`older:${yearPartitions.olderBefore}`) }"
          :aria-pressed="filters.yearPartitions.includes(`older:${yearPartitions.olderBefore}`)"
          @click="toggleYear(`older:${yearPartitions.olderBefore}`)"
        >
          更早
        </button>
      </div>
    </div>

    <div class="filter-summary" aria-live="polite">
      <div class="active-filters">
        <button
          v-for="partition in filters.yearPartitions"
          :key="partition"
          type="button"
          @click="toggleYear(partition)"
        >
          {{ formatYearLabel(partition) }} <AscIcon name="close" />
        </button>
        <button v-if="filters.query" type="button" @click="update('query', '')">
          {{ filters.query }} <AscIcon name="close" />
        </button>
        <button v-if="filters.type" type="button" @click="update('type', '')">
          {{ typeLabel }} <AscIcon name="close" />
        </button>
      </div>
      <strong>共 {{ resultCount }} 条结果</strong>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import { toggleYearPartition } from './libraryModel.js'

const props = defineProps({
  filters: {
    type: Object,
    required: true
  },
  yearPartitions: {
    type: Object,
    required: true
  },
  resultCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['update:filters', 'reset'])

const hasFilters = computed(() => Boolean(
  props.filters.query || props.filters.type || props.filters.yearPartitions.length
))

const typeLabels = {
  journal: '期刊论文',
  conference: '会议论文',
  book: '手册/图书',
  patent: '专利'
}

const typeLabel = computed(() => typeLabels[props.filters.type] ?? props.filters.type)

function update(key, value) {
  emit('update:filters', { [key]: value })
}

function toggleYear(partition) {
  update(
    'yearPartitions',
    toggleYearPartition(props.filters.yearPartitions, partition)
  )
}

function formatYearLabel(partition) {
  return String(partition).startsWith('older:') ? '更早年份' : `${partition} 年`
}
</script>

<style scoped>
.library-toolbar {
  display: grid;
  gap: 11px;
  padding: 12px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
}

.toolbar-main {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 132px auto;
  gap: 8px;
}

.search-field {
  min-height: 39px;
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
  box-shadow: 0 0 0 3px rgba(8, 105, 173, 0.07);
}

.search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--asc-heading);
  font-size: 12px;
}

.toolbar-main select,
.clear-button {
  min-height: 39px;
  padding: 0 12px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-control-radius);
  background: #fff;
  color: var(--asc-text);
  font-size: 11px;
  font-weight: 700;
}

.clear-button {
  color: var(--asc-primary);
}

.year-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.year-row > span {
  color: var(--asc-muted);
  font-size: 10px;
  font-weight: 800;
}

.year-options {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.year-options button {
  min-width: 54px;
  height: 29px;
  padding: 0 10px;
  border: 1px solid var(--asc-border);
  border-radius: 6px;
  background: #fff;
  color: var(--asc-text);
  font-size: 10px;
  font-weight: 700;
}

.year-options button.active {
  border-color: #80b9da;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
}

.filter-summary {
  min-height: 25px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 9px;
  border-top: 1px solid #e8eef3;
}

.active-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.active-filters button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border: 0;
  border-radius: 5px;
  background: #eef6fb;
  color: #2a668b;
  font-size: 9px;
}

.filter-summary strong {
  margin-left: auto;
  color: var(--asc-muted);
  font-size: 10px;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .toolbar-main {
    grid-template-columns: 1fr 1fr;
  }

  .search-field {
    grid-column: 1 / -1;
  }

  .year-row {
    align-items: flex-start;
  }

  .filter-summary {
    align-items: flex-start;
  }
}
</style>
