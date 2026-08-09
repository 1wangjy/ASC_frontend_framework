<template>
  <div class="workbench-panel">
    <div class="scroll-container">
      <!-- Step 01: Ontology -->
      <div class="step-card" :class="{ 'active': currentPhase === 0, 'completed': currentPhase > 0 }">
        <div class="card-header">
          <div class="step-info">
            <span class="step-num">01</span>
            <span class="step-title">本体生成</span>
          </div>
          <div class="step-status">
            <span v-if="currentPhase > 0" class="badge success">已完成</span>
            <span v-else-if="currentPhase === 0 && projectData?.ontology" class="badge accent">待构建</span>
            <span v-else-if="currentPhase === 0" class="badge processing">生成中</span>
            <span v-else class="badge pending">等待</span>
          </div>
        </div>

        <div class="card-content">
          <p class="api-note">POST /api/graph/ontology/generate</p>
          <p class="description">
            LLM分析文献内容与分析需求，提取材料知识点，自动生成合适的本体结构
          </p>

          <!-- Loading / Progress -->
          <div v-if="currentPhase === 0 && ontologyProgress" class="progress-section">
            <div class="spinner-sm"></div>
            <div class="progress-copy">
              <span>{{ ontologyProgress.message || '正在分析文档...' }}</span>
              <small>
                {{ ontologyProgress.progress || 0 }}%
                <template v-if="ontologyProgress.attempt && ontologyProgress.total_attempts">
                  · 第 {{ ontologyProgress.attempt }}/{{ ontologyProgress.total_attempts }} 轮
                </template>
              </small>
            </div>
          </div>

          <!-- Detail Overlay -->
          <div v-if="selectedOntologyItem" class="ontology-detail-overlay">
            <div class="detail-header">
               <div class="detail-title-group">
                  <span class="detail-type-badge">{{ selectedOntologyItem.itemType === 'entity' ? '实体' : '关系' }}</span>
                  <span class="detail-name">{{ displayOntologyItemName(selectedOntologyItem) }}</span>
               </div>
               <button class="close-btn" @click="selectedOntologyItem = null">×</button>
            </div>
            <div class="detail-body">
               <div class="detail-desc">{{ selectedOntologyItem.description }}</div>
               
               <!-- Attributes -->
               <div class="detail-section" v-if="selectedOntologyItem.attributes?.length">
                  <span class="section-label">ATTRIBUTES</span>
                  <div class="attr-list">
                     <div v-for="attr in selectedOntologyItem.attributes" :key="attr.name" class="attr-item">
                        <span class="attr-name">{{ attr.name }}</span>
                        <span class="attr-type">({{ attr.type }})</span>
                        <span class="attr-desc">{{ attr.description }}</span>
                     </div>
                  </div>
               </div>

               <!-- Examples (Entity) -->
               <div class="detail-section" v-if="selectedOntologyItem.examples?.length">
                  <span class="section-label">EXAMPLES</span>
                  <div class="example-list">
                     <span v-for="ex in selectedOntologyItem.examples" :key="ex" class="example-tag">{{ ex }}</span>
                  </div>
               </div>

               <!-- Source/Target (Relation) -->
               <div class="detail-section" v-if="selectedOntologyItem.source_targets?.length">
                  <span class="section-label">CONNECTIONS</span>
                  <div class="conn-list">
                     <div v-for="(conn, idx) in selectedOntologyItem.source_targets" :key="idx" class="conn-item">
                        <span class="conn-node">{{ displayEntityTypeName(conn.source) }}</span>
                        <span class="conn-arrow">→</span>
                        <span class="conn-node">{{ displayEntityTypeName(conn.target) }}</span>
                     </div>
                  </div>
               </div>
            </div>
          </div>

          <!-- Generated Entity Tags -->
          <div v-if="projectData?.ontology?.entity_types" class="tags-container" :class="{ 'dimmed': selectedOntologyItem }">
            <span class="tag-label">ZEP CORE ENTITY TYPES</span>
            <div class="tags-list">
              <span 
                v-for="entity in projectData.ontology.entity_types" 
                :key="entity.name" 
                class="entity-tag clickable"
                @click="selectOntologyItem(entity, 'entity')"
              >
                {{ displayOntologyItemName(entity) }}
              </span>
            </div>
          </div>

          <div v-if="projectData?.ontology?.semantic_entity_types" class="tags-container" :class="{ 'dimmed': selectedOntologyItem }">
            <span class="tag-label">ASC SEMANTIC ENTITY TYPES</span>
            <div class="tags-list">
              <span
                v-for="entity in projectData.ontology.semantic_entity_types"
                :key="entity.name"
                class="entity-tag clickable"
                @click="selectOntologyItem(entity, 'entity')"
              >
                {{ displayOntologyItemName(entity) }}
              </span>
            </div>
          </div>

          <!-- Generated Relation Tags -->
          <div v-if="projectData?.ontology?.edge_types" class="tags-container" :class="{ 'dimmed': selectedOntologyItem }">
            <span class="tag-label">GENERATED RELATION TYPES</span>
            <div class="tags-list">
              <span 
                v-for="rel in projectData.ontology.edge_types" 
                :key="rel.name" 
                class="entity-tag clickable"
                @click="selectOntologyItem(rel, 'relation')"
              >
                {{ displayOntologyItemName(rel) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 02: Base Graph Build -->
      <div class="step-card" :class="{ 'active': isBaseBuildActive, 'completed': isBaseBuildCompleted }">
        <div class="card-header">
          <div class="step-info">
            <span class="step-num">02</span>
            <span class="step-title">Base GraphRAG构建</span>
          </div>
          <div class="step-status">
            <span v-if="isBaseBuildCompleted" class="badge success">已完成</span>
            <span v-else-if="canReviewBaseNodes" class="badge accent">待校准</span>
            <span v-else-if="currentPhase === 1" class="badge processing">{{ buildProgress?.progress || 0 }}%</span>
            <span v-else class="badge pending">等待</span>
          </div>
        </div>

        <div class="card-content">
          <p class="api-note">POST /api/graph/build</p>
          <p class="description">
            使用 base 导入区的 survey / 综述类文件构建基座知识图谱，提取更密集的 ASC 专业 Base Node 与基座关系
          </p>

          <div v-if="canConfigureBuild" class="node-limit-panel">
            <div class="build-recommendations">
              <div>
                <span class="node-limit-label">推荐实体节点数</span>
                <strong>{{ recommendedEntityNodeCount }}</strong>
              </div>
              <div>
                <span class="node-limit-label">推荐关系边数</span>
                <strong>{{ recommendedEdgeCount }}</strong>
              </div>
              <div>
                <span class="node-limit-label">推荐达标后迭代</span>
                <strong>{{ recommendedPostTargetEdgeIterations }}</strong>
              </div>
            </div>
            <div class="build-inputs">
              <label class="node-limit-input">
                <span>自定义实体节点数</span>
                <input
                  v-model.number="entityNodeLimit"
                  type="number"
                  min="1"
                  max="900"
                  step="1"
                />
              </label>
              <label class="node-limit-input">
                <span>目标关系边数</span>
                <input
                  v-model.number="targetEdgeCount"
                  type="number"
                  min="1"
                  max="5000"
                  step="1"
                />
              </label>
              <label class="node-limit-input">
                <span>达标后迭代次数</span>
                <input
                  v-model.number="postTargetEdgeIterations"
                  type="number"
                  min="0"
                  max="20"
                  step="1"
                />
              </label>
              <button
                class="build-btn"
                type="button"
                :disabled="!canStartBuild"
                @click="handleStartBuild"
              >
                开始构建
              </button>
            </div>
          </div>
          
          <!-- Stats Cards -->
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{{ graphStats.nodes }}</span>
              <span class="stat-label">实体节点</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ graphStats.edges }}</span>
              <span class="stat-label">关系边</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ graphStats.types }}</span>
              <span class="stat-label">SCHEMA类型</span>
            </div>
          </div>

          <div v-if="canExportBaseGraph" class="graph-json-panel">
            <div>
              <span class="node-limit-label">Base Node JSON · 可选</span>
              <strong>导出 Base Node 元数据</strong>
              <p>每个节点仅记录 entity name、entity type、entity summary 与权重；关系边继续保留在对应的 Base 图中。</p>
            </div>
            <button class="ghost-btn" type="button" @click="handleExportBaseGraph">
              导出 JSON
            </button>
          </div>
          <div v-if="baseExportMessage" class="edit-feedback compact">
            {{ baseExportMessage }}
          </div>

          <div v-if="canReviewBaseNodes" class="base-node-review-panel">
            <div class="review-header">
              <div>
                <span class="node-limit-label">Base Node 人工校准</span>
                <strong>编辑节点名、类型、总结与节点权重</strong>
                <p>保存后写入 base_*.json 元数据；确认完成后才解锁 Step 03 Professional Research。</p>
              </div>
              <button
                class="build-btn"
                type="button"
                :disabled="baseNodeSaving"
                @click="handleConfirmBaseNodes"
              >
                确认节点调整，进入 Step 03
              </button>
            </div>

            <div class="base-node-editor-grid">
              <div class="base-node-list-panel">
                <input
                  v-model="baseNodeSearch"
                  class="base-node-search"
                  type="search"
                  placeholder="搜索 Base Node 名称 / 类型"
                />
                <div class="base-node-list">
                  <button
                    v-for="node in filteredBaseNodes"
                    :key="nodeIdOf(node)"
                    type="button"
                    class="base-node-list-item"
                    :class="{ active: selectedBaseNodeId === nodeIdOf(node) }"
                    @click="selectBaseNode(node)"
                  >
                    <strong :title="nodeNameOf(node)">{{ nodeNameOf(node) }}</strong>
                    <span>{{ displayEntityType(nodeEntityTypeOf(node)) }} · 权重 {{ nodeWeightOf(node).toFixed(2) }}</span>
                  </button>
                  <div v-if="!filteredBaseNodes.length" class="base-node-empty">
                    暂无可编辑 Base Node
                  </div>
                </div>
              </div>

              <div class="base-node-form" v-if="selectedBaseNode">
                <label class="base-node-field">
                  <span>节点名</span>
                  <input v-model.trim="baseNodeDraft.name" type="text" />
                </label>
                <label class="base-node-field">
                  <span>节点类型</span>
                  <select v-model="baseNodeDraft.entity_type">
                    <option
                      v-for="type in editableEntityTypes"
                      :key="type.value"
                      :value="type.value"
                    >
                      {{ type.label }} / {{ type.value }}
                    </option>
                  </select>
                </label>
                <label class="base-node-field wide">
                  <span>总结</span>
                  <textarea v-model="baseNodeDraft.summary" rows="4"></textarea>
                </label>
                <label class="base-node-field wide">
                  <span>节点权重（专家配置 / 后续可学习）</span>
                  <div class="weight-control">
                    <input v-model.number="baseNodeDraft.node_weight" type="range" min="0" max="1" step="0.01" />
                    <input v-model.number="baseNodeDraft.node_weight" type="number" min="0" max="1" step="0.01" />
                  </div>
                </label>
                <div class="base-node-actions">
                  <button
                    class="build-btn"
                    type="button"
                    :disabled="baseNodeSaving || !canSaveBaseNode"
                    @click="handleSaveBaseNode"
                  >
                    {{ baseNodeSaving ? '保存中...' : '保存节点修改' }}
                  </button>
                  <button class="ghost-btn" type="button" :disabled="baseNodeSaving" @click="resetBaseNodeDraft(selectedBaseNode)">
                    撤销本次编辑
                  </button>
                </div>
                <div v-if="baseNodeEditMessage" class="edit-feedback" :class="{ error: baseNodeEditError }">
                  {{ baseNodeEditMessage }}
                </div>
              </div>
              <div v-else class="base-node-form empty">
                请选择一个 Base Node 进行编辑。
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 03: Professional Research Graph Build -->
      <div class="step-card" :class="{ 'active': currentPhase === 2 || currentPhase === 3, 'completed': currentPhase > 3 }">
        <div class="card-header">
          <div class="step-info">
            <span class="step-num">03</span>
            <span class="step-title">Professional Research 知识图谱构建</span>
          </div>
          <div class="step-status">
            <span v-if="currentPhase > 3" class="badge success">已完成</span>
            <span v-else-if="currentPhase === 3" class="badge processing">{{ buildProgress?.progress || 0 }}%</span>
            <span v-else-if="currentPhase === 2 && baseNodesConfirmed" class="badge accent">待构建</span>
            <span v-else-if="currentPhase === 2" class="badge pending">等待校准</span>
            <span v-else class="badge pending">等待</span>
          </div>
        </div>

        <div class="card-content">
          <p class="api-note">POST /api/graph/ontology/generate → POST /api/graph/build</p>
          <p class="description">
            可选导入 Base Node 元数据 JSON，恢复对应 Base 图中的节点信息，并保留原关系边继续细化拓展
          </p>
          <div v-if="currentPhase === 3 && ontologyProgress && !projectData?.ontology" class="progress-section">
            <div class="spinner-sm"></div>
            <div class="progress-copy">
              <span>{{ ontologyProgress.message || '正在生成 Professional Research 本体...' }}</span>
              <small>
                {{ ontologyProgress.progress || 0 }}%
                <template v-if="ontologyProgress.attempt && ontologyProgress.total_attempts">
                  · 第 {{ ontologyProgress.attempt }}/{{ ontologyProgress.total_attempts }} 轮
                </template>
              </small>
            </div>
          </div>
          <div
            class="professional-import-drop base-json-import"
            :class="{ disabled: !canImportProfessionalFiles }"
            @click="openBaseMetadataDialog"
          >
            <input
              ref="baseMetadataInput"
              type="file"
              accept=".json,application/json"
              @change="handleBaseMetadataSelect"
            />
            <div>
              <strong>导入 Base Node 元数据 JSON（可选）</strong>
              <span>{{ baseMetadataImportDescription }}</span>
            </div>
            <button
              type="button"
              :disabled="!canImportProfessionalFiles || baseMetadataImporting"
              @click.stop="openBaseMetadataDialog"
            >
              {{ baseMetadataImporting ? '导入中...' : '选择 JSON' }}
            </button>
          </div>
          <div
            v-if="baseMetadataImportMessage"
            class="edit-feedback compact"
            :class="{ error: baseMetadataImportError }"
          >
            {{ baseMetadataImportMessage }}
          </div>
          <div
            class="professional-import-drop"
            :class="{ active: professionalDragOver, disabled: !canImportProfessionalFiles }"
            @click="openProfessionalFileDialog"
            @dragover.prevent="handleProfessionalDragOver"
            @dragleave.prevent="professionalDragOver = false"
            @drop.prevent="handleProfessionalDrop"
          >
            <input
              ref="professionalInput"
              type="file"
              accept=".md,.markdown,text/markdown"
              multiple
              @change="handleProfessionalSelect"
            />
            <div>
              <strong>导入 Professional Research Markdown</strong>
              <span>支持 .md / .markdown；Base GraphRAG 完成后在此导入 486+ 篇 research 文件</span>
            </div>
            <button type="button" :disabled="!canImportProfessionalFiles" @click.stop="openProfessionalFileDialog">
              选择文件
            </button>
          </div>
          <div v-if="professionalFileNames.length" class="professional-file-list">
            <div
              v-for="file in professionalFileNames"
              :key="file.name"
              class="professional-file-item"
            >
              <strong :title="file.name">{{ file.name }}</strong>
              <span>{{ file.size }}</span>
            </div>
          </div>
          <div class="professional-build-controls">
            <label class="node-limit-input">
              <span>专业新增节点数</span>
              <input
                v-model.number="professionalEntityNodeLimit"
                type="number"
                min="1"
                max="900"
                step="1"
                :disabled="!canImportProfessionalFiles"
              />
            </label>
            <label class="node-limit-input">
              <span>专业新增关系边数</span>
              <input
                v-model.number="professionalTargetEdgeCount"
                type="number"
                min="1"
                max="5000"
                step="1"
                :disabled="!canImportProfessionalFiles"
              />
            </label>
            <label class="node-limit-input">
              <span>达标后迭代次数</span>
              <input
                v-model.number="professionalPostTargetEdgeIterations"
                type="number"
                min="0"
                max="20"
                step="1"
                :disabled="!canImportProfessionalFiles"
              />
            </label>
          </div>
          <div class="stats-grid professional-stats">
            <div class="stat-card">
              <span class="stat-value">{{ professionalGraphStats.totalNodes }}</span>
              <span class="stat-label">合并后总节点</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ professionalGraphStats.newNodesDisplay }}</span>
              <span class="stat-label">新增专业节点</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ professionalGraphStats.newEdgesDisplay }}</span>
              <span class="stat-label">新增专业关系边</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ professionalFilesCount }}</span>
              <span class="stat-label">Research文件</span>
            </div>
          </div>
          <div v-if="professionalBlockedReason" class="blocked-hint">
            {{ professionalBlockedReason }}
          </div>
          <div v-if="professionalGraphStats.formula" class="additive-hint">
            {{ professionalGraphStats.formula }}
          </div>
          <button
            class="action-btn"
            :disabled="!canStartProfessionalBuild"
            @click="handleStartProfessionalBuild"
          >
            {{ currentPhase === 3 ? '专业图谱构建中...' : '开始 Professional Research 构建' }}
          </button>
        </div>
      </div>

      <!-- Step 04: Analysis Prep -->
      <div class="step-card" :class="{ 'active': currentPhase === 4, 'completed': currentPhase >= 4 }">
        <div class="card-header">
          <div class="step-info">
            <span class="step-num">04</span>
            <span class="step-title">进入分析准备</span>
          </div>
          <div class="step-status">
            <span v-if="currentPhase >= 4" class="badge accent">可进入</span>
            <span v-else class="badge pending">等待</span>
          </div>
        </div>
        
        <div class="card-content">
          <p class="api-note">POST /api/simulation/create</p>
          <p class="description">Base 与 Professional Research 图谱构建完成后，进入ASC文献分析准备</p>
          <button 
            class="action-btn" 
            :disabled="currentPhase < 4 || creatingSimulation || !projectResearchQuestion(projectData)"
            @click="handleEnterEnvSetup"
          >
            <span v-if="creatingSimulation" class="spinner-sm"></span>
            {{ creatingSimulation ? '创建中...' : '进入分析准备 ➝' }}
          </button>
          <p v-if="simulationPreparationError" class="simulation-preparation-error">
            {{ simulationPreparationError }}
          </p>
          <button
            v-if="projectData?.project_id && projectData?.graph_id"
            class="action-btn qa-action-btn"
            type="button"
            @click="emit('open-qa', projectData)"
          >去图谱问答</button>
        </div>
      </div>
    </div>

    <!-- Bottom Info / Logs -->
    <div class="system-logs">
      <div class="log-header">
        <span class="log-title">SYSTEM DASHBOARD</span>
        <span class="log-id">{{ projectData?.project_id || 'NO_PROJECT' }}</span>
      </div>
      <div class="log-content" ref="logContent">
        <div class="log-line" v-for="(log, idx) in systemLogs" :key="idx">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-msg">{{ log.msg }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { importBaseMetadata, updateGraphNodeMetadata } from '../api/graph'
