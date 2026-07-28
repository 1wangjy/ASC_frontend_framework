<template>
  <section class="asc-uploader-shell">
    <div class="shell-copy">
      <p class="eyebrow">ASC 检测报告上传</p>
      <h2>分析板块</h2>
      <p>点击按钮打开 Base GraphRAG 导入窗口，选择 survey / 综述类文件并输入查询 Prompt。Professional Research 文件将在 Step 03 导入。</p>
      <div class="analysis-focus">
        <span class="focus-label">当前导入类型</span>
        <strong>Base GraphRAG · {{ selectedTypeLabel }} · {{ selectedFiles.length ? `${selectedFiles.length} 个文件已选中` : '尚未选择文件' }}</strong>
      </div>
    </div>

    <button
      class="open-window-btn"
      :class="{ active: isWindowOpen }"
      type="button"
      :aria-expanded="isWindowOpen"
      @click="openWindow"
    >
      <span class="window-icon">↗</span>
      {{ isWindowOpen ? '分析子窗口已打开' : '打开分析子窗口' }}
    </button>

    <Teleport to="body">
      <Transition name="subwindow">
        <div v-if="isWindowOpen" class="subwindow-layer">
          <div class="subwindow-backdrop" @click="closeWindow"></div>
          <section class="analysis-subwindow" role="dialog" aria-modal="false" aria-labelledby="analysis-window-title">
            <header class="subwindow-header">
              <div>
                <p class="eyebrow">统一导入分析模块</p>
                <h2 id="analysis-window-title">导入 ASC Base 分析数据</h2>
              </div>
              <button class="close-btn" type="button" aria-label="关闭分析子窗口" @click="closeWindow">×</button>
            </header>

            <div class="type-selector" role="group" aria-label="数据类型选择">
              <button
                v-for="type in dataTypes"
                :key="type.value"
                type="button"
                :class="{ active: selectedType === type.value }"
                @click="selectType(type.value)"
              >
                {{ type.label }}
              </button>
              <span class="slider-thumb" :style="{ transform: `translateX(${selectedTypeIndex * 100}%)` }"></span>
            </div>

            <div
              class="drop-zone"
              :class="{ active: dragOver }"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop.prevent="handleDrop"
              @click="fileInput?.click()"
            >
              <input ref="fileInput" type="file" :accept="acceptTypes" multiple @change="handleSelect" />
              <strong>拖拽或点击上传 Base 文件</strong>
              <span>{{ uploadHint }}</span>
            </div>

            <div class="prompt-grid">
              <label class="prompt-field">
                <span>查询 Prompt（知识使用器）</span>
                <textarea
                  v-model="queryPrompt"
                  rows="10"
                  placeholder="输入你希望系统基于知识图谱和文献证据回答的问题"
                ></textarea>
              </label>
            </div>

            <div v-if="selectedFiles.length" class="analysis-file-list">
              <article v-for="file in selectedFiles" :key="file.name" class="analysis-file-card">
                <div class="file-icon">{{ selectedTypeLabel }}</div>
                <div class="file-detail">
                  <strong :title="file.name">{{ file.name }}</strong>
                  <span>{{ formatSize(file.size) }} · 待分析 · {{ selectedTypeLabel }} 数据</span>
                </div>
              </article>
            </div>

            <button class="submit-btn" :disabled="!canSubmit || uploading" type="button" @click="submitUpload">
              <span>{{ uploading ? `处理中 ${progress}%` : submitLabel }}</span>
              <span>→</span>
            </button>

            <div v-if="message" class="feedback" :class="{ error: hasError }">{{ message }}</div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { uploadPdfFiles } from '../api/pdfLibrary'
import { setPendingUpload } from '../store/pendingUpload'
import { DEFAULT_ASC_QUERY_PROMPT, buildAscQueryPrompt } from '../utils/ascPromptBuilder'

const emit = defineEmits(['uploaded'])
const router = useRouter()

