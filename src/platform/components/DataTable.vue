<template>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th v-for="col in columnDefs" :key="col.key">{{ col.label }}</th>
          <th>时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="data.length === 0">
          <td :colspan="columnDefs.length + 2" style="padding:40px;text-align:center;color:#888;">暂无数据</td>
        </tr>
        <tr v-for="(row, idx) in data" :key="getRowId(row) || idx"
            :class="{ 'editing-row': getRowId(row) === editingRowId }"
            :style="{ background: getRowId(row) === editingRowId ? '#fffbeb' : '' }">
          <!-- ================= 行内编辑模式 ================= -->
          <template v-if="getRowId(row) === editingRowId">
            <template v-if="table === 'mc'">
              <td><span class="id-badge">{{ getRowId(row) }}</span></td>
              <td><select v-model="editPayload.type" class="component-edit-input" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px">
                <option v-for="opt in ['支撑骨料','抗侵蚀原料','抗氧化剂','填充细粉','结合剂','水','其他']" :key="opt" :value="opt">{{ opt }}</option>
              </select></td>
              <td><input v-model="editPayload.batch_no" type="text" class="component-edit-input" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px" /></td>
              <td colspan="1">
                <ComponentListEditor v-model="editComponents" table-type="mc" :mc-options="mcOptions" :mp-options="mpOptions"
                  @open-create-mp="(i) => emit('openCreateMp', i)" @open-create-mc="emit('openCreateMc')" />
              </td>
            </template>
            <template v-else-if="table === 'mr'">
              <td><span class="id-badge">{{ getRowId(row) }}</span></td>
              <td><input v-model="editPayload.formula_name" type="text" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px" /></td>
              <td><select v-model="editPayload.formula_type" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px">
                <option v-for="opt in ['铁线配方','渣线配方','烧成带配方','过渡带配方','其他','未分类']" :key="opt" :value="opt">{{ opt }}</option>
              </select></td>
              <td><input v-model="editPayload.batch_no" type="text" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px" /></td>
              <td colspan="2">
                <ComponentListEditor v-model="editComponents" table-type="mr" :mc-options="mcOptions" :mp-options="mpOptions"
                  @open-create-mp="(i) => emit('openCreateMp', i)" @open-create-mc="emit('openCreateMc')" />
              </td>
            </template>
            <template v-else-if="table === 'mp'">
              <td><span class="id-badge">{{ getRowId(row) }}</span></td>
              <td colspan="2"><textarea v-model="editPayload.propertiesText" rows="6" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:4px;font-size:13px;font-family:monospace" placeholder="格式: 属性名: 值" /></td>
            </template>
            <template v-else-if="table === 'tp'">
              <td><span class="id-badge">{{ getRowId(row) }}</span></td>
              <td><select v-model="editPayload.test_condition" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px">
                <option value="无">无</option><option value="110C24H">110C24H</option><option value="1450C24H">1450C24H</option>
              </select></td>
              <td><textarea v-model="editPayload.test_resultsText" rows="6" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:4px;font-size:13px;font-family:monospace" placeholder="格式: 测试项: 值" /></td>
              <td><span>-</span></td>
            </template>
            <template v-else-if="table === 'fe'">
              <td><span class="id-badge">{{ getRowId(row) }}</span></td>
              <td><input v-model="editPayload.condition_name" type="text" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px" /></td>
              <td><input v-model="editPayload.condition_type" type="text" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px" /></td>
              <td><textarea v-model="editPayload.condition_params" rows="3" style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px;font-family:monospace" placeholder='{"温度": 1450}' /></td>
              <td><input v-model="editPayload.mr_ids" type="text" placeholder="MR_001,MR_002" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px;width:100%" /></td>
            </template>
            <template v-else-if="table === 'ru'">
              <td><span class="id-badge">{{ getRowId(row) }}</span></td>
              <td><input v-model="editPayload.service_name" type="text" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px" /></td>
              <td><input v-model="editPayload.service_type" type="text" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px" /></td>
              <td><textarea v-model="editPayload.service_params" rows="3" style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px;font-family:monospace" /></td>
              <td><input v-model="editPayload.fe_ids" type="text" placeholder="FE_001,FE_002" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px;width:100%" /></td>
              <td><input v-model="editPayload.mr_ids" type="text" placeholder="MR_001,MR_002" style="padding:6px;border:1px solid #e5e7eb;border-radius:4px;width:100%" /></td>
            </template>
            <td style="white-space:nowrap;font-size:12px;color:#6b7280;">
              <div>创建: {{ formatTime(row.create_time) }}</div><div>更新: {{ formatTime(row.update_time) }}</div>
            </td>
            <td><div class="action-buttons"><button class="btn btn-small" @click="handleSave">保存</button><button class="btn btn-secondary btn-small" @click="emit('cancelEdit')">取消</button></div></td>
          </template>
          <!-- ================= 只读模式 ================= -->
          <template v-else>
            <template v-if="table === 'mc'">
              <td><span class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'mc', row.mc_id)">{{ row.mc_id }}</span></td>
              <td>{{ row.type || '' }}</td><td>{{ row.batch_no || '' }}</td>
              <td><ul class="component-list" style="margin:0;padding:0;list-style:none">
                <li v-for="(comp, ci) in (Array.isArray(row.component_list) ? row.component_list : [])" :key="ci" class="component-item" :style="{ background: !comp[1] ? '#fef3c7' : '#f8fafc', padding:'4px 8px', marginBottom:'4px', borderRadius:'4px', fontSize:'13px' }">
                  <span style="font-weight:600">{{ comp[0] || '未知' }}</span><span style="color:var(--text-secondary);margin-left:8px">({{ comp[3] !== undefined ? comp[3] : 100 }}%)</span>
                  <span v-if="comp[1]" class="id-badge" style="margin-left:6px;cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', linkTypeOf(comp[1]), comp[1])">{{ comp[1] }}</span>
                </li>
              </ul></td>
            </template>
            <template v-else-if="table === 'mr'">
              <td><span class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'mr', row.mr_id)">{{ row.mr_id }}</span></td>
              <td>{{ row.formula_name || '' }}</td><td>{{ row.formula_type || '' }}</td><td>{{ row.batch_no || '' }}</td>
              <td><ul class="component-list" style="margin:0;padding:0;list-style:none">
                <li v-for="(comp, ci) in (Array.isArray(row.component_list) ? row.component_list : [])" :key="ci" :style="{ background: !comp[1] ? '#fef3c7' : '#f8fafc', padding:'4px 8px', marginBottom:'4px', borderRadius:'4px', fontSize:'13px' }">
                  <span style="font-weight:600">{{ comp[0] || '未知' }}</span><span style="color:var(--text-secondary);margin-left:8px">({{ comp[3] !== undefined ? comp[3] : 100 }}%)</span>
                  <span v-if="comp[1]" class="id-badge" style="margin-left:6px;cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', linkTypeOf(comp[1]), comp[1])">{{ comp[1] }}</span>
                </li>
              </ul></td>
              <td><template v-if="Array.isArray(row.tp_ids) && row.tp_ids.length"><span v-for="tp in row.tp_ids" :key="tp" class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'tp', tp)">{{ tp }}</span></template><span v-else>-</span></td>
            </template>
            <template v-else-if="table === 'mp'">
              <td><span class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'mp', row.mp_id)">{{ row.mp_id }}</span></td>
              <td><pre class="properties-display" style="margin:0">{{ renderPropsDisplay(row.fixed_properties, row.custom_properties, false) }}</pre></td>
              <td><template v-if="Array.isArray(row.mc_ids) && row.mc_ids.length"><span v-for="mc in row.mc_ids" :key="mc" class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'mc', mc)">{{ mc }}</span></template><span v-else>-</span></td>
            </template>
            <template v-else-if="table === 'tp'">
              <td><span class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'tp', row.tp_id)">{{ row.tp_id }}</span></td>
              <td>{{ row.test_condition || '无' }}</td>
              <td><pre class="properties-display" style="margin:0">{{ row.test_results ? renderPropsDisplay(row.test_results.fixed, row.test_results.custom, true) : '暂无测试结果' }}</pre></td>
              <td><template v-if="Array.isArray(row.mr_ids) && row.mr_ids.length"><span v-for="mr in row.mr_ids" :key="mr" class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'mr', mr)">{{ mr }}</span></template><span v-else>-</span></td>
            </template>
            <template v-else-if="table === 'fe'">
              <td><span class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'fe', row.fe_id)">{{ row.fe_id }}</span></td>
              <td>{{ row.condition_name || '' }}</td><td>{{ row.condition_type || '' }}</td>
              <td><pre class="properties-display" style="margin:0">{{ formatJson(row.condition_params) }}</pre></td>
              <td><template v-if="Array.isArray(row.mr_ids) && row.mr_ids.length"><span v-for="mr in row.mr_ids" :key="mr" class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'mr', mr)">{{ mr }}</span></template><span v-else>-</span></td>
            </template>
            <template v-else-if="table === 'ru'">
              <td><span class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'ru', row.ru_id)">{{ row.ru_id }}</span></td>
              <td>{{ row.service_name || '' }}</td><td>{{ row.service_type || '' }}</td>
              <td><pre class="properties-display" style="margin:0">{{ formatJson(row.service_params) }}</pre></td>
              <td><template v-if="Array.isArray(row.fe_ids) && row.fe_ids.length"><span v-for="fe in row.fe_ids" :key="fe" class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'fe', fe)">{{ fe }}</span></template><span v-else>-</span></td>
              <td><template v-if="Array.isArray(row.mr_ids) && row.mr_ids.length"><span v-for="mr in row.mr_ids" :key="mr" class="id-badge" style="cursor:pointer;text-decoration:underline;" @click="emit('jumpToTab', 'mr', mr)">{{ mr }}</span></template><span v-else>-</span></td>
            </template>
            <template v-else-if="table === 'lit'">
              <td><span class="id-badge">{{ row.lit_id }}</span></td><td>{{ row.title || '' }}</td><td>{{ row.authors || '' }}</td><td>{{ row.journal || '-' }}</td><td>{{ row.year || '-' }}</td><td>{{ row.doi || '-' }}</td><td>{{ row.entry_type || '-' }}</td>
              <td><span v-if="row.attachment"><a :href="'/api/attachment/' + row.attachment" target="_blank" class="btn btn-secondary btn-small">预览</a></span><span v-else>-</span></td>
            </template>
            <td style="white-space:nowrap;font-size:12px;color:#6b7280;"><div>创建: {{ formatTime(row.create_time) }}</div><div>更新: {{ formatTime(row.update_time) }}</div></td>
            <td><div class="action-buttons"><button class="btn btn-secondary btn-small" @click="emit('startEdit', row)">编辑</button><button class="btn btn-danger btn-small" @click="emit('delete', row)">删除</button></div></td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import ComponentListEditor from './ComponentListEditor.vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  table: { type: String, required: true },
  editingRowId: { type: String, default: null },
  mcOptions: { type: Array, default: () => [] },
  mpOptions: { type: Array, default: () => [] },
  pureProperties: { type: Array, default: () => [] },
  testProperties: { type: Array, default: () => [] },
})

