<template>
  <main class="library-page">
    <header class="page-header">
      <div>
        <h1>文献管理</h1>
        <p>管理 ASC 耐火材料文献、专家筛选结果与 QA 引用索引</p>
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
        <section class="summary-grid" aria-label="文献统计">
          <article v-for="metric in metrics" :key="metric.label">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small :class="{ success: metric.success }">{{ metric.note }}</small>
          </article>
        </section>

        <LibraryToolbar
          :filters="filters"
          :years="years"
          @update:filters="Object.assign(filters, $event)"
          @reset="resetFilters"
        />

        <DocumentTable
          :documents="filteredDocuments"
          :selected-id="selectedDocumentId"
          @select="selectedDocumentId = $event"
          @reset="resetFilters"
        />
      </div>

      <DocumentDetails
        v-if="selectedDocument"
        :document="selectedDocument"
        @close="selectedDocumentId = ''"
        @preview="showToast('PDF 预览将在接入文件服务后打开。')"
        @add-to-qa="addToQa"
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
import { computed, reactive, ref } from 'vue'
import AscIcon from '../components/ui/AscIcon.vue'
import LibraryToolbar from '../features/library/LibraryToolbar.vue'
import DocumentTable from '../features/library/DocumentTable.vue'
import DocumentDetails from '../features/library/DocumentDetails.vue'
import DocumentImportModal from '../features/library/DocumentImportModal.vue'
import { documents as seedDocuments } from '../features/library/libraryData.js'
import {
  addDocumentToQa,
  createLibraryFilters,
  filterDocuments
} from '../features/library/libraryModel.js'

const documentRows = ref(seedDocuments.map(document => ({ ...document })))
const filters = reactive(createLibraryFilters())
const selectedDocumentId = ref(seedDocuments[0].id)
const importMode = ref('')
const toastMessage = ref('')
let toastTimer = null

const years = [...new Set(seedDocuments.map(document => document.year))].sort((a, b) => b - a)
const filteredDocuments = computed(() => filterDocuments(documentRows.value, filters))
const selectedDocument = computed(
  () => documentRows.value.find(document => document.id === selectedDocumentId.value) || null
)

const metrics = computed(() => [
  { label: '文献总数', value: 542, note: '500+ 原始资料', success: true },
  { label: '专家精选', value: 38, note: '高质量研究源', success: true },
  { label: '完成解析', value: 497, note: '正文与索引已提取', success: true },
  { label: '进入 QA 索引', value: 486, note: '可引用证据可用', success: true }
])

function resetFilters() {
  Object.assign(filters, createLibraryFilters())
}

function addToQa(documentId) {
  documentRows.value = addDocumentToQa(documentRows.value, documentId)
  showToast('文献已加入 QA 证据库。')
}

function showToast(message) {
  window.clearTimeout(toastTimer)
  toastMessage.value = message
  toastTimer = window.setTimeout(() => {
    toastMessage.value = ''
  }, 2600)
}
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-grid article {
  min-height: 105px;
  display: grid;
  align-content: center;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
}

.summary-grid span {
  color: var(--asc-muted);
  font-size: 10px;
}

.summary-grid strong {
  color: #123f67;
  font-size: 25px;
  line-height: 1.2;
}

.summary-grid small {
  color: var(--asc-muted);
  font-size: 9px;
}

.summary-grid small.success {
  color: var(--asc-success);
}

.library-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.library-workspace--detail {
  grid-template-columns: minmax(0, 1fr) 310px;
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

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
