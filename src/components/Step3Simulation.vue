<template>
  <div class="simulation-panel">
    <!-- Top Control Bar -->
    <div class="control-bar">
      <div class="status-group">
        <!-- 证据板与图谱成长通道 -->
        <div class="platform-status twitter" :class="{ active: runStatus.twitter_running, completed: runStatus.twitter_completed }">
          <div class="platform-header">
            <svg class="platform-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span class="platform-name">证据板与图谱成长</span>
            <span v-if="runStatus.twitter_completed" class="status-badge">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
          </div>
          <div class="platform-stats">
            <span class="stat">
              <span class="stat-label">STAGE</span>
              <span class="stat-value mono">{{ runStatus.twitter_current_round || 0 }}<span class="stat-total">/{{ runStatus.total_rounds || maxRounds || '-' }}</span></span>
            </span>
            <span class="stat">
              <span class="stat-label">Progress</span>
              <span class="stat-value mono">{{ twitterElapsedTime }}</span>
            </span>
            <span class="stat">
              <span class="stat-label">BOARD/KG</span>
              <span class="stat-value mono">{{ runStatus.twitter_actions_count || 0 }}</span>
            </span>
          </div>
          <!-- 可用动作提示 -->
          <div class="actions-tooltip">
            <div class="tooltip-title">KG Actions</div>
            <div class="tooltip-actions">
              <span class="tooltip-action">BOARD</span>
              <span class="tooltip-action">EVIDENCE</span>
              <span class="tooltip-action">PATH</span>
              <span class="tooltip-action">DECISION</span>
              <span class="tooltip-action">MUTATION</span>
              <span class="tooltip-action">EMERGENCE</span>
              <span class="tooltip-action">GOT</span>
              <span class="tooltip-action">LBD</span>
              <span class="tooltip-action">NEW NODE</span>
              <span class="tooltip-action">GROWTH</span>
              <span class="tooltip-action">MEMORY</span>
            </div>
          </div>
        </div>
        
        <!-- 科研组会讨论通道 -->
        <div class="platform-status reddit" :class="{ active: runStatus.reddit_running, completed: runStatus.reddit_completed }">
          <div class="platform-header">
            <svg class="platform-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
            <span class="platform-name">科研组会讨论</span>
            <span v-if="runStatus.reddit_completed" class="status-badge">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
          </div>
          <div class="platform-stats">
            <span class="stat">
              <span class="stat-label">STAGE</span>
              <span class="stat-value mono">{{ runStatus.reddit_current_round || 0 }}<span class="stat-total">/{{ runStatus.total_rounds || maxRounds || '-' }}</span></span>
            </span>
            <span class="stat">
              <span class="stat-label">Progress</span>
              <span class="stat-value mono">{{ redditElapsedTime }}</span>
            </span>
            <span class="stat">
              <span class="stat-label">DEBATE</span>
              <span class="stat-value mono">{{ runStatus.reddit_actions_count || 0 }}</span>
            </span>
          </div>
          <!-- 可用动作提示 -->
          <div class="actions-tooltip">
            <div class="tooltip-title">Research Actions</div>
            <div class="tooltip-actions">
              <span class="tooltip-action">REVIEW</span>
              <span class="tooltip-action">QUESTION</span>
              <span class="tooltip-action">RESPONSE</span>
              <span class="tooltip-action">CHAIN</span>
              <span class="tooltip-action">DEPTH</span>
              <span class="tooltip-action">CRITIQUE</span>
              <span class="tooltip-action">VALIDATE</span>
              <span class="tooltip-action">SYNTHESIS</span>
            </div>
          </div>
        </div>
      </div>

      <div class="action-controls">
        <button 
          class="action-btn primary"
          :disabled="!canOpenReportCenter"
          @click="handleNextStep"
        >
          前往报告生成
          <span class="arrow-icon">→</span>
        </button>
      </div>
    </div>

    <!-- Main Content: Dual Timeline -->
    <div class="main-content-area" ref="scrollContainer">
      <!-- Timeline Header -->
      <div class="timeline-header" v-if="allActions.length > 0">
        <div class="timeline-stats">
          <span class="total-count">TOTAL REASONING EVENTS: <span class="mono">{{ allActions.length }}</span></span>
          <span class="platform-breakdown">
            <span class="breakdown-item twitter">
              <svg class="mini-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
              <span class="mono">{{ twitterActionsCount }}</span>
            </span>
            <span class="breakdown-divider">/</span>
            <span class="breakdown-item reddit">
              <svg class="mini-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
              <span class="mono">{{ redditActionsCount }}</span>
            </span>
          </span>
        </div>
      </div>
      
      <!-- Timeline Feed -->
      <div class="timeline-feed">
        <div class="timeline-axis"></div>
        
        <TransitionGroup name="timeline-item">
          <div 
            v-for="action in chronologicalActions" 
            :key="action._uniqueId || action.id || `${action.timestamp}-${action.agent_id}`" 
            class="timeline-item"
            :class="action.platform"
          >
            <div class="timeline-marker">
              <div class="marker-dot"></div>
            </div>
            
            <div class="timeline-card">
              <div class="card-header">
                <div class="agent-info">
                  <div class="avatar-placeholder">{{ (action.agent_name || 'A')[0] }}</div>
                  <span class="agent-name">{{ action.agent_name }}</span>
                </div>
                
                <div class="header-meta">
                  <div class="platform-indicator">
                    <svg v-if="action.platform === 'twitter'" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                    <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                  </div>
                  <div class="action-badge" :class="getActionTypeClass(action.action_type)">
                    {{ getActionTypeLabel(action.action_type) }}
                  </div>
                </div>
              </div>
              
              <div class="card-body">
                <!-- ASC-OASIS: KG证据路径检查 -->
                <template v-if="action.action_type === 'RETRIEVE_SUBGRAPH'">
                  <div class="search-info">
                    <svg class="icon-small" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span class="search-label">KG证据路径检查:</span>
                    <span class="search-query">"{{ action.action_args?.graph_scope || 'ASC知识点子图' }}"</span>
                  </div>
                  <div class="content-text main-text">{{ action.action_args?.content }}</div>
                  <div v-if="action.action_args?.hot_topics?.length" class="evidence-tags">
                    <span v-for="topic in action.action_args.hot_topics.slice(0, 6)" :key="topic" class="evidence-tag">{{ topic }}</span>
                  </div>
                </template>

                <!-- ASC-OASIS: 组会阶段控制 / 证据板 / 经验沉淀 -->
                <template v-if="['BUILD_EVIDENCE_BOARD', 'LOCK_EVIDENCE_BOARD', 'OPEN_CROSS_EXAMINATION', 'OPEN_CAUSAL_CHAIN_ASSEMBLY', 'OPEN_KG_UPDATE_REVIEW', 'DEPTH_AUDIT', 'INSUFFICIENT_DEPTH', 'EXTEND_EVIDENCE_BOARD', 'GRAPH_AUDIT', 'EMERGENCE_SCAN', 'EMERGENCE_TRIGGER', 'OPEN_HYPOTHESIS_SEARCH', 'GOT_REASONING_PATH', 'LBD_ABC_DISCOVERY', 'KG_COMPLETION_CANDIDATE', 'NOVELTY_SEARCH', 'MULTI_AGENT_REBUTTAL', 'CAUSAL_AUDIT', 'SYSTEM_MEMORY_CONSOLIDATION', 'SYNTHESIZE_HIDDEN_KNOWLEDGE', 'MEMORY_UPDATE'].includes(action.action_type)">
                  <div class="content-text main-text">{{ action.action_args?.content }}</div>
                  <div v-if="action.action_args?.board_counts" class="check-list">
                    <span v-for="(count, key) in action.action_args.board_counts" :key="key" class="check-item">{{ key }}: {{ count }}</span>
                  </div>
                  <div v-if="action.action_args?.kg_change_plan?.edge_attribute_contract?.length" class="check-list">
                    <span v-for="attr in action.action_args.kg_change_plan.edge_attribute_contract" :key="attr" class="check-item">{{ attr }}</span>
                  </div>
                  <div v-if="action.action_args?.failed_checks?.length" class="check-list">
                    <span v-for="check in action.action_args.failed_checks" :key="check" class="check-item">{{ check }}</span>
                  </div>
                  <div v-if="action.action_args?.checks && !Array.isArray(action.action_args.checks)" class="check-list">
                    <span v-for="(passed, key) in action.action_args.checks" :key="key" class="check-item">{{ key }}: {{ passed ? 'OK' : 'FAIL' }}</span>
                  </div>
                  <div v-if="action.action_args?.board?.support_evidence?.length" class="evidence-tags">
                    <span v-for="item in action.action_args.board.support_evidence.slice(0, 3)" :key="item.board_key" class="evidence-tag">{{ item.board_key }}</span>
                  </div>
                  <div v-if="action.action_args?.heuristics" class="check-list">
                    <span v-for="(value, key) in action.action_args.heuristics" :key="key" class="check-item">{{ key }}</span>
                  </div>
                </template>

                <!-- ASC-OASIS: 证据卡 -->
                <template v-if="action.action_type === 'BUILD_EVIDENCE_CARD'">
                  <div class="evidence-card-box">
                    <div class="evidence-card-title">{{ action.action_args?.card_key }} · {{ action.action_args?.title }}</div>
                    <div class="evidence-card-meta">{{ action.action_args?.node_type_zh || action.action_args?.node_type }} · {{ action.action_args?.evidence_scope }}</div>
                    <p class="content-text">{{ action.action_args?.claim || action.action_args?.content }}</p>
                    <div v-if="action.action_args?.focus?.length" class="evidence-tags">
                      <span v-for="focus in action.action_args.focus" :key="focus" class="evidence-tag">{{ focus }}</span>
                    </div>
                  </div>
                </template>

                <!-- ASC-OASIS: 科研组会动作 -->
                <template v-if="['CITE_EVIDENCE', 'VERIFY_CLAIM', 'DISCUSS_EVIDENCE', 'INDEPENDENT_REVIEW', 'QUESTION_AGENT', 'CHALLENGE_CLAIM', 'RESPOND_TO_CHALLENGE', 'PROPOSE_HYPOTHESIS', 'FIND_CONFLICT', 'PROPOSE_CAUSAL_CHAIN', 'PROPOSE_MECHANISM_CHAIN', 'CRITIQUE_CAUSAL_CHAIN', 'REPAIR_CAUSAL_CHAIN', 'DISCOVER_ENTITY_NODE', 'EVALUATE_ENTITY_NODE', 'PROPOSE_ENTITY_RELATION', 'KG_UPDATE_DECISION', 'GRAPH_MUTATION_PROPOSAL', 'CONFIDENCE_UPDATE', 'VALIDATE_EDGE', 'SYNTHESIZE_PARTIAL_CONSENSUS', 'SYNTHESIZE_EXPLANATION'].includes(action.action_type)">
                  <div class="content-text main-text">{{ action.action_args?.content || action.action_args?.claim || action.action_args?.hypothesis || action.action_args?.answer_outline }}</div>
                  <div v-if="action.action_args?.role_scope" class="status-note">{{ action.action_args.role_scope }}</div>
                  <div v-if="action.action_args?.chain_type" class="status-note">{{ action.action_args.chain_type }} · confidence {{ action.action_args.confidence }}</div>
                  <div v-if="action.action_args?.mutation_type" class="status-note">{{ action.action_args.mutation_type }} · {{ action.action_args.decision }} · confidence {{ action.action_args.confidence ?? '-' }}</div>
                  <div v-if="action.action_args?.entity_type_zh" class="status-note">{{ action.action_args.entity_type_zh }} · quality {{ action.action_args.quality_score ?? '-' }} · {{ action.action_args.status }}</div>
                  <div v-if="getActionLogicChain(action.action_args).length" class="check-list">
                    <span v-for="item in getActionLogicChain(action.action_args)" :key="item" class="check-item logic-item">{{ item }}</span>
                  </div>
                  <div v-if="action.action_args?.steps?.length" class="check-list">
                    <span v-for="step in action.action_args.steps" :key="step.order" class="check-item">{{ step.type }}: {{ step.node }}</span>
                  </div>
                  <div v-if="action.action_args?.doubts?.length" class="check-list">
                    <span v-for="doubt in action.action_args.doubts" :key="doubt" class="check-item">{{ doubt }}</span>
                  </div>
                  <div v-if="action.action_args?.conditions?.length || action.action_args?.repaired_conditions?.length" class="check-list">
                    <span v-for="condition in (action.action_args.conditions || action.action_args.repaired_conditions)" :key="condition" class="check-item">{{ condition }}</span>
                  </div>
                  <div v-if="action.action_args?.evidence_cards?.length" class="evidence-tags">
                    <span v-for="card in action.action_args.evidence_cards" :key="card" class="evidence-tag">{{ card }}</span>
                  </div>
                  <div v-if="action.action_args?.required_checks?.length" class="check-list">
                    <span v-for="check in action.action_args.required_checks" :key="check" class="check-item">{{ check }}</span>
                  </div>
                  <div v-if="action.action_args?.required_evidence?.length" class="check-list">
                    <span v-for="item in action.action_args.required_evidence" :key="item" class="check-item">{{ item }}</span>
                  </div>
                  <div v-if="action.action_args?.aliases?.length" class="evidence-tags">
                    <span v-for="alias in action.action_args.aliases" :key="alias" class="evidence-tag">{{ alias }}</span>
                  </div>
                  <div v-if="action.action_args?.edge" class="edge-proposal">
                    <span class="edge-node">{{ action.action_args.edge.source }}</span>
                    <span class="edge-relation">{{ action.action_args.edge.relation }}</span>
                    <span class="edge-node">{{ action.action_args.edge.target }}</span>
                  </div>
                </template>

                <!-- ASC-OASIS: KG路径规划/图谱成长 -->
                <template v-if="['MAP_KG_PATHS', 'GROW_GRAPH', 'MERGE_ENTITY', 'ALIAS_ENTITY', 'SPLIT_CONCEPT'].includes(action.action_type)">
                  <div class="content-text main-text">{{ action.action_args?.content }}</div>
                  <div v-if="action.action_args?.paths?.length" class="evidence-tags">
                    <span v-for="path in action.action_args.paths" :key="path" class="evidence-tag">{{ path }}</span>
                  </div>
                  <div v-if="action.action_args?.edge" class="edge-proposal">
                    <span class="edge-node">{{ action.action_args.edge.source }}</span>
                    <span class="edge-relation">{{ action.action_args.edge.relation }}</span>
                    <span class="edge-node">{{ action.action_args.edge.target }}</span>
                  </div>
                  <div v-if="action.action_args?.entities?.length || action.action_args?.split_into?.length" class="check-list">
                    <span v-for="item in (action.action_args.entities || action.action_args.split_into)" :key="item" class="check-item">{{ item }}</span>
                  </div>
                </template>

                <!-- ASC-OASIS: 候选补边 -->
                <template v-if="action.action_type === 'PROPOSE_EDGE'">
                  <div class="edge-proposal">
                    <span class="edge-node">{{ action.action_args?.source }}</span>
                    <span class="edge-relation">{{ action.action_args?.relation }}</span>
                    <span class="edge-node">{{ action.action_args?.target }}</span>
                  </div>
                  <p class="content-text">{{ action.action_args?.content || action.action_args?.rationale }}</p>
                  <div class="status-note">{{ action.action_args?.status === 'candidate_pending_human_review' ? '待人工确认后写回KG' : action.action_args?.status }}</div>
                </template>

                <template v-if="isLegacySocialAction(action.action_type)">
                  <div class="status-note">检测到历史社媒动作记录。当前ASC-OASIS仅展示ASC-KG科研推理事件，请重新运行推理流程。</div>
                </template>

                <!-- 通用回退：未知ASC事件或有 content 但未被上述处理 -->
                <div v-if="!knownActionTypes.includes(action.action_type) && !isLegacySocialAction(action.action_type) && action.action_args?.content" class="content-text">
                  {{ action.action_args.content }}
                </div>
              </div>

              <div class="card-footer">
                <span class="time-tag">Stage {{ action.round_num }} • {{ formatActionTime(action.timestamp) }}</span>
                <!-- Platform tag removed as it is in header now -->
              </div>
            </div>
          </div>
        </TransitionGroup>

        <div v-if="allActions.length === 0" class="waiting-state">
          <div class="pulse-ring"></div>
          <span>Waiting for ASC-OASIS reasoning events...</span>
        </div>
      </div>
    </div>

    <!-- Bottom Info / Logs -->
    <div class="system-logs">
      <div class="log-header">
        <span class="log-title">ASC-OASIS MONITOR</span>
        <span class="log-id">{{ simulationId || 'NO_ASC_OASIS' }}</span>
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { 
  startSimulation, 
  stopSimulation,
  getRunStatus, 
  getRunStatusDetail
} from '../api/simulation'

