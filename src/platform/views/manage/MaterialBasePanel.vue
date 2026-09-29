<template>
  <div class="mb-panel">
    <div class="mb-head">
      <div>
        <h3 class="mb-title">原料 base 名管理</h3>
        <p class="mb-sub">
          规范名 ↔ 模型 <code>material_id</code>（one-hot 位 <code>material_id__&lt;id&gt;_frac</code>）。
          不合规的名称无法入表；可新建映射规则使其入表。
        </p>
      </div>
      <div class="mb-stats">
        <span class="mb-chip">共 {{ stats.total }}</span>
        <span class="mb-chip mb-chip--ok">已映射 {{ stats.mapped }}</span>
        <span class="mb-chip" :class="{ 'mb-chip--warn': stats.unmapped > 0 }">未映射 {{ stats.unmapped }}</span>
      </div>
    </div>

    <div v-if="error" class="mb-error">{{ error }}</div>

    <div class="mb-cols">
      <!-- 左：base 列表 + 新增 -->
      <section class="mb-col pl-eqcol">
        <div class="mb-sec-head">
          <strong>注册表</strong>
          <input v-model="keyword" class="mb-input" type="search" placeholder="搜索 base 名 / material_id / 别名" @keyup.enter="load">
        </div>

        <div class="mb-add">
          <input v-model="newBase.base_name" class="mb-input" placeholder="base 规范名（必填）">
          <input v-model="newBase.material_id" class="mb-input mb-input--narrow" placeholder="material_id">
          <input v-model="newBase.aliases" class="mb-input" placeholder="别名（逗号分隔）">
          <button class="btn" :disabled="saving || !newBase.base_name.trim()" @click="submitBase">
            {{ saving ? '保存中…' : '新增 / 更新 base' }}
          </button>
        </div>

        <div class="mb-table pl-scroll">
          <table>
            <thead>
              <tr><th>规范名</th><th>material_id</th><th>别名</th><th>来源</th><th>启用</th></tr>
            </thead>
            <tbody>
              <tr v-for="base in bases" :key="base.base_id" :class="{ 'is-off': !base.enabled }">
                <td>{{ base.base_name }}</td>
                <td><code>{{ base.material_id || '—' }}</code></td>
                <td class="mb-aliases">{{ base.aliases.join('、') || '—' }}</td>
                <td>{{ base.source }}</td>
                <td>
                  <button class="mb-link" @click="toggleBase(base)">{{ base.enabled ? '停用' : '启用' }}</button>
                </td>
              </tr>
              <tr v-if="!bases.length"><td colspan="5" class="mb-empty">无匹配记录</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 右：规则 + 解析预览 + 词表 -->
      <section class="mb-col pl-eqcol">
        <div class="mb-sec-head"><strong>映射规则</strong><span class="mb-hint">priority 小的先匹配</span></div>
        <div class="mb-add">
          <select v-model="newRule.kind" class="mb-input mb-input--narrow">
            <option v-for="kind in RULE_KINDS" :key="kind" :value="kind">{{ kind }}</option>
          </select>
          <input v-model="newRule.pattern" class="mb-input" placeholder="匹配内容（如 高铝铝土）">
          <select v-model="newRule.target_base_id" class="mb-input">
            <option value="">→ 选择目标 base</option>
            <option v-for="base in bases" :key="base.base_id" :value="base.base_id">{{ base.base_name }}</option>
          </select>
          <button class="btn" :disabled="saving || !newRule.pattern.trim() || !newRule.target_base_id" @click="submitRule">新增规则</button>
        </div>

        <div class="mb-table pl-scroll">
          <table>
            <thead><tr><th>kind</th><th>pattern</th><th>→ base</th><th>优先级</th><th>启用</th><th></th></tr></thead>
            <tbody>
              <tr v-for="rule in rules" :key="rule.rule_id" :class="{ 'is-off': !rule.enabled }">
                <td>{{ rule.kind }}</td>
                <td class="mb-pattern">{{ rule.pattern }}</td>
                <td>{{ rule.base_name || rule.target_base_id }}</td>
                <td>{{ rule.priority }}</td>
                <td><button class="mb-link" @click="toggleRule(rule)">{{ rule.enabled ? '停用' : '启用' }}</button></td>
                <td><button class="mb-link mb-link--danger" @click="deleteRule(rule)">删除</button></td>
              </tr>
              <tr v-if="!rules.length"><td colspan="6" class="mb-empty">暂无规则</td></tr>
            </tbody>
          </table>
        </div>

        <div class="mb-sec-head"><strong>解析预览</strong></div>
        <div class="mb-add">
          <input v-model="probe" class="mb-input" placeholder="输入原料名，如 325目棕刚玉" @keyup.enter="runProbe">
          <button class="btn btn-ghost" @click="runProbe">解析</button>
        </div>
        <div v-if="probeResult" class="mb-probe">
          <template v-if="probeResult.resolved">
            命中 <code>{{ probeResult.via }}</code> → <strong>{{ probeResult.base.base_name }}</strong>
            <code>{{ probeResult.base.material_id || '无 material_id' }}</code>
          </template>
          <template v-else>
            未命中（不臆造）。候选：{{ probeResult.suggestions.join('、') || '—' }}
          </template>
        </div>

        <div class="mb-sec-head"><strong>变体词表</strong><span class="mb-hint">未覆盖的 material_id 其 one-hot 位恒为 0</span></div>
        <div class="mb-vocab">
          <span v-for="v in vocab" :key="v.variant" class="mb-chip">{{ v.variant }} · {{ v.size }}</span>
          <span v-if="!vocab.length" class="mb-empty">未刷新词表</span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import {
  addMaterialBaseRule, listMaterialBaseRules, listMaterialBases, listMaterialVocab,
  removeMaterialBaseRule, resolveMaterialName, setMaterialBaseEnabled, setMaterialBaseRuleEnabled,
  upsertMaterialBase,
} from '../../api/materialBase'