import { createSimulation } from '../api/simulation'
import { baseGraphExportFilename, buildBaseGraphExport } from '../utils/baseGraphMetadata'
import { projectResearchQuestion } from '../features/research/simulationPreparationModel.js'

const router = useRouter()

const props = defineProps({
  currentPhase: { type: Number, default: 0 },
  projectData: Object,
  ontologyProgress: Object,
  buildProgress: Object,
  graphData: Object,
  baseGraphData: Object,
  professionalFilesCount: { type: Number, default: 0 },
  baseMetadataPath: { type: String, default: '' },
  importedBaseMetadata: Object,
  baseNodesConfirmed: { type: Boolean, default: false },
  systemLogs: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'next-step',
  'build-graph',
  'build-professional-graph',
  'professional-files-selected',
  'base-node-updated',
  'confirm-base-nodes',
  'base-metadata-imported',
  'open-qa'
])

const selectedOntologyItem = ref(null)
const logContent = ref(null)
const creatingSimulation = ref(false)
const simulationPreparationError = computed(() => {
  const hasCompletedGraph = props.currentPhase >= 4
    && props.projectData?.project_id
    && props.projectData?.graph_id
  return hasCompletedGraph && !projectResearchQuestion(props.projectData)
    ? '当前项目缺少研究问题，不能进入 ASC 分析准备。你仍可使用图谱问答。'
    : ''
})
const entityNodeLimit = ref(260)
const targetEdgeCount = ref(180)
const postTargetEdgeIterations = ref(2)
const professionalEntityNodeLimit = ref(160)
const professionalTargetEdgeCount = ref(320)
const professionalPostTargetEdgeIterations = ref(2)
const professionalInput = ref(null)
const professionalDragOver = ref(false)
const professionalFileNames = ref([])
const baseMetadataInput = ref(null)
const baseMetadataImporting = ref(false)
const baseMetadataImportMessage = ref('')
const baseMetadataImportError = ref(false)
const baseExportMessage = ref('')
const baseNodeSearch = ref('')
const selectedBaseNodeId = ref('')
const baseNodeDraft = ref({
  name: '',
  entity_type: 'Material',
  summary: '',
  node_weight: 0.7
})
const baseNodeSaving = ref(false)
const baseNodeEditMessage = ref('')
const baseNodeEditError = ref(false)

