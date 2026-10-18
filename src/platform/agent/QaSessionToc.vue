<template>
  <aside class="qa-session-toc" aria-label="会话目录">
    <button
      type="button"
      class="qa-toc__new"
      :disabled="locked"
      title="在当前图谱下开始一段新对话"
      @click="emit('create')"
    >
      <span class="qa-toc__new-plus" aria-hidden="true">+</span>
      新建对话
    </button>

    <div v-if="error" class="qa-toc__error">{{ error }}</div>

    <div class="qa-toc__scroll" role="navigation">
      <section v-for="group in groups" :key="group.key" class="qa-toc__group">
        <button
          type="button"
          class="qa-toc__group-head"
          :class="{ 'is-open': isOpen(group.key) }"
          :aria-expanded="isOpen(group.key)"
          @click="toggleGroup(group.key)"
        >
          <span class="qa-toc__group-name" :title="group.label">{{ group.label }}</span>
          <span class="qa-toc__group-count">{{ group.items.length }}</span>
          <span class="qa-toc__chev" aria-hidden="true">›</span>
        </button>
        <ul v-show="isOpen(group.key)" class="qa-toc__list">
          <li v-for="session in group.items" :key="session.sessionId" class="qa-toc__row">
            <button
              type="button"
              class="qa-toc__item"
              :class="{ 'is-active': session.sessionId === activeSessionId }"
              :aria-current="session.sessionId === activeSessionId ? 'true' : undefined"
              :disabled="locked"
              :title="session.title"
              @click="open(session)"
            >
              <span class="qa-toc__title">{{ session.title }}</span>
              <span class="qa-toc__meta">{{ session.turns }} 轮 · {{ formatSessionTime(session.updatedAt) }}</span>
            </button>
            <button
              type="button"
              class="qa-toc__remove"
              :disabled="locked"
              title="删除该会话"
              aria-label="删除该会话"
              @click.stop="remove(session)"
            >×</button>
          </li>
          <li v-if="!group.items.length" class="qa-toc__empty">暂无对话</li>
        </ul>
      </section>
      <p v-if="!groups.length && !loading" class="qa-toc__empty">还没有历史对话：发送第一条提问后会自动保存。</p>
      <p v-if="loading && !groups.length" class="qa-toc__empty">加载中…</p>
    </div>
  </aside>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { deleteAgentSession, listAgentSessions } from './api'
import { formatSessionTime, mapSessionList } from './sessions'

const props = defineProps({
  activeSessionId: { type: String, default: '' },
  projects: { type: Array, default: () => [] },
  activeProjectId: { type: String, default: '' },
  locked: { type: Boolean, default: false },
  refreshKey: { type: Number, default: 0 },
})

const emit = defineEmits(['create', 'open', 'deleted'])

const sessions = ref([])
const loading = ref(false)
const error = ref('')
const UNASSIGNED = '__unassigned__'
const openGroups = ref(new Set())

const projectName = (projectId) => {
  if (!projectId) return '未指定图谱'
  const match = props.projects.find((project) => String(project?.projectId || '') === String(projectId))
  return String(match?.projectName || match?.name || projectId)
}

/** workspace（projectId）分组：组内按最近更新排序，组间按组内最新时间排序。 */
const groups = computed(() => {
  const buckets = new Map()
  for (const session of sessions.value) {
    const projectId = String(session?.workspace?.projectId || '')
    const key = projectId || UNASSIGNED
    if (!buckets.has(key)) buckets.set(key, { key, projectId: projectId || '', label: projectName(projectId), items: [] })
    buckets.get(key).items.push(session)
  }
  for (const bucket of buckets.values()) {
    bucket.items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }
  return [...buckets.values()].sort((a, b) => {
    const left = a.items[0]?.updatedAt || ''
    const right = b.items[0]?.updatedAt || ''
    return String(right).localeCompare(String(left))
  })
})

function isOpen(key) {
  return openGroups.value.has(key)
}