const emit = defineEmits(['startEdit', 'cancelEdit', 'saveEdit', 'delete', 'jumpToTab', 'openCreateMp', 'openCreateMc'])

const columnDefs = computed(() => {
  switch (props.table) {
    case 'mc': return [
      { key: 'mc_id', label: 'ID' }, { key: 'type', label: '类型' },
      { key: 'batch_no', label: '批次号' }, { key: 'component_list', label: '成分' },
    ]
    case 'mr': return [
      { key: 'mr_id', label: 'ID' }, { key: 'formula_name', label: '名称' },
      { key: 'formula_type', label: '类型' }, { key: 'batch_no', label: '批次号' },
      { key: 'component_list', label: '成分' }, { key: 'tp_ids', label: '关联ID' },
    ]
    case 'mp': return [
      { key: 'mp_id', label: 'ID' }, { key: 'properties', label: '属性' }, { key: 'mc_ids', label: '关联ID' },
    ]
    case 'tp': return [
      { key: 'tp_id', label: 'ID' }, { key: 'test_condition', label: '测试条件' },
      { key: 'test_results', label: '内容' }, { key: 'mr_ids', label: '关联ID' },
    ]
    case 'fe': return [
      { key: 'fe_id', label: 'ID' }, { key: 'condition_name', label: '名称' },
      { key: 'condition_type', label: '类型' }, { key: 'condition_params', label: '参数' },
      { key: 'mr_ids', label: '关联ID' },
    ]
    case 'ru': return [
      { key: 'ru_id', label: 'ID' }, { key: 'service_name', label: '名称' },
      { key: 'service_type', label: '类型' }, { key: 'service_params', label: '参数' },
      { key: 'fe_ids', label: '关联工况ID' }, { key: 'mr_ids', label: '关联配方ID' },
    ]
    case 'lit': return [
      { key: 'lit_id', label: '文献ID' }, { key: 'title', label: '标题' },
      { key: 'authors', label: '作者' }, { key: 'journal', label: '期刊/会议' },
      { key: 'year', label: '年份' }, { key: 'doi', label: 'DOI' },
      { key: 'entry_type', label: '类型' }, { key: 'attachment', label: '附件' },
    ]
    default: return []
  }
})

