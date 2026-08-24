<template>
  <div class="platform-page">
    <div class="page-header"><h1>数据平台</h1><div style="display:flex;gap:8px"><button v-if="navigationHistory.length > 0" class="back-btn" @click="navigateBack"><span>←</span><span>返回</span></button></div></div>

    <!-- Main Tabs -->
    <div class="tab-container">
      <button v-for="tab in MAIN_TABS" :key="tab.key" :class="['tab-btn', { active: currentMainTab === tab.key }]" @click="switchMainTab(tab.key)">{{ tab.label }}</button>
    </div>

    <!-- Parse Section -->
    <div v-show="currentMainTab === 'parse'" class="tab-content" :class="{ active: currentMainTab === 'parse' }">
      <div class="section">
        <div class="tab-container">
          <button v-for="pt in PARSE_TABS" :key="pt.key" :class="['tab-btn', { active: currentParseTab === pt.key }]" @click="currentParseTab = pt.key">{{ pt.label }}</button>
        </div>
        <div v-show="currentParseTab === 'recipe'" class="tab-content" :class="{ active: currentParseTab === 'recipe' }">
          <RecipeParserPanel :show-submit="true" :show-embedding="false" />
        </div>
        <div v-show="currentParseTab === 'working'" class="tab-content" :class="{ active: currentParseTab === 'working' }">
          <div style="text-align:center;padding:80px 20px;color:#888"><div style="font-size:72px;margin-bottom:24px">⚙️</div><p style="font-size:18px;font-weight:500">工况解析功能开发中...</p></div>
        </div>
        <div v-show="currentParseTab === 'service'" class="tab-content" :class="{ active: currentParseTab === 'service' }">
          <div style="text-align:center;padding:80px 20px;color:#888"><div style="font-size:72px;margin-bottom:24px">🔧</div><p style="font-size:18px;font-weight:500">服役解析功能开发中...</p></div>
        </div>
        <div v-show="currentParseTab === 'reconstruct'" class="tab-content" :class="{ active: currentParseTab === 'reconstruct' }">
          <div style="text-align:center;padding:80px 20px;color:#888"><div style="font-size:72px;margin-bottom:24px">🎨</div><p style="font-size:18px;font-weight:500">重建解析功能开发中...</p></div>
        </div>
      </div>
    </div>

    <!-- Manage Section -->
    <div v-show="currentMainTab === 'manage'" class="tab-content" :class="{ active: currentMainTab === 'manage' }">
      <div class="section">
        <div class="tab-container">
          <button v-for="mt in MANAGE_TABS" :key="mt.key" :class="['tab-btn', { active: currentManageTable === mt.key }]" @click="switchManageTable(mt.key)">{{ mt.label }}</button>
        </div>
        <div class="toolbar">
          <input v-model="manageSearchFilter" type="text" placeholder="输入关键词搜索..." class="filter-input" />
          <button class="btn" @click="openAddModal()">添加数据</button>
          <button class="btn" @click="loadManageData()">刷新数据</button>
        </div>
        <DataTable ref="tableRef" :data="manageData" :table="currentManageTable" :editing-row-id="editingRowId"
          :mc-options="dataStore.allMcData" :mp-options="dataStore.allMpData"
          :pure-properties="propertiesStore.pureMaterialProperties" :test-properties="propertiesStore.testProperties"
          @start-edit="startEdit" @cancel-edit="cancelEdit" @save-edit="saveEdit" @delete="handleDelete"
          @jump-to-tab="jumpToTab" @open-create-mp="openCreateMp" @open-create-mc="openCreateMc" />
      </div>
    </div>

    <!-- Literature Section -->
    <div v-show="currentMainTab === 'literature'" class="tab-content" :class="{ active: currentMainTab === 'literature' }">
      <div class="section">
        <h2>文献库管理</h2>
        <div class="toolbar" style="margin-bottom:24px">
          <input v-model="litSearchFilter" type="text" placeholder="输入关键词搜索..." class="filter-input" />
          <LiteraturePdfImportActions
            :busy="isImportingPdf"
            :status="pdfImportStatus"
            @file-selected="handleDirectPdfImport"
            @manual-create="openAddLitModal"
          />
          <button class="btn" @click="loadLitData()">刷新数据</button>
        </div>
        <div v-if="filteredLitData.length === 0" style="text-align:center;padding:60px 20px;color:#888">
          <div style="font-size:72px;margin-bottom:24px">📚</div><p style="font-size:18px;font-weight:500">暂无文献数据</p>
        </div>
        <div v-else class="lit-card-list">
          <div v-for="lit in filteredLitData" :key="lit.lit_id" class="card" style="margin-bottom:16px;padding:24px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><span class="id-badge">{{ lit.lit_id }}</span><span v-if="lit.entry_type" style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:4px">{{ LIT_TYPE_LABELS[lit.entry_type] || lit.entry_type }}</span></div>
                <h3 style="margin-bottom:8px;color:var(--text-primary);font-size:16px">{{ lit.title }}</h3>
                <p style="color:var(--text-secondary);font-size:14px;margin-bottom:4px"><strong>作者:</strong> {{ lit.authors }}</p>
                <p v-if="lit.journal" style="color:var(--text-secondary);font-size:14px;margin-bottom:4px"><strong>期刊/会议:</strong> {{ lit.journal }}</p>
                <p v-if="lit.year" style="color:var(--text-secondary);font-size:14px;margin-bottom:4px"><strong>年份:</strong> {{ lit.year }}</p>
              </div>
              <div style="display:flex;gap:8px;flex-shrink:0">
                <button class="btn btn-secondary btn-small" @click="openEditLitModal(lit)">编辑</button>
                <button class="btn btn-danger btn-small" @click="handleDeleteLit(lit)">删除</button>
              </div>
            </div>
            <LiteratureAttachmentActions :literature="lit" @upload="handleUploadAttachment" />
          </div>
        </div>
      </div>
    </div>

    <!-- MongoDB Section -->
    <div v-show="currentMainTab === 'mongodb'" class="tab-content" :class="{ active: currentMainTab === 'mongodb' }">
      <div class="section">
        <h2>MongoDB管理</h2>
        <p style="margin-bottom:24px;color:var(--text-secondary)">使用Mongo Express进行MongoDB数据库管理</p>
        <div style="width:100%;height:600px;border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border-color)">
          <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:40px"
            :style="{ backgroundColor: mongoStatusOk === true ? 'rgba(16,185,129,.1)' : mongoStatusOk === false ? 'rgba(239,68,68,.1)' : 'transparent' }">
            <div style="font-size:72px;margin-bottom:24px">📦</div>
            <h3 style="margin-bottom:16px;color:var(--text-primary)">MongoDB连接状态</h3>
            <p style="margin-bottom:32px;color:var(--text-secondary);max-width:500px">{{ mongoStatusText }}</p>
            <button class="btn" @click="checkMongoDBStatus()" :disabled="isCheckingMongo"><span v-if="isCheckingMongo" class="loading"></span>{{ isCheckingMongo ? '检查中...' : '检查连接' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- =================== MODALS =================== -->
    <div v-if="showAddMcModal" class="modal active" @click.self="showAddMcModal = false">
      <div class="modal-content" style="max-width:640px">
        <h2>添加原料数据</h2>
        <div class="form-group"><label>批次号</label><input v-model="addMcBatchNo" type="text" required /></div>
        <div class="form-group"><label>类型</label><select v-model="addMcType"><option v-for="t in MC_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</option></select></div>
        <div class="form-group"><label>成分列表</label>
          <ComponentListEditor v-model="addMcComponents" table-type="mc" :mc-options="dataStore.allMcData" :mp-options="dataStore.allMpData" @open-create-mp="(i) => openCreateMp(i)" @open-create-mc="openCreateMc" />
        </div>
        <div class="modal-actions"><button class="btn" @click="submitAddMc()">保存</button><button class="btn btn-secondary" @click="showAddMcModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddMrModal" class="modal active" @click.self="showAddMrModal = false">
      <div class="modal-content" style="max-width:640px">
        <h2>添加配方数据</h2>
        <div class="form-group"><label>配方名称</label><input v-model="addMrFormulaName" type="text" required /></div>
        <div class="form-group"><label>配方类型</label><select v-model="addMrFormulaType"><option v-for="t in MR_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</option></select></div>
        <div class="form-group"><label>批次号</label><input v-model="addMrBatchNo" type="text" /></div>
        <div class="form-group"><label>成分列表</label>
          <ComponentListEditor v-model="addMrComponents" table-type="mr" :mc-options="dataStore.allMcData" :mp-options="dataStore.allMpData" @open-create-mp="(i) => openCreateMp(i)" @open-create-mc="openCreateMc" />
        </div>
        <div class="modal-actions"><button class="btn" @click="submitAddMr()">保存</button><button class="btn btn-secondary" @click="showAddMrModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddMpModal" class="modal active" @click.self="showAddMpModal = false">
      <div class="modal-content"><h2>添加物性数据</h2>
        <div class="form-group"><label>物性属性</label><textarea v-model="addMpProps" rows="8" placeholder="粒径: 10&#10;体积密度: 2.5"></textarea></div>
        <div class="modal-actions"><button class="btn" @click="submitAddMp()">保存</button><button class="btn btn-secondary" @click="showAddMpModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddTpModal" class="modal active" @click.self="showAddTpModal = false">
      <div class="modal-content" style="max-width:560px"><h2>添加测试数据</h2>
        <div class="form-group"><label>关联配方ID</label><input v-model="addTpMrId" type="text" placeholder="选择配方ID" /></div>
        <div class="form-group"><label>测试结果</label><textarea v-model="addTpResults" rows="8" placeholder="耐压强度: 100"></textarea></div>
        <div class="modal-actions"><button class="btn" @click="submitAddTp()">保存</button><button class="btn btn-secondary" @click="showAddTpModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddFeModal" class="modal active" @click.self="showAddFeModal = false">
      <div class="modal-content"><h2>添加工况数据</h2>
        <div class="form-group"><label>工况名称</label><input v-model="addFeConditionName" type="text" required /></div>
        <div class="form-group"><label>工况参数 (JSON)</label><textarea v-model="addFeConditionParams" rows="4" placeholder='{"温度": 1450}'></textarea></div>
        <div class="form-group"><label>关联配方ID</label><input v-model="addFeMrIds" type="text" /></div>
        <div class="modal-actions"><button class="btn" @click="submitAddFe()">保存</button><button class="btn btn-secondary" @click="showAddFeModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddRuModal" class="modal active" @click.self="showAddRuModal = false">
      <div class="modal-content"><h2>添加服役数据</h2>
        <div class="form-group"><label>服役名称</label><input v-model="addRuServiceName" type="text" required /></div>
        <div class="form-group"><label>服役参数 (JSON)</label><textarea v-model="addRuServiceParams" rows="4" placeholder='{"时间": 365}'></textarea></div>
        <div class="form-group"><label>关联工况ID</label><input v-model="addRuFeIds" type="text" /></div>
        <div class="form-group"><label>关联配方ID</label><input v-model="addRuMrIds" type="text" /></div>
        <div class="modal-actions"><button class="btn" @click="submitAddRu()">保存</button><button class="btn btn-secondary" @click="showAddRuModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showAddLitModal" class="modal active" @click.self="showAddLitModal = false">
      <div class="modal-content" style="max-width:560px">
        <h2>{{ isEditingLit ? '编辑文献/专利' : '添加文献/专利' }}</h2>
        <div class="form-group"><label>标题</label><input v-model="addLitForm.title" type="text" required /></div>
        <div class="form-group"><label>作者</label><input v-model="addLitForm.authors" type="text" required /></div>
        <div class="form-group"><label>期刊/会议</label><input v-model="addLitForm.journal" type="text" /></div>
        <div class="form-group"><label>年份</label><input v-model="addLitForm.year" type="number" /></div>
        <div class="form-group"><label>类型</label><select v-model="addLitForm.entry_type"><option v-for="opt in LIT_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></div>
        <div class="form-group"><label>Volume</label><input v-model="addLitForm.volume" type="text" /></div>
        <div class="form-group"><label>Number</label><input v-model="addLitForm.number" type="text" /></div>
        <div class="form-group"><label>Pages</label><input v-model="addLitForm.pages" type="text" /></div>
        <div class="form-group"><label>摘要</label><textarea v-model="addLitForm.abstract" rows="4"></textarea></div>
        <div class="form-group"><label>DOI</label><input v-model="addLitForm.doi" type="text" /></div>
        <div class="form-group"><label>Note</label><textarea v-model="addLitForm.note" rows="3"></textarea></div>
        <div class="modal-actions"><button class="btn" @click="submitAddLit()">{{ isEditingLit ? '更新' : '保存' }}</button><button class="btn btn-secondary" @click="showAddLitModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showCreateMcModal" class="modal active" @click.self="showCreateMcModal = false">
      <div class="modal-content" style="max-width:640px"><h2>新建原料数据</h2>
        <div class="form-group"><label>批次号</label><input v-model="createMcBatchNo" type="text" required /></div>
        <div class="form-group"><label>类型</label><select v-model="createMcType"><option v-for="t in MC_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</option></select></div>
        <div class="form-group"><label>成分列表</label>
          <ComponentListEditor v-model="createMcComponents" table-type="mc" :mc-options="dataStore.allMcData" :mp-options="dataStore.allMpData" @open-create-mp="(i) => openCreateMp(i)" @open-create-mc="openCreateMc" />
        </div>
        <div class="modal-actions"><button class="btn" @click="submitCreateMc()">创建</button><button class="btn btn-secondary" @click="showCreateMcModal = false">取消</button></div>
      </div>
    </div>
    <div v-if="showCreateMpModal" class="modal active" @click.self="showCreateMpModal = false">
      <div class="modal-content" style="max-width:560px"><h2>{{ createMpExistingId ? '修改物性数据' : '添加物性数据' }}</h2>
        <div class="form-group"><label>MC ID (可选)</label><input v-model="createMpMcId" type="text" /></div>
        <div class="form-group"><label>物性属性 (格式: label: value)</label><textarea v-model="createMpProps" rows="8" placeholder="粒径: 10&#10;体积密度: 2.5"></textarea></div>
        <div class="modal-actions"><button class="btn" @click="submitCreateMp()">{{ createMpExistingId ? '更新' : '保存' }}</button><button class="btn btn-secondary" @click="showCreateMpModal = false">取消</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { usePlatformDataStore } from '../stores/data'
import { usePlatformPropertiesStore } from '../stores/properties'
import RecipeParserPanel from '../components/RecipeParserPanel.vue'
import DataTable from '../components/DataTable.vue'
import ComponentListEditor from '../components/ComponentListEditor.vue'
import LiteratureAttachmentActions from '../components/LiteratureAttachmentActions.vue'
import LiteraturePdfImportActions from '../components/LiteraturePdfImportActions.vue'
import { create, update, remove, getAllLiterature, toLiteraturePayload } from '../api/newData'
import { uploadAttachment, testMongoDB } from '../api/attachment'
import { importLiteraturePdf } from '../services/literaturePdfImport.js'
import { MC_TYPE_OPTIONS, MR_TYPE_OPTIONS, LIT_TYPE_OPTIONS, ID_FIELD_MAP } from '../types/entities'

const MAIN_TABS = [{ key: 'parse', label: '数据解析' }, { key: 'manage', label: '数据管理' }, { key: 'literature', label: '文献库管理' }, { key: 'mongodb', label: 'MongoDB测试' }]
const PARSE_TABS = [{ key: 'recipe', label: '配方/测试解析' }, { key: 'working', label: '工况解析' }, { key: 'service', label: '服役解析' }, { key: 'reconstruct', label: '重建解析' }]
const MANAGE_TABS = [{ key: 'mc', label: '原料表' }, { key: 'mr', label: '配方表' }, { key: 'mp', label: '物性表' }, { key: 'tp', label: '测试表' }, { key: 'fe', label: '工况记录' }, { key: 'ru', label: '服役记录' }]
const LIT_TYPE_LABELS = { journal: '期刊论文', conference: '会议论文', patent: '专利', book: '书籍' }

const dataStore = usePlatformDataStore()
const propertiesStore = usePlatformPropertiesStore()

const currentMainTab = ref('parse')
const currentParseTab = ref('recipe')
const currentManageTable = ref('mc')
const manageSearchFilter = ref('')
const litSearchFilter = ref('')
const debouncedManageFilter = ref('')
const debouncedLitFilter = ref('')
let manageDebounceTimer = null, litDebounceTimer = null
const isComponentMounted = ref(true)
const mongoStatusText = ref('正在检查连接...')
const mongoStatusOk = ref(null)
const isCheckingMongo = ref(false)
const editingRowId = ref(null)
const tableRef = ref(null)
const navigationHistory = ref([])
const highlightRowId = ref(null)

// Add modal states
const showAddMcModal = ref(false); const addMcBatchNo = ref(''); const addMcType = ref('支撑骨料'); const addMcComponents = ref([{ name: '新建原料', id: null, ratio: 100 }])
const showAddMrModal = ref(false); const addMrFormulaName = ref(''); const addMrFormulaType = ref('铁线配方'); const addMrBatchNo = ref(''); const addMrComponents = ref([{ name: '新建成分', id: null, ratio: 100 }])
const showAddMpModal = ref(false); const addMpProps = ref('')
const showAddTpModal = ref(false); const addTpMrId = ref(''); const addTpResults = ref('')
const showAddFeModal = ref(false); const addFeConditionName = ref(''); const addFeConditionParams = ref(''); const addFeMrIds = ref('')
const showAddRuModal = ref(false); const addRuServiceName = ref(''); const addRuServiceParams = ref(''); const addRuFeIds = ref(''); const addRuMrIds = ref('')
const showAddLitModal = ref(false); const isEditingLit = ref(false); const editingLitId = ref('')
const addLitForm = ref({ title: '', authors: '', journal: '', year: '', volume: '', number: '', pages: '', entry_type: 'journal', abstract: '', doi: '', note: '' })
const isImportingPdf = ref(false); const pdfImportStatus = ref('')
const showCreateMcModal = ref(false); const createMcBatchNo = ref(''); const createMcType = ref('支撑骨料'); const createMcComponents = ref([{ name: '新建原料', id: null, ratio: 100 }])
const showCreateMpModal = ref(false); const createMpMcId = ref(''); const createMpProps = ref(''); const createMpTarget = ref(null); const createMpExistingId = ref('')

watch(manageSearchFilter, (val) => { if (manageDebounceTimer) clearTimeout(manageDebounceTimer); manageDebounceTimer = setTimeout(() => { debouncedManageFilter.value = val }, 300) })
watch(litSearchFilter, (val) => { if (litDebounceTimer) clearTimeout(litDebounceTimer); litDebounceTimer = setTimeout(() => { debouncedLitFilter.value = val }, 300) })

const manageData = computed(() => {
  const all = dataStore.getDataByTable(currentManageTable.value)
  if (!debouncedManageFilter.value) return all
  const f = debouncedManageFilter.value.toLowerCase()
  return all.filter(item => Object.values(item).some(v => String(v).toLowerCase().includes(f)))
})
const litData = ref([])
const filteredLitData = computed(() => {
  if (!debouncedLitFilter.value) return litData.value
  const f = debouncedLitFilter.value.toLowerCase()
  return litData.value.filter(item => Object.values(item).some(v => String(v??'').toLowerCase().includes(f)))
})

async function loadManageData() { await dataStore.loadAllData() }
async function loadLitData() { try { litData.value = await getAllLiterature() } catch (e) { if (!isComponentMounted.value) return; console.error(e); litData.value = [] } }

function switchMainTab(tab) { currentMainTab.value = tab; if (tab === 'manage') loadManageData(); else if (tab === 'literature') loadLitData(); else if (tab === 'mongodb') checkMongoDBStatus() }
function switchManageTable(table) { addToNavigationHistory(); editingRowId.value = null; currentManageTable.value = table; loadManageData() }
function addToNavigationHistory() { navigationHistory.value.push({ table: currentManageTable.value, scrollY: window.scrollY }); if (navigationHistory.value.length > 10) navigationHistory.value.shift() }
function navigateBack() { const prev = navigationHistory.value.pop(); if (prev) { editingRowId.value = null; currentManageTable.value = prev.table; loadManageData() } }
function jumpToTab(type, targetId) { addToNavigationHistory(); currentManageTable.value = type; editingRowId.value = null; loadManageData(); setTimeout(() => { highlightRowId.value = targetId; setTimeout(() => { highlightRowId.value = null }, 2000) }, 300) }

async function checkMongoDBStatus() { isCheckingMongo.value = true; mongoStatusText.value = '正在检查连接...'; try { const r = await testMongoDB(); if (r && r.success) { mongoStatusText.value = 'MongoDB连接成功！'; mongoStatusOk.value = true } else { mongoStatusText.value = 'MongoDB未连接'; mongoStatusOk.value = false } } catch { mongoStatusText.value = '无法连接到服务器'; mongoStatusOk.value = false } finally { isCheckingMongo.value = false } }

function getRowId(row, table) { return row[ID_FIELD_MAP[table]] }
function handleDelete(row) { const id = getRowId(row, currentManageTable.value); if (!confirm('确定要删除这条记录吗？')) return; remove(currentManageTable.value, id).then(() => loadManageData()).catch(e => alert('删除失败：' + (e.message || '请重试'))) }
function startEdit(row) { editingRowId.value = getRowId(row, currentManageTable.value) }
function cancelEdit() { editingRowId.value = null }
async function saveEdit(payload) { const id = editingRowId.value; if (!id) return; try { await update(currentManageTable.value, id, payload); editingRowId.value = null; await loadManageData() } catch (e) { alert('保存失败：' + (e.message || '请重试')) } }

function openAddModal() { switch (currentManageTable.value) { case 'mc': showAddMcModal.value = true; break; case 'mr': showAddMrModal.value = true; break; case 'mp': showAddMpModal.value = true; break; case 'tp': showAddTpModal.value = true; break; case 'fe': showAddFeModal.value = true; break; case 'ru': showAddRuModal.value = true; break } }

async function submitAddMc() { if (!addMcBatchNo.value) { alert('请输入批次号'); return } try { await create('mc', { batch_no: addMcBatchNo.value, type: addMcType.value, component_list: addMcComponents.value.map(c => [c.name, c.id || null, '{}', c.ratio]) }); showAddMcModal.value = false; addMcBatchNo.value = ''; addMcComponents.value = [{ name: '新建原料', id: null, ratio: 100 }]; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddMr() { if (!addMrFormulaName.value) { alert('请输入配方名称'); return } try { await create('mr', { formula_name: addMrFormulaName.value, formula_type: addMrFormulaType.value, batch_no: addMrBatchNo.value, component_list: addMrComponents.value.map(c => [c.name, c.id || null, '{}', c.ratio]), tp_ids: [] }); showAddMrModal.value = false; addMrFormulaName.value = ''; addMrBatchNo.value = ''; addMrComponents.value = [{ name: '新建成分', id: null, ratio: 100 }]; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddMp() { const lines = addMpProps.value.split('\n').map(l => l.trim()).filter(Boolean); const fixedProps = Array(32).fill(-1); const customProps = []; lines.forEach(line => { const m = line.match(/^([^:]+):\s*(.+)$/); if (m) { const label = m[1].trim(); const val = parseFloat(m[2].trim()); if (!isNaN(val)) { const def = propertiesStore.pureMaterialProperties.find(p => p.label === label); if (def) { fixedProps[def.id] = val } else { customProps.push({ name: label, value: val }) } } } }); try { await create('mp', { fixed_properties: fixedProps, custom_properties: customProps }); showAddMpModal.value = false; addMpProps.value = ''; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddTp() { const lines = addTpResults.value.split('\n').map(l => l.trim()).filter(Boolean); const fixedProps = Array(32).fill(-1); const customProps = []; lines.forEach(line => { const m = line.match(/^([^:]+):\s*(.+)$/); if (m) { const label = m[1].trim(); const val = parseFloat(m[2].trim()); if (!isNaN(val)) { const def = propertiesStore.testProperties.find(p => p.label === label); if (def) { fixedProps[def.id] = val } else { customProps.push({ name: label, value: val }) } } } }); try { await create('tp', { mr_id: addTpMrId.value, test_params: {}, test_results: { fixed: fixedProps, custom: customProps } }); showAddTpModal.value = false; addTpMrId.value = ''; addTpResults.value = ''; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddFe() { if (!addFeConditionName.value) { alert('请输入工况名称'); return } let params = {}; try { params = addFeConditionParams.value ? JSON.parse(addFeConditionParams.value) : {} } catch { alert('工况参数格式错误'); return } try { await create('fe', { condition_name: addFeConditionName.value, condition_type: '', condition_params: params, mr_ids: addFeMrIds.value ? addFeMrIds.value.split(',').map(s => s.trim()) : [] }); showAddFeModal.value = false; addFeConditionName.value = ''; addFeConditionParams.value = ''; addFeMrIds.value = ''; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }
async function submitAddRu() { if (!addRuServiceName.value) { alert('请输入服役名称'); return } let params = {}; try { params = addRuServiceParams.value ? JSON.parse(addRuServiceParams.value) : {} } catch { alert('服役参数格式错误'); return } try { await create('ru', { service_name: addRuServiceName.value, service_type: '', service_params: params, fe_ids: addRuFeIds.value ? addRuFeIds.value.split(',').map(s => s.trim()) : [], mr_ids: addRuMrIds.value ? addRuMrIds.value.split(',').map(s => s.trim()) : [] }); showAddRuModal.value = false; addRuServiceName.value = ''; addRuServiceParams.value = ''; addRuFeIds.value = ''; addRuMrIds.value = ''; await loadManageData() } catch (e) { alert('添加失败：' + (e.message || '请重试')) } }

function resetLitForm() { addLitForm.value = { title: '', authors: '', journal: '', year: '', volume: '', number: '', pages: '', entry_type: 'journal', abstract: '', doi: '', note: '' }; isEditingLit.value = false; editingLitId.value = '' }
function openAddLitModal() { resetLitForm(); showAddLitModal.value = true }
function openEditLitModal(lit) { isEditingLit.value = true; editingLitId.value = lit.lit_id; addLitForm.value = { title: lit.title || '', authors: lit.authors || '', journal: lit.journal || '', year: String(lit.year || ''), volume: lit.volume || '', number: lit.number || '', pages: lit.pages || '', entry_type: lit.entry_type || 'journal', abstract: lit.abstract || '', doi: lit.doi || '', note: lit.note || '' }; showAddLitModal.value = true }
async function submitAddLit() { const f = addLitForm.value; if (!f.title || !f.authors) { alert('请填写标题和作者'); return } try { const payload = toLiteraturePayload(f); if (isEditingLit.value) { await update('lit', editingLitId.value, payload) } else { await create('lit', payload) }; showAddLitModal.value = false; resetLitForm(); await loadLitData() } catch (e) { alert((isEditingLit.value ? '更新' : '添加') + '失败：' + (e.response?.data?.error || e.message || '请重试')) } }
async function handleDeleteLit(lit) { if (!confirm('确定要删除这条文献记录吗？')) return; try { await remove('lit', lit.lit_id); await loadLitData() } catch (e) { alert('删除失败：' + (e.message || '请重试')) } }
async function handleUploadAttachment(litId) { const input = document.createElement('input'); input.type = 'file'; input.accept = '.pdf,application/pdf'; input.onchange = async () => { const file = input.files?.[0]; if (file) { try { await uploadAttachment(file, litId); await loadLitData(); alert('PDF 上传成功') } catch (e) { alert('上传失败：' + (e.response?.data?.error || e.message || '请重试')) } }; input.remove() }; input.click() }
async function handleDirectPdfImport(file) { if (isImportingPdf.value) return; const progressText = { validating: '正在检查 PDF…', uploading: '正在上传 PDF…', parsing: '正在解析文献信息…', complete: '导入完成' }; isImportingPdf.value = true; pdfImportStatus.value = ''; try { const result = await importLiteraturePdf(file, { onProgress: stage => { pdfImportStatus.value = progressText[stage] || '' } }); await loadLitData(); pdfImportStatus.value = result.degraded ? 'PDF 已导入，可稍后补充文献信息' : '导入完成' } catch (e) { pdfImportStatus.value = '导入失败：' + (e.response?.data?.error || e.response?.data?.message || e.message || '请重试') } finally { isImportingPdf.value = false } }

function openCreateMc() { showCreateMcModal.value = true }
async function submitCreateMc() { if (!createMcBatchNo.value) { alert('请输入批次号'); return } try { const r = await create('mc', { batch_no: createMcBatchNo.value, type: createMcType.value, component_list: createMcComponents.value.map(c => [c.name, c.id || null, '{}', c.ratio]) }); showCreateMcModal.value = false; createMcBatchNo.value = ''; createMcComponents.value = [{ name: '新建原料', id: null, ratio: 100 }]; await loadManageData() } catch (e) { alert('创建失败：' + (e.message || '请重试')) } }

function formatMpToText(mp) { const lines = []; if (Array.isArray(mp.fixed_properties)) { mp.fixed_properties.forEach((v, i) => { if (v !== -1 && v != null) { const def = propertiesStore.pureMaterialProperties[i]; if (def) lines.push(`${def.label}: ${v}${def.unit ? ` ${def.unit}` : ''}`) } }) } let custom = mp.custom_properties; if (!Array.isArray(custom) && typeof custom === 'string') { try { custom = JSON.parse(custom) } catch { custom = [] } }; if (Array.isArray(custom)) { custom.forEach(p => { if (p.name && p.value !== -1 && p.value != null) lines.push(`${p.name}: ${p.value}`) }) }; return lines.join('\n') }

function openCreateMp(itemIndex) { let target = 'row'; if (showAddMcModal.value) target = 'addMc'; else if (showAddMrModal.value) target = 'addMr'; createMpTarget.value = { target, itemIndex }; let existingId = ''; let mcId = ''; if (target === 'addMc') { existingId = addMcComponents.value[itemIndex]?.id || ''; mcId = addMcBatchNo.value || '' } else if (target === 'addMr') { existingId = addMrComponents.value[itemIndex]?.id || '' }; createMpExistingId.value = existingId; createMpMcId.value = mcId; if (existingId) { const mp = dataStore.allMpData.find(m => m.mp_id === existingId); if (mp) { createMpProps.value = formatMpToText(mp); if (Array.isArray(mp.mc_ids) && mp.mc_ids.length > 0) createMpMcId.value = mp.mc_ids[0] } else { createMpProps.value = '' } } else { createMpProps.value = '' }; showCreateMpModal.value = true }

async function submitCreateMp() { const lines = createMpProps.value.split('\n').map(l => l.trim()).filter(Boolean); const fixedProps = Array(32).fill(-1); const customProps = []; lines.forEach(line => { const m = line.match(/^([^:]+):\s*(.+)$/); if (m) { const label = m[1].trim(); const val = parseFloat(m[2].trim()); if (!isNaN(val)) { const def = propertiesStore.pureMaterialProperties.find(p => p.label === label); if (def) { fixedProps[def.id] = val } else { customProps.push({ name: label, value: val }) } } } }); try { const data = { fixed_properties: fixedProps, custom_properties: customProps }; if (createMpMcId.value) data.mc_ids = [createMpMcId.value]; let res; if (createMpExistingId.value) { res = await update('mp', createMpExistingId.value, data) } else { res = await create('mp', data) }; showCreateMpModal.value = false; createMpProps.value = ''; createMpExistingId.value = ''; createMpTarget.value = null; await loadManageData() } catch (e) { console.error(e); alert('处理物性数据失败') } }

onMounted(() => { propertiesStore.loadConfig() })
onUnmounted(() => { isComponentMounted.value = false; if (manageDebounceTimer) clearTimeout(manageDebounceTimer); if (litDebounceTimer) clearTimeout(litDebounceTimer) })
</script>