const props = defineProps({
  simulationId: String,
  maxRounds: Number, // 从Step2传入的最大轮数
  graphGrowthConfig: Object,
  minutesPerRound: {
    type: Number,
    default: 30 // 默认每轮30分钟
  },
  projectData: Object,
  graphData: Object,
  systemLogs: Array
})

const emit = defineEmits(['go-back', 'add-log', 'update-status'])

const router = useRouter()

// State
const phase = ref(0) // 0: 未开始, 1: 运行中, 2: 已完成
const isStarting = ref(false)
const isStopping = ref(false)
const startError = ref(null)
const runStatus = ref({})
const allActions = ref([]) // 所有动作（增量累积）
const actionIds = ref(new Set()) // 用于去重的动作ID集合
const stageGrowthLogCache = ref(new Set()) // 记录已输出过的阶段成长统计快照
const scrollContainer = ref(null)

const knownActionTypes = [
  'RETRIEVE_SUBGRAPH',
  'MAP_KG_PATHS',
  'BUILD_EVIDENCE_BOARD',
  'LOCK_EVIDENCE_BOARD',
  'BUILD_EVIDENCE_CARD',
  'CITE_EVIDENCE',
  'VERIFY_CLAIM',
  'DISCUSS_EVIDENCE',
  'INDEPENDENT_REVIEW',
  'OPEN_CROSS_EXAMINATION',
  'QUESTION_AGENT',
  'CHALLENGE_CLAIM',
  'RESPOND_TO_CHALLENGE',
  'PROPOSE_HYPOTHESIS',
  'FIND_CONFLICT',
  'OPEN_CAUSAL_CHAIN_ASSEMBLY',
  'PROPOSE_CAUSAL_CHAIN',
  'PROPOSE_MECHANISM_CHAIN',
  'CRITIQUE_CAUSAL_CHAIN',
  'REPAIR_CAUSAL_CHAIN',
  'DISCOVER_ENTITY_NODE',
  'EVALUATE_ENTITY_NODE',
  'PROPOSE_ENTITY_RELATION',
  'PROPOSE_EDGE',
  'OPEN_KG_UPDATE_REVIEW',
  'KG_UPDATE_DECISION',
  'GRAPH_AUDIT',
  'EMERGENCE_SCAN',
  'EMERGENCE_TRIGGER',
  'OPEN_HYPOTHESIS_SEARCH',
  'GOT_REASONING_PATH',
  'LBD_ABC_DISCOVERY',
  'KG_COMPLETION_CANDIDATE',
  'NOVELTY_SEARCH',
  'MULTI_AGENT_REBUTTAL',
  'CAUSAL_AUDIT',
  'SYSTEM_MEMORY_CONSOLIDATION',
  'GRAPH_MUTATION_PROPOSAL',
  'CONFIDENCE_UPDATE',
  'VALIDATE_EDGE',
  'GROW_GRAPH',
  'MERGE_ENTITY',
  'ALIAS_ENTITY',
  'SPLIT_CONCEPT',
  'DEPTH_AUDIT',
  'INSUFFICIENT_DEPTH',
  'EXTEND_EVIDENCE_BOARD',
  'SYNTHESIZE_HIDDEN_KNOWLEDGE',
  'MEMORY_UPDATE',
  'SYNTHESIZE_PARTIAL_CONSENSUS',
  'SYNTHESIZE_EXPLANATION'
]

