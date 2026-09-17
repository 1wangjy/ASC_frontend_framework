<template>
  <section class="reasoning-topology" :class="`is-${mode || 'route'}`">
    <header class="reasoning-topology__hero">
      <div>
        <span>{{ mode === 'tot' ? 'Tree Search Canvas' : 'Linear Verification Canvas' }}</span>
        <strong>{{ mode === 'tot' ? 'Tree-of-Thought / 树状多分支' : 'Chain-of-Thought / 链式验证' }}</strong>
      </div>
      <div class="reasoning-topology__summary">
        <span>KG SUBGRAPH</span>
        <strong>{{ rootLabel }}</strong>
      </div>
    </header>

    <div class="reasoning-topology__viewport">
      <svg
        class="reasoning-topology__canvas"
        :viewBox="`0 0 ${layout.width} ${layout.height}`"
        :width="layout.width"
        :height="layout.height"
        role="img"
        :aria-label="mode === 'tot' ? 'Tree-of-Thought reasoning tree' : 'Chain-of-Thought reasoning chain'"
      >
        <defs>
          <marker
            v-for="(color, colorIndex) in colors"
            :id="`reasoning-arrow-${colorIndex}`"
            :key="color"
            viewBox="0 -5 10 10"
            refX="9"
            refY="0"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0,-5L10,0L0,5" :fill="color" />
          </marker>
          <filter id="reasoning-node-shadow" x="-20%" y="-30%" width="140%" height="160%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#0f172a" flood-opacity=".08" />
          </filter>
        </defs>

        <rect class="reasoning-topology__background" width="100%" height="100%" rx="16" />

        <g class="reasoning-topology__stages">
          <g v-for="stage in layout.stages" :key="stage.label" :transform="`translate(${stage.x}, 48)`">
            <rect :x="-stage.width / 2" y="-15" :width="stage.width" height="30" rx="15" />
            <text y="4" text-anchor="middle">{{ stage.label }}</text>
          </g>
        </g>

        <g class="reasoning-topology__legend">
          <text x="28" y="92">Thought paths</text>
          <g
            v-for="branch in layout.branches"
            :key="`legend-${branch.id}`"
            :transform="`translate(${branch.legendX}, ${branch.legendY})`"
          >
            <rect x="0" y="-14" :width="branch.legendWidth" height="23" rx="11.5" />
            <circle cx="12" cy="-2" r="4" :fill="branch.color" />
            <text x="23" y="2" :fill="branch.color">{{ branch.label }} {{ branch.score }}</text>
          </g>
        </g>

        <g v-for="family in layout.families" :key="family.key" class="reasoning-topology__family">
          <rect
            :x="layout.routeStartX - 86"
            :y="family.top"
            :width="layout.evaluateX - layout.routeStartX + 238"
            :height="family.height"
            rx="14"
            :fill="family.fill"
            :stroke="family.color"
          />
          <rect
            :x="layout.routeStartX - 72"
            :y="family.top + 12"
            :width="family.labelWidth"
            height="26"
            rx="13"
            fill="#fff"
            :stroke="family.color"
          />
          <text
            :x="layout.routeStartX - 58"
            :y="family.top + 30"
            :fill="family.color"
            class="reasoning-topology__family-label"
          >{{ family.label }} · {{ family.branchIds.length }} paths</text>
        </g>

        <g class="reasoning-topology__edges">
          <path
            v-for="edge in layout.entryEdges"
            :key="edge.id"
            :d="edge.path"
            fill="none"
            :stroke="edge.color"
            :stroke-width="edge.selected ? 3.5 : 2.3"
            :opacity="edge.selected ? .96 : .68"
            :marker-end="`url(#reasoning-arrow-${edge.colorIndex})`"
          >
            <title>{{ edge.title }}</title>
          </path>

          <g v-for="edge in layout.graphEdges" :key="edge.id">
            <path
              :d="edge.path"
              fill="none"
              :stroke="edge.color"
              :stroke-width="edge.selected ? 3.5 : 2.3"
              :opacity="edge.selected ? .96 : .72"
              :marker-end="`url(#reasoning-arrow-${edge.colorIndex})`"
            >
              <title>{{ edge.title }}</title>
            </path>
            <text
              v-if="edge.relation"
              :x="edge.labelX"
              :y="edge.labelY"
              text-anchor="middle"
              :fill="edge.color"
              class="reasoning-topology__edge-label"
            >{{ compact(edge.relation, 20) }}</text>
          </g>

          <path
            v-for="edge in layout.evaluateEdges"
            :key="edge.id"
            :d="edge.path"
            fill="none"
            :stroke="edge.color"
            :stroke-width="edge.selected ? 3.5 : 2.3"
            :opacity="edge.selected ? .96 : .7"
            :marker-end="`url(#reasoning-arrow-${edge.colorIndex})`"
          >
            <title>{{ edge.title }}</title>
          </path>

          <path
            v-for="edge in layout.selectEdges"
            :key="edge.id"
            :d="edge.path"
            fill="none"
            :stroke="edge.color"
            stroke-width="3"
            opacity=".82"
            :marker-end="`url(#reasoning-arrow-${edge.colorIndex})`"
          />
        </g>

        <foreignObject
          :x="layout.root.x - 94"
          :y="layout.root.y - 48"
          width="188"
          height="96"
          class="reasoning-topology__foreign"
        >
          <div xmlns="http://www.w3.org/1999/xhtml" class="reasoning-topology__structural-node is-problem">
            <small>Problem Root</small>
            <strong>{{ compact(question || '当前研究问题', 38) }}</strong>
            <span>KG search space</span>
          </div>
        </foreignObject>

        <foreignObject
          v-for="node in layout.nodes"
          :key="node.id"
          :x="node.x - 78"
          :y="node.y - 38"
          width="156"
          height="76"
          class="reasoning-topology__foreign"
        >
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            class="reasoning-topology__kg-node"
            :class="{ 'is-shared': node.branchIds.length > 1 }"
            :style="{ '--node-color': node.tone.color, '--node-fill': node.tone.fill }"
            :title="node.summary || node.label"
          >
            <small>{{ node.branchIds.length > 1 ? 'Merged node' : node.tone.label }}</small>
            <strong><QaAnswerText :text="node.label" :domain-terms="domainTerms" /></strong>
            <span>{{ node.branchIds.map(id => branchLabel(id)).join(' · ') }}</span>
          </div>
        </foreignObject>

        <foreignObject
          v-for="family in layout.families"
          :key="`eval-${family.key}`"
          :x="family.evaluate.x - 62"
          :y="family.evaluate.y - 34"
          width="124"
          height="68"
          class="reasoning-topology__foreign"
        >
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            class="reasoning-topology__structural-node is-evaluate"
            :style="{ '--route-color': family.color, '--route-fill': family.fill }"
          >
            <small>Route eval</small>
            <strong>{{ compact(family.label, 20) }}</strong>
            <span>{{ family.branchIds.length }} paths</span>
          </div>
        </foreignObject>

        <foreignObject
          :x="layout.select.x - 82"
          :y="layout.select.y - 44"
          width="164"
          height="88"
          class="reasoning-topology__foreign"
        >
          <div xmlns="http://www.w3.org/1999/xhtml" class="reasoning-topology__structural-node is-select">
            <small>Select Answer</small>
            <strong>选择结论</strong>
            <span>{{ layout.selectedLabels || '未返回选中路径' }}</span>
          </div>
        </foreignObject>
      </svg>
    </div>

    <details class="reasoning-topology__details">
      <summary>查看各路径的证据依据</summary>
      <div class="reasoning-topology__detail-grid">
        <article v-for="branch in topology.branches" :key="`detail-${branch.id}`">
          <header>
            <strong>{{ branchLabel(branch.id) }}</strong>
            <span>{{ branch.selected ? '选中路径' : '候选路径' }}<template v-if="branch.score"> · {{ branch.score }}</template></span>
          </header>
          <p v-for="fact in branch.facts" :key="fact"><QaAnswerText :text="fact" :domain-terms="domainTerms" /></p>
          <p v-for="evidence in branch.evidence" :key="evidence"><QaAnswerText :text="evidence" :domain-terms="domainTerms" /></p>
          <p v-if="!branch.facts.length && !branch.evidence.length">本路径没有返回额外证据说明。</p>
        </article>
      </div>
    </details>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import QaAnswerText from './QaAnswerText.js'

