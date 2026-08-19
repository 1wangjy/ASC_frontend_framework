/**
 * useRecipeParser - Vue 3 recipe parsing composable.
 * Migrated from _code/vite-src/src/composables/useRecipeParser.ts.
 */
import { ref } from 'vue'
import yaml from 'js-yaml'
import { getMcMaterials, getMpProperties, addTableData } from '../api/admin'
import { submitRecipe, registerTestData, parseRecipeRemote } from '../api/recipeParser'
import { usePlatformPropertiesStore } from '../stores/properties'

export function useRecipeParser() {
  const propertiesStore = usePlatformPropertiesStore()
  const allMaterials = ref([])
  const allMpProperties = ref([])
  const testData = ref({})
  const recipeTableData = ref([])
  const warnings = ref([])
  const rawText = ref('')
  const yamlMetaName = ref('')

  function toPythonRecipeFormat(content) {
    const parts = []
    content.split('\n').forEach((line) => {
      const t = line.trim()
      if (!t || t.startsWith('*')) return
      const full = t.match(/^(.+?)\s*\[([\s\S]*?)\]\s*:\s*(\d+(?:\.\d+)?)\s*%?$/)
      if (full) {
        const [, name, bracketContent, ratio] = full
        const cleanName = name.split(',')[0].trim()
        const bracketText = bracketContent.trim()
        if (bracketText.includes(':')) {
          parts.push(`[支撑骨料]${cleanName}{${bracketText}}:${ratio}%`)
        } else {
          parts.push(`[支撑骨料]${cleanName}<${bracketText}>:${ratio}%`)
        }
        return
      }
      const simple = t.match(/^(.+?)\s*:\s*(\d+(?:\.\d+)?)\s*%?$/)
      if (simple) {
        parts.push(`${simple[1].trim()}:${simple[2]}%`)
      }
    })
    return parts.join('; ')
  }

  async function loadAllMaterials() {
    try {
      allMaterials.value = await getMcMaterials()
    } catch (e) {
      console.error('Error loading materials:', e)
      allMaterials.value = []
    }
  }

  async function loadMpProperties() {
    try {
      allMpProperties.value = await getMpProperties()
    } catch (e) {
      console.error('Error loading MP properties:', e)
      allMpProperties.value = []
    }
  }

  async function ensureDataLoaded() {
    if (allMaterials.value.length === 0) await loadAllMaterials()
    if (allMpProperties.value.length === 0) await loadMpProperties()
    await propertiesStore.loadConfig()
  }

  function isYamlFormat(content) {
    return /^(source_factory|components|formula):\s/m.test(content.trim())
  }

  function parseYamlRecipe(content) {
    let data
    try {
      data = yaml.load(content)
    } catch (e) {
      return { components: [], warnings: ['YAML解析失败: ' + e.message] }
    }
    const components = []
    const w = []
    const CHEMICAL_KEYS = ['SiC', 'SiO2', 'AL2O3', 'Fe2O3', 'TiO2', 'CaO', 'MgO', 'K2O', 'Na2O', 'PH', 'loi']
    const PACKAGING_RE = /集装袋|袋装|普黑|PA胶/
    if (data.formula?.product_name) {
      yamlMetaName.value = data.formula.product_name
    }
    ;(data.components ?? []).forEach((comp) => {
      const ratio = comp.ratio_pct
      const name = comp.material_name ?? ''
      if (ratio > 100 || PACKAGING_RE.test(name)) return
      const properties = {}
      const chem = comp.component_tests?.chemical ?? {}
      CHEMICAL_KEYS.forEach((k) => {
        if (chem[k] != null) properties[k] = chem[k]
      })
      const propsStr = Object.entries(properties).map(([k, v]) => `${k}:${v}`).join(', ')
      components.push({ type: 'component', name, mpId: '', ratio, properties, propertiesStr: propsStr || '' })
    })
    const tests = data.formula_tests?.product_tests ?? []
    const seenTemps = new Set()
    const testProps = {}
    tests.forEach((t) => {
      const temp = t.temperature
      if (temp == null || seenTemps.has(temp)) return
      seenTemps.add(temp)
      ;['bulk_density', 'cold_modulus', 'crushing_strength', 'linear_change', 'apparent_porosity', 'wear'].forEach((k) => {
        if (t[k] != null) testProps[`${k}@${temp}C`] = t[k]
      })
    })
    if (Object.keys(testProps).length > 0) {
      components.push({ type: 'test', name: '产品测试', mpId: '', ratio: 0, properties: testProps, propertiesStr: Object.entries(testProps).map(([k, v]) => `${k}: ${v}`).join(', ') })
    }
    return { components, warnings: w }
  }

  function parseValueWithUnit(value, propertyName, propertyType) {
    const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*([^\d\s].*?)?\s*$/)
    if (!match) return { numericValue: value, unit: '', warning: `无法解析值: ${value}` }
    const [, numericStr, unit] = match
    const numericValue = parseFloat(numericStr)
    if (isNaN(numericValue)) return { numericValue: value, unit: '', warning: `无法解析数值: ${value}` }
    let finalUnit = unit ? unit.trim() : ''
    let expectedUnit = ''
    const prop = propertyType === 'material'
      ? propertiesStore.findPureProperty(propertyName)
      : propertiesStore.findTestProperty(propertyName)
    if (prop) expectedUnit = prop.unit || ''
    if (!finalUnit && expectedUnit) finalUnit = expectedUnit
    if (finalUnit && expectedUnit && finalUnit !== expectedUnit) {
      return { numericValue, unit: finalUnit, warning: `属性 "${propertyName}" 的单位不匹配：输入 "${finalUnit}"，期望 "${expectedUnit}"` }
    }
    return { numericValue, unit: finalUnit, warning: '' }
  }

  function parseRecipeText(content) {
    if (isYamlFormat(content)) return parseYamlRecipe(content)
    const filtered = content
      .replace(/[《》]/g, (c) => c === '《' ? '<' : '>')
      .replace(/[【】]/g, (c) => c === '【' ? '[' : ']')
      .replace(/[，：；]/g, (c) => ({ '，': ',', '：': ':', '；': ';' })[c])
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
    const components = []
    const warnings = []
    const lines = filtered.split('\n').map(l => l.trim()).filter(Boolean)
    let testProperties = {}
    let hasTest = false
    lines.forEach((line) => {
      if (line.startsWith('*')) {
        const testItem = line.substring(1).trim()
        const [key, value] = testItem.split(':').map(p => p.trim())
        if (key && value) {
          const r = parseValueWithUnit(value, key, 'test')
          if (r.warning) warnings.push(r.warning)
          testProperties[key] = { value: r.numericValue, unit: r.unit }
          hasTest = true
        }
      } else {
        const m = line.match(/(.+?)\s*\[([\s\S]*?)\]\s*:\s*(\d+(?:\.\d+)?)%?/)
        if (m) {
          const [, name, bracketContent, ratio] = m
          let mpId = '', properties = {}
          const bc = bracketContent.trim()
          if (bc.includes(':')) {
            const props = bc.replace(/^\{/, '').replace(/\}$/, '').split(/[,\n]/).map(p => p.trim()).filter(Boolean)
            props.forEach((prop) => {
              const [k, v] = prop.split(':').map(s => s.trim())
              const r = parseValueWithUnit(v, k, 'material')
              if (r.warning) warnings.push(r.warning)
              properties[k] = { value: r.numericValue, unit: r.unit }
            })
          } else {
            mpId = bc
          }
          components.push({ type: 'component', name: name.split(',')[0].trim(), mpId, properties, ratio: parseFloat(ratio) })
        } else {
          const s = line.match(/(.+?):\s*(\d+(?:\.\d+)?)%/)
          if (s) {
            components.push({ type: 'component', name: s[1].split(',')[0].trim(), mpId: '', properties: {}, ratio: parseFloat(s[2]) })
          }
        }
      }
    })
    if (hasTest && Object.keys(testProperties).length > 0) {
      components.push({ type: 'test', properties: testProperties })
    }
    return { components, warnings }
  }

  async function parseRecipe(content) {
    if (!content.trim()) throw new Error('请输入配方内容')
    await ensureDataLoaded()
    const { components: localComponents, warnings: parseWarnings } = parseRecipeText(content)
    const componentData = localComponents.filter(c => c.type === 'component')
    const testDataEntries = localComponents.filter(c => c.type === 'test')
    const resolvedTestData = testDataEntries.length > 0 ? testDataEntries[0].properties : {}
    testData.value = resolvedTestData
    recipeTableData.value = componentData.map((comp, index) => {
      let matchedMaterial = null, materialName = '未匹配', materialId = ''
      if (comp.mpId) {
        materialId = comp.mpId
        const found = allMaterials.value.find(m => m.mc_id === comp.mpId || m.MPID === comp.mpId)
        if (found) {
          matchedMaterial = found
          materialName = found.material_type || found.mc_id || '已匹配'
          materialId = found.mc_id
        }
      }
      let componentType = ''
      if (/^(水|water)$/i.test(comp.name)) componentType = '水'
      return {
        index: index + 1, original: comp.name || '', type: 'component',
        componentName: comp.name || '', materialId, materialName,
        percentage: comp.ratio || 0, properties: comp.properties || {},
        matchedMaterial, type_valid: true, id_valid: !!matchedMaterial,
        properties_valid: true, componentType,
      }
    })
    if (recipeTableData.value.length === 0) throw new Error('没有解析到有效的配方组分')
    warnings.value = parseWarnings || []
    let embedding, embeddingShape
    try {
      const remote = await parseRecipeRemote(toPythonRecipeFormat(content))
      if (remote.embedding && remote.embedding.length > 0) {
        embedding = remote.embedding
        embeddingShape = remote.embedding_shape
      }
      if (remote.warnings && remote.warnings.length > 0) {
        warnings.value = [...(parseWarnings || []), ...remote.warnings]
      }
    } catch (e) {
      warnings.value = [...(parseWarnings || []), `后端解析服务不可用，embedding 无法生成: ${e.message}`]
    }
    return { components: recipeTableData.value, testData: testData.value, warnings: warnings.value, embedding, embeddingShape }
  }

  async function submitRecipeData(name, type, batch) {
    if (!name) return { success: false, message: '请输入配方名称' }
    if (!type) return { success: false, message: '请选择配方类型' }
    if (!batch) return { success: false, message: '请输入批次号' }
    const invalidRows = recipeTableData.value.filter(r => !r.percentage)
    if (invalidRows.length > 0) return { success: false, message: '请为所有组分填写比例' }
    const totalPct = recipeTableData.value.reduce((s, r) => s + (r.percentage || 0), 0)
    if (Math.abs(totalPct - 100) > 0.1) return { success: false, message: `组分百分比总和应为100%，当前为${totalPct.toFixed(1)}%` }
    try {
      const components = await Promise.all(recipeTableData.value.map(async (row) => {
        if (Object.keys(row.properties).length > 0 && !row.matchedMaterial) {
          const pw = {}
          Object.entries(row.properties).forEach(([key, property]) => {
            let value, unit = ''
            if (typeof property === 'object' && property !== null) {
              value = property.value; unit = property.unit || ''
            } else {
              value = property
              const prop = propertiesStore.findPureProperty(key)
              if (prop) unit = prop.unit || ''
            }
            pw[key] = { value, unit }
          })
          try {
            await addTableData('mp_properties', { properties: pw, mcId: row.materialId })
          } catch (e) { console.error('Error creating mp_properties:', e) }
        }
        return { original: row.original, materialId: row.materialId, percentage: row.percentage, properties: row.properties, componentType: row.componentType }
      }))
      const result = await submitRecipe({ name, type, batch, components, testData: testData.value })
      if (result.code === 200) {
        const recipeId = result.data?.recipeId
        if (Object.keys(testData.value).length > 0) {
          try {
            const tr = await registerTestData(recipeId ?? '', testData.value)
            if (tr.code !== 200) console.error('测试数据注册失败:', tr.message)
          } catch (e) { console.error('测试数据注册失败:', e) }
        }
        return { success: true, recipeId }
      }
      return { success: false, message: result.message || '请重试' }
    } catch (e) {
      console.error('Error:', e)
      return { success: false, message: '提交失败，请稍后重试' }
    }
  }

  function clear() {
    recipeTableData.value = []
    testData.value = {}
    warnings.value = []
    yamlMetaName.value = ''
  }

  return {
    allMaterials, allMpProperties, testData, recipeTableData, warnings, yamlMetaName, rawText,
    loadAllMaterials, loadMpProperties, ensureDataLoaded,
    isYamlFormat, parseYamlRecipe, parseValueWithUnit, parseRecipeText, parseRecipe,
    submitRecipeData, clear,
  }
}