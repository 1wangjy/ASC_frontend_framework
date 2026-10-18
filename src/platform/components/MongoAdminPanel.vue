<template>
  <section class="mongo-admin">
    <header class="ma-head">
      <div>
        <h2>MongoDB 管理</h2>
        <p>库总览、集合/文件浏览、索引管理与聚合统计（只读浏览；索引可增删）。</p>
      </div>
      <div class="ma-head-actions">
        <span v-if="status" class="ma-conn" :class="{ 'is-ok': true }">已连接 · {{ status.db }}</span>
        <button class="btn" :disabled="busy" @click="refreshAll">刷新</button>
      </div>
    </header>

    <div v-if="error" class="ma-error">
      <strong>操作失败：</strong>{{ error }}
      <button class="ma-link" @click="error = ''">关闭</button>
    </div>

    <div class="ma-stats" v-if="status">
      <div class="ma-stat"><span>版本</span><strong>{{ status.version || '—' }}</strong></div>
      <div class="ma-stat"><span>运行时长</span><strong>{{ formatDuration(status.uptime_seconds) }}</strong></div>
      <div class="ma-stat"><span>集合 / 索引</span><strong>{{ status.collections }} / {{ status.indexes }}</strong></div>
      <div class="ma-stat"><span>文档数</span><strong>{{ status.objects ?? '—' }}</strong></div>
      <div class="ma-stat"><span>数据量</span><strong>{{ formatBytes(status.data_size) }}</strong></div>
      <div class="ma-stat"><span>存储量</span><strong>{{ formatBytes(status.storage_size) }}</strong></div>
      <div class="ma-stat" v-for="bucket in status.buckets" :key="bucket.name">
        <span>{{ bucket.name }}</span>
        <strong>{{ bucket.files }} 文件 / {{ formatBytes(bucket.bytes) }}</strong>
      </div>
    </div>

    <div class="ma-body">
      <aside class="ma-side" aria-label="集合与 bucket">
        <div class="ma-side-title">集合</div>
        <button
          v-for="collection in collections"
          :key="collection.name"
          class="ma-side-item"
          :class="{ 'is-active': view !== 'files' && selected === collection.name }"
          :title="`${collection.name} · ${formatBytes(collection.size)}`"
          @click="selectCollection(collection.name)"
        >
          <span class="ma-side-name">{{ collection.name }}</span>
          <em>{{ collection.count ?? '—' }}</em>
        </button>
        <div class="ma-side-title">GridFS buckets</div>
        <button
          v-for="bucket in buckets"
          :key="bucket.name"
          class="ma-side-item"
          :class="{ 'is-active': view === 'files' && bucketName === bucket.name }"
          @click="selectBucket(bucket.name)"
        >
          <span class="ma-side-name">{{ bucket.name }}</span>
          <em>{{ bucket.files }}</em>
        </button>
        <p v-if="!collections.length" class="ma-empty">暂无集合</p>
      </aside>

      <main class="ma-main">
        <div class="ma-tabs" role="tablist">
          <button v-for="tab in VIEW_TABS" :key="tab.key" class="ma-tab"
            :class="{ 'is-active': view === tab.key }" role="tab"
            :aria-selected="view === tab.key" @click="switchView(tab.key)">{{ tab.label }}</button>
          <span class="ma-target">{{ view === 'files' ? bucketName : selected }}</span>
        </div>

        <!-- 文档浏览 -->
        <div v-show="view === 'docs'" class="ma-pane">
          <div class="ma-toolbar">
            <input v-model="docQuery.q" class="ma-input" type="search" placeholder="关键词（文件名/DOI/标题…）"
              @keyup.enter="loadDocs(0)" />
            <input v-model="docQuery.qField" class="ma-input ma-input--narrow" placeholder="限定字段（可选）" />
            <select v-model.number="docQuery.limit" class="ma-input ma-input--narrow" @change="loadDocs(0)">
              <option :value="20">20 条</option>
              <option :value="50">50 条</option>
              <option :value="100">100 条</option>
            </select>
            <button class="btn" :disabled="busy" @click="loadDocs(0)">搜索</button>
          </div>
          <details class="ma-advanced">
            <summary>高级：过滤 / 排序（Mongo 语法）</summary>
            <textarea v-model="docQuery.filterText" class="ma-input ma-textarea" rows="3"
              placeholder='{"visibility":"public","kind":"pdf"}'></textarea>
            <input v-model="docQuery.sortText" class="ma-input" placeholder='{"created_at":-1}' />
          </details>

          <div class="ma-meta">
            共 <strong>{{ docResult.total }}</strong> 条<span v-if="docResult.search_fields.length">
              · 搜索字段：{{ docResult.search_fields.join(', ') }}</span>
          </div>

          <div class="ma-table-wrap">
            <table class="ma-table">
              <thead><tr><th>_id</th><th>摘要</th><th></th></tr></thead>
              <tbody>
                <template v-for="doc in docResult.docs" :key="doc._id">
                  <tr>
                    <td class="ma-mono">{{ doc._id }}</td>
                    <td class="ma-summary">{{ summarize(doc) }}</td>
                    <td class="ma-row-actions">
                      <button class="ma-link" @click="toggleDoc(doc._id)">{{ expanded.has(doc._id) ? '收起' : '展开' }}</button>
                      <button class="ma-link" @click="copy(JSON.stringify(doc))">复制</button>
                      <a v-if="doc.file_id" class="ma-link" :href="`/api/files/${doc.file_id}/stream`" target="_blank" rel="noopener">原文</a>
                    </td>
                  </tr>
                  <tr v-if="expanded.has(doc._id)">
                    <td colspan="3"><pre class="ma-json">{{ pretty(doc) }}</pre></td>
                  </tr>
                </template>
                <tr v-if="!docResult.docs.length"><td colspan="3" class="ma-empty">没有匹配的文档</td></tr>
              </tbody>
            </table>
          </div>
          <div class="ma-pager">
            <button class="btn btn-secondary" :disabled="docQuery.skip <= 0" @click="loadDocs(Math.max(0, docQuery.skip - docQuery.limit))">上一页</button>
            <span>{{ rangeLabel(docQuery.skip, docResult.docs.length, docResult.total) }}</span>
            <button class="btn btn-secondary" :disabled="docQuery.skip + docQuery.limit >= docResult.total" @click="loadDocs(docQuery.skip + docQuery.limit)">下一页</button>
          </div>
        </div>

        <!-- 文件导航 -->
        <div v-show="view === 'files'" class="ma-pane">
          <div class="ma-toolbar">
            <input v-model="fileQuery.q" class="ma-input" type="search" placeholder="文件名 / DOI / lit_id"
              @keyup.enter="loadFiles(0)" />
            <select v-model="fileQuery.visibility" class="ma-input ma-input--narrow" @change="loadFiles(0)">
              <option value="">全部可见性</option>
              <option value="public">public</option>
              <option value="private">private</option>
            </select>
            <select v-model="fileQuery.kind" class="ma-input ma-input--narrow" @change="loadFiles(0)">
              <option value="">全部类型</option>
              <option value="pdf">pdf</option>
              <option value="md">md</option>
            </select>
            <button class="btn" :disabled="busy" @click="loadFiles(0)">搜索</button>
          </div>
          <div class="ma-meta">
            共 <strong>{{ fileResult.total }}</strong> 个文件 · {{ formatBytes(fileResult.totals.bytes) }}
            <span v-for="(info, kind) in fileResult.totals.by_kind" :key="kind" class="ma-chip">{{ kind }}: {{ info.n }}</span>
          </div>
          <div class="ma-table-wrap">
            <table class="ma-table">
              <thead><tr><th>文件</th><th>DOI</th><th>文献</th><th>类型/大小</th><th>可见性</th><th></th></tr></thead>
              <tbody>
                <tr v-for="file in fileResult.items" :key="file.file_id">
                  <td>
                    <div class="ma-filename">{{ file.filename }}</div>
                    <div class="ma-mono ma-dim">{{ file.file_id }}</div>
                    <div v-if="file.aliases.length" class="ma-dim">别名：{{ file.aliases.join(' · ') }}</div>
                  </td>
                  <td class="ma-mono">{{ file.doi || '—' }}</td>
                  <td class="ma-mono">{{ file.lit_id || '—' }}</td>
                  <td>{{ file.kind }} · {{ formatBytes(file.size) }}</td>
                  <td><span class="ma-chip" :class="{ 'is-public': file.visibility === 'public' }">{{ file.visibility }}</span></td>
                  <td class="ma-row-actions">
                    <a class="ma-link" :href="file.stream_url" target="_blank" rel="noopener">打开</a>
                    <button class="ma-link" @click="copy(file.file_id)">复制 ID</button>
                  </td>
                </tr>
                <tr v-if="!fileResult.items.length"><td colspan="6" class="ma-empty">没有匹配的文件</td></tr>
              </tbody>
            </table>
          </div>
          <div class="ma-pager">
            <button class="btn btn-secondary" :disabled="fileQuery.skip <= 0" @click="loadFiles(Math.max(0, fileQuery.skip - fileQuery.limit))">上一页</button>
            <span>{{ rangeLabel(fileQuery.skip, fileResult.items.length, fileResult.total) }}</span>
            <button class="btn btn-secondary" :disabled="fileQuery.skip + fileQuery.limit >= fileResult.total" @click="loadFiles(fileQuery.skip + fileQuery.limit)">下一页</button>
          </div>
        </div>

        <!-- 索引管理 -->
        <div v-show="view === 'indexes'" class="ma-pane">
          <div class="ma-toolbar">
            <input v-model="indexDraft.keys" class="ma-input" placeholder="字段与方向，如 created_at:-1, doi:1" />
            <input v-model="indexDraft.name" class="ma-input ma-input--narrow" placeholder="索引名（可选）" />
            <label class="ma-check"><input v-model="indexDraft.unique" type="checkbox" /> 唯一</label>
            <button class="btn" :disabled="busy" @click="createIndex">创建索引</button>
          </div>
          <div class="ma-table-wrap">
            <table class="ma-table">
              <thead><tr><th>名称</th><th>字段</th><th>属性</th><th></th></tr></thead>
              <tbody>
                <tr v-for="index in indexes" :key="index.name">
                  <td class="ma-mono">{{ index.name }}</td>
                  <td class="ma-mono">{{ formatKeys(index.keys) }}</td>
                  <td>
                    <span v-if="index.unique" class="ma-chip">unique</span>
                    <span v-if="index.sparse" class="ma-chip">sparse</span>
                    <span v-if="index.partialFilterExpression" class="ma-chip" :title="JSON.stringify(index.partialFilterExpression)">partial</span>
                  </td>
                  <td class="ma-row-actions">
                    <button class="ma-link ma-danger" :disabled="index.name === '_id_'" @click="dropIndex(index.name)">删除</button>
                  </td>
                </tr>
                <tr v-if="!indexes.length"><td colspan="4" class="ma-empty">暂无索引</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 统计 -->
        <div v-show="view === 'stats'" class="ma-pane">
          <div class="ma-toolbar">
            <select v-model="statPreset" class="ma-input" @change="runStats">
              <option v-for="preset in STAT_PRESETS" :key="preset.key" :value="preset.key">{{ preset.label }}</option>
            </select>
            <button class="btn" :disabled="busy" @click="runStats">运行</button>
          </div>
          <pre class="ma-json">{{ pretty(statRows) }}</pre>
        </div>
      </main>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  createMongoIndex, dropMongoIndex, findMongoDocs, getMongoCollections,
  getMongoIndexes, getMongoStatus, listMongoFiles, runMongoAggregate,
} from '../api/mongoAdmin'

