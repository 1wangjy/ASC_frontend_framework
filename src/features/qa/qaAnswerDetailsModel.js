const DETAIL_LABELS = {
  cod: 'CoD 直接回答',
  omd: 'OMD 本体增强',
  logic: '详细推理链',
  reasoning: 'CoT / ToT 逻辑'
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

export function normalizeBackendAnswerText(value) {
  const source = String(value ?? '').replace(/\r\n?/g, '\n').trim()
  if (!source) return ''
  if (!/<[a-z][\s\S]*>/i.test(source)) return source

  return decodeHtmlEntities(source)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<\/?(?:ol|ul)\b[^>]*>/gi, '\n')
    .replace(/<(?:strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/(?:strong|b)\s*>/gi, '**')
    .replace(/<(?:i|em)\b[^>]*>/gi, '*')
    .replace(/<\/(?:i|em)\s*>/gi, '*')
    .replace(/<\/?(?:div|p|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<(?!\/?c\b)[^>]+>/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function classPattern(className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<div\\b[^>]*class=(['"])[^'"]*\\b${escaped}\\b[^'"]*\\1[^>]*>`, 'i')
}

function extractDivBlock(value, className) {
  const source = String(value ?? '')
  const opening = classPattern(className).exec(source)
  if (!opening) return null

  const tokenPattern = /<\/?div\b[^>]*>/gi
  tokenPattern.lastIndex = opening.index
  let depth = 0
  let token
  while ((token = tokenPattern.exec(source))) {
    if (/^<\/div/i.test(token[0])) depth -= 1
    else depth += 1
    if (depth === 0) {
      return {
        start: opening.index,
        end: tokenPattern.lastIndex,
        html: source.slice(opening.index, tokenPattern.lastIndex)
      }
    }
  }
  return null
}

function removeDivBlock(value, className) {
  const source = String(value ?? '')
  const block = extractDivBlock(source, className)
  return block ? `${source.slice(0, block.start)}${source.slice(block.end)}` : source
}

function removeAllDivBlocks(value, className) {
  let source = String(value ?? '')
  let next = removeDivBlock(source, className)
  while (next !== source) {
    source = next
    next = removeDivBlock(source, className)
  }
  return source
}

function withoutBlockTitle(value) {
  return removeDivBlock(value, 'direct-answer-block-title')
}

export function extractCodDirectAnswerText(value) {
  const source = String(value ?? '')
  const embeddedCod = extractDivBlock(source, 'cod-direct-answer-block')
  const codSource = embeddedCod?.html || removeDivBlock(source, 'omd-direct-answer-block')
  return normalizeBackendAnswerText(
    removeAllDivBlocks(withoutBlockTitle(codSource), 'qa-metric-grid')
  )
}

function withoutOuterDiv(value) {
  return String(value ?? '')
    .replace(/^\s*<div\b[^>]*>/i, '')
    .replace(/<\/div>\s*$/i, '')
}

function buildOmdScaffold(value) {
  const source = withoutOuterDiv(value)
  const titleMatch = source.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)
  const listMatch = source.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/i)
  const items = []

  if (listMatch) {
    const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
    let item
    while ((item = itemPattern.exec(listMatch[1]))) {
      const content = normalizeBackendAnswerText(item[1])
      if (content) items.push(content)
    }
  }

  const summary = normalizeBackendAnswerText(source
    .replace(/<strong\b[^>]*>[\s\S]*?<\/strong>/i, '')
    .replace(/<ol\b[^>]*>[\s\S]*?<\/ol>/i, ''))
  const title = normalizeBackendAnswerText(titleMatch?.[1] || '')

  if (!title && !summary && !items.length) return null
  return { title, summary, items }
}

function buildOmdDetail(value) {
  const source = removeAllDivBlocks(value, 'qa-metric-grid')
  const scaffoldBlock = extractDivBlock(source, 'omd-reasoning-scaffold')
  const leadSource = scaffoldBlock ? source.slice(0, scaffoldBlock.start) : source
  const tailSource = scaffoldBlock ? source.slice(scaffoldBlock.end) : ''
  const lead = normalizeBackendAnswerText(withoutBlockTitle(leadSource))
  const tail = normalizeBackendAnswerText(tailSource)
  const scaffold = scaffoldBlock ? buildOmdScaffold(scaffoldBlock.html) : null
  const content = [lead, tail].filter(Boolean).join('\n\n')

  if (!content && !scaffold) return null
  const detailRecord = {
    id: 'omd',
    label: DETAIL_LABELS.omd,
    content
  }
  return scaffold
    ? { ...detailRecord, omd: { lead, scaffold, tail } }
    : detailRecord
}

function detail(id, value) {
  const content = normalizeBackendAnswerText(value)
  return content ? { id, label: DETAIL_LABELS[id], content } : null
}

function normalizeReasoningPath(path, index) {
  if (!path || typeof path !== 'object') return null
  const naturalLanguagePath = String(path.natural_language_path ?? '').replace(/\s+/g, ' ').trim()
  const explicitNodes = Array.isArray(path.nodes)
    ? path.nodes
      .map(node => String(node?.name ?? '').trim())
      .filter(Boolean)
    : []
  const naturalNodes = naturalLanguagePath
    ? naturalLanguagePath
      .split(/\s*(?:→|->|⇒|=>|-->|—>| - | > )\s*/g)
      .map(value => value.trim())
      .filter(Boolean)
    : []
  const relations = Array.isArray(path.edges)
    ? path.edges
      .map(edge => String(edge?.name ?? edge?.relation ?? edge?.type ?? edge?.edge_name ?? '').trim())
      .filter(Boolean)
    : []
  const id = String(path.path_id ?? '').trim()
  const type = String(path.path_type ?? '').trim()
  const nodes = explicitNodes.length ? explicitNodes : naturalNodes

  if (!id && !type && !naturalLanguagePath && !nodes.length && !relations.length) return null
  return {
    id: id || `path-${index + 1}`,
    type,
    naturalLanguagePath,
    nodes,
    relations
  }
}

const ROUTE_FAMILIES = [
  {
    key: 'risk_tradeoff',
    label: '风险 / 权衡路线',
    patterns: [/风险|过量|过高|下降|冲突|trade[-\s]?off|weak|excess|reject|contradiction/i]
  },
  {
    key: 'protective_barrier',
    label: 'SiO2 保护层 / 氧扩散调控',
    patterns: [/sio2.*(?:富集|玻璃|保护)|二氧化硅.*(?:富集|玻璃|保护)|玻璃相|氧扩散|oxygen diffusion|抗氧化|oxidation resistance/i]
  },
  {
    key: 'oxidation_transport',
    label: 'SiC 氧化 / 孔隙连通路线',
    patterns: [/sic.*氧化|碳化硅.*氧化|孔隙连通|连通孔|pore connectivity|扩散通道/i]
  },
  {
    key: 'performance_retention',
    label: '强度保持 / 致密化路线',
    patterns: [/强度保持|strength retention|体积密度|bulk density|显气孔|apparent porosity|致密|density/i]
  },
  {
    key: 'evidence_validation',
    label: '证据校验 / 条件约束路线',
    patterns: [/evidence|证据|condition|条件|missing|缺失|表征|xrd|sem|eds|tg/i]
  }
]

const DEFAULT_ROUTE_FAMILY = {
  key: 'mechanism_chain',
  label: '通用机制链路线'
}

function routeModeLabel(value) {
  const mode = String(value ?? '').trim().toLowerCase()
  if (mode === 'auto') return 'Auto'
  if (mode === 'cot') return 'CoT'
  if (mode === 'tot') return 'ToT'
  return String(value ?? '').trim()
}

function formatPathScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  const percent = Math.abs(numeric) <= 1 ? numeric * 100 : numeric
  return `${percent.toFixed(2)}%`
}

function pathTexts(path) {
  const edges = Array.isArray(path?.edges) ? path.edges : []
  const evidence = Array.isArray(path?.evidence) ? path.evidence : []
  return {
    facts: edges
      .map(edge => String(edge?.fact ?? edge?.description ?? edge?.summary ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
    evidence: evidence
      .map(item => String(item?.quote ?? item?.text ?? item?.summary ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }
}

function inferRouteFamily(path, normalizedPath, texts) {
  const source = [
    path?.path_type,
    path?.natural_language_path,
    ...normalizedPath.nodes,
    ...normalizedPath.relations,
    ...texts.facts,
    ...texts.evidence,
    ...(Array.isArray(path?.missing_links) ? path.missing_links : []),
    ...(Array.isArray(path?.contradiction_hints) ? path.contradiction_hints : [])
  ].join(' ')
  return ROUTE_FAMILIES.find(family => family.patterns.some(pattern => pattern.test(source)))
    || DEFAULT_ROUTE_FAMILY
}

function buildRouteFamilies(rawPaths, paths) {
  const familyMap = new Map()
  rawPaths.forEach((path, index) => {
    const normalizedPath = paths[index]
    if (!normalizedPath) return
    const texts = pathTexts(path)
    const family = inferRouteFamily(path, normalizedPath, texts)
    const branch = {
      ...normalizedPath,
      branchLabel: `T${index + 1}`,
      role: index === 0 ? '主路径' : '候选路径',
      score: formatPathScore(path?.initial_score),
      facts: texts.facts,
      evidence: texts.evidence,
      missingLinks: Array.isArray(path?.missing_links)
        ? path.missing_links.map(value => String(value ?? '').trim()).filter(Boolean)
        : [],
      contradictions: Array.isArray(path?.contradiction_hints)
        ? path.contradiction_hints.map(value => String(value ?? '').trim()).filter(Boolean)
        : []
    }
    if (!familyMap.has(family.key)) {
      familyMap.set(family.key, {
        key: family.key,
        label: family.label,
        branches: []
      })
    }
    familyMap.get(family.key).branches.push(branch)
  })
  return Array.from(familyMap.values())
}

function normalizeTopologyKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w\u4e00-\u9fff]+/g, '')
}

function buildReasoningTopology(rawPaths, selectedPathIds, families) {
  const selectedIds = new Set(selectedPathIds)
  const familyByPathId = new Map()
  families.forEach(family => {
    family.branches.forEach(branch => familyByPathId.set(branch.id, family))
  })

  const nodeMap = new Map()
  const edgeMap = new Map()
  const branches = []

  rawPaths.forEach((rawPath, rawIndex) => {
    const path = normalizeReasoningPath(rawPath, rawIndex)
    if (!path || path.nodes.length === 0) return

    const family = familyByPathId.get(path.id) || DEFAULT_ROUTE_FAMILY
    const branch = {
      id: path.id,
      branchLabel: `T${rawIndex + 1}`,
      selected: selectedIds.has(path.id),
      score: formatPathScore(rawPath?.initial_score),
      type: path.type,
      familyKey: family.key,
      familyLabel: family.label,
      nodeIds: [],
      facts: pathTexts(rawPath).facts,
      evidence: pathTexts(rawPath).evidence
    }

    path.nodes.forEach((label, depth) => {
      const rawNode = Array.isArray(rawPath?.nodes) ? rawPath.nodes[depth] : null
      const normalizedLabel = normalizeTopologyKey(label) || `node${depth + 1}`
      const explicitNodeId = normalizeTopologyKey(rawNode?.uuid ?? rawNode?.id ?? '')
      const nodeId = explicitNodeId ? `kg-${depth}-id-${explicitNodeId}` : `kg-${depth}-${normalizedLabel}`
      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          id: nodeId,
          label,
          depth,
          entityType: String(rawNode?.entity_type ?? rawNode?.type ?? '').trim(),
          summary: String(rawNode?.summary ?? '').trim(),
          branchIds: []
        })
      }
      const topologyNode = nodeMap.get(nodeId)
      if (!topologyNode.branchIds.includes(path.id)) topologyNode.branchIds.push(path.id)
      branch.nodeIds.push(nodeId)

      if (depth === 0) return
      const sourceId = branch.nodeIds[depth - 1]
      const targetId = nodeId
      const rawEdge = Array.isArray(rawPath?.edges) ? rawPath.edges[depth - 1] : null
      const relation = path.relations[depth - 1] || ''
      const fact = String(rawEdge?.fact ?? rawEdge?.description ?? rawEdge?.summary ?? '').replace(/\s+/g, ' ').trim()
      const edgeKey = `${sourceId}->${targetId}::${normalizeTopologyKey(relation) || 'relation'}`
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          id: `edge-${edgeMap.size + 1}`,
          sourceId,
          targetId,
          relation,
          fact,
          branchIds: []
        })
      }
      const topologyEdge = edgeMap.get(edgeKey)
      if (!topologyEdge.branchIds.includes(path.id)) topologyEdge.branchIds.push(path.id)
    })

    branches.push(branch)
  })

  if (!branches.length) return null
  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
    branches,
    families: families.map(family => ({
      key: family.key,
      label: family.label,
      branchIds: family.branches.map(branch => branch.id).filter(id => branches.some(item => item.id === id))
    })).filter(family => family.branchIds.length)
  }
}

function normalizeRouteReason(value) {
  const reason = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (/auto selected tot because.*(?:multi-branch|semantically exploratory)/i.test(reason)) {
    return 'KG 子图包含多条分支或探索性语义，因此自动选择 ToT。'
  }
  if (/auto selected cot because/i.test(reason)) {
    return 'KG 子图路径较集中，因此自动选择 CoT。'
  }
  return reason
}

const DERIVATION_LABELS = new Set([
  '推理组织',
  '路径选择',
  '推导主线',
  '本体约束',
  '机制链',
  '结论边界',
  '证据状态',
  'ToT 分支组织',
  'CoT 逻辑链',
  'KG 路径逐步推导'
])

function ontologyTermsFrom(value) {
  const terms = []
  const pattern = /['"]canonical['"]\s*:\s*['"]([^'"]+)['"]/g
  let match
  while ((match = pattern.exec(value))) {
    const term = String(match[1] ?? '').trim()
    if (term && !terms.includes(term)) terms.push(term)
  }
  return terms
}

function readableOntologyConstraint(value) {
  const lastObjectEnd = value.lastIndexOf('}')
  const remainder = lastObjectEnd >= 0 ? value.slice(lastObjectEnd + 1) : value
  return remainder
    .replace(/^[\s、,，;；。]+/, '')
    .replace(/^优先/, '优先')
    .trim()
}

export function buildQaLogicDerivation(value) {
  const normalized = normalizeBackendAnswerText(value)
  if (!normalized) return null

  const ontologyTerms = ontologyTermsFrom(normalized)
  const sections = []
  let current = null
  const pushSection = (label, content = '') => {
    current = { label, content: String(content ?? '').trim(), items: [] }
    sections.push(current)
  }

  normalized.split('\n').map(line => line.trim()).filter(Boolean).forEach(line => {
    const bullet = line.match(/^[-•]\s*(.+)$/)
    if (bullet && current) {
      current.items.push(bullet[1].trim())
      return
    }

    const labelled = line.match(/^([^：:]{2,24})[：:]\s*(.*)$/)
    if (labelled) {
      const label = labelled[1].trim()
      let content = labelled[2].trim()
      if (/^CoD\s*生成的逻辑链$/i.test(label) && !content) {
        current = null
        return
      }
      if (DERIVATION_LABELS.has(label)) {
        if (label === '本体约束') content = readableOntologyConstraint(content)
        pushSection(label, content)
        return
      }
    }

    if (!current) pushSection('推理说明', line)
    else current.content = [current.content, line].filter(Boolean).join('\n')
  })

  const visibleSections = sections.filter(section => section.content || section.items.length || section.label === '本体约束')
  if (!visibleSections.length) return null
  return { sections: visibleSections, ontologyTerms }
}

export function buildQaReasoningTrace(result = {}) {
  const route = result?.reasoning_route && typeof result.reasoning_route === 'object'
    ? result.reasoning_route
    : result?.debug_trace?.adaptive_reasoning
  const rawPaths = Array.isArray(result?.routed_reasoning_paths) ? result.routed_reasoning_paths : []
  const paths = rawPaths.map(normalizeReasoningPath).filter(Boolean)
  if ((!route || typeof route !== 'object') && !paths.length) return null

  const mode = String(route?.selected_mode ?? '').trim().toLowerCase()
  const selectedPathIds = Array.isArray(route?.selected_path_ids)
    ? route.selected_path_ids.map(value => String(value ?? '').trim()).filter(Boolean)
    : []
  const requestedMode = String(route?.requested_mode ?? '').trim().toLowerCase()
  const structural = route?.structural_metrics && typeof route.structural_metrics === 'object'
    ? route.structural_metrics
    : {}
  const nodeCount = Number(structural.node_count)
  const relationCount = Number(structural.relation_count)
  const rootLabel = Number.isFinite(nodeCount) && Number.isFinite(relationCount)
    ? `${nodeCount} 个节点 · ${relationCount} 条关系`
    : `${paths.length} 条已选推理路径`
  const families = buildRouteFamilies(rawPaths, paths)
  return {
    mode,
    modeLabel: mode === 'cot' ? 'CoT' : mode === 'tot' ? 'ToT' : mode,
    routeLabel: [routeModeLabel(requestedMode), routeModeLabel(mode)].filter(Boolean).join(' → '),
    rootLabel,
    reason: normalizeRouteReason(route?.reason),
    selectedPathIds,
    paths,
    families,
    topology: buildReasoningTopology(rawPaths, selectedPathIds, families)
  }
}

function reasoningDetail(result) {
  const trace = buildQaReasoningTrace(result)
  return trace ? { id: 'reasoning', label: DETAIL_LABELS.reasoning, trace } : null
}

function logicDetail(result) {
  const content = normalizeBackendAnswerText(result?.logic_chain_derivation)
  if (!content) return null
  return {
    id: 'logic',
    label: DETAIL_LABELS.logic,
    content,
    derivation: buildQaLogicDerivation(content)
  }
}

export function buildQaAnswerDetails(result = {}) {
  const rawCod = String(result?.cod_direct_answer ?? '')
  const embeddedCod = extractDivBlock(rawCod, 'cod-direct-answer-block')
  const embeddedOmd = extractDivBlock(rawCod, 'omd-direct-answer-block')
  const codSource = embeddedCod?.html
    || removeDivBlock(rawCod, 'omd-direct-answer-block')
  const omdSource = embeddedOmd?.html
    || String(result?.ontology_direct_answer_gain ?? '').trim()

  return [
    detail('cod', withoutBlockTitle(codSource)),
    buildOmdDetail(omdSource),
    logicDetail(result),
    reasoningDetail(result)
  ].filter(Boolean)
}
