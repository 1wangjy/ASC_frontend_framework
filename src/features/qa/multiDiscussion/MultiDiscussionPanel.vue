<template>
  <section
    :class="['multi-discussion', {
      'is-embedded': embedded,
      'has-history': messages.length,
      'is-empty': !messages.length
    }]"
    aria-label="Multi-Discussion 多轮知识图谱问答"
  >
    <header v-if="!embedded" class="multi-discussion-header">
      <div class="multi-discussion-title">
        <span class="multi-discussion-kicker">专业问答 · 多轮记忆 · 多模态解析</span>
        <h2>Multi-Discussion</h2>
        <p>上传 SEM/TEM、XRD/EDS、性能曲线、结构示意或工艺流程图，结合材料知识图谱持续追问。</p>
      </div>

      <div class="multi-discussion-controls">
        <label for="multi-discussion-graph">目标 Project ID</label>
        <select
          id="multi-discussion-graph"
          :value="selectedGraphId"
          :disabled="sending || graphCatalogLoading || !graphOptions.length"
          @change="changeGraph"
        >
          <option value="" disabled>请选择 proj_id</option>
          <option
            v-for="graph in graphOptions"
            :key="graph.graph_id"
            :value="graph.graph_id"
          >
            {{ graph.project_id }} · {{ graph.graph_name || graph.graph_id }}
          </option>
        </select>
        <div class="multi-discussion-control-meta">
          <span v-if="selectedGraph">Graph {{ selectedGraph.graph_id }}</span>
          <span v-else-if="graphCatalogLoading">正在加载 Graph 目录…</span>
          <span v-else-if="graphCatalogError" class="is-error">{{ graphCatalogError }}</span>
          <button type="button" :disabled="graphCatalogLoading" @click="emit('reload-graphs')">刷新</button>
        </div>
        <button type="button" class="new-discussion-btn" :disabled="sending" @click="startNewDiscussion">
          新建讨论
        </button>
      </div>
    </header>

    <div v-if="messages.length" class="multi-discussion-status" role="status">
      <span :class="['status-dot', { active: conversationId }]" aria-hidden="true"></span>
      <strong>{{ conversationId ? `已记忆 ${turnCount} 轮` : '尚未开始会话' }}</strong>
      <span v-if="selectedGraph">固定作用域：{{ selectedGraph.project_id }}</span>
      <span
        v-if="visionCapability"
        :class="['vision-capability', { 'is-ready': visionCapability.vision_ready, 'is-warning': !visionCapability.vision_ready }]"
      >
        Vision {{ visionCapability.vision_ready ? '已就绪' : '配置异常' }} · {{ visionCapability.vision_model || '未配置模型' }}
      </span>
      <span class="model-mode-status">
        本轮模型 · {{ selectedModelModeDetails.label }} · {{ selectedModelModeDetails.model }}
      </span>
      <span v-if="conversationId" class="conversation-id">{{ conversationId }}</span>
    </div>

    <div v-if="messages.length" ref="messageViewport" class="multi-discussion-messages">
      <div v-if="embedded && error" class="multi-discussion-error" role="alert">{{ error }}</div>
      <article
        v-for="message in messages"
        :key="message.localId"
        :class="['discussion-message', `is-${message.role}`]"
      >
        <div class="message-avatar">{{ message.role === 'user' ? '你' : '研' }}</div>
        <div class="message-card">
          <div class="message-meta">
            <strong>{{ message.role === 'user' ? '用户' : 'Multi-Discussion' }}</strong>
            <span>{{ formatTime(message.createdAt) }}</span>
          </div>
          <div v-if="message.attachments?.length" class="message-image-grid">
            <figure v-for="attachment in message.attachments" :key="attachment.asset_id || attachment.url">
              <img
                :src="resolveMultiDiscussionAssetUrl(attachment.previewUrl || attachment.url)"
                :alt="attachment.filename || '材料科研图片'"
                class="previewable-image"
                loading="lazy"
                role="button"
                tabindex="0"
                @click="openImagePreview(
                  resolveMultiDiscussionAssetUrl(attachment.previewUrl || attachment.url),
                  attachment.filename || '材料科研图片'
                )"
                @keydown.enter="openImagePreview(
                  resolveMultiDiscussionAssetUrl(attachment.previewUrl || attachment.url),
                  attachment.filename || '材料科研图片'
                )"
                @keydown.space.prevent="openImagePreview(
                  resolveMultiDiscussionAssetUrl(attachment.previewUrl || attachment.url),
                  attachment.filename || '材料科研图片'
                )"
              >
              <figcaption>{{ attachment.filename || '材料科研图片' }}</figcaption>
            </figure>
          </div>
          <div v-if="message.role === 'user'" class="message-content">{{ message.content }}</div>
          <div v-else class="integrated-answer-content">
            <template
              v-for="(block, blockIndex) in answerBlocks(message)"
              :key="`${message.localId}-block-${blockIndex}`"
            >
              <div
                v-if="block.type === 'text'"
                class="message-content is-markdown"
                v-html="renderDiscussionMarkdown(block.text || '')"
              ></div>
              <section
                v-else-if="block.type === 'visual_evidence' && block.items?.length"
                :class="['answer-visual-evidence', { 'is-inline': block.presentation === 'inline' }]"
                aria-label="与回答相关的视觉证据"
              >
                <h3 v-if="block.presentation === 'section'">{{ block.heading || '相关视觉证据' }}</h3>
                <header>
                  <div>
                    <strong>🖼️ {{ block.presentation === 'inline' ? '对应视觉证据' : '结论支撑图片' }}</strong>
                    <span>
                      {{ block.presentation === 'inline'
                        ? '依据当前段落与 Caption、证据实体的语义关联自动插入'
                        : '仅展示通过 ASC 相关性与语义阈值的图片' }}
                    </span>
                  </div>
                  <b>{{ block.items.length }} 张</b>
                </header>
                <div class="answer-visual-evidence-grid">
                  <figure
                    v-for="evidence in block.items"
                    :key="evidence.image_id"
                  >
                    <img
                      :src="resolveMultiDiscussionAssetUrl(evidence.image_url)"
                      :alt="evidence.caption || `${imageTypeLabel(evidence.image_type)} 视觉证据`"
                      class="previewable-image"
                      loading="lazy"
                      role="button"
                      tabindex="0"
                      @click="openImagePreview(
                        resolveMultiDiscussionAssetUrl(evidence.image_url),
                        evidence.caption || `${imageTypeLabel(evidence.image_type)} 视觉证据`
                      )"
                      @keydown.enter="openImagePreview(
                        resolveMultiDiscussionAssetUrl(evidence.image_url),
                        evidence.caption || `${imageTypeLabel(evidence.image_type)} 视觉证据`
                      )"
                      @keydown.space.prevent="openImagePreview(
                        resolveMultiDiscussionAssetUrl(evidence.image_url),
                        evidence.caption || `${imageTypeLabel(evidence.image_type)} 视觉证据`
                      )"
                    >
                    <figcaption>
                      <div class="answer-visual-evidence-meta">
                        <span>{{ evidence.image_id }}</span>
                        <span>{{ imageTypeLabel(evidence.image_type) }}</span>
                        <span>匹配 {{ formatConfidence(evidence.retrieval_score) }}</span>
                        <span>{{ evidence.evidence_level || '证据等级未标注' }}</span>
                      </div>
                      <strong>{{ evidence.caption || '未提供专业 Caption' }}</strong>
                      <p v-if="evidence.explanation">{{ evidence.explanation }}</p>
                      <p v-if="evidence.kg_entities?.length" class="visual-entity-binding">
                        关联实体：{{ evidence.kg_entities.join(' · ') }}
                      </p>
                      <p v-if="evidence.experimental_conditions?.length" class="visual-experiment-binding">
                        实验信息：{{ evidence.experimental_conditions.join('；') }}
                      </p>
                      <small>
                        来源：{{ evidence.source?.label || 'Visual Evidence Dataset' }}
                        <template v-if="evidence.source?.figure_label"> · {{ evidence.source.figure_label }}</template>
                        <template v-if="evidence.source?.page"> · p.{{ evidence.source.page }}</template>
                        <template v-if="evidence.source?.doi"> · DOI {{ evidence.source.doi }}</template>
                      </small>
                    </figcaption>
                  </figure>
                </div>
              </section>
            </template>
          </div>

          <template v-if="message.role === 'assistant'">
            <div
              v-if="message.enableMultimodalResponse && !message.visualEvidence?.items?.length"
              :class="['answer-visual-evidence-status', `is-${message.visualEvidence?.status || 'unavailable'}`]"
            >
              {{ visualEvidenceStatusLabel(message.visualEvidence?.status) }}
            </div>
            <div v-if="message.multimodalRoute" class="multimodal-route-badge">
              {{ routeModeLabel(message.multimodalRoute.mode) }}
              <span v-if="message.multimodalRoute.uses_history_images">
                · 继承 {{ message.multimodalRoute.history_image_count }} 张历史图片
              </span>
            </div>
            <div v-if="message.modelSelection" class="model-selection-badge">
              {{ message.modelSelection.label }} · {{ message.modelSelection.model }}
            </div>
            <details
              v-if="message.visualAnalysis"
              class="message-visual-panel"
            >
              <summary>
                图像特征解析 · {{ visualStatusLabel(message.visualAnalysis.status) }} ·
                {{ message.visualAnalysis.images?.length || 0 }} 张
              </summary>
              <div class="visual-analysis-summary">{{ message.visualAnalysis.summary || '已完成材料图片解析。' }}</div>
              <div v-if="message.visualAnalysis.analysis_mode" class="visual-analysis-mode">
                {{ message.visualAnalysis.analysis_mode === 'two_stage_material_reasoning'
                  ? '两阶段材料专家推理'
                  : '视觉观察 + 材料分析计划' }}
              </div>
              <ul class="visual-analysis-list">
                <li v-for="image in message.visualAnalysis.images || []" :key="image.asset_id || image.image_index">
                  <strong>图 {{ image.image_index }} · {{ imageTypeLabel(image.image_type) }}</strong>
                  <span>置信度 {{ formatConfidence(image.confidence) }}</span>
                  <p class="visual-caption">{{ image.caption || '未提取到可靠视觉描述。' }}</p>
                  <div v-if="image.observations?.length" class="visual-evidence-layer is-observation">
                    <b>直接观察</b>
                    <p>{{ image.observations.join('；') }}</p>
                  </div>
                  <div v-if="image.localized_features?.length" class="visual-evidence-layer is-localization">
                    <b>区域 / 特征定位 · 归一化坐标</b>
                    <p>{{ image.localized_features.map(feature => `${feature.label} ${formatBBox(feature.bbox)}`).join('；') }}</p>
                  </div>
                  <div v-if="image.identified_phases?.length" class="visual-evidence-layer is-identification">
                    <b>物相识别 · 依据分级</b>
                    <p>{{ image.identified_phases.map(phase => `${phase.name}（${phaseStatusLabel(phase.status)}${phase.basis ? `：${phase.basis}` : ''}）`).join('；') }}</p>
                  </div>
                  <div v-if="image.identified_elements?.length || image.composition_estimates?.length" class="visual-evidence-layer is-identification">
                    <b>元素 / 成分提取 · 数值需原始谱互证</b>
                    <p>
                      {{ [
                        ...(image.identified_elements || []).map(element => `${element.symbol}${element.basis ? `（${element.basis}）` : ''}`),
                        ...(image.composition_estimates || []).map(formatComposition)
                      ].join('；') }}
                    </p>
                  </div>
                  <div v-if="image.structure_interpretations?.length" class="visual-evidence-layer is-inference">
                    <b>结构解释 · 材料学推断</b>
                    <p>{{ image.structure_interpretations.join('；') }}</p>
                  </div>
                  <div v-if="image.mechanism_hypotheses?.length" class="visual-evidence-layer is-mechanism">
                    <b>候选机理 · 待互证</b>
                    <p>{{ image.mechanism_hypotheses.join('；') }}</p>
                  </div>
                  <div v-if="image.property_implications?.length" class="visual-evidence-layer is-property">
                    <b>性能影响 · 条件性推断</b>
                    <p>{{ image.property_implications.join('；') }}</p>
                  </div>
                  <ol v-if="image.reasoning_chains?.length" class="visual-reasoning-chains">
                    <li v-for="(chain, chainIndex) in image.reasoning_chains" :key="`${image.image_index}-${chainIndex}`">
                      {{ [chain.observation, chain.formation_cause, chain.structure_interpretation, chain.mechanism_hypothesis, chain.property_implication, chain.evidence_support]
                        .filter(Boolean).join(' → ') }}
                      <small v-if="chain.boundary">边界：{{ chain.boundary }}</small>
                    </li>
                  </ol>
                  <small v-if="image.uncertainties?.length" class="visual-uncertainty">不确定信息：{{ image.uncertainties.join('；') }}</small>
                </li>
              </ul>
            </details>
            <details v-if="message.references?.length" class="message-evidence-panel">
              <summary>引用依据 · {{ message.references.length }}</summary>
              <ol class="reference-list">
                <li v-for="reference in message.references" :key="reference.reference_id">
                  <div class="reference-heading">
                    <strong>[{{ reference.reference_id }}]</strong>
                    <span>{{ reference.source_label || reference.source_filename || reference.source || '参考依据' }}</span>
                  </div>
                  <blockquote>{{ reference.original_quote || reference.evidence_chunk?.quote || '该引用未包含可展示的原文片段。' }}</blockquote>
                </li>
              </ol>
            </details>
          </template>
        </div>
      </article>

      <article v-if="sending" class="discussion-message is-assistant is-loading">
        <div class="message-avatar">研</div>
        <div class="message-card">
          <div class="message-meta"><strong>Multi-Discussion</strong></div>
          <section class="analysis-progress-card" aria-live="polite" aria-atomic="false">
            <div class="analysis-progress-heading">
              <span class="analysis-pulse" aria-hidden="true"></span>
              <div>
                <strong>{{ currentAnalysisLabel }}</strong>
                <Transition name="analysis-text" mode="out-in">
                  <p :key="currentAnalysisNarrative">{{ currentAnalysisNarrative }}</p>
                </Transition>
              </div>
              <b>{{ currentAnalysisProgress }}%</b>
            </div>
            <div
              class="analysis-progress-track"
              role="progressbar"
              aria-label="多模态回答生成进度"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="currentAnalysisProgress"
            >
              <span :style="{ width: `${currentAnalysisProgress}%` }"></span>
            </div>
            <div v-if="sendingVisual" class="scientific-agent-workbench">
              <div class="workbench-title">
                <div>
                  <strong>Scientific Agent Workbench</strong>
                  <span>公开 Reasoning Summary · 基于本轮实际分析结果实时更新</span>
                </div>
                <em>LIVE</em>
              </div>
              <div class="reasoning-summary-grid">
                <article
                  v-for="item in reasoningSummaryItems"
                  :key="item.phase"
                  :class="[`is-${item.status}`, `phase-${item.phase}`]"
                >
                  <header>
                    <i aria-hidden="true">{{ item.icon }}</i>
                    <strong>{{ item.label }}</strong>
                    <span>{{ reasoningStatusLabel(item.status) }}</span>
                  </header>
                  <p>{{ item.statusText }}</p>
                  <TransitionGroup
                    v-if="item.keyPoints.length"
                    name="reasoning-point"
                    tag="ul"
                  >
                    <li v-for="point in item.keyPoints" :key="point">{{ point }}</li>
                  </TransitionGroup>
                  <small v-if="formatReasoningMetrics(item.metrics)">
                    {{ formatReasoningMetrics(item.metrics) }}
                  </small>
                </article>
              </div>
              <section class="public-logic-chain-panel">
                <header>
                  <div>
                    <strong>可审计思维链 / 逻辑链</strong>
                    <span>公开整理版 · 展示证据连接，不展示模型内部隐式推理</span>
                  </div>
                  <b>{{ publicLogicChains.length ? `${publicLogicChains.length} 条链` : '构建中' }}</b>
                </header>
                <TransitionGroup
                  v-if="publicLogicChains.length"
                  name="logic-chain"
                  tag="div"
                  class="public-logic-chain-list"
                >
                  <article v-for="chain in publicLogicChains" :key="chain.chain_id">
                    <div class="logic-chain-meta">
                      <strong>{{ chain.chain_id }}</strong>
                      <span v-if="chain.confidence > 0">公开链置信度 {{ formatConfidence(chain.confidence) }}</span>
                    </div>
                    <ol>
                      <li
                        v-for="node in chain.nodes"
                        :key="`${chain.chain_id}-${node.stage}`"
                        :class="`logic-${node.stage}`"
                      >
                        <b>{{ node.label }}</b>
                        <p>{{ node.text }}</p>
                      </li>
                    </ol>
                    <p v-if="chain.boundary" class="logic-chain-boundary">
                      结论边界：{{ chain.boundary }}
                    </p>
                  </article>
                </TransitionGroup>
                <div v-else class="logic-chain-building">
                  <i></i><i></i><i></i>
                  <span>正在等待视觉观察与候选机理，随后生成可复核的链式摘要。</span>
                </div>
              </section>
            </div>
            <ol class="analysis-stage-list">
              <li
                v-for="stage in analysisStageItems"
                :key="stage.stage"
                :class="stage.state"
              >
                <i aria-hidden="true">{{ stage.state === 'done' ? '✓' : '' }}</i>
                <span>{{ stage.label }}</span>
              </li>
            </ol>
            <p class="analysis-privacy-note">展示的是经过整理、可复核的公开逻辑链；不展示模型原始隐藏思维轨迹。</p>
          </section>
        </div>
      </article>
    </div>

    <div v-else class="multi-discussion-guides multi-discussion-guides--empty" aria-label="多轮追问示例">
      <button
        v-for="example in promptExamples"
        :key="example"
        type="button"
        class="multi-discussion-guide"
        :disabled="sending"
        @click="emit('select-prompt', example)"
      >
        {{ example }}
      </button>
    </div>

    <footer
      v-if="!embedded"
      class="multi-discussion-composer"
      :class="{ 'is-dragging': imageDragOver }"
      @dragover.prevent="imageDragOver = true"
      @dragleave.prevent="imageDragOver = false"
      @drop.prevent="handleImageDrop"
    >
      <div v-if="error" class="multi-discussion-error">{{ error }}</div>
      <div v-if="selectedImages.length" class="pending-image-list">
        <div v-for="item in selectedImages" :key="item.localId" class="pending-image">
          <img
            :src="item.previewUrl"
            :alt="item.file.name"
            class="previewable-image"
            role="button"
            tabindex="0"
            @click="openImagePreview(item.previewUrl, item.file.name)"
            @keydown.enter="openImagePreview(item.previewUrl, item.file.name)"
            @keydown.space.prevent="openImagePreview(item.previewUrl, item.file.name)"
          >
          <span>{{ item.file.name }}</span>
          <button type="button" :disabled="sending" aria-label="移除图片" @click="removeSelectedImage(item.localId)">×</button>
        </div>
      </div>
      <div class="composer-answer-options">
        <label class="model-mode-selector">
          <span>回答模型</span>
          <select v-model="selectedModelMode" :disabled="sending">
            <option
              v-for="mode in modelModeOptions"
              :key="mode.mode"
              :value="mode.mode"
            >
              {{ mode.label }} · {{ mode.model }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="multimodal-answer-toggle"
          :class="{ 'is-active': enableMultimodalResponse }"
          :aria-pressed="enableMultimodalResponse"
          :disabled="sending"
          title="开启后，回答生成前会检索高相关 Visual Evidence，并用于证据约束与图文布局"
          @click="enableMultimodalResponse = !enableMultimodalResponse"
        >
          <span aria-hidden="true">🖼️</span>
          <strong>多模态回答</strong>
          <small>{{ enableMultimodalResponse ? '已开启' : '已关闭' }}</small>
        </button>
        <div
          v-if="enableMultimodalResponse"
          class="multimodal-render-mode"
          role="group"
          aria-label="多模态回答图片展示方式"
        >
          <button
            type="button"
            :class="{ 'is-active': multimodalRenderMode === 'inline' }"
            :aria-pressed="multimodalRenderMode === 'inline'"
            :disabled="sending"
            @click="multimodalRenderMode = 'inline'"
          >
            正文穿插
          </button>
          <button
            type="button"
            :class="{ 'is-active': multimodalRenderMode === 'evidence_section' }"
            :aria-pressed="multimodalRenderMode === 'evidence_section'"
            :disabled="sending"
            @click="multimodalRenderMode = 'evidence_section'"
          >
            证据区域
          </button>
        </div>
      </div>
      <div class="composer-row">
        <input
          ref="imageInput"
          class="image-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/tiff,.tif,.tiff"
          multiple
          :disabled="sending"
          @change="handleImageSelect"
        >
        <button
          type="button"
          class="attach-image-btn"
          :disabled="sending || selectedImages.length >= imageLimits.maxImages"
          title="上传材料科研图片"
          @click="imageInput?.click()"
        >
          图片
        </button>
        <textarea
          v-model="draft"
          rows="2"
          :disabled="sending"
          placeholder="输入问题或直接上传材料图片，例如：图中孔隙与抗氧化失效有什么关系？"
          @keydown.enter.exact.prevent="sendMessage"
        ></textarea>
        <button
          type="button"
          class="send-discussion-btn"
          :disabled="!canSend"
          @click="sendMessage"
        >
          <span v-if="sending" class="send-spinner"></span>
          <span v-else>发送</span>
        </button>
      </div>
      <p v-if="enableMultimodalResponse">
        回答前检索高相关 Visual Evidence ·
        {{ multimodalRenderMode === 'inline' ? '按语义插入正文' : '集中展示于回答末尾' }} ·
        无合格证据时不推荐图片
      </p>
      <p v-else>纯文本回答模式 · 不触发 Visual Evidence 检索</p>
    </footer>

    <AscImageLightbox
      :open="imagePreview.open"
      :src="imagePreview.src"
      :alt="imagePreview.alt"
      @close="closeImagePreview"
    />
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AscImageLightbox from '../../../components/ui/AscImageLightbox.vue'
import {
  getMultiDiscussionCapabilities,
  getMultiDiscussionConversation,
  getMultiDiscussionProgress,
  resolveMultiDiscussionAssetUrl,
  sendMultiDiscussionMessage
} from './api'
import { renderDiscussionMarkdown } from './markdown'
import { getBrowserStorage } from '../../../utils/browserStorage.js'
import {
  clearSavedMultiDiscussion,
  multiDiscussionStorageKey,
  readSavedMultiDiscussion
} from './sessionStorage.js'


const props = defineProps({
  graphOptions: {
    type: Array,
    default: () => []
  },
  selectedGraphId: {
    type: String,
    default: ''
  },
  graphCatalogLoading: Boolean,
  graphCatalogError: String,
  embedded: Boolean,
  autoRestore: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits([
  'update:selected-graph-id',
  'reload-graphs',
  'add-log',
  'history-change',
  'select-prompt'
])
const browserStorage = getBrowserStorage(globalThis)

const conversationId = ref('')
const messages = ref([])
const draft = ref('')
const sending = ref(false)
const error = ref('')
const messageViewport = ref(null)
const imageInput = ref(null)
const imagePreview = ref({ open: false, src: '', alt: '' })
const selectedImages = ref([])
const imageDragOver = ref(false)
const imageLimits = ref({ maxImages: 6, maxImageBytes: 12 * 1024 * 1024 })
const visionCapability = ref(null)
const selectedModelMode = ref('default')
const selectedReasoningMode = ref('auto')
const enableMultimodalResponse = ref(false)
const multimodalRenderMode = ref('inline')
const sendingVisual = ref(false)
const sendingEvidenceResponse = ref(false)
const analysisProgress = ref(null)
const progressRequestId = ref('')
let progressPollTimer = null
let progressPollStartTimer = null

const safeAnalysisStages = [
  { stage: 'input_validation', label: '输入校验', detail: '正在检查图片格式、会话状态和知识作用域。', progress: 8 },
  { stage: 'image_understanding', label: '图片理解', detail: '正在识别图像面板、结构区域、曲线和可读标注。', progress: 24, visual: true },
  { stage: 'evidence_extraction', label: '信息提取', detail: '正在整理可见特征、定量信号及其证据边界。', progress: 42, visual: true },
  { stage: 'scientific_interpretation', label: '材料学分析', detail: '正在关联结构、形成原因、候选机制和性能影响。', progress: 58, visual: true },
  { stage: 'knowledge_association', label: '知识关联', detail: '正在匹配当前知识图谱与科研证据。', progress: 72 },
  { stage: 'visual_evidence_retrieval', label: '视觉证据', detail: '正在筛选与当前问题和知识证据高度相关的科研图片。', progress: 80, evidenceResponse: true },
  { stage: 'answer_generation', label: '答案生成', detail: '正在组织与问题直接相关的专业科研回答。', progress: 86 },
  { stage: 'quality_check', label: '科学性校验', detail: '正在检查相关性、证据支持和不确定性表达。', progress: 96 }
]
const safeReasoningPhases = [
  {
    phase: 'observation',
    label: '观察 Observation',
    icon: '观',
    activeText: '正在识别图片中的关键结构、区域、曲线与可读标注。'
  },
  {
    phase: 'hypothesis',
    label: '假设 Hypothesis',
    icon: '假',
    activeText: '正在分析材料组成、结构状态、实验现象与候选科学机制。'
  },
  {
    phase: 'evidence_linking',
    label: '证据关联 Evidence Linking',
    icon: '证',
    activeText: '正在关联知识图谱、科研事实与可能的验证依据。'
  },
  {
    phase: 'conclusion',
    label: '结论生成 Conclusion',
    icon: '结',
    activeText: '正在生成与问题直接相关的最终专业分析。'
  }
]

const selectedGraph = computed(() => (
  props.graphOptions.find(graph => graph.graph_id === props.selectedGraphId) || null
))

const turnCount = computed(() => messages.value.filter(message => message.role === 'assistant').length)
const canSend = computed(() => Boolean(
  (draft.value.trim() || selectedImages.value.length) && selectedGraph.value && !sending.value
))

const promptExamples = [
  '为什么 SiC 含量会影响抗氧化性能？',
  '这些机制中，哪一种更可能主导损伤？',
  '这个结论有哪些关键依据和适用边界？'
]
const fallbackModelModes = [
  {
    mode: 'default',
    label: '默认模式',
    model: 'qwen/qwen3-vl-32b-instruct',
    description: '未选择其他模式时使用'
  },
  {
    mode: 'quality_expert',
    label: '高质量专家模式',
    model: 'anthropic/claude-opus-5',
    description: '优先回答质量与专业深度'
  },
  {
    mode: 'fast_interactive',
    label: '快速交互模式',
    model: 'google/gemini-3.6-flash',
    description: '优先低延迟交互'
  },
  {
    mode: 'balanced_production',
    label: '默认生产模型',
    model: 'openai/gpt-5.6-terra',
    description: '平衡质量、时间与成本'
  }
]
const modelModeOptions = computed(() => {
  const values = visionCapability.value?.model_modes
  return Array.isArray(values) && values.length ? values : fallbackModelModes
})
const selectedModelModeDetails = computed(() => (
  modelModeOptions.value.find(mode => mode.mode === selectedModelMode.value)
  || modelModeOptions.value[0]
  || fallbackModelModes[0]
))
const visibleAnalysisStages = computed(() => safeAnalysisStages.filter(
  stage => (sendingVisual.value || !stage.visual)
    && (sendingEvidenceResponse.value || !stage.evidenceResponse)
))
const currentAnalysisProgress = computed(() => Math.max(
  2,
  Math.min(100, Number(analysisProgress.value?.progress) || 2)
))
const currentAnalysisLabel = computed(() => (
  analysisProgress.value?.label || (
    sendingVisual.value
      ? '准备多模态分析'
      : (sendingEvidenceResponse.value ? '准备图文融合回答' : '准备科研问答')
  )
))
const currentAnalysisDetail = computed(() => (
  analysisProgress.value?.detail || (
    sendingVisual.value
      ? '正在安全载入图片和当前会话上下文。'
      : (
          sendingEvidenceResponse.value
            ? '正在理解问题并准备检索高相关视觉证据。'
            : '正在载入当前会话和知识作用域。'
        )
  )
))
const reasoningSummaryItems = computed(() => {
  const published = new Map(
    (analysisProgress.value?.reasoning_summary || []).map(item => [item.phase, item])
  )
  return safeReasoningPhases.map(phase => {
    const value = published.get(phase.phase) || {}
    const status = value.status || 'pending'
    return {
      ...phase,
      status,
      statusText: value.status_text || (
        status === 'active' ? phase.activeText : '等待上一分析阶段完成。'
      ),
      keyPoints: Array.isArray(value.key_points) ? value.key_points : [],
      metrics: value.metrics || {}
    }
  })
})
const publicLogicChains = computed(() => (
  Array.isArray(analysisProgress.value?.logic_chains)
    ? analysisProgress.value.logic_chains
    : []
))
const currentAnalysisNarrative = computed(() => {
  const published = reasoningSummaryItems.value.filter(item => item.status !== 'pending')
  const active = [...published].reverse().find(item => item.status === 'active')
  if (active) return active.statusText
  const latest = published.at(-1)
  if (latest?.keyPoints?.length) return `已整理公开依据：${latest.keyPoints.at(-1)}`
  if (latest) return latest.statusText
  return currentAnalysisDetail.value
})
const analysisStageItems = computed(() => {
  const reached = new Set((analysisProgress.value?.timeline || []).map(item => item.stage))
  const current = analysisProgress.value?.stage
  return visibleAnalysisStages.value.map(stage => ({
    ...stage,
    state: current === stage.stage
      ? 'active'
      : (reached.has(stage.stage) || currentAnalysisProgress.value > stage.progress ? 'done' : 'pending')
  }))
})

const persist = () => {
  if (!browserStorage?.setItem || !props.selectedGraphId) return
  try {
    browserStorage.setItem(multiDiscussionStorageKey(props.selectedGraphId), JSON.stringify({
      conversationId: conversationId.value,
      messages: messages.value.slice(-40),
      enableMultimodalResponse: enableMultimodalResponse.value,
      multimodalRenderMode: multimodalRenderMode.value,
      selectedModelMode: selectedModelMode.value
    }))
  } catch {
    // Browser storage is optional; the live conversation remains usable.
  }
}

const restore = async () => {
  conversationId.value = ''
  revokeMessagePreviews()
  messages.value = []
  error.value = ''
  enableMultimodalResponse.value = false
  multimodalRenderMode.value = 'inline'
  selectedModelMode.value = 'default'
  if (!props.selectedGraphId) return
  try {
    const saved = readSavedMultiDiscussion(browserStorage, props.selectedGraphId) || {}
    conversationId.value = String(saved.conversationId || '')
    messages.value = Array.isArray(saved.messages) ? saved.messages : []
    enableMultimodalResponse.value = saved.enableMultimodalResponse === true
    multimodalRenderMode.value = saved.multimodalRenderMode === 'evidence_section'
      ? 'evidence_section'
      : 'inline'
    selectedModelMode.value = modelModeOptions.value.some(
      mode => mode.mode === saved.selectedModelMode
    ) ? saved.selectedModelMode : 'default'
    if (conversationId.value && !messages.value.length) {
      const response = await getMultiDiscussionConversation(conversationId.value)
      messages.value = (response.data?.messages || []).map(toLocalMessage)
      persist()
    }
  } catch (restoreError) {
    conversationId.value = ''
    messages.value = []
    clearSavedMultiDiscussion(browserStorage, props.selectedGraphId)
  }
  scrollToBottom()
}

const toLocalMessage = message => ({
  localId: message.message_id || `restored-${Math.random().toString(16).slice(2)}`,
  role: message.role,
  content: message.content,
  createdAt: message.created_at,
  references: message.metadata?.references || [],
  attachments: message.metadata?.attachments || [],
  visualAnalysis: message.metadata?.visual_analysis || null,
  materialKnowledge: message.metadata?.material_knowledge || null,
  materialAnalysisPlan: message.metadata?.material_analysis_plan || null,
  multimodalRoute: message.metadata?.multimodal_route || null,
  activeImageContext: message.metadata?.active_image_context || [],
  enableMultimodalResponse: message.metadata?.enable_multimodal_response === true,
  multimodalRenderMode: message.metadata?.multimodal_render_mode || 'evidence_section',
  visualEvidence: message.metadata?.visual_evidence || null,
  multimodalContent: message.metadata?.multimodal_content || null,
  modelSelection: message.metadata?.model_selection || null
})

const changeGraph = event => {
  persist()
  emit('update:selected-graph-id', event.target.value)
}

const startNewDiscussion = () => {
  stopProgressTracking()
  conversationId.value = ''
  revokeMessagePreviews()
  messages.value = []
  draft.value = ''
  error.value = ''
  clearSelectedImages()
  clearSavedMultiDiscussion(browserStorage, props.selectedGraphId)
  emit('add-log', `Multi-Discussion 已新建空白会话 · ${selectedGraph.value?.project_id || '未选择项目'}`)
}

const makeUserMessage = (content, attachments = []) => ({
  localId: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role: 'user',
  content,
  createdAt: new Date().toISOString(),
  attachments
})

const requestReply = async (
  question,
  existingConversationId,
  images = [],
  requestId = '',
  multimodalResponse = false,
  renderMode = 'evidence_section'
) => {
  const graph = selectedGraph.value
  return sendMultiDiscussionMessage({
    question,
    project_id: graph.project_id,
    graph_id: graph.graph_id,
    conversation_id: existingConversationId || undefined,
    request_id: requestId,
    model_mode: selectedModelMode.value,
    enable_multimodal_response: multimodalResponse === true,
    multimodal_render_mode: renderMode,
    options: {
      reasoning_mode: selectedReasoningMode.value,
      top_k: 10,
      top_k_subgraphs: 5,
      top_k_paths: 8,
      max_hops: 2,
      enable_llm_answer_refinement: false
    }
  }, images)
}

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `mdp_${crypto.randomUUID().replaceAll('-', '')}`
  }
  return `mdp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}

const stopProgressTracking = () => {
  if (progressPollTimer) window.clearInterval(progressPollTimer)
  if (progressPollStartTimer) window.clearTimeout(progressPollStartTimer)
  progressPollTimer = null
  progressPollStartTimer = null
}

const pollAnalysisProgress = async requestId => {
  if (!requestId || requestId !== progressRequestId.value) return
  try {
    const response = await getMultiDiscussionProgress(requestId)
    if (requestId !== progressRequestId.value) return
    analysisProgress.value = response.data || analysisProgress.value
    if (['completed', 'failed'].includes(analysisProgress.value?.status)) {
      stopProgressTracking()
    }
  } catch (progressError) {
    // A short-lived 404 is expected when polling wins the race with POST setup.
    if (![404, 400].includes(Number(progressError?.status))) return
  }
}

const startProgressTracking = (requestId, hasVisual, hasEvidenceResponse = false) => {
  stopProgressTracking()
  progressRequestId.value = requestId
  analysisProgress.value = {
    status: 'running',
    stage: 'queued',
    label: hasVisual
      ? '准备多模态分析'
      : (hasEvidenceResponse ? '准备图文融合回答' : '准备科研问答'),
    detail: hasVisual
      ? '正在安全载入图片和当前会话上下文。'
      : (
          hasEvidenceResponse
            ? '正在理解问题并准备检索高相关视觉证据。'
            : '正在载入当前会话和知识作用域。'
        ),
    progress: 2,
    timeline: []
  }
  progressPollStartTimer = window.setTimeout(() => pollAnalysisProgress(requestId), 120)
  progressPollTimer = window.setInterval(() => pollAnalysisProgress(requestId), 650)
}

const sendMessage = async () => {
  if (!canSend.value) return
  const files = selectedImages.value.map(item => item.file)
  const multimodalResponseForTurn = enableMultimodalResponse.value === true
  const renderModeForTurn = multimodalRenderMode.value
  sendingEvidenceResponse.value = multimodalResponseForTurn
  sendingVisual.value = Boolean(files.length || messages.value.some(
    message => message.role === 'assistant' && message.visualAnalysis?.status === 'completed'
  ))
  const question = draft.value.trim() || (
    `请专业解析上传的 ${files.length} 张材料科研图片，并结合当前知识图谱说明关键结构、表征信号、可能机制与不确定性。`
  )
  const graph = selectedGraph.value
  const pendingAttachments = selectedImages.value.map(item => ({
    filename: item.file.name,
    previewUrl: item.previewUrl,
    content_type: item.file.type
  }))
  const userMessage = makeUserMessage(question, pendingAttachments)
  draft.value = ''
  error.value = ''
  selectedImages.value = []
  messages.value.push(userMessage)
  sending.value = true
  const requestId = createRequestId()
  startProgressTracking(requestId, sendingVisual.value, sendingEvidenceResponse.value)
  persist()
  scrollToBottom()

  try {
    let response
    try {
      response = await requestReply(
        question,
        conversationId.value,
        files,
        requestId,
        multimodalResponseForTurn,
        renderModeForTurn
      )
    } catch (requestError) {
      if (requestError?.status !== 404 || !conversationId.value) throw requestError
      conversationId.value = ''
      response = await requestReply(
        question,
        '',
        files,
        requestId,
        multimodalResponseForTurn,
        renderModeForTurn
      )
    }
    const result = response.data || {}
    if (result.analysis_progress) analysisProgress.value = result.analysis_progress
    if (result.project_id !== graph.project_id || result.graph_id !== graph.graph_id) {
      throw new Error('后端返回的知识图谱作用域与当前选择不一致，已拒绝展示回答。')
    }
    conversationId.value = result.conversation_id || conversationId.value
    if (result.attachments?.length) {
      userMessage.attachments = result.attachments
      pendingAttachments.forEach(item => URL.revokeObjectURL(item.previewUrl))
    }
    messages.value.push({
      localId: result.turn_id || `assistant-${Date.now()}`,
      role: 'assistant',
      content: result.answer || '未返回回答。',
      createdAt: result.created_at || new Date().toISOString(),
      references: result.references || [],
      attachments: [],
      visualAnalysis: result.visual_analysis || null,
      materialKnowledge: result.material_knowledge || null,
      materialAnalysisPlan: result.material_analysis_plan || null,
      multimodalRoute: result.multimodal_route || null,
      activeImageContext: result.active_image_context || [],
      enableMultimodalResponse: result.enable_multimodal_response === true,
      multimodalRenderMode: result.multimodal_render_mode || renderModeForTurn,
      visualEvidence: result.visual_evidence || null,
      multimodalContent: result.multimodal_content || null,
      modelSelection: result.model_selection || null
    })
    emit('add-log', `Multi-Discussion 完成第 ${turnCount.value} 轮 · project=${graph.project_id}`)
  } catch (requestError) {
    analysisProgress.value = {
      ...(analysisProgress.value || {}),
      status: 'failed',
      stage: 'failed',
      label: '分析未完成',
      detail: '本轮处理已停止，请根据错误提示重试。'
    }
    error.value = requestError?.message || 'Multi-Discussion 请求失败'
    emit('add-log', `Multi-Discussion 失败: ${error.value}`)
  } finally {
    stopProgressTracking()
    sending.value = false
    sendingVisual.value = false
    sendingEvidenceResponse.value = false
    persist()
    scrollToBottom()
  }
}

const addImages = files => {
  error.value = ''
  const accepted = ['image/png', 'image/jpeg', 'image/webp', 'image/tiff']
  const incoming = Array.from(files || [])
  const available = imageLimits.value.maxImages - selectedImages.value.length
  if (incoming.length > available) {
    error.value = `单次最多上传 ${imageLimits.value.maxImages} 张图片。`
  }
  incoming.slice(0, Math.max(0, available)).forEach(file => {
    const extensionOk = /\.(?:png|jpe?g|webp|tiff?)$/i.test(file.name || '')
    if (!accepted.includes(file.type) && !extensionOk) {
      error.value = `不支持的图片格式：${file.name}`
      return
    }
    if (file.size > imageLimits.value.maxImageBytes) {
      error.value = `图片 ${file.name} 超过 ${Math.round(imageLimits.value.maxImageBytes / 1024 / 1024)} MB。`
      return
    }
    selectedImages.value.push({
      localId: `image-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file)
    })
  })
  if (imageInput.value) imageInput.value.value = ''
}

