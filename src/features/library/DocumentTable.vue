<template>
  <div class="table-shell">
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th class="checkbox-cell"><span class="fake-checkbox" /></th>
            <th>文献</th>
            <th>DOI</th>
            <th>作者</th>
            <th>年份</th>
            <th>类型</th>
            <th>领域标签</th>
            <th>专家评分</th>
            <th>处理状态</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody v-if="documents.length">
          <tr
            v-for="document in documents"
            :key="document.id"
            :class="{ selected: document.id === selectedId }"
            tabindex="0"
            @click="$emit('select', document.id)"
            @keydown.enter="$emit('select', document.id)"
          >
            <td class="checkbox-cell">
              <span class="fake-checkbox" :class="{ checked: document.id === selectedId }">
                <AscIcon v-if="document.id === selectedId" name="check" />
              </span>
            </td>
            <td class="document-cell">
              <strong>{{ document.title }}</strong>
              <small>{{ document.journal }}</small>
            </td>
            <td class="doi-cell">{{ document.doi }}</td>
            <td>
              <span>{{ document.authors[0] }}</span>
              <small v-if="document.authors.length > 1">+{{ document.authors.length - 1 }} 位</small>
            </td>
            <td>{{ document.year }}</td>
            <td>{{ document.typeLabel }}</td>
            <td>
              <div class="tag-list">
                <span v-for="tag in document.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
              </div>
            </td>
            <td>
              <strong v-if="document.expertScore" class="score" :class="{ 'score--warning': document.expertScore < 8 }">
                {{ document.expertScore.toFixed(1) }} / 10
              </strong>
              <span v-else>—</span>
            </td>
            <td>
              <span class="status" :class="`status--${document.parsingStatus}`">
                <i />
                {{ document.statusLabel }}
              </span>
            </td>
            <td>{{ document.updatedAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!documents.length" class="empty-result">
      <span>0</span>
      <strong>没有符合条件的文献</strong>
      <p>调整关键词或清除筛选条件后重试。</p>
      <button type="button" @click="$emit('reset')">清除筛选</button>
    </div>

    <footer class="table-footer">
      <span>共 {{ total }} 条</span>
      <nav class="pagination" aria-label="文献分页">
        <button type="button" :disabled="page <= 1" aria-label="第一页" @click="$emit('change-page', 1)">
          <span class="double-chevron">
            <AscIcon class="pagination-icon pagination-icon--back" name="chevron" />
            <AscIcon class="pagination-icon pagination-icon--back" name="chevron" />
          </span>
        </button>
        <button
          type="button"
          :disabled="page <= 1"
          aria-label="上一页"
          @click="$emit('change-page', page - 1)"
        >
          <AscIcon class="pagination-icon pagination-icon--back" name="chevron" />
        </button>
        <button
          v-for="pageNumber in pageNumbers"
          :key="pageNumber"
          type="button"
          :class="{ active: pageNumber === page }"
          :aria-current="pageNumber === page ? 'page' : undefined"
          @click="$emit('change-page', pageNumber)"
        >
          {{ pageNumber }}
        </button>
        <button
          type="button"
          :disabled="page >= pageCount"
          aria-label="下一页"
          @click="$emit('change-page', page + 1)"
        >
          <AscIcon class="pagination-icon" name="chevron" />
        </button>
      </nav>
      <label class="page-size">
        每页
        <select :value="pageSize" aria-label="每页文献数量" @change="$emit('change-page-size', Number($event.target.value))">
          <option v-for="size in pageSizes" :key="size" :value="size">{{ size }}</option>
        </select>
        条
      </label>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'

const props = defineProps({
  documents: {
    type: Array,
    required: true
  },
  selectedId: {
    type: String,
    default: ''
  },
  page: {
    type: Number,
    default: 1
  },
  pageCount: {
    type: Number,
    default: 1
  },
  pageSize: {
    type: Number,
    default: 20
  },
  pageSizes: {
    type: Array,
    default: () => [20, 50, 100]
  },
  total: {
    type: Number,
    default: 0
  }
})

defineEmits(['select', 'reset', 'change-page', 'change-page-size'])

const pageNumbers = computed(() => {
  const start = Math.max(1, props.page - 2)
  const end = Math.min(props.pageCount, start + 4)
  const adjustedStart = Math.max(1, end - 4)
  return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index)
})
</script>

<style scoped>
.table-shell {
  min-height: 560px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
}

.table-scroll {
  overflow: auto;
}

table {
  width: 100%;
  min-width: 1130px;
  border-collapse: collapse;
  table-layout: fixed;
}

th,
td {
  padding: 13px 10px;
  border-bottom: 1px solid #e4ebf1;
  color: var(--asc-text);
  font-size: 10px;
  text-align: left;
  vertical-align: middle;
}

th {
  position: sticky;
  z-index: 2;
  top: 0;
  height: 45px;
  background: #fbfcfe;
  color: var(--asc-muted);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

th:nth-child(2) { width: 240px; }
th:nth-child(3) { width: 150px; }
th:nth-child(4) { width: 105px; }
th:nth-child(5) { width: 58px; }
th:nth-child(6) { width: 76px; }
th:nth-child(7) { width: 180px; }
th:nth-child(8) { width: 88px; }
th:nth-child(9) { width: 90px; }
th:nth-child(10) { width: 92px; }

tbody tr {
  cursor: pointer;
  transition: background var(--asc-transition);
}

tbody tr:hover {
  background: #f8fbfd;
}

tbody tr.selected {
  background: #edf7fd;
  box-shadow: inset 3px 0 0 var(--asc-primary);
}

.checkbox-cell {
  width: 38px;
  text-align: center;
}

.fake-checkbox {
  width: 15px;
  height: 15px;
  display: inline-grid;
  place-items: center;
  border: 1px solid #b7c7d4;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
}

.fake-checkbox.checked {
  border-color: var(--asc-primary);
  background: var(--asc-primary);
}

.document-cell strong,
.document-cell small,
td small {
  display: block;
}

.document-cell strong {
  color: #0a4778;
  font-size: 10px;
  line-height: 1.45;
}

.document-cell small,
td small {
  margin-top: 4px;
  color: var(--asc-muted);
  font-size: 9px;
}

.doi-cell {
  overflow-wrap: anywhere;
  color: #45667f;
}

.tag-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag-list span {
  padding: 2px 5px;
  border: 1px solid #c8deeb;
  border-radius: 4px;
  background: #eef7fc;
  color: #2c6b91;
  font-size: 8px;
}

.score {
  color: #118556;
  font-size: 10px;
}

.score--warning {
  color: var(--asc-warning);
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--asc-success);
  white-space: nowrap;
}

.status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status--parsing,
.status--reindex {
  color: var(--asc-warning);
}

.empty-result {
  min-height: 400px;
  display: grid;
  place-content: center;
  justify-items: center;
  text-align: center;
}

.empty-result > span {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
  font-size: 22px;
  font-weight: 900;
}

.empty-result strong {
  margin-top: 13px;
  color: var(--asc-heading);
}

.empty-result p {
  margin: 5px 0 13px;
  color: var(--asc-muted);
  font-size: 11px;
}

.empty-result button {
  min-height: 34px;
  padding: 0 13px;
  border: 1px solid #9cc5dd;
  border-radius: 6px;
  background: #fff;
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 700;
}

.table-footer {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: auto;
  padding: 0 14px;
  border-top: 1px solid var(--asc-border);
  color: var(--asc-muted);
  font-size: 10px;
}

.pagination {
  display: flex;
  gap: 5px;
}

.pagination button {
  width: 27px;
  height: 27px;
  border: 1px solid var(--asc-border);
  border-radius: 5px;
  background: #fff;
  color: var(--asc-text);
  font-size: 10px;
}

.pagination button.active {
  border-color: var(--asc-primary);
  background: var(--asc-primary);
  color: #fff;
}

.pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.pagination-icon {
  display: block;
}

.pagination-icon--back {
  transform: rotate(180deg);
}

.double-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: -3px;
}

.double-chevron .pagination-icon + .pagination-icon {
  margin-left: -6px;
}

.page-size {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.page-size select {
  height: 28px;
  border: 1px solid var(--asc-border);
  border-radius: 5px;
  background: #fff;
  color: var(--asc-text);
  font-size: 10px;
}

@media (max-width: 560px) {
  .table-footer {
    align-items: flex-start;
    flex-wrap: wrap;
    padding-block: 10px;
  }

  .pagination {
    order: 3;
    width: 100%;
    justify-content: center;
  }
}
</style>