const editPayload = ref({})
const editComponents = ref([])

watch(() => props.editingRowId, (newId) => {
  if (!newId) return
  const row = props.data.find(r => getRowId(r) === newId)
  if (!row) return
  initializeEdit(row)
}, { immediate: true })

function initializeEdit(row) {
  const payload = {}
  switch (props.table) {
    case 'mc': payload.type = row.type || '支撑骨料'; payload.batch_no = row.batch_no || ''; break
    case 'mr': payload.formula_name = row.formula_name || ''; payload.formula_type = row.formula_type || '铁线配方'; payload.batch_no = row.batch_no || ''; break
    case 'mp': payload.propertiesText = formatPropsToText(row.fixed_properties, row.custom_properties, false); break
    case 'tp': payload.test_condition = row.test_condition || '无'; payload.test_resultsText = row.test_results ? formatPropsToText(row.test_results.fixed, row.test_results.custom, true) : ''; break
    case 'fe': payload.condition_name = row.condition_name || ''; payload.condition_type = row.condition_type || ''; payload.condition_params = typeof row.condition_params === 'object' ? JSON.stringify(row.condition_params, null, 2) : (row.condition_params || '{}'); payload.mr_ids = Array.isArray(row.mr_ids) ? row.mr_ids.join(', ') : (row.mr_ids || ''); break
    case 'ru': payload.service_name = row.service_name || ''; payload.service_type = row.service_type || ''; payload.service_params = typeof row.service_params === 'object' ? JSON.stringify(row.service_params, null, 2) : (row.service_params || '{}'); payload.fe_ids = Array.isArray(row.fe_ids) ? row.fe_ids.join(', ') : (row.fe_ids || ''); payload.mr_ids = Array.isArray(row.mr_ids) ? row.mr_ids.join(', ') : (row.mr_ids || ''); break
  }
  editPayload.value = payload
  editComponents.value = normalizeComponentList(row.component_list)
}

