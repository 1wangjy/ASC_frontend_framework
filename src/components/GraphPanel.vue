<template>
  <div class="graph-panel">
    <div class="panel-header">
      <span class="panel-title">图谱关系可视化</span>
      <!-- 顶部工具栏 (Internal Top Right) -->
      <div class="header-tools">
        <button class="tool-btn" @click="$emit('refresh')" :disabled="loading" title="刷新图谱">
          <span class="icon-refresh" :class="{ 'spinning': loading }">↻</span>
          <span class="btn-text">刷新</span>
        </button>
        <button class="tool-btn" @click="$emit('toggle-maximize')" title="最大化/还原">
          <span class="icon-maximize">⛶</span>
        </button>
      </div>
    </div>
    
    <div class="graph-container" ref="graphContainer">
      <!-- 图谱可视化 -->
      <div v-if="graphData" class="graph-view">
        <svg ref="graphSvg" class="graph-svg"></svg>
        
        <!-- 构建中/模拟中提示 -->
        <div v-if="currentPhase === 1 || currentPhase === 3 || isSimulating" class="graph-building-hint">
          <div class="memory-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="memory-icon">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-4.04z" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-4.04z" />
            </svg>
          </div>
          {{ isSimulating ? 'GraphRAG长短期记忆实时更新中' : '实时更新中...' }}
        </div>
        
        <!-- 模拟结束后的提示 -->
        <div v-if="showSimulationFinishedHint" class="graph-building-hint finished-hint">
          <div class="hint-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hint-icon">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <span class="hint-text">还有少量内容处理中，建议稍后手动刷新图谱</span>
          <button class="hint-close-btn" @click="dismissFinishedHint" title="关闭提示">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <!-- 节点/边详情面板 -->
        <div v-if="selectedItem" class="detail-panel">
          <div class="detail-panel-header">
            <span class="detail-title">{{ selectedItem.type === 'node' ? '节点详情' : '关系详情' }}</span>
            <span v-if="selectedItem.type === 'node'" class="detail-type-badge" :style="{ background: selectedItem.color, color: '#fff' }">
              {{ selectedItem.entityType }}
            </span>
            <button class="detail-close" @click="closeDetailPanel">×</button>
          </div>
          
          <!-- 节点详情 -->
          <div v-if="selectedItem.type === 'node'" class="detail-content">
            <div class="detail-row">
              <span class="detail-label">名称:</span>
              <span class="detail-value">{{ displayNodeName(selectedItem.data) }}</span>
            </div>
            <div class="detail-row" v-if="englishNodeName(selectedItem.data)">
              <span class="detail-label">英文名称:</span>
              <span class="detail-value">{{ englishNodeName(selectedItem.data) }}</span>
            </div>
            <div class="detail-row" v-if="selectedItem.data.name_original && selectedItem.data.name_original !== displayNodeName(selectedItem.data)">
              <span class="detail-label">原名称:</span>
              <span class="detail-value">{{ selectedItem.data.name_original }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">UUID:</span>
              <span class="detail-value uuid-text">{{ selectedItem.data.uuid }}</span>
            </div>
            <div class="detail-row" v-if="selectedItem.data.created_at">
              <span class="detail-label">创建时间:</span>
              <span class="detail-value">{{ formatDateTime(selectedItem.data.created_at) }}</span>
            </div>
            
            <!-- Properties -->
            <div class="detail-section" v-if="selectedItem.data.attributes && Object.keys(selectedItem.data.attributes).length > 0">
              <div class="section-title">属性:</div>
              <div class="properties-list">
                <div v-for="(value, key) in selectedItem.data.attributes" :key="key" class="property-item">
                  <span class="property-key">{{ key }}:</span>
                  <span class="property-value">{{ value || '无' }}</span>
                </div>
              </div>
            </div>
            
            <!-- Summary -->
            <div class="detail-section" v-if="selectedItem.data.summary">
              <div class="section-title">摘要:</div>
              <div class="summary-text">{{ selectedItem.data.summary }}</div>
            </div>
            
            <!-- Labels -->
            <div class="detail-section" v-if="selectedItem.data.labels && selectedItem.data.labels.length > 0">
              <div class="section-title">类型:</div>
              <div class="labels-list">
                <span v-for="label in selectedItem.data.labels" :key="label" class="label-tag">
                  {{ displayEntityType(label) }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- 边详情 -->
          <div v-else class="detail-content">
            <!-- 自环组详情 -->
            <template v-if="selectedItem.data.isSelfLoopGroup">
              <div class="edge-relation-header self-loop-header">
                {{ selectedItem.data.source_name }} - 自关联
                <span class="self-loop-count">{{ selectedItem.data.selfLoopCount }} 条</span>
              </div>
              
              <div class="self-loop-list">
                <div 
                  v-for="(loop, idx) in selectedItem.data.selfLoopEdges" 
                  :key="loop.uuid || idx" 
                  class="self-loop-item"
                  :class="{ expanded: expandedSelfLoops.has(loop.uuid || idx) }"
                >
                  <div 
                    class="self-loop-item-header"
                    @click="toggleSelfLoop(loop.uuid || idx)"
                  >
                    <span class="self-loop-index">#{{ idx + 1 }}</span>
                    <span class="self-loop-name">{{ displayRelationName(loop) }}</span>
                    <span class="self-loop-toggle">{{ expandedSelfLoops.has(loop.uuid || idx) ? '−' : '+' }}</span>
                  </div>
                  
                  <div class="self-loop-item-content" v-show="expandedSelfLoops.has(loop.uuid || idx)">
                    <div class="detail-row" v-if="loop.uuid">
                      <span class="detail-label">UUID:</span>
                      <span class="detail-value uuid-text">{{ loop.uuid }}</span>
                    </div>
                    <div class="detail-row" v-if="loop.fact">
                      <span class="detail-label">事实:</span>
                      <span class="detail-value fact-text">{{ loop.fact }}</span>
                    </div>
                    <div class="detail-row" v-if="loop.fact_type">
                      <span class="detail-label">类型:</span>
                      <span class="detail-value">{{ displayRelationName(loop) }}</span>
                    </div>
                    <div class="detail-row" v-if="loop.created_at">
                      <span class="detail-label">创建时间:</span>
                      <span class="detail-value">{{ formatDateTime(loop.created_at) }}</span>
                    </div>
                    <div v-if="loop.episodes && loop.episodes.length > 0" class="self-loop-episodes">
                      <span class="detail-label">片段:</span>
                      <div class="episodes-list compact">
                        <span v-for="ep in loop.episodes" :key="ep" class="episode-tag small">{{ ep }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            
            <!-- 普通边详情 -->
            <template v-else>
              <div class="edge-relation-header">
                {{ selectedItem.data.source_name }} → {{ displayRelationName(selectedItem.data) }} → {{ selectedItem.data.target_name }}
              </div>
              
              <div class="detail-row">
                <span class="detail-label">UUID:</span>
                <span class="detail-value uuid-text">{{ selectedItem.data.uuid }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">关系:</span>
                <span class="detail-value">{{ displayRelationName(selectedItem.data) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">类型:</span>
                <span class="detail-value">{{ displayRelationName(selectedItem.data) }}</span>
              </div>
              <div class="detail-row" v-if="selectedItem.data.fact">
                <span class="detail-label">事实:</span>
                <span class="detail-value fact-text">{{ selectedItem.data.fact }}</span>
              </div>
              
              <!-- Episodes -->
              <div class="detail-section" v-if="selectedItem.data.episodes && selectedItem.data.episodes.length > 0">
                <div class="section-title">片段:</div>
                <div class="episodes-list">
                  <span v-for="ep in selectedItem.data.episodes" :key="ep" class="episode-tag">
                    {{ ep }}
                  </span>
                </div>
              </div>
              
              <div class="detail-row" v-if="selectedItem.data.created_at">
                <span class="detail-label">创建时间:</span>
                <span class="detail-value">{{ formatDateTime(selectedItem.data.created_at) }}</span>
              </div>
              <div class="detail-row" v-if="selectedItem.data.valid_at">
                <span class="detail-label">生效时间:</span>
                <span class="detail-value">{{ formatDateTime(selectedItem.data.valid_at) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
      
      <!-- 加载状态 -->
      <div v-else-if="loading" class="graph-state">
        <div class="loading-spinner"></div>
        <p>图谱数据加载中...</p>
      </div>
      
      <!-- 等待/空状态 -->
      <div v-else class="graph-state">
        <div class="empty-icon">❖</div>
        <p class="empty-text">等待图谱构建...</p>
      </div>
    </div>

    <!-- 底部图例 (Bottom Left) -->
    <div v-if="graphData && entityTypes.length" class="graph-legend">
      <span class="legend-title">实体类型</span>
      <div class="legend-items">
        <div class="legend-item" v-for="type in entityTypes" :key="type.name">
          <span class="legend-dot" :style="{ background: type.color }"></span>
          <span class="legend-label">{{ type.name }}</span>
        </div>
      </div>
    </div>
    
    <!-- 显示边标签开关 -->
    <div v-if="graphData" class="edge-labels-toggle">
      <label class="toggle-switch">
        <input type="checkbox" v-model="showEdgeLabels" />
        <span class="slider"></span>
      </label>
      <span class="toggle-label">显示关系标签</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  graphData: Object,
  loading: Boolean,
  currentPhase: Number,
  isSimulating: Boolean
})

const emit = defineEmits(['refresh', 'toggle-maximize'])

const graphContainer = ref(null)
const graphSvg = ref(null)
const selectedItem = ref(null)
const showEdgeLabels = ref(true) // 默认显示边标签
const expandedSelfLoops = ref(new Set()) // 展开的自环项
const showSimulationFinishedHint = ref(false) // 模拟结束后的提示
const wasSimulating = ref(false) // 追踪之前是否在模拟中

const ALLOWED_KNOWLEDGE_ENTITY_TYPES = new Set([
  'Material',
  'Composition',
  'RawMaterial',
  'Additive',
  'Process',
  'Parameter',
  'Phase',
  'Mechanism',
  'Property',
  'Characterization',
  'Application',
  'FailureMode',
  'OptimizationStrategy',
  'RawMaterialRatio',
  'FormingProcess',
  'PostTreatmentProcess',
  'ReactionMechanism',
  'HighTemperatureReaction',
  'PhaseEvolution',
  'Microstructure',
  'PropertyMetric',
  'CharacterizationMethod',
  'SpectrumFeature'
])

const ALLOWED_KNOWLEDGE_RELATION_TYPES = new Set([
  'CONTAINS_COMPONENT',
  'PREPARED_BY',
  'CHARACTERIZED_BY',
  'HAS_PROPERTY',
  'INDUCES_PHASE_CHANGE',
  'FORMS_STRUCTURE',
  'AFFECTS_PROPERTY',
  'DEGRADES_BY',
  'OPTIMIZED_BY',
  'APPLIED_TO',
  'HAS_COMPOSITION_OR_RATIO',
  'USES_PROCESS',
  'PROCESS_SEQUENCE_OR_CONDITION',
  'PROCESS_INDUCES_REACTION',
  'REACTION_OR_MECHANISM_DRIVES_PHASE',
  'PHASE_SHAPES_MICROSTRUCTURE',
  'METHOD_MEASURES_PROPERTY',
  'METHOD_OBSERVES_FEATURE',
  'FEATURE_INDICATES_KNOWLEDGE',
  'FACTOR_AFFECTS_PERFORMANCE',
  'COMPOSITION_CONSTRAINS_PROCESS',
  'PROCESS_OR_COMPOSITION_INDUCES_REACTION',
  'PROCESS_CONDITION_TRIGGERS_REACTION',
  'REACTION_DRIVES_PHASE_EVOLUTION',
  'FEATURE_SUPPORTS_STRUCTURE_OR_PHASE',
  'COMPOSITION_AFFECTS_PROPERTY'
])

const ENTITY_TYPE_LABELS = {
  Entity: '实体',
  Node: '节点',
  Material: '材料体系',
  Composition: '组成配方',
  RawMaterial: '原料',
  Additive: '添加剂',
  Process: '工艺',
  Parameter: '参数',
  Phase: '物相',
  Mechanism: '机制',
  Property: '性能',
  Characterization: '表征',
  Application: '应用',
  FailureMode: '失效模式',
  OptimizationStrategy: '优化策略',
  RawMaterialRatio: '原料配比',
  FormingProcess: '成型工艺',
  PostTreatmentProcess: '后处理工艺',
  ReactionMechanism: '反应机理',
  HighTemperatureReaction: '高温反应',
  PhaseEvolution: '物相演变',
  Microstructure: '微观结构',
  PropertyMetric: '性能指标',
  CharacterizationMethod: '表征方法',
  SpectrumFeature: '图谱特征',
  RawMaterialParameter: '原料参数',
  FormulationRatioParameter: '配比参数',
  PreparationProcess: '制备工艺',
  FiringSchedule: '烧成制度',
  HeatTreatmentSchedule: '热处理制度',
  CorrelationPattern: '关联规律',
  DamageMechanism: '损毁机制',
  MitigationStrategy: '抑制策略',
  KeyConclusion: '核心结论',
  OptimalFormulation: '最优配比',
  EngineeringRecommendation: '工程建议',
  MaterialSystem: '材料体系',
  Component: '组分',
  Sample: '样品',
  ProcessStep: '工艺步骤',
  Phase: '物相',
  MicrostructureFeature: '显微结构特征',
  DegradationBehavior: '失效行为',
  EvidenceAnchor: '证据锚点'
}

const ENTITY_TYPE_COLORS = {
  Material: '#2F6B4F',
  Composition: '#FF6B35',
  RawMaterial: '#C7522A',
  Additive: '#D8892C',
  Process: '#004E89',
  Parameter: '#4A6FA5',
  Phase: '#E9724C',
  Mechanism: '#1A936F',
  Property: '#7B2D8E',
  Characterization: '#27ae60',
  Application: '#5B5F97',
  FailureMode: '#C5283D',
  OptimizationStrategy: '#6A994E',
  RawMaterialRatio: '#FF6B35',
  FormingProcess: '#004E89',
  PostTreatmentProcess: '#7B2D8E',
  ReactionMechanism: '#1A936F',
  HighTemperatureReaction: '#C5283D',
  PhaseEvolution: '#E9724C',
  Microstructure: '#3498db',
  PropertyMetric: '#9b59b6',
  CharacterizationMethod: '#27ae60',
  SpectrumFeature: '#f39c12',
  RawMaterialParameter: '#FF6B35',
  FormulationRatioParameter: '#FF6B35',
  PreparationProcess: '#004E89',
  FiringSchedule: '#004E89',
  HeatTreatmentSchedule: '#004E89',
  CorrelationPattern: '#1A936F',
  DamageMechanism: '#C5283D',
  MitigationStrategy: '#1A936F',
  KeyConclusion: '#7B2D8E',
  OptimalFormulation: '#FF6B35',
  EngineeringRecommendation: '#7B2D8E',
  MaterialSystem: '#FF6B35',
  Component: '#FF6B35',
  Sample: '#004E89',
  ProcessStep: '#004E89',
  Phase: '#E9724C',
  MicrostructureFeature: '#3498db',
  DegradationBehavior: '#C5283D',
  EvidenceAnchor: '#27ae60'
}

const RELATION_LABELS = {
  CONTAINS_COMPONENT: '包含组分',
  PREPARED_BY: '由工艺制备',
  CHARACTERIZED_BY: '由表征验证',
  HAS_PROPERTY: '具有性能',
  INDUCES_PHASE_CHANGE: '诱导物相变化',
  FORMS_STRUCTURE: '形成结构',
  AFFECTS_PROPERTY: '影响性能',
  DEGRADES_BY: '受失效劣化',
  OPTIMIZED_BY: '由策略优化',
  APPLIED_TO: '应用于',
  HAS_COMPOSITION_OR_RATIO: '具有组成或配比',
  USES_PROCESS: '采用工艺',
  PROCESS_SEQUENCE_OR_CONDITION: '工艺顺序或条件',
  PROCESS_INDUCES_REACTION: '工艺诱发反应',
  REACTION_OR_MECHANISM_DRIVES_PHASE: '反应或机理驱动物相',
  PHASE_SHAPES_MICROSTRUCTURE: '物相影响微观结构',
  METHOD_MEASURES_PROPERTY: '表征方法测量性能',
  METHOD_OBSERVES_FEATURE: '表征方法观测特征',
  FEATURE_INDICATES_KNOWLEDGE: '特征指示知识点',
  FACTOR_AFFECTS_PERFORMANCE: '因素影响性能',
  GRAPH_CONTEXT_BRIDGE: '图谱上下文桥接',
  COMPOSITION_CONSTRAINS_PROCESS: '配比约束工艺',
  PROCESS_OR_COMPOSITION_INDUCES_REACTION: '配方或工艺诱发反应',
  PROCESS_CONDITION_TRIGGERS_REACTION: '工艺条件触发反应',
  REACTION_DRIVES_PHASE_EVOLUTION: '反应驱动物相演变',
  FEATURE_SUPPORTS_STRUCTURE_OR_PHASE: '特征支持结构或物相判断',
  COMPOSITION_AFFECTS_PROPERTY: '配比影响性能',
  RATIO_USES_FORMING_PROCESS: '采用工艺',
  RATIO_USES_POST_TREATMENT: '采用工艺',
  POST_TREATMENT_TRIGGERS_REACTION: '工艺诱发反应',
  REACTION_EXPLAINS_MECHANISM: '工艺诱发反应',
  MECHANISM_DRIVES_PHASE_EVOLUTION: '反应或机理驱动物相',
  PHASE_EVOLUTION_FORMS_MICROSTRUCTURE: '物相影响微观结构',
  METHOD_OBSERVES_SPECTRUM_FEATURE: '表征方法观测特征',
  SPECTRUM_FEATURE_INDICATES_PHASE: '特征指示知识点',
  MICROSTRUCTURE_AFFECTS_PROPERTY: '因素影响性能',
  PROCESS_AFFECTS_PROPERTY: '因素影响性能',
  RAW_MATERIAL_DEFINES_RATIO: '原料决定配比',
  RATIO_SUPPORTS_OPTIMUM: '配比支持最优方案',
  RATIO_USES_PREPARATION: '配比采用制备工艺',
  PREPARATION_INCLUDES_FORMING: '制备包含成型',
  PREPARATION_INCLUDES_FIRING: '制备包含烧成',
  PREPARATION_INCLUDES_HEAT_TREATMENT: '制备包含热处理',
  THERMAL_CONDITION_TRIGGERS_REACTION: '热制度触发高温反应',
  PROCESS_CONTROLS_MICROSTRUCTURE: '工艺调控微观结构',
  FEATURE_INDICATES_PHASE_EVOLUTION: '图谱特征指示物相演变',
  KNOWLEDGE_AFFECTS_PROPERTY: '知识点影响性能',
  FACTOR_SUPPORTS_CORRELATION: '因素支持关联规律',
  REACTION_CAUSES_DAMAGE: '反应导致损毁',
  DAMAGE_DEGRADES_PROPERTY: '损毁劣化性能',
  STRATEGY_SUPPRESSES_DAMAGE: '策略抑制损毁',
  EVIDENCE_SUPPORTS_CONCLUSION: '证据支持核心结论',
  CONCLUSION_GUIDES_RECOMMENDATION: '结论指导工程建议',
  AFFECTS_PROPERTY: '影响性能',
  ARE_ALTERED_BY: '受其改变',
  CONTAINS_COMPONENT: '包含组分',
  EXHIBITS_DEGRADATION: '表现失效行为',
  FORMS_PHASE: '形成物相',
  HAS_MICROSTRUCTURE: '具有显微结构',
  HAS_SAMPLE: '包含样品',
  IS_A: '属于',
  IS_ALSO: '也属于',
  MEASURED_PROPERTY: '测得性能',
  NEED_TO_WITHSTAND: '需要承受',
  OCCURS_DURING: '发生于',
  PROCESSED_BY: '经过工艺',
  RELATED: '相关',
  RELATED_TO: '相关于',
  SELF_LOOP: '自关联',
  SUPPORTED_BY: '证据支持',
  USED_IN: '用于',
  USES_COMPONENT: '使用组分'
}

const NODE_NAME_LABELS = {
  'al2o3-sic-c': '氧化铝-碳化硅-碳体系',
  al2o3: '氧化铝',
  alumina: '氧化铝',
  sic: '碳化硅',
  graphite: '石墨',
  carbon: '碳',
  refractory: '耐火材料',
  refractories: '耐火材料',
  niobium: '铌',
  spinel: '尖晶石',
  pores: '孔隙',
  pore: '孔隙',
  'pore network': '孔隙网络',
  crack: '裂纹',
  cracks: '裂纹',
  'crack growth': '裂纹扩展',
  'thermal shock': '热震',
  corrosion: '侵蚀',
  oxidation: '氧化',
  'chemical corrosion': '化学侵蚀',
  'lining refractory': '内衬耐火材料'
}

const hasCjk = (value) => /[\u4e00-\u9fff]/.test(value || '')

const normalizeKey = (value) => String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ')

const displayEntityType = (type) => {
  const cleanType = String(type || 'Entity').trim()
  return ENTITY_TYPE_LABELS[cleanType] || cleanType
}

const getKnowledgeEntityType = (node) => {
  const labels = node?.labels || []
  return labels.find(label => ALLOWED_KNOWLEDGE_ENTITY_TYPES.has(label)) || null
}

const relationKey = (edge) => String(edge?.name || edge?.fact_type || edge?.type || 'RELATED')
  .trim()
  .toUpperCase()
  .replace(/[\s-]+/g, '_')

const translateNodeName = (name) => {
  const cleanName = String(name || '').trim()
  if (!cleanName || hasCjk(cleanName)) return cleanName
  const lower = cleanName.toLowerCase()
  const normalized = normalizeKey(cleanName)
  return NODE_NAME_LABELS[lower] || NODE_NAME_LABELS[normalized] || cleanName
}

const displayNodeName = (node) => {
  if (!node) return ''
  return node.name_zh || node.display_name || translateNodeName(node.name || node.name_original || '')
}

const englishNodeName = (node) => {
  if (!node) return ''
  return String(node.name_en || node.attributes?.canonical_name_en || '').trim()
}

const displayRelationName = (edge) => {
  if (!edge) return '相关'
  if (edge.name_zh) return edge.name_zh
  const rawName = edge.name || edge.fact_type || edge.type || 'RELATED'
  const normalized = String(rawName || 'RELATED').trim().toUpperCase().replace(/[\s-]+/g, '_')
  return RELATION_LABELS[normalized] || rawName
}

const isGraphContextBridge = (edge) => {
  return relationKey(edge?.rawData || edge) === 'GRAPH_CONTEXT_BRIDGE' || edge?.rawData?.attributes?.synthetic_bridge === true
}

const isKnowledgeRelation = (edge) => {
  return ALLOWED_KNOWLEDGE_RELATION_TYPES.has(relationKey(edge)) && !isGraphContextBridge(edge)
}

const truncateGraphLabel = (label) => {
  const text = String(label || '')
  const maxLength = hasCjk(text) ? 10 : 12
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

// 关闭模拟结束提示
const dismissFinishedHint = () => {
  showSimulationFinishedHint.value = false
}

// 监听 isSimulating 变化，检测模拟结束
watch(() => props.isSimulating, (newValue, oldValue) => {
  if (wasSimulating.value && !newValue) {
    // 从模拟中变为非模拟状态，显示结束提示
    showSimulationFinishedHint.value = true
  }
  wasSimulating.value = newValue
}, { immediate: true })

// 切换自环项展开/折叠状态
const toggleSelfLoop = (id) => {
  const newSet = new Set(expandedSelfLoops.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  expandedSelfLoops.value = newSet
}

// 计算实体类型用于图例
const entityTypes = computed(() => {
  if (!props.graphData?.nodes) return []
  const typeMap = {}
  // Fallback palette for legacy or unknown entity types.
  const colors = ['#FF6B35', '#004E89', '#7B2D8E', '#1A936F', '#C5283D', '#E9724C', '#3498db', '#9b59b6', '#27ae60', '#f39c12']
  
  props.graphData.nodes.forEach(node => {
    const type = getKnowledgeEntityType(node)
    if (!type) return
    if (!typeMap[type]) {
      typeMap[type] = {
        rawName: type,
        name: displayEntityType(type),
        count: 0,
        color: ENTITY_TYPE_COLORS[type] || colors[Object.keys(typeMap).length % colors.length]
      }
    }
    typeMap[type].count++
  })
  return Object.values(typeMap)
})

// 格式化时间
const formatDateTime = (dateStr) => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true 
    })
  } catch {
    return dateStr
  }
}

const closeDetailPanel = () => {
  selectedItem.value = null
  expandedSelfLoops.value = new Set() // 重置展开状态
}

let currentSimulation = null
let linkLabelsRef = null
let linkLabelBgRef = null
let resizeObserver = null
let renderRetryTimer = null
let zeroSizeRetryCount = 0
let lastRenderedGraphSignature = ''
let lastGraphRenderAt = 0

const GRAPH_RENDER_MIN_INTERVAL_MS = 1800

const graphRenderSignature = (data) => {
  if (!data) return 'empty'
  const nodes = data.nodes || []
  const edges = data.edges || []
  const nodeCount = data.node_count || data.nodes?.length || 0
  const edgeCount = data.edge_count || data.edges?.length || 0
  const realtimeRound = data.professional_realtime_round ?? data.base_realtime_batch ?? ''
  const nodeLimit = data.base_realtime_node_limit ?? data.professional_requested_new_node_count ?? ''
  const edgeLimit = data.base_realtime_edge_limit ?? data.professional_requested_new_edge_count ?? ''
  const firstNode = nodes[0]?.id || nodes[0]?.uuid || nodes[0]?.name || ''
  const lastNode = nodes[nodes.length - 1]?.id || nodes[nodes.length - 1]?.uuid || nodes[nodes.length - 1]?.name || ''
  const firstEdge = edges[0]?.id || edges[0]?.uuid || edges[0]?.source || ''
  const lastEdge = edges[edges.length - 1]?.id || edges[edges.length - 1]?.uuid || edges[edges.length - 1]?.target || ''
  return [nodeCount, edgeCount, realtimeRound, nodeLimit, edgeLimit, firstNode, lastNode, firstEdge, lastEdge].join(':')
}

const clearRenderRetry = () => {
  if (renderRetryTimer) {
    clearTimeout(renderRetryTimer)
    renderRetryTimer = null
  }
}

const scheduleRenderGraph = (delay = 80, force = false) => {
  clearRenderRetry()
  const elapsed = Date.now() - lastGraphRenderAt
  const throttleDelay = force ? delay : Math.max(delay, GRAPH_RENDER_MIN_INTERVAL_MS - elapsed)
  renderRetryTimer = setTimeout(() => {
    nextTick(renderGraph)
  }, throttleDelay)
}

const renderGraph = () => {
  if (!graphSvg.value || !props.graphData) return
  lastGraphRenderAt = Date.now()
  
  // 停止之前的仿真
  if (currentSimulation) {
    currentSimulation.stop()
  }
  
  const container = graphContainer.value
  const rect = container?.getBoundingClientRect()
  const width = Math.floor(rect?.width || container?.clientWidth || 0)
  const height = Math.floor(rect?.height || container?.clientHeight || 0)
  if (width <= 20 || height <= 20) {
    if (zeroSizeRetryCount < 8) {
      zeroSizeRetryCount += 1
      scheduleRenderGraph(120, true)
    }
    return
  }
  zeroSizeRetryCount = 0
  
  const svg = d3.select(graphSvg.value)
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    
  svg.selectAll('*').remove()
  
  const nodesData = (props.graphData.nodes || []).filter(node => getKnowledgeEntityType(node))
  const edgesData = props.graphData.edges || []
  
  if (nodesData.length === 0) return

  // Prep data
  const nodeMap = {}
  nodesData.forEach(n => nodeMap[n.uuid] = n)
  
  const nodes = nodesData.map(n => ({
    id: n.uuid,
    name: displayNodeName(n) || '未命名节点',
    type: getKnowledgeEntityType(n),
    rawData: {
      ...n,
      display_name: displayNodeName(n) || '未命名节点'
    }
  }))
  
  const nodeIds = new Set(nodes.map(n => n.id))
  
  // 处理边数据，计算同一对节点间的边数量和索引
  const edgePairCount = {}
  const selfLoopEdges = {} // 按节点分组的自环边
  const tempEdges = edgesData
    .filter(e => (
      nodeIds.has(e.source_node_uuid) &&
      nodeIds.has(e.target_node_uuid) &&
      isKnowledgeRelation(e)
    ))
  
  // 统计每对节点之间的边数量，收集自环边
  tempEdges.forEach(e => {
    if (e.source_node_uuid === e.target_node_uuid) {
      // 自环 - 收集到数组中
      if (!selfLoopEdges[e.source_node_uuid]) {
        selfLoopEdges[e.source_node_uuid] = []
      }
      selfLoopEdges[e.source_node_uuid].push({
        ...e,
        source_name: displayNodeName(nodeMap[e.source_node_uuid]),
        target_name: displayNodeName(nodeMap[e.target_node_uuid])
      })
    } else {
      const pairKey = [e.source_node_uuid, e.target_node_uuid].sort().join('_')
      edgePairCount[pairKey] = (edgePairCount[pairKey] || 0) + 1
    }
  })

  // 记录当前处理到每对节点的第几条边
  const edgePairIndex = {}
  const processedSelfLoopNodes = new Set() // 已处理的自环节点
  
  const edges = []
  
  tempEdges.forEach(e => {
    const isSelfLoop = e.source_node_uuid === e.target_node_uuid
    
    if (isSelfLoop) {
      // 自环边 - 每个节点只添加一条合并的自环
      if (processedSelfLoopNodes.has(e.source_node_uuid)) {
        return // 已处理过，跳过
      }
      processedSelfLoopNodes.add(e.source_node_uuid)
      
      const allSelfLoops = selfLoopEdges[e.source_node_uuid]
      const nodeName = displayNodeName(nodeMap[e.source_node_uuid]) || '未知节点'
      
      edges.push({
        source: e.source_node_uuid,
        target: e.target_node_uuid,
        type: 'SELF_LOOP',
        name: `自关联（${allSelfLoops.length}）`,
        curvature: 0,
        isSelfLoop: true,
        rawData: {
          isSelfLoopGroup: true,
          source_name: nodeName,
          target_name: nodeName,
          selfLoopCount: allSelfLoops.length,
          selfLoopEdges: allSelfLoops // 存储所有自环边的详细信息
        }
      })
      return
    }
    
    const pairKey = [e.source_node_uuid, e.target_node_uuid].sort().join('_')
    const totalCount = edgePairCount[pairKey]
    const currentIndex = edgePairIndex[pairKey] || 0
    edgePairIndex[pairKey] = currentIndex + 1
    
    // 判断边的方向是否与标准化方向一致（源UUID < 目标UUID）
    const isReversed = e.source_node_uuid > e.target_node_uuid
    
    // 计算曲率：多条边时分散开，单条边为直线
    let curvature = 0
    if (totalCount > 1) {
      // 均匀分布曲率，确保明显区分
      // 曲率范围根据边数量增加，边越多曲率范围越大
      const curvatureRange = Math.min(1.2, 0.6 + totalCount * 0.15)
      curvature = ((currentIndex / (totalCount - 1)) - 0.5) * curvatureRange * 2
      
      // 如果边的方向与标准化方向相反，翻转曲率
      // 这样确保所有边在同一参考系下分布，不会因方向不同而重叠
      if (isReversed) {
        curvature = -curvature
      }
    }
    
    edges.push({
      source: e.source_node_uuid,
      target: e.target_node_uuid,
      type: e.fact_type || e.name || 'RELATED',
      name: displayRelationName(e),
      curvature,
      isSelfLoop: false,
      pairIndex: currentIndex,
      pairTotal: totalCount,
      rawData: {
        ...e,
        source_name: displayNodeName(nodeMap[e.source_node_uuid]),
        target_name: displayNodeName(nodeMap[e.target_node_uuid])
      }
    })
  })

  const degreeByNode = {}
  nodes.forEach(n => {
    degreeByNode[n.id] = 0
  })
  edges.forEach(e => {
    if (e.isSelfLoop) return
    degreeByNode[e.source] = (degreeByNode[e.source] || 0) + 1
    degreeByNode[e.target] = (degreeByNode[e.target] || 0) + 1
  })
  nodes.forEach(n => {
    n.degree = degreeByNode[n.id] || 0
  })
    
  // Color scale
  const colorMap = {}
  entityTypes.value.forEach(t => colorMap[t.rawName] = t.color)
  const getColor = (type) => colorMap[type] || '#999'

  // Simulation - 根据边数量动态调整节点间距
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(d => {
      // 根据这对节点之间的边数量动态调整距离
      // 基础距离 150，每多一条边增加 40
      const baseDistance = isGraphContextBridge(d) ? 110 : 150
      const edgeCount = d.pairTotal || 1
      return baseDistance + (edgeCount - 1) * 50
    }))
    .force('charge', d3.forceManyBody().strength(d => d.degree > 0 ? -360 : -90))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(50))
    // 添加向中心的引力，让独立的节点群聚集到中心区域
    .force('x', d3.forceX(width / 2).strength(d => d.degree > 0 ? 0.045 : 0.18))
    .force('y', d3.forceY(height / 2).strength(d => d.degree > 0 ? 0.045 : 0.18))
  
  currentSimulation = simulation

  const g = svg.append('g')
  
  // Zoom
  svg.call(d3.zoom().extent([[0, 0], [width, height]]).scaleExtent([0.1, 4]).on('zoom', (event) => {
    g.attr('transform', event.transform)
  }))

  // Links - 使用 path 支持曲线
  const linkGroup = g.append('g').attr('class', 'links')
  
  // 计算曲线路径
  const getLinkPath = (d) => {
    const sx = d.source.x, sy = d.source.y
    const tx = d.target.x, ty = d.target.y
    
    // 检测自环
    if (d.isSelfLoop) {
      // 自环：绘制一个圆弧从节点出发再返回
      const loopRadius = 30
      // 从节点右侧出发，绕一圈回来
      const x1 = sx + 8  // 起点偏移
      const y1 = sy - 4
      const x2 = sx + 8  // 终点偏移
      const y2 = sy + 4
      // 使用圆弧绘制自环（sweep-flag=1 顺时针）
      return `M${x1},${y1} A${loopRadius},${loopRadius} 0 1,1 ${x2},${y2}`
    }
    
    if (d.curvature === 0) {
      // 直线
      return `M${sx},${sy} L${tx},${ty}`
    }
    
    // 计算曲线控制点 - 根据边数量和距离动态调整
    const dx = tx - sx, dy = ty - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    // 垂直于连线方向的偏移，根据距离比例计算，保证曲线明显可见
    // 边越多，偏移量占距离的比例越大
    const pairTotal = d.pairTotal || 1
    const offsetRatio = 0.25 + pairTotal * 0.05 // 基础25%，每多一条边增加5%
    const baseOffset = Math.max(35, dist * offsetRatio)
    const offsetX = -dy / dist * d.curvature * baseOffset
    const offsetY = dx / dist * d.curvature * baseOffset
    const cx = (sx + tx) / 2 + offsetX
    const cy = (sy + ty) / 2 + offsetY
    
    return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`
  }
  
  // 计算曲线中点（用于标签定位）
  const getLinkMidpoint = (d) => {
    const sx = d.source.x, sy = d.source.y
    const tx = d.target.x, ty = d.target.y
    
    // 检测自环
    if (d.isSelfLoop) {
      // 自环标签位置：节点右侧
      return { x: sx + 70, y: sy }
    }
    
    if (d.curvature === 0) {
      return { x: (sx + tx) / 2, y: (sy + ty) / 2 }
    }
    
    // 二次贝塞尔曲线的中点 t=0.5
    const dx = tx - sx, dy = ty - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const pairTotal = d.pairTotal || 1
    const offsetRatio = 0.25 + pairTotal * 0.05
    const baseOffset = Math.max(35, dist * offsetRatio)
    const offsetX = -dy / dist * d.curvature * baseOffset
    const offsetY = dx / dist * d.curvature * baseOffset
    const cx = (sx + tx) / 2 + offsetX
    const cy = (sy + ty) / 2 + offsetY
    
    // 二次贝塞尔曲线公式 B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2, t=0.5
    const midX = 0.25 * sx + 0.5 * cx + 0.25 * tx
    const midY = 0.25 * sy + 0.5 * cy + 0.25 * ty
    
    return { x: midX, y: midY }
  }
  
  const link = linkGroup.selectAll('path')
    .data(edges)
    .enter().append('path')
    .attr('stroke', d => isGraphContextBridge(d) ? '#D0D5DD' : '#C0C0C0')
    .attr('stroke-width', d => isGraphContextBridge(d) ? 1.1 : 1.5)
    .attr('stroke-dasharray', d => isGraphContextBridge(d) ? '4 4' : null)
    .attr('fill', 'none')
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation()
      // 重置之前选中边的样式
      linkGroup.selectAll('path')
        .attr('stroke', d => isGraphContextBridge(d) ? '#D0D5DD' : '#C0C0C0')
        .attr('stroke-width', d => isGraphContextBridge(d) ? 1.1 : 1.5)
        .attr('stroke-dasharray', d => isGraphContextBridge(d) ? '4 4' : null)
      linkLabelBg.attr('fill', 'rgba(255,255,255,0.95)')
      linkLabels.attr('fill', '#666')
      // 高亮当前选中的边
      d3.select(event.target).attr('stroke', '#3498db').attr('stroke-width', 3).attr('stroke-dasharray', null)
      
      selectedItem.value = {
        type: 'edge',
        data: d.rawData
      }
    })

  // Link labels background (白色背景使文字更清晰)
  const linkLabelBg = linkGroup.selectAll('rect')
    .data(edges)
    .enter().append('rect')
    .attr('fill', 'rgba(255,255,255,0.95)')
    .attr('rx', 3)
    .attr('ry', 3)
    .style('cursor', 'pointer')
    .style('pointer-events', 'all')
    .style('display', showEdgeLabels.value ? 'block' : 'none')
    .on('click', (event, d) => {
      event.stopPropagation()
      linkGroup.selectAll('path')
        .attr('stroke', d => isGraphContextBridge(d) ? '#D0D5DD' : '#C0C0C0')
        .attr('stroke-width', d => isGraphContextBridge(d) ? 1.1 : 1.5)
        .attr('stroke-dasharray', d => isGraphContextBridge(d) ? '4 4' : null)
      linkLabelBg.attr('fill', 'rgba(255,255,255,0.95)')
      linkLabels.attr('fill', '#666')
      // 高亮对应的边
      link.filter(l => l === d).attr('stroke', '#3498db').attr('stroke-width', 3).attr('stroke-dasharray', null)
      d3.select(event.target).attr('fill', 'rgba(52, 152, 219, 0.1)')
      
      selectedItem.value = {
        type: 'edge',
        data: d.rawData
      }
    })

  // Link labels
  const linkLabels = linkGroup.selectAll('text')
    .data(edges)
    .enter().append('text')
    .text(d => d.name)
    .attr('font-size', '9px')
    .attr('fill', '#666')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .style('cursor', 'pointer')
    .style('pointer-events', 'all')
    .style('font-family', 'system-ui, sans-serif')
    .style('display', showEdgeLabels.value ? 'block' : 'none')
    .on('click', (event, d) => {
      event.stopPropagation()
      linkGroup.selectAll('path')
        .attr('stroke', d => isGraphContextBridge(d) ? '#D0D5DD' : '#C0C0C0')
        .attr('stroke-width', d => isGraphContextBridge(d) ? 1.1 : 1.5)
        .attr('stroke-dasharray', d => isGraphContextBridge(d) ? '4 4' : null)
      linkLabelBg.attr('fill', 'rgba(255,255,255,0.95)')
      linkLabels.attr('fill', '#666')
      // 高亮对应的边
      link.filter(l => l === d).attr('stroke', '#3498db').attr('stroke-width', 3).attr('stroke-dasharray', null)
      d3.select(event.target).attr('fill', '#3498db')
      
      selectedItem.value = {
        type: 'edge',
        data: d.rawData
      }
    })
  
  // 保存引用供外部控制显隐
  linkLabelsRef = linkLabels
  linkLabelBgRef = linkLabelBg

  // Nodes group
  const nodeGroup = g.append('g').attr('class', 'nodes')
  
  // Node circles
  const node = nodeGroup.selectAll('circle')
    .data(nodes)
    .enter().append('circle')
    .attr('r', 10)
    .attr('fill', d => getColor(d.type))
    .attr('stroke', '#fff')
    .attr('stroke-width', 2.5)
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (event, d) => {
        // 只记录位置，不重启仿真（区分点击和拖拽）
        d.fx = d.x
        d.fy = d.y
        d._dragStartX = event.x
        d._dragStartY = event.y
        d._isDragging = false
      })
      .on('drag', (event, d) => {
        // 检测是否真正开始拖拽（移动超过阈值）
        const dx = event.x - d._dragStartX
        const dy = event.y - d._dragStartY
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (!d._isDragging && distance > 3) {
          // 首次检测到真正拖拽，才重启仿真
          d._isDragging = true
          simulation.alphaTarget(0.3).restart()
        }
        
        if (d._isDragging) {
          d.fx = event.x
          d.fy = event.y
        }
      })
      .on('end', (event, d) => {
        // 只有真正拖拽过才让仿真逐渐停止
        if (d._isDragging) {
          simulation.alphaTarget(0)
        }
        d.fx = null
        d.fy = null
        d._isDragging = false
      })
    )
    .on('click', (event, d) => {
      event.stopPropagation()
      // 重置所有节点样式
      node.attr('stroke', '#fff').attr('stroke-width', 2.5)
      linkGroup.selectAll('path')
        .attr('stroke', d => isGraphContextBridge(d) ? '#D0D5DD' : '#C0C0C0')
        .attr('stroke-width', d => isGraphContextBridge(d) ? 1.1 : 1.5)
        .attr('stroke-dasharray', d => isGraphContextBridge(d) ? '4 4' : null)
      // 高亮选中节点
      d3.select(event.target).attr('stroke', '#E91E63').attr('stroke-width', 4)
      // 高亮与此节点相连的边
      link.filter(l => l.source.id === d.id || l.target.id === d.id)
        .attr('stroke', '#E91E63')
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', null)
      
      selectedItem.value = {
        type: 'node',
        data: d.rawData,
        entityType: displayEntityType(d.type),
        color: getColor(d.type)
      }
    })
    .on('mouseenter', (event, d) => {
      if (!selectedItem.value || selectedItem.value.data?.uuid !== d.rawData.uuid) {
        d3.select(event.target).attr('stroke', '#333').attr('stroke-width', 3)
      }
    })
    .on('mouseleave', (event, d) => {
      if (!selectedItem.value || selectedItem.value.data?.uuid !== d.rawData.uuid) {
        d3.select(event.target).attr('stroke', '#fff').attr('stroke-width', 2.5)
      }
    })

  // Node Labels
  const nodeLabels = nodeGroup.selectAll('text')
    .data(nodes)
    .enter().append('text')
    .text(d => truncateGraphLabel(d.name))
    .attr('font-size', '11px')
    .attr('fill', '#333')
    .attr('font-weight', '500')
    .attr('dx', 14)
    .attr('dy', 4)
    .style('pointer-events', 'none')
    .style('font-family', 'system-ui, sans-serif')

  simulation.on('tick', () => {
    // 更新曲线路径
    link.attr('d', d => getLinkPath(d))
    
    // 更新边标签位置（无旋转，水平显示更清晰）
    linkLabels.each(function(d) {
      const mid = getLinkMidpoint(d)
      d3.select(this)
        .attr('x', mid.x)
        .attr('y', mid.y)
        .attr('transform', '') // 移除旋转，保持水平
    })
    
    // 更新边标签背景
    linkLabelBg.each(function(d, i) {
      const mid = getLinkMidpoint(d)
      const textEl = linkLabels.nodes()[i]
      const bbox = textEl.getBBox()
      d3.select(this)
        .attr('x', mid.x - bbox.width / 2 - 4)
        .attr('y', mid.y - bbox.height / 2 - 2)
        .attr('width', bbox.width + 8)
        .attr('height', bbox.height + 4)
        .attr('transform', '') // 移除旋转
    })

    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)

    nodeLabels
      .attr('x', d => d.x)
      .attr('y', d => d.y)
  })
  
  // 点击空白处关闭详情面板
  svg.on('click', () => {
    selectedItem.value = null
    node.attr('stroke', '#fff').attr('stroke-width', 2.5)
    linkGroup.selectAll('path')
      .attr('stroke', d => isGraphContextBridge(d) ? '#D0D5DD' : '#C0C0C0')
      .attr('stroke-width', d => isGraphContextBridge(d) ? 1.1 : 1.5)
      .attr('stroke-dasharray', d => isGraphContextBridge(d) ? '4 4' : null)
    linkLabelBg.attr('fill', 'rgba(255,255,255,0.95)')
    linkLabels.attr('fill', '#666')
  })
}

watch(() => props.graphData, (data) => {
  const signature = graphRenderSignature(data)
  if (signature === lastRenderedGraphSignature) {
    return
  }
  lastRenderedGraphSignature = signature
  scheduleRenderGraph(160)
}, { immediate: true })

// 监听边标签显示开关
watch(showEdgeLabels, (newVal) => {
  if (linkLabelsRef) {
    linkLabelsRef.style('display', newVal ? 'block' : 'none')
  }
  if (linkLabelBgRef) {
    linkLabelBgRef.style('display', newVal ? 'block' : 'none')
  }
})

const handleResize = () => {
  nextTick(renderGraph)
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  if (typeof ResizeObserver !== 'undefined' && graphContainer.value) {
    resizeObserver = new ResizeObserver(() => scheduleRenderGraph(60))
    resizeObserver.observe(graphContainer.value)
  }
  nextTick(renderGraph)
})

onUnmounted(() => {
  clearRenderRetry()
  window.removeEventListener('resize', handleResize)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (currentSimulation) {
    currentSimulation.stop()
  }
})
</script>

<style scoped>
.graph-panel {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #FAFAFA;
  background-image: radial-gradient(#D0D0D0 1.5px, transparent 1.5px);
  background-size: 24px 24px;
  overflow: hidden;
}

.panel-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 16px 20px;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(255,255,255,0));
  pointer-events: none;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  pointer-events: auto;
}

.header-tools {
  pointer-events: auto;
  display: flex;
  gap: 10px;
  align-items: center;
}

.tool-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #E0E0E0;
  background: #FFF;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  font-size: 13px;
}

.tool-btn:hover {
  background: #F5F5F5;
  color: #000;
  border-color: #CCC;
}

.tool-btn .btn-text {
  font-size: 12px;
}

.icon-refresh.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.graph-container {
  width: 100%;
  height: 100%;
}

.graph-view, .graph-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.graph-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #999;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.2;
}

/* Entity Types Legend - Bottom Left */
.graph-legend {
  position: absolute;
  bottom: 24px;
  left: 24px;
  background: rgba(255,255,255,0.95);
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid #EAEAEA;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06);
  z-index: 10;
}

.legend-title {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #E91E63;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  max-width: 320px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #555;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  white-space: nowrap;
}

/* Edge Labels Toggle - Top Right */
.edge-labels-toggle {
  position: absolute;
  top: 60px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #FFF;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid #E0E0E0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  z-index: 10;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #E0E0E0;
  border-radius: 22px;
  transition: 0.3s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: 0.3s;
}

input:checked + .slider {
  background-color: #7B2D8E;
}

input:checked + .slider:before {
  transform: translateX(18px);
}

.toggle-label {
  font-size: 12px;
  color: #666;
}

/* Detail Panel - Right Side */
.detail-panel {
  position: absolute;
  top: 60px;
  right: 20px;
  width: 320px;
  max-height: calc(100% - 100px);
  background: #FFF;
  border: 1px solid #EAEAEA;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
  overflow: hidden;
  font-family: 'Noto Sans SC', system-ui, sans-serif;
  font-size: 13px;
  z-index: 20;
  display: flex;
  flex-direction: column;
}

.detail-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #FAFAFA;
  border-bottom: 1px solid #EEE;
  flex-shrink: 0;
}

.detail-title {
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.detail-type-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  margin-left: auto;
  margin-right: 12px;
}

.detail-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #999;
  line-height: 1;
  padding: 0;
  transition: color 0.2s;
}

.detail-close:hover {
  color: #333;
}

.detail-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.detail-row {
  margin-bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.detail-label {
  color: #888;
  font-size: 12px;
  font-weight: 500;
  min-width: 80px;
}

.detail-value {
  color: #333;
  flex: 1;
  word-break: break-word;
}

.detail-value.uuid-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #666;
}

.detail-value.fact-text {
  line-height: 1.5;
  color: #444;
}

.detail-section {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #F0F0F0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  margin-bottom: 10px;
}

.properties-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.property-item {
  display: flex;
  gap: 8px;
}

.property-key {
  color: #888;
  font-weight: 500;
  min-width: 90px;
}

.property-value {
  color: #333;
  flex: 1;
}

.summary-text {
  line-height: 1.6;
  color: #444;
  font-size: 12px;
}

.labels-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.label-tag {
  display: inline-block;
  padding: 4px 12px;
  background: #F5F5F5;
  border: 1px solid #E0E0E0;
  border-radius: 16px;
  font-size: 11px;
  color: #555;
}

.episodes-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.episode-tag {
  display: inline-block;
  padding: 6px 10px;
  background: #F8F8F8;
  border: 1px solid #E8E8E8;
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #666;
  word-break: break-all;
}

/* Edge relation header */
.edge-relation-header {
  background: #F8F8F8;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  line-height: 1.5;
  word-break: break-word;
}

/* Building hint */
.graph-building-hint {
  position: absolute;
  bottom: 160px; /* Moved up from 80px */
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  color: #fff;
  padding: 10px 20px;
  border-radius: 30px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 500;
  letter-spacing: 0.5px;
  z-index: 100;
}

.memory-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  animation: breathe 2s ease-in-out infinite;
}

.memory-icon {
  width: 18px;
  height: 18px;
  color: #4CAF50;
}

@keyframes breathe {
  0%, 100% { opacity: 0.7; transform: scale(1); filter: drop-shadow(0 0 2px rgba(76, 175, 80, 0.3)); }
  50% { opacity: 1; transform: scale(1.15); filter: drop-shadow(0 0 8px rgba(76, 175, 80, 0.6)); }
}

/* 模拟结束后的提示样式 */
.graph-building-hint.finished-hint {
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.finished-hint .hint-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.finished-hint .hint-icon {
  width: 18px;
  height: 18px;
  color: #FFF;
}

.finished-hint .hint-text {
  flex: 1;
  white-space: nowrap;
}

.hint-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: #FFF;
  transition: all 0.2s;
  margin-left: 8px;
  flex-shrink: 0;
}

.hint-close-btn:hover {
  background: rgba(255, 255, 255, 0.35);
  transform: scale(1.1);
}

/* Loading spinner */
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #E0E0E0;
  border-top-color: #7B2D8E;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

/* Self-loop styles */
.self-loop-header {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #E8F5E9 0%, #F1F8E9 100%);
  border: 1px solid #C8E6C9;
}

.self-loop-count {
  margin-left: auto;
  font-size: 11px;
  color: #666;
  background: rgba(255,255,255,0.8);
  padding: 2px 8px;
  border-radius: 10px;
}

.self-loop-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.self-loop-item {
  background: #FAFAFA;
  border: 1px solid #EAEAEA;
  border-radius: 8px;
}

.self-loop-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #F5F5F5;
  cursor: pointer;
  transition: background 0.2s;
}

.self-loop-item-header:hover {
  background: #EEEEEE;
}

.self-loop-item.expanded .self-loop-item-header {
  background: #E8E8E8;
}

.self-loop-index {
  font-size: 10px;
  font-weight: 600;
  color: #888;
  background: #E0E0E0;
  padding: 2px 6px;
  border-radius: 4px;
}

.self-loop-name {
  font-size: 12px;
  font-weight: 500;
  color: #333;
  flex: 1;
}

.self-loop-toggle {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: #888;
  background: #E0E0E0;
  border-radius: 4px;
  transition: all 0.2s;
}

.self-loop-item.expanded .self-loop-toggle {
  background: #D0D0D0;
  color: #666;
}

.self-loop-item-content {
  padding: 12px;
  border-top: 1px solid #EAEAEA;
}

.self-loop-item-content .detail-row {
  margin-bottom: 8px;
}

.self-loop-item-content .detail-label {
  font-size: 11px;
  min-width: 60px;
}

.self-loop-item-content .detail-value {
  font-size: 12px;
}

.self-loop-episodes {
  margin-top: 8px;
}

.episodes-list.compact {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px;
}

.episode-tag.small {
  padding: 3px 6px;
  font-size: 9px;
}
</style>