const props = defineProps({
  topology: { type: Object, required: true },
  question: { type: String, default: '' },
  rootLabel: { type: String, default: '' },
  mode: { type: String, default: '' },
  domainTerms: { type: Array, default: () => [] }
})

const colors = ['#0f766e', '#7c3aed', '#2563eb', '#c2410c', '#0891b2', '#be185d', '#4d7c0f', '#9333ea']
const fills = ['#ecfdf5', '#f5f3ff', '#eff6ff', '#fff7ed', '#ecfeff', '#fdf2f8', '#f7fee7', '#faf5ff']
const nodeTones = [
  { label: '性能结果', color: '#d97706', fill: '#fffbeb', pattern: /性能|强度|抗氧化|抗热震|抗渣|performance|strength/i },
  { label: '物相 / 保护层', color: '#0284c7', fill: '#f0f9ff', pattern: /sio2|二氧化硅|玻璃相|富集层|ca6|al2o3|phase/i },
  { label: '扩散 / 传输', color: '#2563eb', fill: '#eff6ff', pattern: /扩散|孔隙连通|孔隙封闭|传输|transport|diffusion/i },
  { label: '反应机制', color: '#059669', fill: '#ecfdf5', pattern: /氧化|反应|mechanism|reaction/i },
  { label: '显微结构', color: '#7c3aed', fill: '#f5f3ff', pattern: /气孔|密度|粒径|裂纹|界面|microstructure|porosity/i },
  { label: '组成变量', color: '#0f766e', fill: '#f0fdfa', pattern: /sic|碳源|残碳|al2o3|成分|组成|rawmaterial|composition/i },
  { label: '风险 / 权衡', color: '#e11d48', fill: '#fff1f2', pattern: /风险|下降|冲突|trade|risk|conflict/i }
]
const fallbackTone = { label: '推理节点', color: '#64748b', fill: '#f8fafc' }

