<template>
  <main class="library-page">
    <header class="page-header">
      <div>
        <div class="page-title-row">
          <h1>文献管理</h1>
          <LibraryOverviewPopover :metrics="metrics" />
        </div>
        <p>管理 ASC 耐火材料文献、精选资料与馆藏分类</p>
      </div>
      <div class="header-actions">
        <button type="button" @click="importMode = 'doi'">导入 DOI</button>
        <button type="button" @click="importMode = 'batch'">批量导入</button>
        <button type="button" class="primary" @click="importMode = 'upload'">
          <AscIcon name="plus" />
          上传文献
        </button>
      </div>
    </header>

    <section class="library-workspace" :class="{ 'library-workspace--detail': selectedDocument }">
      <div class="library-primary">
        <LibraryToolbar
          :filters="filters"
          :year-partitions="yearPartitions"
          :result-count="filteredDocuments.length"
          @update:filters="Object.assign(filters, $event)"
          @reset="resetFilters"
        />

        <DocumentTable
          :documents="pagination.items"
          :selected-id="selectedDocumentId"
          :page="pagination.page"
          :page-count="pagination.pageCount"
          :page-size="pagination.pageSize"
          :page-sizes="pagination.pageSizes"
          :total="pagination.total"
          @select="selectedDocumentId = $event"
          @reset="resetFilters"
          @change-page="page = $event"
          @change-page-size="changePageSize"
        />
      </div>

      <DocumentDetails
        v-if="selectedDocument"
        :document="selectedDocument"
        @close="selectedDocumentId = ''"
      />
    </section>

    <DocumentImportModal
      :mode="importMode"
      @close="importMode = ''"
      @complete="showToast('模拟导入成功，已保留待接入的交互流程。')"
    />

    <transition name="toast">
      <div v-if="toastMessage" class="toast" role="status">
        <AscIcon name="check" />
        {{ toastMessage }}
      </div>
    </transition>
  </main>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AscIcon from '../components/ui/AscIcon.vue'
import LibraryToolbar from '../features/library/LibraryToolbar.vue'
import DocumentTable from '../features/library/DocumentTable.vue'
import DocumentDetails from '../features/library/DocumentDetails.vue'
import DocumentImportModal from '../features/library/DocumentImportModal.vue'
import LibraryOverviewPopover from '../features/library/LibraryOverviewPopover.vue'
import { documents as seedDocuments } from '../features/library/libraryData.js'
import {
  calculateLibraryMetrics,
  createLibraryFilters,
  filterDocuments,
  getYearPartitions,
  initialSelectedDocumentId,
  paginateDocuments,
  reconcileSelectedDocumentId
} from '../features/library/libraryModel.js'

const documentRows = ref(seedDocuments.map(document => ({ ...document })))
const filters = reactive(createLibraryFilters())
const compactView = typeof window !== 'undefined'
  && window.matchMedia('(max-width: 1180px)').matches
const selectedDocumentId = ref(initialSelectedDocumentId(seedDocuments, compactView))
const importMode = ref('')
const toastMessage = ref('')
const page = ref(1)
const pageSize = ref(20)
let toastTimer = null

const yearPartitions = computed(() => getYearPartitions(documentRows.value, 4))
const filteredDocuments = computed(() => filterDocuments(documentRows.value, filters))
const pagination = computed(() => paginateDocuments(
  filteredDocuments.value,
  page.value,
  pageSize.value
))
const selectedDocument = computed(
  () => documentRows.value.find(document => document.id === selectedDocumentId.value) || null
)

const metrics = computed(() => {
  const counts = calculateLibraryMetrics(documentRows.value)
  return [
    { label: '文献总数', value: counts.total, note: '随文献库实时更新', success: true },
    { label: '专家精选', value: counts.expertSelected, note: '高质量研究源', success: true },
    { label: '学术论文', value: counts.academicPapers, note: '期刊论文 + 会议论文', success: true },
    { label: '专业资料', value: counts.professionalResources, note: '专著、标准、专利等', success: false }
  ]
})

function resetFilters() {
  Object.assign(filters, createLibraryFilters())
}

function changePageSize(size) {
  pageSize.value = size
  page.value = 1
}

function showToast(message) {
  window.clearTimeout(toastTimer)
  toastMessage.value = message
  toastTimer = window.setTimeout(() => {
    toastMessage.value = ''
  }, 2600)
}

watch(
  () => [filters.query, filters.type, filters.yearPartitions.join('|')],
  () => {
    page.value = 1
  }
)

watch(
  () => pagination.value.page,
  correctedPage => {
    if (page.value !== correctedPage) page.value = correctedPage
  }
)

watch(
  filteredDocuments,
  documents => {
    selectedDocumentId.value = reconcileSelectedDocumentId(
      documents,
      selectedDocumentId.value,
      compactView
    )
  }
)
</script>

<style scoped>
.library-page {
  min-height: 100vh;
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 24px 24px 32px;
  background: var(--asc-bg);
}

.page-header {
  min-height: 66px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.page-header h1 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 24px;
  letter-spacing: -0.02em;
}

.page-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-header p {
  margin: 6px 0 0;
  color: var(--asc-muted);
  font-size: 11px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 1px solid #a9c5d8;
  border-radius: 6px;
  background: #fff;
  color: #174b70;
  font-size: 11px;
  font-weight: 800;
}

.header-actions button.primary {
  border-color: var(--asc-primary);
  background: var(--asc-primary);
  color: #fff;
}

.library-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.library-workspace--detail {
  grid-template-columns: minmax(0, 1fr) 330px;
}

.library-primary {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 14px;
}

.toast {
  position: fixed;
  z-index: 70;
  right: 26px;
  bottom: 26px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 15px;
  border: 1px solid #9fd4bd;
  border-radius: 7px;
  background: #effaf5;
  box-shadow: var(--asc-shadow);
  color: #0c7f54;
  font-size: 11px;
  font-weight: 750;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--asc-transition), transform var(--asc-transition);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 1180px) {
  .library-workspace--detail {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .library-page {
    padding: 18px 12px 28px;
  }

  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
  }

  .header-actions button {
    justify-content: center;
    padding-inline: 8px;
  }
}
</style>
