<template>
  <aside class="pdf-sidebar">
    <div class="side-header">
      <div>
        <p>PDF 文件存储</p>
        <h3>ASC 报告库</h3>
      </div>
      <button @click="loadFiles">刷新</button>
    </div>

    <div class="mini-upload" @click="sidebarInput?.click()" @drop.prevent="handleDrop" @dragover.prevent>
      <input ref="sidebarInput" type="file" accept="application/pdf,.pdf" multiple @change="handleSelect" />
      <strong>上传 PDF</strong>
      <span>{{ uploadMessage }}</span>
    </div>

    <div class="filters">
      <input v-model="search" placeholder="搜索文件名或说明" @input="loadFiles" />
      <select v-model="category" @change="loadFiles">
        <option value="">全部分类</option>
        <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
      </select>
      <select v-model="sortBy" @change="loadFiles">
        <option value="created_at">按上传时间</option>
        <option value="filename">按文件名</option>
        <option value="file_size">按大小</option>
        <option value="category">按分类</option>
      </select>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="state">加载中...</div>
    <div v-else-if="files.length === 0" class="state">暂无 PDF 文件</div>

    <div v-else class="file-list">
      <article v-for="file in files" :key="file.file_id" class="pdf-item">
        <div class="pdf-meta">
          <strong :title="file.filename">{{ file.filename }}</strong>
          <span>{{ file.category }} · {{ formatSize(file.file_size) }}</span>
          <small>{{ formatTime(file.created_at) }}</small>
        </div>
        <div class="pdf-actions">
          <button @click="previewFile(file)">预览</button>
          <a :href="downloadUrl(file.file_id)" target="_blank">下载</a>
          <button class="danger" @click="removeFile(file)">删除</button>
        </div>
      </article>
    </div>

    <div v-if="preview" class="preview-panel">
      <div class="preview-header">
        <strong>{{ preview.filename }}</strong>
        <button @click="preview = null">关闭</button>
      </div>
      <iframe :src="previewUrl(preview.file_id)" title="PDF 预览"></iframe>
    </div>
  </aside>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { deletePdfFile, getPdfDownloadUrl, getPdfPreviewUrl, listPdfFiles, uploadPdfFiles } from '../api/pdfLibrary'

const files = ref([])
const categories = ref([])
const search = ref('')
const category = ref('')
const sortBy = ref('created_at')
const loading = ref(false)
const error = ref('')
const uploadMessage = ref('拖放或点击选择')
const sidebarInput = ref(null)
const preview = ref(null)

const loadFiles = async () => {
  try {
    loading.value = true
    error.value = ''
    const res = await listPdfFiles({ search: search.value, category: category.value, sort_by: sortBy.value, order: 'desc' })
    files.value = res.data || []
    categories.value = res.categories || []
  } catch (err) {
    error.value = err.message || '无法加载 PDF 文件库'
  } finally {
    loading.value = false
  }
}

const upload = async (inputFiles) => {
  const pdfs = Array.from(inputFiles).filter((file) => file.name.toLowerCase().endsWith('.pdf'))
  if (!pdfs.length) {
    uploadMessage.value = '仅支持 PDF 文件'
    return
  }
  const formData = new FormData()
  pdfs.forEach((file) => formData.append('files', file))
  formData.append('category', 'ASC 检测报告')
  formData.append('description', '侧边栏 PDF 文件存储')
  try {
    uploadMessage.value = '上传中...'
    await uploadPdfFiles(formData, (event) => {
      if (event.total) uploadMessage.value = `上传中 ${Math.round((event.loaded / event.total) * 100)}%`
    })
    uploadMessage.value = `已上传 ${pdfs.length} 个文件`
    await loadFiles()
  } catch (err) {
    uploadMessage.value = err.message || '上传失败'
  }
}

const handleSelect = (event) => upload(event.target.files)
const handleDrop = (event) => upload(event.dataTransfer.files)
const previewFile = (file) => {
  preview.value = file
}

const removeFile = async (file) => {
  if (!window.confirm(`删除 ${file.filename}？`)) return
  await deletePdfFile(file.file_id)
  if (preview.value?.file_id === file.file_id) preview.value = null
  await loadFiles()
}

const previewUrl = (fileId) => getPdfPreviewUrl(fileId)
const downloadUrl = (fileId) => getPdfDownloadUrl(fileId)

const formatSize = (size) => {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

const formatTime = (value) => value ? new Date(value).toLocaleString() : ''

onMounted(loadFiles)
</script>

<style scoped>
.pdf-sidebar {
  width: 320px;
  flex: 0 0 320px;
  height: 100%;
  background: #f7fafc;
  border-right: 1px solid #d9e1e8;
  padding: 16px;
  overflow: auto;
  color: #17212b;
}

.side-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
  margin-bottom: 14px;
}

.side-header p {
  margin: 0 0 4px;
  color: #607080;
  font-size: 0.76rem;
  font-weight: 900;
}

.side-header h3 {
  margin: 0;
}

button,
a {
  border: 1px solid #d9e1e8;
  background: #ffffff;
  color: #245c8f;
  border-radius: 5px;
  padding: 7px 9px;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
  text-decoration: none;
}

.mini-upload {
  border: 1px dashed #9eafbd;
  background: #ffffff;
  border-radius: 8px;
  min-height: 90px;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 6px;
  cursor: pointer;
  margin-bottom: 12px;
}

.mini-upload input {
  display: none;
}

.mini-upload span,
.state,
.error,
.pdf-meta span,
.pdf-meta small {
  color: #607080;
  font-size: 0.82rem;
}

.filters {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

input,
select {
  width: 100%;
  border: 1px solid #d9e1e8;
  border-radius: 6px;
  background: #ffffff;
  padding: 9px;
  font: inherit;
}

.error {
  color: #b34747;
}

.file-list {
  display: grid;
  gap: 10px;
}

.pdf-item {
  background: #ffffff;
  border: 1px solid #d9e1e8;
  border-radius: 8px;
  padding: 12px;
}

.pdf-meta {
  display: grid;
  gap: 4px;
}

.pdf-meta strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-actions {
  margin-top: 10px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.danger {
  color: #b34747;
}

.preview-panel {
  margin-top: 14px;
  background: #ffffff;
  border: 1px solid #d9e1e8;
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  align-items: center;
}

.preview-header strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

iframe {
  width: 100%;
  height: 420px;
  border: 0;
  border-top: 1px solid #d9e1e8;
}
</style>
