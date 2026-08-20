/**
 * useDataManager - Vue 3 data-platform composable.
 *
 * 注意：此 composable 当前未被 DataManagerView.vue 引用（使用内联实现）。
 * 如需重构数据平台页面，可将 DataManagerView.vue 迁移到使用此 composable。
 */
import { ref } from 'vue'
import { usePlatformDataStore } from '../stores/data'
import { create, update, remove } from '../api/newData'
import { ID_FIELD_MAP } from '../types/entities'

export function useDataManager() {
  const dataStore = usePlatformDataStore()
  const currentMainTab = ref('manage')
  const currentTable = ref('mc')
  const filterText = ref('')
  const currentData = ref([])
  const editingRowId = ref(null)
  const editingData = ref({})
  const editLoading = ref(false)
  const deleteLoading = ref(null)
  const showEditModal = ref(false)
  const showAddMcModal = ref(false)
  const showAddMrModal = ref(false)
  const showAddMpModal = ref(false)
  const showAddTpModal = ref(false)
  const showAddFeModal = ref(false)
  const showAddRuModal = ref(false)
  const showAddLitModal = ref(false)
  const showCreateMcModal = ref(false)
  const showCreateMpModal = ref(false)

  function getFullTableData() { return dataStore.getDataByTable(currentTable.value) }

  function applyFilter(data) {
    const term = filterText.value.trim().toLowerCase()
    if (!term) return data
    return data.filter(item => Object.values(item).some(val => String(val).toLowerCase().includes(term)))
  }

  function getRowId(row) { return row[ID_FIELD_MAP[currentTable.value]] }

  function normalizeComponentList(data) {
    if (typeof data.component_list === 'string') {
      try { data.component_list = JSON.parse(data.component_list) } catch { /* keep as-is */ }
    }
  }

  async function loadAllData() {
    try {
      await dataStore.loadAllData()
      currentData.value = applyFilter(getFullTableData())
    } catch (e) { console.error('Failed to load all data:', e) }
  }

  async function loadReferenceData() {
    try {
      await dataStore.loadLiterature()
      currentData.value = applyFilter(getFullTableData())
    } catch (e) { console.error('Failed to load literature:', e) }
  }

  function getTableData(table) { return applyFilter(dataStore.getDataByTable(table)) }

  function filterTable() { currentData.value = applyFilter(getFullTableData()) }

  function editRow(row) {
    editingRowId.value = row[ID_FIELD_MAP[currentTable.value]]
    editingData.value = { ...row }
    showEditModal.value = true
  }

  async function saveEdit() {
    const id = editingRowId.value
    if (!id) return
    const idField = ID_FIELD_MAP[currentTable.value]
    const data = { ...editingData.value }
    delete data[idField]; delete data.create_time; delete data.update_time
    normalizeComponentList(data)
    editLoading.value = true
    try {
      await update(currentTable.value, id, data)
      showEditModal.value = false; editingRowId.value = null; editingData.value = {}
      await loadAllData()
    } catch (e) { console.error('Failed to save edit:', e) }
    finally { editLoading.value = false }
  }

  async function deleteRow(row) {
    const id = getRowId(row)
    if (!id) return
    if (!window.confirm('确定要删除这条记录吗？')) return
    deleteLoading.value = id
    try { await remove(currentTable.value, id); await loadAllData() }
    catch (e) { console.error('Failed to delete row:', e) }
    finally { deleteLoading.value = null }
  }

  function openAddModal(table) {
    switch (table) {
      case 'mc': showAddMcModal.value = true; break
      case 'mr': showAddMrModal.value = true; break
      case 'mp': showAddMpModal.value = true; break
      case 'tp': showAddTpModal.value = true; break
      case 'fe': showAddFeModal.value = true; break
      case 'ru': showAddRuModal.value = true; break
      case 'lit': showAddLitModal.value = true; break
      default: console.error('Unknown table type:', table)
    }
  }

  async function submitAddMc(data) { try { normalizeComponentList(data); await create('mc', data); showAddMcModal.value = false; await loadAllData() } catch (e) { console.error('Failed to add MC:', e) } }
  async function submitAddMr(data) { try { normalizeComponentList(data); await create('mr', data); showAddMrModal.value = false; await loadAllData() } catch (e) { console.error('Failed to add MR:', e) } }
  async function submitAddMp(data) { try { await create('mp', data); showAddMpModal.value = false; await loadAllData() } catch (e) { console.error('Failed to add MP:', e) } }
  async function submitAddTp(data) { try { await create('tp', data); showAddTpModal.value = false; await loadAllData() } catch (e) { console.error('Failed to add TP:', e) } }
  async function submitAddFe(data) { try { await create('fe', data); showAddFeModal.value = false; await loadAllData() } catch (e) { console.error('Failed to add FE:', e) } }
  async function submitAddRu(data) { try { await create('ru', data); showAddRuModal.value = false; await loadAllData() } catch (e) { console.error('Failed to add RU:', e) } }
  async function submitAddLit(data) { try { await create('lit', data); showAddLitModal.value = false; await loadReferenceData() } catch (e) { console.error('Failed to add literature:', e) } }

  function closeEditModal() { showEditModal.value = false; editingRowId.value = null; editingData.value = {} }
  function closeAddMcModal() { showAddMcModal.value = false }
  function closeAddMrModal() { showAddMrModal.value = false }
  function closeAddMpModal() { showAddMpModal.value = false }
  function closeAddTpModal() { showAddTpModal.value = false }
  function closeAddFeModal() { showAddFeModal.value = false }
  function closeAddRuModal() { showAddRuModal.value = false }
  function closeAddLitModal() { showAddLitModal.value = false }
  function closeCreateMcModal() { showCreateMcModal.value = false }
  function closeCreateMpModal() { showCreateMpModal.value = false }

  async function checkMongoDBStatus() {
    try {
      const response = await fetch('/health')
      return await response.json()
    } catch (e) { console.error('Failed to check MongoDB status:', e); return null }
  }

  return {
    currentMainTab, currentTable, filterText, currentData, editingRowId, editingData, editLoading, deleteLoading,
    showEditModal, showAddMcModal, showAddMrModal, showAddMpModal, showAddTpModal, showAddFeModal, showAddRuModal, showAddLitModal, showCreateMcModal, showCreateMpModal,
    loadAllData, loadReferenceData, getTableData, filterTable, editRow, saveEdit, deleteRow, openAddModal,
    submitAddMc, submitAddMr, submitAddMp, submitAddTp, submitAddFe, submitAddRu, submitAddLit,
    closeEditModal, closeAddMcModal, closeAddMrModal, closeAddMpModal, closeAddTpModal, closeAddFeModal, closeAddRuModal, closeAddLitModal, closeCreateMcModal, closeCreateMpModal,
    checkMongoDBStatus,
  }
}