<template>
  <article class="history-import">
    <div class="card-header">
      <div>
        <p class="eyebrow">历史数据导入</p>
        <h3>CSV / Excel 数据验证</h3>
      </div>
      <span>{{ importProgress }}%</span>
    </div>
    <div class="import-drop" @click="inputRef?.click()" @drop.prevent="handleDrop" @dragover.prevent>
      <input ref="inputRef" type="file" accept=".csv,.xlsx,.xls" multiple @change="handleSelect" />
      <strong>导入历史检测数据</strong>
      <small>支持 CSV、XLS、XLSX；至少包含批次、成分或性能字段。</small>
    </div>
    <div class="progress-track"><div :style="{ width: `${importProgress}%` }"></div></div>
    <div v-if="messages.length" class="validation-list">
      <div v-for="item in messages" :key="item.name" :class="['validation-item', item.type]">
        <strong>{{ item.name }}</strong>
        <span>{{ item.message }}</span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { ref } from 'vue'

const inputRef = ref(null)
const importProgress = ref(0)
const messages = ref([])

const requiredHints = ['批次', 'batch', 'Al2O3', 'SiC', 'C', '强度', '抗渣', 'porosity']

const validateFile = async (file) => {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['csv', 'xls', 'xlsx'].includes(ext)) {
    return { name: file.name, type: 'error', message: '格式不支持' }
  }
  if (file.size === 0) {
    return { name: file.name, type: 'error', message: '文件为空' }
  }
  if (ext === 'csv') {
    const text = await file.text()
    const header = text.split(/\r?\n/)[0] || ''
    const matched = requiredHints.some((hint) => header.includes(hint))
    return {
      name: file.name,
      type: matched ? 'ok' : 'warning',
      message: matched ? 'CSV 表头校验通过' : '已读取 CSV，但建议补充批次、成分或性能字段'
    }
  }
  return { name: file.name, type: 'ok', message: 'Excel 文件格式校验通过，等待结构化解析' }
}

const processFiles = async (files) => {
  const selected = Array.from(files)
  messages.value = []
  importProgress.value = 0
  for (let index = 0; index < selected.length; index += 1) {
    messages.value.push(await validateFile(selected[index]))
    importProgress.value = Math.round(((index + 1) / selected.length) * 100)
  }
}

const handleSelect = (event) => processFiles(event.target.files)
const handleDrop = (event) => processFiles(event.dataTransfer.files)
</script>

<style scoped>
.history-import {
  background: #ffffff;
  border: 1px solid #d9e1e8;
  border-radius: 8px;
  padding: 22px;
  min-height: 300px;
  box-shadow: 0 12px 30px rgba(31, 48, 65, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: start;
  margin-bottom: 18px;
}

.eyebrow {
  color: #607080;
  font-size: 0.78rem;
  text-transform: uppercase;
  font-weight: 800;
}

h3 {
  margin: 4px 0 0;
}

.import-drop {
  border: 1px dashed #9eafbd;
  border-radius: 8px;
  background: #f7fafc;
  min-height: 128px;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 8px;
  cursor: pointer;
}

.import-drop input {
  display: none;
}

.import-drop small,
.validation-item span {
  color: #607080;
}

.progress-track {
  height: 9px;
  background: #e7edf2;
  border-radius: 999px;
  overflow: hidden;
  margin: 14px 0;
}

.progress-track div {
  height: 100%;
  background: #2f8f6b;
}

.validation-list {
  display: grid;
  gap: 8px;
}

.validation-item {
  border: 1px solid #d9e1e8;
  border-left: 4px solid #2f8f6b;
  border-radius: 6px;
  padding: 9px;
  display: grid;
  gap: 3px;
}

.validation-item.error {
  border-left-color: #b34747;
}

.validation-item.warning {
  border-left-color: #c4772d;
}
</style>
