<template>
  <div class="acc">
    <!-- 顶部：标题 + 汇总 + 操作 -->
    <header class="acc__head">
      <div class="acc__title">
        <h1>验收测试<span class="acc__year">[2026]</span></h1>
        <p class="acc__sub">
          依据 <code>report_2026/ASC26年验收准备_v1</code>：4 项合同工作 + 2 项额外工作 + 11 份交付材料（模板 01–11）。
          可点击运行自动核验；人工项在本页留档确认。
        </p>
        <p class="acc__path" :title="registry?.acceptDir">材料目录：{{ registry?.acceptDir || '加载中…' }}</p>
      </div>

      <div class="acc__actions">
        <div class="acc__stats">
          <span class="acc-chip acc-chip--pass">通过 {{ summary.pass }}</span>
          <span class="acc-chip acc-chip--fail">未通过 {{ summary.fail }}</span>
          <span class="acc-chip acc-chip--manual">人工 {{ summary.manual }}</span>
          <span v-if="summary.error" class="acc-chip acc-chip--error">异常 {{ summary.error }}</span>
          <span class="acc-chip acc-chip--muted">共 {{ summary.total }} / {{ registry?.totals.checks || 0 }}</span>
        </div>
        <div class="acc__btns">
          <button type="button" class="acc-btn acc-btn--primary" :disabled="running || !registry" @click="runAll(false)">
            {{ running ? '运行中…' : '▶ 运行全部' }}
          </button>
          <button type="button" class="acc-btn" :disabled="running || !registry" @click="runAll(true)">
            仅运行自动项
          </button>
          <button type="button" class="acc-btn" :disabled="running" @click="clearResults">清空结果</button>
        </div>
        <p v-if="ranAt" class="acc__ran">最近一次运行：{{ ranAt }}</p>
      </div>
    </header>

    <!-- 分类分组 -->
    <section v-for="category in registry?.categories || []" :key="category.key" class="acc__section">
      <header class="acc__section-head">
        <h2>{{ category.label }}</h2>
        <span class="acc__hint">{{ category.hint }}</span>
        <span class="acc__section-stat">
          通过 {{ categoryStat(category).pass }} / {{ categoryStat(category).total }}
        </span>
      </header>

      <article v-for="item in category.items" :key="item.id" class="acc-card">
        <header class="acc-card__head">
          <h3>{{ item.title }}</h3>
          <span class="acc-card__badge" :class="itemBadge(item).cls">{{ itemBadge(item).text }}</span>
        </header>

        <dl class="acc-card__meta">
          <div><dt>合同指标</dt><dd>{{ item.metric }}</dd></div>
          <div><dt>实测 / 预期</dt><dd>{{ item.expect }}</dd></div>
          <div v-if="item.evidence?.length"><dt>证据</dt><dd><code v-for="e in item.evidence" :key="e" class="acc-card__ev">{{ e }}</code></dd></div>
        </dl>

        <ul class="acc-checks">
          <li v-for="check in item.checks" :key="check.id" class="acc-check" :class="`is-${statusOf(check)}`">
            <span class="acc-check__dot" aria-hidden="true" />
            <div class="acc-check__body">
              <div class="acc-check__line">
                <span class="acc-check__label">{{ check.label }}</span>
                <span v-if="check.manual" class="acc-check__tag">人工</span>
                <span class="acc-check__status">{{ statusText(statusOf(check)) }}</span>
                <button v-if="!check.manual" type="button" class="acc-check__run"
                        :disabled="running || runningId === check.id"
                        @click="runOne(check.id)">
                  {{ runningId === check.id ? '运行中…' : '运行' }}
                </button>
                <button v-else type="button" class="acc-check__run acc-check__run--manual" @click="toggleManual(check.id)">
                  {{ manualState[check.id] ? '取消确认' : '标记已确认' }}
                </button>
              </div>
              <p v-if="resultOf(check)?.detail || check.note" class="acc-check__detail">
                {{ (resultOf(check)?.detail) || check.note }}
              </p>
              <p v-if="manualState[check.id] && manualNote[check.id]" class="acc-check__note">
                确认备注：{{ manualNote[check.id] }}
              </p>
              <details v-if="resultOf(check)?.output" class="acc-check__output">
                <summary>输出（{{ resultOf(check)?.durationMs }} ms）</summary>
                <pre>{{ resultOf(check).output }}</pre>
              </details>
            </div>
          </li>
        </ul>
      </article>
    </section>

    <p v-if="errorMsg" class="acc__error" role="alert">{{ errorMsg }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { getAcceptanceChecks, runAcceptanceCheck, streamAcceptanceRun } from '../api/acceptance'

const registry = ref(null)
const results = reactive({})       // checkId -> 结果
const running = ref(false)
const runningId = ref('')
const ranAt = ref('')
const errorMsg = ref('')
let streamHandle = null

/* 人工确认（如发明专利受理通知书、实物试验）—— 存 localStorage 以便验收当天留档 */
const MANUAL_KEY = 'acceptance2026.manual'
const manualState = reactive({})
const manualNote = reactive({})

function loadManual() {
  try {
    const saved = JSON.parse(localStorage.getItem(MANUAL_KEY) || '{}')
    Object.entries(saved).forEach(([id, entry]) => {
      manualState[id] = !!entry?.confirmed
      manualNote[id] = entry?.note || ''
    })
  } catch { /* 忽略损坏的本地记录 */ }
}

function persistManual() {
  const payload = {}
  Object.keys({ ...manualState, ...manualNote }).forEach((id) => {
    payload[id] = { confirmed: !!manualState[id], note: manualNote[id] || '' }
  })
  try { localStorage.setItem(MANUAL_KEY, JSON.stringify(payload)) } catch { /* 存不下就算了 */ }
}

function toggleManual(id) {
  manualState[id] = !manualState[id]
  if (manualState[id] && manualNote[id] === undefined) manualNote[id] = ''
  persistManual()
  if (manualState[id]) {
    results[id] = { id, status: 'pass', detail: `人工确认（${new Date().toLocaleString()}）`, manualConfirmed: true }
  } else {
    delete results[id]
  }
}

const allChecks = computed(() => (registry.value?.categories || []).flatMap((c) => c.items.flatMap((i) => i.checks)))

function statusOf(check) {
  const result = results[check.id]
  if (result?.status) return result.status
  return check.manual ? (manualState[check.id] ? 'pass' : 'pending') : 'pending'
}

function statusText(status) {
  return { pass: '通过', fail: '未通过', manual: '待人工', error: '异常', pending: '未运行' }[status] || status
}

function resultOf(check) {
  return results[check.id]
}

const summary = computed(() => {
  const acc = { total: 0, pass: 0, fail: 0, manual: 0, error: 0 }
  for (const check of allChecks.value) {
    const status = statusOf(check)
    if (status === 'pending') continue
    acc.total += 1
    if (status === 'pass') acc.pass += 1
    else if (status === 'fail') acc.fail += 1
    else if (status === 'error') acc.error += 1
    else acc.manual += 1
  }
  return acc
})

function categoryStat(category) {
  const checks = category.items.flatMap((i) => i.checks)
  const done = checks.filter((c) => statusOf(c) !== 'pending')
  return { total: checks.length, pass: done.filter((c) => statusOf(c) === 'pass').length }
}

function itemBadge(item) {
  const checks = item.checks
  const manualOnly = checks.every((c) => c.manual)
  const statuses = checks.map((c) => statusOf(c))
  if (statuses.some((s) => s === 'fail' || s === 'error')) return { text: '未通过', cls: 'is-fail' }
  if (statuses.every((s) => s === 'pass')) return { text: '已达标', cls: 'is-pass' }
  if (statuses.some((s) => s === 'pass')) return { text: '部分通过', cls: 'is-partial' }
  return manualOnly ? { text: '待人工确认', cls: 'is-manual' } : { text: '未运行', cls: 'is-pending' }
}

function applyResult(result) {
  if (!result?.id) return
  results[result.id] = result
}

async function runOne(id) {
  errorMsg.value = ''
  runningId.value = id
  try {
    applyResult(await runAcceptanceCheck(id))
  } catch (error) {
    errorMsg.value = `运行 ${id} 失败：${error?.message || error}`
  } finally {
    runningId.value = ''
  }
}

function runAll(autoOnly) {
  if (running.value) return
  errorMsg.value = ''
  running.value = true
  const only = autoOnly ? allChecks.value.filter((c) => !c.manual).map((c) => c.id) : null
  streamHandle = streamAcceptanceRun(
    only ? { only } : {},
    applyResult,
    () => { running.value = false; ranAt.value = new Date().toLocaleString() },
    (error) => { running.value = false; errorMsg.value = `批量运行失败：${error?.message || error}` },
  )
}

function clearResults() {
  Object.keys(results).forEach((id) => { if (!results[id]?.manualConfirmed) delete results[id] })
  if (streamHandle?.abort) streamHandle.abort()
  running.value = false
  ranAt.value = ''
}

onMounted(async () => {
  loadManual()
  try {
    registry.value = await getAcceptanceChecks()
  } catch (error) {
    errorMsg.value = `验收清单加载失败：${error?.message || error}`
  }
})
</script>

<style scoped>
.acc { display: flex; flex-direction: column; gap: var(--asc-sp-4); padding-bottom: var(--asc-sp-6); }

.acc__head {
  display: flex; flex-wrap: wrap; gap: var(--asc-sp-4); justify-content: space-between; align-items: flex-start;
  padding: var(--asc-sp-4); border: 1px solid var(--asc-border); border-radius: var(--asc-radius-lg);
  background: var(--asc-grad-brand-soft);
}
.acc__title h1 { margin: 0; font-size: var(--asc-fs-h1); color: var(--asc-heading); }
.acc__year { color: var(--asc-primary); font-weight: 800; }
.acc__sub { margin: var(--asc-sp-2) 0 0; max-width: 62ch; font-size: var(--asc-fs-small); color: var(--asc-text); line-height: var(--asc-lh-body); }
.acc__path { margin: var(--asc-sp-2) 0 0; font-size: var(--asc-fs-micro); color: var(--asc-muted); word-break: break-all; }
.acc__actions { display: flex; flex-direction: column; gap: var(--asc-sp-2); align-items: flex-end; }
.acc__stats { display: flex; flex-wrap: wrap; gap: var(--asc-sp-1); }
.acc-chip { padding: 2px var(--asc-sp-2); border-radius: var(--asc-radius-pill); font-size: var(--asc-fs-caption); border: 1px solid var(--asc-border); }
.acc-chip--pass { color: var(--asc-success); border-color: var(--asc-success); background: var(--asc-success-soft); }
.acc-chip--fail, .acc-chip--error { color: var(--asc-danger); border-color: var(--asc-danger); }
.acc-chip--manual { color: var(--asc-warning); border-color: var(--asc-warning); background: var(--asc-warning-soft); }
.acc-chip--muted { color: var(--asc-muted); }
.acc__btns { display: flex; gap: var(--asc-sp-2); }
.acc-btn {
  padding: var(--asc-sp-1) var(--asc-sp-3); border: 1px solid var(--asc-border-strong);
  border-radius: var(--asc-control-radius); background: var(--asc-surface); color: var(--asc-text);
  font-size: var(--asc-fs-small); cursor: pointer; transition: background var(--asc-transition-base);
}
.acc-btn:hover:not(:disabled) { background: var(--asc-primary-soft); }
.acc-btn:disabled { opacity: .55; cursor: not-allowed; }
.acc-btn--primary { background: var(--asc-primary); border-color: var(--asc-primary); color: #fff; }
.acc-btn--primary:hover:not(:disabled) { background: var(--asc-primary-hover); }
.acc__ran { margin: 0; font-size: var(--asc-fs-micro); color: var(--asc-muted); }

.acc__section { display: flex; flex-direction: column; gap: var(--asc-sp-3); }
.acc__section-head { display: flex; align-items: baseline; gap: var(--asc-sp-2); border-bottom: 1px solid var(--asc-hairline); padding-bottom: var(--asc-sp-1); }
.acc__section-head h2 { margin: 0; font-size: var(--asc-fs-h2); color: var(--asc-heading); }
.acc__hint { font-size: var(--asc-fs-caption); color: var(--asc-muted); }
.acc__section-stat { margin-left: auto; font-size: var(--asc-fs-caption); color: var(--asc-muted); }

.acc-card { border: 1px solid var(--asc-border); border-radius: var(--asc-radius); background: var(--asc-surface); padding: var(--asc-sp-3); }
.acc-card__head { display: flex; align-items: center; gap: var(--asc-sp-2); }
.acc-card__head h3 { margin: 0; font-size: var(--asc-fs-h3); color: var(--asc-heading); }
.acc-card__badge { margin-left: auto; padding: 1px var(--asc-sp-2); border-radius: var(--asc-radius-pill); font-size: var(--asc-fs-micro); border: 1px solid var(--asc-border); }
.acc-card__badge.is-pass { color: var(--asc-success); border-color: var(--asc-success); background: var(--asc-success-soft); }
.acc-card__badge.is-fail { color: var(--asc-danger); border-color: var(--asc-danger); }
.acc-card__badge.is-partial { color: var(--asc-warning); border-color: var(--asc-warning); }
.acc-card__badge.is-manual { color: var(--asc-warning); border-color: var(--asc-warning); background: var(--asc-warning-soft); }
.acc-card__badge.is-pending { color: var(--asc-muted); }

.acc-card__meta { margin: var(--asc-sp-2) 0; display: grid; gap: var(--asc-sp-1); }
.acc-card__meta div { display: grid; grid-template-columns: 92px 1fr; gap: var(--asc-sp-2); }
.acc-card__meta dt { font-size: var(--asc-fs-caption); color: var(--asc-muted); }
.acc-card__meta dd { margin: 0; font-size: var(--asc-fs-small); color: var(--asc-text); }
.acc-card__ev { display: inline-block; margin: 0 var(--asc-sp-2) 0 0; font-size: var(--asc-fs-micro); color: var(--asc-muted); }

.acc-checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--asc-sp-1); }
.acc-check { display: flex; gap: var(--asc-sp-2); padding: var(--asc-sp-2); border-radius: var(--asc-control-radius); background: var(--asc-surface-soft); }
.acc-check__dot { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: var(--asc-border-strong); flex: 0 0 auto; }
.acc-check.is-pass .acc-check__dot { background: var(--asc-success); }
.acc-check.is-fail .acc-check__dot, .acc-check.is-error .acc-check__dot { background: var(--asc-danger); }
.acc-check.is-manual .acc-check__dot { background: var(--asc-warning); }
.acc-check__body { flex: 1 1 auto; min-width: 0; }
.acc-check__line { display: flex; align-items: center; gap: var(--asc-sp-2); flex-wrap: wrap; }
.acc-check__label { font-size: var(--asc-fs-small); color: var(--asc-heading); }
.acc-check__tag { font-size: var(--asc-fs-micro); color: var(--asc-warning); border: 1px solid var(--asc-warning); border-radius: var(--asc-radius-pill); padding: 0 6px; }
.acc-check__status { font-size: var(--asc-fs-micro); color: var(--asc-muted); }
.acc-check__run { margin-left: auto; padding: 1px var(--asc-sp-2); font-size: var(--asc-fs-micro); border: 1px solid var(--asc-border-strong); border-radius: var(--asc-control-radius); background: #fff; cursor: pointer; }
.acc-check__run--manual { border-color: var(--asc-warning); color: var(--asc-warning); }
.acc-check__detail { margin: var(--asc-sp-1) 0 0; font-size: var(--asc-fs-micro); color: var(--asc-text); word-break: break-all; }
.acc-check__note { margin: 2px 0 0; font-size: var(--asc-fs-micro); color: var(--asc-primary); }
.acc-check__output summary { font-size: var(--asc-fs-micro); color: var(--asc-muted); cursor: pointer; }
.acc-check__output pre { margin: var(--asc-sp-1) 0 0; padding: var(--asc-sp-2); background: #0b2437; color: #d8ecfb; border-radius: var(--asc-control-radius); font-size: var(--asc-fs-micro); max-height: 220px; overflow: auto; white-space: pre-wrap; }
.acc__error { margin: 0; padding: var(--asc-sp-2); border-radius: var(--asc-radius); background: #fff5f5; color: var(--asc-danger); font-size: var(--asc-fs-small); }
</style>
