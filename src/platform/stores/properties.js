import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPropertiesConfig } from '../api/config'

export const usePlatformPropertiesStore = defineStore('platformProperties', () => {
  const pureMaterialProperties = ref([])
  const testProperties = ref([])
  const loaded = ref(false)

  async function loadConfig() {
    if (loaded.value) return
    try {
      const config = await getPropertiesConfig()
      pureMaterialProperties.value = config.pureMaterialProperties || []
      testProperties.value = config.testProperties || []
      loaded.value = true
    } catch (e) {
      console.warn('属性配置加载失败（如后端未启动可忽略）:', e?.message || e)
      loaded.value = true
    }
  }

  function findPureProperty(label) {
    return pureMaterialProperties.value.find(p => p.label === label || p.name === label)
  }

  function findTestProperty(label) {
    return testProperties.value.find(p => p.label === label || p.name === label)
  }

  return {
    pureMaterialProperties, testProperties, loaded,
    loadConfig, findPureProperty, findTestProperty,
  }
})