const VIEW_TABS = [
  { key: 'docs', label: '文档浏览' },
  { key: 'files', label: '文件导航' },
  { key: 'indexes', label: '索引管理' },
  { key: 'stats', label: '统计' },
]

const STAT_PRESETS = [
  { key: 'kind', label: '按文件类型', collection: 'file_meta', pipeline: [{ $group: { _id: '$kind', n: { $sum: 1 }, bytes: { $sum: '$size' } } }, { $sort: { n: -1 } }] },
  { key: 'visibility', label: '按可见性', collection: 'file_meta', pipeline: [{ $group: { _id: '$visibility', n: { $sum: 1 }, bytes: { $sum: '$size' } } }, { $sort: { n: -1 } }] },
  { key: 'source', label: '按来源', collection: 'file_meta', pipeline: [{ $group: { _id: '$source', n: { $sum: 1 } } }, { $sort: { n: -1 } }] },
  { key: 'lit', label: '按文献（文件数 Top 20）', collection: 'file_meta', pipeline: [{ $match: { lit_id: { $ne: null } } }, { $group: { _id: '$lit_id', n: { $sum: 1 }, bytes: { $sum: '$size' } } }, { $sort: { bytes: -1 } }] },
]

const status = ref(null)
const collections = ref([])
const selected = ref('file_meta')
const bucketName = ref('asc_files')
const view = ref('docs')
const busy = ref(false)
const error = ref('')