const FIXED_ENTITY_TYPE_LABELS = {
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
  SpectrumFeature: '图谱特征'
}

const FIXED_RELATION_TYPE_LABELS = {
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
  FACTOR_AFFECTS_PERFORMANCE: '因素影响性能'
}

const displayEntityTypeName = (name) => FIXED_ENTITY_TYPE_LABELS[name] || name
const displayEntityType = (name) => FIXED_ENTITY_TYPE_LABELS[name] || name

const displayOntologyItemName = (item) => {
  if (!item) return ''
  if (item.display_name_zh) return item.display_name_zh
  if (item.itemType === 'relation') return FIXED_RELATION_TYPE_LABELS[item.name] || item.name
  return FIXED_ENTITY_TYPE_LABELS[item.name] || item.name
}

const recommendedEntityNodeCount = computed(() => (
  props.projectData?.recommended_entity_node_count ||
  props.projectData?.entity_node_limit ||
  60
))

const recommendedEdgeCount = computed(() => (
  props.projectData?.recommended_edge_count ||
  props.projectData?.target_edge_count ||
  180
))

const recommendedPostTargetEdgeIterations = computed(() => (
  props.projectData?.recommended_post_target_edge_iterations ??
  props.projectData?.post_target_edge_iterations ??
  2
))