function normalizeComponentList(list) {
  if (!list || !Array.isArray(list)) return [{ name: '', id: null, ratio: 100 }]
  return list.map(comp => {
    if (Array.isArray(comp)) return { name: comp[0] || '', id: comp[1] || null, ratio: comp[3] !== undefined ? comp[3] : 100 }
    return { name: '', id: null, ratio: 100 }
  })
}

function formatPropsToText(fixedProps, customProps, isTest) {
  const lines = []
  const defs = isTest ? props.testProperties : props.pureProperties
  if (fixedProps && Array.isArray(fixedProps)) {
    fixedProps.forEach((value, index) => {
      if (value !== -1 && value !== null && value !== undefined) {
        const def = defs[index]
        if (def) lines.push(`${def.label}: ${value}${def.unit ? ` ${def.unit}` : ''}`)
      }
    })
  }
  if (customProps && Array.isArray(customProps)) {
    customProps.forEach(prop => {
      if (prop.name && prop.value !== -1 && prop.value !== null && prop.value !== undefined) {
        lines.push(`${prop.name}: ${prop.value}`)
      }
    })
  }
  return lines.join('\n') || '暂无数据'
}

function parsePropsText(text, isTest) {
  const fixedProps = Array(32).fill(-1)
  const customProps = [{ name: '', value: -1 }, { name: '', value: -1 }, { name: '', value: -1 }, { name: '', value: -1 }]
  const defs = isTest ? props.testProperties : props.pureProperties
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let customIndex = 0
  lines.forEach(line => {
    const match = line.match(/^([^:]+):\s*(.+)$/)
    if (!match) return
    const label = match[1].trim()
    const numMatch = match[2].trim().match(/^([0-9.]+)/)
    if (numMatch) {
      const val = parseFloat(numMatch[1])
      if (!isNaN(val)) {
        const def = defs.find(p => p.label === label)
        if (def) { fixedProps[def.id] = val }
        else if (customIndex < 4) { customProps[customIndex] = { name: label, value: val }; customIndex++ }
      }
    }
  })
  return { fixed: fixedProps, custom: customProps }
}