const legacySocialActionTypes = [
  'CREATE_POST',
  'QUOTE_POST',
  'REPOST',
  'LIKE_POST',
  'LIKE_COMMENT',
  'CREATE_COMMENT',
  'SEARCH_POSTS',
  'FOLLOW',
  'UPVOTE_POST',
  'DOWNVOTE_POST',
  'DO_NOTHING'
]

// Computed
// 按时间顺序显示动作（最新的在最后面，即底部）
const chronologicalActions = computed(() => {
  return allActions.value
})

// 各ASC-OASIS通道动作计数
const twitterActionsCount = computed(() => {
  return allActions.value.filter(a => a.platform === 'twitter').length
})

const redditActionsCount = computed(() => {
  return allActions.value.filter(a => a.platform === 'reddit').length
})

const currentProjectId = computed(() => String(
  props.projectData?.project_id
  || props.projectData?.projectId
  || ''
).trim())
const canOpenReportCenter = computed(() => (
  phase.value === 2
  && runStatus.value?.runner_status === 'completed'
  && Boolean(currentProjectId.value)
  && Boolean(String(props.simulationId || '').trim())
))

// 格式化ASC-OASIS阶段进度
const formatElapsedTime = (currentRound) => {
  const total = runStatus.value.total_rounds || props.maxRounds || 0
  if (!currentRound || currentRound <= 0) return '0%'
  if (!total) return `Stage ${currentRound}`
  return `${Math.min(100, Math.round((currentRound / total) * 100))}%`
}

