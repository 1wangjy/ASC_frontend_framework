<template>
  <section class="um">
    <header class="um-head">
      <div>
        <h2>用户管理</h2>
        <p>注册审批、角色与状态维护、密码重置。未审批账号无法登录。</p>
      </div>
      <div class="um-stats">
        <span class="um-chip">共 {{ counts.total }}</span>
        <span class="um-chip" :class="{ 'is-warn': counts.pending > 0 }">待审批 {{ counts.pending }}</span>
        <span class="um-chip is-ok">正常 {{ counts.approved }}</span>
        <span class="um-chip">禁用 {{ counts.disabled }}</span>
      </div>
    </header>

    <div v-if="error" class="um-error">{{ error }}</div>

    <div class="um-toolbar">
      <div class="um-tabs" role="tablist">
        <button
          v-for="tab in TABS"
          :key="tab.value"
          class="um-tab"
          :class="{ 'is-active': filters.status === tab.value }"
          role="tab"
          :aria-selected="filters.status === tab.value"
          @click="setStatus(tab.value)"
        >{{ tab.label }}<em v-if="tab.value === 'pending' && counts.pending">{{ counts.pending }}</em></button>
      </div>
      <input
        v-model="filters.keyword"
        class="um-input"
        type="search"
        placeholder="搜索用户名 / 邮箱 / 姓名"
        @keyup.enter="load(1)"
      />
      <button class="um-btn" :disabled="loading" @click="load(1)">{{ loading ? '查询中…' : '查询' }}</button>
      <button class="um-btn um-btn--ghost" :disabled="loading" @click="openCreate()">新建用户</button>
    </div>

    <div v-if="showCreate" class="um-create">
      <input v-model="draft.username" class="um-input" placeholder="用户名（必填）" />
      <input v-model="draft.email" class="um-input" placeholder="邮箱（留空则用 用户名@local）" />
      <input v-model="draft.real_name" class="um-input" placeholder="姓名（选填）" />
      <input v-model="draft.password" class="um-input" type="password" placeholder="初始密码（≥8 位）" />
      <label class="um-check"><input v-model="draft.isAdmin" type="checkbox" /> 管理员</label>
      <button class="um-btn" :disabled="saving" @click="submitCreate">{{ saving ? '创建中…' : '创建' }}</button>
      <button class="um-btn um-btn--ghost" @click="showCreate = false">取消</button>
    </div>

    <div class="um-table pl-scroll">
      <table>
        <thead>
          <tr>
            <th>用户名</th><th>邮箱</th><th>姓名</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in items" :key="user.id" :class="`is-${user.status}`">
            <td>{{ user.username }}</td>
            <td class="um-mono">{{ user.email || '—' }}</td>
            <td>{{ user.real_name || '—' }}</td>
            <td>
              <span class="um-badge" :class="user.role === 'admin' ? 'is-admin' : ''">{{ user.role === 'admin' ? '管理员' : '普通用户' }}</span>
            </td>
            <td>
              <span class="um-badge" :class="`is-${user.status}`">{{ STATUS_LABEL[user.status] || user.status }}</span>
              <em v-if="user.status === 'disabled' && user.locked_until" class="um-note">锁定至 {{ user.locked_until }}</em>
            </td>
            <td class="um-mono">{{ user.last_login_at || '—' }}</td>
            <td class="um-actions">
              <button v-if="user.status !== 'approved'" class="um-btn um-btn--mini" @click="act('approve', user)">通过</button>
              <button v-if="user.status !== 'rejected'" class="um-btn um-btn--mini um-btn--ghost" @click="act('reject', user)">拒绝</button>
              <button v-if="user.status === 'approved'" class="um-btn um-btn--mini um-btn--ghost" @click="act('disable', user)">禁用</button>
              <button v-if="user.status === 'disabled'" class="um-btn um-btn--mini" @click="act('enable', user)">启用</button>
              <button class="um-btn um-btn--mini um-btn--ghost" @click="act('reset', user)">重置密码</button>
              <button
                class="um-btn um-btn--mini um-btn--ghost"
                :disabled="user.role === 'admin'"
                @click="act('demote', user)"
              >改角色</button>
              <button class="um-btn um-btn--mini um-btn--danger" @click="act('delete', user)">删除</button>
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="7" class="um-empty">{{ loading ? '加载中…' : '没有符合条件的用户' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="um-foot">
      <span>共 {{ total }} 条</span>
      <div class="um-pager">
        <button class="um-btn um-btn--mini um-btn--ghost" :disabled="page <= 1" @click="load(page - 1)">上一页</button>
        <span>{{ page }} / {{ totalPages }}</span>
        <button class="um-btn um-btn--mini um-btn--ghost" :disabled="page >= totalPages" @click="load(page + 1)">下一页</button>
      </div>
      <span v-if="lastResetPassword" class="um-reset">新密码：<code>{{ lastResetPassword }}</code>（请立即转告用户）</span>
    </footer>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '../../store/auth.js'
import {
  approveUser, createUser, deleteUser, getUsers, rejectUser, resetUserPassword, updateUser,
} from '../../platform/api/user.js'

const authStore = useAuthStore()

const TABS = [
  { value: 'pending', label: '待审批' },
  { value: 'approved', label: '正常' },
  { value: 'disabled', label: '已禁用' },
  { value: 'rejected', label: '已拒绝' },
  { value: '', label: '全部' },
]

const STATUS_LABEL = { pending: '待审批', approved: '正常', rejected: '已拒绝', disabled: '已禁用' }

const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const counts = reactive({ total: 0, pending: 0, approved: 0, disabled: 0, rejected: 0 })
const filters = reactive({ status: 'pending', keyword: '' })
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const showCreate = ref(false)
const draft = reactive({ username: '', email: '', real_name: '', password: '', isAdmin: false })
const lastResetPassword = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function describe(error_, fallback) {
  const payload = error_?.response?.data
  return payload?.message || error_?.message || fallback
}

async function load(nextPage = page.value) {
  loading.value = true
  error.value = ''
  try {
    const data = await getUsers({ status: filters.status, keyword: filters.keyword, page: nextPage, pageSize })
    items.value = data?.items || []
    total.value = data?.total || 0
    page.value = data?.page || nextPage
    if (data?.counts) Object.assign(counts, data.counts)
  } catch (e) {
    error.value = describe(e, '加载用户列表失败')
  } finally {
    loading.value = false
  }
}

function setStatus(value) {
  filters.status = value
  load(1)
}

function openCreate() {
  Object.assign(draft, { username: '', email: '', real_name: '', password: '', isAdmin: false })
  showCreate.value = true
}

async function submitCreate() {
  if (!draft.username.trim() || !draft.password) {
    error.value = '用户名与初始密码必填'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await createUser({
      username: draft.username.trim(),
      email: draft.email.trim(),
      real_name: draft.real_name.trim(),
      password: draft.password,
      role: draft.isAdmin ? 'admin' : 'user',
    })
    showCreate.value = false
    await load(1)
  } catch (e) {
    error.value = describe(e, '创建用户失败')
  } finally {
    saving.value = false
  }
}

async function act(action, user) {
  error.value = ''
  lastResetPassword.value = ''
  try {
    if (action === 'approve') await approveUser(user.id, '管理页审批通过')
    else if (action === 'reject') await rejectUser(user.id, '管理页审批拒绝')
    else if (action === 'enable') await updateUser(user.id, { status: 'approved' })
    else if (action === 'disable') await updateUser(user.id, { status: 'disabled' })
    else if (action === 'demote') await updateUser(user.id, { role: user.role === 'admin' ? 'user' : 'admin' })
    else if (action === 'reset') {
      const data = await resetUserPassword(user.id)
      lastResetPassword.value = data?.password || ''
    } else if (action === 'delete') {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`确认删除用户「${user.username}」？（软删除，可后台恢复）`)) return
      await deleteUser(user.id)
    }
    if (user.id === authStore.currentUser?.id) await authStore.refreshSession()
    await load()
  } catch (e) {
    error.value = describe(e, '操作失败')
  }
}

