<template>
  <div class="rp-section">
    <h2 style="margin-bottom:24px;color:var(--text-primary,#1f2937)">配方解析</h2>
    <div class="rp-info-box">
      <h4>配方输入格式说明</h4>
      <p><strong>组分格式：</strong> 名称 [ MPID | 物性项:值 ] : 比例%</p>
      <p><strong>测试格式：</strong> * 测试项:值</p>
    </div>
    <div><label class="rp-label">粘贴配方文本</label>
      <textarea v-model="rawText" class="rp-textarea" placeholder="氧化铝 [ ID123 ]: 60%&#10;二氧化硅 [ 粒径:10, 体积密度:2.6 ]: 30%&#10;水: 10%&#10;* 脱模抗压强度: 10&#10;* 体积密度(110Cx24H): 2.8" /></div>
    <div class="rp-btn-group">
      <button type="button" class="rp-btn" :disabled="loading" @click="handleParse"><span v-if="loading" class="rp-loading" />{{ loading ? '解析中...' : '解析' }}</button>
      <button type="button" class="rp-btn rp-btn-secondary" @click="handleClear">清空</button>
    </div>
    <div v-if="successVisible" class="rp-success">解析成功！请在下方表格中确认或修改匹配的材料。</div>
    <div v-if="warningsComputed.length > 0" class="rp-warnings">
      <h4>解析{{ parsed ? '警告' : '失败' }}</h4>
      <ul><li v-for="(w, i) in warningsComputed" :key="i">{{ w }}</li></ul>
    </div>
    <div v-if="showEmbedding && parsed && embeddingShape" class="rp-embedding-info">
      <h4>Embedding 信息</h4><p><strong>形状：</strong> {{ embeddingShape }}</p>
      <pre>{{ embeddingPreview }}</pre>
    </div>
    <div v-if="parsed" style="margin-top:24px">
      <div v-if="showRecipeMetadata" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px">
        <div style="flex:1;min-width:200px"><label class="rp-label">配方名称</label><input v-model="recipeName" type="text" class="rp-textarea" style="min-height:auto" /></div>
        <div style="flex:1;min-width:200px"><label class="rp-label">配方类型</label><select v-model="recipeType" class="rp-textarea" style="min-height:auto"><option value="铁线配方">铁线配方</option><option value="渣线配方">渣线配方</option><option value="烧成带配方">烧成带配方</option><option value="过渡带配方">过渡带配方</option></select></div>
        <div style="flex:1;min-width:200px"><label class="rp-label">批次号</label><input v-model="recipeBatch" type="text" class="rp-textarea" style="min-height:auto" /></div>
      </div>
      <div v-if="showComponents" style="margin-top:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
          <h3 style="margin-bottom:0;color:var(--text-primary,#1f2937)">配方组分</h3>
          <div style="display:flex;gap:10px">
            <button type="button" class="rp-btn rp-btn-secondary" @click="addRow">+ 添加行</button>
            <button type="button" class="rp-btn" :disabled="submitLoading" @click="handleSubmit"><span v-if="submitLoading" class="rp-loading" />{{ submitLoading ? '提交中...' : '确认并提交配方' }}</button>
          </div>
        </div>
        <div class="rp-table-container">
          <table class="rp-table">
            <thead><tr><th style="width:40px">序号</th><th>原始组分</th><th>匹配材料</th><th>比例(%)</th><th style="width:120px">操作</th></tr></thead>
            <tbody>
              <tr v-if="tableData.length === 0"><td colspan="5" style="text-align:center;padding:40px;color:#6b7280">请先输入配方文本并点击"解析"</td></tr>
              <tr v-for="(row, index) in tableData" :key="row.index" :style="{ backgroundColor: (!row.type_valid || !row.id_valid || !row.properties_valid) ? '#fffbeb' : '' }">
                <td style="text-align:center">{{ row.index }}</td>
                <td><input type="text" :value="row.matchedMaterial ? getChemicalName(row.matchedMaterial.component_list) || row.original : row.original" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:6px" @change="updateComponentName(index, $event)" />
                  <div><label style="font-size:12px;color:#64748b;margin-right:8px">类型：</label><select class="rp-type-select" :value="row.componentType" @change="updateComponentType(index, $event)"><option value="">请选择</option><option v-for="opt in MC_TYPE_OPTIONS" :key="opt" :value="opt">{{ opt }}</option></select></div></td>
                <td>
                  <template v-if="row.matchedMaterial"><div style="font-size:11px;color:#64748b;margin:2px 0">{{ getMpId(row.matchedMaterial.component_list) }}</div></template>
                  <template v-else-if="Object.keys(row.properties).length > 0"><div style="font-size:12px;font-weight:600">[自定义]</div></template>
                  <template v-else><div style="font-size:11px;color:#64748b">未匹配</div></template>
                  <div v-if="Object.keys(row.properties).length === 0" style="margin-top:4px"><button type="button" class="rp-btn rp-btn-secondary" style="padding:4px 12px;font-size:12px" @click="openMaterialModal(index)">选择</button></div>
                </td>
                <td><input type="number" step="0.01" min="0" max="100" :value="row.percentage" style="width:100px;padding:8px;border:1px solid #e5e7eb;border-radius:6px" @change="updatePercentage(index, $event)" /></td>
                <td><button type="button" class="rp-btn" style="padding:4px 12px;font-size:12px;background:linear-gradient(135deg,#ef4444,#dc2626)" @click="removeRow(index)">删除</button></td>
              </tr>
              <tr v-if="tableData.length > 0 && showSubmit">
                <td /><td><input v-model="newRowName" type="text" placeholder="化学组分名称" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:6px" /></td>
                <td><div style="margin-bottom:8px;font-size:11px;color:#64748b">未匹配</div></td>
                <td><input v-model="newRowPercentage" type="number" step="0.01" min="0" max="100" placeholder="比例" style="width:100px;padding:8px;border:1px solid #e5e7eb;border-radius:6px" /></td>
                <td><button type="button" class="rp-btn" style="padding:4px 12px;font-size:12px;background:linear-gradient(135deg,#10b981,#059669)" @click="addRecipeComponent">添加</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-if="showTestInfo" style="margin-top:24px">
        <h3 style="margin-bottom:16px;color:var(--text-primary,#1f2937)">测试信息</h3>
        <div class="rp-table-container"><table class="rp-table">
          <thead><tr><th>测试项</th><th>测试值</th><th>单位</th><th style="width:120px">操作</th></tr></thead>
          <tbody>
            <tr v-if="Object.keys(testDataMap).length === 0"><td colspan="4" style="text-align:center;padding:40px;color:#6b7280">无测试数据</td></tr>
            <tr v-for="(prop, key) in testDataMap" :key="key">
              <td>{{ key }}</td>
              <td><input type="number" step="0.01" :value="prop.value" style="width:100px;padding:8px;border:1px solid #e5e7eb;border-radius:6px" @change="updateTestValue(key, $event)" /></td>
              <td>{{ prop.unit }}</td>
              <td><button type="button" class="rp-btn" style="padding:4px 12px;font-size:12px;background:linear-gradient(135deg,#ef4444,#dc2626)" @click="removeTestItem(key)">删除</button></td>
            </tr>
          </tbody>
        </table></div>
      </div>
    </div>
    <MaterialSelectModal :visible="showMaterialModal" :materials="materials" @close="showMaterialModal = false" @select="onMaterialSelect" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRecipeParser } from '../composables/useRecipeParser'