const graphNodeActionTypes = new Set([
  'DISCOVER_ENTITY_NODE'
])

const graphEdgeActionTypes = new Set([
  'PROPOSE_EDGE',
  'KG_UPDATE_DECISION',
  'PROPOSE_ENTITY_RELATION',
  'GRAPH_MUTATION_PROPOSAL',
  'VALIDATE_EDGE',
  'GROW_GRAPH',
  'LBD_ABC_DISCOVERY',
  'KG_COMPLETION_CANDIDATE'
])

const grownEdgeActionTypes = new Set([
  'VALIDATE_EDGE',
  'GROW_GRAPH'
])

const getActionArgs = (action) => action?.action_args || {}

const extractEntityKey = (action) => {
  const args = getActionArgs(action)
  return args.entity_key || args.name || action?._uniqueId || action?.id || ''
}

const extractEdgeKey = (action) => {
  const args = getActionArgs(action)
  return (
    args.edge_key ||
    args.target_edge_key ||
    args.edge?.edge_key ||
    args.proposal?.edge_key ||
    args.proposal?.edge?.edge_key ||
    args.growth_event?.edge?.edge_key ||
    args.hidden_connection ||
    args.missing_edge ||
    args.proposal_id ||
    action?._uniqueId ||
    ''
  )
}

const getStageGrowthStats = (stage) => {
  const nodes = new Set()
  const edges = new Set()
  const grownEdges = new Set()

  allActions.value.forEach(action => {
    if (Number(action.round_num) !== Number(stage)) return

    if (graphNodeActionTypes.has(action.action_type)) {
      const entityKey = extractEntityKey(action)
      if (entityKey) nodes.add(entityKey)
    }

    if (graphEdgeActionTypes.has(action.action_type)) {
      const edgeKey = extractEdgeKey(action)
      if (edgeKey) edges.add(edgeKey)
    }

    if (grownEdgeActionTypes.has(action.action_type)) {
      const edgeKey = extractEdgeKey(action)
      if (edgeKey) grownEdges.add(edgeKey)
    }
  })

  return {
    newNodes: nodes.size,
    relationEdges: edges.size,
    grownEdges: grownEdges.size
  }
}

const hasLoadedActionsForStage = (stage) => {
  return allActions.value.some(action => Number(action.round_num) === Number(stage))
}

const formatStageGrowthSuffix = (stage) => {
  if (!hasLoadedActionsForStage(stage)) {
    return ' | 图谱成长:同步中'
  }
  const stats = getStageGrowthStats(stage)
  return ` | 新节点:${stats.newNodes} | 关系边:${stats.relationEdges} | 入图边:${stats.grownEdges}`
}

const addStageGrowthSnapshotLog = (stage) => {
  if (!stage) return
  const stats = getStageGrowthStats(stage)
  const hasGrowth = stats.newNodes > 0 || stats.relationEdges > 0 || stats.grownEdges > 0
  if (!hasGrowth) return

  const total = runStatus.value.total_rounds || props.maxRounds || '-'
  const cacheKey = `${stage}:${stats.newNodes}:${stats.relationEdges}:${stats.grownEdges}`
  if (stageGrowthLogCache.value.has(cacheKey)) return

  stageGrowthLogCache.value.add(cacheKey)
  addLog(`[图谱成长统计] Stage ${stage}/${total} | 新节点:${stats.newNodes} | 关系边:${stats.relationEdges} | 入图边:${stats.grownEdges}`)
}

// 证据板与图谱成长通道进度
const twitterElapsedTime = computed(() => {
  return formatElapsedTime(runStatus.value.twitter_current_round || 0)
})