const canConfigureBuild = computed(() => (
  props.currentPhase === 0 &&
  !!props.projectData?.project_id &&
  !!props.projectData?.ontology
))

const canStartBuild = computed(() => (
  canConfigureBuild.value &&
  Number.isFinite(Number(entityNodeLimit.value)) &&
  Number(entityNodeLimit.value) > 0 &&
  Number.isFinite(Number(targetEdgeCount.value)) &&
  Number(targetEdgeCount.value) > 0 &&
  Number.isFinite(Number(postTargetEdgeIterations.value)) &&
  Number(postTargetEdgeIterations.value) >= 0
))

const isBaseBuildActive = computed(() => (
  props.currentPhase === 1 ||
  (props.currentPhase === 2 && !props.baseNodesConfirmed)
))

const isBaseBuildCompleted = computed(() => (
  props.currentPhase > 2 ||
  (props.currentPhase > 1 && props.baseNodesConfirmed)
))

const canReviewBaseNodes = computed(() => (
  props.currentPhase === 2 &&
  !props.baseNodesConfirmed
))

const canStartProfessionalBuild = computed(() => (
  props.currentPhase === 2 &&
  props.baseNodesConfirmed &&
  props.professionalFilesCount > 0 &&
  !!props.baseMetadataPath &&
  Number.isFinite(Number(professionalEntityNodeLimit.value)) &&
  Number(professionalEntityNodeLimit.value) > 0 &&
  Number.isFinite(Number(professionalTargetEdgeCount.value)) &&
  Number(professionalTargetEdgeCount.value) > 0 &&
  Number.isFinite(Number(professionalPostTargetEdgeIterations.value)) &&
  Number(professionalPostTargetEdgeIterations.value) >= 0
))

const canImportProfessionalFiles = computed(() => props.currentPhase === 2 && props.baseNodesConfirmed)

const canExportBaseGraph = computed(() => (
  props.currentPhase >= 2 && baseNodes.value.length > 0
))

const baseMetadataImportDescription = computed(() => {
  if (props.importedBaseMetadata?.filename) {
    return `已选择 ${props.importedBaseMetadata.filename}：${props.importedBaseMetadata.node_count || 0} 个节点、${props.importedBaseMetadata.edge_count || 0} 条关系边。重新选择可替换。`
  }
  if (props.baseMetadataPath) {
    return '不导入时继续使用 Step 02 当前节点信息；导入后覆盖节点名、类型、总结与权重，关系边保持不变。'
  }
  return '选择由 Step 02 导出的节点元数据 JSON；系统会恢复其对应 Base 图的原有关系边。'
})

const professionalBlockedReason = computed(() => {
  if (props.currentPhase < 2 || props.currentPhase >= 3) return ''
  if (!props.baseNodesConfirmed) return '请先在 Step 02 完成 Base Node 人工校准并确认进入 Step 03。'
  if (!props.baseMetadataPath) return 'base_*.json 元数据尚未生成或未传入，需等待 Base GraphRAG 构建完成。'
  if (props.professionalFilesCount <= 0) return '请在本步骤导入 Professional Research Markdown 文件，然后开始专业图谱构建。'
  return ''
})