const expanded = ref(new Set())
const docQuery = reactive({ q: '', qField: '', limit: 20, skip: 0, filterText: '', sortText: '' })
const docResult = reactive({ docs: [], total: 0, search_fields: [] })

const fileQuery = reactive({ q: '', visibility: '', kind: '', limit: 30, skip: 0 })
const fileResult = reactive({ items: [], total: 0, totals: { bytes: 0, by_kind: {}, by_visibility: {} } })

const indexes = ref([])
const indexDraft = reactive({ keys: '', name: '', unique: false })
const statPreset = ref('kind')
const statRows = ref([])

const buckets = computed(() => (status.value?.buckets || []).map((bucket) => ({
  name: bucket.name,
  files: bucket.files,
})))

function describeError(cause) {
  const payload = cause?.response?.data
  if (payload?.error) return payload.error
  if (payload?.message) return payload.message
  return cause?.message || '未知错误'
}

async function run(task) {
  busy.value = true
  error.value = ''
  try {
    return await task()
  } catch (cause) {
    error.value = describeError(cause)
    return null
  } finally {
    busy.value = false
  }
}

async function refreshAll() {
  const data = await run(async () => {
    const [nextStatus, nextCollections] = await Promise.all([getMongoStatus(), getMongoCollections()])
    return { status: nextStatus, collections: nextCollections }
  })
  if (!data) return
  status.value = data.status
  collections.value = data.collections || []
  const names = collections.value.map((item) => item.name)
  if (!names.includes(selected.value)) selected.value = names.includes('file_meta') ? 'file_meta' : (names[0] || '')
  await Promise.all([loadDocs(0), loadFiles(0)])
  if (view.value === 'indexes') await loadIndexes()
}