// 科研组会讨论通道进度
const redditElapsedTime = computed(() => {
  return formatElapsedTime(runStatus.value.reddit_current_round || 0)
})

// Methods
const addLog = (msg) => {
  emit('add-log', msg)
}

// 重置所有状态（用于重新启动ASC-OASIS推理）
const resetAllState = () => {
  phase.value = 0
  runStatus.value = {}
  allActions.value = []
  actionIds.value = new Set()
  stageGrowthLogCache.value = new Set()
  prevTwitterRound.value = 0
  prevRedditRound.value = 0
  startError.value = null
  isStarting.value = false
  isStopping.value = false
  stopPolling()  // 停止之前可能存在的轮询
}

// 启动ASC-OASIS推理
const doStartSimulation = async () => {
  if (!props.simulationId) {
    addLog('错误：缺少 simulationId')
    return
  }
  
  // 先重置所有状态，确保不会受到上一次模拟的影响
  resetAllState()
  
  isStarting.value = true
  startError.value = null
  addLog('正在启动ASC-OASIS科研推理环境...')
  emit('update-status', 'processing')
  
  try {
    const params = {
      simulation_id: props.simulationId,
      platform: 'parallel',
      force: true,  // 强制重新开始
      enable_graph_memory_update: true  // 传入graph_id用于本地ASC-KG成长产物追踪
    }
    
    if (props.maxRounds) {
      params.max_rounds = props.maxRounds
      addLog(`设置最大推理阶段数: ${props.maxRounds}`)
    }
    if (props.graphGrowthConfig) {
      params.graph_growth_config = props.graphGrowthConfig
      addLog('启用自定义ASC-KG图谱成长参数')
    }
    
    addLog('多Agent验证后的关系将写入本地ASC-KG增量图，作为下一次GraphRAG检索输入')
    
    const res = await startSimulation(params)
    
    if (res.success && res.data) {
      if (res.data.force_restarted) {
        addLog('✓ 已清理旧的推理日志，重新开始ASC-OASIS流程')
      }
      addLog('✓ ASC-OASIS推理引擎启动成功')
      addLog('  ├─ 运行模式: ASC科研组会式多Agent推理')
      
      phase.value = 1
      runStatus.value = res.data
      
      startStatusPolling()
      startDetailPolling()
    } else {
      startError.value = res.error || '启动失败'
      addLog(`✗ 启动失败: ${res.error || '未知错误'}`)
      emit('update-status', 'error')
    }
  } catch (err) {
    startError.value = err.message
    addLog(`✗ 启动异常: ${err.message}`)
    emit('update-status', 'error')
  } finally {
    isStarting.value = false
  }
}

// 停止ASC-OASIS推理
const handleStopSimulation = async () => {
  if (!props.simulationId) return
  
  isStopping.value = true
  addLog('正在停止ASC-OASIS推理...')
  
  try {
    const res = await stopSimulation({ simulation_id: props.simulationId })
    
    if (res.success) {
      addLog('✓ ASC-OASIS推理已停止')
      phase.value = 0
      stopPolling()
      emit('update-status', 'stopped')
    } else {
      addLog(`停止失败: ${res.error || '未知错误'}`)
    }
  } catch (err) {
    addLog(`停止异常: ${err.message}`)
  } finally {
    isStopping.value = false
  }
}

// 轮询状态
let statusTimer = null
let detailTimer = null

const startStatusPolling = () => {
  statusTimer = setInterval(fetchRunStatus, 2000)
}

const startDetailPolling = () => {
  detailTimer = setInterval(fetchRunStatusDetail, 3000)
}

const stopPolling = () => {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
  if (detailTimer) {
    clearInterval(detailTimer)
    detailTimer = null
  }
}

// 追踪各平台的上一次轮次，用于检测变化并输出日志
const prevTwitterRound = ref(0)
const prevRedditRound = ref(0)

const fetchRunStatus = async () => {
  if (!props.simulationId) return
  
  try {
    const res = await getRunStatus(props.simulationId)
    
    if (res.success && res.data) {
      const data = res.data
      
      runStatus.value = data
      const twitterAdvanced = data.twitter_current_round > prevTwitterRound.value
      const redditAdvanced = data.reddit_current_round > prevRedditRound.value

      if (twitterAdvanced || redditAdvanced) {
        await fetchRunStatusDetail({ emitGrowthSnapshots: false })
      }

      if (data.runner_status === 'failed') {
        await fetchRunStatusDetail({ emitGrowthSnapshots: false })
        const errorMessage = data.error || '未知错误'
        startError.value = errorMessage
        addLog(`✗ ASC-OASIS推理失败: ${errorMessage}`)
        phase.value = 0
        stopPolling()
        emit('update-status', 'error')
        return
      }
      
      // 分别检测两个ASC-OASIS通道的阶段变化并输出日志
      if (twitterAdvanced) {
        addLog(`[证据板/图谱] Stage ${data.twitter_current_round}/${data.total_rounds} | Actions:${data.twitter_actions_count}${formatStageGrowthSuffix(data.twitter_current_round)}`)
        prevTwitterRound.value = data.twitter_current_round
      }
      
      if (redditAdvanced) {
        addLog(`[组会讨论] Stage ${data.reddit_current_round}/${data.total_rounds} | Debate:${data.reddit_actions_count}${formatStageGrowthSuffix(data.reddit_current_round)}`)
        prevRedditRound.value = data.reddit_current_round
      }
      
      // 仅后端 runner 的 completed 状态表示图谱演化已完成。
      const isCompleted = data.runner_status === 'completed'
      
      // 额外检查：如果后端还没来得及更新 runner_status，但平台已经报告完成
      // 通过检测 twitter_completed 和 reddit_completed 状态判断
      const platformsCompleted = checkPlatformsCompleted(data)
      
      if (platformsCompleted && !isCompleted) {
        addLog('✓ 检测到所有ASC-OASIS通道已结束，等待演化完成状态')
      }

      if (isCompleted) {
        addLog('✓ ASC-OASIS推理已完成')
        phase.value = 2
        stopPolling()
        emit('update-status', 'completed')
      }
    }
  } catch (err) {
    console.warn('获取运行状态失败:', err)
  }
}