function toggleGroup(key) {
  const next = new Set(openGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openGroups.value = next
}

function open(session) {
  if (props.locked) return
  emit('open', {
    sessionId: session.sessionId,
    projectId: String(session?.workspace?.projectId || ''),
    graphId: String(session?.workspace?.graphId || ''),
  })
}

async function remove(session) {
  if (props.locked) return
  if (!window.confirm(`删除会话「${session.title}」？该操作不可恢复。`)) return
  try {
    await deleteAgentSession(session.sessionId)
    sessions.value = sessions.value.filter((item) => item.sessionId !== session.sessionId)
    emit('deleted', session.sessionId)
  } catch (cause) {
    error.value = cause?.message || '删除会话失败'
  }
}

async function reload() {
  loading.value = true
  error.value = ''
  try {
    const payload = await listAgentSessions({ limit: 100 })
    sessions.value = mapSessionList(payload)
    // 默认展开：当前会话所属分组；没有当前会话时展开最新一组
    const active = sessions.value.find((item) => item.sessionId === props.activeSessionId)
    const targetKey = active
      ? (String(active?.workspace?.projectId || '') || UNASSIGNED)
      : (groups.value[0]?.key || '')
    if (targetKey) openGroups.value = new Set([...openGroups.value, targetKey])
  } catch (cause) {
    error.value = cause?.message || '会话列表读取失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.refreshKey, () => { void reload() })
watch(() => props.activeProjectId, () => { void reload() })
watch(() => props.activeSessionId, (id) => {
  if (!id) return
  const active = sessions.value.find((item) => item.sessionId === id)
  const key = active ? (String(active?.workspace?.projectId || '') || UNASSIGNED) : ''
  if (key) openGroups.value = new Set([...openGroups.value, key])
})

onMounted(reload)

defineExpose({ reload })
</script>

<style scoped>
.qa-session-toc {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--qa-space-3);
  position: sticky;
  top: calc(var(--qa-topbar-h) + var(--qa-space-4));
  max-height: calc(100vh - var(--qa-topbar-h) - var(--qa-space-6));
  padding: var(--qa-space-3);
  border: 1px solid var(--qa-border-strong);
  border-radius: var(--qa-radius-container);
  background: var(--qa-surface);
  box-shadow: var(--qa-shadow-panel);
  overflow: hidden;
}

.qa-toc__new {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: var(--qa-control-h);
  padding: 0 var(--qa-control-pad-x);
  border: 1px solid var(--qa-accent);
  border-radius: var(--qa-radius-control);
  background: var(--qa-accent);
  color: #fff;
  font: inherit;
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-bold);
  cursor: pointer;
}

.qa-toc__new:hover:not(:disabled) { background: var(--qa-accent-hover); border-color: var(--qa-accent-hover); }
.qa-toc__new:disabled { opacity: .55; cursor: not-allowed; }
.qa-toc__new-plus { font-size: 15px; line-height: 1; }

.qa-toc__error {
  flex: 0 0 auto;
  padding: 6px 8px;
  border: 1px solid var(--qa-danger, #b91c1c);
  border-radius: 6px;
  color: var(--qa-danger, #b91c1c);
  font-size: var(--qa-font-xs, 12px);
}

.qa-toc__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--qa-space-2);
  margin-right: -4px;
  padding-right: 4px;
}

.qa-toc__group { display: flex; flex-direction: column; gap: 2px; }

.qa-toc__group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--qa-muted);
  font: inherit;
  font-size: var(--qa-font-xs, 12px);
  font-weight: var(--qa-weight-semibold);
  cursor: pointer;
  text-align: left;
}
.qa-toc__group-head:hover { background: var(--qa-accent-soft); color: var(--qa-heading); }
.qa-toc__group-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qa-toc__group-count { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.qa-toc__chev {
  flex: 0 0 auto;
  display: inline-block;
  transition: transform .15s ease;
  transform: rotate(0deg);
}
.qa-toc__group-head.is-open .qa-toc__chev { transform: rotate(90deg); }

.qa-toc__list { list-style: none; margin: 0; padding: 0 0 2px 6px; display: flex; flex-direction: column; gap: 2px; }

.qa-toc__row { display: flex; align-items: stretch; gap: 2px; border-radius: 6px; }
.qa-toc__row:hover { background: var(--qa-accent-soft); }

.qa-toc__item {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.qa-toc__item.is-active { background: var(--qa-accent-soft); }
.qa-toc__item.is-active .qa-toc__title { color: var(--qa-accent); }
.qa-toc__item:disabled { cursor: not-allowed; opacity: .6; }

.qa-toc__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-semibold);
  color: var(--qa-heading);
}
.qa-toc__meta { color: var(--qa-muted); font-size: var(--qa-font-xs, 11px); font-variant-numeric: tabular-nums; }

.qa-toc__remove {
  flex: 0 0 auto;
  width: 22px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--qa-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity .12s ease;
}
.qa-toc__row:hover .qa-toc__remove { opacity: 1; }
.qa-toc__remove:hover { color: var(--qa-danger, #b91c1c); }
.qa-toc__remove:disabled { cursor: not-allowed; }

.qa-toc__empty { margin: 4px 6px; color: var(--qa-muted); font-size: var(--qa-font-xs, 12px); }

@media (max-width: 1100px) {
  .qa-session-toc {
    position: static;
    max-height: none;
    order: -1;
  }
  .qa-toc__scroll { max-height: 260px; }
}
</style>