function selectCollection(name) {
  selected.value = name
  docQuery.skip = 0
  if (view.value === 'files') view.value = 'docs'
  loadDocs(0)
  if (view.value === 'indexes') loadIndexes()
}

function selectBucket(name) {
  bucketName.value = name
  view.value = 'files'
  loadFiles(0)
}

function switchView(next) {
  view.value = next
  if (next === 'docs') loadDocs(docQuery.skip)
  else if (next === 'files') loadFiles(fileQuery.skip)
  else if (next === 'indexes') loadIndexes()
  else if (next === 'stats') runStats()
}

function parseJson(text, label) {
  const value = String(text || '').trim()
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${label} 不是合法 JSON`)
  }
}

async function loadDocs(skip = 0) {
  if (!selected.value) return
  const data = await run(async () => findMongoDocs({
    collection: selected.value,
    q: docQuery.q.trim() || undefined,
    qFields: docQuery.qField.trim() ? [docQuery.qField.trim()] : undefined,
    filter: parseJson(docQuery.filterText, '过滤条件'),
    sort: parseJson(docQuery.sortText, '排序'),
    limit: docQuery.limit,
    skip,
  }))
  if (!data) return
  docResult.docs = data.docs || []
  docResult.total = data.total || 0
  docResult.search_fields = data.search_fields || []
  docQuery.skip = skip
  expanded.value = new Set()
}

async function loadFiles(skip = 0) {
  const data = await run(() => listMongoFiles({
    q: fileQuery.q.trim() || undefined,
    visibility: fileQuery.visibility || undefined,
    kind: fileQuery.kind || undefined,
    limit: fileQuery.limit,
    skip,
  }))
  if (!data) return
  fileResult.items = data.items || []
  fileResult.total = data.total || 0
  fileResult.totals = data.totals || { bytes: 0, by_kind: {}, by_visibility: {} }
  fileQuery.skip = skip
}

async function loadIndexes() {
  if (!selected.value) return
  const data = await run(() => getMongoIndexes(selected.value))
  if (data) indexes.value = data || []
}

async function createIndex() {
  const pairs = String(indexDraft.keys || '').split(',').map((item) => item.trim()).filter(Boolean)
  if (!pairs.length) {
    error.value = '请填写索引字段，例如 created_at:-1, doi:1'
    return
  }
  const keys = {}
  for (const pair of pairs) {
    const [field, rawDirection] = pair.split(':').map((item) => item.trim())
    const direction = rawDirection === undefined ? 1 : (/^-1$/.test(rawDirection) ? -1 : (/^text$/i.test(rawDirection) ? 'text' : (/^hashed$/i.test(rawDirection) ? 'hashed' : 1)))
    if (!field) {
      error.value = `无法解析字段：${pair}`
      return
    }
    keys[field] = direction
  }
  const data = await run(() => createMongoIndex(selected.value, {
    keys,
    name: indexDraft.name.trim() || undefined,
    unique: indexDraft.unique,
  }))
  if (!data) return
  indexDraft.keys = ''
  indexDraft.name = ''
  indexDraft.unique = false
  await loadIndexes()
}

async function dropIndex(name) {
  if (!window.confirm(`确认删除索引 ${name} ？`)) return
  const data = await run(() => dropMongoIndex(selected.value, name))
  if (data) await loadIndexes()
}

async function runStats() {
  const preset = STAT_PRESETS.find((item) => item.key === statPreset.value) || STAT_PRESETS[0]
  const data = await run(() => runMongoAggregate({
    collection: preset.collection,
    pipeline: preset.pipeline,
    limit: 50,
  }))
  if (data) statRows.value = data.rows || []
}

function toggleDoc(id) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

const SUMMARY_KEYS = ['filename', 'title', 'doi', 'lit_id', 'kind', 'visibility', 'source', 'size', 'length', 'status']
function summarize(doc) {
  const parts = []
  for (const key of SUMMARY_KEYS) {
    if (doc[key] === undefined || doc[key] === null || doc[key] === '') continue
    parts.push(`${key}=${typeof doc[key] === 'object' ? JSON.stringify(doc[key]) : doc[key]}`)
    if (parts.length >= 5) break
  }
  return parts.join(' · ') || '（无摘要字段）'
}

function pretty(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatKeys(keys) {
  return Object.entries(keys || {}).map(([field, direction]) => `${field}:${direction}`).join(', ')
}

function formatBytes(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = number
  let index = 0
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1 }
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatDuration(seconds) {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total <= 0) return '—'
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days) return `${days} 天 ${hours} 小时`
  if (hours) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分`
}