// 检查所有启用的ASC-OASIS通道是否已完成
const checkPlatformsCompleted = (data) => {
  // 如果没有任何平台数据，返回 false
  if (!data) return false
  
  // 检查各通道的完成状态
  const twitterCompleted = data.twitter_completed === true
  const redditCompleted = data.reddit_completed === true
  
  // 如果至少有一个通道完成了，检查是否所有启用通道都完成了
  // 通过 actions_count 判断通道是否被启用（如果 count > 0 或 running 曾为 true）
  const twitterEnabled = (data.twitter_actions_count > 0) || data.twitter_running || twitterCompleted
  const redditEnabled = (data.reddit_actions_count > 0) || data.reddit_running || redditCompleted
  
  // 如果没有任何通道被启用，返回 false
  if (!twitterEnabled && !redditEnabled) return false
  
  // 检查所有启用通道是否都已完成
  if (twitterEnabled && !twitterCompleted) return false
  if (redditEnabled && !redditCompleted) return false
  
  return true
}

const fetchRunStatusDetail = async (options = {}) => {
  if (!props.simulationId) return
  
  try {
    const res = await getRunStatusDetail(props.simulationId)
    
    if (res.success && res.data) {
      // 使用 all_actions 获取完整的动作列表
      const serverActions = res.data.all_actions || []
      
      // 增量添加新动作（去重）
      let newActionsAdded = 0
      const touchedStages = new Set()
      serverActions.forEach(action => {
        // 生成唯一ID
        const actionId = action.id || `${action.timestamp}-${action.platform}-${action.agent_id}-${action.action_type}`
        
        if (!actionIds.value.has(actionId)) {
          actionIds.value.add(actionId)
          allActions.value.push({
            ...action,
            _uniqueId: actionId
          })
          if (action.round_num) {
            touchedStages.add(action.round_num)
          }
          newActionsAdded++
        }
      })

      if (newActionsAdded > 0 && options.emitGrowthSnapshots !== false) {
        touchedStages.forEach(stage => addStageGrowthSnapshotLog(stage))
      }
      
      // 不自动滚动，让用户自由查看时间轴
      // 新动作会在底部追加
    }
  } catch (err) {
    console.warn('获取详细状态失败:', err)
  }
}

// Helpers
const getActionTypeLabel = (type) => {
  const labels = {
    'RETRIEVE_SUBGRAPH': 'SUBGRAPH',
    'MAP_KG_PATHS': 'PATH',
    'BUILD_EVIDENCE_BOARD': 'BOARD',
    'LOCK_EVIDENCE_BOARD': 'LOCK',
    'BUILD_EVIDENCE_CARD': 'EVIDENCE',
    'CITE_EVIDENCE': 'CITE',
    'VERIFY_CLAIM': 'VERIFY',
    'DISCUSS_EVIDENCE': 'DISCUSS',
    'INDEPENDENT_REVIEW': 'REVIEW',
    'OPEN_CROSS_EXAMINATION': 'CROSS',
    'QUESTION_AGENT': 'QUESTION',
    'CHALLENGE_CLAIM': 'REFUTE',
    'RESPOND_TO_CHALLENGE': 'RESPONSE',
    'PROPOSE_HYPOTHESIS': 'HYPOTHESIS',
    'FIND_CONFLICT': 'CONFLICT',
    'OPEN_CAUSAL_CHAIN_ASSEMBLY': 'CHAIN',
    'PROPOSE_CAUSAL_CHAIN': 'CHAIN',
    'PROPOSE_MECHANISM_CHAIN': 'MECH CHAIN',
    'CRITIQUE_CAUSAL_CHAIN': 'CRITIQUE',
    'REPAIR_CAUSAL_CHAIN': 'REPAIR',
    'DISCOVER_ENTITY_NODE': 'NEW NODE',
    'EVALUATE_ENTITY_NODE': 'NODE QA',
    'PROPOSE_ENTITY_RELATION': 'NODE EDGE',
    'PROPOSE_EDGE': 'EDGE',
    'OPEN_KG_UPDATE_REVIEW': 'KG REVIEW',
    'KG_UPDATE_DECISION': 'KG DECISION',
    'GRAPH_AUDIT': 'KG AUDIT',
    'EMERGENCE_SCAN': 'EMERGENCE',
    'EMERGENCE_TRIGGER': 'TRIGGER',
    'OPEN_HYPOTHESIS_SEARCH': 'HYP SEARCH',
    'GOT_REASONING_PATH': 'GOT',
    'LBD_ABC_DISCOVERY': 'LBD ABC',
    'KG_COMPLETION_CANDIDATE': 'KG COMPLETE',
    'NOVELTY_SEARCH': 'NOVELTY',
    'MULTI_AGENT_REBUTTAL': 'DEBATE',
    'CAUSAL_AUDIT': 'CAUSAL',
    'SYSTEM_MEMORY_CONSOLIDATION': 'MEM SYS',
    'GRAPH_MUTATION_PROPOSAL': 'MUTATION',
    'CONFIDENCE_UPDATE': 'CONFIDENCE',
    'VALIDATE_EDGE': 'VALIDATE',
    'GROW_GRAPH': 'GROWTH',
    'MERGE_ENTITY': 'MERGE',
    'ALIAS_ENTITY': 'ALIAS',
    'SPLIT_CONCEPT': 'SPLIT',
    'DEPTH_AUDIT': 'DEPTH',
    'INSUFFICIENT_DEPTH': 'DEPTH FAIL',
    'EXTEND_EVIDENCE_BOARD': 'BOARD+',
    'SYNTHESIZE_HIDDEN_KNOWLEDGE': 'HIDDEN KG',
    'MEMORY_UPDATE': 'MEMORY',
    'SYNTHESIZE_PARTIAL_CONSENSUS': 'CONSENSUS',
    'SYNTHESIZE_EXPLANATION': 'SYNTHESIS'
  }
  if (isLegacySocialAction(type)) return 'LEGACY'
  return labels[type] || type || 'UNKNOWN'
}

