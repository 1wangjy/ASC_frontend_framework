const DOMAIN_CATEGORIES = {
  raw_material: '关键原料',
  mineral_phase: '矿物相/反应相',
  binder_system: '结合体系',
  process_parameter: '工艺参数',
  microstructure: '微观结构',
  performance_metric: '性能指标',
  service_mechanism: '服役机制',
  characterization: '表征方法'
}

const BASE_DOMAIN_TERMS = [
  ['刚玉骨料', 'raw_material'], ['板状刚玉', 'raw_material'], ['白刚玉', 'raw_material'],
  ['棕刚玉', 'raw_material'], ['碳化硅', 'raw_material'], ['鳞片石墨', 'raw_material'],
  ['石墨', 'raw_material'], ['硅微粉', 'raw_material'], ['B₄C', 'raw_material'], ['B4C', 'raw_material'],
  ['金属铝粉', 'raw_material'], ['金属硅粉', 'raw_material'], ['Al₂O₃', 'raw_material'],
  ['Al2O3', 'raw_material'], ['SiC', 'raw_material'], ['ASC', 'raw_material'],
  ['C', 'raw_material'],
  ['CAC水泥结合', 'binder_system'], ['CAC 水泥结合', 'binder_system'],
  ['铝酸钙水泥', 'binder_system'], ['水合氧化铝结合', 'binder_system'],
  ['无水泥结合', 'binder_system'], ['低水泥结合', 'binder_system'],
  ['莫来石相', 'mineral_phase'], ['莫来石', 'mineral_phase'], ['尖晶石', 'mineral_phase'],
  ['六铝酸钙', 'mineral_phase'], ['CA₆', 'mineral_phase'], ['CA6', 'mineral_phase'],
  ['SiO₂富集玻璃相', 'mineral_phase'], ['SiO₂ 富集玻璃相', 'mineral_phase'],
  ['SiO2玻璃相', 'mineral_phase'], ['SiO₂玻璃相', 'mineral_phase'], ['硅酸盐玻璃相', 'mineral_phase'],
  ['骨料–基质界面过渡区', 'microstructure'], ['骨料-基质界面过渡区', 'microstructure'],
  ['界面过渡区（ITZ）', 'microstructure'], ['界面过渡区(ITZ)', 'microstructure'],
  ['界面过渡区', 'microstructure'], ['ITZ', 'microstructure'], ['孔结构演化', 'microstructure'],
  ['孔喉连通性', 'microstructure'], ['开口孔隙率', 'microstructure'], ['显气孔率', 'microstructure'],
  ['脱碳层', 'microstructure'], ['微裂纹', 'microstructure'], ['反应层', 'microstructure'],
  ['氧化保护层', 'service_mechanism'], ['钝性氧化', 'service_mechanism'],
  ['活性氧化', 'service_mechanism'], ['氧扩散通量', 'service_mechanism'],
  ['渣渗透前沿', 'service_mechanism'], ['毛细渗透', 'service_mechanism'],
  ['抗渣侵蚀性能', 'performance_metric'], ['抗氧化性能', 'performance_metric'],
  ['热震稳定性', 'performance_metric'], ['热震后残余强度率', 'performance_metric'],
  ['常温耐压强度', 'performance_metric'], ['常温抗折强度', 'performance_metric'],
  ['高温抗折强度', 'performance_metric'], ['体积密度', 'performance_metric'],
  ['氧化增重', 'performance_metric'], ['渣侵蚀深度', 'performance_metric'],
  ['渣渗透深度', 'performance_metric'], ['永久线变化', 'performance_metric'],
  ['CCS', 'performance_metric'], ['CMOR', 'performance_metric'], ['HMOR', 'performance_metric'],
  ['Andreasen连续级配', 'process_parameter'], ['Dinger–Funk改进级配', 'process_parameter'],
  ['分布系数q', 'process_parameter'], ['临界加水量', 'process_parameter'],
  ['振动流动值', 'process_parameter'], ['升温速率', 'process_parameter'],
  ['保温时间', 'process_parameter'], ['排湿平台', 'process_parameter'],
  ['XRD物相分析', 'characterization'], ['XRD/Rietveld定量物相分析', 'characterization'],
  ['Rietveld定量物相分析', 'characterization'], ['SEM–EDS面扫描', 'characterization'],
  ['SEM-EDS面扫描', 'characterization'], ['EPMA元素面分布', 'characterization'],
  ['MIP压汞孔径分布', 'characterization'], ['X-ray μCT', 'characterization'],
  ['TG–DSC热分析', 'characterization'], ['Raman D/G峰强度比', 'characterization']
]