const RULE_KINDS = ['alias', 'exact', 'normalize', 'keyword', 'regex']

const bases = ref([])
const rules = ref([])
const vocab = ref([])
const stats = ref({ total: 0, mapped: 0, unmapped: 0 })
const keyword = ref('')
const error = ref('')
const saving = ref(false)
const newBase = ref({ base_name: '', material_id: '', aliases: '' })
const newRule = ref({ kind: 'alias', pattern: '', target_base_id: '', priority: 50 })
const probe = ref('')
const probeResult = ref(null)

async function load() {
  error.value = ''
  try {
    const payload = await listMaterialBases({ keyword: keyword.value || undefined })
    bases.value = payload.bases || []
    stats.value = payload.stats || { total: 0, mapped: 0, unmapped: 0 }
  } catch (e) {
    error.value = e?.response?.data?.message || e.message
  }
}

async function loadRules() {
  try { rules.value = (await listMaterialBaseRules())?.rules || [] } catch (e) { error.value = e.message }
}

async function loadVocab() {
  try { vocab.value = (await listMaterialVocab())?.variants || [] } catch (e) { error.value = e.message }
}

async function submitBase() {
  saving.value = true
  try {
    await upsertMaterialBase({
      base_name: newBase.value.base_name.trim(),
      material_id: newBase.value.material_id.trim(),
      aliases: newBase.value.aliases,
    })
    newBase.value = { base_name: '', material_id: '', aliases: '' }
    await load()
  } catch (e) {
    error.value = e?.response?.data?.message || e.message
  } finally { saving.value = false }
}

async function toggleBase(base) {
  await setMaterialBaseEnabled(base.base_id, !base.enabled)
  await load()
}

async function submitRule() {
  saving.value = true
  try {
    await addMaterialBaseRule({ ...newRule.value, pattern: newRule.value.pattern.trim() })
    newRule.value = { kind: 'alias', pattern: '', target_base_id: '', priority: 50 }
    await loadRules()
  } catch (e) {
    error.value = e?.response?.data?.message || e.message
  } finally { saving.value = false }
}

async function toggleRule(rule) {
  await setMaterialBaseRuleEnabled(rule.rule_id, !rule.enabled)
  await loadRules()
}

async function deleteRule(rule) {
  await removeMaterialBaseRule(rule.rule_id)
  await loadRules()
}

async function runProbe() {
  if (!probe.value.trim()) return
  try { probeResult.value = await resolveMaterialName(probe.value.trim()) } catch (e) { error.value = e.message }
}

onMounted(async () => { await Promise.all([load(), loadRules(), loadVocab()]) })
</script>

<style scoped>
.mb-panel { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.mb-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.mb-title { margin: 0 0 4px; font-size: 15px; }
.mb-sub { margin: 0; color: #60758b; font-size: 12px; line-height: 1.7; }
.mb-sub code { background: #eef4fb; padding: 0 4px; border-radius: 4px; }
.mb-stats { display: flex; gap: 6px; }
.mb-chip { padding: 3px 9px; border: 1px solid #dfe9f3; border-radius: 999px; background: #f4f8fc; color: #4a6480; font-size: 12px; }
.mb-chip--ok { background: #e7f7ef; border-color: #bfe9d3; color: #0e7a4c; }
.mb-chip--warn { background: #fdf3e4; border-color: #f0d9b4; color: #b26a14; }
.mb-error { padding: 8px 10px; border: 1px solid #f0c9c9; border-radius: 8px; background: #fdf3f3; color: #a33; font-size: 12.5px; }

.mb-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; min-height: 0; }
@media (max-width: 1100px) { .mb-cols { grid-template-columns: minmax(0, 1fr); } }
.mb-col { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.mb-sec-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #33506b; }
.mb-hint { color: #8296a8; font-size: 11.5px; }

.mb-add { display: flex; flex-wrap: wrap; gap: 6px; }
.mb-input { height: 30px; padding: 0 9px; border: 1px solid #dbe5ef; border-radius: 7px; font-size: 12.5px; background: #fff; min-width: 120px; flex: 1 1 140px; }
.mb-input--narrow { flex: 0 0 96px; }
.mb-table { border: 1px solid #e3ebf3; border-radius: 10px; background: #fff; overflow: auto; max-height: 320px; }
.mb-table table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.mb-table th { position: sticky; top: 0; background: #f6f9fc; text-align: left; font-weight: 650; color: #45607a; padding: 7px 9px; border-bottom: 1px solid #e8eff6; }
.mb-table td { padding: 6px 9px; border-bottom: 1px solid #f1f5f9; color: #40566d; }
.mb-table tr.is-off td { color: #9aabb9; }
.mb-aliases, .mb-pattern { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mb-empty { color: #8296a8; text-align: center; padding: 14px 0; }
.mb-link { border: 0; background: none; color: var(--asc-primary); cursor: pointer; font-size: 12px; padding: 0; }
.mb-link--danger { color: #c34646; }
.mb-probe { padding: 8px 10px; border: 1px solid #e3ebf3; border-radius: 8px; background: #f8fbfd; font-size: 12.5px; color: #40566d; }
.mb-vocab { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