const getActionTypeClass = (type) => {
  const classes = {
    'RETRIEVE_SUBGRAPH': 'badge-meta',
    'MAP_KG_PATHS': 'badge-meta',
    'BUILD_EVIDENCE_BOARD': 'badge-meta',
    'LOCK_EVIDENCE_BOARD': 'badge-action',
    'BUILD_EVIDENCE_CARD': 'badge-post',
    'CITE_EVIDENCE': 'badge-action',
    'VERIFY_CLAIM': 'badge-action',
    'DISCUSS_EVIDENCE': 'badge-comment',
    'INDEPENDENT_REVIEW': 'badge-action',
    'OPEN_CROSS_EXAMINATION': 'badge-meta',
    'QUESTION_AGENT': 'badge-comment',
    'CHALLENGE_CLAIM': 'badge-comment',
    'RESPOND_TO_CHALLENGE': 'badge-action',
    'PROPOSE_HYPOTHESIS': 'badge-comment',
    'FIND_CONFLICT': 'badge-comment',
    'OPEN_CAUSAL_CHAIN_ASSEMBLY': 'badge-meta',
    'PROPOSE_CAUSAL_CHAIN': 'badge-post',
    'PROPOSE_MECHANISM_CHAIN': 'badge-post',
    'CRITIQUE_CAUSAL_CHAIN': 'badge-comment',
    'REPAIR_CAUSAL_CHAIN': 'badge-action',
    'DISCOVER_ENTITY_NODE': 'badge-post',
    'EVALUATE_ENTITY_NODE': 'badge-action',
    'PROPOSE_ENTITY_RELATION': 'badge-post',
    'PROPOSE_EDGE': 'badge-post',
    'OPEN_KG_UPDATE_REVIEW': 'badge-meta',
    'KG_UPDATE_DECISION': 'badge-action',
    'GRAPH_AUDIT': 'badge-meta',
    'EMERGENCE_SCAN': 'badge-meta',
    'EMERGENCE_TRIGGER': 'badge-action',
    'OPEN_HYPOTHESIS_SEARCH': 'badge-meta',
    'GOT_REASONING_PATH': 'badge-post',
    'LBD_ABC_DISCOVERY': 'badge-post',
    'KG_COMPLETION_CANDIDATE': 'badge-post',
    'NOVELTY_SEARCH': 'badge-action',
    'MULTI_AGENT_REBUTTAL': 'badge-comment',
    'CAUSAL_AUDIT': 'badge-meta',
    'SYSTEM_MEMORY_CONSOLIDATION': 'badge-meta',
    'GRAPH_MUTATION_PROPOSAL': 'badge-post',
    'CONFIDENCE_UPDATE': 'badge-action',
    'VALIDATE_EDGE': 'badge-action',
    'GROW_GRAPH': 'badge-post',
    'MERGE_ENTITY': 'badge-action',
    'ALIAS_ENTITY': 'badge-action',
    'SPLIT_CONCEPT': 'badge-action',
    'DEPTH_AUDIT': 'badge-meta',
    'INSUFFICIENT_DEPTH': 'badge-comment',
    'EXTEND_EVIDENCE_BOARD': 'badge-meta',
    'SYNTHESIZE_HIDDEN_KNOWLEDGE': 'badge-meta',
    'MEMORY_UPDATE': 'badge-meta',
    'SYNTHESIZE_PARTIAL_CONSENSUS': 'badge-comment',
    'SYNTHESIZE_EXPLANATION': 'badge-post'
  }
  if (isLegacySocialAction(type)) return 'badge-idle'
  return classes[type] || 'badge-default'
}

const isLegacySocialAction = (type) => legacySocialActionTypes.includes(type)

