<template>
  <aside ref="rootElement" class="qa-session-toc" :class="{ 'is-collapsed': collapsed, 'is-narrow': narrow }" aria-label="会话目录" @keydown.esc.stop="dismiss" @keydown.tab="trapFocus">
    <button v-if="collapsed" ref="expandButton" type="button" class="qa-toc__expand" aria-label="展开会话历史" :aria-expanded="false" @click="collapsed = false">
      <span aria-hidden="true">☰</span><span>会话历史</span><span class="qa-toc__count">{{ sessions.length }}</span>
    </button>
    <template v-else>
      <button v-if="narrow" type="button" tabindex="-1" class="qa-toc__backdrop" aria-label="关闭会话历史" @click="collapse" />
      <div class="qa-toc__panel">
        <header class="qa-toc__header">
          <h3>会话历史 <span class="qa-toc__count">{{ sessions.length }}</span></h3>
          <button type="button" class="qa-toc__icon" aria-label="收起会话历史" :aria-expanded="true" @click="collapse">‹</button>
        </header>
        <button type="button" class="qa-toc__new" :disabled="locked" title="在当前图谱下开始一段新会话" @click="create"><span aria-hidden="true">＋</span> 新建会话</button>
        <div class="qa-toc__search">
          <input ref="searchInput" v-model="query" type="search" aria-label="搜索会话" placeholder="搜索会话标题或图谱" />
          <button v-if="query" type="button" class="qa-toc__clear" aria-label="清空会话搜索" @click="clearSearch">×</button>
        </div>
        <div class="qa-toc__scope">
          <span>{{ query.trim() ? `找到 ${matchedCount} 个会话` : '全部图谱 · 按最近更新' }}</span>
          <button type="button" :disabled="loading" aria-label="刷新会话列表" @click="reload">{{ loading ? '刷新中…' : '刷新' }}</button>
        </div>
        <div v-if="error" class="qa-toc__error" role="status">{{ error }}</div>
        <nav class="qa-toc__scroll" aria-label="历史会话列表" :aria-busy="loading">
          <section v-for="group in groups" :key="group.key" class="qa-toc__group">
            <button type="button" class="qa-toc__group-head" :class="{ 'is-open': isOpen(group.key) }" :aria-expanded="isOpen(group.key)" @click="toggleGroup(group.key)">
              <span class="qa-toc__chev" aria-hidden="true">›</span><span class="qa-toc__group-name" :title="group.label">{{ group.label }}</span><span class="qa-toc__count">{{ group.items.length }}</span>
            </button>
            <ul v-if="isOpen(group.key)" class="qa-toc__list">
              <li v-for="session in group.items" :key="session.sessionId" class="qa-toc__row" :class="{ 'is-active': session.sessionId === activeSessionId, 'has-menu': menuId === session.sessionId }">
                <button type="button" class="qa-toc__item" :aria-current="session.sessionId === activeSessionId ? 'true' : undefined" :disabled="locked" :title="session.title" @click="open(session)">
                  <span class="qa-toc__title">{{ session.title }}</span><span class="qa-toc__meta">{{ formatSessionTime(session.updatedAt) }} · {{ session.turns }} 轮</span>
                </button>
                <button type="button" class="qa-toc__more" :aria-label="`更多操作：${session.title}`" :aria-expanded="menuId === session.sessionId" :disabled="locked || deletingId === session.sessionId" @click.stop="menuId = menuId === session.sessionId ? '' : session.sessionId">⋯</button>
                <div v-if="menuId === session.sessionId" class="qa-toc__menu" role="group" aria-label="会话操作">
                  <button type="button" :disabled="locked || !!deletingId" @click="remove(session)">{{ deletingId === session.sessionId ? '删除中…' : '删除会话' }}</button>
                </div>
              </li>
            </ul>
          </section>
          <p v-if="!groups.length && !loading && !error" class="qa-toc__empty">{{ query.trim() ? '未找到匹配的会话，试试其他关键词或清空搜索。' : '暂无历史会话，发送第一条提问后会自动保存。' }}</p>
          <p v-if="loading && !groups.length" class="qa-toc__empty">加载中…</p>
        </nav>
        <p class="qa-toc__footnote">当前账号 · {{ mode === 'single' ? '深度研究' : '智能会话' }} · 最近100个会话</p>
      </div>
    </template>
  </aside>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { deleteAgentSession, listAgentSessions } from './api'