const editableEntityTypes = computed(() => (
  Object.entries(FIXED_ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label }))
))

const baseReviewGraph = computed(() => props.baseGraphData || (props.currentPhase >= 2 ? props.graphData : null))

const baseNodes = computed(() => (
  Array.isArray(baseReviewGraph.value?.nodes) ? baseReviewGraph.value.nodes : []
))

const nodeIdOf = (node) => String(node?.uuid || node?.id || node?.name || '')
const nodeNameOf = (node) => String(node?.name_zh || node?.display_name || node?.name || nodeIdOf(node) || '未命名节点')
const nodeEntityTypeOf = (node) => {
  const labels = Array.isArray(node?.labels) ? node.labels : []
  return node?.entity_type || labels.find((label) => FIXED_ENTITY_TYPE_LABELS[label]) || 'Material'
}
const nodeWeightOf = (node) => {
  const value = Number(node?.node_weight ?? node?.attributes?.node_weight ?? 0.7)
  if (!Number.isFinite(value)) return 0.7
  return Math.max(0, Math.min(1, value))
}

const filteredBaseNodes = computed(() => {
  const query = baseNodeSearch.value.trim().toLowerCase()
  if (!query) return baseNodes.value
  return baseNodes.value.filter((node) => {
    const name = nodeNameOf(node).toLowerCase()
    const type = `${nodeEntityTypeOf(node)} ${displayEntityType(nodeEntityTypeOf(node))}`.toLowerCase()
    return name.includes(query) || type.includes(query)
  })
})

const selectedBaseNode = computed(() => (
  baseNodes.value.find((node) => nodeIdOf(node) === selectedBaseNodeId.value) || null
))

const normalizedBaseNodeDraft = computed(() => ({
  name: baseNodeDraft.value.name.trim(),
  entity_type: baseNodeDraft.value.entity_type,
  summary: baseNodeDraft.value.summary || '',
  node_weight: Math.max(0, Math.min(1, Number(baseNodeDraft.value.node_weight) || 0))
}))

const baseNodeEditDirty = computed(() => {
  const node = selectedBaseNode.value
  if (!node) return false
  const draft = normalizedBaseNodeDraft.value
  return (
    draft.name !== nodeNameOf(node) ||
    draft.entity_type !== nodeEntityTypeOf(node) ||
    draft.summary !== String(node.summary || '') ||
    Math.abs(draft.node_weight - nodeWeightOf(node)) > 0.0001
  )
})

const canSaveBaseNode = computed(() => (
  baseNodeEditDirty.value &&
  normalizedBaseNodeDraft.value.name.length > 0
))

const handleStartBuild = () => {
  emit('build-graph', {
    entity_node_limit: Math.max(1, Math.min(900, Number(entityNodeLimit.value) || recommendedEntityNodeCount.value)),
    target_edge_count: Math.max(1, Math.min(5000, Number(targetEdgeCount.value) || recommendedEdgeCount.value)),
    post_target_edge_iterations: Math.max(0, Math.min(20, Number(postTargetEdgeIterations.value) || 0)),
    build_stage: 'base',
    source_corpus_type: 'survey'
  })
}

const handleStartProfessionalBuild = () => {
  const newNodeCount = Math.max(1, Math.min(900, Number(professionalEntityNodeLimit.value) || 160))
  const newEdgeCount = Math.max(1, Math.min(5000, Number(professionalTargetEdgeCount.value) || 320))
  emit('build-professional-graph', {
    entity_node_limit: newNodeCount,
    professional_new_node_count: newNodeCount,
    target_edge_count: newEdgeCount,
    professional_new_edge_count: newEdgeCount,
    post_target_edge_iterations: Math.max(0, Math.min(20, Number(professionalPostTargetEdgeIterations.value) || 0))
  })
}

const selectBaseNode = (node) => {
  selectedBaseNodeId.value = nodeIdOf(node)
  resetBaseNodeDraft(node)
}

const resetBaseNodeDraft = (node) => {
  if (!node) return
  baseNodeDraft.value = {
    name: nodeNameOf(node),
    entity_type: nodeEntityTypeOf(node),
    summary: String(node.summary || ''),
    node_weight: nodeWeightOf(node)
  }
  baseNodeEditMessage.value = ''
  baseNodeEditError.value = false
}

const handleSaveBaseNode = async () => {
  const nodeId = selectedBaseNodeId.value
  const projectId = props.projectData?.project_id
  if (!nodeId || !projectId || !canSaveBaseNode.value) return
  baseNodeSaving.value = true
  baseNodeEditMessage.value = ''
  baseNodeEditError.value = false
  try {
    const response = await updateGraphNodeMetadata(projectId, nodeId, normalizedBaseNodeDraft.value)
    if (!response.success) {
      throw new Error(response.error || '节点保存失败')
    }
    const updatedNode = response.data?.node || { ...selectedBaseNode.value, ...normalizedBaseNodeDraft.value }
    emit('base-node-updated', updatedNode)
    selectedBaseNodeId.value = nodeIdOf(updatedNode) || nodeId
    resetBaseNodeDraft(updatedNode)
    baseNodeEditMessage.value = '节点修改已保存到 base metadata。'
  } catch (error) {
    baseNodeEditError.value = true
    baseNodeEditMessage.value = error.message || '节点保存失败'
  } finally {
    baseNodeSaving.value = false
  }
}

const handleConfirmBaseNodes = () => {
  emit('confirm-base-nodes')
}

const handleExportBaseGraph = () => {
  if (!canExportBaseGraph.value) return
  const payload = buildBaseGraphExport(baseReviewGraph.value, props.projectData || {})
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = baseGraphExportFilename(payload.project_id || props.projectData?.project_id)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  baseExportMessage.value = `已导出 ${payload.node_count} 个节点的四字段元数据。`
}

const openBaseMetadataDialog = () => {
  if (!canImportProfessionalFiles.value || baseMetadataImporting.value) return
  baseMetadataInput.value?.click()
}