const handleImageSelect = event => addImages(event.target.files)

const handleImageDrop = event => {
  imageDragOver.value = false
  if (sending.value) return
  addImages(event.dataTransfer?.files)
}

const removeSelectedImage = localId => {
  const index = selectedImages.value.findIndex(item => item.localId === localId)
  if (index < 0) return
  URL.revokeObjectURL(selectedImages.value[index].previewUrl)
  selectedImages.value.splice(index, 1)
}

const openImagePreview = (src, alt = '材料科研图片') => {
  if (!String(src || '').trim()) return
  imagePreview.value = {
    open: true,
    src: String(src),
    alt: String(alt || '材料科研图片')
  }
}

const closeImagePreview = () => {
  imagePreview.value = { ...imagePreview.value, open: false }
}

const clearSelectedImages = () => {
  selectedImages.value.forEach(item => URL.revokeObjectURL(item.previewUrl))
  selectedImages.value = []
  if (imageInput.value) imageInput.value.value = ''
}

const revokeMessagePreviews = () => {
  messages.value.forEach(message => {
    const attachments = message.attachments || []
    attachments.forEach(attachment => {
      if (String(attachment.previewUrl || '').startsWith('blob:')) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
    })
  })
}

const loadCapabilities = async () => {
  try {
    const response = await getMultiDiscussionCapabilities()
    const capabilities = response.data || {}
    visionCapability.value = capabilities
    imageLimits.value = {
      maxImages: Number(capabilities.max_images) || 6,
      maxImageBytes: Number(capabilities.max_image_bytes) || 12 * 1024 * 1024
    }
  } catch (_error) {
    // Older backends remain usable for text-only discussion.
  }
}