const fileInput = ref(null)
const filesByStage = ref({
  base: []
})
const selectedTypesByStage = ref({
  base: 'markdown'
})
const selectedStage = ref('base')
const queryPrompt = ref(DEFAULT_ASC_QUERY_PROMPT)
const uploading = ref(false)
const progress = ref(0)
const dragOver = ref(false)
const message = ref('')
const hasError = ref(false)
const isWindowOpen = ref(false)
const buildStages = [
  { value: 'base', label: '基座构建', meta: 'Survey / 综述 · 密集 ASC Base Node', sourceCorpusType: 'survey' }
]
const dataTypes = [
  { value: 'pdf', label: 'pdf', accept: 'application/pdf,.pdf', hint: '支持 PDF，建议包含检测报告、配方、强度、抗渣试验与服役部位。' },
  { value: 'csv', label: 'csv', accept: '.csv,text/csv', hint: '支持 CSV，建议至少包含批次、成分或性能字段。' },
  { value: 'excel', label: 'excel', accept: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hint: '支持 XLS / XLSX，适合导入批次化历史检测数据。' },
  { value: 'txt', label: 'txt', accept: '.txt,text/plain', hint: '支持 TXT，可导入试验记录、现场反馈或失效描述。' },
  { value: 'markdown', label: 'markdown', accept: '.md,.markdown,text/markdown', hint: '支持 Markdown，可导入结构化分析笔记或报告摘要。' }
]
const selectedStageIndex = computed(() => buildStages.findIndex((stage) => stage.value === selectedStage.value))
const selectedStageConfig = computed(() => buildStages[selectedStageIndex.value] || buildStages[0])
const selectedStageLabel = computed(() => selectedStageConfig.value.label)
const selectedFiles = computed(() => filesByStage.value[selectedStage.value] || [])
const selectedType = computed(() => selectedTypesByStage.value[selectedStage.value] || 'markdown')
const selectedTypeIndex = computed(() => dataTypes.findIndex((type) => type.value === selectedType.value))
const selectedTypeConfig = computed(() => dataTypes[selectedTypeIndex.value] || dataTypes[0])
const selectedTypeLabel = computed(() => selectedTypeConfig.value.label)
const acceptTypes = computed(() => selectedTypeConfig.value.accept)
const uploadHint = computed(() => {
  return `当前批次只用于构建 base 知识图谱；${selectedTypeConfig.value.hint}`
})
const submitLabel = computed(() => '导入并构建基座图谱')
const canSubmit = computed(() => (
  selectedFiles.value.length > 0 &&
  queryPrompt.value.trim().length > 0
))

const openWindow = () => {
  selectedStage.value = 'base'
  isWindowOpen.value = true
}

const closeWindow = () => {
  isWindowOpen.value = false
  dragOver.value = false
}

const selectType = (type) => {
  selectedTypesByStage.value = {
    ...selectedTypesByStage.value,
    [selectedStage.value]: type
  }
  filesByStage.value = {
    ...filesByStage.value,
    [selectedStage.value]: []
  }
  message.value = ''
  hasError.value = false
}

const setFiles = (files) => {
  const valid = Array.from(files).filter((file) => isValidFile(file))
  filesByStage.value = {
    ...filesByStage.value,
    [selectedStage.value]: valid
  }
  hasError.value = valid.length === 0
  message.value = valid.length ? `已选择 ${valid.length} 个 ${selectedStageLabel.value} ${selectedTypeLabel.value} 文件` : `仅支持 ${selectedTypeLabel.value} 格式文件`
}

const isValidFile = (file) => {
  const name = file.name.toLowerCase()
  const rules = {
    pdf: ['.pdf'],
    csv: ['.csv'],
    excel: ['.xls', '.xlsx'],
    txt: ['.txt'],
    markdown: ['.md', '.markdown']
  }
  return rules[selectedType.value].some((suffix) => name.endsWith(suffix))
}