import { usePlatformPropertiesStore } from '../stores/properties'
import MaterialSelectModal from './MaterialSelectModal.vue'
import { MC_TYPE_OPTIONS } from '../types/entities'

const props = defineProps({
  showSubmit: { type: Boolean, default: true },
  showEmbedding: { type: Boolean, default: false },
  showRecipeMetadata: { type: Boolean, default: true },
  showComponents: { type: Boolean, default: true },
  showTestInfo: { type: Boolean, default: true },
})
const emit = defineEmits(['parse', 'submit'])

const parser = useRecipeParser()
const propertiesStore = usePlatformPropertiesStore()

const rawText = ref('')
const loading = ref(false)
const parsed = ref(false)
const successVisible = ref(false)
const submitLoading = ref(false)
const recipeName = ref('')
const recipeType = ref('铁线配方')
const recipeBatch = ref('')
const embeddingShape = ref('')
const embeddingPreview = ref('')
const showMaterialModal = ref(false)
const currentSelectRowIndex = ref(null)

const tableData = computed(() => parser.recipeTableData.value)
const testDataMap = computed(() => parser.testData.value)
const warningsComputed = computed(() => parser.warnings.value)
const materials = computed(() => parser.allMaterials.value)

const newRowName = ref('')
const newRowPercentage = ref('')
const newTestName = ref('')
const newTestValue = ref('')
const newTestUnit = ref('')

async function handleParse() {
  if (!rawText.value.trim()) { parser.warnings.value = ['请输入配方内容']; return }
  loading.value = true
  try {
    const result = await parser.parseRecipe(rawText.value, { generateEmbedding: props.showEmbedding })
    parsed.value = true; successVisible.value = true
    if (parser.yamlMetaName.value) recipeName.value = parser.yamlMetaName.value
    if (result.embedding && result.embedding.length > 0) {
      embeddingShape.value = JSON.stringify(result.embeddingShape)
      let preview = ''
      result.embedding.slice(0, 5).forEach((row, i) => { preview += `行 ${i+1}: [${row.slice(0,10).map(x => Number(x).toFixed(4)).join(', ')}]\n` })
      embeddingPreview.value = preview
    } else { embeddingShape.value = ''; embeddingPreview.value = '' }
    setTimeout(() => { successVisible.value = false }, 3000)
    emit('parse', result)
  } catch (e) { parser.warnings.value = [e.message || '解析失败']; parsed.value = false }
  finally { loading.value = false }
}