onMounted(() => load(1))
</script>

<style scoped>
.um {
  display: flex;
  flex-direction: column;
  gap: var(--asc-sp-4, 16px);
  padding: var(--asc-sp-5, 24px);
  color: var(--asc-text, #e6ebf2);
}

.um-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--asc-sp-4, 16px);
  flex-wrap: wrap;
}

.um-head h2 {
  margin: 0 0 var(--asc-sp-1, 4px);
  font-size: var(--asc-fs-h3, 20px);
  color: var(--asc-heading, #f5f7fa);
}

.um-head p {
  margin: 0;
  font-size: var(--asc-fs-small, 13px);
  color: var(--asc-muted, #94a3b8);
}

.um-stats { display: flex; gap: var(--asc-sp-2, 8px); flex-wrap: wrap; }

.um-chip,
.um-badge {
  padding: 2px var(--asc-sp-2, 8px);
  border: 1px solid var(--asc-border, rgba(255, 255, 255, 0.14));
  border-radius: 999px;
  font-size: var(--asc-fs-caption, 12px);
  color: var(--asc-muted, #94a3b8);
}

.um-chip.is-warn { border-color: var(--asc-warning, #f0b429); color: var(--asc-warning, #f0b429); }
.um-chip.is-ok { border-color: var(--asc-success, #35d07f); color: var(--asc-success, #35d07f); }

.um-error {
  padding: var(--asc-sp-2, 8px) var(--asc-sp-3, 12px);
  border: 1px solid var(--asc-danger, #ff5d5d);
  border-radius: var(--asc-control-radius, 10px);
  background: rgba(255, 93, 93, 0.1);
  color: var(--asc-danger, #ff5d5d);
}

.um-toolbar,
.um-create {
  display: flex;
  gap: var(--asc-sp-2, 8px);
  align-items: center;
  flex-wrap: wrap;
}

.um-create {
  padding: var(--asc-sp-3, 12px);
  border: 1px dashed var(--asc-border, rgba(255, 255, 255, 0.16));
  border-radius: var(--asc-control-radius, 10px);
}

.um-tabs {
  display: flex;
  gap: var(--asc-sp-1, 4px);
  padding: var(--asc-sp-1, 4px);
  border: 1px solid var(--asc-border, rgba(255, 255, 255, 0.14));
  border-radius: var(--asc-control-radius, 10px);
}

.um-tab {
  padding: var(--asc-sp-1, 4px) var(--asc-sp-3, 12px);
  border: 0;
  border-radius: calc(var(--asc-control-radius, 10px) - 2px);
  background: transparent;
  color: var(--asc-muted, #94a3b8);
  font-size: var(--asc-fs-small, 13px);
  cursor: pointer;
}

.um-tab.is-active { background: var(--asc-primary-soft, rgba(56, 148, 255, 0.16)); color: var(--asc-heading, #f5f7fa); }
.um-tab em { margin-left: var(--asc-sp-1, 4px); font-style: normal; color: var(--asc-warning, #f0b429); }

.um-input {
  padding: var(--asc-sp-2, 8px) var(--asc-sp-3, 12px);
  border: 1px solid var(--asc-border, rgba(255, 255, 255, 0.14));
  border-radius: var(--asc-control-radius, 10px);
  background: var(--asc-canvas, #0b1120);
  color: var(--asc-text, #e6ebf2);
  font-size: var(--asc-fs-small, 13px);
  outline: none;
}

.um-input:focus { border-color: var(--asc-primary, #3894ff); }

.um-btn {
  padding: var(--asc-sp-2, 8px) var(--asc-sp-3, 12px);
  border: 1px solid transparent;
  border-radius: var(--asc-control-radius, 10px);
  background: var(--asc-primary, #3894ff);
  color: #fff;
  font-size: var(--asc-fs-small, 13px);
  cursor: pointer;
  transition: var(--asc-transition-base, all 0.2s ease);
}

.um-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.um-btn--ghost { background: transparent; border-color: var(--asc-border, rgba(255, 255, 255, 0.16)); color: var(--asc-text, #e6ebf2); }
.um-btn--danger { background: transparent; border-color: var(--asc-danger, #ff5d5d); color: var(--asc-danger, #ff5d5d); }
.um-btn--mini { padding: 2px var(--asc-sp-2, 8px); font-size: var(--asc-fs-caption, 12px); }

.um-check { display: inline-flex; align-items: center; gap: var(--asc-sp-1, 4px); font-size: var(--asc-fs-small, 13px); color: var(--asc-muted, #94a3b8); }

.um-table { overflow: auto; border: 1px solid var(--asc-border, rgba(255, 255, 255, 0.12)); border-radius: var(--asc-radius, 16px); }
.um-table table { width: 100%; border-collapse: collapse; font-size: var(--asc-fs-small, 13px); }
.um-table th,
.um-table td { padding: var(--asc-sp-2, 8px) var(--asc-sp-3, 12px); text-align: left; border-bottom: 1px solid var(--asc-border, rgba(255, 255, 255, 0.08)); }
.um-table th { color: var(--asc-muted, #94a3b8); font-weight: 500; }
.um-table tr.is-disabled td { opacity: 0.6; }
.um-mono { font-family: var(--asc-font-mono, monospace); }
.um-note { display: block; font-style: normal; font-size: var(--asc-fs-micro, 11px); color: var(--asc-warning, #f0b429); }

.um-badge.is-pending { border-color: var(--asc-warning, #f0b429); color: var(--asc-warning, #f0b429); }
.um-badge.is-approved { border-color: var(--asc-success, #35d07f); color: var(--asc-success, #35d07f); }
.um-badge.is-rejected,
.um-badge.is-disabled { border-color: var(--asc-danger, #ff5d5d); color: var(--asc-danger, #ff5d5d); }
.um-badge.is-admin { border-color: var(--asc-primary, #3894ff); color: var(--asc-primary, #3894ff); }

.um-actions { display: flex; gap: var(--asc-sp-1, 4px); flex-wrap: wrap; }
.um-empty { text-align: center; color: var(--asc-muted, #94a3b8); }
.um-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--asc-sp-3, 12px); flex-wrap: wrap; color: var(--asc-muted, #94a3b8); font-size: var(--asc-fs-small, 13px); }
.um-pager { display: flex; align-items: center; gap: var(--asc-sp-2, 8px); }
.um-reset code { color: var(--asc-success, #35d07f); font-family: var(--asc-font-mono, monospace); }
</style>