const formatSize = (size) => {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

const handleSelect = (event) => setFiles(event.target.files)

const handleDrop = (event) => {
  dragOver.value = false
  setFiles(event.dataTransfer.files)
}

const buildQueryPrompt = () => buildAscQueryPrompt(queryPrompt.value)

const normalizePdfLibraryFiles = (files) => files.map((file) => ({
  file_id: file.file_id,
  filename: file.filename,
  file_size: file.file_size,
  category: file.category,
  created_at: file.created_at
})).filter((file) => file.file_id)

const enterKnowledgeGraphStage = (pdfLibraryFiles = []) => {
  const normalizedPdfLibraryFiles = normalizePdfLibraryFiles(pdfLibraryFiles)
  const usePdfLibraryFiles = selectedType.value === 'pdf' && normalizedPdfLibraryFiles.length > 0
  const pendingFiles = usePdfLibraryFiles ? [] : [...selectedFiles.value]
  setPendingUpload(
    pendingFiles,
    buildQueryPrompt(),
    '',
    '',
    {
      dataType: selectedType.value,
      buildStage: selectedStage.value,
      sourceCorpusType: selectedStageConfig.value.sourceCorpusType,
      baseMetadataPath: '',
      pdfLibraryFileIds: usePdfLibraryFiles ? normalizedPdfLibraryFiles.map((file) => file.file_id) : [],
      pdfLibraryFiles: usePdfLibraryFiles ? normalizedPdfLibraryFiles : [],
      filesByStage: {
        base: usePdfLibraryFiles ? [] : [...(filesByStage.value.base || [])],
        professional: []
      }
    }
  )
  closeWindow()
  router.push({ name: 'Process', params: { projectId: 'new' } })
}

const submitUpload = async () => {
  if (!canSubmit.value || uploading.value) return
  if (selectedType.value !== 'pdf') {
    uploading.value = true
    progress.value = 0
    hasError.value = false
    message.value = `正在验证 ${selectedStageLabel.value} ${selectedTypeLabel.value} 数据...`
    window.setTimeout(() => {
      progress.value = 100
      message.value = `${selectedStageLabel.value} 数据验证完成：${selectedFiles.value.length} 个文件已准备进入知识图谱构建阶段`
      uploading.value = false
      emit('uploaded')
      window.setTimeout(enterKnowledgeGraphStage, 260)
    }, 360)
    return
  }
  try {
    uploading.value = true
    progress.value = 0
    hasError.value = false
    const totalBytes = selectedFiles.value.reduce((sum, file) => sum + Number(file.size || 0), 0)
    let completedBytes = 0
    const uploadedRecords = []

    for (let index = 0; index < selectedFiles.value.length; index += 1) {
      const file = selectedFiles.value[index]
      const formData = new FormData()
      formData.append('files', file)
      formData.append('category', 'ASC 检测报告')
      formData.append('description', buildQueryPrompt())
      message.value = `正在上传 PDF ${index + 1}/${selectedFiles.value.length}: ${file.name}`

      const response = await uploadPdfFiles(formData, (event) => {
        if (!totalBytes) return
        const loaded = Math.min(Number(event.loaded || 0), Number(file.size || 0))
        progress.value = Math.min(99, Math.round(((completedBytes + loaded) / totalBytes) * 100))
      })
      const records = Array.isArray(response.data) ? response.data : []
      uploadedRecords.push(...records)
      completedBytes += Number(file.size || 0)
      progress.value = totalBytes ? Math.round((completedBytes / totalBytes) * 100) : Math.round(((index + 1) / selectedFiles.value.length) * 100)
    }

    if (!uploadedRecords.length) {
      throw new Error('PDF 文件库没有返回可用于构建图谱的文件 ID')
    }

    message.value = `已写入文件库 ${uploadedRecords.length} 个 PDF，正在进入知识图谱构建阶段...`
    emit('uploaded')
    window.setTimeout(() => enterKnowledgeGraphStage(uploadedRecords), 260)
  } catch (error) {
    hasError.value = true
    const networkIssue = error.message === 'Network Error' || error.code === 'ERR_NETWORK'
    message.value = networkIssue
      ? '无法连接后端文件库服务，请确认 http://127.0.0.1:5001 已启动后重试'
      : (error.message || '上传失败，请检查文件格式和后端服务')
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.asc-uploader-shell {
  background: #ffffff;
  border: 1px solid #d9e1e8;
  border-radius: 8px;
  padding: 22px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  box-shadow: 0 12px 30px rgba(31, 48, 65, 0.08);
}

.eyebrow {
  color: #607080;
  font-size: 0.78rem;
  text-transform: uppercase;
  font-weight: 800;
  margin: 0 0 6px;
}

h2 {
  margin: 0 0 8px;
  color: #17212b;
}

p {
  margin: 0;
  color: #607080;
  line-height: 1.6;
}

.analysis-focus {
  margin-top: 16px;
  border: 1px solid #d9e1e8;
  border-left: 4px solid #245c8f;
  border-radius: 8px;
  padding: 12px 14px;
  background: #f7fafc;
  display: grid;
  gap: 4px;
}

.focus-label {
  color: #607080;
  font-size: 0.8rem;
  font-weight: 900;
}

.open-window-btn {
  border: 0;
  border-radius: 8px;
  background: #245c8f;
  color: #ffffff;
  min-height: 58px;
  padding: 0 20px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(36, 92, 143, 0.22);
  transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.open-window-btn:hover {
  transform: translateY(-1px);
  background: #1f4f7b;
  box-shadow: 0 14px 26px rgba(36, 92, 143, 0.28);
}

.open-window-btn.active {
  background: #2f8f6b;
}

.window-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.subwindow-layer {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
}

.subwindow-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(23, 33, 43, 0.12);
  pointer-events: auto;
}

.analysis-subwindow {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(820px, calc(100vw - 72px));
  max-height: calc(100vh - 108px);
  overflow: auto;
  background: #edf4f8;
  border: 1px solid #cbd7e2;
  border-radius: 10px;
  padding: 30px;
  box-shadow: 0 28px 70px rgba(23, 33, 43, 0.28);
  pointer-events: auto;
  transform: translate(-50%, -50%);
}

.subwindow-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 24px;
}

.subwindow-header h2 {
  font-size: clamp(2rem, 4vw, 3rem);
}

.close-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: #17212b;
  color: #ffffff;
  font-size: 1.4rem;
  cursor: pointer;
}

.type-selector {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  background: #dfe8ef;
  border: 1px solid #cbd7e2;
  border-radius: 999px;
  padding: 5px;
  margin-bottom: 18px;
  overflow: hidden;
}

.type-selector button {
  position: relative;
  z-index: 2;
  border: 0;
  background: transparent;
  color: #607080;
  min-height: 38px;
  border-radius: 999px;
  font-weight: 900;
  cursor: pointer;
  transition: color 0.18s ease;
}

.type-selector button.active {
  color: #ffffff;
}

.slider-thumb {
  position: absolute;
  z-index: 1;
  top: 5px;
  left: 5px;
  width: calc((100% - 10px) / 5);
  height: calc(100% - 10px);
  border-radius: 999px;
  background: #245c8f;
  box-shadow: 0 8px 18px rgba(36, 92, 143, 0.24);
  transition: transform 0.22s ease;
}

.drop-zone {
  border: 1px dashed #9eafbd;
  border-radius: 8px;
  background: #f7fafc;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #607080;
  cursor: pointer;
  text-align: center;
  padding: 24px;
}

.drop-zone.active {
  border-color: #2f8f6b;
  background: #eef8f4;
}

.drop-zone input {
  display: none;
}

.drop-zone strong {
  color: #17212b;
  font-size: 1.7rem;
}

.prompt-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.prompt-field {
  display: grid;
  gap: 8px;
  color: #607080;
  font-size: 0.84rem;
  font-weight: 900;
}

.prompt-field span {
  color: #17212b;
}

textarea {
  width: 100%;
  border: 1px solid #d9e1e8;
  border-radius: 8px;
  padding: 18px;
  font: inherit;
  resize: vertical;
  min-height: 136px;
  line-height: 1.6;
  background: #ffffff;
}

.analysis-file-list {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}

.analysis-file-card {
  background: #f7fafc;
  border: 1px solid #d9e1e8;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  width: 42px;
  height: 42px;
  border-radius: 6px;
  background: #245c8f;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.file-detail {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.file-detail strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-detail span {
  color: #607080;
  font-size: 0.85rem;
}

.submit-btn {
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: #245c8f;
  color: #ffffff;
  min-height: 72px;
  padding: 0 24px;
  margin-top: 20px;
  cursor: pointer;
  font-size: 1.05rem;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.submit-btn:disabled {
  cursor: not-allowed;
  background: #c5ced7;
}

.feedback {
  margin-top: 14px;
  color: #2f8f6b;
  font-weight: 800;
}

.feedback.error {
  color: #b34747;
}

.subwindow-enter-active,
.subwindow-leave-active {
  transition: opacity 0.18s ease;
}

.subwindow-enter-active .analysis-subwindow,
.subwindow-leave-active .analysis-subwindow {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.subwindow-enter-from,
.subwindow-leave-to {
  opacity: 0;
}

.subwindow-enter-from .analysis-subwindow,
.subwindow-leave-to .analysis-subwindow {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 10px)) scale(0.98);
}

@media (max-width: 860px) {
  .asc-uploader-shell {
    grid-template-columns: 1fr;
  }

  .open-window-btn {
    justify-content: center;
  }

  .analysis-subwindow {
    top: 18px;
    right: 14px;
    left: 14px;
    width: auto;
    max-height: calc(100vh - 36px);
    padding: 22px;
    transform: none;
  }

  .type-selector {
    grid-template-columns: 1fr;
    border-radius: 8px;
    gap: 4px;
  }

  .slider-thumb {
    display: none;
  }

  .type-selector button.active {
    background: #245c8f;
  }

  .prompt-grid {
    grid-template-columns: 1fr;
  }
}
</style>