async function handleSubmit() {
  submitLoading.value = true
  try {
    const result = await parser.submitRecipeData(recipeName.value, recipeType.value, recipeBatch.value)
    if (result.success && result.recipeId) { alert(`配方提交成功！配方ID: ${result.recipeId}`); emit('submit', { recipeId: result.recipeId }); handleClear() }
    else { parser.warnings.value = [result.message || '提交失败'] }
  } catch (e) { parser.warnings.value = [e.message || '提交失败'] }
  finally { submitLoading.value = false }
}

function handleClear() {
  rawText.value = ''; recipeName.value = ''; recipeType.value = '铁线配方'; recipeBatch.value = ''
  parsed.value = false; successVisible.value = false; embeddingShape.value = ''; embeddingPreview.value = ''
  parser.clear()
}

function openMaterialModal(index) { currentSelectRowIndex.value = index; showMaterialModal.value = true }
function onMaterialSelect(materialId) {
  if (currentSelectRowIndex.value === null) return
  const material = materials.value.find(m => m.mc_id === materialId || m.id === materialId)
  if (material) {
    const row = tableData.value[currentSelectRowIndex.value]
    row.materialId = materialId; row.materialName = material.batch_no || material.type || materialId
    row.matchedMaterial = material; row.id_valid = true
  }
  showMaterialModal.value = false
}

function updatePercentage(index, e) { tableData.value[index].percentage = parseFloat(e.target.value) || 0 }
function updateComponentType(index, e) { tableData.value[index].componentType = e.target.value }
function updateComponentName(index, e) { tableData.value[index].original = e.target.value; tableData.value[index].componentName = e.target.value }
function removeRow(index) { tableData.value.splice(index, 1); tableData.value.forEach((r, i) => { r.index = i + 1 }) }
function updateTestValue(key, e) {
  const val = parseFloat(e.target.value) || 0
  const existing = testDataMap.value[key]
  testDataMap.value[key] = { value: val, unit: (existing && existing.unit) || '' }
}
function removeTestItem(key) { delete testDataMap.value[key] }

function addRow() {
  tableData.value.push({ index: tableData.value.length + 1, original: '', type: 'component', componentName: '', materialId: '', materialName: '未匹配', percentage: 0, properties: {}, matchedMaterial: null, type_valid: true, id_valid: true, properties_valid: true, componentType: '' })
}
function addRecipeComponent() {
  if (!newRowName.value || !newRowPercentage.value) { alert('请输入化学组分名称和比例'); return }
  tableData.value.push({ index: tableData.value.length + 1, original: newRowName.value, type: 'component', componentName: newRowName.value, materialId: '', materialName: '未匹配', percentage: parseFloat(newRowPercentage.value) || 0, properties: {}, matchedMaterial: null, type_valid: true, id_valid: true, properties_valid: true, componentType: '' })
  newRowName.value = ''; newRowPercentage.value = ''
}

function getChemicalName(list) {
  if (!list) return ''
  if (Array.isArray(list) && list.length > 0 && Array.isArray(list[0]) && list[0].length > 0) return String(list[0][0]).trim()
  return ''
}
function getMpId(list) {
  if (!list) return ''
  if (Array.isArray(list) && list.length > 0 && Array.isArray(list[0]) && list[0].length > 1) return list[0][1] || ''
  return ''
}
</script>

<style scoped>
.rp-section { background: var(--card-background,#fff); border-radius: var(--radius-xl,16px); padding: 32px; box-shadow: var(--card-shadow,0 4px 12px rgba(0,0,0,.1)); margin-bottom: 24px; }
.rp-warnings { background: #fef3c7; border: 1px solid #fcd34d; border-radius: var(--radius-md,8px); padding: 16px; margin-bottom: 24px; }
.rp-warnings h4 { color: #92400e; margin-bottom: 12px; }
.rp-warnings ul { margin: 0; padding-left: 20px; color: #78350f; }
.rp-embedding-info { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: var(--radius-md,8px); padding: 16px; margin-top: 24px; }
.rp-embedding-info pre { background: white; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; }
.rp-info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-md,8px); padding: 20px; margin-bottom: 24px; }
.rp-success { background: #dcfce7; color: #166534; padding: 16px 20px; border-radius: var(--radius-md); margin-bottom: 20px; font-weight: 500; }
</style>