const TYPE_CATEGORY_RULES = [
  [/raw.?material|aggregate|powder|additive|composition|ratio/i, 'raw_material'],
  [/binder|cement|bond/i, 'binder_system'],
  [/phase|mineral|crystal|compound/i, 'mineral_phase'],
  [/process|condition|temperature|time|pressure|forming|sinter/i, 'process_parameter'],
  [/microstructure|interface|pore|defect|layer/i, 'microstructure'],
  [/property|performance|metric|strength|density|modulus/i, 'performance_metric'],
  [/mechanism|reaction|service|oxidation|corrosion|erosion/i, 'service_mechanism'],
  [/method|characterization|instrument|measurement|evidence/i, 'characterization']
]

const ROLE_CATEGORY_RULES = [
  [/composition|raw.?material|additive|aggregate/i, 'raw_material'],
  [/binder|bond/i, 'binder_system'],
  [/phase|mineral|crystal/i, 'mineral_phase'],
  [/process|condition|temperature|forming|sinter/i, 'process_parameter'],
  [/microstructure|interface|pore|defect/i, 'microstructure'],
  [/property|performance|metric|strength/i, 'performance_metric'],
  [/mechanism|reaction|service|oxidation|corrosion/i, 'service_mechanism'],
  [/method|characterization|measurement|evidence/i, 'characterization']
]

const CONTENT_PATTERNS = [
  [/(?:板状|电熔|白|棕)?刚玉(?:骨料|细粉)?/g, 'raw_material'],
  [/(?:碳化硅|鳞片石墨|石墨|硅微粉|铝酸钙水泥|水合氧化铝结合剂)/g, 'raw_material'],
  [/(?:CAC\s*水泥结合|低水泥结合|无水泥结合|水合氧化铝结合)/gi, 'binder_system'],
  [/(?:SiO[₂2]\s*)?(?:富集)?玻璃相|硅酸盐玻璃相|莫来石相?|尖晶石相?|六铝酸钙|CA[₆6]/gi, 'mineral_phase'],
  [/(?:骨料\s*[–—-]\s*基质)?界面过渡区(?:[（(]\s*ITZ\s*[）)])?|ITZ|孔结构演化|孔喉连通性|开口孔隙率|显气孔率|脱碳层|微裂纹|反应层/g, 'microstructure'],
  [/(?:氧化保护层|钝性氧化|活性氧化|氧扩散通量|渣渗透前沿|毛细渗透|界面反应机制)/g, 'service_mechanism'],
  [/(?:抗渣侵蚀性能|抗氧化性能|热震稳定性|热震后残余强度率|常温耐压强度|常温抗折强度|高温抗折强度|氧化增重|渣(?:侵蚀|渗透)深度|永久线变化|Weibull\s*模量)/gi, 'performance_metric'],
  [/(?:Andreasen\s*连续级配|Dinger[–—-]Funk\s*改进级配(?:模型)?|分布系数\s*q|临界加水量|振动流动值|升温速率|保温时间|排湿平台)/gi, 'process_parameter'],
  [/(?:XRD(?:\/Rietveld)?\s*(?:定量)?物相分析|Rietveld\s*定量物相分析|SEM\s*[–—/-]\s*EDS\s*(?:面扫描)?|EPMA\s*元素面分布|MIP\s*压汞孔径分布|X-ray\s*μCT|TG\s*[–—/-]\s*DSC\s*热分析|Raman\s*D\/G\s*峰强度比)/gi, 'characterization'],
  [/(?:Al[₂2]O[₃3]|SiO[₂2]|SiC|B[₄4]C|ASC)(?![A-Za-z0-9])/g, 'raw_material'],
  [/(?:CAC)(?![A-Za-z0-9])/g, 'binder_system'],
  [/(?:CMOR|CCS|HMOR)(?![A-Za-z0-9])/g, 'performance_metric']
]

