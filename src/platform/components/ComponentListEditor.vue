<template>
  <div class="component-edit-container">
    <div v-for="(item, index) in modelValue" :key="index" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      <input type="text" placeholder="成分名称" :value="item.name" style="width:140px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:4px;font-size:13px"
        @input="updateItem(index, 'name', $event.target.value)" />
      <div style="position:relative">
        <input type="text" placeholder="绑定 MP/MC ID..." :value="item.id || ''" style="width:180px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:4px;font-size:13px"
          @focus="activeDropdown = { itemIndex: index, filter: '' }"
          @input="activeDropdown = { itemIndex: index, filter: $event.target.value }"
          @blur="setTimeout(() => activeDropdown = null, 150)" />
        <div v-if="activeDropdown && activeDropdown.itemIndex === index" class="search-dropdown" style="position:absolute;top:100%;left:0;z-index:30;width:300px">
          <div v-if="tableType === 'mc'" class="search-dropdown-item create-option" style="padding:8px 12px;cursor:pointer;color:#6366f1;font-size:13px"
            @mousedown.prevent="emit('openCreateMp', index)">+ 添加/修改物性数据 (MP)</div>
          <div class="search-dropdown-item create-option" style="padding:8px 12px;cursor:pointer;color:#6366f1;font-size:13px"
            @mousedown.prevent="emit('openCreateMc')">+ 新建原料数据 (MC)</div>
          <template v-if="dropdownOptions.length > 0">
            <div style="padding:4px 8px;font-size:11px;color:#6b7280;background:#f9fafb">可选关联</div>
            <div v-for="opt in dropdownOptions" :key="opt.id" class="search-dropdown-item" style="padding:8px 12px;cursor:pointer;font-size:13px"
              @mousedown.prevent="selectOption(index, opt)">
              <template v-if="opt.mpId"><span :title="getMpInfoText(opt.mpId)" style="color:#6366f1;cursor:help;text-decoration:underline dotted">{{ opt.mpId }}</span></template>
              <span v-else>{{ opt.label }}</span>
            </div>
          </template>
        </div>
      </div>
      <input type="number" placeholder="比例" :value="item.ratio" style="width:80px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:4px;font-size:13px"
        @input="updateItem(index, 'ratio', Number($event.target.value) || 0)" />
      <button class="btn btn-danger btn-small" @click="removeItem(index)">移除</button>
    </div>
    <button class="btn btn-secondary btn-small" @click="addItem">+ 添加成分</button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: { type: Array, required: true },
  tableType: { type: String, required: true },
  mcOptions: { type: Array, default: () => [] },
  mpOptions: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'openCreateMp', 'openCreateMc'])
const activeDropdown = ref(null)

function updateItem(index, field, value) {
  const list = props.modelValue.map((item, i) => i === index ? { ...item, [field]: value } : item)
  emit('update:modelValue', list)
}

function removeItem(index) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}

function addItem() {
  emit('update:modelValue', [...props.modelValue, { name: '', id: null, ratio: 100 }])
}

const dropdownOptions = computed(() => {
  if (!activeDropdown.value) return []
  const filter = activeDropdown.value.filter.toLowerCase()
  const options = []
  props.mcOptions.forEach((mc) => {
    const mcId = mc.mc_id || ''
    const batch = mc.batch_no || ''
    if (filter && !mcId.toLowerCase().includes(filter) && !batch.toLowerCase().includes(filter)) return
    if (props.tableType === 'mc') {
      const list = mc.component_list
      if (!list || !Array.isArray(list) || list.length !== 1) return
      const comp = list[0]
      const componentName = comp[0] || batch || '未知'
      const mpId = comp[1] || ''
      options.push({ id: mcId, type: 'mc', label: `${componentName}: ${mcId}${mpId ? ` | <${mpId}>` : ''}`, mpId })
    } else {
      const list = mc.component_list
      const comp = list && Array.isArray(list) && list.length > 0 ? list[0] : null
      const componentName = comp ? comp[0] : batch || '未知'
      const mpId = comp && comp[1] ? comp[1] : ''
      options.push({ id: mcId, type: 'mc', label: `${componentName}: ${mcId}${mpId ? ` | <${mpId}>` : ''}`, mpId })
    }
  })
  return options
})

function getMpInfoText(mpId) {
  if (!mpId) return ''
  const mp = props.mpOptions.find(m => m.mp_id === mpId)
  if (!mp) return ''
  const lines = []
  if (Array.isArray(mp.fixed_properties)) {
    mp.fixed_properties.forEach((v, i) => { if (v !== -1 && v != null) lines.push(`属性${i+1}: ${v}`) })
  }
  let custom = mp.custom_properties
  if (!Array.isArray(custom) && typeof custom === 'string') { try { custom = JSON.parse(custom) } catch { custom = [] } }
  if (Array.isArray(custom)) {
    custom.forEach(p => { if (p.name && p.value !== -1 && p.value != null) lines.push(`${p.name}: ${p.value}`) })
  }
  return lines.join('\n')
}

function selectOption(itemIndex, opt) {
  if (opt.type === 'mc') {
    const mc = props.mcOptions.find(m => m.mc_id === opt.id)
    if (mc && mc.component_list && Array.isArray(mc.component_list) && mc.component_list.length === 1) {
      const comp = mc.component_list[0]
      if (comp[0]) updateItem(itemIndex, 'name', comp[0])
      if (comp[1]) updateItem(itemIndex, 'id', comp[1])
      else { updateItem(itemIndex, 'id', ''); alert('此原料没有关联的物性数据') }
    } else if (mc && mc.batch_no) {
      updateItem(itemIndex, 'name', mc.batch_no); updateItem(itemIndex, 'id', '')
      alert('此原料没有关联的物性数据')
    }
  }
  activeDropdown.value = null
}
</script>