const submitExternal = async ({
  question = '',
  image = null,
  enableMultimodalResponse: multimodalResponse = false,
  multiModule = 'inline',
  model = 'default',
  reasoning = 'Auto'
} = {}) => {
  if (sending.value) return
  selectedModelMode.value = String(model || 'default')
  selectedReasoningMode.value = ({ Auto: 'auto', CoT: 'cot', ToT: 'tot' })[reasoning] || 'auto'
  enableMultimodalResponse.value = multimodalResponse === true
  multimodalRenderMode.value = multiModule === 'evidence' ? 'evidence_section' : 'inline'
  draft.value = String(question || '').trim()
  clearSelectedImages()
  if (image) addImages([image])
  await sendMessage()
}

defineExpose({ submitExternal, startNewDiscussion, sending })

const answerBlocks = message => {
  const stored = message?.multimodalContent?.blocks
  if (Array.isArray(stored) && stored.length) return stored
  const blocks = [{ type: 'text', text: message?.content || '' }]
  const items = message?.visualEvidence?.items
  if (Array.isArray(items) && items.length) {
    blocks.push({
      type: 'visual_evidence',
      presentation: 'section',
      heading: '相关视觉证据',
      items
    })
  }
  return blocks
}

const imageTypeLabel = value => ({
  sem: 'SEM 显微结构',
  tem: 'TEM 显微结构',
  hrtem: 'HRTEM 晶格结构',
  sem_tem: 'SEM/TEM 显微结构',
  xrd: 'XRD 图谱',
  eds_mapping: 'EDS / Mapping',
  raman: 'Raman 光谱',
  tg_dsc: 'TG / DSC 曲线',
  performance_curve: '性能曲线',
  experimental_curve: '实验曲线 / 性能图',
  oxidation_experiment: '氧化实验',
  thermal_shock_experiment: '热震实验',
  slag_corrosion: '抗渣侵蚀实验',
  paper_figure: '论文 Figure',
  mechanism_schematic: '机理示意图',
  structure_schematic: '材料结构示意',
  process_flow: '工艺流程',
  other: '科研图片'
}[value] || '科研图片')