const compact = (value, limit) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

const branchLabel = id => props.topology.branches.find(branch => branch.id === id)?.branchLabel || id
const curve = (source, target, sourceOffset = 0, targetOffset = 0) => {
  const sx = source.x + (source.width || 0) / 2
  const sy = source.y + sourceOffset
  const tx = target.x - (target.width || 0) / 2
  const ty = target.y + targetOffset
  const mx = sx + Math.max(34, (tx - sx) / 2)
  return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`
}

const layout = computed(() => {
  const topology = props.topology
  const branchCount = Math.max(1, topology.branches.length)
  const maxDepth = Math.max(0, ...topology.nodes.map(node => node.depth))
  const routeStartX = 360
  const nodeGapX = 220
  const evaluateX = routeStartX + (maxDepth + 1) * nodeGapX
  const selectX = evaluateX + 230
  const width = Math.max(1180, selectX + 130)
  const laneStartY = 190
  const laneGapY = 128
  const height = Math.max(500, laneStartY + (branchCount - 1) * laneGapY + 130)

  const orderedBranchIds = topology.families.flatMap(family => family.branchIds)
  const orderedBranches = [
    ...orderedBranchIds.map(id => topology.branches.find(branch => branch.id === id)).filter(Boolean),
    ...topology.branches.filter(branch => !orderedBranchIds.includes(branch.id))
  ]
  const branches = orderedBranches.map((branch, index) => {
    const colorIndex = index % colors.length
    const label = branch.branchLabel || `T${index + 1}`
    return {
      ...branch,
      label,
      index,
      colorIndex,
      color: colors[colorIndex],
      y: laneStartY + index * laneGapY,
      legendWidth: Math.max(74, `${label} ${branch.score || ''}`.length * 7 + 30),
      legendX: 128 + index * 94,
      legendY: 88
    }
  })
  let legendX = 128
  let legendY = 88
  branches.forEach(branch => {
    if (legendX + branch.legendWidth > width - 180) {
      legendX = 128
      legendY += 28
    }
    branch.legendX = legendX
    branch.legendY = legendY
    legendX += branch.legendWidth + 10
  })
  const branchMap = new Map(branches.map(branch => [branch.id, branch]))

  const nodes = topology.nodes.map(node => {
    const branchYs = node.branchIds.map(id => branchMap.get(id)?.y).filter(Number.isFinite)
    const y = branchYs.reduce((sum, value) => sum + value, 0) / Math.max(1, branchYs.length)
    const tone = nodeTones.find(item => item.pattern.test(`${node.label} ${node.entityType} ${node.summary}`)) || fallbackTone
    return {
      ...node,
      x: routeStartX + node.depth * nodeGapX,
      y,
      width: 156,
      tone
    }
  })
  const nodeMap = new Map(nodes.map(node => [node.id, node]))

  const rootY = branches.reduce((sum, branch) => sum + branch.y, 0) / branchCount
  const root = { x: 124, y: rootY, width: 188 }
  const select = { x: selectX, y: rootY, width: 164 }

  const families = topology.families.map((family, index) => {
    const familyBranches = family.branchIds.map(id => branchMap.get(id)).filter(Boolean)
    const minY = Math.min(...familyBranches.map(branch => branch.y))
    const maxY = Math.max(...familyBranches.map(branch => branch.y))
    const color = colors[index % colors.length]
    return {
      ...family,
      color,
      fill: fills[index % fills.length],
      top: minY - 58,
      height: maxY - minY + 116,
      labelWidth: Math.max(150, Math.min(300, family.label.length * 12 + 82)),
      evaluate: { x: evaluateX, y: (minY + maxY) / 2, width: 124 }
    }
  })
  const familyMap = new Map(families.map(family => [family.key, family]))

  const entryEdges = branches.map(branch => {
    const firstNode = nodeMap.get(branch.nodeIds[0])
    const offset = (branch.index - (branchCount - 1) / 2) * 6
    return {
      id: `entry-${branch.id}`,
      path: curve(root, firstNode, offset, offset),
      color: branch.color,
      colorIndex: branch.colorIndex,
      selected: branch.selected,
      title: `${branch.label}: route entry`
    }
  }).filter(edge => edge.path)

  const graphEdges = topology.edges.flatMap((edge, edgeIndex) => edge.branchIds.map((branchId, occurrenceIndex) => {
    const branch = branchMap.get(branchId)
    const source = nodeMap.get(edge.sourceId)
    const target = nodeMap.get(edge.targetId)
    if (!branch || !source || !target) return null
    const offset = (occurrenceIndex - (edge.branchIds.length - 1) / 2) * 7
    return {
      id: `${edge.id}-${branchId}-${edgeIndex}`,
      path: curve(source, target, offset, offset),
      color: branch.color,
      colorIndex: branch.colorIndex,
      selected: branch.selected,
      relation: edge.relation,
      labelX: (source.x + target.x) / 2,
      labelY: (source.y + target.y) / 2 - 12 + offset,
      title: [branch.label, edge.relation, edge.fact].filter(Boolean).join(' · ')
    }
  }).filter(Boolean))

  const evaluateEdges = branches.map(branch => {
    const lastNode = nodeMap.get(branch.nodeIds.at(-1))
    const family = familyMap.get(branch.familyKey) || families[0]
    if (!lastNode || !family) return null
    return {
      id: `evaluate-${branch.id}`,
      path: curve(lastNode, family.evaluate),
      color: branch.color,
      colorIndex: branch.colorIndex,
      selected: branch.selected,
      title: `${branch.label}: route evaluate`
    }
  }).filter(Boolean)

  const selectEdges = families.map((family, index) => ({
    id: `select-${family.key}`,
    path: curve(family.evaluate, select),
    color: family.color,
    colorIndex: index % colors.length
  }))

  return {
    width,
    height,
    routeStartX,
    evaluateX,
    branches,
    nodes,
    families,
    root,
    select,
    entryEdges,
    graphEdges,
    evaluateEdges,
    selectEdges,
    selectedLabels: branches.filter(branch => branch.selected).map(branch => branch.label).join(' · '),
    stages: props.mode === 'tot'
      ? [
        { label: 'Problem', x: root.x, width: 84 },
        { label: 'Logic route lanes', x: (routeStartX + evaluateX) / 2, width: 142 },
        { label: 'Route evaluate', x: evaluateX, width: 120 },
        { label: 'Select', x: select.x, width: 76 }
      ]
      : [
        { label: 'Question', x: root.x, width: 88 },
        { label: 'Verified KG chain', x: (routeStartX + evaluateX) / 2, width: 140 },
        { label: 'Path verify', x: evaluateX, width: 104 },
        { label: 'Answer', x: select.x, width: 80 }
      ]
  }
})
</script>

<style scoped>
.reasoning-topology { display: grid; gap: var(--qa-space-3); }
.reasoning-topology__hero { display: flex; align-items: center; justify-content: space-between; gap: var(--qa-space-6); padding: var(--qa-space-3) var(--qa-panel-pad); border: 1px solid var(--qa-border-color); border-radius: var(--qa-radius-card); background: var(--qa-surface-soft); }
.reasoning-topology__hero > div { display: grid; gap: var(--qa-space-1); }
.reasoning-topology__hero span { color: var(--qa-muted); font-size: var(--qa-font-xs); font-weight: var(--qa-weight-heavy); letter-spacing: .06em; text-transform: uppercase; }
.reasoning-topology__hero strong { color: var(--qa-heading); font-size: var(--qa-control-font); }
.reasoning-topology__summary { text-align: right; }
.reasoning-topology__viewport { overflow: auto; border: 1px solid var(--qa-border-color); border-radius: var(--qa-radius-container); background: var(--qa-surface-soft); }
.reasoning-topology__canvas { display: block; min-width: 1120px; }
.reasoning-topology__background { fill: #fbfdff; }
.reasoning-topology__stages rect { fill: #fff; stroke: #6c8da4; stroke-width: 1; }
.reasoning-topology__stages text { fill: #31506a; font-size: 12px; font-weight: 850; }
.reasoning-topology__legend > text { fill: #64748b; font-size: 11px; font-weight: 850; }
.reasoning-topology__legend rect { fill: #fff; stroke: #d7e5ee; }
.reasoning-topology__legend text { font-size: 11px; font-weight: 850; }
.reasoning-topology__family > rect:first-child { opacity: .28; }
.reasoning-topology__family-label { font-size: 11px; font-weight: 850; }
.reasoning-topology__edge-label { font-size: 11px; font-weight: 850; paint-order: stroke; stroke: #fbfdff; stroke-width: 4px; }
.reasoning-topology__foreign { overflow: visible; }
.reasoning-topology__structural-node, .reasoning-topology__kg-node { box-sizing: border-box; width: 100%; height: 100%; display: grid; align-content: center; gap: var(--qa-space-1); padding: var(--qa-space-2) var(--qa-space-3); border-radius: var(--qa-radius-card); background: var(--qa-surface); box-shadow: 0 6px 16px rgba(15, 23, 42, .08); font-family: inherit; overflow: hidden; }
.reasoning-topology__structural-node small, .reasoning-topology__kg-node small { color: #64748b; font-size: 10px; font-weight: 850; letter-spacing: .06em; text-transform: uppercase; }
.reasoning-topology__structural-node strong, .reasoning-topology__kg-node strong { color: #173650; font-size: 11px; line-height: 1.35; }
.reasoning-topology__structural-node span, .reasoning-topology__kg-node span { overflow: hidden; color: #6b8295; font-size: 10px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.reasoning-topology__structural-node.is-problem { border: 1.5px solid #7c3aed; background: #faf7ff; }
.reasoning-topology__structural-node.is-evaluate { border: 1.5px solid var(--route-color); background: var(--route-fill); }
.reasoning-topology__structural-node.is-select { border: 1.5px solid #0f766e; background: #ecfdf5; }
.reasoning-topology__kg-node { border: 1.5px solid var(--node-color); background: var(--node-fill); }
.reasoning-topology__kg-node.is-shared { box-shadow: 0 0 0 3px rgba(14, 116, 110, .1), 0 6px 16px rgba(15, 23, 42, .08); }
.reasoning-topology__kg-node :deep(.qa-domain-term) { color: #0f766e; }
.reasoning-topology__details { border: 1px solid var(--qa-border-color); border-radius: var(--qa-radius-card); background: var(--qa-surface); }
.reasoning-topology__details summary { min-height: var(--qa-panel-head-h); display: flex; align-items: center; padding: 0 var(--qa-panel-pad); color: var(--qa-heading); font-size: var(--qa-control-font); font-weight: var(--qa-weight-heavy); cursor: pointer; }
.reasoning-topology__detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--qa-space-2); padding: 0 var(--qa-space-3) var(--qa-space-3); }
.reasoning-topology__detail-grid article { padding: var(--qa-space-2) var(--qa-space-3); border: 1px solid var(--qa-border-color); border-radius: var(--qa-radius-control); }
.reasoning-topology__detail-grid header { display: flex; justify-content: space-between; gap: var(--qa-space-3); color: var(--qa-text); font-size: var(--qa-font-sm); }
.reasoning-topology__detail-grid p { margin: var(--qa-space-2) 0 0; color: var(--qa-text); font-size: var(--qa-control-font); line-height: 1.6; }
@media (max-width: 760px) {
  .reasoning-topology__hero { align-items: flex-start; flex-direction: column; }
  .reasoning-topology__summary { text-align: left; }
  .reasoning-topology__detail-grid { grid-template-columns: 1fr; }
}
</style>
