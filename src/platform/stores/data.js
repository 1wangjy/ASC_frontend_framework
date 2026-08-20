import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getAll, getAllLiterature } from '../api/newData'

export const usePlatformDataStore = defineStore('platformData', () => {
  const allMcData = ref([])
  const allMrData = ref([])
  const allMpData = ref([])
  const allTpData = ref([])
  const allFeData = ref([])
  const allRuData = ref([])
  const allLitData = ref([])

  async function loadAllData() {
    try {
      const [mp, mc, tp, fe, ru, mr] = await Promise.all([
        getAll('mp').catch(() => []),
        getAll('mc').catch(() => []),
        getAll('tp').catch(() => []),
        getAll('fe').catch(() => []),
        getAll('ru').catch(() => []),
        getAll('mr').catch(() => []),
      ])
      allMpData.value = mp
      allMcData.value = mc
      allTpData.value = tp
      allFeData.value = fe
      allRuData.value = ru
      allMrData.value = mr
    } catch (e) {
      console.warn('数据加载失败（如后端未启动可忽略）:', e?.message || e)
    }
  }

  async function loadLiterature() {
    try {
      allLitData.value = await getAllLiterature()
    } catch (e) {
      console.error('Failed to load literature:', e)
      allLitData.value = []
    }
  }

  function getDataByTable(table) {
    switch (table) {
      case 'mc': return allMcData.value
      case 'mr': return allMrData.value
      case 'mp': return allMpData.value
      case 'tp': return allTpData.value
      case 'fe': return allFeData.value
      case 'ru': return allRuData.value
      case 'lit': return allLitData.value
      default: return []
    }
  }

  return {
    allMcData, allMrData, allMpData, allTpData, allFeData, allRuData, allLitData,
    loadAllData, loadLiterature, getDataByTable,
  }
})