const NAME_KEYS = new Set([
  'name', 'entity_name', 'source_node_name', 'target_node_name', 'source_name', 'target_name',
  'display_name', 'canonical_name', 'label'
])

const TYPE_KEYS = new Set([
  'type', 'entity_type', 'source_entity_type', 'target_entity_type', 'fact_type', 'labels'
])

const FACT_KEYS = new Set(['fact', 'quote', 'natural_language_path', 'summary', 'description'])

const SKIP_KEYS = new Set([
  'final_answer', 'llm_cod_direct_answer', 'cod_direct_answer', 'logic_chain_derivation',
  'raw_answer', 'document_text', 'content', 'prompt', 'system_prompt'
])

const normalizeTerm = (value) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\*\*|__|`/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const isProfessionalTerm = (value) => {
  const term = normalizeTerm(value)
  if (!term || term.length > 42) return false
  if (term.length === 1 && term !== 'C') return false
  if (!/[A-Za-z\u3400-\u9FFF]/u.test(term)) return false
  if (/^(?:材料|性能|结构|工艺|温度|方法|分析|研究|结果|体系|变量|指标)$/.test(term)) return false
  return true
}

const inferCategory = (term, typeHint = '', roleHint = '') => {
  const combinedType = Array.isArray(typeHint) ? typeHint.join(' ') : String(typeHint || '')
  for (const [pattern, category] of TYPE_CATEGORY_RULES) {
    if (pattern.test(combinedType)) return category
  }
  for (const [pattern, category] of ROLE_CATEGORY_RULES) {
    if (pattern.test(String(roleHint || ''))) return category
  }
  for (const [pattern, category] of CONTENT_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(String(term || ''))) return category
  }
  return ''
}

const addCandidate = (store, rawTerm, category, source, weight, metadata = {}) => {
  const term = normalizeTerm(rawTerm)
  if (!isProfessionalTerm(term) || !category) return
  const key = term.toLocaleLowerCase('zh-CN')
  const existing = store.get(key)
  if (existing && existing.weight >= weight) return
  store.set(key, {
    term,
    category,
    categoryLabel: DOMAIN_CATEGORIES[category] || category,
    source,
    weight,
    ...metadata
  })
}

const mineTermsFromText = (store, text, source, baseWeight) => {
  const value = normalizeTerm(text)
  if (!value) return
  for (const [pattern, category] of CONTENT_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of value.matchAll(pattern)) {
      addCandidate(store, match[0], category, source, baseWeight)
    }
  }
}

const collectStructuredKnowledge = (store, result) => {
  const factTexts = []
  const roleValues = []
  const visited = new WeakSet()
  let visitedCount = 0

  const walk = (value, key = '', parent = null, depth = 0, roleHint = '') => {
    if (value === null || value === undefined || depth > 8 || visitedCount > 2200) return
    if (typeof value === 'string') {
      if (SKIP_KEYS.has(key)) return
      if (NAME_KEYS.has(key)) {
        const typeHint = parent && typeof parent === 'object'
          ? key.startsWith('target_')
            ? parent.target_entity_type || parent.entity_type || parent.type || parent.labels
            : key.startsWith('source_')
              ? parent.source_entity_type || parent.entity_type || parent.type || parent.labels
              : parent.entity_type || parent.type || parent.labels || parent.source_entity_type || parent.target_entity_type
          : ''
        const category = inferCategory(value, typeHint, roleHint || key)
        addCandidate(store, value, category, 'kg_entity', 110, { entityType: typeHint || '' })
      } else if (FACT_KEYS.has(key)) {
        factTexts.push(value)
      } else if (roleHint) {
        roleValues.push({ value, roleHint })
      }
      return
    }
    if (typeof value !== 'object') return
    if (visited.has(value)) return
    visited.add(value)
    visitedCount += 1
    if (Array.isArray(value)) {
      value.slice(0, 120).forEach(item => walk(item, key, parent, depth + 1, roleHint))
      return
    }
    Object.entries(value).forEach(([childKey, childValue]) => {
      if (SKIP_KEYS.has(childKey)) return
      const nextRole = /semantic_roles?|composition|raw.?material|aggregate|additive|binder|bond|phase|mineral|microstructure|interface|pore|property|performance|metric|characterization|method|measurement|process|condition|mechanism|reaction|service/i.test(childKey)
        ? childKey
        : roleHint
      if (TYPE_KEYS.has(childKey)) return
      walk(childValue, childKey, value, depth + 1, nextRole)
    })
  }

  walk(result)
  roleValues.slice(0, 160).forEach(({ value, roleHint }) => {
    const category = inferCategory(value, '', roleHint)
    addCandidate(store, value, category, 'ontology_role', 102, { ontologyRole: roleHint })
  })
  factTexts.slice(0, 120).forEach(text => mineTermsFromText(store, text, 'kg_fact', 96))
}

export const buildAscDomainTerms = ({ content = '', question = '', result = null } = {}) => {
  const store = new Map()
  BASE_DOMAIN_TERMS.forEach(([term, category]) => addCandidate(store, term, category, 'asc_domain_lexicon', 60))
  mineTermsFromText(store, question, 'question', 105)
  collectStructuredKnowledge(store, result)
  mineTermsFromText(store, content, 'answer_context', 78)
  return [...store.values()].sort((a, b) => (
    b.term.length - a.term.length || b.weight - a.weight || a.term.localeCompare(b.term, 'zh-CN')
  ))
}

const isAsciiWordTerm = (term) => /^[A-Za-z0-9_+./₀-₉-]+$/.test(term)

const hasAsciiBoundary = (text, start, end) => {
  const before = start > 0 ? text[start - 1] : ''
  const after = end < text.length ? text[end] : ''
  return !/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)
}

export const findAscDomainTermMatches = (text, terms, { maxMatches = 8, maxPerSentence = 3 } = {}) => {
  const value = String(text || '')
  if (!value.trim()) return []
  const candidates = []
  for (const entry of terms || []) {
    const term = String(entry?.term || '')
    if (!term) continue
    let cursor = 0
    const foldedText = value.toLocaleLowerCase('zh-CN')
    const foldedTerm = term.toLocaleLowerCase('zh-CN')
    while (cursor < value.length) {
      const start = foldedText.indexOf(foldedTerm, cursor)
      if (start < 0) break
      const end = start + term.length
      if (!isAsciiWordTerm(term) || hasAsciiBoundary(value, start, end)) {
        candidates.push({ start, end, text: value.slice(start, end), ...entry })
      }
      cursor = Math.max(end, start + 1)
    }
  }

  candidates.sort((a, b) => (
    a.start - b.start || b.term.length - a.term.length || b.weight - a.weight
  ))
  const selected = []
  const sentenceCounts = new Map()
  for (const candidate of candidates) {
    if (selected.length >= maxMatches) break
    if (selected.some(item => candidate.start < item.end && candidate.end > item.start)) continue
    const sentenceIndex = (value.slice(0, candidate.start).match(/[。！？!?；;\n]/g) || []).length
    const sentenceCount = sentenceCounts.get(sentenceIndex) || 0
    if (sentenceCount >= maxPerSentence) continue
    selected.push(candidate)
    sentenceCounts.set(sentenceIndex, sentenceCount + 1)
  }
  return selected.sort((a, b) => a.start - b.start)
}

export const ascDomainCategoryLabels = DOMAIN_CATEGORIES