import { formatSessionTime, mapSessionList } from './sessions'

const props = defineProps({
  activeSessionId: { type: String, default: '' }, projects: { type: Array, default: () => [] },
  activeProjectId: { type: String, default: '' }, locked: { type: Boolean, default: false },
  refreshKey: { type: Number, default: 0 }, mode: { type: String, default: 'agent' },
})
const emit = defineEmits(['create', 'open', 'deleted'])
const sessions = ref([])
const loading = ref(false)
const error = ref('')
const query = ref('')
const collapsed = ref(false)
const narrow = ref(false)
const menuId = ref('')
const deletingId = ref('')
const rootElement = ref(null)
const expandButton = ref(null)
const searchInput = ref(null)
const openGroups = ref(new Set())
const UNASSIGNED = '__unassigned__'
let mediaQuery
let widthObserver
let requestVersion = 0

const projectName = projectId => {
  if (!projectId) return '未指定图谱'
  const project = props.projects.find(item => String(item?.projectId || '') === String(projectId))
  return String(project?.projectName || project?.name || projectId)
}
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().trim()
const groups = computed(() => {
  const buckets = new Map()
  const needle = normalize(query.value)
  for (const session of sessions.value) {
    const projectId = String(session?.workspace?.projectId || '')
    const label = projectName(projectId)
    if (needle && !normalize(`${session.title} ${label}`).includes(needle)) continue
    const key = projectId || UNASSIGNED
    if (!buckets.has(key)) buckets.set(key, { key, label, items: [] })
    buckets.get(key).items.push(session)
  }
  for (const group of buckets.values()) group.items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  return [...buckets.values()].sort((a, b) => String(b.items[0]?.updatedAt).localeCompare(String(a.items[0]?.updatedAt)))
})
const matchedCount = computed(() => groups.value.reduce((total, group) => total + group.items.length, 0))
const isOpen = key => !!query.value.trim() || openGroups.value.has(key)
function toggleGroup(key) {
  const next = new Set(openGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openGroups.value = next
}
async function collapse() {
  menuId.value = ''
  collapsed.value = true
  await nextTick()
  expandButton.value?.focus()
}
function dismiss(event) {
  if (menuId.value) {
    const trigger = event?.target?.closest?.('.qa-toc__row')?.querySelector('.qa-toc__more')
    menuId.value = ''
    trigger?.focus()
  }
  else void collapse()
}
function trapFocus(event) {
  if (!narrow.value || collapsed.value) return
  const panel = rootElement.value?.querySelector('.qa-toc__panel')
  const controls = [...(panel?.querySelectorAll('button:not(:disabled), input:not(:disabled)') || [])]
  const first = controls[0], last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
async function clearSearch() {
  query.value = ''
  await nextTick()
  searchInput.value?.focus()
}
function create() {
  if (props.locked) return
  emit('create')
  if (narrow.value) void collapse()
}
function open(session) {
  if (props.locked) return
  menuId.value = ''
  emit('open', { sessionId: session.sessionId, projectId: String(session?.workspace?.projectId || ''), graphId: String(session?.workspace?.graphId || '') })
  if (narrow.value) void collapse()
}
async function remove(session) {
  if (props.locked || deletingId.value) return
  if (!window.confirm(`删除会话「${session.title}」？该操作不可恢复。`)) return
  deletingId.value = session.sessionId
  error.value = ''
  try {
    await deleteAgentSession(session.sessionId)
    // An older list response must not resurrect a deleted row.
    requestVersion++
    loading.value = false
    sessions.value = sessions.value.filter(item => item.sessionId !== session.sessionId)
    menuId.value = ''
    emit('deleted', session.sessionId)
  } catch (cause) { error.value = cause?.message || '删除会话失败' }
  finally { deletingId.value = '' }
}
async function reload() {
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const payload = await listAgentSessions({ limit: 100, mode: props.mode === 'single' ? 'single' : 'agent' })
    if (version !== requestVersion) return
    sessions.value = mapSessionList(payload)
    const active = sessions.value.find(item => item.sessionId === props.activeSessionId)
    const key = active ? (String(active?.workspace?.projectId || '') || UNASSIGNED) : groups.value[0]?.key
    if (key) openGroups.value = new Set([...openGroups.value, key])
  } catch (cause) {
    if (version === requestVersion) error.value = cause?.message || '会话列表读取失败'
  } finally { if (version === requestVersion) loading.value = false }
}
function updateWidth(event) {
  if (narrow.value === event.matches) return
  narrow.value = event.matches
  collapsed.value = event.matches
  menuId.value = ''
}
function outsideClick(event) {
  if (!rootElement.value?.contains(event.target)) menuId.value = ''
}
watch(() => [props.refreshKey, props.activeProjectId, props.mode], () => { void reload() })
watch(() => props.activeSessionId, id => {
  menuId.value = ''
  const active = sessions.value.find(item => item.sessionId === id)
  if (active) openGroups.value = new Set([...openGroups.value, String(active?.workspace?.projectId || '') || UNASSIGNED])
})
watch(query, () => { menuId.value = '' })
watch(collapsed, async value => { if (!value && narrow.value) { await nextTick(); searchInput.value?.focus() } })
watch(() => props.locked, locked => { if (locked) menuId.value = '' })
onMounted(() => {
  // Measure the content area, not the viewport: the app sidebar, zoom and
  // evidence panel all reduce the room available to chat + history.
  if (typeof ResizeObserver !== 'undefined' && rootElement.value) {
    widthObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width
      if (width > 0) updateWidth({ matches: width <= 1200 })
    })
    widthObserver.observe(rootElement.value.closest?.('.qa-main') || rootElement.value.parentElement || rootElement.value)
  } else if (typeof window !== 'undefined' && window.matchMedia) {
    mediaQuery = window.matchMedia('(max-width: 1280px)')
    updateWidth(mediaQuery)
    mediaQuery.addEventListener('change', updateWidth)
  }
  if (typeof document !== 'undefined') document.addEventListener?.('pointerdown', outsideClick)
  void reload()
})
onUnmounted(() => {
  requestVersion++
  widthObserver?.disconnect()
  mediaQuery?.removeEventListener('change', updateWidth)
  if (typeof document !== 'undefined') document.removeEventListener?.('pointerdown', outsideClick)
})
defineExpose({ reload })
</script>