function handleSave() {
  const payload = { ...editPayload.value }
  switch (props.table) {
    case 'mc': case 'mr':
      if (payload.propertiesText) {
        const parsed = parsePropsText(payload.propertiesText, false)
        payload.fixed_properties = parsed.fixed; payload.custom_properties = parsed.custom
        delete payload.propertiesText
      }
      payload.component_list = editComponents.value.map(item => [item.name, item.id || null, '{}', item.ratio])
      break
    case 'mp': {
      const parsed = parsePropsText(payload.propertiesText || '', false)
      payload.fixed_properties = parsed.fixed; payload.custom_properties = parsed.custom
      delete payload.propertiesText
      break
    }
    case 'tp': {
      const parsed = parsePropsText(payload.test_resultsText || '', true)
      payload.test_results = { fixed: parsed.fixed, custom: parsed.custom }
      delete payload.test_resultsText
      break
    }
    case 'fe':
      try { payload.condition_params = JSON.parse(payload.condition_params || '{}') } catch { payload.condition_params = {} }
      payload.mr_ids = (payload.mr_ids || '').split(',').map(s => s.trim()).filter(Boolean)
      break
    case 'ru':
      try { payload.service_params = JSON.parse(payload.service_params || '{}') } catch { payload.service_params = {} }
      payload.fe_ids = (payload.fe_ids || '').split(',').map(s => s.trim()).filter(Boolean)
      payload.mr_ids = (payload.mr_ids || '').split(',').map(s => s.trim()).filter(Boolean)
      break
  }
  emit('saveEdit', payload)
}

function getRowId(row) {
  switch (props.table) {
    case 'mc': return row.mc_id; case 'mr': return row.mr_id; case 'mp': return row.mp_id
    case 'tp': return row.tp_id; case 'fe': return row.fe_id; case 'ru': return row.ru_id; case 'lit': return row.lit_id
    default: return ''
  }
}

function linkTypeOf(id) { return id && id.startsWith('MC_') ? 'mc' : 'mp' }
function formatTime(time) { return time ? time.substring(0, 19) : '-' }

function formatJson(obj) {
  if (!obj) return '-'
  if (typeof obj === 'object') { try { return JSON.stringify(obj, null, 2) } catch { return String(obj) } }
  return String(obj)
}

function renderPropsDisplay(fixed, custom, isTest) { return formatPropsToText(fixed, custom, isTest) }

defineExpose({
  setEditingComponent(itemIndex, patch) {
    if (editComponents.value[itemIndex]) {
      editComponents.value[itemIndex] = { ...editComponents.value[itemIndex], ...patch }
    }
  },
  getEditingComponentInfo(itemIndex) {
    const item = editComponents.value[itemIndex]
    return { id: item?.id || '', mcId: props.table === 'mc' ? (props.editingRowId || '') : '', index: itemIndex }
  },
})
</script>

<style scoped>
.action-buttons { display: flex; gap: 8px; }
.properties-display { background: #f8fafc; padding: 8px 12px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; max-height: 150px; overflow-y: auto; }
.component-item { padding: 4px 8px; margin-bottom: 4px; border-radius: 4px; font-size: 13px; }
</style>