const handleBaseMetadataSelect = async (event) => {
  const file = event.target.files?.[0]
  if (baseMetadataInput.value) baseMetadataInput.value.value = ''
  if (!file || !canImportProfessionalFiles.value) return

  baseMetadataImportMessage.value = ''
  baseMetadataImportError.value = false
  if (!file.name.toLowerCase().endsWith('.json')) {
    baseMetadataImportError.value = true
    baseMetadataImportMessage.value = '请选择 .json 格式的 Base Node 元数据文件。'
    return
  }
  if (file.size > 50 * 1024 * 1024) {
    baseMetadataImportError.value = true
    baseMetadataImportMessage.value = 'Base Node 元数据 JSON 不能超过 50 MB。'
    return
  }

  baseMetadataImporting.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('base_metadata_path', props.baseMetadataPath)
    const response = await importBaseMetadata(formData)
    if (!response.success) throw new Error(response.error || 'Base Node 元数据 JSON 导入失败')
    emit('base-metadata-imported', response.data)
    baseMetadataImportMessage.value = `已导入 ${response.data.node_count} 个节点的元数据；对应 Base 图的 ${response.data.edge_count} 条关系边保持不变。`
  } catch (error) {
    baseMetadataImportError.value = true
    baseMetadataImportMessage.value = error.message || 'Base Node 元数据 JSON 导入失败'
  } finally {
    baseMetadataImporting.value = false
  }
}

