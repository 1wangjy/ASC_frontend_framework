<template>
  <Teleport to="body">
    <div v-if="visible" class="rp-material-modal-overlay" @click.self="emit('close')">
      <div class="rp-material-modal-content">
        <h2 style="margin-bottom:8px;text-align:center">选择材料</h2>
        <p style="text-align:center;color:#6b7280;margin-bottom:24px">从数据库中选择匹配的材料</p>
        <div style="margin-bottom:24px">
          <input v-model="searchText" type="text" class="rp-textarea" style="min-height:auto;padding:10px 16px" placeholder="搜索材料..." />
        </div>
        <div class="rp-table-container" style="max-height:300px">
          <table class="rp-table">
            <thead><tr><th style="width:60px">选择</th><th>原料ID</th><th>材料类型</th><th>化学组成</th><th>物理指标</th></tr></thead>
            <tbody>
              <tr v-if="filteredMaterials.length === 0"><td colspan="5" style="text-align:center;padding:40px;color:#6b7280">暂无匹配的材料数据</td></tr>
              <tr v-for="item in filteredMaterials" :key="item.materialId"
                  :class="{ 'rp-material-row--selected': selectedMaterialId === item.materialId }"
                  @click="selectedMaterialId = item.materialId">
                <td style="text-align:center"><input type="radio" :value="item.materialId" :checked="selectedMaterialId === item.materialId" @change="selectedMaterialId = item.materialId" /></td>
                <td>{{ item.materialId }}</td><td>{{ item.material?.type || '' }}</td><td>{{ item.chemicalName }}</td>
                <td><template v-if="item.mpId">{{ item.mpId }}</template><template v-else>-</template></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="display:flex;gap:12px;margin-top:24px">
          <button type="button" class="rp-btn" style="flex:1" :disabled="!selectedMaterialId" @click="handleConfirm">确认选择</button>
          <button type="button" class="rp-btn rp-btn-secondary" style="flex:1" @click="emit('close')">取消</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  materials: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'select'])
const searchText = ref('')
const selectedMaterialId = ref('')

watch(() => props.visible, (v) => { if (v) { searchText.value = ''; selectedMaterialId.value = '' } })

const filteredMaterials = computed(() => {
  const query = searchText.value.toLowerCase().trim()
  const base = query ? props.materials.filter(m => {
    const id = m.mc_id || m.id || ''
    const type = m.type || ''
    const chem = getChemicalName(m.component_list)
    return [id, type, chem].join(' ').toLowerCase().includes(query)
  }) : props.materials
  return base.map(m => ({
    material: m, materialId: m.mc_id || m.id || '',
    chemicalName: getChemicalName(m.component_list),
    mpId: getMpId(m.component_list),
  }))
})

function getChemicalName(list) {
  if (!list) return ''
  if (Array.isArray(list) && list.length > 0 && Array.isArray(list[0]) && list[0].length > 0) return String(list[0][0]).trim()
  if (typeof list === 'string') {
    try { const p = JSON.parse(list); if (Array.isArray(p) && p.length > 0 && Array.isArray(p[0]) && p[0].length > 0) return String(p[0][0]).trim() } catch { return list.split(',')[0]?.trim() || '' }
  }
  return ''
}

function getMpId(list) {
  if (!list) return ''
  if (typeof list === 'string') { try { const p = JSON.parse(list); if (Array.isArray(p) && p.length > 0 && Array.isArray(p[0]) && p[0].length > 1) return p[0][1] || '' } catch { return list.split(',')[1]?.trim() || '' } }
  if (Array.isArray(list) && list.length > 0 && Array.isArray(list[0]) && list[0].length > 1) return list[0][1] || ''
  return ''
}

function handleConfirm() {
  if (selectedMaterialId.value) emit('select', selectedMaterialId.value)
}
</script>

<style scoped>
.rp-material-modal-overlay { position:fixed;z-index:2000;left:0;top:0;width:100%;height:100%;overflow:auto;background:rgba(0,0,0,.6);backdrop-filter:blur(8px); }
.rp-material-modal-content { background:white;padding:40px;border-radius:16px;width:90%;max-width:800px;margin:50px auto;max-height:90vh;overflow-y:auto; }
.rp-material-row--selected { background:#eff6ff; }
.rp-material-row:hover { background:#f8fafc; }
</style>