const formatActionTime = (timestamp) => {
  if (!timestamp) return ''
  try {
    return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}

const getActionLogicChain = (args = {}) => {
  return args.logic_chain || args.critique_chain || args.audit_chain || args.repair_chain || []
}

const handleNextStep = () => {
  if (!canOpenReportCenter.value) return
  const projectId = currentProjectId.value
  return router.push({
    name: 'Reports',
    query: { projectId, simulationId: props.simulationId }
  })
}

// Scroll log to bottom
const logContent = ref(null)
watch(() => props.systemLogs?.length, () => {
  nextTick(() => {
    if (logContent.value) {
      logContent.value.scrollTop = logContent.value.scrollHeight
    }
  })
})

onMounted(() => {
  addLog('Step3 ASC-OASIS科研推理初始化')
  if (props.simulationId) {
    doStartSimulation()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.simulation-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
  font-family: 'Space Grotesk', 'Noto Sans SC', system-ui, sans-serif;
  overflow: hidden;
}

/* --- Control Bar --- */
.control-bar {
  background: #FFF;
  padding: 12px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #EAEAEA;
  z-index: 10;
  height: 64px;
}

.status-group {
  display: flex;
  gap: 12px;
}

/* Platform Status Cards */
.platform-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 4px;
  background: #FAFAFA;
  border: 1px solid #EAEAEA;
  opacity: 0.7;
  transition: all 0.3s;
  min-width: 140px;
  position: relative;
  cursor: pointer;
}

.platform-status.active {
  opacity: 1;
  border-color: #333;
  background: #FFF;
}

.platform-status.completed {
  opacity: 1;
  border-color: #1A936F;
  background: #F2FAF6;
}

/* Actions Tooltip */
.actions-tooltip {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  padding: 10px 14px;
  background: #000;
  color: #FFF;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  z-index: 100;
  min-width: 180px;
  pointer-events: none;
}

.actions-tooltip::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid #000;
}

.platform-status:hover .actions-tooltip {
  opacity: 1;
  visibility: visible;
}

.tooltip-title {
  font-size: 10px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.tooltip-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tooltip-action {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  color: #FFF;
  letter-spacing: 0.03em;
}

.platform-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.platform-name {
  font-size: 11px;
  font-weight: 700;
  color: #000;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.platform-status.twitter .platform-icon { color: #000; }
.platform-status.reddit .platform-icon { color: #000; }

.platform-stats {
  display: flex;
  gap: 10px;
}

.stat {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.stat-label {
  font-size: 8px;
  color: #999;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 11px;
  font-weight: 600;
  color: #333;
}

.stat-total, .stat-unit {
  font-size: 9px;
  color: #999;
  font-weight: 400;
}

.status-badge {
  margin-left: auto;
  color: #1A936F;
  display: flex;
  align-items: center;
}

/* Action Button */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.action-btn.primary {
  background: #000;
  color: #FFF;
}

.action-btn.primary:hover:not(:disabled) {
  background: #333;
}

.action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* --- Main Content Area --- */
.main-content-area {
  flex: 1;
  overflow-y: auto;
  position: relative;
  background: #FFF;
}

/* Timeline Header */
.timeline-header {
  position: sticky;
  top: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  padding: 12px 24px;
  border-bottom: 1px solid #EAEAEA;
  z-index: 5;
  display: flex;
  justify-content: center;
}

.timeline-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 11px;
  color: #666;
  background: #F5F5F5;
  padding: 4px 12px;
  border-radius: 20px;
}

.total-count {
  font-weight: 600;
  color: #333;
}

.platform-breakdown {
  display: flex;
  align-items: center;
  gap: 8px;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.breakdown-divider { color: #DDD; }
.breakdown-item.twitter { color: #000; }
.breakdown-item.reddit { color: #000; }

/* --- Timeline Feed --- */
.timeline-feed {
  padding: 24px 0;
  position: relative;
  min-height: 100%;
  max-width: 900px;
  margin: 0 auto;
}

.timeline-axis {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #EAEAEA; /* Cleaner line */
  transform: translateX(-50%);
}

.timeline-item {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
  position: relative;
  width: 100%;
}

.timeline-marker {
  position: absolute;
  left: 50%;
  top: 24px;
  width: 10px;
  height: 10px;
  background: #FFF;
  border: 1px solid #CCC;
  border-radius: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.marker-dot {
  width: 4px;
  height: 4px;
  background: #CCC;
  border-radius: 50%;
}

.timeline-item.twitter .marker-dot { background: #000; }
.timeline-item.reddit .marker-dot { background: #000; }
.timeline-item.twitter .timeline-marker { border-color: #000; }
.timeline-item.reddit .timeline-marker { border-color: #000; }

/* Card Layout */
.timeline-card {
  width: calc(100% - 48px);
  background: #FFF;
  border-radius: 2px;
  padding: 16px 20px;
  border: 1px solid #EAEAEA;
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
  position: relative;
  transition: all 0.2s;
}

.timeline-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  border-color: #DDD;
}

/* Left side (Twitter) */
.timeline-item.twitter {
  justify-content: flex-start;
  padding-right: 50%;
}
.timeline-item.twitter .timeline-card {
  margin-left: auto;
  margin-right: 32px; /* Gap from axis */
}

/* Right side (Reddit) */
.timeline-item.reddit {
  justify-content: flex-end;
  padding-left: 50%;
}
.timeline-item.reddit .timeline-card {
  margin-right: auto;
  margin-left: 32px; /* Gap from axis */
}

/* Card Content Styles */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #F5F5F5;
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-placeholder {
  width: 24px;
  height: 24px;
  background: #000;
  color: #FFF;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.agent-name {
  font-size: 13px;
  font-weight: 600;
  color: #000;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.platform-indicator {
  color: #999;
  display: flex;
  align-items: center;
}

.action-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 2px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid transparent;
}

/* Monochromatic Badges */
.badge-post { background: #F0F0F0; color: #333; border-color: #E0E0E0; }
.badge-comment { background: #F0F0F0; color: #666; border-color: #E0E0E0; }
.badge-action { background: #FFF; color: #666; border: 1px solid #E0E0E0; }
.badge-meta { background: #FAFAFA; color: #999; border: 1px dashed #DDD; }
.badge-idle { opacity: 0.5; }

.content-text {
  font-size: 13px;
  line-height: 1.6;
  color: #333;
  margin-bottom: 10px;
}

.content-text.main-text {
  font-size: 14px;
  color: #000;
}

.evidence-card-box {
  background: #FAFAFA;
  border: 1px solid #E6E6E6;
  border-left: 3px solid #111;
  padding: 10px 12px;
  border-radius: 4px;
  margin-bottom: 10px;
}

.evidence-card-title {
  font-size: 12px;
  font-weight: 700;
  color: #111;
  margin-bottom: 4px;
}

.evidence-card-meta {
  font-size: 11px;
  color: #777;
  margin-bottom: 8px;
}

.evidence-tags,
.check-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.evidence-tag,
.check-item {
  font-size: 10px;
  line-height: 1;
  color: #555;
  border: 1px solid #E0E0E0;
  background: #FFF;
  border-radius: 3px;
  padding: 5px 6px;
}

.check-item.logic-item {
  flex-basis: 100%;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.edge-proposal {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 12px;
}

.edge-node {
  background: #F5F5F5;
  border: 1px solid #E6E6E6;
  padding: 7px 8px;
  border-radius: 4px;
  overflow-wrap: anywhere;
}

.edge-relation {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #666;
}

.status-note {
  font-size: 11px;
  color: #8A5A00;
  background: #FFF8E5;
  border: 1px solid #F1D48A;
  border-radius: 4px;
  padding: 6px 8px;
}

/* Info Blocks (Quote, Repost, etc) */
.quoted-block, .repost-content {
  background: #F9F9F9;
  border: 1px solid #EEE;
  padding: 10px 12px;
  border-radius: 2px;
  margin-top: 8px;
  font-size: 12px;
  color: #555;
}

.quote-header, .repost-info, .like-info, .search-info, .follow-info, .vote-info, .idle-info, .comment-context {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: #666;
}

.icon-small {
  color: #999;
}
.icon-small.filled {
  color: #999; /* Keep icons neutral unless highlighted */
}

.search-query {
  font-family: 'JetBrains Mono', monospace;
  background: #F0F0F0;
  padding: 0 4px;
  border-radius: 2px;
}

.card-footer {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  font-size: 10px;
  color: #BBB;
  font-family: 'JetBrains Mono', monospace;
}

/* Waiting State */
.waiting-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #CCC;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.pulse-ring {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #EAEAEA;
  animation: ripple 2s infinite;
}

@keyframes ripple {
  0% { transform: scale(0.8); opacity: 1; border-color: #CCC; }
  100% { transform: scale(2.5); opacity: 0; border-color: #EAEAEA; }
}

/* Animation */
.timeline-item-enter-active,
.timeline-item-leave-active {
  transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
}

.timeline-item-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.timeline-item-leave-to {
  opacity: 0;
}

/* Logs */
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
  color: #666;
}

.log-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100px;
  overflow-y: auto;
  padding-right: 4px;
}

.log-content::-webkit-scrollbar { width: 4px; }
.log-content::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

.log-line {
  font-size: 11px;
  display: flex;
  gap: 12px;
  line-height: 1.5;
}

.log-time { color: #555; min-width: 75px; }
.log-msg { color: #BBB; word-break: break-all; }
.mono { font-family: 'JetBrains Mono', monospace; }

/* Loading spinner for button */
.loading-spinner-small {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #FFF;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 6px;
}
</style>