const routeModeLabel = value => ({
  text_only: 'Text-only 路由',
  image_text: 'Image+Text 视觉路由',
  image_followup: '历史图片追问路由'
}[value] || '自动路由')

const visualStatusLabel = value => ({
  completed: '已完成',
  failed: '不确定',
  misconfigured: '模型配置异常',
  disabled: '已禁用'
}[value] || '待解析')

const visualEvidenceStatusLabel = value => ({
  no_match: '多模态回答已开启，但没有图片通过当前高相关性与证据质量阈值。',
  unavailable: '多模态回答已开启，但 Visual Evidence Database 当前不可用；文字回答不受影响。',
  server_disabled: '服务端已停用 Visual Evidence 检索；本轮保持纯文本回答。'
}[value] || '本轮未返回可展示的视觉证据。')

const formatConfidence = value => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`

const formatBBox = value => Array.isArray(value) && value.length === 4
  ? `[${value.map(item => Number(item).toFixed(2)).join(', ')}]`
  : '[位置未确定]'

const phaseStatusLabel = value => ({
  explicit_label: '图中明确标签',
  candidate: '候选物相',
  unresolved: '未确认'
}[value] || '未确认')

const formatComposition = item => {
  const number = Number(item?.value)
  const value = Number.isFinite(number) ? number : '—'
  return `${item?.element || '元素'}=${value} ${item?.unit || ''}${item?.basis ? `（${item.basis}）` : ''}`.trim()
}

const reasoningStatusLabel = value => ({
  completed: '已整理',
  active: '分析中',
  pending: '待处理'
}[value] || '待处理')

const formatReasoningMetrics = metrics => {
  const labels = {
    image_count: '图片',
    observation_count: '观察',
    hypothesis_count: '假设',
    evidence_count: '候选证据',
    reference_count: '引用'
  }
  return Object.entries(metrics || {})
    .filter(([key, value]) => labels[key] && Number.isFinite(Number(value)))
    .map(([key, value]) => `${labels[key]} ${Number(value)}`)
    .join(' · ')
}

const scrollToBottom = async () => {
  await nextTick()
  if (messageViewport.value) {
    messageViewport.value.scrollTop = messageViewport.value.scrollHeight
  }
}

const formatTime = value => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

watch(() => props.selectedGraphId, () => {
  clearSelectedImages()
  if (props.autoRestore) restore()
  else startNewDiscussion()
})
watch(messages, value => {
  emit('history-change', value.length > 0)
}, { deep: true, immediate: true })
watch(messages, value => {
  if (value.length) persist()
}, { deep: true })
watch(enableMultimodalResponse, persist)
watch(multimodalRenderMode, persist)
watch(selectedModelMode, persist)
onMounted(() => {
  if (props.autoRestore) restore()
  loadCapabilities()
})
onBeforeUnmount(() => {
  stopProgressTracking()
  closeImagePreview()
  clearSelectedImages()
  revokeMessagePreviews()
})
</script>

<style scoped>
.multi-discussion {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  background: #f5f7fb;
  color: #172033;
}

.multi-discussion.is-embedded {
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid #d4e1eb;
  border-radius: 11px;
  overflow: hidden;
}

.multi-discussion.is-embedded.is-empty {
  display: block;
  min-height: auto;
  border: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
}

.multi-discussion-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(310px, 430px);
  gap: 24px;
  padding: 18px 22px;
  border-bottom: 1px solid #dfe5ef;
  background: linear-gradient(125deg, #ffffff 0%, #f5f7ff 62%, #eefcf8 100%);
}

.multi-discussion-kicker {
  color: #5b5bd6;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .13em;
  text-transform: uppercase;
}

.multi-discussion-title h2 {
  margin: 4px 0;
  color: #17194a;
  font-size: 22px;
}

.multi-discussion-title p {
  max-width: 720px;
  margin: 0;
  color: #657087;
  font-size: 12px;
  line-height: 1.55;
}

.multi-discussion-controls {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 5px 10px;
  align-content: center;
}

.multi-discussion-controls label {
  grid-column: 1 / -1;
  color: #536078;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.multi-discussion-controls select {
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border: 1px solid #b9c3d5;
  border-radius: 9px;
  background: #fff;
  color: #1c2840;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
}

.multi-discussion-control-meta {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  color: #7b879a;
  font-size: 9px;
}

.multi-discussion-control-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-discussion-control-meta button {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #5657c7;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.multi-discussion-control-meta .is-error,
.multi-discussion-error {
  color: #b42318;
}

.new-discussion-btn {
  height: 36px;
  padding: 0 13px;
  border: 1px solid #5959d6;
  border-radius: 9px;
  background: #fff;
  color: #4e4fc4;
  font: inherit;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}

.multi-discussion-status {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 34px;
  padding: 0 22px;
  border-bottom: 1px solid #e4e9f1;
  background: #fff;
  color: #7c8798;
  font-size: 10px;
}

.model-mode-status {
  color: #4e50bd;
  font-weight: 750;
}

.multi-discussion-status strong {
  color: #33405a;
}

.vision-capability {
  max-width: 330px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vision-capability.is-ready { color: #087956; }
.vision-capability.is-warning { color: #b54708; font-weight: 800; }

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #b8c0cc;
}

.status-dot.active {
  background: #18a874;
  box-shadow: 0 0 0 3px #dff8ee;
}

.conversation-id {
  margin-left: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.multi-discussion-messages {
  min-height: 0;
  overflow-y: auto;
  padding: 22px max(22px, calc((100% - 980px) / 2));
}

.multi-discussion-guides {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
  text-align: left;
}

.multi-discussion-guides--empty {
  width: 100%;
  margin-top: 0;
}

.multi-discussion-guide {
  min-height: 64px;
  padding: 12px 14px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
  color: #4f687d;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.55;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--asc-transition), color var(--asc-transition), transform var(--asc-transition);
}

.multi-discussion-guide::before {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin: 0 7px 2px 0;
  border-radius: 50%;
  background: #82b9d9;
  content: '';
}

.multi-discussion-guide:hover,
.multi-discussion-guide:focus-visible {
  border-color: #8fc2df;
  color: var(--asc-primary);
  outline: none;
  transform: translateY(-2px);
}

.multi-discussion-guide:disabled {
  cursor: not-allowed;
  opacity: .55;
  transform: none;
}

@media (max-width: 760px) {
  .multi-discussion-guides {
    grid-template-columns: 1fr;
  }
}

.discussion-message {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  max-width: 920px;
  margin: 0 auto 18px;
}

.discussion-message.is-user {
  grid-template-columns: minmax(0, 1fr) 34px;
}

.discussion-message.is-user .message-avatar {
  grid-column: 2;
  grid-row: 1;
  background: #5b5bd6;
  color: #fff;
}

.discussion-message.is-user .message-card {
  grid-column: 1;
  grid-row: 1;
  justify-self: end;
  max-width: 78%;
  background: #5b5bd6;
  color: #fff;
}

.discussion-message.is-user .message-meta,
.discussion-message.is-user .message-meta strong {
  color: #e9e9ff;
}

.message-avatar {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #e8f7f2;
  color: #087956;
  font-size: 10px;
  font-weight: 900;
}

.message-card {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid #dfe5ee;
  border-radius: 5px 14px 14px 14px;
  background: #fff;
  box-shadow: 0 4px 18px rgba(37, 47, 72, .04);
}

.message-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  color: #9aa3b2;
  font-size: 9px;
}

.message-meta strong {
  color: #35425d;
  font-size: 10px;
}

.message-content {
  color: inherit;
  font-size: 12px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message-content.is-markdown {
  white-space: normal;
}

.message-content.is-markdown :deep(p) {
  margin: 0 0 9px;
}

.message-content.is-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.message-content.is-markdown :deep(h2),
.message-content.is-markdown :deep(h3),
.message-content.is-markdown :deep(h4) {
  margin: 14px 0 7px;
  color: #263451;
  font-size: 13px;
  line-height: 1.4;
}

.message-content.is-markdown :deep(h2:first-child),
.message-content.is-markdown :deep(h3:first-child),
.message-content.is-markdown :deep(h4:first-child) {
  margin-top: 0;
}

.message-content.is-markdown :deep(strong) {
  color: #263451;
  font-weight: 850;
}

.message-content.is-markdown :deep(.md-key-underline) {
  text-decoration: underline;
  text-decoration-color: #797ad3;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.message-content.is-markdown :deep(.md-latex) {
  color: #263451;
  font-family: "STIX Two Math", "Cambria Math", "Times New Roman", serif;
  overflow-wrap: normal;
}

.message-content.is-markdown :deep(.md-latex-inline) {
  display: inline-flex;
  align-items: baseline;
  gap: .08em;
  padding: 0 .08em;
}

.message-content.is-markdown :deep(.md-latex-block) {
  display: block;
  max-width: 100%;
  margin: 10px 0;
  padding: 9px 12px;
  overflow-x: auto;
  border-radius: 7px;
  background: #f7f8fc;
  text-align: center;
  white-space: nowrap;
}

.message-content.is-markdown :deep(.md-latex sub),
.message-content.is-markdown :deep(.md-latex sup) {
  font-size: .72em;
  line-height: 0;
}

.message-content.is-markdown :deep(.md-latex-frac) {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  margin: 0 .14em;
  vertical-align: middle;
  line-height: 1.05;
  text-align: center;
}

.message-content.is-markdown :deep(.md-latex-num) {
  padding: 0 .16em .08em;
  border-bottom: 1px solid currentColor;
}

.message-content.is-markdown :deep(.md-latex-den) {
  padding: .08em .16em 0;
}

.message-content.is-markdown :deep(.md-latex-bold) {
  font-weight: 800;
}

.message-content.is-markdown :deep(.md-latex-italic) {
  font-style: italic;
}

.message-content.is-markdown :deep(.md-latex-roman) {
  font-style: normal;
}

.message-content.is-markdown :deep(.md-list) {
  margin: 7px 0 10px;
  padding-left: 20px;
}

.message-content.is-markdown :deep(.md-list li) {
  margin: 3px 0;
  padding-left: 2px;
}

.message-content.is-markdown :deep(blockquote) {
  margin: 8px 0;
  padding: 8px 11px;
  border-left: 3px solid #9d9ee8;
  border-radius: 0 7px 7px 0;
  background: #f6f6fd;
  color: #59657c;
}

.message-content.is-markdown :deep(.md-table-wrap) {
  max-width: 100%;
  margin: 9px 0;
  overflow-x: auto;
  border: 1px solid #dfe4ed;
  border-radius: 8px;
}

.message-content.is-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  font-size: 10px;
}

.message-content.is-markdown :deep(th),
.message-content.is-markdown :deep(td) {
  min-width: 100px;
  padding: 7px 9px;
  border-bottom: 1px solid #e8ebf1;
  text-align: left;
  vertical-align: top;
}

.message-content.is-markdown :deep(th) {
  background: #f2f4fa;
  color: #43506a;
  font-weight: 850;
}

.message-content.is-markdown :deep(.md-inline-code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: #eef0f5;
  color: #4b4db3;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .92em;
}

.message-content.is-markdown :deep(.md-code) {
  margin: 9px 0;
  padding: 10px 12px;
  overflow-x: auto;
  border-radius: 8px;
  background: #202638;
  color: #eef1f7;
  font-size: 10px;
}

.message-content.is-markdown :deep(.md-link) {
  color: #5052bf;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.message-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 240px));
  gap: 8px;
  margin-bottom: 9px;
}

.message-image-grid figure {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid rgba(210, 217, 231, .8);
  border-radius: 8px;
  background: #111827;
}

.message-image-grid img {
  display: block;
  width: 100%;
  height: 150px;
  object-fit: contain;
  background: #111827;
}

.previewable-image {
  cursor: zoom-in;
}

.previewable-image:focus-visible {
  outline: 3px solid rgba(108, 178, 219, .9);
  outline-offset: -3px;
}

.message-image-grid figcaption {
  overflow: hidden;
  padding: 5px 7px;
  background: rgba(255, 255, 255, .95);
  color: #59657a;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.answer-visual-evidence {
  margin-top: 12px;
  padding: 11px;
  border: 1px solid #cfe4dc;
  border-radius: 11px;
  background: linear-gradient(145deg, #f7fcfa, #f6f7ff);
}

.answer-visual-evidence > h3 {
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #dce9e4;
  color: #1b3146;
  font-size: 13px;
}

.answer-visual-evidence.is-inline {
  margin: 9px 0 12px;
  border-left: 4px solid #29a47e;
  background: linear-gradient(135deg, #f4fbf8, #f8f9ff);
}

.answer-visual-evidence > header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 9px;
}

.answer-visual-evidence > header div {
  display: grid;
  gap: 2px;
}

.answer-visual-evidence > header strong {
  color: #176f58;
  font-size: 11px;
}

.answer-visual-evidence > header span {
  color: #758197;
  font-size: 8px;
}

.answer-visual-evidence > header b {
  flex: 0 0 auto;
  padding: 3px 7px;
  border-radius: 999px;
  background: #dcf2eb;
  color: #16785d;
  font-size: 8px;
}

.answer-visual-evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 9px;
}

.answer-visual-evidence-grid figure {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid #dce3ec;
  border-radius: 9px;
  background: #fff;
}

.answer-visual-evidence-grid img {
  display: block;
  width: 100%;
  height: 210px;
  object-fit: contain;
  background: #111827;
}

.answer-visual-evidence-grid figcaption {
  display: grid;
  gap: 6px;
  padding: 9px 10px 10px;
}

.answer-visual-evidence-grid figcaption > strong {
  color: #26344c;
  font-size: 10px;
  line-height: 1.5;
}

.answer-visual-evidence-grid figcaption p {
  margin: 0;
  color: #536279;
  font-size: 9px;
  line-height: 1.55;
}

.answer-visual-evidence-grid .visual-entity-binding {
  padding: 5px 7px;
  border-radius: 6px;
  background: #f2f6fa;
  color: #4e6279;
  font-size: 8px;
}

.answer-visual-evidence-grid .visual-experiment-binding {
  padding: 5px 7px;
  border-left: 2px solid #d7a554;
  border-radius: 0 5px 5px 0;
  background: #fffaf1;
  color: #735a32;
  font-size: 8px;
}

.answer-visual-evidence.is-inline .answer-visual-evidence-grid {
  grid-template-columns: 1fr;
}

.answer-visual-evidence.is-inline .answer-visual-evidence-grid figure {
  display: grid;
  grid-template-columns: minmax(170px, 230px) minmax(0, 1fr);
}

.answer-visual-evidence.is-inline .answer-visual-evidence-grid img {
  height: 100%;
  min-height: 185px;
}

.answer-visual-evidence-grid figcaption small {
  color: #7d889a;
  font-size: 8px;
  line-height: 1.45;
}

.answer-visual-evidence-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.answer-visual-evidence-meta span {
  padding: 2px 5px;
  border-radius: 999px;
  background: #eef3f8;
  color: #53637a;
  font-size: 7px;
  font-weight: 800;
}

.answer-visual-evidence-status {
  margin-top: 10px;
  padding: 7px 9px;
  border: 1px solid #e0e5ed;
  border-radius: 8px;
  background: #f8fafc;
  color: #6c788c;
  font-size: 9px;
  line-height: 1.5;
}

.answer-visual-evidence-status.is-unavailable,
.answer-visual-evidence-status.is-server_disabled {
  border-color: #ecdcb7;
  background: #fffaf0;
  color: #8a6728;
}

.message-visual-panel {
  margin-top: 10px;
  border-top: 1px solid #edf0f5;
}

.multimodal-route-badge {
  display: inline-flex;
  align-items: center;
  margin: 8px 0 2px;
  padding: 4px 8px;
  border: 1px solid #cdd6f7;
  border-radius: 999px;
  background: #f5f6ff;
  color: #4e51ad;
  font-size: 9px;
  font-weight: 800;
}

.message-visual-panel summary {
  padding: 9px 0 2px;
  color: #087956;
  font-size: 10px;
  font-weight: 850;
  cursor: pointer;
}

.visual-analysis-summary {
  margin: 7px 0;
  color: #4d5c72;
  font-size: 10px;
  line-height: 1.55;
}

.visual-analysis-mode {
  display: inline-flex;
  margin: 0 0 7px;
  padding: 3px 7px;
  border-radius: 999px;
  background: #e9f8f2;
  color: #137456;
  font-size: 8px;
  font-weight: 850;
}

.visual-analysis-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.visual-analysis-list > li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 8px;
  padding: 8px 10px;
  border-left: 2px solid #24aa7e;
  background: #f3fbf8;
  color: #4d5b70;
  font-size: 9px;
}

.visual-analysis-list strong { color: #19684f; }
.visual-analysis-list span { color: #7c8998; }
.visual-analysis-list > li > p,
.visual-analysis-list > li > small {
  grid-column: 1 / -1;
  margin: 0;
  line-height: 1.5;
}
.visual-analysis-list > li > small { color: #8a6734; }

.visual-caption {
  color: #445269;
  font-weight: 700;
}

.visual-evidence-layer {
  grid-column: 1 / -1;
  padding: 6px 8px;
  border-radius: 6px;
  background: #fff;
  line-height: 1.5;
}

.visual-evidence-layer b {
  display: block;
  margin-bottom: 2px;
  font-size: 8px;
  letter-spacing: .03em;
}

.visual-evidence-layer p { margin: 0; }
.visual-evidence-layer.is-observation { border-left: 2px solid #1b9a70; }
.visual-evidence-layer.is-observation b { color: #147052; }
.visual-evidence-layer.is-localization { border-left: 2px solid #2a91a8; }
.visual-evidence-layer.is-localization b { color: #23788b; }
.visual-evidence-layer.is-identification { border-left: 2px solid #b08b2f; }
.visual-evidence-layer.is-identification b { color: #806319; }
.visual-evidence-layer.is-inference { border-left: 2px solid #5876cf; }
.visual-evidence-layer.is-inference b { color: #405db0; }
.visual-evidence-layer.is-mechanism { border-left: 2px solid #8b65c9; }
.visual-evidence-layer.is-mechanism b { color: #704da9; }
.visual-evidence-layer.is-property { border-left: 2px solid #d1803c; }
.visual-evidence-layer.is-property b { color: #a65c21; }

.visual-reasoning-chains {
  grid-column: 1 / -1;
  margin: 0;
  padding: 6px 8px 6px 24px;
  border: 1px dashed #b9c9d9;
  border-radius: 6px;
  background: #f9fbfd;
}

.visual-reasoning-chains li {
  margin: 3px 0;
  line-height: 1.5;
}

.visual-reasoning-chains small {
  display: block;
  color: #8a6734;
}

.message-evidence-panel {
  margin-top: 10px;
  border-top: 1px solid #edf0f5;
}

.message-evidence-panel summary {
  padding: 9px 0 2px;
  color: #5153bd;
  font-size: 10px;
  font-weight: 850;
  cursor: pointer;
}

.reference-list {
  display: grid;
  gap: 8px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.reference-list li {
  padding: 8px 10px;
  border-left: 2px solid #9e9fe9;
  background: #f8f9fd;
}

.reference-list blockquote {
  margin: 3px 0 0;
  color: #536078;
  font-size: 10px;
  line-height: 1.55;
}

.reference-heading {
  display: flex;
  gap: 6px;
  align-items: baseline;
  color: #4e5a71;
  font-size: 9px;
}

.reference-heading strong {
  color: #5153bd;
}

.reference-list blockquote {
  padding: 0;
  border: 0;
}

.discussion-message.is-loading .message-card {
  width: min(720px, 100%);
  padding: 14px 16px;
  border-color: #d9e2ef;
  background: linear-gradient(145deg, #ffffff 0%, #f8faff 58%, #f1fbf8 100%);
}

.analysis-progress-card {
  display: grid;
  gap: 10px;
}

.analysis-progress-heading {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
}

.analysis-progress-heading strong {
  display: block;
  color: #263450;
  font-size: 12px;
  line-height: 1.35;
}

.analysis-progress-heading p {
  margin: 3px 0 0;
  color: #6b778d;
  font-size: 10px;
  line-height: 1.5;
}

.analysis-progress-heading > b {
  padding-top: 1px;
  color: #5052bf;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.analysis-pulse {
  width: 9px;
  height: 9px;
  margin-top: 3px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #5b5bd6;
  box-shadow: 0 0 0 3px rgba(91, 91, 214, .16);
  animation: analysisPulse 1.45s ease-in-out infinite;
}

.analysis-progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #e5eaf2;
}

.analysis-progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5b5bd6 0%, #4e8bc9 48%, #20a77c 100%);
  box-shadow: 0 0 12px rgba(58, 139, 177, .24);
  transition: width .38s ease;
}

.scientific-agent-workbench {
  overflow: hidden;
  border: 1px solid #d9e1ee;
  border-radius: 12px;
  background: rgba(255, 255, 255, .82);
  box-shadow: 0 8px 24px rgba(40, 55, 90, .05);
}

.workbench-title {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e6eaf1;
  background: linear-gradient(90deg, rgba(91, 91, 214, .07), rgba(32, 167, 124, .06));
}

.workbench-title strong,
.workbench-title span {
  display: block;
}

.workbench-title strong {
  color: #283650;
  font-size: 11px;
  letter-spacing: .02em;
}

.workbench-title span {
  margin-top: 2px;
  color: #79859a;
  font-size: 9px;
  line-height: 1.4;
}

.workbench-title em {
  flex: 0 0 auto;
  padding: 3px 7px;
  border-radius: 999px;
  background: #e5f8f0;
  color: #087956;
  font-size: 8px;
  font-style: normal;
  font-weight: 900;
  letter-spacing: .1em;
}

.reasoning-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: #e6eaf1;
}

.reasoning-summary-grid article {
  position: relative;
  min-width: 0;
  min-height: 104px;
  padding: 10px 11px;
  background: #fbfcfe;
  transition: background .3s ease, box-shadow .3s ease;
}

.reasoning-summary-grid article.is-active {
  z-index: 1;
  background: #fff;
  box-shadow: inset 3px 0 0 #5b5bd6, 0 0 18px rgba(91, 91, 214, .1);
}

.reasoning-summary-grid article.is-completed {
  background: #f8fcfa;
}

.reasoning-summary-grid article.is-pending {
  opacity: .68;
}

.reasoning-summary-grid header {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
}

.reasoning-summary-grid header i {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: #ececff;
  color: #5456c8;
  font-size: 9px;
  font-style: normal;
  font-weight: 900;
}

.reasoning-summary-grid .phase-hypothesis header i { background: #fff1df; color: #a55d17; }
.reasoning-summary-grid .phase-evidence_linking header i { background: #e4f6f0; color: #087956; }
.reasoning-summary-grid .phase-conclusion header i { background: #e8f1fb; color: #2f6fa3; }

.reasoning-summary-grid header strong {
  overflow: hidden;
  color: #33405a;
  font-size: 10px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reasoning-summary-grid header span {
  color: #9aa4b3;
  font-size: 8px;
  font-weight: 800;
}

.reasoning-summary-grid article.is-active header span { color: #5557c9; }
.reasoning-summary-grid article.is-completed header span { color: #138060; }

.reasoning-summary-grid article > p {
  margin: 7px 0 0;
  color: #68758a;
  font-size: 9px;
  line-height: 1.55;
}

.reasoning-summary-grid article.is-active > p::after {
  content: ' ···';
  color: #5b5bd6;
  animation: summaryDots 1.25s ease-in-out infinite;
}

.reasoning-summary-grid ul {
  display: grid;
  gap: 4px;
  margin: 7px 0 0;
  padding: 0;
  list-style: none;
}

.reasoning-summary-grid li {
  position: relative;
  padding-left: 10px;
  color: #435068;
  font-size: 9px;
  line-height: 1.48;
  overflow-wrap: anywhere;
}

.reasoning-summary-grid li::before {
  position: absolute;
  top: .58em;
  left: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #45a985;
  content: '';
}

.reasoning-summary-grid article > small {
  display: block;
  margin-top: 7px;
  color: #7e8a9e;
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}

.public-logic-chain-panel {
  border-top: 1px solid #e2e7ef;
  background: #f8fafd;
}

.public-logic-chain-panel > header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
}

.public-logic-chain-panel > header strong,
.public-logic-chain-panel > header span {
  display: block;
}

.public-logic-chain-panel > header strong {
  color: #2f3d57;
  font-size: 11px;
}

.public-logic-chain-panel > header span {
  margin-top: 2px;
  color: #8490a3;
  font-size: 8px;
  line-height: 1.4;
}

.public-logic-chain-panel > header b {
  flex: 0 0 auto;
  color: #5658c8;
  font-size: 9px;
}

.public-logic-chain-list {
  display: grid;
  gap: 9px;
  padding: 0 10px 10px;
}

.public-logic-chain-list > article {
  overflow: hidden;
  border: 1px solid #dde3ed;
  border-radius: 9px;
  background: #fff;
}

.logic-chain-meta {
  display: flex;
  justify-content: space-between;
  padding: 6px 9px;
  border-bottom: 1px solid #edf0f5;
  color: #7b879a;
  font-size: 8px;
}

.logic-chain-meta strong {
  color: #5355c5;
  letter-spacing: .08em;
}

.public-logic-chain-list ol {
  display: flex;
  gap: 20px;
  margin: 0;
  padding: 10px;
  overflow-x: auto;
  list-style: none;
  scrollbar-width: thin;
}

.public-logic-chain-list li {
  position: relative;
  flex: 1 0 122px;
  min-width: 122px;
  max-width: 175px;
  padding: 8px 9px;
  border: 1px solid #e0e5ee;
  border-top: 3px solid #6e70d8;
  border-radius: 8px;
  background: #fafbff;
}

.public-logic-chain-list li:not(:last-child)::after {
  position: absolute;
  top: 50%;
  right: -17px;
  color: #8792a5;
  font-size: 13px;
  font-weight: 900;
  content: '→';
  transform: translateY(-50%);
}

.public-logic-chain-list li.logic-formation_cause { border-top-color: #d79543; background: #fffaf3; }
.public-logic-chain-list li.logic-structure_interpretation { border-top-color: #3b9f90; background: #f4fbf9; }
.public-logic-chain-list li.logic-mechanism_hypothesis { border-top-color: #a16fc1; background: #fbf7fd; }
.public-logic-chain-list li.logic-property_implication { border-top-color: #d86868; background: #fff8f8; }
.public-logic-chain-list li.logic-evidence_support { border-top-color: #4a89bd; background: #f5f9fd; }

.public-logic-chain-list li b {
  display: block;
  margin-bottom: 4px;
  color: #46526a;
  font-size: 8px;
  letter-spacing: .04em;
}

.public-logic-chain-list li p {
  margin: 0;
  color: #344158;
  font-size: 9px;
  line-height: 1.5;
}

.logic-chain-boundary {
  margin: 0;
  padding: 7px 10px;
  border-top: 1px dashed #e1e6ee;
  background: #fffcf5;
  color: #806c49;
  font-size: 8px;
  line-height: 1.5;
}

.logic-chain-building {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 2px 12px 12px;
  color: #8490a3;
  font-size: 9px;
}

.logic-chain-building i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #6668d2;
  animation: logicChainThinking 1.05s ease-in-out infinite alternate;
}

.logic-chain-building i:nth-child(2) { animation-delay: .16s; }
.logic-chain-building i:nth-child(3) { margin-right: 3px; animation-delay: .32s; }

.logic-chain-enter-active {
  transition: opacity .32s ease, transform .32s ease;
}

.logic-chain-enter-from {
  opacity: 0;
  transform: translateY(7px);
}

@keyframes logicChainThinking {
  from { opacity: .28; transform: translateY(0); }
  to { opacity: 1; transform: translateY(-3px); }
}

.analysis-text-enter-active,
.analysis-text-leave-active,
.reasoning-point-enter-active {
  transition: opacity .24s ease, transform .24s ease;
}

.analysis-text-enter-from,
.analysis-text-leave-to,
.reasoning-point-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

@keyframes summaryDots {
  0%, 100% { opacity: .25; }
  50% { opacity: 1; }
}

.analysis-stage-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.analysis-stage-list li {
  min-width: 0;
  display: flex;
  gap: 5px;
  align-items: center;
  color: #9aa4b4;
  font-size: 9px;
  font-weight: 750;
  line-height: 1.3;
}

.analysis-stage-list i {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  border: 1px solid #ccd4e0;
  border-radius: 50%;
  background: #fff;
  color: #fff;
  font-size: 8px;
  font-style: normal;
}

.analysis-stage-list li.done { color: #568475; }
.analysis-stage-list li.done i { border-color: #24a57d; background: #24a57d; }
.analysis-stage-list li.active { color: #4e50bd; }
.analysis-stage-list li.active i {
  border: 4px solid #dcdcff;
  background: #5b5bd6;
  box-shadow: 0 0 0 2px rgba(91, 91, 214, .12);
}

.analysis-privacy-note {
  margin: 0;
  padding-top: 7px;
  border-top: 1px solid #e7ebf2;
  color: #8a94a6;
  font-size: 9px;
  line-height: 1.45;
}

@keyframes analysisPulse {
  0%, 100% { transform: scale(.9); opacity: .68; }
  50% { transform: scale(1.12); opacity: 1; }
}

.multi-discussion-composer {
  padding: 10px max(22px, calc((100% - 980px) / 2)) 12px;
  border-top: 1px solid #dfe5ee;
  background: rgba(255, 255, 255, .96);
}

.multi-discussion-composer.is-dragging {
  background: #effaf6;
  box-shadow: inset 0 0 0 2px #24aa7e;
}

.multi-discussion-error {
  margin-bottom: 7px;
  padding: 7px 10px;
  border-radius: 7px;
  background: #fff0ee;
  font-size: 10px;
}

.composer-answer-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
}

.model-mode-selector {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid #cbd3df;
  border-radius: 9px;
  background: #fff;
  color: #536078;
  font-size: 9px;
  font-weight: 850;
}

.model-mode-selector select {
  min-width: 235px;
  border: 0;
  background: transparent;
  color: #283650;
  font: inherit;
  font-size: 9px;
  outline: none;
}

.model-selection-badge {
  display: inline-flex;
  margin: 7px 0 0;
  padding: 4px 8px;
  border: 1px solid #d8ddf5;
  border-radius: 999px;
  background: #f3f3ff;
  color: #4e50bd;
  font-size: 9px;
  font-weight: 800;
}

.multimodal-answer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid #cbd3df;
  border-radius: 9px;
  background: #f8fafc;
  color: #556278;
  font: inherit;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, color .18s ease;
}

.multimodal-answer-toggle strong {
  font-size: 9px;
}

.multimodal-answer-toggle small {
  padding-left: 6px;
  border-left: 1px solid currentColor;
  font-size: 8px;
  opacity: .72;
}

.multimodal-answer-toggle.is-active {
  border-color: #43a789;
  background: #eaf8f3;
  color: #08775a;
  box-shadow: 0 0 0 2px rgba(36, 165, 125, .08);
}

.multimodal-answer-toggle:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.multimodal-render-mode {
  display: inline-flex;
  padding: 2px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #f4f6f9;
}

.multimodal-render-mode button {
  min-height: 25px;
  padding: 3px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6a7689;
  font: inherit;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
}

.multimodal-render-mode button.is-active {
  background: #fff;
  color: #4e50bd;
  box-shadow: 0 1px 4px rgba(51, 62, 85, .13);
}

.multimodal-render-mode button:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.composer-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 76px;
  gap: 8px;
}

.image-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.attach-image-btn {
  min-height: 48px;
  border: 1px solid #aab6c9;
  border-radius: 10px;
  background: #f7f9fc;
  color: #4e5c74;
  font: inherit;
  font-size: 10px;
  font-weight: 850;
  cursor: pointer;
}

.attach-image-btn:hover:not(:disabled) {
  border-color: #5b5bd6;
  color: #5052bf;
}

.pending-image-list {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  overflow-x: auto;
}

.pending-image {
  position: relative;
  flex: 0 0 132px;
  overflow: hidden;
  border: 1px solid #d9e0eb;
  border-radius: 8px;
  background: #f7f9fc;
}

.pending-image img {
  display: block;
  width: 100%;
  height: 72px;
  object-fit: cover;
}

.pending-image span {
  display: block;
  overflow: hidden;
  padding: 4px 7px;
  color: #667287;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-image button {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(16, 24, 40, .8);
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.composer-row textarea {
  min-height: 48px;
  max-height: 130px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid #bfc8d8;
  border-radius: 10px;
  outline: none;
  color: #26324a;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
}

.composer-row textarea:focus {
  border-color: #696bd6;
  box-shadow: 0 0 0 3px rgba(105, 107, 214, .1);
}

.send-discussion-btn {
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #5d5ed4, #4143af);
  color: #fff;
  font: inherit;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}

.send-discussion-btn:disabled,
.new-discussion-btn:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.send-spinner {
  width: 13px;
  height: 13px;
  display: inline-block;
  border: 2px solid rgba(255, 255, 255, .4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.multi-discussion-composer > p {
  margin: 5px 2px 0;
  color: #9aa3b1;
  font-size: 8px;
}

@media (max-width: 860px) {
  .multi-discussion-header {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .conversation-id { display: none; }
  .discussion-message.is-user .message-card { max-width: 92%; }
  .composer-row { grid-template-columns: 50px minmax(0, 1fr) 66px; }
  .reasoning-summary-grid { grid-template-columns: 1fr; }
  .answer-visual-evidence.is-inline .answer-visual-evidence-grid figure { grid-template-columns: 1fr; }
  .answer-visual-evidence.is-inline .answer-visual-evidence-grid img { height: 190px; }
}
</style>