<style scoped>
.qa-session-toc { width: 264px; min-width: 264px; box-sizing: border-box; align-self: start; position: sticky; top: calc(var(--qa-topbar-h) + 16px); color: var(--qa-heading); }
.qa-toc__panel { display: flex; flex-direction: column; gap: 12px; max-height: calc(100dvh - var(--qa-topbar-h) - 140px); padding: 14px; box-sizing: border-box; border: 1px solid var(--qa-border-strong); border-radius: 14px; background: var(--qa-surface); box-shadow: var(--qa-shadow-panel); }
.qa-toc__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.qa-toc__header h3 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 14px; white-space: nowrap; }
.qa-toc__count { border-radius: 12px; padding: 1px 6px; color: var(--qa-muted); background: var(--qa-surface-soft); font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }
.qa-toc__icon, .qa-toc__expand, .qa-toc__more { border: 1px solid transparent; background: transparent; color: var(--qa-muted); cursor: pointer; font: inherit; }
.qa-toc__icon { width: 28px; height: 28px; border-radius: 6px; font-size: 24px; line-height: 1; }
.qa-toc__icon:hover, .qa-toc__more:hover { background: var(--qa-accent-soft); color: var(--qa-accent); }
.qa-toc__new { display: flex; gap: 6px; align-items: center; justify-content: center; flex: 0 0 auto; width: 100%; min-height: 36px; border: 1px solid var(--qa-accent); border-radius: 8px; background: var(--qa-accent); color: white; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.qa-toc__new:hover:not(:disabled) { background: var(--qa-accent-hover); }
.qa-toc__search { position: relative; }
.qa-toc__search input { width: 100%; min-width: 0; min-height: 34px; padding: 7px 30px 7px 10px; border: 1px solid var(--qa-border-strong); border-radius: 8px; background: var(--qa-surface); color: inherit; font: inherit; font-size: 12px; box-sizing: border-box; }
.qa-toc__search input::-webkit-search-cancel-button { display: none; }
.qa-toc__clear { position: absolute; right: 4px; top: 4px; width: 26px; height: 26px; border: 0; border-radius: 5px; background: transparent; color: var(--qa-muted); cursor: pointer; font-size: 17px; }
.qa-toc__scope { display: flex; justify-content: space-between; gap: 6px; align-items: center; color: var(--qa-muted); font-size: 11px; }
.qa-toc__scope button { border: 0; background: none; color: var(--qa-accent); font: inherit; cursor: pointer; padding: 3px 0; }
.qa-toc__scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 2px 42px 0; }
.qa-toc__group + .qa-toc__group { margin-top: 10px; }
.qa-toc__group-head { display: flex; align-items: center; gap: 6px; width: 100%; padding: 5px 2px; border: 0; background: none; color: var(--qa-muted); text-align: left; font: inherit; font-size: 11px; cursor: pointer; }
.qa-toc__group-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qa-toc__chev { transition: transform .15s; }
.qa-toc__group-head.is-open .qa-toc__chev { transform: rotate(90deg); }
.qa-toc__list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.qa-toc__row { position: relative; display: flex; align-items: center; min-width: 0; border-radius: 8px; border-left: 3px solid transparent; }
.qa-toc__row:hover, .qa-toc__row:focus-within, .qa-toc__row.has-menu { background: var(--qa-surface-soft); }
.qa-toc__row.is-active { background: var(--qa-accent-soft); border-left-color: var(--qa-accent); }
.qa-toc__item { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; padding: 10px 5px 10px 8px; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.qa-toc__title { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 1.5; font-weight: 500; }
.qa-toc__row.is-active .qa-toc__title { color: var(--qa-accent); font-weight: 600; }
.qa-toc__meta { font-size: 11px; color: var(--qa-muted); font-variant-numeric: tabular-nums; }
.qa-toc__more { flex: 0 0 28px; width: 28px; height: 30px; margin-right: 3px; border-radius: 6px; opacity: 0; font-size: 22px; }
.qa-toc__row:hover .qa-toc__more, .qa-toc__row:focus-within .qa-toc__more, .qa-toc__row.has-menu .qa-toc__more { opacity: 1; }
.qa-toc__menu { position: absolute; top: 43px; right: 3px; z-index: 2; padding: 4px; min-width: 108px; border: 1px solid var(--qa-border-strong); border-radius: 8px; background: var(--qa-surface); box-shadow: var(--qa-shadow-panel); }
.qa-toc__menu button { display: block; width: 100%; min-height: 32px; padding: 4px 10px; border: 0; border-radius: 5px; background: transparent; color: var(--qa-danger, #b91c1c); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.qa-toc__menu button:hover { background: #fff1f2; }
.qa-toc__error { padding: 8px; border-radius: 6px; background: #fff1f2; color: var(--qa-danger, #b91c1c); font-size: 12px; }
.qa-toc__empty { margin: 14px 4px; color: var(--qa-muted); font-size: 12px; line-height: 1.7; }
.qa-toc__footnote { flex: 0 0 auto; margin: 0; font-size: 10px; color: var(--qa-muted); }
.qa-toc__expand { display: flex; align-items: center; gap: 8px; min-height: 36px; max-width: 100%; padding: 8px 10px; border-color: var(--qa-border-strong); border-radius: 9px; background: var(--qa-surface); font-size: 12px; color: var(--qa-accent); white-space: nowrap; box-shadow: var(--qa-shadow-panel); }
.qa-session-toc.is-collapsed { width: auto; min-width: 0; }
.qa-session-toc :is(button, input):focus-visible { outline: 2px solid var(--qa-accent); outline-offset: 2px; }
.qa-session-toc button:disabled { cursor: not-allowed; opacity: .5; }
@media (hover: none) { .qa-toc__more { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .qa-toc__chev { transition: none; } }
.qa-session-toc.is-narrow { position: fixed; top: calc(var(--qa-topbar-h) + 10px); right: 16px; width: auto; min-width: 0; z-index: 100; }
.is-narrow .qa-toc__panel { position: fixed; z-index: 2; top: calc(var(--qa-topbar-h) + 12px); right: 12px; bottom: 12px; width: min(320px, calc(100vw - 24px)); max-height: none; }
.is-narrow .qa-toc__backdrop { position: fixed; inset: 0; z-index: 1; border: 0; padding: 0; background: rgb(15 23 42 / .22); }
.is-narrow .qa-toc__more { opacity: 1; }
</style>
