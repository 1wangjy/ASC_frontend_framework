<template>
  <div v-if="visible" class="brd-overlay" @click.self="$emit('close')">
    <div class="brd-card">
      <header class="brd-head">
        <h3>新建 base 映射规则</h3>
        <button class="brd-close" type="button" aria-label="关闭" @click="$emit('close')">✕</button>
      </header>

      <p class="brd-lead">
        原料名 <code>{{ payload.raw || '—' }}</code> 未映射到规范 base，因此无法入表。
        选择一条规则即可让它入库并正确落到预测模型的 one-hot 位。
      </p>

      <div v-if="payload.unresolved?.length > 1" class="brd-more">
        本次共 {{ payload.unresolved.length }} 个未映射原料：
        {{ payload.unresolved.map((u) => u.raw).join('、') }}（规则按名称逐一匹配）
      </div>

      <div class="brd-row">
        <label>规则类型</label>
        <select v-model="form.kind" class="brd-input">
          <option v-for="kind in KINDS" :key="kind" :value="kind">{{ kind }}</option>
        </select>
      </div>
      <div class="brd-row">
        <label>匹配内容</label>
        <input v-model="form.pattern" class="brd-input" placeholder="如 高铝铝土 或 铝土（keyword）">
      </div>
      <div class="brd-row">
        <label>指向 base</label>
        <select v-model="form.target_base_id" class="brd-input">
          <option value="">选择目标 base</option>
          <option v-for="base in bases" :key="base.base_id" :value="base.base_id">
            {{ base.base_name }}{{ base.material_id ? `（${base.material_id}）` : '（无 material_id）' }}
          </option>
        </select>
      </div>
      <div class="brd-row">
        <label>优先级</label>
        <input v-model.number="form.priority" class="brd-input brd-input--narrow" type="number" min="1" max="999">
      </div>

      <div v-if="payload.suggestions?.length" class="brd-sug">
        候选（按相似度）：<button v-for="s in payload.suggestions" :key="s" type="button" class="brd-sug__item" @click="useSuggestion(s)">{{ s }}</button>
      </div>

      <div v-if="error" class="brd-error">{{ error }}</div>

      <footer class="brd-foot">
        <button class="btn btn-ghost" type="button" @click="$emit('close')">取消</button>
        <button class="btn" type="button" :disabled="saving || !form.pattern.trim() || !form.target_base_id" @click="submit">
          {{ saving ? '创建中…' : '创建规则并重试入库' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { addMaterialBaseRule, listMaterialBases } from '../api/materialBase'

const props = defineProps({
  visible: { type: Boolean, default: false },
  payload: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['close', 'created'])

const KINDS = ['alias', 'exact', 'normalize', 'keyword', 'regex']
const bases = ref([])
const saving = ref(false)
const error = ref('')
const form = ref({ kind: 'alias', pattern: '', target_base_id: '', priority: 50 })

async function loadBases() {
  try { bases.value = (await listMaterialBases({}))?.bases?.filter((b) => b.enabled) || [] } catch { bases.value = [] }
}

function prefill() {
  const template = props.payload?.ruleTemplate || {}
  form.value = {
    kind: template.kind || 'alias',
    pattern: template.pattern || props.payload?.raw || '',
    target_base_id: '',
    priority: template.priority || 50,
  }
  error.value = ''
}

function useSuggestion(name) {
  const hit = bases.value.find((b) => b.base_name === name)
  if (hit) form.value.target_base_id = hit.base_id
}

watch(() => props.visible, (visible) => { if (visible) { prefill(); loadBases() } })
onMounted(() => { if (props.visible) { prefill(); loadBases() } })

async function submit() {
  saving.value = true
  error.value = ''
  try {
    const rule = await addMaterialBaseRule({
      kind: form.value.kind,
      pattern: form.value.pattern.trim(),
      target_base_id: form.value.target_base_id,
      priority: Number(form.value.priority) || 50,
    })
    emit('created', rule)
  } catch (e) {
    error.value = e?.response?.data?.message || e.message || '创建失败'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.brd-overlay { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: rgba(7, 25, 43, 0.45); backdrop-filter: blur(3px); }
.brd-card { width: min(520px, 100%); max-height: 88vh; overflow: auto; padding: 18px 20px; border-radius: 14px; background: #fff; box-shadow: 0 24px 60px rgba(6, 42, 74, 0.28); }
.brd-head { display: flex; align-items: center; justify-content: space-between; }
.brd-head h3 { margin: 0; font-size: 15px; }
.brd-close { border: 0; background: none; cursor: pointer; color: #7b8fa3; font-size: 14px; }
.brd-lead { margin: 8px 0 10px; color: #40566d; font-size: 12.5px; line-height: 1.75; }
.brd-lead code { background: #eef4fb; padding: 0 4px; border-radius: 4px; }
.brd-more { margin-bottom: 8px; padding: 7px 9px; border-radius: 8px; background: #fdf7ec; color: #8a6a2f; font-size: 12px; }
.brd-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.brd-row label { flex: 0 0 72px; color: #55708a; font-size: 12.5px; }
.brd-input { flex: 1 1 auto; height: 32px; padding: 0 9px; border: 1px solid #dbe5ef; border-radius: 8px; font-size: 12.5px; }
.brd-input--narrow { flex: 0 0 90px; }
.brd-sug { margin: 4px 0 10px; color: #55708a; font-size: 12px; }
.brd-sug__item { margin: 0 4px; padding: 2px 8px; border: 1px solid #dbe5ef; border-radius: 999px; background: #f6f9fc; cursor: pointer; font-size: 12px; }
.brd-error { margin-bottom: 8px; color: #c34646; font-size: 12.5px; }
.brd-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
</style>