const formatFileSize = (size) => {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

const isProfessionalMarkdownFile = (file) => {
  const name = file.name.toLowerCase()
  return name.endsWith('.md') || name.endsWith('.markdown')
}

const setProfessionalFiles = (files) => {
  if (!canImportProfessionalFiles.value) return
  const validFiles = Array.from(files || []).filter(isProfessionalMarkdownFile)
  professionalFileNames.value = validFiles.map((file) => ({
    name: file.name,
    size: formatFileSize(file.size)
  }))
  emit('professional-files-selected', validFiles)
  if (professionalInput.value) professionalInput.value.value = ''
}

const openProfessionalFileDialog = () => {
  if (!canImportProfessionalFiles.value) return
  professionalInput.value?.click()
}

const handleProfessionalSelect = (event) => {
  setProfessionalFiles(event.target.files)
}

const handleProfessionalDragOver = () => {
  if (canImportProfessionalFiles.value) professionalDragOver.value = true
}

const handleProfessionalDrop = (event) => {
  professionalDragOver.value = false
  setProfessionalFiles(event.dataTransfer.files)
}

// 进入环境搭建 - 创建 simulation 并跳转
const handleEnterEnvSetup = async () => {
  if (!props.projectData?.project_id || !props.projectData?.graph_id) {
    console.error('缺少项目或图谱信息')
    return
  }

  if (!projectResearchQuestion(props.projectData)) {
    return
  }
  
  creatingSimulation.value = true
  
  try {
    const res = await createSimulation({
      project_id: props.projectData.project_id,
      graph_id: props.projectData.graph_id,
      enable_twitter: true,
      enable_reddit: true
    })
    
    if (res.success && res.data?.simulation_id) {
      // 跳转到 simulation 页面
      router.push({
        name: 'Simulation',
        params: { simulationId: res.data.simulation_id }
      })
    } else {
      console.error('创建模拟失败:', res.error)
      alert('创建模拟失败: ' + (res.error || '未知错误'))
    }
  } catch (err) {
    console.error('创建模拟异常:', err)
    alert('创建模拟异常: ' + err.message)
  } finally {
    creatingSimulation.value = false
  }
}

const selectOntologyItem = (item, type) => {
  selectedOntologyItem.value = { ...item, itemType: type }
}

const graphStats = computed(() => {
  const graph = props.currentPhase === 1
    ? props.graphData
    : (props.baseGraphData || props.graphData)
  const nodes = graph?.node_count || graph?.nodes?.length || 0
  const edges = graph?.edge_count || graph?.edges?.length || 0
  const types = props.projectData?.ontology?.entity_types?.length || 0
  return { nodes, edges, types }
})

const professionalGraphStats = computed(() => {
  if (props.currentPhase < 3) {
    return { totalNodes: 0, newNodes: 0, newEdges: 0, totalEdges: 0, formula: '' }
  }
  const graph = props.graphData || {}
  const totalNodes = graph.node_count || graph.nodes?.length || 0
  const totalEdges = graph.edge_count || graph.edges?.length || 0
  const baseNodes = graph.base_node_count || graph.merged_base_node_count || props.baseGraphData?.node_count || props.baseGraphData?.nodes?.length || 0
  const baseEdges = graph.base_edge_count || props.baseGraphData?.edge_count || props.baseGraphData?.edges?.length || 0
  const newNodes = graph.new_refinement_node_count ?? graph.professional_selected_new_node_count ?? Math.max(0, totalNodes - baseNodes)
  const newEdges = graph.new_refinement_edge_count ?? (graph.edges || []).filter((edge) => edge.edge_role === 'professional_refinement_edge').length
  const targetNewNodes = (graph.professional_requested_new_node_count ?? Number(professionalEntityNodeLimit.value)) || 0
  const targetNewEdges = (graph.professional_requested_new_edge_count ?? Number(professionalTargetEdgeCount.value)) || 0
  const newNodesDisplay = targetNewNodes ? `${newNodes} / ${targetNewNodes}` : newNodes
  const newEdgesDisplay = targetNewEdges ? `${newEdges} / ${targetNewEdges}` : newEdges
  const nodeFormula = totalNodes && baseNodes
    ? `总节点 ${totalNodes} = Base ${baseNodes} + Professional新增 ${newNodes}`
    : ''
  const edgeFormula = totalEdges && baseEdges
    ? `总边 ${totalEdges} = Base ${baseEdges} + Professional新增 ${newEdges}`
    : ''
  const formula = [nodeFormula, edgeFormula].filter(Boolean).join('；')
  return { totalNodes, totalEdges, baseNodes, baseEdges, newNodes, newEdges, newNodesDisplay, newEdgesDisplay, formula }
})

watch(
  () => [
    props.projectData?.recommended_entity_node_count || props.projectData?.entity_node_limit,
    props.projectData?.recommended_edge_count || props.projectData?.target_edge_count,
    props.projectData?.recommended_post_target_edge_iterations ?? props.projectData?.post_target_edge_iterations
  ],
  ([entityValue, edgeValue, iterationValue]) => {
    if (entityValue) entityNodeLimit.value = entityValue
    if (edgeValue) targetEdgeCount.value = edgeValue
    if (iterationValue !== undefined && iterationValue !== null) postTargetEdgeIterations.value = iterationValue
  },
  { immediate: true }
)

watch(
  () => baseNodes.value.map((node) => nodeIdOf(node)).join('|'),
  () => {
    if (!baseNodes.value.length) {
      selectedBaseNodeId.value = ''
      return
    }
    const selectedStillExists = baseNodes.value.some((node) => nodeIdOf(node) === selectedBaseNodeId.value)
    if (!selectedStillExists) {
      selectBaseNode(baseNodes.value[0])
    }
  },
  { immediate: true }
)

const formatDate = (dateStr) => {
  if (!dateStr) return '--:--:--'
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + d.getMilliseconds()
}

// Auto-scroll logs
watch(() => props.systemLogs.length, () => {
  nextTick(() => {
    if (logContent.value) {
      logContent.value.scrollTop = logContent.value.scrollHeight
    }
  })
})
</script>

<style scoped>
.workbench-panel {
  height: 100%;
  background-color: #FAFAFA;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.scroll-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.step-card {
  background: #FFF;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border: 1px solid #EAEAEA;
  transition: all 0.3s ease;
  position: relative; /* For absolute overlay */
}

.step-card.active {
  border-color: #FF5722;
  box-shadow: 0 4px 12px rgba(255, 87, 34, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.step-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 20px;
  font-weight: 700;
  color: #E0E0E0;
}

.step-card.active .step-num,
.step-card.completed .step-num {
  color: #000;
}

.step-title {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.5px;
}

.badge {
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge.success { background: #E8F5E9; color: #2E7D32; }
.badge.processing { background: #FF5722; color: #FFF; }
.badge.accent { background: #FF5722; color: #FFF; }
.badge.pending { background: #F5F5F5; color: #999; }

.api-note {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #999;
  margin-bottom: 8px;
}

.description {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
  margin-bottom: 16px;
}

.blocked-hint {
  border: 1px solid #F3D4C8;
  border-left: 4px solid #FF5722;
  border-radius: 6px;
  background: #FFF7F4;
  color: #9A3412;
  font-size: 12px;
  line-height: 1.5;
  padding: 10px 12px;
  margin: 0 0 12px;
}

.additive-hint {
  border: 1px solid #D6E6DC;
  border-left: 4px solid #2E7D32;
  border-radius: 6px;
  background: #F3FAF5;
  color: #2E7D32;
  font-size: 12px;
  line-height: 1.5;
  padding: 10px 12px;
  margin: 0 0 12px;
}

.professional-import-drop {
  border: 1px dashed #C9D3DD;
  border-radius: 8px;
  background: #FAFCFD;
  padding: 14px;
  margin-bottom: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.professional-import-drop input {
  display: none;
}

.professional-import-drop strong {
  display: block;
  font-size: 13px;
  color: #111;
  margin-bottom: 4px;
}

.professional-import-drop span {
  display: block;
  font-size: 11px;
  color: #666;
  line-height: 1.45;
}

.professional-import-drop button {
  border: 0;
  border-radius: 6px;
  min-height: 34px;
  padding: 0 12px;
  background: #111;
  color: #FFF;
  font-weight: 800;
  cursor: pointer;
}

.professional-import-drop.active {
  border-color: #FF5722;
  background: #FFF7F4;
}

.professional-import-drop.disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.professional-import-drop button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.professional-file-list {
  max-height: 146px;
  overflow-y: auto;
  border: 1px solid #EAEAEA;
  border-radius: 8px;
  margin-bottom: 12px;
  background: #FFF;
}

.professional-file-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 9px 11px;
  border-bottom: 1px solid #F0F0F0;
  font-size: 11px;
}

.professional-file-item:last-child {
  border-bottom: 0;
}

.professional-file-item strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #222;
}

.professional-file-item span {
  color: #999;
  font-family: 'JetBrains Mono', monospace;
}

.base-node-review-panel {
  border: 1px solid #EAEAEA;
  border-radius: 8px;
  background: #FAFAFA;
  margin-top: 14px;
  padding: 14px;
  display: grid;
  gap: 14px;
}

.review-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.review-header strong {
  display: block;
  color: #111;
  font-size: 15px;
  margin: 2px 0 4px;
}

.review-header p {
  margin: 0;
  color: #666;
  font-size: 12px;
  line-height: 1.45;
}

.base-node-editor-grid {
  display: grid;
  grid-template-columns: minmax(180px, 0.82fr) minmax(0, 1.18fr);
  gap: 12px;
}

.base-node-list-panel {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.base-node-search {
  width: 100%;
  min-height: 36px;
  border: 1px solid #DDD;
  border-radius: 6px;
  padding: 0 10px;
  background: #FFF;
  font: inherit;
  font-size: 12px;
}

.base-node-list {
  max-height: 286px;
  overflow-y: auto;
  border: 1px solid #EAEAEA;
  border-radius: 8px;
  background: #FFF;
}

.base-node-list-item {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #F1F1F1;
  background: #FFF;
  padding: 10px 11px;
  display: grid;
  gap: 4px;
  text-align: left;
  cursor: pointer;
}

.base-node-list-item:last-child {
  border-bottom: 0;
}

.base-node-list-item.active {
  background: #FFF7F4;
  box-shadow: inset 3px 0 0 #FF5722;
}

.base-node-list-item strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #111;
}

.base-node-list-item span,
.base-node-empty {
  color: #777;
  font-size: 10px;
}

.base-node-empty {
  padding: 18px 12px;
  text-align: center;
}

.base-node-form {
  min-width: 0;
  border: 1px solid #EAEAEA;
  border-radius: 8px;
  background: #FFF;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.base-node-form.empty {
  min-height: 180px;
  align-content: center;
  justify-items: center;
  color: #777;
  font-size: 12px;
}

.base-node-field {
  display: grid;
  gap: 6px;
}

.base-node-field.wide,
.base-node-actions,
.edit-feedback {
  grid-column: 1 / -1;
}

.base-node-field span {
  color: #777;
  font-size: 10px;
  font-weight: 800;
}

.base-node-field input,
.base-node-field select,
.base-node-field textarea {
  width: 100%;
  border: 1px solid #DDD;
  border-radius: 6px;
  padding: 8px 10px;
  background: #FFF;
  font: inherit;
  font-size: 12px;
}

.base-node-field textarea {
  resize: vertical;
  line-height: 1.45;
}

.weight-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 84px;
  gap: 10px;
  align-items: center;
}

.weight-control input[type="range"] {
  padding: 0;
}

.base-node-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ghost-btn {
  border: 1px solid #DDD;
  border-radius: 6px;
  height: 38px;
  padding: 0 12px;
  background: #FFF;
  color: #333;
  font-weight: 800;
  cursor: pointer;
}

.ghost-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.edit-feedback {
  border-radius: 6px;
  background: #E8F5E9;
  color: #2E7D32;
  padding: 8px 10px;
  font-size: 12px;
}

.edit-feedback.error {
  background: #FFF7F4;
  color: #9A3412;
}

.edit-feedback.compact {
  margin-top: 10px;
}

.graph-json-panel {
  border: 1px dashed #C9D3DD;
  border-radius: 8px;
  background: #FAFCFD;
  margin-top: 14px;
  padding: 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.graph-json-panel strong {
  display: block;
  color: #111;
  font-size: 13px;
  margin-bottom: 4px;
}

.graph-json-panel p {
  margin: 0;
  color: #666;
  font-size: 11px;
  line-height: 1.45;
}

.base-json-import {
  border-style: solid;
  border-color: #D6E6DC;
  background: #F3FAF5;
}

.professional-build-controls {
  border: 1px solid #EAEAEA;
  border-radius: 8px;
  background: #FAFAFA;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.professional-stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.node-limit-panel {
  border: 1px solid #EAEAEA;
  border-radius: 8px;
  background: #FAFAFA;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.build-recommendations {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.build-inputs {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr)) auto;
  gap: 12px;
  align-items: end;
}

.node-limit-label,
.node-limit-input span {
  display: block;
  font-size: 10px;
  color: #999;
  margin-bottom: 6px;
  font-weight: 700;
}

.node-limit-panel strong {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  color: #111;
}

.node-limit-input input {
  width: 100%;
  height: 38px;
  border: 1px solid #DDD;
  border-radius: 6px;
  padding: 0 10px;
  font: inherit;
  font-weight: 700;
  background: #FFF;
}

.build-btn {
  border: 0;
  border-radius: 6px;
  height: 38px;
  padding: 0 14px;
  background: #111;
  color: #FFF;
  font-weight: 800;
  cursor: pointer;
}

.build-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 980px) {
  .build-recommendations,
  .build-inputs,
  .base-node-editor-grid,
  .professional-build-controls,
  .professional-stats {
    grid-template-columns: 1fr;
  }

  .review-header,
  .base-node-form,
  .graph-json-panel {
    grid-template-columns: 1fr;
  }

  .build-btn {
    width: 100%;
  }
}

/* Step 01 Tags */
.tags-container {
  margin-top: 12px;
  transition: opacity 0.3s;
}

.tags-container.dimmed {
    opacity: 0.3;
    pointer-events: none;
}

.tag-label {
  display: block;
  font-size: 10px;
  color: #AAA;
  margin-bottom: 8px;
  font-weight: 600;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.entity-tag {
  background: #F5F5F5;
  border: 1px solid #EEE;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  color: #333;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.2s;
}

.entity-tag.clickable {
    cursor: pointer;
}

.entity-tag.clickable:hover {
    background: #E0E0E0;
    border-color: #CCC;
}

/* Ontology Detail Overlay */
.ontology-detail-overlay {
    position: absolute;
    top: 60px; /* Below header roughly */
    left: 20px;
    right: 20px;
    bottom: 20px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(4px);
    z-index: 10;
    border: 1px solid #EAEAEA;
    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

.detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #EAEAEA;
    background: #FAFAFA;
}

.detail-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
}

.detail-type-badge {
    font-size: 9px;
    font-weight: 700;
    color: #FFF;
    background: #000;
    padding: 2px 6px;
    border-radius: 2px;
    text-transform: uppercase;
}

.detail-name {
    font-size: 14px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
}

.close-btn {
    background: none;
    border: none;
    font-size: 18px;
    color: #999;
    cursor: pointer;
    line-height: 1;
}

.close-btn:hover {
    color: #333;
}

.detail-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

.detail-desc {
    font-size: 12px;
    color: #444;
    line-height: 1.5;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px dashed #EAEAEA;
}

.detail-section {
    margin-bottom: 16px;
}

.section-label {
    display: block;
    font-size: 10px;
    font-weight: 600;
    color: #AAA;
    margin-bottom: 8px;
}

.attr-list, .conn-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.attr-item {
    font-size: 11px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: baseline;
    padding: 4px;
    background: #F9F9F9;
    border-radius: 4px;
}

.attr-name {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    color: #000;
}

.attr-type {
    color: #999;
    font-size: 10px;
}

.attr-desc {
    color: #555;
    flex: 1;
    min-width: 150px;
}

.example-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.example-tag {
    font-size: 11px;
    background: #FFF;
    border: 1px solid #E0E0E0;
    padding: 3px 8px;
    border-radius: 12px;
    color: #555;
}

.conn-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    padding: 6px;
    background: #F5F5F5;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
}

.conn-node {
    font-weight: 600;
    color: #333;
}

.conn-arrow {
    color: #BBB;
}

/* Step 02 Stats */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  background: #F9F9F9;
  padding: 16px;
  border-radius: 6px;
}

.stat-card {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #000;
  font-family: 'JetBrains Mono', monospace;
}

.stat-label {
  font-size: 9px;
  color: #999;
  text-transform: uppercase;
  margin-top: 4px;
  display: block;
}

/* Step 03 Button */
.action-btn {
  width: 100%;
  background: #000;
  color: #FFF;
  border: none;
  padding: 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.action-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.action-btn:disabled {
  background: #CCC;
  cursor: not-allowed;
}

.progress-section {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12px;
  color: #FF5722;
  margin-bottom: 12px;
}

.progress-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1.4;
}

.progress-copy span {
  overflow-wrap: anywhere;
}

.progress-copy small {
  color: #8A8F98;
  font-size: 11px;
}

.spinner-sm {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  border: 2px solid #FFCCBC;
  border-top-color: #FF5722;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* System Logs */
.system-logs {
  background: #000;
  color: #DDD;
  padding: 16px;
  font-family: 'JetBrains Mono', monospace;
  border-top: 1px solid #222;
  flex-shrink: 0;
}

.log-header {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #333;
  padding-bottom: 8px;
  margin-bottom: 8px;
  font-size: 10px;
  color: #888;
}

.log-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 80px; /* Approx 4 lines visible */
  overflow-y: auto;
  padding-right: 4px;
}

.log-content::-webkit-scrollbar {
  width: 4px;
}

.log-content::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 2px;
}

.log-line {
  font-size: 11px;
  display: flex;
  gap: 12px;
  line-height: 1.5;
}

.log-time {
  color: #666;
  min-width: 75px;
}

.log-msg {
  color: #CCC;
  word-break: break-all;
}
</style>