function rangeLabel(skip, count, total) {
  if (!total) return '0 条'
  return `${skip + 1}–${skip + count} / ${total}`
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(String(text))
  } catch {
    error.value = '复制失败（浏览器未授予剪贴板权限）'
  }
}

onMounted(refreshAll)
</script>

<style scoped>
.mongo-admin { display: flex; flex-direction: column; gap: var(--asc-sp-4, 16px); padding: var(--asc-sp-4, 16px); }
.ma-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--asc-sp-3, 12px); flex-wrap: wrap; }
.ma-head h2 { margin: 0 0 4px; font-size: var(--asc-fs-h3, 18px); }
.ma-head p { margin: 0; color: var(--text-secondary); font-size: var(--asc-fs-small, 13px); }
.ma-head-actions { display: flex; align-items: center; gap: var(--asc-sp-2, 8px); }
.ma-conn { font-size: var(--asc-fs-caption, 12px); font-family: var(--asc-font-mono, monospace); color: var(--text-secondary); }
.ma-conn.is-ok { color: var(--asc-success, #10b981); }
.ma-error { padding: 8px 12px; border: 1px solid var(--asc-danger, #ef4444); border-radius: 8px; background: rgba(239, 68, 68, .08); font-size: var(--asc-fs-small, 13px); }
.ma-link { background: none; border: 0; padding: 0; color: var(--asc-primary, #3894ff); cursor: pointer; font-size: inherit; text-decoration: none; }
.ma-danger { color: var(--asc-danger, #ef4444); }
.ma-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--asc-sp-2, 8px); }
.ma-stat { padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; display: flex; flex-direction: column; gap: 4px; }
.ma-stat span { color: var(--text-secondary); font-size: var(--asc-fs-caption, 12px); }
.ma-stat strong { font-size: var(--asc-fs-body, 14px); font-family: var(--asc-font-mono, monospace); }
.ma-body { display: grid; grid-template-columns: 240px 1fr; gap: var(--asc-sp-3, 12px); align-items: start; }
.ma-side { border: 1px solid var(--border-color); border-radius: 8px; padding: var(--asc-sp-2, 8px); max-height: 640px; overflow: auto; }
.ma-side-title { font-size: var(--asc-fs-caption, 12px); color: var(--text-secondary); margin: 6px 4px; text-transform: uppercase; letter-spacing: .04em; }
.ma-side-item { display: flex; justify-content: space-between; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; font-size: var(--asc-fs-small, 13px); text-align: left; }
.ma-side-item:hover { background: rgba(127, 127, 127, .12); }
.ma-side-item.is-active { background: rgba(56, 148, 255, .16); }
.ma-side-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--asc-font-mono, monospace); }
.ma-side-item em { color: var(--text-secondary); font-style: normal; font-size: 11px; }
.ma-main { min-width: 0; display: flex; flex-direction: column; gap: var(--asc-sp-2, 8px); }
.ma-tabs { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.ma-tab { padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 999px; background: transparent; cursor: pointer; font-size: var(--asc-fs-small, 13px); }
.ma-tab.is-active { border-color: var(--asc-primary, #3894ff); color: var(--asc-primary, #3894ff); }
.ma-target { margin-left: auto; font-family: var(--asc-font-mono, monospace); font-size: 12px; color: var(--text-secondary); }
.ma-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ma-input { padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 6px; background: transparent; color: inherit; font-size: var(--asc-fs-small, 13px); }
.ma-input--narrow { max-width: 180px; }
.ma-textarea { width: 100%; margin-top: 6px; font-family: var(--asc-font-mono, monospace); }
.ma-advanced { border: 1px dashed var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: var(--asc-fs-small, 13px); }
.ma-advanced summary { cursor: pointer; color: var(--text-secondary); }
.ma-check { display: inline-flex; align-items: center; gap: 4px; font-size: var(--asc-fs-small, 13px); }
.ma-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--asc-fs-small, 13px); color: var(--text-secondary); }
.ma-chip { padding: 1px 8px; border: 1px solid var(--border-color); border-radius: 999px; font-size: 11px; color: var(--text-secondary); }
.ma-chip.is-public { border-color: var(--asc-success, #10b981); color: var(--asc-success, #10b981); }
.ma-table-wrap { overflow: auto; border: 1px solid var(--border-color); border-radius: 8px; }
.ma-table { width: 100%; border-collapse: collapse; font-size: var(--asc-fs-small, 13px); }
.ma-table th, .ma-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border-color); vertical-align: top; }
.ma-table th { color: var(--text-secondary); font-weight: 500; white-space: nowrap; }
.ma-mono { font-family: var(--asc-font-mono, monospace); font-size: 12px; }
.ma-dim { color: var(--text-secondary); }
.ma-summary { font-family: var(--asc-font-mono, monospace); font-size: 12px; word-break: break-all; }
.ma-filename { word-break: break-all; }
.ma-row-actions { white-space: nowrap; display: flex; gap: 10px; }
.ma-json { margin: 0; padding: 10px 12px; background: rgba(127, 127, 127, .08); border-radius: 6px; font-size: 12px; max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
.ma-pager { display: flex; align-items: center; gap: 12px; font-size: var(--asc-fs-small, 13px); color: var(--text-secondary); }
.ma-empty { text-align: center; color: var(--text-secondary); padding: 12px; }
@media (max-width: 900px) {
  .ma-body { grid-template-columns: 1fr; }
  .ma-side { max-height: 220px; }
}
</style>
