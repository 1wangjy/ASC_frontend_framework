<template>
  <div class="interaction-panel">
    <div v-if="codGlobalOverviewOpen" class="cod-global-query-page">
      <header class="cod-global-query-header">
        <div class="cod-global-report-brand">
          <span>KG Insight Report</span>
          <strong>{{ reportOutline?.title || displayProjectName }}</strong>
          <small>ID: {{ reportId || projectId || '等待后端分配' }}</small>
        </div>
        <div class="cod-global-report-actions">
          <button type="button" class="cod-global-action-btn" @click="openKgInsightPreview">预览</button>
          <button type="button" class="cod-global-action-btn" @click="downloadKgInsightReport">下载</button>
          <button type="button" class="cod-global-action-btn is-secondary" @click="closeCodGlobalOverview">返回</button>
        </div>
      </header>

      <main class="cod-global-query-main">
        <section class="cod-global-query-composer" aria-label="全局查询">
          <div class="cod-global-query-toolbar">
            <textarea
              id="cod-global-query-input"
              v-model="codQuestion"
              class="cod-global-query-input"
              :disabled="isCodQuerying"
              placeholder="请输入新的材料机制、KG Insight 或 OMD 查询问题"
              rows="2"
            ></textarea>
            <button
              type="button"
              class="cod-feedback-open-btn"
              :class="{ 'has-feedback': qaFeedbackSubmitResult }"
              :disabled="!codResult || isCodQuerying"
              @click="openQaFeedbackModal"
              :title="codResult ? '打开 Expert Eval 原文审阅窗口' : '完成一次 CoD QA 后可评价'"
            >
              Expert Eval
            </button>
            <button
              type="button"
              class="cod-feedback-open-btn cod-llm-judge-open-btn"
              :class="{ 'has-feedback': llmJudgeResult }"
              :disabled="!codResult || isCodQuerying || isRunningLlmJudge"
              @click="runLlmsAsJudge"
              :title="codResult ? '运行 LLM as Judge 自动评价当前 QA' : '完成一次 CoD QA 后可运行 LLM as Judge'"
            >
              <span v-if="isRunningLlmJudge" class="loading-spinner"></span>
              <span v-else>运行 LLM Judge</span>
            </button>
            <button
              type="button"
              class="cod-global-omd-toggle"
              :class="{ active: omdDeepQueryEnabled }"
              :disabled="isCodQuerying"
              @click="omdDeepQueryEnabled = !omdDeepQueryEnabled"
              title="在保留 CoD 原答案基础上追加 ASC 本体机制信息增益"
            >
              Ontology-aided CoD
            </button>
            <div class="cod-global-reasoning-toggle" role="group" aria-label="GraphRAG 推理模式">
              <button
                v-for="mode in codReasoningModes"
                :key="`global-${mode.value}`"
                type="button"
                :class="{ active: codReasoningMode === mode.value }"
                :disabled="isCodQuerying"
                :title="mode.title"
                @click="codReasoningMode = mode.value"
              >
                {{ mode.label }}
              </button>
            </div>
            <button
              type="button"
              class="cod-global-llm-toggle"
              :class="{ active: codLlmEnabled }"
              :disabled="isCodQuerying"
              @click="handleCodLlmToggleClick"
              :title="codLlmEnabled ? '关闭 CoD 查询中的 LLM 初步回答和最终融合回答' : '确认后打开 CoD 查询中的 LLM 初步回答和最终融合回答'"
            >
              LLMs：{{ codLlmEnabled ? '开启' : '关闭' }}
            </button>
            <button
              type="button"
              class="cod-global-run-btn"
              :disabled="!codQuestion.trim() || isCodQuerying"
              @click="submitCodQuery"
            >
              <span v-if="isCodQuerying" class="loading-spinner"></span>
              <span v-else>查询</span>
            </button>
          </div>
        </section>

        <section v-if="isCodQuerying" class="cod-global-progress">
          <div class="cod-progress-head">
            <span>正在执行全局查询 · {{ codElapsedSeconds }}s</span>
            <strong>{{ codProgressPercent }}%</strong>
          </div>
          <div class="cod-progress-track">
            <div class="cod-progress-bar" :style="{ width: `${codProgressPercent}%` }"></div>
          </div>
        </section>

        <div v-if="codGlobalOverviewItems.length" class="cod-global-overview-grid is-page">
          <article
            v-for="item in codGlobalOverviewItems"
            :key="`global-page-${item.key}`"
            class="cod-global-card"
            :class="[`is-${item.tone}`, `is-${item.key}`]"
          >
            <div class="cod-global-card-header">
              <div>
                <div class="cod-global-card-kicker">{{ item.kicker }}</div>
                <h4>{{ item.title }}</h4>
              </div>
            </div>
            <div v-if="item.type === 'metrics'" class="cod-global-card-body cod-global-metrics-body">
              <div class="cod-metric-visual-suite is-global">
                <div class="cod-metric-visual-header">
                  <span>Academic Metric Profile</span>
                  <strong>{{ qaMetricAcademicBand.label }}</strong>
                </div>
                <div class="cod-metric-visual-layout">
                  <div class="cod-metric-radar-panel">
                    <svg class="cod-metric-radar" viewBox="0 0 240 240" role="img" aria-label="OMD 专业指标雷达图">
                      <polygon
                        v-for="ring in qaRadarRings"
                        :key="`page-ring-${ring.level}`"
                        class="cod-radar-ring"
                        :points="ring.points"
                      ></polygon>
                      <line
                        v-for="axis in qaRadarAxes"
                        :key="`page-axis-${axis.key}`"
                        class="cod-radar-axis"
                        x1="120"
                        y1="120"
                        :x2="axis.axisX"
                        :y2="axis.axisY"
                      ></line>
                      <polygon class="cod-radar-area" :points="qaRadarPolygonPoints"></polygon>
                      <circle
                        v-for="point in qaRadarPoints"
                        :key="`page-point-${point.key}`"
                        class="cod-radar-point"
                        :cx="point.x"
                        :cy="point.y"
                        r="3"
                      ></circle>
                      <text
                        v-for="axis in qaRadarAxes"
                        :key="`page-label-${axis.key}`"
                        class="cod-radar-label"
                        :x="axis.labelX"
                        :y="axis.labelY"
                        text-anchor="middle"
                      >{{ axis.shortLabel }}</text>
                    </svg>
                  </div>
                  <div class="cod-metric-domain-panel">
                    <div
                      v-for="group in qaMetricDomainGroups"
                      :key="`page-domain-${group.key}`"
                      class="cod-metric-domain-row"
                      :class="`is-${group.tone}`"
                    >
                      <div class="cod-metric-domain-head">
                        <span>{{ group.label }}</span>
                        <strong>{{ formatMetricPercent(group.value) }}</strong>
                      </div>
                      <div class="cod-metric-domain-track">
                        <i :style="{ width: group.width }"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="cod-global-metric-grid">
                <button
                  v-for="metric in qaMetricVisualRows"
                  :key="`page-metric-${metric.key}`"
                  type="button"
                  class="cod-global-metric-chip"
                  :class="`is-${metric.band}`"
                  @click="openQaMetricFromGlobal(metric.key)"
                >
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.percent }}</strong>
                </button>
              </div>
            </div>
            <div
              v-else
              class="cod-answer cod-detail-content cod-global-card-body"
              :class="{ 'cod-logic-chain': item.key === 'logic-chain' }"
              @click="handleQaMetricClick"
            >
              <div
                v-if="item.key === 'logic-chain' && codReasoningRoute"
                class="cod-logic-route-action"
              >
                <div>
                  <span>CoT / ToT visualization</span>
                  <strong>查看 Adaptive 推理路由图、结构/语义评分和路径量化指标</strong>
                </div>
                <button type="button" @click.stop="openCodRoutingTrace">
                  查看 CoT / ToT 可视化与量化指标
                </button>
              </div>
              <div v-html="renderCodDetailMarkdown(item.content)"></div>
            </div>
          </article>
        </div>

        <section
          v-else-if="isCodQuerying || codProgressSteps.length"
          class="cod-global-stepboard"
          aria-label="查询过程"
        >
          <div
            v-for="step in codProgressSteps"
            :key="`global-step-${step.key}`"
            class="cod-global-step-item"
            :class="step.status"
          >
            <div class="cod-step-dot"></div>
            <div class="cod-global-step-content">
              <div class="cod-global-step-row">
                <strong>{{ step.label }}</strong>
                <span>{{ step.elapsedMs !== null ? formatDurationMs(step.elapsedMs) : step.statusText }}</span>
              </div>
              <p>{{ step.detail }}</p>
            </div>
          </div>
        </section>

        <div v-else class="cod-global-empty-answer">
          <strong>等待查询</strong>
          <span>在上方输入问题后，详细回答会按全局观览卡片布局展示在这里。</span>
        </div>
      </main>

      <Teleport to="body">
        <div
          v-if="codReportPreviewOpen"
          class="kg-report-preview-backdrop"
          @click.self="closeKgInsightPreview"
        >
          <div class="kg-report-preview-modal" role="dialog" aria-modal="true">
            <div class="kg-report-preview-header">
              <div>
                <span>Preview</span>
                <h3>KG Insight Report</h3>
              </div>
              <button class="qa-metric-modal-close" type="button" @click="closeKgInsightPreview" aria-label="关闭预览">
                ×
              </button>
            </div>
            <div class="kg-report-preview-body" v-html="renderMarkdown(kgInsightReportPreviewMarkdown)"></div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="codLlmConfirmOpen"
          class="cod-llm-confirm-backdrop"
          @click.self="closeCodLlmConfirm"
        >
          <div class="cod-llm-confirm-modal" role="dialog" aria-modal="true">
            <div class="cod-llm-confirm-header">
              <div>
                <div class="cod-llm-confirm-kicker">LLM confirmation</div>
                <h3>确认打开 LLMs？</h3>
              </div>
              <button class="qa-metric-modal-close" type="button" @click="closeCodLlmConfirm" aria-label="关闭">
                ×
              </button>
            </div>
            <div class="cod-llm-confirm-body">
              <p>
                打开后，本次之后的 CoD 查询会先调用 LLM 对输入问题生成初步回答，再用 CoD 检索路径、accepted claims 和 OMD 指标进行最终融合；
                问题分解、语义路由和路径验证默认使用本地规则，避免短时辅助 LLM 超时影响最终回答。
              </p>
              <div class="cod-llm-confirm-grid">
                <div>
                  <span>Query Decomposition</span>
                  <strong>规则分解</strong>
                </div>
                <div>
                  <span>Routing Judge</span>
                  <strong>heuristic semantic score + KG structure score</strong>
                </div>
                <div>
                  <span>Path Verification</span>
                  <strong>heuristic evidence check</strong>
                </div>
                <div>
                  <span>Final Answer</span>
                  <strong>LLM initial answer + constrained synthesis</strong>
                </div>
              </div>
              <div class="cod-llm-confirm-actions">
                <button class="cod-llm-cancel-btn" type="button" @click="closeCodLlmConfirm">
                  取消
                </button>
                <button class="cod-llm-confirm-btn" type="button" @click="confirmEnableCodLlms">
                  确认打开 LLMs
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="codRoutingTraceOpen"
          class="cod-routing-page-backdrop"
          @click.self="closeCodRoutingTrace"
        >
          <section class="cod-routing-page" role="dialog" aria-modal="true">
            <header class="cod-routing-page-header">
              <div>
                <div class="cod-routing-page-kicker">CoT / ToT visualization</div>
                <h3>Adaptive 推理路由与量化指标</h3>
              </div>
              <div class="cod-routing-page-question">
                <span>查询问题</span>
                <strong>{{ codResult?.question || codQuestion }}</strong>
              </div>
              <button class="qa-metric-modal-close" type="button" @click="closeCodRoutingTrace" aria-label="关闭推理路由">
                ×
              </button>
            </header>

            <div class="cod-routing-page-body">
              <aside class="cod-routing-page-side">
                <div class="cod-routing-decision-card">
                  <span>Routing Decision</span>
                  <strong>{{ codReasoningVisual.routeLabel }}</strong>
                  <p>{{ codReasoningVisual.modeLabel }}</p>
                </div>
                <div class="cod-routing-score-stack">
                  <button
                    v-for="score in codReasoningVisual.scoreRows"
                    :key="`global-page-score-${score.key}`"
                    type="button"
                    class="cod-routing-score-card"
                    @click="openRoutingMetricDetail(score.key)"
                  >
                    <span>{{ score.label }}</span>
                    <strong>{{ score.value }}</strong>
                    <small>{{ score.groupLabel }}</small>
                  </button>
                </div>
                <div class="cod-routing-academic-panel">
                  <div class="cod-routing-academic-head">
                    <span>Academic complexity profile</span>
                    <strong>{{ codReasoningVisual.academicProfileTitle }}</strong>
                  </div>
                  <svg class="cod-routing-radar" viewBox="0 0 150 150" role="img" aria-label="Adaptive reasoning academic radar">
                    <g class="cod-routing-radar-grid">
                      <polygon points="75,25 118.3,50 118.3,100 75,125 31.7,100 31.7,50" />
                      <polygon points="75,42 103.6,58.5 103.6,91.5 75,108 46.4,91.5 46.4,58.5" />
                      <polygon points="75,59 88.9,67 88.9,83 75,91 61.1,83 61.1,67" />
                    </g>
                    <g>
                      <line
                        v-for="axis in codReasoningVisual.academicRadarAxes"
                        :key="`global-radar-axis-${axis.key}`"
                        x1="75"
                        y1="75"
                        :x2="axis.axisX"
                        :y2="axis.axisY"
                      />
                    </g>
                    <polygon class="cod-routing-radar-area" :points="codReasoningVisual.academicRadarPolygon" />
                    <circle
                      v-for="axis in codReasoningVisual.academicRadarAxes"
                      :key="`global-radar-dot-${axis.key}`"
                      :cx="axis.pointX"
                      :cy="axis.pointY"
                      r="3.2"
                    />
                    <text
                      v-for="axis in codReasoningVisual.academicRadarAxes"
                      :key="`global-radar-label-${axis.key}`"
                      :x="axis.labelX"
                      :y="axis.labelY"
                      text-anchor="middle"
                    >
                      {{ axis.label }}
                    </text>
                  </svg>
                  <div class="cod-routing-academic-bars">
                    <div
                      v-for="bar in codReasoningVisual.academicBars"
                      :key="`global-academic-bar-${bar.label}`"
                    >
                      <span>{{ bar.label }}</span>
                      <strong>{{ bar.display }}</strong>
                      <em :style="{ width: bar.width }"></em>
                    </div>
                  </div>
                </div>
                <div class="cod-routing-flags">
                  <span
                    v-for="flag in codReasoningVisual.semanticFlags"
                    :key="`global-page-flag-${flag}`"
                  >
                    {{ flag }}
                  </span>
                </div>
              </aside>

              <main class="cod-routing-page-main">
                <div class="cod-router-visual is-page" :class="`is-${codReasoningVisual.mode}`">
                  <div class="cod-router-hero">
                    <div>
                      <span>{{ codReasoningVisual.mode === 'tot' ? 'Tree Search Canvas' : 'Linear Verification Canvas' }}</span>
                      <strong>{{ codReasoningVisual.modeLabel }}</strong>
                    </div>
                    <div class="cod-router-hero-route">
                      <span>{{ codReasoningVisual.routeLabel }}</span>
                      <strong>{{ codReasoningVisual.fusedScore }}</strong>
                    </div>
                  </div>

                  <div class="cod-router-d3-board" :class="`is-${codReasoningVisual.mode}`">
                    <svg
                      ref="codRoutingGraphSvg"
                      class="cod-router-d3-svg"
                      role="img"
                      :aria-label="codReasoningVisual.mode === 'tot' ? 'Tree-of-Thought reasoning tree' : 'Chain-of-Thought reasoning chain'"
                    ></svg>
                    </div>

                    <div class="cod-router-info-panel">
                      <div class="cod-router-score-strip">
                      <button
                        v-for="score in codReasoningVisual.scoreRows"
                        :key="`global-visual-score-${score.key}`"
                        type="button"
                        class="cod-router-score-chip"
                        :aria-label="`查看 ${score.label} 的计算过程`"
                        @click="openRoutingMetricDetail(score.key)"
                      >
                        <span>{{ score.label }}</span>
                        <strong>{{ score.value }}</strong>
                      </button>
                    </div>

                    <div class="cod-router-role-grid">
                      <div>
                        <span>KG role</span>
                        <strong>{{ codReasoningVisual.kgRole }}</strong>
                      </div>
                      <div>
                        <span>LLM role</span>
                        <strong>{{ codReasoningVisual.llmRole }}</strong>
                      </div>
                    </div>

                    <div class="cod-router-gain-panel">
                      <div class="cod-router-gain-head">
                        <span>Final Answer Gain</span>
                        <strong>{{ codReasoningVisual.answerGainTitle }}</strong>
                        <p>{{ codReasoningVisual.answerGainSummary }}</p>
                      </div>
                      <div class="cod-router-gain-grid">
                        <div
                          v-for="gain in codReasoningVisual.answerGainItems"
                          :key="`global-answer-gain-${gain.label}`"
                        >
                          <span>{{ gain.label }}</span>
                          <strong>{{ gain.impact }}</strong>
                          <p>{{ gain.answerSurface }}</p>
                        </div>
                      </div>
                    </div>

                    <div class="cod-router-rationale">
                      {{ codReasoningVisual.reason || 'Routing trace 已基于 KG 子图结构复杂度、问题语义复杂度和候选路径分支完成记录。' }}
                    </div>
                  </div>

                  <section class="cod-routing-trace-text">
                    <div class="cod-routing-trace-head">
                      <span>Routing Trace</span>
                      <strong>KG 提供路径空间，CoT 验证线性链，ToT 比较多分支</strong>
                    </div>
                    <pre>{{ codReasoningRouteContent }}</pre>
                  </section>
                </div>
              </main>
            </div>
          </section>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="selectedRoutingMetricDetail"
          class="routing-metric-modal-backdrop"
          @click.self="closeRoutingMetricDetail"
        >
          <section class="routing-metric-modal" role="dialog" aria-modal="true">
            <header class="routing-metric-modal-header">
              <div>
                <div class="qa-metric-modal-kicker">Adaptive routing metric</div>
                <h3>{{ selectedRoutingMetricDetail.label }}</h3>
              </div>
              <button class="qa-metric-modal-close" type="button" @click="closeRoutingMetricDetail" aria-label="关闭指标计算详情">
                ×
              </button>
            </header>

            <div class="routing-metric-modal-body">
              <div class="routing-metric-final-band">
                <div>
                  <span>展示值</span>
                  <strong>{{ selectedRoutingMetricDetail.value }}</strong>
                </div>
                <div>
                  <span>指标分组</span>
                  <strong>{{ selectedRoutingMetricDetail.groupLabel }}</strong>
                </div>
                <div>
                  <span>计算来源</span>
                  <strong>{{ selectedRoutingMetricDetail.source }}</strong>
                </div>
              </div>

              <p class="routing-metric-explain">{{ selectedRoutingMetricDetail.description }}</p>
              <div class="routing-metric-formula">{{ selectedRoutingMetricDetail.formula }}</div>

              <div v-if="selectedRoutingMetricDetail.inputs.length" class="routing-metric-section">
                <h4>输入变量</h4>
                <div class="routing-metric-grid">
                  <div
                    v-for="input in selectedRoutingMetricDetail.inputs"
                    :key="`global-routing-input-${input.label}`"
                  >
                    <span>{{ input.label }}</span>
                    <strong>{{ input.value }}</strong>
                  </div>
                </div>
              </div>

              <div v-if="selectedRoutingMetricDetail.rows.length" class="qa-calc-table routing-metric-table">
                <div class="qa-calc-row qa-calc-head">
                  <span>计算项</span>
                  <span>数值</span>
                  <span>权重</span>
                  <span>贡献</span>
                </div>
                <div
                  v-for="row in selectedRoutingMetricDetail.rows"
                  :key="`global-routing-row-${row.label}`"
                  class="qa-calc-row"
                >
                  <span>{{ row.label }}</span>
                  <span>{{ row.value }}</span>
                  <span>{{ row.weight }}</span>
                  <span>{{ row.contribution }}</span>
                </div>
              </div>

              <div v-if="selectedRoutingMetricDetail.notes.length" class="routing-metric-note-panel">
                <p
                  v-for="note in selectedRoutingMetricDetail.notes"
                  :key="`global-routing-note-${note}`"
                >
                  {{ note }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </Teleport>
    </div>

    <!-- Main Split Layout -->
    <div v-else class="main-split-layout">
      <!-- LEFT PANEL: Report Style -->
      <div class="left-panel report-style" ref="leftPanel">
        <div v-if="reportOutline" class="report-content-wrapper">
          <!-- Report Header -->
          <div class="report-header-block">
            <div class="report-meta">
              <span class="report-tag">KG Insight Report</span>
              <span class="report-id">ID: {{ reportId || '等待后端分配' }}</span>
            </div>
            <h1 class="main-title">{{ reportOutline.title }}</h1>
            <p class="sub-title">{{ reportOutline.summary }}</p>
            <div class="header-divider"></div>
          </div>

          <!-- Sections List -->
          <div class="sections-list">
            <div 
              v-for="(section, idx) in reportOutline.sections" 
              :key="idx"
              class="report-section-item"
              :class="{ 
                'is-active': currentSectionIndex === idx + 1,
                'is-completed': isSectionCompleted(idx + 1),
                'is-pending': !isSectionCompleted(idx + 1) && currentSectionIndex !== idx + 1
              }"
            >
              <div class="section-header-row" @click="toggleSectionCollapse(idx)" :class="{ 'clickable': isSectionCompleted(idx + 1) }">
                <span class="section-number">{{ String(idx + 1).padStart(2, '0') }}</span>
                <h3 class="section-title">{{ section.title }}</h3>
                <svg 
                  v-if="isSectionCompleted(idx + 1)" 
                  class="collapse-icon" 
                  :class="{ 'is-collapsed': collapsedSections.has(idx) }"
                  viewBox="0 0 24 24" 
                  width="20" 
                  height="20" 
                  fill="none" 
                  stroke="currentColor" 
                  stroke-width="2"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              
              <div class="section-body" v-show="!collapsedSections.has(idx)">
                <!-- Completed Content -->
                <div v-if="generatedSections[idx + 1]" class="generated-content" v-html="renderMarkdown(generatedSections[idx + 1])"></div>
                
                <!-- Loading State -->
                <div v-else-if="currentSectionIndex === idx + 1" class="loading-state">
                  <div class="loading-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" stroke-width="4" stroke="#E5E7EB"></circle>
                      <path d="M12 2a10 10 0 0 1 10 10" stroke-width="4" stroke="#4B5563" stroke-linecap="round"></path>
                    </svg>
                  </div>
                  <span class="loading-text">正在生成{{ section.title }}...</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Waiting State -->
        <div v-if="!reportOutline" class="waiting-placeholder">
          <div class="waiting-animation">
            <div class="waiting-ring"></div>
            <div class="waiting-ring"></div>
            <div class="waiting-ring"></div>
          </div>
          <span class="waiting-text">Waiting for Report Agent...</span>
        </div>
      </div>

      <!-- RIGHT PANEL: Interaction Interface -->
      <div class="right-panel" ref="rightPanel">
        <!-- Unified Action Bar - Professional Design -->
        <div class="action-bar">
          <div class="action-bar-header">
            <svg class="action-bar-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <div class="action-bar-text">
              <span class="action-bar-title">Interactive Tools</span>
              <span class="action-bar-subtitle mono">{{ profiles.length }} agents available</span>
            </div>
          </div>
          <div class="action-bar-tabs">
            <button 
              class="tab-pill"
              :class="{ active: activeTab === 'chat' && chatTarget === 'report_agent' }"
              @click="selectReportAgentChat"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
              </svg>
              <span>与Report Agent对话</span>
            </button>
            <div class="agent-dropdown" v-if="profiles.length > 0">
              <button 
                class="tab-pill agent-pill"
                :class="{ active: activeTab === 'chat' && chatTarget === 'agent' }"
                @click="toggleAgentDropdown"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>{{ selectedAgent ? selectedAgent.username : '与世界中任意个体对话' }}</span>
                <svg class="dropdown-arrow" :class="{ open: showAgentDropdown }" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div v-if="showAgentDropdown" class="dropdown-menu">
                <div class="dropdown-header">选择对话对象</div>
                <div 
                  v-for="(agent, idx) in profiles" 
                  :key="idx"
                  class="dropdown-item"
                  @click="selectAgent(agent, idx)"
                >
                  <div class="agent-avatar">{{ (agent.username || 'A')[0] }}</div>
                  <div class="agent-info">
                    <span class="agent-name">{{ agent.username }}</span>
                    <span class="agent-role">{{ agent.profession || '未知职业' }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="tab-divider"></div>
            <button
              class="tab-pill cod-pill"
              :class="{ active: activeTab === 'cod' }"
              @click="selectCodTab"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 3H5a2 2 0 0 0-2 2v5"></path>
                <path d="M14 21h5a2 2 0 0 0 2-2v-5"></path>
                <path d="M21 10V5a2 2 0 0 0-2-2h-5"></path>
                <path d="M3 14v5a2 2 0 0 0 2 2h5"></path>
                <path d="M8 12h8"></path>
                <path d="M12 8v8"></path>
              </svg>
              <span>CoD GraphRAG</span>
            </button>
            <button 
              class="tab-pill survey-pill"
              :class="{ active: activeTab === 'survey' }"
              @click="selectSurveyTab"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              <span>发送问卷调查到世界中</span>
            </button>
          </div>
          <div class="project-corner-badge" :title="projectBadgeTitle">
            <span class="project-corner-label">项目</span>
            <span class="project-corner-name">{{ displayProjectName }}</span>
          </div>
        </div>

        <!-- CoD GraphRAG Mode -->
        <div v-if="activeTab === 'cod'" class="cod-container">
          <div class="cod-query-bar">
            <textarea
              v-model="codQuestion"
              class="cod-input"
              placeholder="为什么 SiC 含量会影响 ASC 耐火材料的抗氧化性能？"
              rows="2"
            ></textarea>
            <div class="cod-action-stack">
              <button
                type="button"
                class="cod-feedback-open-btn"
                :class="{ 'has-feedback': qaFeedbackSubmitResult }"
                :disabled="!codResult || isCodQuerying"
                @click="openQaFeedbackModal"
                :title="codResult ? '打开 Expert Eval 原文审阅窗口' : '完成一次 CoD QA 后可评价'"
              >
                Expert Eval
              </button>
              <button
                type="button"
                class="cod-feedback-open-btn cod-llm-judge-open-btn"
                :class="{ 'has-feedback': llmJudgeResult }"
                :disabled="!codResult || isCodQuerying || isRunningLlmJudge"
                @click="runLlmsAsJudge"
                :title="codResult ? '运行 LLM as Judge 自动评价当前 QA' : '完成一次 CoD QA 后可运行 LLM as Judge'"
              >
                <span v-if="isRunningLlmJudge" class="loading-spinner"></span>
                <span v-else>运行 LLM Judge</span>
              </button>
              <button
                class="cod-omd-toggle"
                :class="{ active: omdDeepQueryEnabled }"
                :disabled="isCodQuerying"
                @click="omdDeepQueryEnabled = !omdDeepQueryEnabled"
                title="在保留 CoD 原答案基础上追加 ASC 本体机制信息增益"
              >
                Ontology-aided CoD
              </button>
              <div class="cod-reasoning-mode-toggle" role="group" aria-label="GraphRAG 推理模式">
                <button
                  v-for="mode in codReasoningModes"
                  :key="mode.value"
                  type="button"
                  :class="{ active: codReasoningMode === mode.value }"
                  :disabled="isCodQuerying"
                  :title="mode.title"
                  @click="codReasoningMode = mode.value"
                >
                  {{ mode.label }}
                </button>
              </div>
              <button
                class="cod-llm-toggle"
                :class="{ active: codLlmEnabled }"
                :disabled="isCodQuerying"
                @click="handleCodLlmToggleClick"
                :title="codLlmEnabled ? '关闭 CoD 查询中的 LLM 初步回答和最终融合回答' : '确认后打开 CoD 查询中的 LLM 初步回答和最终融合回答'"
              >
                LLMs：{{ codLlmEnabled ? '开启' : '关闭' }}
              </button>
              <button
                class="cod-submit-btn"
                :disabled="!codQuestion.trim() || isCodQuerying"
                @click="submitCodQuery"
              >
                <span v-if="isCodQuerying" class="loading-spinner"></span>
                <span v-else>运行</span>
              </button>
            </div>
          </div>

          <div
            v-if="codLlmConfirmOpen"
            class="cod-llm-confirm-backdrop"
            @click.self="closeCodLlmConfirm"
          >
            <div class="cod-llm-confirm-modal" role="dialog" aria-modal="true">
              <div class="cod-llm-confirm-header">
                <div>
                  <div class="cod-llm-confirm-kicker">LLM confirmation</div>
                  <h3>确认打开 LLMs？</h3>
                </div>
                <button class="qa-metric-modal-close" type="button" @click="closeCodLlmConfirm" aria-label="关闭">
                  ×
                </button>
              </div>
              <div class="cod-llm-confirm-body">
                <p>
                  打开后，本次之后的 CoD 查询会先调用 LLM 对输入问题生成初步回答，再用 CoD 检索路径、accepted claims 和 OMD 指标进行最终融合；
                  问题分解、语义路由和路径验证默认使用本地规则，避免短时辅助 LLM 超时影响最终回答。
                </p>
                <div class="cod-llm-confirm-grid">
                  <div>
                    <span>Query Decomposition</span>
                    <strong>规则分解</strong>
                  </div>
                  <div>
                    <span>Routing Judge</span>
                    <strong>heuristic semantic score + KG structure score</strong>
                  </div>
                  <div>
                    <span>Path Verification</span>
                    <strong>heuristic evidence check</strong>
                  </div>
                  <div>
                    <span>Final Answer</span>
                    <strong>LLM initial answer + constrained synthesis</strong>
                  </div>
                </div>
                <div class="cod-llm-confirm-actions">
                  <button class="cod-llm-cancel-btn" type="button" @click="closeCodLlmConfirm">
                    取消
                  </button>
                  <button class="cod-llm-confirm-btn" type="button" @click="confirmEnableCodLlms">
                    确认打开 LLMs
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="isCodQuerying || codProgressSteps.length" class="cod-progress-panel">
            <div class="cod-progress-header">
              <div>
                <div class="cod-progress-title">查询过程</div>
                <div class="cod-progress-subtitle">
                  {{ isCodQuerying ? `正在执行 ${omdDeepQueryEnabled ? 'ontology-aided CoD' : 'path-level GraphRAG'} · ${codReasoningModeLabel} routing${codLlmEnabled ? ' · LLMs on' : ' · LLMs off'} · ${codElapsedSeconds}s` : '已完成' }}
                </div>
              </div>
              <div class="cod-progress-percent">{{ codProgressPercent }}%</div>
            </div>
            <div class="cod-progress-track">
              <div class="cod-progress-bar" :style="{ width: `${codProgressPercent}%` }"></div>
            </div>
            <div class="cod-step-list">
              <div
                v-for="step in codProgressSteps"
                :key="step.key"
                class="cod-step-item"
                :class="step.status"
              >
                <div class="cod-step-dot"></div>
                <div class="cod-step-content">
                  <div class="cod-step-row">
                    <span class="cod-step-name">{{ step.label }}</span>
                    <span class="cod-step-time">{{ step.elapsedMs !== null ? formatDurationMs(step.elapsedMs) : step.statusText }}</span>
                  </div>
                  <div class="cod-step-detail">{{ step.detail }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="codResult" class="cod-results">
            <div v-if="codPrimaryAnswerContent" class="cod-section cod-primary-answer-section">
              <div class="cod-primary-answer-header">
                <div>
                  <div class="cod-section-title">回答结果</div>
                  <div class="cod-primary-answer-subtitle">
                    <span>{{ codPrimaryAnswerStatus }}</span>
                    <span v-if="codPrimaryInlineCitationCount" class="cod-inline-citation-status">
                      Citation-aware · {{ codPrimaryInlineCitationCount }} 处行内引用
                    </span>
                  </div>
                </div>
                <button
                  v-if="codDetailItems.length"
                  type="button"
                  class="cod-global-overview-btn"
                  @click="openCodGlobalOverview"
                >
                  全局观览
                </button>
              </div>
              <div
                class="cod-answer cod-primary-answer"
                @click="handleQaMetricClick"
                v-html="renderCodDetailMarkdown(codPrimaryAnswerContent)"
              ></div>
            </div>
            <section
              v-if="codReferences.length"
              id="cod-reference-section"
              class="cod-section cod-reference-section"
              aria-labelledby="cod-reference-title"
            >
              <div class="cod-reference-header">
                <div>
                  <div class="cod-section-title" id="cod-reference-title">References</div>
                  <p>引用元数据与回答正文分离存储；点击引用可查看原文片段、实验条件和空间定位。</p>
                </div>
                <span>{{ codReferences.length }} references</span>
              </div>
              <div class="cod-reference-grid">
                <article
                  v-for="reference in codReferences"
                  :id="`cod-reference-${reference.reference_id}`"
                  :key="reference.reference_id"
                  class="cod-reference-card"
                >
                  <button type="button" class="cod-reference-card-main" @click="openCodReference(reference.reference_id)">
                    <span class="cod-reference-id">[{{ reference.reference_id }}]</span>
                    <span class="cod-reference-card-copy">
                      <strong>{{ reference.source_label || reference.paper_id || reference.evidence_chunk?.chunk_id }}</strong>
                      <small>{{ reference.paper_id || 'paper ID unavailable' }} · {{ reference.evidence_chunk?.chunk_id }}</small>
                    </span>
                    <span class="cod-reference-score">{{ formatReferenceScore(reference.score) }}</span>
                  </button>
                  <blockquote>{{ reference.original_quote }}</blockquote>
                </article>
              </div>
            </section>
            <div v-if="codDetailItems.length" class="cod-section cod-detail-launch-section">
              <div class="cod-detail-launch-header">
                <div class="cod-section-title">结果详情</div>
                <button
                  type="button"
                  class="cod-global-overview-btn"
                  @click="openCodGlobalOverview"
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
                    <path d="M16 3h3a2 2 0 0 1 2 2v3"></path>
                    <path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>
                    <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
                  </svg>
                  <span>全局观览</span>
                </button>
              </div>
              <div class="cod-detail-button-grid">
                <button
                  v-for="item in codDetailItems"
                  :key="item.key"
                  type="button"
                  class="cod-detail-launch-btn"
                  :class="`is-${item.tone}`"
                  @click="openCodDetail(item.key)"
                >
                  <span class="cod-detail-launch-icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14 3h7v7"></path>
                      <path d="M10 14L21 3"></path>
                      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
                    </svg>
                  </span>
                  <span class="cod-detail-launch-text">
                    <strong>{{ item.title }}</strong>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div v-else class="cod-empty-state">
            <div v-if="codQueryError" class="cod-query-error">{{ codQueryError }}</div>
            <span v-else>Path-level GraphRAG</span>
          </div>

          <Teleport to="body">
            <div
              v-if="codGlobalOverviewOpen"
              class="cod-global-overview-backdrop"
            >
              <div class="cod-global-overview-shell" role="dialog" aria-modal="true">
                <div class="cod-global-overview-header">
                  <div class="cod-global-overview-title">
                    <div class="cod-global-overview-kicker">CoD result overview</div>
                    <h3>全局观览</h3>
                  </div>
                  <div class="cod-global-overview-question">
                    <span>查询问题</span>
                    <strong>{{ codResult?.question || codQuestion }}</strong>
                  </div>
                  <button class="qa-metric-modal-close" type="button" @click="closeCodGlobalOverview" aria-label="关闭全局观览">
                    ×
                  </button>
                </div>

                <div class="cod-global-overview-grid">
                  <article
                    v-for="item in codGlobalOverviewItems"
                    :key="`global-${item.key}`"
                    class="cod-global-card"
                    :class="[`is-${item.tone}`, `is-${item.key}`]"
                  >
                    <div class="cod-global-card-header">
                      <div>
                        <div class="cod-global-card-kicker">{{ item.kicker }}</div>
                        <h4>{{ item.title }}</h4>
                      </div>
                    </div>
                    <div v-if="item.type === 'metrics'" class="cod-global-card-body cod-global-metrics-body">
                      <div class="cod-metric-visual-suite is-global">
                        <div class="cod-metric-visual-header">
                          <span>Academic Metric Profile</span>
                          <strong>{{ qaMetricAcademicBand.label }}</strong>
                        </div>
                        <div class="cod-metric-visual-layout">
                          <div class="cod-metric-radar-panel">
                            <svg class="cod-metric-radar" viewBox="0 0 240 240" role="img" aria-label="OMD 专业指标雷达图">
                              <polygon
                                v-for="ring in qaRadarRings"
                                :key="`global-ring-${ring.level}`"
                                class="cod-radar-ring"
                                :points="ring.points"
                              ></polygon>
                              <line
                                v-for="axis in qaRadarAxes"
                                :key="`global-axis-${axis.key}`"
                                class="cod-radar-axis"
                                x1="120"
                                y1="120"
                                :x2="axis.axisX"
                                :y2="axis.axisY"
                              ></line>
                              <polygon class="cod-radar-area" :points="qaRadarPolygonPoints"></polygon>
                              <circle
                                v-for="point in qaRadarPoints"
                                :key="`global-point-${point.key}`"
                                class="cod-radar-point"
                                :cx="point.x"
                                :cy="point.y"
                                r="3"
                              ></circle>
                              <text
                                v-for="axis in qaRadarAxes"
                                :key="`global-label-${axis.key}`"
                                class="cod-radar-label"
                                :x="axis.labelX"
                                :y="axis.labelY"
                                text-anchor="middle"
                              >{{ axis.shortLabel }}</text>
                            </svg>
                          </div>
                          <div class="cod-metric-domain-panel">
                            <div
                              v-for="group in qaMetricDomainGroups"
                              :key="`global-domain-${group.key}`"
                              class="cod-metric-domain-row"
                              :class="`is-${group.tone}`"
                            >
                              <div class="cod-metric-domain-head">
                                <span>{{ group.label }}</span>
                                <strong>{{ formatMetricPercent(group.value) }}</strong>
                              </div>
                              <div class="cod-metric-domain-track">
                                <i :style="{ width: group.width }"></i>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div class="cod-global-metric-grid">
                        <button
                          v-for="metric in qaMetricVisualRows"
                          :key="`global-metric-${metric.key}`"
                          type="button"
                          class="cod-global-metric-chip"
                          :class="`is-${metric.band}`"
                          @click="openQaMetricFromGlobal(metric.key)"
                        >
                          <span>{{ metric.label }}</span>
                          <strong>{{ metric.percent }}</strong>
                        </button>
                      </div>
                    </div>
                    <div v-else-if="item.type === 'router'" class="cod-global-card-body cod-router-card-body">
                      <div class="cod-router-visual" :class="`is-${codReasoningVisual.mode}`">
                        <div class="cod-router-summary">
                          <div>
                            <span>Reasoning Mode</span>
                            <strong>{{ codReasoningVisual.modeLabel }}</strong>
                          </div>
                          <div>
                            <span>Route</span>
                            <strong>{{ codReasoningVisual.routeLabel }}</strong>
                          </div>
                          <div>
                            <span>Complexity</span>
                            <strong>{{ codReasoningVisual.fusedScore }}</strong>
                          </div>
                        </div>

                        <div v-if="codReasoningVisual.mode === 'cot'" class="cod-router-chain">
                          <div
                            v-for="(step, index) in codReasoningVisual.chainSteps"
                            :key="`global-cot-${step.key}`"
                            class="cod-router-chain-step"
                          >
                            <span>{{ index + 1 }}</span>
                            <strong>{{ step.label }}</strong>
                            <small>{{ step.meta }}</small>
                          </div>
                        </div>

                        <div v-else class="cod-router-tree">
                          <div class="cod-router-tree-root">
                            <span>KG Subgraph</span>
                            <strong>{{ codReasoningVisual.rootLabel }}</strong>
                          </div>
                          <div class="cod-router-branches">
                            <div
                              v-for="branch in codReasoningVisual.branches"
                              :key="`global-tot-${branch.key}`"
                              class="cod-router-branch"
                            >
                              <div class="cod-router-branch-head">
                                <span>{{ branch.branchLabel }}</span>
                                <strong>{{ branch.type }}</strong>
                              </div>
                              <p>{{ branch.chain }}</p>
                              <small>{{ branch.meta }}</small>
                            </div>
                          </div>
                        </div>

                        <div class="cod-router-score-row">
                          <button
                            v-for="score in codReasoningVisual.scoreRows"
                            :key="`global-score-${score.key}`"
                            type="button"
                            class="cod-router-score-chip"
                            :aria-label="`查看 ${score.label} 的计算过程`"
                            @click="openRoutingMetricDetail(score.key)"
                          >
                            <span>{{ score.label }}</span>
                            <strong>{{ score.value }}</strong>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div
                      v-else
                      class="cod-answer cod-detail-content cod-global-card-body"
                      :class="{ 'cod-logic-chain': item.key === 'logic-chain' }"
                      @click="handleQaMetricClick"
                    >
                      <div
                        v-if="item.key === 'logic-chain' && codReasoningRoute"
                        class="cod-logic-route-action"
                      >
                        <div>
                          <span>CoT / ToT visualization</span>
                          <strong>查看 Adaptive 推理路由图、结构/语义评分和路径量化指标</strong>
                        </div>
                        <button type="button" @click.stop="openCodRoutingTrace">
                          查看 CoT / ToT 可视化与量化指标
                        </button>
                      </div>
                      <div v-html="renderCodDetailMarkdown(item.content)"></div>
                      <div
                        v-if="item.key === 'cod-direct' && qaMetricCards.length"
                        class="cod-global-inline-metrics"
                      >
                        <div class="cod-global-inline-metrics-head">
                          <div>
                            <span>OMD Quantitative Metrics</span>
                            <strong>量化指标</strong>
                          </div>
                          <button type="button" @click.stop="openQaMetricFromGlobal(qaMetricVisualRows[0]?.key)">
                            查看指标详情
                          </button>
                        </div>
                        <div class="cod-metric-visual-suite is-global is-inline">
                          <div class="cod-metric-visual-header">
                            <span>Academic Metric Profile</span>
                            <strong>{{ qaMetricAcademicBand.label }}</strong>
                          </div>
                          <div class="cod-metric-visual-layout">
                            <div class="cod-metric-radar-panel">
                              <svg class="cod-metric-radar" viewBox="0 0 240 240" role="img" aria-label="OMD 专业指标雷达图">
                                <polygon
                                  v-for="ring in qaRadarRings"
                                  :key="`inline-ring-${ring.level}`"
                                  class="cod-radar-ring"
                                  :points="ring.points"
                                ></polygon>
                                <line
                                  v-for="axis in qaRadarAxes"
                                  :key="`inline-axis-${axis.key}`"
                                  class="cod-radar-axis"
                                  x1="120"
                                  y1="120"
                                  :x2="axis.axisX"
                                  :y2="axis.axisY"
                                ></line>
                                <polygon class="cod-radar-area" :points="qaRadarPolygonPoints"></polygon>
                                <circle
                                  v-for="point in qaRadarPoints"
                                  :key="`inline-point-${point.key}`"
                                  class="cod-radar-point"
                                  :cx="point.x"
                                  :cy="point.y"
                                  r="3"
                                ></circle>
                                <text
                                  v-for="axis in qaRadarAxes"
                                  :key="`inline-label-${axis.key}`"
                                  class="cod-radar-label"
                                  :x="axis.labelX"
                                  :y="axis.labelY"
                                  text-anchor="middle"
                                >{{ axis.shortLabel }}</text>
                              </svg>
                            </div>
                            <div class="cod-metric-domain-panel">
                              <div
                                v-for="group in qaMetricDomainGroups"
                                :key="`inline-domain-${group.key}`"
                                class="cod-metric-domain-row"
                                :class="`is-${group.tone}`"
                              >
                                <div class="cod-metric-domain-head">
                                  <span>{{ group.label }}</span>
                                  <strong>{{ formatMetricPercent(group.value) }}</strong>
                                </div>
                                <div class="cod-metric-domain-track">
                                  <i :style="{ width: group.width }"></i>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="cod-global-metric-grid is-inline">
                          <button
                            v-for="metric in qaMetricVisualRows"
                            :key="`inline-metric-${metric.key}`"
                            type="button"
                            class="cod-global-metric-chip"
                            :class="`is-${metric.band}`"
                            @click.stop="openQaMetricFromGlobal(metric.key)"
                          >
                            <span>{{ metric.label }}</span>
                            <strong>{{ metric.percent }}</strong>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </Teleport>

          <div
            v-if="selectedCodDetail"
            class="cod-detail-modal-backdrop"
            @click.self="closeCodDetail"
          >
            <div
              class="cod-detail-modal"
              :class="`is-${selectedCodDetail.tone}`"
              role="dialog"
              aria-modal="true"
            >
              <div class="cod-detail-modal-header">
                <div>
                  <div class="cod-detail-modal-kicker">{{ selectedCodDetail.kicker }}</div>
                  <h3>{{ selectedCodDetail.title }}</h3>
                </div>
                <button class="qa-metric-modal-close" type="button" @click="closeCodDetail" aria-label="关闭">
                  ×
                </button>
              </div>

              <div class="cod-detail-modal-body">
                <div v-if="selectedCodDetail.type === 'metrics'" class="cod-detail-metric-panel">
                  <div class="cod-metric-visual-suite">
                    <div class="cod-metric-visual-header">
                      <span>Academic Metric Profile</span>
                      <strong>{{ qaMetricAcademicBand.label }}</strong>
                    </div>
                    <div class="cod-metric-visual-layout">
                      <div class="cod-metric-radar-panel">
                        <svg class="cod-metric-radar" viewBox="0 0 240 240" role="img" aria-label="OMD 专业指标雷达图">
                          <polygon
                            v-for="ring in qaRadarRings"
                            :key="`detail-ring-${ring.level}`"
                            class="cod-radar-ring"
                            :points="ring.points"
                          ></polygon>
                          <line
                            v-for="axis in qaRadarAxes"
                            :key="`detail-axis-${axis.key}`"
                            class="cod-radar-axis"
                            x1="120"
                            y1="120"
                            :x2="axis.axisX"
                            :y2="axis.axisY"
                          ></line>
                          <polygon class="cod-radar-area" :points="qaRadarPolygonPoints"></polygon>
                          <circle
                            v-for="point in qaRadarPoints"
                            :key="`detail-point-${point.key}`"
                            class="cod-radar-point"
                            :cx="point.x"
                            :cy="point.y"
                            r="3"
                          ></circle>
                          <text
                            v-for="axis in qaRadarAxes"
                            :key="`detail-label-${axis.key}`"
                            class="cod-radar-label"
                            :x="axis.labelX"
                            :y="axis.labelY"
                            text-anchor="middle"
                          >{{ axis.shortLabel }}</text>
                        </svg>
                      </div>
                      <div class="cod-metric-domain-panel">
                        <div
                          v-for="group in qaMetricDomainGroups"
                          :key="`detail-domain-${group.key}`"
                          class="cod-metric-domain-row"
                          :class="`is-${group.tone}`"
                        >
                          <div class="cod-metric-domain-head">
                            <span>{{ group.label }}</span>
                            <strong>{{ formatMetricPercent(group.value) }}</strong>
                          </div>
                          <div class="cod-metric-domain-track">
                            <i :style="{ width: group.width }"></i>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="cod-metric-visual-note">
                      {{ qaMetricAcademicBand.note }}
                    </div>
                  </div>
                  <div class="cod-qa-metric-grid">
                    <button
                      v-for="metric in qaMetricVisualRows"
                      :key="metric.key"
                      type="button"
                      class="cod-qa-metric-chip"
                      :class="`is-${metric.band}`"
                      @click="openQaMetric(metric.key)"
                    >
                      <span>{{ metric.label }}</span>
                      <strong>{{ metric.percent }}</strong>
                    </button>
                  </div>
                </div>
                <div v-else-if="selectedCodDetail.type === 'router'" class="cod-router-detail-panel">
                  <div class="cod-router-visual is-detail" :class="`is-${codReasoningVisual.mode}`">
                    <div class="cod-router-summary">
                      <div>
                        <span>Reasoning Mode</span>
                        <strong>{{ codReasoningVisual.modeLabel }}</strong>
                      </div>
                      <div>
                        <span>Route</span>
                        <strong>{{ codReasoningVisual.routeLabel }}</strong>
                      </div>
                      <div>
                        <span>Complexity</span>
                        <strong>{{ codReasoningVisual.fusedScore }}</strong>
                      </div>
                    </div>

                    <div v-if="codReasoningVisual.mode === 'cot'" class="cod-router-chain is-detail">
                      <div
                        v-for="(step, index) in codReasoningVisual.chainSteps"
                        :key="`detail-cot-${step.key}`"
                        class="cod-router-chain-step"
                      >
                        <span>{{ index + 1 }}</span>
                        <strong>{{ step.label }}</strong>
                        <small>{{ step.meta }}</small>
                      </div>
                    </div>

                    <div v-else class="cod-router-tree is-detail">
                      <div class="cod-router-tree-root">
                        <span>KG Subgraph</span>
                        <strong>{{ codReasoningVisual.rootLabel }}</strong>
                      </div>
                      <div class="cod-router-branches">
                        <div
                          v-for="branch in codReasoningVisual.branches"
                          :key="`detail-tot-${branch.key}`"
                          class="cod-router-branch"
                        >
                          <div class="cod-router-branch-head">
                            <span>{{ branch.branchLabel }}</span>
                            <strong>{{ branch.type }}</strong>
                          </div>
                          <p>{{ branch.chain }}</p>
                          <small>{{ branch.meta }}</small>
                        </div>
                      </div>
                    </div>

                    <div class="cod-router-score-row">
                      <button
                        v-for="score in codReasoningVisual.scoreRows"
                        :key="`detail-score-${score.key}`"
                        type="button"
                        class="cod-router-score-chip"
                        :aria-label="`查看 ${score.label} 的计算过程`"
                        @click="openRoutingMetricDetail(score.key)"
                      >
                        <span>{{ score.label }}</span>
                        <strong>{{ score.value }}</strong>
                      </button>
                    </div>
                    <div class="cod-router-rationale">
                      {{ codReasoningVisual.reason }}
                    </div>
                  </div>
                </div>
                <div
                  v-else
                  class="cod-answer cod-detail-content"
                  :class="{ 'cod-logic-chain': selectedCodDetail.key === 'logic-chain' }"
                  @click="handleQaMetricClick"
                >
                  <div
                    v-if="selectedCodDetail.key === 'logic-chain' && codReasoningRoute"
                    class="cod-logic-route-action is-modal"
                  >
                    <div>
                      <span>CoT / ToT visualization</span>
                      <strong>打开 Adaptive 推理路由图、结构/语义评分和路径量化指标</strong>
                    </div>
                    <button type="button" @click.stop="openCodRoutingTrace">
                      查看 CoT / ToT 可视化与量化指标
                    </button>
                  </div>
                  <div v-html="renderCodDetailMarkdown(selectedCodDetail.content)"></div>
                </div>
              </div>
            </div>
          </div>

          <Teleport to="body">
            <div
              v-if="codRoutingTraceOpen"
              class="cod-routing-page-backdrop"
              @click.self="closeCodRoutingTrace"
            >
              <section class="cod-routing-page" role="dialog" aria-modal="true">
                <header class="cod-routing-page-header">
                  <div>
                    <div class="cod-routing-page-kicker">CoT / ToT routing trace</div>
                    <h3>Adaptive 推理路由</h3>
                  </div>
                  <div class="cod-routing-page-question">
                    <span>查询问题</span>
                    <strong>{{ codResult?.question || codQuestion }}</strong>
                  </div>
                  <button class="qa-metric-modal-close" type="button" @click="closeCodRoutingTrace" aria-label="关闭推理路由">
                    ×
                  </button>
                </header>

                <div class="cod-routing-page-body">
                  <aside class="cod-routing-page-side">
                    <div class="cod-routing-decision-card">
                      <span>Routing Decision</span>
                      <strong>{{ codReasoningVisual.routeLabel }}</strong>
                      <p>{{ codReasoningVisual.modeLabel }}</p>
                    </div>
                    <div class="cod-routing-score-stack">
                      <button
                        v-for="score in codReasoningVisual.scoreRows"
                        :key="`page-score-${score.key}`"
                        type="button"
                        class="cod-routing-score-card"
                        @click="openRoutingMetricDetail(score.key)"
                      >
                        <span>{{ score.label }}</span>
                        <strong>{{ score.value }}</strong>
                        <small>{{ score.groupLabel }}</small>
                      </button>
                    </div>
                    <div class="cod-routing-academic-panel">
                      <div class="cod-routing-academic-head">
                        <span>Academic complexity profile</span>
                        <strong>{{ codReasoningVisual.academicProfileTitle }}</strong>
                      </div>
                      <svg class="cod-routing-radar" viewBox="0 0 150 150" role="img" aria-label="Adaptive reasoning academic radar">
                        <g class="cod-routing-radar-grid">
                          <polygon points="75,25 118.3,50 118.3,100 75,125 31.7,100 31.7,50" />
                          <polygon points="75,42 103.6,58.5 103.6,91.5 75,108 46.4,91.5 46.4,58.5" />
                          <polygon points="75,59 88.9,67 88.9,83 75,91 61.1,83 61.1,67" />
                        </g>
                        <g>
                          <line
                            v-for="axis in codReasoningVisual.academicRadarAxes"
                            :key="`radar-axis-${axis.key}`"
                            x1="75"
                            y1="75"
                            :x2="axis.axisX"
                            :y2="axis.axisY"
                          />
                        </g>
                        <polygon class="cod-routing-radar-area" :points="codReasoningVisual.academicRadarPolygon" />
                        <circle
                          v-for="axis in codReasoningVisual.academicRadarAxes"
                          :key="`radar-dot-${axis.key}`"
                          :cx="axis.pointX"
                          :cy="axis.pointY"
                          r="3.2"
                        />
                        <text
                          v-for="axis in codReasoningVisual.academicRadarAxes"
                          :key="`radar-label-${axis.key}`"
                          :x="axis.labelX"
                          :y="axis.labelY"
                          text-anchor="middle"
                        >
                          {{ axis.label }}
                        </text>
                      </svg>
                      <div class="cod-routing-academic-bars">
                        <div
                          v-for="bar in codReasoningVisual.academicBars"
                          :key="`academic-bar-${bar.label}`"
                        >
                          <span>{{ bar.label }}</span>
                          <strong>{{ bar.display }}</strong>
                          <em :style="{ width: bar.width }"></em>
                        </div>
                      </div>
                    </div>
                    <div class="cod-routing-flags">
                      <span
                        v-for="flag in codReasoningVisual.semanticFlags"
                        :key="`page-flag-${flag}`"
                      >
                        {{ flag }}
                      </span>
                    </div>
                  </aside>

                  <main class="cod-routing-page-main">
                    <div class="cod-router-visual is-page" :class="`is-${codReasoningVisual.mode}`">
                      <div class="cod-router-hero">
                        <div>
                          <span>{{ codReasoningVisual.mode === 'tot' ? 'Tree Search Canvas' : 'Linear Verification Canvas' }}</span>
                          <strong>{{ codReasoningVisual.modeLabel }}</strong>
                        </div>
                        <div class="cod-router-hero-route">
                          <span>{{ codReasoningVisual.routeLabel }}</span>
                          <strong>{{ codReasoningVisual.fusedScore }}</strong>
                        </div>
                      </div>

                      <div class="cod-router-d3-board" :class="`is-${codReasoningVisual.mode}`">
                        <svg
                          ref="codRoutingGraphSvg"
                          class="cod-router-d3-svg"
                          role="img"
                          :aria-label="codReasoningVisual.mode === 'tot' ? 'Tree-of-Thought reasoning tree' : 'Chain-of-Thought reasoning chain'"
                        ></svg>
                      </div>

                      <div class="cod-router-info-panel">
                        <div class="cod-router-score-strip">
                          <button
                            v-for="score in codReasoningVisual.scoreRows"
                            :key="`visual-score-${score.key}`"
                            type="button"
                            class="cod-router-score-chip"
                            :aria-label="`查看 ${score.label} 的计算过程`"
                            @click="openRoutingMetricDetail(score.key)"
                          >
                            <span>{{ score.label }}</span>
                            <strong>{{ score.value }}</strong>
                          </button>
                        </div>

                        <div class="cod-router-role-grid">
                          <div>
                            <span>KG role</span>
                            <strong>{{ codReasoningVisual.kgRole }}</strong>
                          </div>
                          <div>
                            <span>LLM role</span>
                            <strong>{{ codReasoningVisual.llmRole }}</strong>
                          </div>
                        </div>

                        <div class="cod-router-gain-panel">
                          <div class="cod-router-gain-head">
                            <span>Final Answer Gain</span>
                            <strong>{{ codReasoningVisual.answerGainTitle }}</strong>
                            <p>{{ codReasoningVisual.answerGainSummary }}</p>
                          </div>
                          <div class="cod-router-gain-grid">
                            <div
                              v-for="gain in codReasoningVisual.answerGainItems"
                              :key="`answer-gain-${gain.label}`"
                            >
                              <span>{{ gain.label }}</span>
                              <strong>{{ gain.impact }}</strong>
                              <p>{{ gain.answerSurface }}</p>
                            </div>
                          </div>
                        </div>

                        <div class="cod-router-rationale">
                          {{ codReasoningVisual.reason || 'Routing trace 已基于 KG 子图结构复杂度、问题语义复杂度和候选路径分支完成记录。' }}
                        </div>
                      </div>

                      <section class="cod-routing-trace-text">
                        <div class="cod-routing-trace-head">
                          <span>Routing Trace</span>
                          <strong>KG 提供路径空间，CoT 验证线性链，ToT 比较多分支</strong>
                        </div>
                        <pre>{{ codReasoningRouteContent }}</pre>
                      </section>
                    </div>
                  </main>
                </div>
              </section>
            </div>
          </Teleport>

          <Teleport to="body">
            <div
              v-if="selectedRoutingMetricDetail"
              class="routing-metric-modal-backdrop"
              @click.self="closeRoutingMetricDetail"
            >
              <section class="routing-metric-modal" role="dialog" aria-modal="true">
                <header class="routing-metric-modal-header">
                  <div>
                    <div class="qa-metric-modal-kicker">Adaptive routing metric</div>
                    <h3>{{ selectedRoutingMetricDetail.label }}</h3>
                  </div>
                  <button class="qa-metric-modal-close" type="button" @click="closeRoutingMetricDetail" aria-label="关闭指标计算详情">
                    ×
                  </button>
                </header>

                <div class="routing-metric-modal-body">
                  <div class="routing-metric-final-band">
                    <div>
                      <span>展示值</span>
                      <strong>{{ selectedRoutingMetricDetail.value }}</strong>
                    </div>
                    <div>
                      <span>指标分组</span>
                      <strong>{{ selectedRoutingMetricDetail.groupLabel }}</strong>
                    </div>
                    <div>
                      <span>计算来源</span>
                      <strong>{{ selectedRoutingMetricDetail.source }}</strong>
                    </div>
                  </div>

                  <p class="routing-metric-explain">{{ selectedRoutingMetricDetail.description }}</p>
                  <div class="routing-metric-formula">{{ selectedRoutingMetricDetail.formula }}</div>

                  <div v-if="selectedRoutingMetricDetail.inputs.length" class="routing-metric-section">
                    <h4>输入变量</h4>
                    <div class="routing-metric-grid">
                      <div
                        v-for="input in selectedRoutingMetricDetail.inputs"
                        :key="`routing-input-${input.label}`"
                      >
                        <span>{{ input.label }}</span>
                        <strong>{{ input.value }}</strong>
                      </div>
                    </div>
                  </div>

                  <div v-if="selectedRoutingMetricDetail.rows.length" class="qa-calc-table routing-metric-table">
                    <div class="qa-calc-row qa-calc-head">
                      <span>计算项</span>
                      <span>数值</span>
                      <span>权重</span>
                      <span>贡献</span>
                    </div>
                    <div
                      v-for="row in selectedRoutingMetricDetail.rows"
                      :key="`routing-row-${row.label}`"
                      class="qa-calc-row"
                    >
                      <span>{{ row.label }}</span>
                      <span>{{ row.value }}</span>
                      <span>{{ row.weight }}</span>
                      <span>{{ row.contribution }}</span>
                    </div>
                  </div>

                  <div v-if="selectedRoutingMetricDetail.notes.length" class="routing-metric-note-panel">
                    <p
                      v-for="note in selectedRoutingMetricDetail.notes"
                      :key="`routing-note-${note}`"
                    >
                      {{ note }}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </Teleport>

          <div
            v-if="selectedQaMetricDetail"
            class="qa-metric-modal-backdrop"
            @click.self="closeQaMetricModal"
          >
            <div class="qa-metric-modal" role="dialog" aria-modal="true">
              <div class="qa-metric-modal-header">
                <div>
                  <div class="qa-metric-modal-kicker">OMD quantitative metric</div>
                  <h3>{{ selectedQaMetricDetail.label }}</h3>
                </div>
                <div class="qa-metric-modal-actions">
                  <button
                    v-if="selectedQaMetricStrictTrace"
                    class="qa-metric-professional-btn"
                    type="button"
                    @click="openQaMetricProfessional"
                  >
                    专业版
                  </button>
                  <button class="qa-metric-modal-close" type="button" @click="closeQaMetricModal" aria-label="关闭">
                    ×
                  </button>
                </div>
              </div>

              <div class="qa-metric-modal-body">
                <div class="qa-metric-final-band">
                  <div>
                    <span>最终值</span>
                    <strong>{{ formatMetricPercent(selectedQaMetricDetail.value) }}</strong>
                  </div>
                  <div>
                    <span>线性基础值</span>
                    <strong>{{ formatMetricPercent(selectedQaMetricDetail.baseValue) }}</strong>
                  </div>
                  <div>
                    <span>样本规模</span>
                    <strong>{{ selectedQaMetricDetail.sampleText }}</strong>
                  </div>
                </div>

                <div class="qa-metric-explain">{{ selectedQaMetricDetail.description }}</div>
                <div class="qa-metric-formula">{{ selectedQaMetricDetail.formula }}</div>

                <div class="qa-calc-table">
                  <div class="qa-calc-row qa-calc-head">
                    <span>输入分量</span>
                    <span>数值</span>
                    <span>权重</span>
                    <span>贡献</span>
                  </div>
                  <div
                    v-for="row in selectedQaMetricDetail.rows"
                    :key="row.label"
                    class="qa-calc-row"
                  >
                    <span>{{ row.label }}</span>
                    <span>{{ formatMetricPercent(row.value) }}</span>
                    <span>{{ row.weight !== null ? row.weight.toFixed(2) : '—' }}</span>
                    <span>{{ row.contribution !== null ? formatMetricPercent(row.contribution) : '—' }}</span>
                  </div>
                </div>

                <div v-if="selectedQaMetricDetail.extraRows.length" class="qa-metric-extra">
                  <div
                    v-for="row in selectedQaMetricDetail.extraRows"
                    :key="row.label"
                    class="qa-extra-row"
                  >
                    <span>{{ row.label }}</span>
                    <strong>{{ row.value }}</strong>
                  </div>
                </div>

                <div class="qa-metric-note-panel">
                  {{ selectedQaMetricDetail.note }}
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="selectedQaProfessionalDetail"
            class="qa-professional-modal-backdrop"
            @click.self="closeQaMetricProfessional"
          >
            <div class="qa-professional-modal" role="dialog" aria-modal="true">
              <div class="qa-professional-header">
                <div>
                  <div class="qa-metric-modal-kicker">Strict mathematical derivation</div>
                  <h3>专业版 · {{ selectedQaProfessionalDetail.label }}</h3>
                </div>
                <button class="qa-metric-modal-close" type="button" @click="closeQaMetricProfessional" aria-label="关闭专业版">
                  ×
                </button>
              </div>

              <div class="qa-professional-body">
                <div class="qa-professional-final">
                  <div>
                    <span>最终未舍入</span>
                    <strong>{{ formatStrictNumber(selectedQaProfessionalDetail.final_unrounded) }}</strong>
                  </div>
                  <div>
                    <span>四位小数</span>
                    <strong>{{ formatStrictNumber(selectedQaProfessionalDetail.final_rounded, 4) }}</strong>
                  </div>
                  <div>
                    <span>百分比</span>
                    <strong>{{ selectedQaProfessionalDetail.final_percent }}</strong>
                  </div>
                  <div>
                    <span>归一化</span>
                    <strong>{{ selectedQaProfessionalDetail.normalization }}</strong>
                  </div>
                </div>

                <div class="qa-professional-source">
                  <div
                    v-for="item in strictObjectRows(selectedQaProfessionalDetail.source_counts)"
                    :key="`source-${item.label}`"
                    class="qa-professional-source-item"
                  >
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value }}</strong>
                  </div>
                </div>

                <div class="qa-professional-inputs">
                  <div
                    v-for="item in strictObjectRows(selectedQaProfessionalDetail.inputs)"
                    :key="`input-${item.label}`"
                    class="qa-professional-input"
                  >
                    <span>{{ item.label }}</span>
                    <strong>{{ formatStrictScalar(item.value) }}</strong>
                  </div>
                </div>

                <div class="qa-professional-steps">
                  <article
                    v-for="(step, index) in selectedQaProfessionalDetail.steps"
                    :key="`${step.title}-${index}`"
                    class="qa-professional-step"
                  >
                    <div class="qa-professional-step-header">
                      <div>
                        <span>Step {{ index + 1 }}</span>
                        <h4>{{ step.title }}</h4>
                      </div>
                      <strong>{{ formatStrictNumber(step.result) }}</strong>
                    </div>
                    <div class="qa-professional-operation">{{ strictOperationLabel(step.operation) }}</div>
                    <div class="qa-professional-formula">{{ step.formula }}</div>

                    <div v-if="step.terms?.length" class="qa-professional-term-table">
                      <div class="qa-professional-term-row qa-professional-term-head">
                        <span>符号</span>
                        <span>含义</span>
                        <span>数值</span>
                        <span>权重</span>
                        <span>乘积</span>
                      </div>
                      <div
                        v-for="termItem in step.terms"
                        :key="`${step.title}-${termItem.symbol}-${termItem.label}`"
                        class="qa-professional-term-row"
                      >
                        <span>{{ termItem.symbol }}</span>
                        <span>{{ termItem.label }}</span>
                        <span>{{ formatStrictNumber(termItem.value) }}</span>
                        <span>{{ formatStrictNumber(termItem.weight) }}</span>
                        <span>{{ formatStrictNumber(termItem.product) }}</span>
                      </div>
                    </div>

                    <div
                      v-if="step.parameters || step.intermediates || step.raw_sum !== undefined"
                      class="qa-professional-step-meta"
                    >
                      <div v-if="step.raw_sum !== undefined" class="qa-professional-meta-item">
                        <span>raw_sum</span>
                        <strong>{{ formatStrictNumber(step.raw_sum) }}</strong>
                      </div>
                      <div
                        v-for="item in strictObjectRows(step.parameters)"
                        :key="`${step.title}-param-${item.label}`"
                        class="qa-professional-meta-item"
                      >
                        <span>{{ item.label }}</span>
                        <strong>{{ formatStrictScalar(item.value) }}</strong>
                      </div>
                      <div
                        v-for="item in strictObjectRows(step.intermediates)"
                        :key="`${step.title}-mid-${item.label}`"
                        class="qa-professional-meta-item"
                      >
                        <span>{{ item.label }}</span>
                        <strong>{{ formatStrictScalar(item.value) }}</strong>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chat Mode -->
        <div v-if="activeTab === 'chat'" class="chat-container">

          <!-- Report Agent Tools Card -->
          <div v-if="chatTarget === 'report_agent'" class="report-agent-tools-card">
            <div class="tools-card-header">
              <div class="tools-card-avatar">R</div>
              <div class="tools-card-info">
                <div class="tools-card-name">Report Agent - Chat</div>
                <div class="tools-card-subtitle">报告生成智能体的快速对话版本，可调用 4 种专业工具，拥有NEXUS的完整记忆</div>
              </div>
              <button class="tools-card-toggle" @click="showToolsDetail = !showToolsDetail">
                <svg :class="{ 'is-expanded': showToolsDetail }" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
            <div v-if="showToolsDetail" class="tools-card-body">
              <div class="tools-grid">
                <div class="tool-item tool-purple">
                  <div class="tool-icon-wrapper">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.5V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.5A7 7 0 0 0 12 2z"></path>
                    </svg>
                  </div>
                  <div class="tool-content">
                    <div class="tool-name">InsightForge 深度归因</div>
                    <div class="tool-desc">对齐现实世界种子数据与模拟环境状态，结合Global/Local Memory机制，提供跨时空的深度归因分析</div>
                  </div>
                </div>
                <div class="tool-item tool-blue">
                  <div class="tool-icon-wrapper">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                  </div>
                  <div class="tool-content">
                    <div class="tool-name">PanoramaSearch 全景追踪</div>
                    <div class="tool-desc">基于图结构的广度遍历算法，重构事件传播路径，捕获全量信息流动的拓扑结构</div>
                  </div>
                </div>
                <div class="tool-item tool-orange">
                  <div class="tool-icon-wrapper">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                  </div>
                  <div class="tool-content">
                    <div class="tool-name">QuickSearch 快速检索</div>
                    <div class="tool-desc">基于 GraphRAG 的即时查询接口，优化索引效率，用于快速提取具体的节点属性与离散事实</div>
                  </div>
                </div>
                <div class="tool-item tool-green">
                  <div class="tool-icon-wrapper">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                  </div>
                  <div class="tool-content">
                    <div class="tool-name">InterviewSubAgent 虚拟访谈</div>
                    <div class="tool-desc">自主式访谈，能够并行与模拟世界中个体进行多轮对话，采集非结构化的观点数据与心理状态</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Agent Profile Card -->
          <div v-if="chatTarget === 'agent' && selectedAgent" class="agent-profile-card">
            <div class="profile-card-header">
              <div class="profile-card-avatar">{{ (selectedAgent.username || 'A')[0] }}</div>
              <div class="profile-card-info">
                <div class="profile-card-name">{{ selectedAgent.username }}</div>
                <div class="profile-card-meta">
                  <span v-if="selectedAgent.name" class="profile-card-handle">@{{ selectedAgent.name }}</span>
                  <span class="profile-card-profession">{{ selectedAgent.profession || '未知职业' }}</span>
                </div>
              </div>
              <button class="profile-card-toggle" @click="showFullProfile = !showFullProfile">
                <svg :class="{ 'is-expanded': showFullProfile }" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
            <div v-if="showFullProfile && selectedAgent.bio" class="profile-card-body">
              <div class="profile-card-bio">
                <div class="profile-card-label">简介</div>
                <p>{{ selectedAgent.bio }}</p>
              </div>
            </div>
          </div>

          <div v-if="chatTarget === 'agent' && selectedAgent" class="response-style-hint">
            已启用双版本并排输出：官方版 + 个人心路历程（真心话）
          </div>

          <!-- Chat Messages -->
          <div class="chat-messages" ref="chatMessages">
            <div v-if="chatHistory.length === 0" class="chat-empty">
              <div class="empty-icon">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <p class="empty-text">
                {{ chatTarget === 'report_agent' ? '与 Report Agent 对话，深入了解报告内容' : '与模拟个体对话，了解他们的观点' }}
              </p>
            </div>
            <div 
              v-for="(msg, idx) in chatHistory" 
              :key="idx"
              class="chat-message"
              :class="msg.role"
            >
              <div class="message-avatar">
                <span v-if="msg.role === 'user'">U</span>
                <span v-else>{{ msg.role === 'assistant' && chatTarget === 'report_agent' ? 'R' : (selectedAgent?.username?.[0] || 'A') }}</span>
              </div>
              <div class="message-content">
                <div class="message-header">
                  <span class="sender-name">
                    {{ msg.role === 'user' ? 'You' : (chatTarget === 'report_agent' ? 'Report Agent' : (selectedAgent?.username || 'Agent')) }}
                  </span>
                  <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
                <div v-if="msg.dualVersions" class="message-text dual-message-text">
                  <div class="dual-version-grid">
                    <div class="dual-version-card official">
                      <div class="dual-version-title">官方版</div>
                      <div class="dual-version-content" v-html="renderMarkdown(msg.dualVersions.official || '无响应')"></div>
                    </div>
                    <div class="dual-version-card personal">
                      <div class="dual-version-title">个人心路历程（真心话）</div>
                      <div class="dual-version-content" v-html="renderMarkdown(msg.dualVersions.personal || '无响应')"></div>
                    </div>
                  </div>
                </div>
                <div v-else class="message-text" v-html="renderMarkdown(msg.content)"></div>
              </div>
            </div>
            <div v-if="isSending" class="chat-message assistant">
              <div class="message-avatar">
                <span>{{ chatTarget === 'report_agent' ? 'R' : (selectedAgent?.username?.[0] || 'A') }}</span>
              </div>
              <div class="message-content">
                <div class="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Chat Input -->
          <div class="chat-input-area">
            <textarea 
              v-model="chatInput"
              class="chat-input"
              placeholder="输入您的问题..."
              @keydown.enter.exact.prevent="sendMessage"
              :disabled="isSending || (!selectedAgent && chatTarget === 'agent')"
              rows="1"
              ref="chatInputRef"
            ></textarea>
            <button 
              class="send-btn"
              @click="sendMessage"
              :disabled="!chatInput.trim() || isSending || (!selectedAgent && chatTarget === 'agent')"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>

        <!-- Survey Mode -->
        <div v-if="activeTab === 'survey'" class="survey-container">
          <!-- Survey Setup -->
          <div class="survey-setup">
            <div class="setup-section">
              <div class="section-header">
                <span class="section-title">选择调查对象</span>
                <span class="selection-count">已选 {{ selectedAgents.size }} / {{ profiles.length }}</span>
              </div>
              <div class="agents-grid">
                <label 
                  v-for="(agent, idx) in profiles" 
                  :key="idx"
                  class="agent-checkbox"
                  :class="{ checked: selectedAgents.has(idx) }"
                >
                  <input 
                    type="checkbox" 
                    :checked="selectedAgents.has(idx)"
                    @change="toggleAgentSelection(idx)"
                  >
                  <div class="checkbox-avatar">{{ (agent.username || 'A')[0] }}</div>
                  <div class="checkbox-info">
                    <span class="checkbox-name">{{ agent.username }}</span>
                    <span class="checkbox-role">{{ agent.profession || '未知职业' }}</span>
                  </div>
                  <div class="checkbox-indicator">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                </label>
              </div>
              <div class="selection-actions">
                <button class="action-link" @click="selectAllAgents">全选</button>
                <span class="action-divider">|</span>
                <button class="action-link" @click="clearAgentSelection">清空</button>
              </div>
            </div>

            <div class="setup-section">
              <div class="section-header">
                <span class="section-title">问卷问题</span>
              </div>
              <textarea 
                v-model="surveyQuestion"
                class="survey-input"
                placeholder="输入您想问所有被选中对象的问题..."
                rows="3"
              ></textarea>
            </div>

            <button 
              class="survey-submit-btn"
              :disabled="selectedAgents.size === 0 || !surveyQuestion.trim() || isSurveying"
              @click="submitSurvey"
            >
              <span v-if="isSurveying" class="loading-spinner"></span>
              <span v-else>发送问卷</span>
            </button>
          </div>

          <!-- Survey Results -->
          <div v-if="surveyResults.length > 0" class="survey-results">
            <div class="results-header">
              <span class="results-title">调查结果</span>
              <span class="results-count">{{ surveyResults.length }} 条回复</span>
            </div>
            <div class="results-list">
              <div 
                v-for="(result, idx) in surveyResults" 
                :key="idx"
                class="result-card"
              >
                <div class="result-header">
                  <div class="result-avatar">{{ (result.agent_name || 'A')[0] }}</div>
                  <div class="result-info">
                    <span class="result-name">{{ result.agent_name }}</span>
                    <span class="result-role">{{ result.profession || '未知职业' }}</span>
                  </div>
                </div>
                <div class="result-question">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  <span>{{ result.question }}</span>
                </div>
                <div class="result-answer" v-html="renderMarkdown(result.answer)"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="qaFeedbackModalOpen"
        class="qa-feedback-modal-backdrop"
        @click.self="closeQaFeedbackModal"
      >
        <section class="qa-feedback-modal qa-feedback-review-modal" role="dialog" aria-modal="true" aria-label="Expert Eval">
          <header class="qa-feedback-modal-header">
            <div>
              <span class="qa-feedback-modal-kicker">Sentence-level QA Evaluation</span>
              <h3>Expert Eval</h3>
            </div>
            <div class="qa-feedback-modal-actions">
              <button
                class="qa-feedback-llm-judge-btn"
                type="button"
                :disabled="!codResult || isRunningLlmJudge"
                @click="runLlmsAsJudge"
              >
                <span v-if="isRunningLlmJudge" class="loading-spinner"></span>
                <span v-else>运行 LLM Judge</span>
              </button>
              <button class="qa-metric-modal-close" type="button" @click="closeQaFeedbackModal" aria-label="关闭 Expert Eval">
                ×
              </button>
            </div>
          </header>

          <form class="qa-feedback-form qa-feedback-modal-body" @submit.prevent="submitQaFeedback">
            <div class="qa-feedback-review-layout">
              <main class="qa-feedback-answer-pane">
                <div class="qa-feedback-source-note">
                  <strong>请在左侧 CoD 原文中划选需要标注的句子，再到右侧工具栏选择错误类型。</strong>
                  <span>提交时会结构化保存二分类判断、选中文本、错误类型、备注和两段 CoD 原文来源。</span>
                </div>

                <article
                  v-for="source in qaFeedbackAnswerSources"
                  :key="`qa-feedback-source-${source.key}`"
                  class="qa-feedback-answer-source"
                  :class="`is-${source.tone}`"
                >
                  <header>
                    <span>{{ source.kicker }}</span>
                    <h4>{{ source.title }}</h4>
                  </header>
                  <div
                    class="qa-feedback-answer-text"
                    tabindex="0"
                    @mouseup="captureQaFeedbackSelection($event, source)"
                    @keyup="captureQaFeedbackSelection($event, source)"
                    v-html="renderCodDetailMarkdown(source.content)"
                  ></div>
                </article>
              </main>

              <aside class="qa-feedback-review-sidebar">
                <section class="qa-feedback-sidebar-section">
                  <div class="qa-feedback-sidebar-title">
                    <span>二分类评分</span>
                    <strong>{{ qaFeedbackVerdictLabel }}</strong>
                  </div>
                  <div class="qa-feedback-verdict-toggle" role="group" aria-label="准确性二分类">
                    <button
                      type="button"
                      :class="{ active: qaFeedbackVerdict === 'accurate' }"
                      @click="setQaFeedbackVerdict('accurate')"
                    >
                      准确
                    </button>
                    <button
                      type="button"
                      :class="{ active: qaFeedbackVerdict === 'inaccurate' }"
                      @click="setQaFeedbackVerdict('inaccurate')"
                    >
                      不准确
                    </button>
                  </div>
                </section>

                <section class="qa-feedback-sidebar-section">
                  <div class="qa-feedback-sidebar-title">
                    <span>文本标注工具栏</span>
                    <strong>{{ qaFeedbackAnnotations.length }} 条</strong>
                  </div>
                  <div class="qa-feedback-selected-text">
                    <span>当前选中文本</span>
                    <p>{{ qaFeedbackSelectedText || '先在左侧原文中划选一句话。' }}</p>
                    <small v-if="qaFeedbackSelectedSourceLabel">{{ qaFeedbackSelectedSourceLabel }}</small>
                  </div>
                  <textarea
                    v-model="qaFeedbackAnnotationNote"
                    class="qa-feedback-annotation-note"
                    rows="3"
                    placeholder="可选：给当前选中文本补充一句评审说明"
                  ></textarea>
                  <div class="qa-feedback-annotation-tools">
                    <button
                      v-for="option in qaFeedbackErrorOptions"
                      :key="`qa-feedback-annotation-${option.value}`"
                      type="button"
                      :disabled="!qaFeedbackSelectedText"
                      @click="addQaFeedbackAnnotation(option.value)"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </section>

                <section class="qa-feedback-sidebar-section">
                  <div class="qa-feedback-sidebar-title">
                    <span>已记录标注</span>
                    <strong>{{ qaFeedbackAnnotations.length }}</strong>
                  </div>
                  <div v-if="qaFeedbackAnnotations.length" class="qa-feedback-annotation-list">
                    <article
                      v-for="annotation in qaFeedbackAnnotations"
                      :key="annotation.annotation_id"
                      class="qa-feedback-annotation-item"
                    >
                      <div>
                        <strong>{{ annotation.error_label }}</strong>
                        <button type="button" @click="removeQaFeedbackAnnotation(annotation.annotation_id)">移除</button>
                      </div>
                      <span>{{ annotation.source_label }}</span>
                      <p>{{ annotation.selected_text }}</p>
                      <small v-if="annotation.note">{{ annotation.note }}</small>
                    </article>
                  </div>
                  <p v-else class="qa-feedback-empty-note">暂无句子级标注。</p>
                </section>

                <section class="qa-feedback-sidebar-section">
                  <label class="qa-feedback-field">
                    <span class="qa-feedback-field-label">
                      <span>评判来源</span>
                    </span>
                    <input v-model="qaFeedbackExpertName" type="text" placeholder="领域专家 / reviewer" />
                  </label>
                  <label class="qa-feedback-field">
                    <span class="qa-feedback-field-label">
                      <span>整体修改建议</span>
                      <em v-if="llmJudgeResult">LLM 可预填 · 可编辑</em>
                    </span>
                    <textarea v-model="qaFeedbackCorrection" rows="7" placeholder="按证据链补强、机制链重构、条件窗口、风险边界、实验验证闭环和专业表达修订来记录整体修改建议"></textarea>
                  </label>
                  <label class="qa-feedback-field">
                    <span class="qa-feedback-field-label">
                      <span>完整评审记录</span>
                      <em v-if="llmJudgeResult">LLM 可预填 · 可编辑</em>
                    </span>
                    <textarea v-model="qaFeedbackComments" rows="4" placeholder="记录关键错误、人工判断理由或后续处理建议"></textarea>
                  </label>
                </section>

                <section v-if="isRunningLlmJudge || llmJudgeResult || llmJudgeError" class="qa-feedback-llm-judge-panel">
                  <div v-if="isRunningLlmJudge" class="qa-feedback-llm-judge-result is-running">
                    <strong><span class="loading-spinner"></span> LLM as Judge 正在评判</strong>
                    <span>完成后会预填二分类、整体建议和关键错误；句子级标注仍可由专家补充。</span>
                  </div>
                  <div v-else-if="llmJudgeResult" class="qa-feedback-llm-judge-result">
                    <strong>{{ llmJudgeResult.status === 'applied' ? 'LLM as Judge' : 'Heuristic fallback' }} · {{ llmJudgeResult.overall_score }}/5</strong>
                    <span>{{ llmJudgeResult.written_by || llmJudgeResult.method }}{{ llmJudgeResult.model ? ` · ${llmJudgeResult.model}` : '' }}</span>
                    <p>{{ llmJudgeResult.rationale || llmJudgeResult.comments }}</p>
                  </div>
                  <div v-else class="qa-feedback-error">{{ llmJudgeError }}</div>
                </section>

                <div class="qa-feedback-footer">
                  <div v-if="qaFeedbackSubmitResult" class="qa-feedback-result">
                    <strong>已写入 Feedback Memory</strong>
                    <span>{{ qaFeedbackSubmitResult.feedback_id }} · {{ qaFeedbackSubmitResult.annotation_count || 0 }} 条标注</span>
                  </div>
                  <div v-else-if="qaFeedbackSubmitError" class="qa-feedback-error">{{ qaFeedbackSubmitError }}</div>
                  <button type="submit" class="qa-feedback-submit" :disabled="isSubmittingQaFeedback || !qaFeedbackVerdict">
                    <span v-if="isSubmittingQaFeedback" class="loading-spinner"></span>
                    <span v-else>结构化存储</span>
                  </button>
                </div>
              </aside>
            </div>
          </form>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="selectedCodReference"
        class="cod-reference-modal-backdrop"
        @click.self="closeCodReference"
      >
        <section class="cod-reference-modal" role="dialog" aria-modal="true" aria-labelledby="cod-reference-modal-title">
          <header class="cod-reference-modal-header">
            <div>
              <span>Evidence target · [{{ selectedCodReference.reference_id }}]</span>
              <h3 id="cod-reference-modal-title">{{ selectedCodReference.source_label || 'Reference evidence' }}</h3>
            </div>
            <button type="button" aria-label="关闭引用详情" @click="closeCodReference">×</button>
          </header>
          <div class="cod-reference-modal-body">
            <dl class="cod-reference-metadata-grid">
              <div>
                <dt>Paper ID</dt>
                <dd>{{ selectedCodReference.paper_id || '—' }}</dd>
              </div>
              <div>
                <dt>Evidence Chunk</dt>
                <dd>{{ selectedCodReference.evidence_chunk?.chunk_id || '—' }}</dd>
              </div>
              <div>
                <dt>Markdown</dt>
                <dd>{{ selectedCodReference.markdown_path || '—' }}</dd>
              </div>
              <div>
                <dt>Page / BBox</dt>
                <dd>{{ formatReferenceLocation(selectedCodReference) }}</dd>
              </div>
            </dl>
            <div v-if="referenceConditionEntries(selectedCodReference).length" class="cod-reference-conditions">
              <span>实验条件</span>
              <div>
                <small v-for="entry in referenceConditionEntries(selectedCodReference)" :key="entry.key">
                  {{ entry.key }}: {{ entry.value }}
                </small>
              </div>
            </div>
            <div class="cod-reference-quote">
              <span>论文原文片段</span>
              <blockquote>{{ selectedCodReference.original_quote || selectedCodReference.evidence_chunk?.text }}</blockquote>
            </div>
          </div>
          <footer class="cod-reference-modal-footer">
            <span>{{ selectedCodReference.source }} · confidence {{ formatReferenceScore(selectedCodReference.score) }}</span>
            <button
              v-if="referenceSourceUrl(selectedCodReference)"
              type="button"
              @click="openCodReferenceSource(selectedCodReference)"
            >
              打开原始文献{{ selectedCodReference.page_number ? ` · P${selectedCodReference.page_number}` : '' }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { chatWithReport, getReport, getAgentLog } from '../api/report'
import { interviewAgents, getSimulationProfilesRealtime } from '../api/simulation'
import { codGraphRAGQuery, submitQAFeedback, judgeQAWithLLM } from '../api/graph'
import { getPdfPreviewUrl } from '../api/pdfLibrary'
import { buildApiUrl } from '../api/runtime.js'
import { buildAscDomainTerms, findAscDomainTermMatches } from '../utils/ascDomainHighlighter'

const props = defineProps({
  reportId: String,
  simulationId: String,
  projectName: String,
  projectId: String,
  graphId: String
})

const emit = defineEmits(['add-log', 'update-status'])

// State
const activeTab = ref('chat')
const chatTarget = ref('report_agent')
const showAgentDropdown = ref(false)
const selectedAgent = ref(null)
const selectedAgentIndex = ref(null)
const showFullProfile = ref(true)
const showToolsDetail = ref(true)
const codQuestion = ref('为什么 SiC 含量会影响 ASC 耐火材料的抗氧化性能？')
const codResult = ref(null)
const selectedCodReferenceId = ref(null)
const codReferences = computed(() => Array.isArray(codResult.value?.references) ? codResult.value.references : [])
const selectedCodReference = computed(() => (
  codReferences.value.find(reference => reference.reference_id === selectedCodReferenceId.value) || null
))
const codDomainBaseTerms = computed(() => buildAscDomainTerms({
  question: codQuestion.value,
  result: codResult.value
}))
const codQueryError = ref('')
const isCodQuerying = ref(false)
const omdDeepQueryEnabled = ref(true)
const codLlmEnabled = ref(true)
const codAnswerRefinementEnabled = ref(true)
const codReasoningMode = ref('auto')
const codLlmConfirmOpen = ref(false)
const codProgressSteps = ref([])
const codElapsedSeconds = ref(0)
const selectedQaMetricKey = ref(null)
const selectedRoutingMetricKey = ref(null)
const selectedCodDetailKey = ref(null)
const codGlobalOverviewOpen = ref(false)
const codReportPreviewOpen = ref(false)
const codRoutingTraceOpen = ref(false)
const codRoutingGraphSvg = ref(null)
const qaMetricProfessionalOpen = ref(false)
const qaFeedbackModalOpen = ref(false)
const qaFeedbackScores = ref({
  correctness: 4,
  evidence_grounding: 4,
  domain_relevance: 4,
  overall_quality: 4
})
const qaFeedbackExpertName = ref('')
const qaFeedbackErrorTypes = ref([])
const qaFeedbackCorrection = ref('')
const qaFeedbackComments = ref('')
const qaFeedbackVerdict = ref('')
const qaFeedbackSelectedText = ref('')
const qaFeedbackSelectedSource = ref('')
const qaFeedbackAnnotationNote = ref('')
const qaFeedbackAnnotations = ref([])
const qaFeedbackSubmitResult = ref(null)
const qaFeedbackSubmitError = ref('')
const isSubmittingQaFeedback = ref(false)
const isRunningLlmJudge = ref(false)
const llmJudgeResult = ref(null)
const llmJudgeError = ref('')
let codProgressTimer = null
let codQueryStartedAt = null

const codReasoningModes = [
  {
    value: 'auto',
    label: 'Auto',
    title: '自动融合 KG 子图结构复杂度和语义复杂度，在 CoT 与 ToT 之间路由'
  },
  {
    value: 'cot',
    label: 'CoT',
    title: '沿最佳 KG 路径做线性知识验证'
  },
  {
    value: 'tot',
    label: 'ToT',
    title: '把多个 KG 路径作为 reasoning branches 做多路径探索'
  }
]

const qaFeedbackDimensions = [
  {
    key: 'correctness',
    label: '事实与机制正确性',
    hint: '是否存在因果方向、材料机制、数值或条件判断错误'
  },
  {
    key: 'evidence_grounding',
    label: '证据锚定充分性',
    hint: '结论是否被 KG 路径、原文证据、QA metrics 或实验指标支撑'
  },
  {
    key: 'domain_relevance',
    label: 'ASC 专业相关性',
    hint: '是否聚焦 ASC 配方、物相、显微结构、工艺和性能指标'
  },
  {
    key: 'overall_quality',
    label: '完整性与可执行性',
    hint: '是否覆盖条件窗口、trade-off、验证建议和风险边界'
  }
]

const qaFeedbackScoreValues = [1, 2, 3, 4, 5]

const qaFeedbackErrorOptions = [
  { value: 'retrieval_failure', label: '检索失败' },
  { value: 'knowledge_gap', label: '知识缺失' },
  { value: 'reasoning_error', label: '推理错误' },
  { value: 'evidence_gap', label: '证据不足' },
  { value: 'hallucination', label: '无依据断言' },
  { value: 'incomplete_answer', label: '回答不完整' },
  { value: 'domain_mismatch', label: '领域不匹配' },
  { value: 'prompt_or_style_issue', label: 'Prompt/表达问题' }
]

// Chat State
const chatInput = ref('')
const chatHistory = ref([])
const chatHistoryCache = ref({}) // 缓存所有对话记录: { 'report_agent': [], 'agent_0': [], 'agent_1': [], ... }
const isSending = ref(false)
const chatMessages = ref(null)
const chatInputRef = ref(null)

// Survey State
const selectedAgents = ref(new Set())
const surveyQuestion = ref('')
const surveyResults = ref([])
const isSurveying = ref(false)

// Report Data
const reportOutline = ref(null)
const generatedSections = ref({})
const collapsedSections = ref(new Set())
const currentSectionIndex = ref(null)
const profiles = ref([])

const cleanProjectDisplayValue = (value) => {
  const text = String(value ?? '').trim()
  if (!text || text.toLowerCase() === 'unnamed project') return ''
  return text
}

const displayProjectName = computed(() => {
  return cleanProjectDisplayValue(props.projectName) || cleanProjectDisplayValue(props.projectId) || '项目加载中'
})

const projectBadgeTitle = computed(() => {
  const id = cleanProjectDisplayValue(props.projectId) || '暂未获取'
  return `${displayProjectName.value} · ${id}`
})

const reportDownloadFilename = computed(() => {
  const base = cleanProjectDisplayValue(reportOutline.value?.title) || cleanProjectDisplayValue(displayProjectName.value) || 'KG Insight Report'
  return `${base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_')}.md`
})

const codReasoningModeLabel = computed(() => {
  return codReasoningModes.find(mode => mode.value === codReasoningMode.value)?.label || 'Auto'
})

const qaFeedbackOverallScore = computed(() => {
  const values = qaFeedbackDimensions.map(item => Number(qaFeedbackScores.value[item.key]) || 0)
  if (!values.length) return '0.0'
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
})

const qaFeedbackQualityBandLabel = computed(() => {
  const band = qaFeedbackSubmitResult.value?.quality_band
  if (band === 'high') return '高质量案例'
  if (band === 'medium') return '中等质量样本'
  if (band === 'low') return '低分诊断样本'
  if (llmJudgeResult.value) return llmJudgeResult.value.status === 'applied' ? 'LLM 草稿' : 'Heuristic 草稿'
  return '待提交'
})

const qaFeedbackVerdictLabel = computed(() => {
  if (qaFeedbackVerdict.value === 'accurate') return '准确'
  if (qaFeedbackVerdict.value === 'inaccurate') return '不准确'
  return '待选择'
})

const qaFeedbackSelectedSourceLabel = computed(() => getQaFeedbackSourceLabel(qaFeedbackSelectedSource.value))

// Helper Methods
const isSectionCompleted = (sectionIndex) => {
  return !!generatedSections.value[sectionIndex]
}

// Refs
const leftPanel = ref(null)
const rightPanel = ref(null)

// Methods
const addLog = (msg) => {
  emit('add-log', msg)
}

const resetQaFeedbackState = () => {
  qaFeedbackScores.value = {
    correctness: 4,
    evidence_grounding: 4,
    domain_relevance: 4,
    overall_quality: 4
  }
  qaFeedbackErrorTypes.value = []
  qaFeedbackCorrection.value = ''
  qaFeedbackComments.value = ''
  qaFeedbackVerdict.value = ''
  qaFeedbackSelectedText.value = ''
  qaFeedbackSelectedSource.value = ''
  qaFeedbackAnnotationNote.value = ''
  qaFeedbackAnnotations.value = []
  qaFeedbackSubmitResult.value = null
  qaFeedbackSubmitError.value = ''
  llmJudgeResult.value = null
  llmJudgeError.value = ''
}

const openQaFeedbackModal = () => {
  if (!codResult.value) return
  qaFeedbackModalOpen.value = true
}

const closeQaFeedbackModal = () => {
  qaFeedbackModalOpen.value = false
}

const toggleQaFeedbackError = (value) => {
  const next = new Set(qaFeedbackErrorTypes.value)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  qaFeedbackErrorTypes.value = Array.from(next)
}

const getQaFeedbackSourceLabel = (sourceKey) => {
  if (!sourceKey) return ''
  const source = qaFeedbackAnswerSources.value.find(item => item.key === sourceKey)
  if (!source) return ''
  return `${source.title} / ${source.kicker}`
}

const qaFeedbackScoresFromVerdict = (verdict = qaFeedbackVerdict.value) => {
  const score = verdict === 'accurate' ? 5 : 2
  return {
    correctness: score,
    evidence_grounding: score,
    domain_relevance: score,
    overall_quality: score
  }
}

const setQaFeedbackVerdict = (value) => {
  qaFeedbackVerdict.value = value
  qaFeedbackScores.value = qaFeedbackScoresFromVerdict(value)
}

const captureQaFeedbackSelection = (event, source) => {
  if (typeof window === 'undefined' || !source) return
  const selection = window.getSelection?.()
  const selectedText = String(selection?.toString?.() || '').replace(/\s+/g, ' ').trim()
  if (!selectedText) return
  const container = event?.currentTarget
  if (container && selection?.anchorNode && selection?.focusNode) {
    if (!container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) return
  }
  qaFeedbackSelectedText.value = selectedText.slice(0, 1800)
  qaFeedbackSelectedSource.value = source.key
  qaFeedbackSubmitError.value = ''
}

const syncQaFeedbackErrorTypesFromAnnotations = () => {
  const values = qaFeedbackAnnotations.value.map(item => item.error_type).filter(Boolean)
  qaFeedbackErrorTypes.value = Array.from(new Set(values))
}

const addQaFeedbackAnnotation = (errorType) => {
  const selectedText = qaFeedbackSelectedText.value.trim()
  if (!selectedText) {
    qaFeedbackSubmitError.value = '请先在左侧 CoD 原文中划选一句话，再选择错误类型。'
    return
  }
  const option = qaFeedbackErrorOptions.find(item => item.value === errorType)
  const now = new Date().toISOString()
  qaFeedbackAnnotations.value = [
    ...qaFeedbackAnnotations.value,
    {
      annotation_id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source_key: qaFeedbackSelectedSource.value,
      source_label: getQaFeedbackSourceLabel(qaFeedbackSelectedSource.value),
      selected_text: selectedText,
      error_type: errorType,
      error_label: option?.label || errorType,
      note: qaFeedbackAnnotationNote.value.trim(),
      created_at: now
    }
  ]
  syncQaFeedbackErrorTypesFromAnnotations()
  if (!qaFeedbackVerdict.value) setQaFeedbackVerdict('inaccurate')
  qaFeedbackSelectedText.value = ''
  qaFeedbackSelectedSource.value = ''
  qaFeedbackAnnotationNote.value = ''
  qaFeedbackSubmitError.value = ''
}

const removeQaFeedbackAnnotation = (annotationId) => {
  qaFeedbackAnnotations.value = qaFeedbackAnnotations.value.filter(item => item.annotation_id !== annotationId)
  syncQaFeedbackErrorTypesFromAnnotations()
}

const normalizeJudgeScore = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 4
  return Math.max(1, Math.min(4, Math.round(number)))
}

const formatJudgeWeight = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'N/A'
  return `${Math.round(number * 100)}%`
}

const applyLlmJudgeToFeedback = (judge) => {
  const scores = judge?.scores || {}
  qaFeedbackScores.value = {
    correctness: normalizeJudgeScore(scores.correctness),
    evidence_grounding: normalizeJudgeScore(scores.evidence_grounding),
    domain_relevance: normalizeJudgeScore(scores.domain_relevance),
    overall_quality: normalizeJudgeScore(scores.overall_quality)
  }
  const allowedErrors = new Set(qaFeedbackErrorOptions.map(option => option.value))
  qaFeedbackErrorTypes.value = Array.isArray(judge?.error_types)
    ? judge.error_types.filter(value => allowedErrors.has(value))
    : []
  qaFeedbackCorrection.value = judge?.correction_suggestions || qaFeedbackCorrection.value
  qaFeedbackComments.value = judge?.comments || judge?.rationale || qaFeedbackComments.value
  const overall = Number(judge?.overall_score)
  if (Number.isFinite(overall)) {
    qaFeedbackVerdict.value = overall >= 3.5 ? 'accurate' : 'inaccurate'
  }
  if (!qaFeedbackExpertName.value) {
    qaFeedbackExpertName.value = judge?.written_by || (judge?.status === 'applied' ? 'LLM as Judge' : 'Heuristic judge')
  }
}

const runLlmsAsJudge = async () => {
  if (!codResult.value || isRunningLlmJudge.value) return
  isRunningLlmJudge.value = true
  llmJudgeError.value = ''
  llmJudgeResult.value = null
  qaFeedbackSubmitError.value = ''
  qaFeedbackModalOpen.value = true
  try {
    const finalAnswer = String(codPrimaryAnswerContent.value || codResult.value.final_answer || '').trim()
    const res = await judgeQAWithLLM({
      qa_run_id: codResult.value.qa_run_id,
      question: codResult.value.question || codQuestion.value,
      final_answer: finalAnswer,
      qa_result: codResult.value,
      qa_metrics: codResult.value.qa_quantitative_metrics || {},
      metadata: {
        project_id: props.projectId || '',
        graph_id: props.graphId || '',
        simulation_id: props.simulationId || '',
        report_id: props.reportId || '',
        reasoning_mode: codReasoningMode.value,
        ontology_aided: omdDeepQueryEnabled.value
      }
    })
    llmJudgeResult.value = res.data
    applyLlmJudgeToFeedback(res.data)
    qaFeedbackModalOpen.value = true
    addLog(`LLM as Judge 已完成: ${res.data?.overall_score || 'N/A'}/5 (${res.data?.status || 'unknown'})`)
  } catch (err) {
    llmJudgeError.value = err.message || 'LLM as Judge 评价失败'
    qaFeedbackModalOpen.value = true
    addLog(`LLM as Judge 评价失败: ${err.message}`)
  } finally {
    isRunningLlmJudge.value = false
  }
}

const submitQaFeedback = async () => {
  if (!codResult.value || isSubmittingQaFeedback.value) return
  if (!qaFeedbackVerdict.value) {
    qaFeedbackSubmitError.value = '请先选择“准确”或“不准确”。'
    return
  }
  isSubmittingQaFeedback.value = true
  qaFeedbackSubmitError.value = ''
  try {
    const expertId = typeof localStorage !== 'undefined'
      ? localStorage.getItem('nexus_user_id') || 'local-asc-analyst'
      : 'local-asc-analyst'
    const annotationErrorTypes = qaFeedbackAnnotations.value.map(item => item.error_type).filter(Boolean)
    const feedbackErrorTypes = Array.from(new Set([...qaFeedbackErrorTypes.value, ...annotationErrorTypes]))
    const res = await submitQAFeedback({
      qa_run_id: codResult.value.qa_run_id,
      expert_id: expertId,
      expert_name: qaFeedbackExpertName.value,
      scores: qaFeedbackScoresFromVerdict(),
      error_types: feedbackErrorTypes,
      verdict: qaFeedbackVerdict.value,
      annotations: qaFeedbackAnnotations.value,
      answer_sources: qaFeedbackAnswerSources.value.map(source => ({
        source_key: source.key,
        title: source.title,
        subtitle: source.kicker,
        content: source.content
      })),
      correction_suggestions: qaFeedbackCorrection.value,
      comments: qaFeedbackComments.value,
      question: codResult.value.question || codQuestion.value,
      final_answer: String(codPrimaryAnswerContent.value || codResult.value.final_answer || '').trim(),
      qa_result: codResult.value,
      metadata: {
        project_id: props.projectId || '',
        graph_id: props.graphId || '',
        simulation_id: props.simulationId || '',
        report_id: props.reportId || '',
        reasoning_mode: codReasoningMode.value,
        ontology_aided: omdDeepQueryEnabled.value,
        llm_enabled: codLlmEnabled.value,
        feedback_mode: 'expert_eval_sentence_annotation',
        selected_answer_source_keys: qaFeedbackAnswerSources.value.map(source => source.key)
      }
    })
    qaFeedbackSubmitResult.value = res.data
    addLog(`QA Feedback 已写入 Feedback Memory: ${res.data?.feedback_id || 'N/A'}`)
  } catch (err) {
    qaFeedbackSubmitError.value = err.message || '反馈提交失败'
    addLog(`QA Feedback 提交失败: ${err.message}`)
  } finally {
    isSubmittingQaFeedback.value = false
  }
}

const toggleSectionCollapse = (idx) => {
  if (!generatedSections.value[idx + 1]) return
  const newSet = new Set(collapsedSections.value)
  if (newSet.has(idx)) {
    newSet.delete(idx)
  } else {
    newSet.add(idx)
  }
  collapsedSections.value = newSet
}

const buildKgInsightReportMarkdown = () => {
  const lines = [
    `# ${reportOutline.value?.title || 'KG Insight Report'}`,
    '',
    `- Report ID: ${props.reportId || props.projectId || 'N/A'}`,
    `- Project: ${displayProjectName.value}`,
    `- Exported at: ${new Date().toLocaleString()}`,
  ]
  const summary = String(reportOutline.value?.summary || '').trim()
  if (summary) {
    lines.push('', '## Summary', '', summary)
  }
  const sections = Array.isArray(reportOutline.value?.sections) ? reportOutline.value.sections : []
  sections.forEach((section, index) => {
    const sectionNumber = index + 1
    const title = String(section?.title || `Section ${sectionNumber}`).trim()
    const content = String(generatedSections.value[sectionNumber] || '').trim()
    lines.push('', `## ${sectionNumber}. ${title}`, '')
    lines.push(content || '_This section has not been generated yet._')
  })
  if (codResult.value) {
    lines.push('', '## Global Query Answer', '')
    lines.push(`**Question:** ${codResult.value.question || codQuestion.value}`)
    lines.push('', String(codPrimaryAnswerContent.value || codResult.value.final_answer || '').trim())
    const omdAnswer = String(omdDirectAnswerContent.value || '').trim()
    if (omdAnswer) {
      lines.push('', '### OMD Ontology-aided Direct Answer', '', omdAnswer)
    }
    const logic = String(codResult.value.logic_chain_derivation || '').trim()
    if (logic) {
      lines.push('', '### Detailed Logic Derivation', '', logic)
    }
  }
  return lines.join('\n').trim() + '\n'
}

const kgInsightReportPreviewMarkdown = computed(() => buildKgInsightReportMarkdown())

const openKgInsightPreview = () => {
  codReportPreviewOpen.value = true
}

const closeKgInsightPreview = () => {
  codReportPreviewOpen.value = false
}

const downloadKgInsightReport = () => {
  if (typeof document === 'undefined') return
  const blob = new Blob([buildKgInsightReportMarkdown()], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = reportDownloadFilename.value
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const selectChatTarget = (target) => {
  chatTarget.value = target
  if (target === 'report_agent') {
    showAgentDropdown.value = false
  }
}

// 保存当前对话记录到缓存
const saveChatHistory = () => {
  if (chatHistory.value.length === 0) return
  
  if (chatTarget.value === 'report_agent') {
    chatHistoryCache.value['report_agent'] = [...chatHistory.value]
  } else if (selectedAgentIndex.value !== null) {
    chatHistoryCache.value[`agent_${selectedAgentIndex.value}`] = [...chatHistory.value]
  }
}

const selectReportAgentChat = () => {
  // 保存当前对话记录
  saveChatHistory()
  
  activeTab.value = 'chat'
  chatTarget.value = 'report_agent'
  selectedAgent.value = null
  selectedAgentIndex.value = null
  showAgentDropdown.value = false
  
  // 恢复 Report Agent 的对话记录
  chatHistory.value = chatHistoryCache.value['report_agent'] || []
}

const selectSurveyTab = () => {
  activeTab.value = 'survey'
  selectedAgent.value = null
  selectedAgentIndex.value = null
  showAgentDropdown.value = false
}

const selectCodTab = () => {
  activeTab.value = 'cod'
  selectedAgent.value = null
  selectedAgentIndex.value = null
  showAgentDropdown.value = false
}

const toggleAgentDropdown = () => {
  showAgentDropdown.value = !showAgentDropdown.value
  if (showAgentDropdown.value) {
    activeTab.value = 'chat'
    chatTarget.value = 'agent'
  }
}

const selectAgent = (agent, idx) => {
  // 保存当前对话记录
  saveChatHistory()
  
  selectedAgent.value = agent
  selectedAgentIndex.value = idx
  chatTarget.value = 'agent'
  showAgentDropdown.value = false
  
  // 恢复该 Agent 的对话记录
  chatHistory.value = chatHistoryCache.value[`agent_${idx}`] || []
  addLog(`选择对话对象: ${agent.username}`)
}

const formatTime = (timestamp) => {
  if (!timestamp) return ''
  try {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

const splitMarkdownTableRow = (line) => {
  let value = String(line || '').trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split('|').map(cell => cell.trim())
}

const isMarkdownTableSeparator = (line) => {
  const cells = splitMarkdownTableRow(line)
  return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

const escapeHtmlAttr = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const evidenceStrengthClass = (value) => {
  const text = String(value || '').trim()
  if (text.includes('高')) return 'is-high'
  if (text.includes('中')) return 'is-medium'
  if (text.includes('低')) return 'is-low'
  return 'is-neutral'
}

const renderMarkdownTableCell = (cell, header) => {
  const value = String(cell ?? '').trim()
  if (/证据强度|strength/i.test(String(header || ''))) {
    return `<span class="md-evidence-badge ${evidenceStrengthClass(value)}">${value || '—'}</span>`
  }
  return value || '—'
}

const renderMarkdownTableBlock = (rows) => {
  if (rows.length < 3) return rows.join('\n')
  const headers = splitMarkdownTableRow(rows[0])
  const bodyRows = rows.slice(2).map(splitMarkdownTableRow).filter(row => row.some(Boolean))
  const columnCount = headers.length
  const colgroupHtml = headers.map((_, index) => `<col class="md-col-${index + 1}">`).join('')
  const headerHtml = headers.map(header => `<th scope="col">${header}</th>`).join('')
  const bodyHtml = bodyRows
    .map(row => {
      const cells = headers.map((header, index) => {
        const label = escapeHtmlAttr(header)
        return `<td data-label="${label}">${renderMarkdownTableCell(row[index], header)}</td>`
      }).join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
  return `<div class="md-table-wrap"><div class="md-table-scroll"><table class="md-table col-count-${columnCount}"><colgroup>${colgroupHtml}</colgroup><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div></div>`
}

const renderMarkdownTables = (content) => {
  const lines = String(content || '').split('\n')
  const output = []
  let i = 0

  while (i < lines.length) {
    if (i + 1 < lines.length && lines[i].includes('|') && isMarkdownTableSeparator(lines[i + 1])) {
      const tableRows = [lines[i], lines[i + 1]]
      i += 2
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        tableRows.push(lines[i])
        i++
      }
      output.push(renderMarkdownTableBlock(tableRows))
      continue
    }
    output.push(lines[i])
    i++
  }

  return output.join('\n')
}

const chainLabelPattern = /^(\s*(?:[-*+]\s*)?)(正向机制链|反向风险链|条件约束链|实验验证链|验证链|机制链|风险链)([：:])\s*(.*)$/

const cleanChainSegment = (line) => {
  return String(line || '')
    .trim()
    .replace(/^(?:[-*+]\s*)?(?:→|->)\s*/, '')
    .replace(/\s*(?:->|→)\s*/g, ' → ')
    .replace(/[。；;]\s*$/, '')
    .trim()
}

const isChainContinuationLine = (line, hasSegment) => {
  const text = String(line || '').trim()
  if (!text) return false
  if (chainLabelPattern.test(text)) return false
  if (text.startsWith('|')) return false
  if (/^#{1,6}\s+/.test(text)) return false
  if (/^(?:[-*+]\s+)?(?:→|->)\s*/.test(text)) return true
  if (!hasSegment) {
    if (/^(?:[-*+]\s+)/.test(text)) return false
    if (/^[^：:]{1,24}[：:]\s*/.test(text)) return false
    return true
  }
  return false
}

const normalizeMarkdownChainBlocks = (content) => {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n')
  const output = []
  let i = 0

  while (i < lines.length) {
    const match = lines[i].match(chainLabelPattern)
    if (!match) {
      output.push(lines[i])
      i++
      continue
    }

    const [, prefix, label, mark, rest] = match
    const segments = []
    const firstSegment = cleanChainSegment(rest)
    if (firstSegment) segments.push(firstSegment)

    let j = i + 1
    while (j < lines.length && segments.length < 16 && isChainContinuationLine(lines[j], segments.length > 0)) {
      const segment = cleanChainSegment(lines[j])
      if (segment) segments.push(segment)
      j++
    }

    if (segments.length) {
      output.push(`${prefix}${label}${mark}${segments.join(' → ')}`)
      i = j
      continue
    }

    output.push(lines[i])
    i++
  }

  return output.join('\n')
}

const renderMarkdownHeading = (tag, className, text, anchor) => {
  const idAttr = anchor ? ` id="${anchor}"` : ''
  return `<${tag} class="${className}"${idAttr}>${text}</${tag}>`
}

const renderMarkdown = (content) => {
  if (!content) return ''
  
  let processedContent = String(content).replace(/^##\s+.+\n+/, '')
  processedContent = normalizeMarkdownChainBlocks(processedContent)
  processedContent = renderMarkdownTables(processedContent)
  let html = processedContent.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  // Raw <c> anchors stay out of prose; users see only a compact, clickable citation ID.
  html = html.replace(/<c>\s*(R\d+)\s*<\/c>/gi, (match, referenceId) => (
    `<button type="button" class="cod-reference-anchor" data-reference-id="${escapeHtmlAttr(referenceId.toUpperCase())}" aria-label="查看引用 ${escapeHtmlAttr(referenceId.toUpperCase())}">[${referenceId.toUpperCase()}]</button>`
  ))
  // KG 探索发掘出的新知识/新经验。文献原文证据不应使用该标记。
  html = html.replace(/==KG_DISCOVERY:([\s\S]*?)==/g, '<span class="kg-discovery-insight">$1</span>')
  html = html.replace(/<kg-discovery>([\s\S]*?)<\/kg-discovery>/g, '<span class="kg-discovery-insight">$1</span>')
  html = html.replace(/\[([^\]]+)\]\(#([A-Za-z0-9_-]+)\)/g, '<a class="md-link" href="#$2">$1</a>')
  html = html.replace(/^####\s+(.+?)(?:\s*\{#([A-Za-z0-9_-]+)\})?\s*$/gm, (match, text, anchor) => renderMarkdownHeading('h5', 'md-h5', text, anchor))
  html = html.replace(/^###\s+(.+?)(?:\s*\{#([A-Za-z0-9_-]+)\})?\s*$/gm, (match, text, anchor) => renderMarkdownHeading('h4', 'md-h4', text, anchor))
  html = html.replace(/^##\s+(.+?)(?:\s*\{#([A-Za-z0-9_-]+)\})?\s*$/gm, (match, text, anchor) => renderMarkdownHeading('h3', 'md-h3', text, anchor))
  html = html.replace(/^#\s+(.+?)(?:\s*\{#([A-Za-z0-9_-]+)\})?\s*$/gm, (match, text, anchor) => renderMarkdownHeading('h2', 'md-h2', text, anchor))
  html = html.replace(/^> (.+)$/gm, '<blockquote class="md-quote">$1</blockquote>')
  
  // 处理列表 - 支持子列表
  html = html.replace(/^(\s*)- (.+)$/gm, (match, indent, text) => {
    const level = Math.floor(indent.length / 2)
    return `<li class="md-li" data-level="${level}">${text}</li>`
  })
  html = html.replace(/^(\s*)(\d+)\. (.+)$/gm, (match, indent, num, text) => {
    const level = Math.floor(indent.length / 2)
    return `<li class="md-oli" data-level="${level}">${text}</li>`
  })
  
  // 包装无序列表
  html = html.replace(/(<li class="md-li"[^>]*>.*?<\/li>\s*)+/g, '<ul class="md-ul">$&</ul>')
  // 包装有序列表
  html = html.replace(/(<li class="md-oli"[^>]*>.*?<\/li>\s*)+/g, '<ol class="md-ol">$&</ol>')
  
  // 清理列表项之间的所有空白
  html = html.replace(/<\/li>\s+<li/g, '</li><li')
  // 清理列表开始标签后的空白
  html = html.replace(/<ul class="md-ul">\s+/g, '<ul class="md-ul">')
  html = html.replace(/<ol class="md-ol">\s+/g, '<ol class="md-ol">')
  // 清理列表结束标签前的空白
  html = html.replace(/\s+<\/ul>/g, '</ul>')
  html = html.replace(/\s+<\/ol>/g, '</ol>')
  
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/_(.+?)_/g, '<em>$1</em>')
  html = html.replace(/^---$/gm, '<hr class="md-hr">')
  html = html.replace(/\n\n/g, '</p><p class="md-p">')
  html = html.replace(/\n/g, '<br>')
  html = '<p class="md-p">' + html + '</p>'
  html = html.replace(/<p class="md-p"><\/p>/g, '')
  html = html.replace(/<p class="md-p">(<h[2-5])/g, '$1')
  html = html.replace(/(<\/h[2-5]>)<\/p>/g, '$1')
  html = html.replace(/<p class="md-p">(<ul|<ol|<blockquote|<pre|<hr|<div)/g, '$1')
  html = html.replace(/(<\/ul>|<\/ol>|<\/blockquote>|<\/pre>|<\/div>)<\/p>/g, '$1')
  // 清理块级元素前后的 <br> 标签
  html = html.replace(/<br>\s*(<ul|<ol|<blockquote|<div)/g, '$1')
  html = html.replace(/(<\/ul>|<\/ol>|<\/blockquote>|<\/div>)\s*<br>/g, '$1')
  // 清理 <p><br> 紧跟块级元素的情况（多余空行导致）
  html = html.replace(/<p class="md-p">(<br>\s*)+(<ul|<ol|<blockquote|<pre|<hr|<div)/g, '$2')
  // 清理连续的 <br> 标签
  html = html.replace(/(<br>\s*){2,}/g, '<br>')
  // 清理块级元素后紧跟的段落开始标签前的 <br>
  html = html.replace(/(<\/ol>|<\/ul>|<\/blockquote>|<\/div>)<br>(<p|<div|<h[2-5])/g, '$1$2')

  // 修复非连续有序列表的编号：当单项 <ol> 被段落内容隔开时，保持编号递增
  const tokens = html.split(/(<ol class="md-ol">(?:<li class="md-oli"[^>]*>[\s\S]*?<\/li>)+<\/ol>)/g)
  let olCounter = 0
  let inSequence = false
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].startsWith('<ol class="md-ol">')) {
      const liCount = (tokens[i].match(/<li class="md-oli"/g) || []).length
      if (liCount === 1) {
        olCounter++
        if (olCounter > 1) {
          tokens[i] = tokens[i].replace('<ol class="md-ol">', `<ol class="md-ol" start="${olCounter}">`)
        }
        inSequence = true
      } else {
        olCounter = 0
        inSequence = false
      }
    } else if (inSequence) {
      if (/<h[2-5]/.test(tokens[i])) {
        olCounter = 0
        inSequence = false
      }
    }
  }
  html = tokens.join('')

  return html
}

const codChainPattern = /([^\n，。；;|<>]*?(?:-->|->|→)\s*[^\n，。；;|<>]+(?:\s*(?:-->|->|→)\s*[^\n，。；;|<>]+)*)/g

const shouldSkipCodEnhancement = (node) => {
  let current = node.parentElement
  while (current) {
    if (['CODE', 'PRE', 'A', 'BUTTON', 'STRONG', 'U', 'EM', 'SCRIPT', 'STYLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(current.tagName)) return true
    current = current.parentElement
  }
  return false
}

const mergeCodDomainTerms = (baseTerms, contentTerms) => {
  const merged = new Map()
  ;[...(baseTerms || []), ...(contentTerms || [])].forEach(entry => {
    const key = String(entry?.term || '').toLocaleLowerCase('zh-CN')
    if (!key) return
    const previous = merged.get(key)
    if (!previous || Number(entry.weight || 0) > Number(previous.weight || 0)) merged.set(key, entry)
  })
  return [...merged.values()]
}

const appendDomainEnhancedNodes = (fragment, text, doc, domainTerms) => {
  if (!text) return
  let cursor = 0
  const matches = findAscDomainTermMatches(text, domainTerms, {
    maxMatches: Math.max(3, Math.min(8, Math.ceil(String(text).length / 90))),
    maxPerSentence: 3
  })
  matches.forEach(match => {
    if (match.start > cursor) fragment.appendChild(doc.createTextNode(text.slice(cursor, match.start)))
    const strong = doc.createElement('strong')
    strong.className = `cod-domain-term is-${match.category}`
    strong.dataset.domainCategory = match.category
    strong.dataset.domainSource = match.source || 'asc_domain'
    strong.title = `${match.categoryLabel || 'ASC专业术语'} · ${match.source === 'kg_entity' ? 'KG实体' : match.source === 'ontology_role' ? '本体角色' : '领域语义匹配'}`
    const underline = doc.createElement('u')
    underline.textContent = match.text
    strong.appendChild(underline)
    fragment.appendChild(strong)
    cursor = match.end
  })
  if (cursor < text.length) {
    fragment.appendChild(doc.createTextNode(text.slice(cursor)))
  }
}

const buildCodEnhancedFragment = (text, doc, domainTerms) => {
  const fragment = doc.createDocumentFragment()
  let cursor = 0
  String(text).replace(codChainPattern, (match, chainText, offset) => {
    const trimmed = String(chainText || '').trim()
    if (!trimmed || !/(?:-->|->|→)/.test(trimmed)) return match
    if (offset > cursor) {
      appendDomainEnhancedNodes(fragment, text.slice(cursor, offset), doc, domainTerms)
    }
    const prefixLength = String(chainText).length - String(chainText).trimStart().length
    const suffixLength = String(chainText).length - String(chainText).trimEnd().length
    if (prefixLength) {
      appendDomainEnhancedNodes(fragment, String(chainText).slice(0, prefixLength), doc, domainTerms)
    }
    const chain = doc.createElement('span')
    chain.className = 'cod-chain-highlight'
    appendDomainEnhancedNodes(chain, trimmed, doc, domainTerms)
    fragment.appendChild(chain)
    if (suffixLength) {
      appendDomainEnhancedNodes(fragment, String(chainText).slice(String(chainText).length - suffixLength), doc, domainTerms)
    }
    cursor = offset + match.length
    return match
  })
  if (cursor < text.length) {
    appendDomainEnhancedNodes(fragment, text.slice(cursor), doc, domainTerms)
  }
  return fragment
}

const enhanceCodDetailHtml = (html) => {
  if (typeof document === 'undefined' || !html) return html
  const wrapper = document.createElement('div')
  wrapper.innerHTML = String(html)
  const referenceMap = new Map(codReferences.value.map(reference => [reference.reference_id, reference]))
  wrapper.querySelectorAll('.cod-reference-anchor').forEach(anchor => {
    const referenceId = String(anchor.dataset?.referenceId || '').toUpperCase()
    const reference = referenceMap.get(referenceId)
    if (!reference) return
    const source = reference.source_label || reference.paper_id || reference.evidence_chunk?.chunk_id || referenceId
    const quote = String(reference.original_quote || reference.evidence_chunk?.text || '').replace(/\s+/g, ' ').trim()
    anchor.title = `[${referenceId}] ${source}${quote ? `\n${quote.slice(0, 220)}` : ''}`
  })
  const contentTerms = buildAscDomainTerms({ content: wrapper.textContent || '' })
  const domainTerms = mergeCodDomainTerms(codDomainBaseTerms.value, contentTerms)
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT)
  const textNodes = []
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (!node.nodeValue?.trim() || shouldSkipCodEnhancement(node)) continue
    textNodes.push(node)
  }
  textNodes.forEach(node => {
    node.replaceWith(buildCodEnhancedFragment(node.nodeValue, document, domainTerms))
  })
  return wrapper.innerHTML
}

const renderCodDetailMarkdown = (content) => enhanceCodDetailHtml(renderMarkdown(content))

const formatReferenceScore = (score) => `${Math.round(Math.max(0, Math.min(1, Number(score) || 0)) * 100)}%`

const referenceConditionEntries = (reference) => Object.entries(reference?.experiment_conditions || {}).map(([key, value]) => ({
  key,
  value: Array.isArray(value) ? value.join('、') : (value && typeof value === 'object' ? JSON.stringify(value) : String(value))
}))

const formatReferenceLocation = (reference) => {
  const parts = []
  if (reference?.page_number !== null && reference?.page_number !== undefined) parts.push(`P${reference.page_number}`)
  if (Array.isArray(reference?.bbox) && reference.bbox.length >= 4) {
    parts.push(`bbox(${reference.bbox.slice(0, 4).map(value => Number(value).toFixed(1)).join(', ')})`)
  }
  if (!parts.length && reference?.spatial_metadata?.section_anchor) parts.push(reference.spatial_metadata.section_anchor)
  if (!parts.length && reference?.spatial_metadata?.section) parts.push(reference.spatial_metadata.section)
  return parts.join(' · ') || '—'
}

const referenceSourceUrl = (reference) => {
  if (!reference) return ''
  let url = ''
  if (reference.source_file_id) {
    url = getPdfPreviewUrl(reference.source_file_id)
  } else {
    const deepLink = String(reference.deep_link || '').trim()
    if (/^https?:\/\//i.test(deepLink)) {
      url = deepLink
    } else if (deepLink.startsWith('/')) {
      url = buildApiUrl(deepLink)
    }
  }
  if (!url) return ''
  if (reference.page_number !== null && reference.page_number !== undefined && !/#page=/i.test(url)) {
    url += `${url.includes('#') ? '&' : '#'}page=${encodeURIComponent(reference.page_number)}`
  }
  return url
}

const openCodReference = (referenceId) => {
  if (!codReferences.value.some(reference => reference.reference_id === referenceId)) return
  selectedCodReferenceId.value = referenceId
}

const closeCodReference = () => {
  selectedCodReferenceId.value = null
}

const openCodReferenceSource = (reference) => {
  const url = referenceSourceUrl(reference)
  if (!url || typeof window === 'undefined') return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const escapeReferenceMarkdown = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/([*_`|])/g, '\\$1')
  .replace(/\s+/g, ' ')
  .trim()

const codReferenceMarkdown = computed(() => codReferences.value.map(reference => {
  const label = escapeReferenceMarkdown(reference.source_label || reference.paper_id || reference.evidence_chunk?.chunk_id || reference.reference_id)
  const paperId = escapeReferenceMarkdown(reference.paper_id || '—')
  const chunkId = escapeReferenceMarkdown(reference.evidence_chunk?.chunk_id || '—')
  const location = escapeReferenceMarkdown(formatReferenceLocation(reference))
  const quote = escapeReferenceMarkdown(reference.original_quote || reference.evidence_chunk?.text || '—')
  return [
    `### [${reference.reference_id}] ${label}`,
    `**Paper ID:** ${paperId} · **Evidence Chunk:** ${chunkId} · **Location:** ${location}`,
    `> ${quote}`,
    `<button type="button" class="cod-reference-anchor cod-reference-detail-action" data-reference-id="${reference.reference_id}">查看证据详情</button>`
  ].join('\n\n')
}).join('\n\n---\n\n'))

const qaMetricDefinitions = {
  confidence: {
    label: '置信度',
    valueKey: 'confidence_score',
    description: '综合路径有效性、证据强度、条件完整性、问题相关性、社区支持、风险控制、本体对齐和支持上下文得到的回答可信度。',
    formula: '0.18×路径有效性 + 0.17×证据强度 + 0.15×条件完整性 + 0.13×问题相关性 + 0.12×社区支持 + 0.10×风险控制 + 0.08×本体对齐 + 0.07×支持上下文'
  },
  relevance: {
    label: '问题相关性',
    valueKey: 'relevance_score',
    description: '衡量命中实体、目标对象、路径模板、社区语义和条件细节与用户问题的贴合度。',
    formula: '0.23×实体密度 + 0.18×目标对象覆盖 + 0.15×路径模板覆盖 + 0.13×语义抽象度 + 0.11×社区支持 + 0.10×计划特异性 + 0.06×路径多样性 + 0.04×条件细节'
  },
  accuracy: {
    label: '准确性估计',
    valueKey: 'accuracy_estimate',
    description: '由 KG 路径、证据、条件完整性、本体对齐和冲突风险推导的 QA 可信准确性估计，不等同于实验实测准确率。',
    formula: '0.24×置信度 + 0.18×证据强度 + 0.16×条件完整性 + 0.14×路径有效性 + 0.11×风险控制 + 0.09×本体对齐 + 0.08×分数离散控制'
  },
  'llms-as-judge': {
    label: 'LLM as Judge',
    valueKey: 'llms_as_judge_score',
    description: '读取 CoD adaptive routing 中由 LLM 或启发式 judge 生成的 semantic reasoning judge，用于说明当前问题是否需要多跳、竞争解释或假设探索。',
    formula: 'JudgeScore = reasoning_route.semantic_score；LLM 可用时来自 LLM as Judge，关闭或不可用时使用 heuristic fallback'
  },
  'path-validity': {
    label: '路径有效性',
    valueKey: 'path_validity_score',
    description: '衡量 CoD/KG 机制路径在节点类型、关系方向、路径复杂度、多样性和缺失压力上的合法性。',
    formula: '0.52×平均路径有效性 + 0.13×Top3 路径有效性 + 0.10×路径复杂度 + 0.08×路径多样性 + 0.07×计划特异性 + 0.06×路径支持 + 0.04×低缺失压力'
  },
  'evidence-strength': {
    label: '证据强度',
    valueKey: 'evidence_strength_score',
    description: '衡量路径证据、证据细节、社区广度和分数稳定性形成的证据支撑强度。',
    formula: '0.46×平均证据充分性 + 0.15×Top3 证据充分性 + 0.18×证据细节 + 0.08×社区广度 + 0.07×路径支持 + 0.06×分数离散控制'
  },
  'condition-completeness': {
    label: '条件完整性',
    valueKey: 'condition_completeness_score',
    description: '衡量温度、气氛、组成范围、路径条件和证据条件是否足以支撑回答。',
    formula: '0.48×平均条件匹配 + 0.16×Top3 条件匹配 + 0.14×条件细节 + 0.09×计划特异性 + 0.07×路径一致性 + 0.06×证据细节'
  },
  'evidence-coverage': {
    label: '证据覆盖',
    valueKey: 'evidence_coverage_score',
    description: '衡量证据是否覆盖足够多的路径、社区、条件和关键机制维度。',
    formula: '0.27×路径支持 + 0.26×证据强度 + 0.17×条件完整性 + 0.12×社区支持 + 0.10×证据细节 + 0.08×路径多样性'
  },
  'ontology-alignment': {
    label: '本体对齐',
    valueKey: 'ontology_alignment_score',
    description: '衡量实体、关系、路径模板、语义抽象度、路径多样性和低冲突状态与 ASC 本体的匹配程度。',
    formula: '0.25×路径有效性 + 0.18×实体密度 + 0.14×路径模板覆盖 + 0.12×语义抽象度 + 0.11×计划特异性 + 0.08×路径多样性 + 0.07×分数离散控制 + 0.05×低冲突风险'
  },
  'risk-control': {
    label: '风险控制',
    valueKey: 'risk_control_score',
    description: '正向风险指标，数值越高表示反例、trade-off、条件冲突和分数波动被控制得越好。',
    formula: '0.35×低冲突风险 + 0.18×本体对齐 + 0.13×条件完整性 + 0.11×证据强度 + 0.09×路径一致性 + 0.07×社区支持 + 0.07×分数离散控制'
  },
  'exploration-value': {
    label: '探索价值',
    valueKey: 'exploration_value_score',
    description: '衡量该回答作为后续实验设计、知识图谱扩展和新假设探索线索的价值。',
    formula: '0.24×路径新颖性 + 0.18×语义抽象度 + 0.17×问题相关性 + 0.13×社区支持 + 0.10×风险控制 + 0.08×机会密度 + 0.06×计划特异性 + 0.04×候选新颖性'
  }
}

const qaMetricCards = computed(() => {
  const metrics = codResult.value?.qa_quantitative_metrics
  if (!metrics) return []
  return Object.entries(qaMetricDefinitions)
    .filter(([, definition]) => metrics[definition.valueKey] !== undefined)
    .map(([key, definition]) => ({
      key,
      label: definition.label,
      value: metrics[definition.valueKey]
    }))
})

const createHtmlFragment = (content) => {
  if (typeof document === 'undefined') return null
  const wrapper = document.createElement('div')
  wrapper.innerHTML = String(content || '')
  return wrapper
}

const extractDirectAnswerBlockContent = (content, selector) => {
  const wrapper = createHtmlFragment(content)
  if (!wrapper) return ''
  const block = wrapper.querySelector(selector)
  if (!block) return ''
  const clone = block.cloneNode(true)
  clone.querySelectorAll('.direct-answer-block-title').forEach(title => title.remove())
  return clone.innerHTML.trim()
}

const removeDirectAnswerBlocks = (content, selectors) => {
  const wrapper = createHtmlFragment(content)
  if (!wrapper) return String(content || '').trim()
  wrapper.querySelectorAll(selectors.join(',')).forEach(block => block.remove())
  return wrapper.innerHTML.trim()
}

const stripInlineCitationAnchors = (content) => String(content || '')
  .replace(/<c>\s*R\d+\s*<\/c>/gi, '')
  .trim()

const codDirectAnswerRaw = computed(() => {
  return String(codResult.value?.cod_direct_answer || codResult.value?.final_answer || '').trim()
})

const codDirectAnswerContent = computed(() => {
  const raw = codDirectAnswerRaw.value
  if (!raw) return ''
  const codBlock = extractDirectAnswerBlockContent(raw, '.cod-direct-answer-block')
  if (codBlock) return stripInlineCitationAnchors(codBlock)
  return stripInlineCitationAnchors(removeDirectAnswerBlocks(raw, ['.omd-direct-answer-block']))
})

const omdDirectAnswerContent = computed(() => {
  return extractDirectAnswerBlockContent(codDirectAnswerRaw.value, '.omd-direct-answer-block')
})

const codRefinementTrace = computed(() => codResult.value?.debug_trace?.answer_generation?.llm_answer_refinement || {})

const codPrimaryAnswerContent = computed(() => {
  const llmAnswer = String(codResult.value?.llm_cod_direct_answer || '').trim()
  if (llmAnswer) return llmAnswer
  const codAnswer = codDirectAnswerContent.value
  if (codAnswer) return codAnswer
  return String(codResult.value?.final_answer || '').trim()
})

const codPrimaryInlineCitationCount = computed(() => (
  String(codPrimaryAnswerContent.value || '').match(/<c>\s*R\d+\s*<\/c>/gi) || []
).length)

const qaFeedbackAnswerSources = computed(() => {
  const sources = []
  const llmAnswer = String(codResult.value?.llm_cod_direct_answer || '').trim()
  const codAnswer = codDirectAnswerContent.value
  if (llmAnswer) {
    sources.push({
      key: 'llm_refined_cod_answer',
      tone: 'llm',
      title: 'LLM REFINED COD ANSWER',
      kicker: 'LLMs + CoD 直接回答',
      content: llmAnswer
    })
  }
  if (codAnswer) {
    sources.push({
      key: 'path_grounded_direct_answer',
      tone: 'cod',
      title: 'PATH-GROUNDED DIRECT ANSWER',
      kicker: 'CoD 直接回答',
      content: codAnswer
    })
  }
  if (!sources.length && codPrimaryAnswerContent.value) {
    sources.push({
      key: 'final_answer',
      tone: 'cod',
      title: 'PATH-GROUNDED DIRECT ANSWER',
      kicker: 'CoD 最终回答',
      content: codPrimaryAnswerContent.value
    })
  }
  return sources
})

const codPrimaryAnswerStatus = computed(() => {
  const trace = codRefinementTrace.value
  if (trace.status === 'applied') return 'LLM 强制受约束改写答案'
  if (trace.status === 'applied_with_quality_warnings') return 'LLM 受约束改写答案（已标记质量警告）'
  if (trace.status === 'local_synthesis_applied') return 'CoD-grounded 本地融合答案'
  if (trace.status === 'fallback') return 'KG/OMD 证据路径答案'
  if (trace.status === 'skipped' || trace.status === 'disabled') return 'KG/OMD 证据路径答案'
  return codLlmEnabled.value ? 'KG/OMD 证据路径答案，LLM 增强链路已记录' : 'KG/OMD 证据路径答案'
})

const codReasoningRoute = computed(() => {
  return codResult.value?.reasoning_route || codResult.value?.debug_trace?.adaptive_reasoning || null
})

const formatRoutePercent = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${(Math.max(0, Math.min(1, number)) * 100).toFixed(1)}%`
}

const formatRouteNumber = (value, digits = 0) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return digits > 0 ? number.toFixed(digits) : String(Math.round(number))
}

const formatRouteFlag = (value) => (value ? '是' : '否')

const routeModeLabel = (value) => {
  const mode = String(value || '').toLowerCase()
  if (mode === 'cot') return 'CoT'
  if (mode === 'tot') return 'ToT'
  if (mode === 'auto' || mode === 'adaptive') return 'Auto'
  return value || '—'
}

const routingMetricGroups = {
  route: '路由融合',
  structural: 'KG 结构',
  normalized: '归一化结构',
  semantic: '语义判断',
  evidence: '证据支撑',
}

const routingBreakdownLabels = {
  nodes: '节点规模归一项',
  relations: '关系规模归一项',
  graph_density: '图密度归一项',
  relation_to_node_ratio: '关系/节点比',
  path_length: '最长路径归一项',
  average_shortest_path: '平均最短路归一项',
  branching: '分支复杂度归一项',
  hub_dominance: '枢纽集中度',
  candidate_paths: '候选路径规模归一项',
  reasoning_path_density: '候选路径密度',
  entropy: '图结构熵归一项',
  relation_diversity: '关系多样性归一项',
  relation_type_entropy: '关系类型熵',
  cycle_redundancy: '闭环冗余度',
  component_fragmentation: '连通分量碎片化',
  component_balance: '组件均衡度',
  evidence_coverage: '证据覆盖度',
  route_diversity: '路线多样性',
  semantic_layer_coverage: '语义层覆盖',
  mechanism_bridge: '机制桥接闭合',
  mechanism_coverage: '机制覆盖度',
  path_evidence_alignment: '路径-证据对齐',
  reasoning_readiness: '推理就绪度',
  answer_gain_potential: '答案增益潜力',
  cot_suitability: 'CoT 适配度',
  tot_suitability: 'ToT 适配度',
  acyclic_signal: '非冗余路径信号',
  linear_low_branching: '低分支线性信号',
  linear_low_candidate_paths: '低候选路径信号',
  multi_hop_intent: '多跳机制意图',
  multi_explanation_competition: '多解释竞争',
  hypothesis_exploration: '假设探索需求',
  question_decomposition_breadth: '问题分解宽度',
  kg_semantic_coupling: 'KG-语义耦合度',
  ambiguity: '语义歧义度',
  structural: '结构复杂度项',
  semantic: '语义复杂度项',
  threshold_margin: '阈值距离稳定性',
  score_agreement: '结构/语义一致性',
  tot_signal_density: 'ToT 信号密度',
}

const routingMetricDefinitions = {
  structural_score: {
    label: '结构复杂度',
    group: 'route',
    source: 'Subgraph Analyzer',
    formula: 'StructuralScore = Σ(normalized_component_i × weight_i)',
    description: '衡量检索 KG 子图是否具有多节点、多关系、多跳、多分支和多候选路径的结构复杂性；分数越高，越倾向使用 ToT 多路径探索。',
    derivationKey: 'structural_complexity_score',
  },
  semantic_score: {
    label: '语义复杂度',
    group: 'route',
    source: 'LLM as Judge / heuristic judge',
    formula: 'SemanticScore = Σ(semantic_component_i × weight_i)',
    description: '衡量用户问题是否需要机制解释、多跳推理、多解释竞争和假设探索；分数越高，越需要 ToT 对多条 KG 路径进行比较。',
  },
  fused_score: {
    label: '综合路由分',
    group: 'route',
    source: 'Reasoning Router',
    formula: 'FusedScore = C(0.52 × StructuralScore + 0.48 × SemanticScore)',
    description: '融合 KG 子图结构复杂度和问题语义复杂度，用于最终选择 CoT 线性验证或 ToT 树状多分支。',
  },
  confidence: {
    label: '路由置信度',
    group: 'route',
    source: 'Reasoning Router',
    formula: 'Confidence = C(0.42 × threshold_margin + 0.34 × score_agreement + 0.24 × ToT_signal_density)',
    description: '衡量当前 CoT/ToT 路由选择的稳定性；综合考虑分数距阈值的边界、结构/语义分数一致性和 ToT 信号密度。',
  },
  route_diversity_score: {
    label: '路线多样性',
    group: 'route',
    source: 'Subgraph Analyzer',
    formula: 'C(0.34 × 关系多样性 + 0.24 × 候选路径 + 0.22 × 分支复杂度 + 0.20 × 图结构熵)',
    description: '衡量 KG 是否提供足够多样的机制路线；该指标越高，ToT 越能通过多分支比较提升机制覆盖和条件边界识别。',
    derivationKey: 'route_diversity_score',
    scoreTerm: 'route_diversity',
  },
  semantic_layer_coverage_score: {
    label: '语义层覆盖',
    group: 'route',
    source: 'Subgraph Analyzer',
    formula: 'C(0.70 × covered_semantic_layers/7 + 0.30 × semantic_layer_entropy)',
    description: '衡量子图是否覆盖组成/工艺、反应机制、物相、显微结构、传输和性能等材料科学机制层级。',
    derivationKey: 'semantic_layer_coverage_score',
    scoreTerm: 'semantic_layer_coverage',
  },
  mechanism_bridge_score: {
    label: '机制桥接闭合',
    group: 'route',
    source: 'Subgraph Analyzer',
    formula: 'C(0.42 × 语义层覆盖 + 0.22 × 上游-中介-下游闭合 + 0.16 × 路径长度 + 0.12 × 关系多样性 + 0.08 × 平均最短路)',
    description: '判断 KG 是否从上游组成/工艺变量，经反应/物相/微结构中介，桥接到下游性能目标。',
    derivationKey: 'mechanism_bridge_score',
    scoreTerm: 'mechanism_bridge',
  },
  mechanism_coverage_score: {
    label: '机制覆盖度',
    group: 'route',
    source: 'Subgraph Analyzer',
    formula: 'C(0.26 × 机制桥接 + 0.24 × 语义层覆盖 + 0.20 × 关系多样性 + 0.14 × 路径长度 + 0.10 × 组件均衡 + 0.06 × 证据覆盖)',
    description: '评估子图是否足以支撑从材料变量到服役性能的跨层机制回答。',
    derivationKey: 'mechanism_coverage_score',
    scoreTerm: 'mechanism_coverage',
  },
  path_evidence_alignment_score: {
    label: '路径-证据对齐',
    group: 'evidence',
    source: 'Subgraph Analyzer',
    formula: 'C(0.40 × 证据覆盖 + 0.24 × 组件均衡 + 0.20 × 路径密度 + 0.16 × 非冗余信号)',
    description: '衡量候选 KG 路径是否有足够证据块和连通结构支撑；该指标越高，CoT/ToT 的答案组织越稳定。',
    derivationKey: 'path_evidence_alignment_score',
    scoreTerm: 'path_evidence_alignment',
  },
  reasoning_readiness_score: {
    label: '推理就绪度',
    group: 'route',
    source: 'Subgraph Analyzer',
    formula: 'C(0.30 × 路径-证据对齐 + 0.24 × 机制覆盖 + 0.18 × 路线多样性 + 0.16 × 语义层覆盖 + 0.12 × 证据覆盖)',
    description: '综合判断当前子图是否已经足以支撑受约束推理和专业回答生成；用于区分“图复杂”与“可推理”。',
    derivationKey: 'reasoning_readiness_score',
    scoreTerm: 'reasoning_readiness',
  },
  answer_gain_potential_score: {
    label: '答案增益潜力',
    group: 'route',
    source: 'Reasoning Router',
    formula: 'C(0.28 × 机制覆盖 + 0.24 × 路径-证据对齐 + 0.20 × 路线多样性 + 0.16 × 推理就绪 + 0.12 × 语义层覆盖)',
    description: '估计 CoT/ToT 路由对最终 CoD 答案的潜在提升，包括机制完整性、验证锚点和工程边界。',
    derivationKey: 'answer_gain_potential_score',
    scoreTerm: 'answer_gain_potential',
  },
  cot_suitability_score: {
    label: 'CoT 适配度',
    group: 'route',
    source: 'Reasoning Router',
    formula: 'C(0.32 × 路径-证据对齐 + 0.22 × 机制桥接 + 0.18 × 组件均衡 + 0.14 × 低分支度 + 0.08 × 低候选路径 + 0.06 × 证据覆盖)',
    description: '衡量该问题是否适合沿一条高质量 KG 主链做线性验证；适合低复杂度、单因果链和高证据对齐场景。',
    derivationKey: 'cot_suitability_score',
    scoreTerm: 'cot_suitability',
  },
  tot_suitability_score: {
    label: 'ToT 适配度',
    group: 'route',
    source: 'Reasoning Router',
    formula: 'C(0.24 × 候选路径 + 0.20 × 分支复杂度 + 0.18 × 路线多样性 + 0.14 × 机制覆盖 + 0.10 × 图结构熵 + 0.08 × 路径长度 + 0.06 × 语义层覆盖)',
    description: '衡量该问题是否需要把 KG 路径展开为多条 reasoning branch 进行比较；适合多机制、多假设和设计/发现任务。',
    derivationKey: 'tot_suitability_score',
    scoreTerm: 'tot_suitability',
  },
  node_count: {
    label: 'KG 节点数',
    group: 'structural',
    source: 'Retrieved subgraph',
    formula: '|V|',
    description: '当前问题召回子图中的实体、属性、机制、材料和实验条件等节点数量。',
    scoreTerm: 'nodes',
  },
  relation_count: {
    label: 'KG 关系数',
    group: 'structural',
    source: 'Retrieved subgraph',
    formula: '|E|',
    description: '当前问题召回子图中的有向关系、证据边或机制边数量。',
    scoreTerm: 'relations',
  },
  graph_density: {
    label: '图密度',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: '|E| / (|V| × (|V|-1))',
    description: '衡量子图内部关系连接的紧密程度；密度越高，说明候选证据之间耦合越强。',
    derivationKey: 'graph_density',
    scoreTerm: 'graph_density',
  },
  relation_to_node_ratio: {
    label: '关系/节点比',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: '|E| / |V|',
    description: '衡量平均每个节点承载的关系强度，是图谱证据丰富度和局部耦合强度的直接指标。',
    derivationKey: 'relation_to_node_ratio',
  },
  relation_type_count: {
    label: '关系类型数',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: '|unique(relation_type)|',
    description: '统计子图中不同关系语义类型数量，用于衡量机制链是否跨越组成、工艺、物相、微结构、性能等多类关系。',
  },
  relation_type_entropy: {
    label: '关系类型熵',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: 'H(R) = -Σ p(r) log p(r) / log(|R|)',
    description: '衡量关系类型分布是否均衡；熵越高，说明推理路径覆盖的关系类型越多样。',
    scoreTerm: 'relation_diversity',
  },
  connected_component_count: {
    label: '连通分量',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: 'count(connected components)',
    description: '统计子图被分割为多少个连通区域；分量越多，说明证据可能存在断裂或多机制并行。',
    scoreTerm: 'component_fragmentation',
  },
  component_balance_score: {
    label: '组件均衡度',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: 'C(1 - 0.18 × (component_count-1) - 0.35 × max(0, largest_share-0.88))',
    description: '评估连通分量是否由一个主组件稳定承载，或被多个小组件分散。',
    derivationKey: 'component_balance_score',
  },
  max_path_length: {
    label: '最长路径',
    group: 'structural',
    source: 'Candidate path reconstruction',
    formula: 'max(path_hop_count)',
    description: '候选 KG 推理路径中的最大跳数；跳数越长，越可能需要 CoT/ToT 帮助组织中间机制。',
    scoreTerm: 'path_length',
  },
  average_shortest_path_length: {
    label: '平均最短路',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: 'mean(shortest_path(u,v)) over reachable node pairs',
    description: '衡量子图整体的拓扑距离；值越高，问题越可能涉及远距离变量到性能的跨层推理。',
    scoreTerm: 'average_shortest_path',
  },
  average_branching_factor: {
    label: '平均分支度',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: 'mean(out_degree + in_degree)',
    description: '衡量节点平均可通往多少条后续机制或证据边；是 ToT 分支搜索空间大小的核心指标。',
    derivationKey: 'branching_complexity',
    scoreTerm: 'branching',
  },
  max_branching_factor: {
    label: '最大分支度',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: 'max(out_degree + in_degree)',
    description: '识别子图中的枢纽节点，避免单个高度连接节点导致推理分支爆炸。',
    scoreTerm: 'branching',
  },
  hub_dominance: {
    label: '枢纽集中度',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: 'max_degree / Σ degree',
    description: '衡量关系是否集中在少数枢纽节点上；过高时需要 ToT 区分不同路径是否只是重复经过同一枢纽。',
    scoreTerm: 'hub_dominance',
  },
  branch_count: {
    label: '分支数',
    group: 'route',
    source: 'Reasoning Router',
    formula: 'selected ToT branches or CoT path count',
    description: '进入答案生成的推理分支数量；ToT 会把 KG 路径作为候选 reasoning branch 进行比较。',
  },
  route_family_count: {
    label: '逻辑路线',
    group: 'route',
    source: 'Route-family clustering',
    formula: 'count(route families)',
    description: '按机制语义归并后的逻辑路线数量，用于区分同类路径重复和真正的替代机制路线。',
  },
  candidate_reasoning_path_count: {
    label: '候选路径',
    group: 'structural',
    source: 'Path reconstruction',
    formula: 'count(candidate reasoning paths)',
    description: 'KG 子图能够生成的候选推理路径数量；数量越高，越适合用 ToT 搜索和筛选。',
    derivationKey: 'reasoning_path_density',
    scoreTerm: 'candidate_paths',
  },
  reasoning_path_density: {
    label: '路径密度',
    group: 'normalized',
    source: 'Subgraph Analyzer',
    formula: 'C(log1p(path_count) / log1p(node_count × relation_type_count × 2))',
    description: '把候选路径数量按子图规模进行归一化，衡量单位 KG 结构能产生多少推理路径。',
    derivationKey: 'reasoning_path_density',
    scoreTerm: 'reasoning_path_density',
  },
  graph_structure_entropy: {
    label: '图结构熵',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: 'normalized entropy over node degrees',
    description: '衡量连接分布的复杂程度；熵越高，说明推理路径在图中分散程度更高。',
    scoreTerm: 'entropy',
  },
  cycle_redundancy: {
    label: '闭环冗余度',
    group: 'structural',
    source: 'Subgraph Analyzer',
    formula: 'C((undirected_edges - node_count + component_count) / relation_count)',
    description: '估计图中闭环或冗余支路的比例；闭环过多时需要区分证据互证与重复路径。',
    derivationKey: 'cycle_redundancy',
    scoreTerm: 'cycle_redundancy',
  },
  evidence_chunk_count: {
    label: '证据块数',
    group: 'evidence',
    source: 'Evidence retrieval',
    formula: 'count(unique evidence chunks)',
    description: '参与当前推理路径支撑的文本证据块数量。',
  },
  evidence_coverage_score: {
    label: '证据覆盖度',
    group: 'evidence',
    source: 'Subgraph Analyzer',
    formula: 'C(evidence_chunk_count / min(relation_count, 24))',
    description: '衡量证据块是否覆盖足够多的关键关系；覆盖度高时，CoT/ToT 生成答案更稳定。',
    derivationKey: 'evidence_coverage_score',
    scoreTerm: 'evidence_coverage',
  },
  candidate_path_density: {
    label: '候选路径密度',
    group: 'normalized',
    source: 'Normalized component',
    formula: 'C(log1p(candidate_paths) / log1p(600))',
    description: '把候选路径规模映射到 0-1 区间，是 ToT 搜索空间强度的归一化指标。',
    scoreTerm: 'candidate_paths',
  },
  normalized_graph_density: {
    label: '关系密度归一',
    group: 'normalized',
    source: 'Normalized component',
    formula: 'C(graph_density / 0.18)',
    description: '把图密度映射到经验阈值区间，用于结构复杂度加权。',
    scoreTerm: 'graph_density',
  },
  relation_diversity: {
    label: '关系多样性',
    group: 'normalized',
    source: 'Normalized component',
    formula: 'C(0.55 × relation_type_count/12 + 0.45 × relation_type_entropy)',
    description: '综合关系类型数量和关系熵，判断 KG 路径是否跨越多类机制关系。',
    scoreTerm: 'relation_diversity',
  },
  branching_complexity: {
    label: '分支复杂度',
    group: 'normalized',
    source: 'Normalized component',
    formula: 'C(0.60 × avg_degree/4.5 + 0.30 × max_degree/14 + 0.10 × hub_dominance)',
    description: '归一化后的分支强度，直接影响 ToT 是否需要展开多条候选路径。',
    derivationKey: 'branching_complexity',
    scoreTerm: 'branching',
  },
  requires_multi_hop_reasoning: {
    label: '多跳推理',
    group: 'semantic',
    source: 'Semantic judge',
    formula: 'boolean intent feature',
    description: '判断问题是否需要跨越多个 KG 节点/关系才能得到机制性答案。',
    scoreTerm: 'multi_hop_intent',
  },
  has_multiple_possible_explanations: {
    label: '多解释竞争',
    group: 'semantic',
    source: 'Semantic judge',
    formula: 'boolean explanation-competition feature',
    description: '判断是否存在多条可竞争的机制解释或路径假设。',
    scoreTerm: 'multi_explanation_competition',
  },
  needs_hypothesis_exploration: {
    label: '假设探索',
    group: 'semantic',
    source: 'Semantic judge',
    formula: 'boolean hypothesis-exploration feature',
    description: '判断问题是否从事实问答升级为发现、设计、优化或未知机制探索。',
    scoreTerm: 'hypothesis_exploration',
  },
  ambiguity_score: {
    label: '语义歧义度',
    group: 'semantic',
    source: 'Semantic judge',
    formula: 'C(entity breadth + target breadth + candidate path competition + relation diversity)',
    description: '衡量问题目标和 KG 证据之间是否存在多种解释空间。',
    scoreTerm: 'ambiguity',
  },
}

const clamp01 = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
}

const routeMetricGroupLabel = (group) => routingMetricGroups[group] || group || '路由指标'

const makeRouteScoreRow = (key, value, options = {}) => {
  const definition = routingMetricDefinitions[key] || {}
  const group = options.group || definition.group || 'route'
  return {
    key,
    label: options.label || definition.label || key,
    value,
    rawValue: options.rawValue,
    group,
    groupLabel: routeMetricGroupLabel(group),
  }
}

const formatRoutingDetailValue = (value, options = {}) => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  if (options.percent) return formatRoutePercent(number)
  if (options.digits !== undefined) return formatRouteNumber(number, options.digits)
  if (Math.abs(number) <= 1 && !Number.isInteger(number)) return number.toFixed(4)
  return Number.isInteger(number) ? String(number) : number.toFixed(4)
}

const objectToRoutingInputs = (inputs) => {
  if (!inputs || typeof inputs !== 'object') return []
  return Object.entries(inputs).map(([label, value]) => ({
    label,
    value: Array.isArray(value) ? value.join(', ') : formatRoutingDetailValue(value),
  }))
}

const scoreBreakdownRows = (breakdown) => {
  if (!breakdown || typeof breakdown !== 'object') return []
  return Object.entries(breakdown).map(([label, item]) => {
    const value = item?.normalized_value ?? item?.component_value ?? item?.value
    return {
      label: routingBreakdownLabels[label] || label,
      value: formatRoutingDetailValue(value, { percent: true }),
      weight: Number.isFinite(Number(item?.weight)) ? Number(item.weight).toFixed(2) : '—',
      contribution: formatRoutingDetailValue(item?.weighted_contribution, { percent: true }),
    }
  })
}

const singleScoreTermRow = (breakdown, key) => {
  if (!key || !breakdown || typeof breakdown !== 'object' || !breakdown[key]) return []
  return scoreBreakdownRows({ [key]: breakdown[key] })
}

const buildRoutingRadar = (items) => {
  const center = 75
  const radius = 50
  const axes = items.map((item, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / items.length
    const value = clamp01(item.value)
    return {
      ...item,
      axisX: Number((center + Math.cos(angle) * radius).toFixed(1)),
      axisY: Number((center + Math.sin(angle) * radius).toFixed(1)),
      pointX: Number((center + Math.cos(angle) * radius * value).toFixed(1)),
      pointY: Number((center + Math.sin(angle) * radius * value).toFixed(1)),
      labelX: Number((center + Math.cos(angle) * (radius + 14)).toFixed(1)),
      labelY: Number((center + Math.sin(angle) * (radius + 14) + 4).toFixed(1)),
    }
  })
  return {
    axes,
    polygon: axes.map(axis => `${axis.pointX},${axis.pointY}`).join(' '),
  }
}

const compactRouteText = (value, limit = 80) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`
}

const pathNodeNames = (path) => {
  const nodes = Array.isArray(path?.nodes) ? path.nodes : []
  return nodes
    .map(node => String(node?.name || '').trim())
    .filter(Boolean)
}

const pathRelationNames = (path) => {
  const edges = Array.isArray(path?.edges) ? path.edges : []
  return edges
    .map(edge => String(edge?.name || edge?.relation || edge?.type || edge?.edge_name || '').trim())
    .filter(Boolean)
}

const pathEdgeFacts = (path) => {
  const edges = Array.isArray(path?.edges) ? path.edges : []
  return edges
    .map(edge => String(edge?.fact || edge?.description || edge?.summary || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const pathEvidenceTexts = (path) => {
  const evidence = Array.isArray(path?.evidence) ? path.evidence : []
  return evidence
    .map(item => String(item?.quote || item?.text || item?.summary || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const splitNaturalPathSubjects = (value) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return []
  return text
    .split(/\s*(?:→|->|⇒|=>|-->|—>| - | > )\s*/g)
    .map(item => item.replace(/^[\s:：,，;；]+|[\s:：,，;；]+$/g, '').trim())
    .filter(Boolean)
}

const codRoutingKeywordRules = [
  [/强度保持|strength retention|retained strength/i, '强度保持率'],
  [/sio2.*(富集|玻璃|保护)|二氧化硅.*(富集|玻璃|保护)|玻璃相/i, 'SiO2富集层'],
  [/氧扩散|oxygen diffusion|扩散通道/i, '氧扩散通道'],
  [/孔隙连通|连通孔|孔隙通道|pore connectivity/i, '孔隙连通性'],
  [/孔隙封闭|封孔|pore closure|pores? seal/i, '孔隙封闭'],
  [/sic.*氧化|碳化硅.*氧化/i, 'SiC氧化'],
  [/sic.*粒径|粒径.*sic|particle size/i, 'SiC粒径分布'],
  [/sic.*含量|sic content|碳化硅.*含量/i, 'SiC含量'],
  [/抗氧化|oxidation resistance/i, '抗氧化性能'],
  [/显气孔|apparent porosity/i, '显气孔率'],
  [/体积密度|bulk density/i, '体积密度'],
  [/热震|thermal shock/i, '抗热震性'],
  [/铝酸钙|ca6/i, 'CA6骨架'],
  [/al2o3|氧化铝/i, 'Al2O3骨架'],
  [/碳源|残碳|carbon/i, 'C源/残碳'],
  [/界面|interface/i, '界面结构'],
  [/裂纹|crack/i, '微裂纹'],
  [/熔渣|slag/i, '抗渣侵蚀'],
]

const codRoutingKeywordLabel = (value, fallback = 'KG主体') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return fallback
  for (const [pattern, label] of codRoutingKeywordRules) {
    if (pattern.test(text)) return label
  }
  const cleaned = text
    .replace(/^正向保护链必须并列负向风险链和trade[-_\s]?off链[:：]*/i, '')
    .replace(/^机制Agent提出|^ASC[-–—]?OASIS多Agent推理生成的本地图谱增量节点[。.]?/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/[;；,，].*$/g, '')
    .trim()
  return compactRouteText(cleaned || fallback, 18)
}

const splitRoutingLabelLines = (value) => {
  const text = String(value || '').trim()
  if (text.length <= 7) return [text]
  const separators = ['/', '与', '和', '及', '-']
  for (const separator of separators) {
    if (text.includes(separator)) {
      return text.split(separator).map(part => part.trim()).filter(Boolean).slice(0, 2)
    }
  }
  if (/^[A-Za-z0-9]+/.test(text) && /[\u4e00-\u9fff]/.test(text)) {
    const match = text.match(/^([A-Za-z0-9]+)(.+)$/)
    if (match) return [match[1], match[2]]
  }
  const pivot = Math.ceil(text.length / 2)
  return [text.slice(0, pivot), text.slice(pivot)].filter(Boolean)
}

const pathLogicalNodes = (path, limit = 7) => {
  const nodes = Array.isArray(path?.nodes) ? path.nodes : []
  if (nodes.length) {
    return nodes.slice(0, limit).map((node, index) => ({
      key: node?.uuid || `${node?.name || 'kg-node'}-${index}`,
      label: codRoutingKeywordLabel(`${node?.name || ''} ${node?.summary || ''}`, `Node ${index + 1}`),
      fullLabel: String(node?.name || `Node ${index + 1}`).trim(),
      meta: '',
      summary: '',
    }))
  }
  const subjects = splitNaturalPathSubjects(path?.natural_language_path)
  if (subjects.length) {
    return subjects.slice(0, limit).map((label, index) => ({
      key: `${path?.path_id || 'path'}-subject-${index}`,
      label: codRoutingKeywordLabel(label, `主体${index + 1}`),
      fullLabel: label,
      meta: '',
      summary: '',
    }))
  }
  return [{
    key: `${path?.path_id || 'path'}-fallback-node`,
    label: codRoutingKeywordLabel(path?.path_type || 'KG reasoning subject', 'KG主体'),
    fullLabel: String(path?.path_type || 'KG reasoning subject'),
    meta: '',
    summary: '',
  }]
}

const pathLogicalEdges = (path, nodeCount) => {
  const relationNames = pathRelationNames(path)
  const edgeFacts = pathEdgeFacts(path)
  const fallback = compactRouteText(path?.path_type || 'supports', 30)
  return Array.from({ length: Math.max(0, nodeCount - 1) }, (_, index) => ({
    key: `${path?.path_id || 'path'}-edge-${index}`,
    label: '',
    fullLabel: relationNames[index] || relationNames[0] || fallback,
    fact: compactRouteText(edgeFacts[index] || edgeFacts[0] || '', 72),
  }))
}

const pathNodeChain = (path, limit = 5) => {
  const logicalNodes = pathLogicalNodes(path, limit)
  if (logicalNodes.length) return logicalNodes.map(node => node.label).join(' → ')
  return compactRouteText(path?.natural_language_path || path?.path_id || 'KG reasoning branch', 120)
}

const pathDetailText = (path) => {
  const naturalPath = String(path?.natural_language_path || '').replace(/\s+/g, ' ').trim()
  if (naturalPath) return naturalPath
  const logicalNodes = pathLogicalNodes(path, 8)
  if (logicalNodes.length) return logicalNodes.map(node => node.label).join(' → ')
  return String(path?.path_type || 'KG reasoning branch')
}

const pathTitleText = (path) => {
  const logicalNodes = pathLogicalNodes(path, 4)
  if (logicalNodes.length >= 2) return logicalNodes.map(node => node.label).join(' → ')
  const naturalPath = String(path?.natural_language_path || '').replace(/\s+/g, ' ').trim()
  if (naturalPath) return compactRouteText(naturalPath, 96)
  if (logicalNodes.length === 1) return logicalNodes[0].label
  return String(path?.path_type || 'KG reasoning branch')
}

const routeFamilyDefinitions = [
  {
    key: 'risk_tradeoff',
    label: '风险 / trade-off 路线',
    shortLabel: 'Risk route',
    color: '#BE185D',
    fill: '#FDF2F8',
    patterns: [/风险|过量|过高|下降|冲突|trade[-\s]?off|weak|excess|reject|contradiction/i]
  },
  {
    key: 'protective_barrier',
    label: 'SiO2保护膜 / 氧扩散调控',
    shortLabel: 'Protective barrier',
    color: '#0F766E',
    fill: '#ECFDF5',
    patterns: [/sio2.*(富集|玻璃|保护)|二氧化硅.*(富集|玻璃|保护)|玻璃相|氧扩散|oxygen diffusion|抗氧化|oxidation resistance/i]
  },
  {
    key: 'oxidation_transport',
    label: 'SiC氧化 / 孔隙连通路线',
    shortLabel: 'Oxidation transport',
    color: '#2563EB',
    fill: '#EFF6FF',
    patterns: [/sic.*氧化|碳化硅.*氧化|孔隙连通|连通孔|pore connectivity|扩散通道/i]
  },
  {
    key: 'performance_retention',
    label: '强度保持 / 致密化路线',
    shortLabel: 'Strength route',
    color: '#C2410C',
    fill: '#FFF7ED',
    patterns: [/强度保持|strength retention|体积密度|bulk density|显气孔|apparent porosity|致密|density/i]
  },
  {
    key: 'evidence_validation',
    label: '证据校验 / 条件约束路线',
    shortLabel: 'Evidence route',
    color: '#0891B2',
    fill: '#ECFEFF',
    patterns: [/evidence|证据|condition|条件|missing|缺失|表征|xrd|sem|eds|tg/i]
  },
]

const defaultRouteFamily = {
  key: 'mechanism_chain',
  label: '通用机制链路线',
  shortLabel: 'Mechanism route',
  color: '#7C3AED',
  fill: '#F5F3FF',
}

const reasoningNodeToneDefinitions = [
  {
    key: 'performance',
    label: '性能结果',
    color: '#D97706',
    fill: '#FFFBEB',
    patterns: [/强度保持|抗氧化性能|抗热震|抗渣|performance|strength|oxidation resistance|thermal shock/i],
  },
  {
    key: 'phase',
    label: '物相/保护层',
    color: '#0284C7',
    fill: '#F0F9FF',
    patterns: [/sio2|二氧化硅|富集层|玻璃相|ca6|al2o3|物相|phase|glass/i],
  },
  {
    key: 'transport',
    label: '扩散/传输',
    color: '#2563EB',
    fill: '#EFF6FF',
    patterns: [/氧扩散|扩散通道|孔隙连通|孔隙封闭|传输|transport|diffusion|connectivity|closure/i],
  },
  {
    key: 'reaction',
    label: '反应机制',
    color: '#059669',
    fill: '#ECFDF5',
    patterns: [/sic氧化|氧化反应|反应机制|氧化|mechanism|reaction/i],
  },
  {
    key: 'microstructure',
    label: '显微结构',
    color: '#7C3AED',
    fill: '#F5F3FF',
    patterns: [/显气孔|体积密度|粒径|微裂纹|界面|孔径|microstructure|porosity|density|particle/i],
  },
  {
    key: 'composition',
    label: '组成变量',
    color: '#0F766E',
    fill: '#F0FDFA',
    patterns: [/sic含量|sic粒径|c源|残碳|碳源|al2o3骨架|成分|组成|rawmaterial|composition|ratio/i],
  },
  {
    key: 'risk',
    label: '风险/权衡',
    color: '#E11D48',
    fill: '#FFF1F2',
    patterns: [/风险|过量|失衡|冲突|trade[-\s]?off|risk|conflict|excess/i],
  },
]

const defaultReasoningNodeTone = {
  key: 'reasoning',
  label: '推理节点',
  color: '#64748B',
  fill: '#F8FAFC',
}

const inferReasoningNodeTone = (node) => {
  const text = [
    node?.label,
    node?.fullLabel,
    node?.meta,
    node?.summary,
    node?.entity_type,
  ].join(' ')
  const match = reasoningNodeToneDefinitions.find(tone => tone.patterns.some(pattern => pattern.test(text)))
  if (!match) return defaultReasoningNodeTone
  const { patterns, ...tone } = match
  return tone
}

const inferReasoningRouteFamily = (path, logicalNodes, relationNames, edgeFacts, evidenceTexts) => {
  const text = [
    path?.path_type,
    path?.natural_language_path,
    ...logicalNodes.map(node => `${node.label} ${node.fullLabel}`),
    ...relationNames,
    ...edgeFacts,
    ...evidenceTexts,
    ...(path?.missing_links || []),
    ...(path?.contradiction_hints || []),
  ].join(' ')

  const scoredFamilies = routeFamilyDefinitions
    .map(family => ({
      ...family,
      score: family.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0),
    }))
    .filter(family => family.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scoredFamilies.length) {
    const { patterns, score, ...family } = scoredFamilies[0]
    return family
  }
  return defaultRouteFamily
}

const buildReasoningRouteFamilies = (branches) => {
  const familyMap = new Map()
  branches.forEach((branch, index) => {
    const family = branch.routeFamily || defaultRouteFamily
    if (!familyMap.has(family.key)) {
      familyMap.set(family.key, {
        ...family,
        branches: [],
        branchRefs: [],
        bestScore: 0,
        firstIndex: index,
      })
    }
    const group = familyMap.get(family.key)
    group.branches.push(branch)
    group.branchRefs.push(`T${index + 1}`)
    group.bestScore = Math.max(group.bestScore, Number(branch.scoreValue || 0))
  })
  return Array.from(familyMap.values())
    .sort((a, b) => {
      if (Math.abs(b.bestScore - a.bestScore) > 0.0001) return b.bestScore - a.bestScore
      return a.firstIndex - b.firstIndex
    })
}

const codReasoningVisual = computed(() => {
  const route = codReasoningRoute.value || {}
  const structural = route.structural_metrics || {}
  const semantic = route.semantic_assessment || {}
  const selectedMode = String(route.selected_mode || 'cot').toLowerCase() === 'tot' ? 'tot' : 'cot'
  const requested = routeModeLabel(route.requested_mode || codReasoningMode.value)
  const selected = routeModeLabel(selectedMode)
  const routedPaths = Array.isArray(codResult.value?.routed_reasoning_paths)
    ? codResult.value.routed_reasoning_paths
    : []
  const selectedPathIds = Array.isArray(route.selected_path_ids) ? route.selected_path_ids : []
  const firstPath = routedPaths[0] || {}
  const firstPathNodes = routedPaths.length ? pathLogicalNodes(firstPath, 7) : []
  const firstPathEdges = firstPathNodes.length ? pathLogicalEdges(firstPath, firstPathNodes.length) : []
  const fallbackSteps = [
    { key: 'query-anchor', label: '查询主体', meta: 'question anchor', role: 'query anchor' },
    { key: 'kg-path-space', label: 'KG 证据路径', meta: 'retrieved graph path', role: 'verified hop' },
    { key: 'answer-target', label: '答案目标', meta: 'KG-grounded answer', role: 'answer target' },
  ]
  const chainSteps = firstPathNodes.length
    ? firstPathNodes.map((node, index) => ({
      ...node,
      role: index === 0 ? 'query anchor' : (index === firstPathNodes.length - 1 ? 'answer target' : 'verified hop')
    }))
    : fallbackSteps
  const chainEdges = firstPathEdges.length
    ? firstPathEdges
    : [
      { key: 'query-to-kg', label: '检索', fullLabel: '检索', fact: '' },
      { key: 'kg-to-answer', label: '验证', fullLabel: '验证', fact: '' },
    ].slice(0, Math.max(0, chainSteps.length - 1))
  const branchSource = routedPaths.length
    ? routedPaths
    : selectedPathIds.map(pathId => ({ path_id: pathId, path_type: 'reasoning_branch', nodes: [] }))
  const branches = branchSource.map((path, index) => {
    const logicalNodes = pathLogicalNodes(path, 7)
    const logicalEdges = pathLogicalEdges(path, logicalNodes.length)
    const nodeNames = logicalNodes.map(node => node.label)
    const relationNames = pathRelationNames(path)
    const edgeFacts = pathEdgeFacts(path)
    const evidenceTexts = pathEvidenceTexts(path)
    const title = pathTitleText(path)
    const relationLabel = relationNames.length
      ? relationNames.join(' → ')
      : String(path.path_type || 'KG relation path')
    const factSummary = edgeFacts.length
      ? edgeFacts.slice(0, 2).join('；')
      : evidenceTexts.slice(0, 1).join('；')
    const detail = pathDetailText(path)
    const routeFamily = inferReasoningRouteFamily(path, logicalNodes, relationNames, edgeFacts, evidenceTexts)
    const scoreValue = Number.isFinite(Number(path.initial_score)) ? Number(path.initial_score) : 0
    return {
      key: path.path_id || `branch-${index}`,
      id: path.path_id || `branch_${index + 1}`,
      branchLabel: `Thought ${index + 1}`,
      type: compactRouteText(`${routeFamily.shortLabel} · ${path.path_type || 'reasoning_branch'}`, 52),
      title,
      chain: compactRouteText(pathNodeChain(path, 6), 170),
      detail,
      routeFamily,
      routeFamilyKey: routeFamily.key,
      routeFamilyLabel: routeFamily.label,
      relationLabel: compactRouteText(relationLabel, 180),
      factSummary: compactRouteText(factSummary || detail, 260),
      evidenceSummary: compactRouteText(evidenceTexts.slice(0, 2).join('；'), 180),
      graphTitle: compactRouteText(title, 44),
      graphSubtitle: compactRouteText(relationLabel, 58),
      graphMicro: compactRouteText(factSummary || detail, 72),
      graphEvidence: compactRouteText(evidenceTexts[0] || factSummary || 'evidence-grounded check', 64),
      meta: `${routeFamily.label} · branch ${index + 1} · ${nodeNames.length} nodes`,
      status: index === 0 ? 'primary branch' : 'candidate branch',
      scoreValue,
      score: formatRoutePercent(path.initial_score),
      logicalNodes,
      logicalEdges,
      nodeCount: nodeNames.length,
      edgeCount: relationNames.length || (Array.isArray(path.edges) ? path.edges.length : 0),
      evidenceCount: evidenceTexts.length || (Array.isArray(path.evidence) ? path.evidence.length : 0)
    }
  })
  if (!branches.length) {
    branches.push({
      key: 'branch-empty',
      id: 'branch_1',
      branchLabel: 'Thought 1',
      type: 'reasoning_branch',
      title: '等待 KG path selection trace',
      chain: '等待 KG path selection trace',
      detail: '等待 KG path selection trace',
      relationLabel: 'KG relation path',
      factSummary: '',
      evidenceSummary: '',
      graphTitle: '等待 KG path selection trace',
      graphSubtitle: 'KG relation path',
      graphMicro: '',
      graphEvidence: '',
      meta: 'no selected branch',
      status: 'pending',
      scoreValue: 0,
      score: '—',
      routeFamily: defaultRouteFamily,
      routeFamilyKey: defaultRouteFamily.key,
      routeFamilyLabel: defaultRouteFamily.label,
      logicalNodes: [
        { key: 'empty-kg', label: 'KG 路径空间', meta: 'pending', summary: '' },
        { key: 'empty-answer', label: '答案目标', meta: 'pending', summary: '' },
      ],
      logicalEdges: [
        { key: 'empty-edge', label: '待选择', fullLabel: '待选择', fact: '' },
      ],
      nodeCount: 0,
      edgeCount: 0,
      evidenceCount: 0
    })
  }
  const routeFamilies = buildReasoningRouteFamilies(branches)
  const profile = route.strategy_profile || {}
  const normalized = structural.normalized_components || {}
  const routerGuidance = route.answer_guidance || {}
  const generationGuidance = codResult.value?.debug_trace?.answer_generation?.reasoning_answer_guidance || {}
  const rawGainItems = Array.isArray(generationGuidance.answer_gain_highlights)
    ? generationGuidance.answer_gain_highlights
    : (Array.isArray(routerGuidance.final_answer_gain_highlights) ? routerGuidance.final_answer_gain_highlights : [])
  const answerGainItems = rawGainItems.length
    ? rawGainItems.slice(0, 4).map((item, index) => ({
      label: item?.label || `增益 ${index + 1}`,
      impact: item?.impact || item?.title || '',
      answerSurface: item?.answer_surface || item?.answerSurface || item?.detail || '',
    }))
    : [
      selectedMode === 'tot'
        ? {
          label: '多分支综合增益',
          impact: 'ToT 将多条 KG 路径转化为主分支、共识节点和条件分支',
          answerSurface: '最终回答能覆盖主机制、替代解释和工程风险边界。',
        }
        : {
          label: '线性验证增益',
          impact: 'CoT 将最佳 KG 路径转化为变量到性能的闭合机制链',
          answerSurface: '最终回答更聚焦、更容易实验验证。',
        },
    ]
  const answerGainSummary = generationGuidance.answer_gain_summary
    || routerGuidance.final_answer_gain_summary
    || (selectedMode === 'tot'
      ? 'ToT 通过多路径比较，把最终回答从单一路径解释提升为主机制、共识机制和条件风险的综合判断。'
      : 'CoT 通过线性链验证，把最终回答从零散关系提升为闭合、可验证的因果说明。')
  const scoreRows = [
    makeRouteScoreRow('structural_score', formatRoutePercent(route.structural_score), { rawValue: route.structural_score }),
    makeRouteScoreRow('semantic_score', formatRoutePercent(route.semantic_score), { rawValue: route.semantic_score }),
    makeRouteScoreRow('fused_score', formatRoutePercent(route.fused_score), { rawValue: route.fused_score }),
    makeRouteScoreRow('confidence', formatRoutePercent(route.confidence), { rawValue: route.confidence }),
    makeRouteScoreRow('route_diversity_score', formatRoutePercent(structural.route_diversity_score ?? normalized.route_diversity), { rawValue: structural.route_diversity_score ?? normalized.route_diversity }),
    makeRouteScoreRow('semantic_layer_coverage_score', formatRoutePercent(structural.semantic_layer_coverage_score ?? normalized.semantic_layer_coverage), { rawValue: structural.semantic_layer_coverage_score ?? normalized.semantic_layer_coverage }),
    makeRouteScoreRow('mechanism_bridge_score', formatRoutePercent(structural.mechanism_bridge_score ?? normalized.mechanism_bridge), { rawValue: structural.mechanism_bridge_score ?? normalized.mechanism_bridge }),
    makeRouteScoreRow('mechanism_coverage_score', formatRoutePercent(structural.mechanism_coverage_score ?? normalized.mechanism_coverage), { rawValue: structural.mechanism_coverage_score ?? normalized.mechanism_coverage }),
    makeRouteScoreRow('path_evidence_alignment_score', formatRoutePercent(structural.path_evidence_alignment_score ?? normalized.path_evidence_alignment), { rawValue: structural.path_evidence_alignment_score ?? normalized.path_evidence_alignment }),
    makeRouteScoreRow('reasoning_readiness_score', formatRoutePercent(structural.reasoning_readiness_score ?? normalized.reasoning_readiness), { rawValue: structural.reasoning_readiness_score ?? normalized.reasoning_readiness }),
    makeRouteScoreRow('answer_gain_potential_score', formatRoutePercent(structural.answer_gain_potential_score ?? normalized.answer_gain_potential), { rawValue: structural.answer_gain_potential_score ?? normalized.answer_gain_potential }),
    makeRouteScoreRow('cot_suitability_score', formatRoutePercent(structural.cot_suitability_score ?? normalized.cot_suitability), { rawValue: structural.cot_suitability_score ?? normalized.cot_suitability }),
    makeRouteScoreRow('tot_suitability_score', formatRoutePercent(structural.tot_suitability_score ?? normalized.tot_suitability), { rawValue: structural.tot_suitability_score ?? normalized.tot_suitability }),
    makeRouteScoreRow('node_count', formatRouteNumber(structural.node_count), { rawValue: structural.node_count }),
    makeRouteScoreRow('relation_count', formatRouteNumber(structural.relation_count), { rawValue: structural.relation_count }),
    makeRouteScoreRow('graph_density', formatRoutePercent(structural.graph_density), { rawValue: structural.graph_density }),
    makeRouteScoreRow('relation_to_node_ratio', formatRouteNumber(structural.relation_to_node_ratio, 2), { rawValue: structural.relation_to_node_ratio }),
    makeRouteScoreRow('relation_type_count', formatRouteNumber(structural.relation_type_count), { rawValue: structural.relation_type_count }),
    makeRouteScoreRow('relation_type_entropy', Number.isFinite(Number(structural.relation_type_entropy)) ? Number(structural.relation_type_entropy).toFixed(2) : '—', { rawValue: structural.relation_type_entropy }),
    makeRouteScoreRow('connected_component_count', formatRouteNumber(structural.connected_component_count), { rawValue: structural.connected_component_count }),
    makeRouteScoreRow('component_balance_score', formatRoutePercent(structural.component_balance_score), { rawValue: structural.component_balance_score }),
    makeRouteScoreRow('max_path_length', structural.max_path_length ?? '—', { rawValue: structural.max_path_length }),
    makeRouteScoreRow('average_shortest_path_length', formatRouteNumber(structural.average_shortest_path_length, 2), { rawValue: structural.average_shortest_path_length }),
    makeRouteScoreRow('average_branching_factor', formatRouteNumber(structural.average_branching_factor, 2), { rawValue: structural.average_branching_factor }),
    makeRouteScoreRow('max_branching_factor', formatRouteNumber(structural.max_branching_factor), { rawValue: structural.max_branching_factor }),
    makeRouteScoreRow('hub_dominance', formatRoutePercent(structural.hub_dominance), { rawValue: structural.hub_dominance }),
    makeRouteScoreRow('branch_count', route.branch_count ?? branches.length, { rawValue: route.branch_count ?? branches.length }),
    makeRouteScoreRow('route_family_count', routeFamilies.length, { rawValue: routeFamilies.length }),
    makeRouteScoreRow('candidate_reasoning_path_count', structural.candidate_reasoning_path_count ?? selectedPathIds.length, { rawValue: structural.candidate_reasoning_path_count ?? selectedPathIds.length }),
    makeRouteScoreRow('reasoning_path_density', formatRoutePercent(structural.reasoning_path_density ?? normalized.reasoning_path_density), { rawValue: structural.reasoning_path_density ?? normalized.reasoning_path_density }),
    makeRouteScoreRow('graph_structure_entropy', Number.isFinite(Number(structural.graph_structure_entropy)) ? Number(structural.graph_structure_entropy).toFixed(2) : '—', { rawValue: structural.graph_structure_entropy }),
    makeRouteScoreRow('cycle_redundancy', formatRoutePercent(structural.cycle_redundancy), { rawValue: structural.cycle_redundancy }),
    makeRouteScoreRow('evidence_chunk_count', formatRouteNumber(structural.evidence_chunk_count), { rawValue: structural.evidence_chunk_count }),
    makeRouteScoreRow('evidence_coverage_score', formatRoutePercent(structural.evidence_coverage_score), { rawValue: structural.evidence_coverage_score }),
    makeRouteScoreRow('candidate_path_density', formatRoutePercent(normalized.candidate_paths), { rawValue: normalized.candidate_paths }),
    makeRouteScoreRow('normalized_graph_density', formatRoutePercent(normalized.graph_density), { rawValue: normalized.graph_density }),
    makeRouteScoreRow('relation_diversity', formatRoutePercent(normalized.relation_diversity), { rawValue: normalized.relation_diversity }),
    makeRouteScoreRow('branching_complexity', formatRoutePercent(normalized.branching), { rawValue: normalized.branching }),
    makeRouteScoreRow('requires_multi_hop_reasoning', formatRouteFlag(semantic.requires_multi_hop_reasoning), { rawValue: semantic.requires_multi_hop_reasoning }),
    makeRouteScoreRow('has_multiple_possible_explanations', formatRouteFlag(semantic.has_multiple_possible_explanations), { rawValue: semantic.has_multiple_possible_explanations }),
    makeRouteScoreRow('needs_hypothesis_exploration', formatRouteFlag(semantic.needs_hypothesis_exploration), { rawValue: semantic.needs_hypothesis_exploration }),
    makeRouteScoreRow('ambiguity_score', formatRoutePercent(semantic.ambiguity_score), { rawValue: semantic.ambiguity_score }),
  ]
  const academicRadar = buildRoutingRadar([
    { key: 'structure', label: '结构', value: route.structural_score },
    { key: 'semantic', label: '语义', value: route.semantic_score },
    { key: 'coverage', label: '机制', value: structural.mechanism_coverage_score ?? normalized.mechanism_coverage },
    { key: 'bridge', label: '桥接', value: structural.mechanism_bridge_score ?? normalized.mechanism_bridge },
    { key: 'alignment', label: '对齐', value: structural.path_evidence_alignment_score ?? normalized.path_evidence_alignment },
    { key: 'gain', label: '增益', value: structural.answer_gain_potential_score ?? normalized.answer_gain_potential },
  ])
  const academicBars = [
    { label: '结构复杂度', value: route.structural_score },
    { label: '语义复杂度', value: route.semantic_score },
    { label: '机制覆盖度', value: structural.mechanism_coverage_score ?? normalized.mechanism_coverage },
    { label: '机制桥接闭合', value: structural.mechanism_bridge_score ?? normalized.mechanism_bridge },
    { label: '路径-证据对齐', value: structural.path_evidence_alignment_score ?? normalized.path_evidence_alignment },
    { label: '推理就绪度', value: structural.reasoning_readiness_score ?? normalized.reasoning_readiness },
    { label: '答案增益潜力', value: structural.answer_gain_potential_score ?? normalized.answer_gain_potential },
  ].map(item => ({
    ...item,
    display: formatRoutePercent(item.value),
    width: formatRoutePercent(item.value),
  }))
  return {
    mode: selectedMode,
    modeLabel: selectedMode === 'tot' ? 'Tree-of-Thought / 树状多分支' : 'Chain-of-Thought / 链式验证',
    routeLabel: `${requested} → ${selected}${route.route_source ? ` · ${route.route_source}` : ''}`,
    fusedScore: formatRoutePercent(route.fused_score),
    structuralScore: formatRoutePercent(route.structural_score),
    semanticScore: formatRoutePercent(route.semantic_score),
    reason: route.reason || '',
    rootLabel: `${structural.node_count ?? 0} nodes / ${structural.relation_count ?? 0} relations`,
    pathPolicy: profile.path_policy || (selectedMode === 'tot' ? 'diverse_path_hypothesis_search' : 'best_verified_path_chain'),
    kgRole: profile.kg_role || 'KG defines the evidence-grounded search space',
    llmRole: profile.llm_role || (selectedMode === 'tot' ? 'compare branches and filter hypotheses' : 'verify each KG step linearly'),
    answerGainTitle: selectedMode === 'tot' ? 'ToT 对最终回答的增益' : 'CoT 对最终回答的增益',
    answerGainSummary,
    answerGainItems,
    selectedPathIds,
    chainSteps,
    chainEdges,
    chainText: chainSteps.map(step => step.label).join(' → '),
    branches,
    routeFamilies,
    scoreRows,
    academicProfileTitle: selectedMode === 'tot' ? 'Multi-branch reasoning signature' : 'Linear verification signature',
    academicRadarAxes: academicRadar.axes,
    academicRadarPolygon: academicRadar.polygon,
    academicBars,
    semanticFlags: [
      semantic.requires_multi_hop_reasoning ? '多跳' : '单跳',
      semantic.has_multiple_possible_explanations ? '多解释' : '单解释',
      semantic.needs_hypothesis_exploration ? '假设探索' : '证据验证'
    ]
  }
})

const selectedRoutingMetricDetail = computed(() => {
  const key = selectedRoutingMetricKey.value
  if (!key) return null
  const route = codReasoningRoute.value || {}
  const visual = codReasoningVisual.value || {}
  const row = (visual.scoreRows || []).find(item => item.key === key)
  const definition = routingMetricDefinitions[key] || {}
  if (!row && !definition.label) return null

  const structural = route.structural_metrics || {}
  const semantic = route.semantic_assessment || {}
  const structuralBreakdown = structural.score_breakdown || {}
  const semanticBreakdown = semantic.score_breakdown || {}
  const derivation = definition.derivationKey
    ? structural.metric_derivations?.[definition.derivationKey]
    : null

  let formula = derivation?.formula || definition.formula || 'direct metric from adaptive reasoning trace'
  let inputs = objectToRoutingInputs(derivation?.inputs)
  let rows = []
  const notes = []

  if (key === 'structural_score') {
    rows = scoreBreakdownRows(derivation?.weighted_terms || structuralBreakdown)
    inputs = [
      { label: 'node_count', value: formatRoutingDetailValue(structural.node_count) },
      { label: 'relation_count', value: formatRoutingDetailValue(structural.relation_count) },
      { label: 'candidate_paths', value: formatRoutingDetailValue(structural.candidate_reasoning_path_count) },
      { label: 'max_path_length', value: formatRoutingDetailValue(structural.max_path_length) },
    ]
    notes.push('结构复杂度不是单一节点数或关系数，而是多项 KG 拓扑指标归一化后的加权和。')
  } else if (key === 'semantic_score') {
    rows = scoreBreakdownRows(semanticBreakdown)
    inputs = [
      { label: 'task_goal', value: semantic.task_goal || '—' },
      { label: 'requires_multi_hop_reasoning', value: formatRoutingDetailValue(semantic.requires_multi_hop_reasoning) },
      { label: 'has_multiple_possible_explanations', value: formatRoutingDetailValue(semantic.has_multiple_possible_explanations) },
      { label: 'needs_hypothesis_exploration', value: formatRoutingDetailValue(semantic.needs_hypothesis_exploration) },
      { label: 'ambiguity_score', value: formatRoutePercent(semantic.ambiguity_score) },
    ]
    notes.push(semantic.judge_trace?.llm_status === 'applied'
      ? '该语义复杂度包含 LLM as Judge 对问题目标和检索子图的难度评估。'
      : '该语义复杂度使用启发式语义评估或 LLM 不可用时的保底评估。')
  } else if (key === 'fused_score') {
    const breakdown = route.complexity_breakdown || {}
    formula = breakdown.formula || definition.formula
    rows = scoreBreakdownRows({
      structural: breakdown.structural || {
        value: route.structural_score,
        weight: 0.52,
        weighted_contribution: 0.52 * Number(route.structural_score || 0),
      },
      semantic: breakdown.semantic || {
        value: route.semantic_score,
        weight: 0.48,
        weighted_contribution: 0.48 * Number(route.semantic_score || 0),
      },
    })
    inputs = [
      { label: 'routing_threshold', value: formatRoutingDetailValue(breakdown.routing_threshold ?? 0.58) },
      { label: 'selected_mode', value: routeModeLabel(route.selected_mode) },
      { label: 'route_source', value: route.route_source || '—' },
    ]
    notes.push('综合路由分超过阈值且分支/语义信号充足时，Auto 模式会倾向 ToT；低复杂度链式问题倾向 CoT。')
  } else if (key === 'confidence') {
    const structuralScore = clamp01(route.structural_score)
    const semanticScore = clamp01(route.semantic_score)
    const fusedScore = clamp01(route.fused_score)
    const thresholdMargin = Math.min(1, Math.abs(fusedScore - 0.58) / 0.42)
    const scoreAgreement = clamp01(1 - Math.abs(structuralScore - semanticScore))
    const totSignalDensity = clamp01(
      0.20 * Number((structural.candidate_reasoning_path_count || 0) >= 12)
      + 0.16 * Number((structural.max_path_length || 0) >= 3)
      + 0.16 * Number((structural.average_branching_factor || 0) >= 1.8)
      + 0.14 * Number((structural.relation_type_count || 0) >= 4)
      + 0.14 * Number(Boolean(semantic.requires_multi_hop_reasoning))
      + 0.10 * Number(Boolean(semantic.has_multiple_possible_explanations))
      + 0.10 * Number(Boolean(semantic.needs_hypothesis_exploration))
    )
    rows = scoreBreakdownRows({
      threshold_margin: { value: thresholdMargin, weight: 0.42, weighted_contribution: thresholdMargin * 0.42 },
      score_agreement: { value: scoreAgreement, weight: 0.34, weighted_contribution: scoreAgreement * 0.34 },
      tot_signal_density: { value: totSignalDensity, weight: 0.24, weighted_contribution: totSignalDensity * 0.24 },
    }).map(item => ({
      ...item,
      label: {
        threshold_margin: '阈值距离稳定性',
        score_agreement: '结构/语义一致性',
        tot_signal_density: 'ToT 信号密度',
      }[item.label] || item.label,
    }))
    inputs = [
      { label: 'hard threshold', value: '0.58' },
      { label: 'route_source', value: route.route_source || '—' },
      { label: 'forced route', value: route.route_source === 'forced' ? '是，置信度直接置为 100%' : '否' },
    ]
    notes.push('如果用户强制选择 CoT 或 ToT，后端会把路由置信度置为 100%；Auto 模式才按上述稳定性公式估计。')
  } else if (definition.group === 'semantic') {
    rows = singleScoreTermRow(semanticBreakdown, definition.scoreTerm)
    const componentValue = semantic.semantic_components?.[definition.scoreTerm]
    inputs = [
      { label: 'semantic component', value: formatRoutingDetailValue(componentValue, { percent: typeof componentValue === 'number' }) },
      { label: 'judge method', value: semantic.judge_trace?.method || 'semantic_complexity_judge' },
      { label: 'task_goal', value: semantic.task_goal || '—' },
    ]
  } else {
    rows = derivation?.weighted_terms
      ? scoreBreakdownRows(derivation.weighted_terms)
      : singleScoreTermRow(structuralBreakdown, definition.scoreTerm)
    if (!inputs.length && definition.scoreTerm && structural.normalized_components?.[definition.scoreTerm] !== undefined) {
      inputs = [
        { label: 'normalized_component', value: formatRoutePercent(structural.normalized_components[definition.scoreTerm]) },
        { label: 'raw_metric_value', value: formatRoutingDetailValue(row?.rawValue) },
      ]
    }
  }

  if (!rows.length && derivation?.result !== undefined) {
    rows = [{
      label: '计算结果',
      value: formatRoutingDetailValue(derivation.result, { percent: Math.abs(Number(derivation.result)) <= 1 }),
      weight: '—',
      contribution: '—',
    }]
  }
  if (!inputs.length) {
    inputs = [
      { label: 'raw_metric_value', value: formatRoutingDetailValue(row?.rawValue) },
      { label: 'display_value', value: row?.value || '—' },
    ]
  }
  notes.push('该指标只用于选择 CoT/ToT 推理策略和答案组织，不应被直接当作材料实验结论。')
  notes.push(visual.mode === 'tot'
    ? '当前 ToT 会把 KG 候选路径作为多条 reasoning branch，比较证据充分性、路径一致性和工程风险边界。'
    : '当前 CoT 会沿单条高可信 KG 路径逐跳验证主体、关系和性能目标。')

  return {
    key,
    label: row?.label || definition.label || key,
    value: row?.value || formatRoutingDetailValue(row?.rawValue),
    groupLabel: row?.groupLabel || routeMetricGroupLabel(definition.group),
    source: definition.source || 'Adaptive reasoning trace',
    description: definition.description || 'Adaptive reasoning router metric.',
    formula,
    inputs,
    rows,
    notes,
  }
})

const codReasoningRouteContent = computed(() => {
  const route = codReasoningRoute.value
  if (!route) return ''
  const structural = route.structural_metrics || {}
  const semantic = route.semantic_assessment || {}
  const profile = route.strategy_profile || {}
  const visual = codReasoningVisual.value
  const branchLines = visual.mode === 'tot'
    ? visual.routeFamilies.map(family => {
      const lines = family.branches
        .slice(0, 4)
        .map(branch => `  ${branch.branchLabel}：${branch.chain}`)
        .join('\n')
      return `路线 ${family.label}（${family.branches.length} 条）：\n${lines}`
    }).join('\n')
    : ''
  return [
    `推理路由：${routeModeLabel(route.requested_mode)} → ${routeModeLabel(route.selected_mode)}（${route.route_source || 'auto'}）`,
    '',
    visual.mode === 'tot'
      ? '推理形态：ToT 树状多分支；KG 候选路径作为不同假设分支，LLM 比较证据充分性与风险边界。'
      : '推理形态：CoT 链式线性；沿一条 KG 主路径逐跳验证主体、关系和答案目标。',
    '',
    `复杂度融合：结构 ${formatRoutePercent(route.structural_score)} / 语义 ${formatRoutePercent(route.semantic_score)} / 综合 ${formatRoutePercent(route.fused_score)}`,
    '',
    '计算公式：结构复杂度 = Σ(结构归一化指标 × 权重)，新增语义层覆盖、机制桥接、机制覆盖、路径-证据对齐、推理就绪和答案增益潜力；语义复杂度 = 多跳意图/多解释竞争/假设探索/查询宽度/KG耦合/歧义度加权，综合路由分 = 0.52×结构 + 0.48×语义。',
    '',
    `结构指标：节点 ${structural.node_count ?? 0}，关系 ${structural.relation_count ?? 0}，图密度 ${formatRoutePercent(structural.graph_density)}，关系/节点比 ${formatRouteNumber(structural.relation_to_node_ratio, 2)}，最大路径长度 ${structural.max_path_length ?? 0}，平均分支 ${Number(structural.average_branching_factor || 0).toFixed(2)}，候选推理路径 ${structural.candidate_reasoning_path_count ?? 0}，路径密度 ${formatRoutePercent(structural.reasoning_path_density)}，图结构熵 ${Number(structural.graph_structure_entropy || 0).toFixed(2)}，关系熵 ${Number(structural.relation_type_entropy || 0).toFixed(2)}，闭环冗余 ${formatRoutePercent(structural.cycle_redundancy)}，证据覆盖 ${formatRoutePercent(structural.evidence_coverage_score)}`,
    '',
    `推理适配：路线多样性 ${formatRoutePercent(structural.route_diversity_score)}，语义层覆盖 ${formatRoutePercent(structural.semantic_layer_coverage_score)}，机制桥接 ${formatRoutePercent(structural.mechanism_bridge_score)}，机制覆盖 ${formatRoutePercent(structural.mechanism_coverage_score)}，路径-证据对齐 ${formatRoutePercent(structural.path_evidence_alignment_score)}，推理就绪 ${formatRoutePercent(structural.reasoning_readiness_score)}，答案增益潜力 ${formatRoutePercent(structural.answer_gain_potential_score)}，CoT 适配 ${formatRoutePercent(structural.cot_suitability_score)}，ToT 适配 ${formatRoutePercent(structural.tot_suitability_score)}`,
    '',
    `语义判断：${semantic.task_goal || 'direct_qa'}；多跳=${semantic.requires_multi_hop_reasoning ? '是' : '否'}，多解释=${semantic.has_multiple_possible_explanations ? '是' : '否'}，假设探索=${semantic.needs_hypothesis_exploration ? '是' : '否'}，歧义度 ${formatRoutePercent(semantic.ambiguity_score)}`,
    '',
    `KG / LLM 分工：${profile.kg_role || 'KG 提供路径空间'}；${profile.llm_role || 'LLM 做证据约束下的推理组织'}`,
    '',
    `最终回答增益：${visual.answerGainSummary}`,
    ...visual.answerGainItems.map(gain => `- ${gain.label}：${gain.impact}${gain.answerSurface ? `；${gain.answerSurface}` : ''}`),
    '',
    `路径策略：${profile.path_policy || 'best_verified_paths'}；进入答案生成的逻辑链 ${visual.branches.length || 1} 条，划分为 ${visual.routeFamilies?.length || 1} 条逻辑路线`,
    '',
    visual.mode === 'tot' ? branchLines : `CoT 主链：${visual.chainText}`,
    '',
    route.reason || ''
  ].filter(Boolean).join('\n')
})

const d3NodeTone = (node) => {
  if (node.nodeTone) {
    return {
      fill: node.nodeTone.fill || '#F8FAFC',
      stroke: node.nodeTone.color || '#64748B',
      text: '#0F172A',
      accent: node.nodeTone.color || '#64748B',
    }
  }
  const mergedColors = Array.isArray(node.colors) ? [...new Set(node.colors)].filter(Boolean) : []
  if (mergedColors.length > 1) {
    return {
      fill: '#FFFFFF',
      stroke: '#CBD5E1',
      text: '#0F172A',
      accent: '#475569',
    }
  }
  if (node.color) {
    return {
      fill: node.fill || `${node.color}12`,
      stroke: node.color,
      text: '#0F172A',
      accent: node.color,
    }
  }
  if (node.kind === 'query') return { fill: '#ECFEFF', stroke: '#0891B2', text: '#0F172A', accent: '#0E7490' }
  if (node.kind === 'answer' || node.kind === 'result') return { fill: '#ECFDF5', stroke: '#0F766E', text: '#0F172A', accent: '#047857' }
  if (node.kind === 'root') return { fill: '#F5F3FF', stroke: '#7C3AED', text: '#0F172A', accent: '#6D28D9' }
  if (node.kind === 'primary') return { fill: '#F0FDFA', stroke: '#0F766E', text: '#0F172A', accent: '#0F766E' }
  if (node.kind === 'eval') return { fill: '#F8FAFF', stroke: '#6366F1', text: '#0F172A', accent: '#4338CA' }
  return { fill: '#FFFFFF', stroke: '#8B5CF6', text: '#0F172A', accent: '#6D28D9' }
}

const formatThoughtRefsForBadge = (refs = []) => {
  const values = [...new Set(refs)].filter(Boolean)
  if (!values.length) return ''
  if (values.length <= 3) return values.join('/')
  const numbers = values
    .map(value => Number(String(value).replace(/^T/i, '')))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const isContiguous = numbers.length === values.length
    && numbers.every((value, index) => index === 0 || value === numbers[index - 1] + 1)
  if (isContiguous) return `T${numbers[0]}-${numbers[numbers.length - 1]}`
  return `${values.slice(0, 2).join('/')}+${values.length - 2}`
}

const drawD3RoutingNode = (selection, options = {}) => {
  const width = options.width || 156
  const height = options.height || 72
  const selectNode = options.selectFn
  const titleLimit = options.titleLimit || 24
  const compact = options.compact === true
  selection.each(function (node) {
    const group = selectNode(this)
    const tone = d3NodeTone(node.data || node)
    const data = node.data || node
    group.append('rect')
      .attr('x', -width / 2)
      .attr('y', -height / 2)
      .attr('width', width)
      .attr('height', height)
      .attr('rx', 10)
      .attr('fill', tone.fill)
      .attr('stroke', tone.stroke)
      .attr('stroke-width', data.kind === 'primary' ? 2.4 : 1.5)
      .attr('filter', 'url(#cod-routing-node-shadow)')

    const nodeColors = Array.isArray(data.colors) ? [...new Set(data.colors)].filter(Boolean).slice(0, 6) : []
    if (nodeColors.length > 1) {
      const stripHeight = height / nodeColors.length
      nodeColors.forEach((color, index) => {
        group.append('rect')
          .attr('x', -width / 2)
          .attr('y', -height / 2 + index * stripHeight)
          .attr('width', 5)
          .attr('height', stripHeight + 0.6)
          .attr('rx', index === 0 || index === nodeColors.length - 1 ? 3 : 0)
          .attr('fill', color)
      })
    } else {
      group.append('rect')
        .attr('x', -width / 2)
        .attr('y', -height / 2)
        .attr('width', 5)
        .attr('height', height)
        .attr('rx', 3)
        .attr('fill', tone.accent)
    }

    if (!compact) {
      group.append('text')
        .attr('x', -width / 2 + 15)
        .attr('y', -height / 2 + 19)
        .attr('fill', tone.accent)
        .attr('font-size', 10)
        .attr('font-weight', 900)
        .attr('letter-spacing', 0)
        .text(compactRouteText(data.kicker || data.kind || 'node', 22))
    }

    const titleText = group.append('text')
      .attr('x', compact ? 0 : -width / 2 + 15)
      .attr('y', compact ? -3 : -height / 2 + 40)
      .attr('fill', tone.text)
      .attr('font-size', compact ? 15 : 13)
      .attr('font-weight', 900)
      .attr('text-anchor', compact ? 'middle' : 'start')

    const titleLines = compact
      ? splitRoutingLabelLines(compactRouteText(data.title || data.id || 'reasoning node', titleLimit))
      : [compactRouteText(data.title || data.id || 'reasoning node', titleLimit)]
    titleLines.forEach((line, index) => {
      titleText.append('tspan')
        .attr('x', compact ? 0 : -width / 2 + 15)
        .attr('dy', index === 0 ? 0 : 18)
        .text(line)
    })

    if (!compact) {
      group.append('text')
        .attr('x', -width / 2 + 15)
        .attr('y', -height / 2 + 59)
        .attr('fill', '#64748B')
        .attr('font-size', 10.5)
        .attr('font-weight', 700)
        .text(compactRouteText(data.subtitle || data.meta || '', options.subtitleLimit || 28))
    }

    if (compact && (Array.isArray(data.branchRefs) || Number(data.branchCount) > 1)) {
      const badgeText = formatThoughtRefsForBadge(data.branchRefs) || `×${data.branchCount}`
      const badgeWidth = Math.max(30, badgeText.length * 7.5 + 12)
      group.append('rect')
        .attr('x', -badgeWidth / 2)
        .attr('y', -height / 2 - 24)
        .attr('width', badgeWidth)
        .attr('height', 19)
        .attr('rx', 9.5)
        .attr('fill', '#FFFFFF')
        .attr('stroke', nodeColors.length > 1 ? '#94A3B8' : tone.accent)
        .attr('stroke-width', 1.1)
        .attr('filter', 'url(#cod-routing-node-shadow)')
      group.append('text')
        .attr('x', 0)
        .attr('y', -height / 2 - 11)
        .attr('fill', nodeColors.length > 1 ? '#334155' : tone.accent)
        .attr('font-size', 10)
        .attr('font-weight', 900)
        .attr('text-anchor', 'middle')
        .text(badgeText)
    }

    if (compact && data.hopLabel) {
      group.append('text')
        .attr('x', -width / 2 + 14)
        .attr('y', height / 2 - 8)
        .attr('fill', '#64748B')
        .attr('font-size', 9.5)
        .attr('font-weight', 900)
        .attr('letter-spacing', 0)
        .text(data.hopLabel)
    }

    group.append('title').text([data.kicker, data.title, data.subtitle, data.micro, data.detail].filter(Boolean).join('\n'))
  })
}

const renderCodRoutingD3Graph = async () => {
  await nextTick()
  const svgEl = codRoutingGraphSvg.value
  if (!svgEl || !codRoutingTraceOpen.value) return
  const { select } = await import('d3')

  const visual = codReasoningVisual.value
  const host = svgEl.parentElement
  const hostWidth = Math.max(1120, Math.round(host?.getBoundingClientRect?.().width || 1180))
  const logicNodeWidth = 138
  const logicNodeHeight = 70
  const rootNodeWidth = 210
  const evalNodeWidth = 120
  const resultNodeWidth = 178
  const nodeGap = 94
  const branchGap = 112
  const branchPalette = [
    '#0F766E',
    '#7C3AED',
    '#2563EB',
    '#C2410C',
    '#0891B2',
    '#BE185D',
    '#4D7C0F',
    '#9333EA',
  ]
  const branchFills = [
    '#ECFDF5',
    '#F5F3FF',
    '#EFF6FF',
    '#FFF7ED',
    '#ECFEFF',
    '#FDF2F8',
    '#F7FEE7',
    '#FAF5FF',
  ]
  const routeFamilies = visual.mode === 'tot'
    ? (visual.routeFamilies?.length ? visual.routeFamilies : [{ ...defaultRouteFamily, branches: visual.branches, branchRefs: visual.branches.map((_, index) => `T${index + 1}`) }])
    : []
  const branchStartX = 332
  const branchStepX = logicNodeWidth + nodeGap
  const routeHeaderHeight = 42
  const routeFamilyGap = 42
  const routeFamilyTop = 210
  const evaluateX = branchStartX + Math.max(
    2,
    ...visual.branches.map(branch => Math.max(1, branch.logicalNodes?.length || 0))
  ) * branchStepX
  const routeFamilyLayouts = []
  const branchLaneYMap = new Map()
  let routeCursorY = routeFamilyTop
  routeFamilies.forEach((family, familyIndex) => {
    const familyBranches = family.branches?.length ? family.branches : []
    const branchCount = Math.max(1, familyBranches.length)
    const branchYs = new Map()
    familyBranches.forEach((branch, branchIndex) => {
      const laneY = routeCursorY + routeHeaderHeight + branchIndex * branchGap
      branchYs.set(branch.id, laneY)
      branchLaneYMap.set(branch.id, laneY)
    })
    const firstY = routeCursorY + routeHeaderHeight
    const lastY = firstY + (branchCount - 1) * branchGap
    const bottomY = lastY + logicNodeHeight / 2 + 30
    routeFamilyLayouts.push({
      family,
      familyIndex,
      topY: routeCursorY,
      bottomY,
      centerY: (firstY + lastY) / 2,
      branchYs,
    })
    routeCursorY = bottomY + routeFamilyGap
  })
  const maxBranchNodeCount = Math.max(
    2,
    ...visual.branches.map(branch => Math.max(1, branch.logicalNodes?.length || 0))
  )
  let width = visual.mode === 'tot'
    ? Math.max(hostWidth, 420 + maxBranchNodeCount * (logicNodeWidth + nodeGap) + evalNodeWidth + resultNodeWidth + 150)
    : Math.max(hostWidth, 240 + Math.max(3, visual.chainSteps.length) * (logicNodeWidth + nodeGap) + 160)
  let height = visual.mode === 'tot'
    ? Math.max(620, routeCursorY + 88)
    : 360
  const svg = select(svgEl)
  const prepareSvgCanvas = () => {
    svg.selectAll('*').remove()
    svgEl.style.aspectRatio = `${width} / ${height}`
    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height)
      .attr('preserveAspectRatio', 'xMidYMid meet')

    const defs = svg.append('defs')
    const addArrowMarker = (id, fill) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 9)
        .attr('refY', 0)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', fill)
    }
    addArrowMarker('cod-routing-arrow-purple', '#8B5CF6')
    addArrowMarker('cod-routing-arrow-green', '#0F766E')
    addArrowMarker('cod-routing-arrow-teal', '#14B8A6')
    branchPalette.forEach((color, index) => {
      addArrowMarker(`cod-routing-arrow-branch-${index}`, color)
    })
    const filter = defs.append('filter')
      .attr('id', 'cod-routing-node-shadow')
      .attr('x', '-25%')
      .attr('y', '-25%')
      .attr('width', '150%')
      .attr('height', '150%')
    filter.append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 8)
      .attr('stdDeviation', 8)
      .attr('flood-color', '#0F172A')
      .attr('flood-opacity', 0.10)

    svg.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('rx', 16)
      .attr('fill', visual.mode === 'tot' ? '#FBFAFF' : '#F8FFFD')
  }

  const edgeColor = visual.mode === 'tot' ? '#8B5CF6' : '#14B8A6'
  const markerIdForColor = (color) => {
    if (color === '#0F766E') return 'cod-routing-arrow-green'
    if (color === '#14B8A6') return 'cod-routing-arrow-teal'
    const paletteIndex = branchPalette.indexOf(color)
    if (paletteIndex >= 0) return `cod-routing-arrow-branch-${paletteIndex}`
    return 'cod-routing-arrow-purple'
  }
  const textWithHalo = (selection, color = '#334155') => {
    selection
      .attr('fill', color)
      .attr('font-size', 10.5)
      .attr('font-weight', 900)
      .attr('letter-spacing', 0)
      .attr('stroke', visual.mode === 'tot' ? '#FBFAFF' : '#F8FFFD')
      .attr('stroke-width', 4)
      .attr('paint-order', 'stroke')
  }

  const drawEdge = (source, target, options = {}) => {
    const color = options.color || edgeColor
    const sourceWidth = options.sourceWidth || logicNodeWidth
    const targetWidth = options.targetWidth || logicNodeWidth
    const startX = source.x + sourceWidth / 2
    const endX = target.x - targetWidth / 2
    const startY = source.y + (options.sourceOffsetY ?? options.offsetY ?? 0)
    const endY = target.y + (options.targetOffsetY ?? options.offsetY ?? 0)
    const midX = startX + Math.max(36, (endX - startX) / 2)
    const path = `M${startX},${startY} C${midX},${startY} ${midX},${endY} ${endX},${endY}`
    const edgePath = svg.append('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', options.width || 2.5)
      .attr('stroke-linecap', 'round')
      .attr('opacity', options.opacity || 0.92)
    if (options.marker !== false) {
      edgePath.attr('marker-end', `url(#${markerIdForColor(color)})`)
    }
    if (options.dasharray) edgePath.attr('stroke-dasharray', options.dasharray)
    if (options.fullLabel) edgePath.append('title').text(options.fullLabel)

    if (options.label) {
      const label = svg.append('text')
        .attr('x', (startX + endX) / 2)
        .attr('y', (startY + endY) / 2 - 10)
        .attr('text-anchor', 'middle')
        .text(compactRouteText(options.label, options.labelLimit || 22))
      textWithHalo(label, color)
      label.append('title').text(options.fullLabel || options.label)
    }
  }

  const drawEdgeLabel = (source, target, options = {}) => {
    const color = options.color || edgeColor
    const sourceWidth = options.sourceWidth || logicNodeWidth
    const targetWidth = options.targetWidth || logicNodeWidth
    const startX = source.x + sourceWidth / 2
    const endX = target.x - targetWidth / 2
    const startY = source.y + (options.sourceOffsetY ?? options.offsetY ?? 0)
    const endY = target.y + (options.targetOffsetY ?? options.offsetY ?? 0)
    const label = svg.append('text')
      .attr('x', (startX + endX) / 2)
      .attr('y', (startY + endY) / 2 - 10)
      .attr('text-anchor', 'middle')
      .text(compactRouteText(options.label, options.labelLimit || 22))
    textWithHalo(label, color)
    label.append('title').text(options.fullLabel || options.label)
  }

  const drawBundledEdge = (edge, offsetY = 0) => {
    const edgeColors = [...new Set(edge.colors || [edge.color])].filter(Boolean)
    const sourceOffsetY = Number(edge.sourceOffsetY || 0) + offsetY
    const targetOffsetY = Number(edge.targetOffsetY || 0) + offsetY
    if (edgeColors.length <= 1) {
      drawEdge(edge.source, edge.target, {
        color: edge.color,
        width: edge.width,
        sourceWidth: edge.sourceWidth,
        targetWidth: edge.targetWidth,
        fullLabel: edge.fullLabel,
        opacity: edge.opacity,
        sourceOffsetY,
        targetOffsetY,
        label: edge.label,
        labelLimit: 14,
      })
      return
    }

    const colors = edgeColors.slice(0, 8)
    const laneGap = edge.busLane === true
      ? 8.5
      : Math.min(14, Math.max(8, 54 / Math.max(1, colors.length - 1)))
    const railWidth = Math.min(46, Math.max(12, colors.length * 3.6 + 6))
    drawEdge(edge.source, edge.target, {
      color: '#CBD5E1',
      width: railWidth,
      sourceWidth: edge.sourceWidth,
      targetWidth: edge.targetWidth,
      fullLabel: edge.fullLabel,
      opacity: 0.26,
      sourceOffsetY,
      targetOffsetY,
      marker: false,
    })
    colors.forEach((color, index) => {
      const laneOffset = (index - (colors.length - 1) / 2) * laneGap
      drawEdge(edge.source, edge.target, {
        color,
        width: edge.busLane === true ? 2.35 : 2.2,
        sourceWidth: edge.sourceWidth,
        targetWidth: edge.targetWidth,
        fullLabel: edge.fullLabel,
        opacity: edge.busLane === true ? 0.86 : 0.78,
        sourceOffsetY: sourceOffsetY + laneOffset,
        targetOffsetY: targetOffsetY + laneOffset,
      })
    })
    if (edge.label) {
      drawEdgeLabel(edge.source, edge.target, {
        color: edge.color,
        sourceWidth: edge.sourceWidth,
        targetWidth: edge.targetWidth,
        fullLabel: edge.fullLabel,
        sourceOffsetY,
        targetOffsetY,
        label: edge.label,
        labelLimit: 14,
      })
    }
  }

  const drawNodeGroup = (nodes, options = {}) => {
    const nodeGroups = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('transform', node => `translate(${node.x},${node.y})`)
    drawD3RoutingNode(nodeGroups, {
      width: options.width || logicNodeWidth,
      height: options.height || logicNodeHeight,
      selectFn: select,
      titleLimit: options.titleLimit || 22,
      subtitleLimit: options.subtitleLimit || 26,
      compact: options.compact === true,
    })
  }

  const drawStagePill = (label, x, y, color) => {
    const width = Math.max(70, String(label).length * 7 + 22)
    const group = svg.append('g')
      .attr('transform', `translate(${x},${y})`)
    group.append('rect')
      .attr('x', -width / 2)
      .attr('y', -13)
      .attr('width', width)
      .attr('height', 26)
      .attr('rx', 13)
      .attr('fill', '#FFFFFF')
      .attr('stroke', color)
      .attr('stroke-width', 1)
      .attr('opacity', 0.96)
    group.append('text')
      .attr('x', 0)
      .attr('y', 4)
      .attr('text-anchor', 'middle')
      .attr('fill', color)
      .attr('font-size', 10.5)
      .attr('font-weight', 900)
      .text(label)
  }

  prepareSvgCanvas()

  if (visual.mode === 'cot') {
    const nodes = [
      { id: 'query', kind: 'query', kicker: 'Query', title: '用户问题', subtitle: 'anchor entities', detail: codResult.value?.question || codQuestion.value },
      ...visual.chainSteps.map((step, index) => ({
        id: step.key,
        kind: 'step',
        kicker: index === 0 ? 'Anchor' : `Hop ${index}`,
        title: step.label,
        subtitle: '',
        micro: '',
        detail: step.fullLabel || step.role,
      })),
      { id: 'answer', kind: 'answer', kicker: 'Answer', title: '线性验证结论', subtitle: 'KG-grounded CoT', detail: visual.llmRole },
    ]
    const stepX = logicNodeWidth + nodeGap
    const startX = 118
    const y = Math.round(height / 2)
    const positioned = nodes.map((node, index) => ({ ...node, x: startX + index * stepX, y }))

    svg.append('text')
      .attr('x', 24)
      .attr('y', 34)
      .attr('fill', '#0F766E')
      .attr('font-size', 12)
      .attr('font-weight', 900)
      .text('CoT linear logic chain')

    positioned.slice(0, -1).forEach((source, index) => {
      const target = positioned[index + 1]
      const edge = visual.chainEdges[index - 1]
      drawEdge(source, target, {
        color: '#14B8A6',
        width: 3,
        sourceWidth: index === 0 ? logicNodeWidth : logicNodeWidth,
        targetWidth: logicNodeWidth,
        label: index === 0 ? '主链' : (edge?.label || ''),
        fullLabel: index === 0 ? '定位 KG 主链' : (edge?.fullLabel || edge?.label || '验证'),
        labelLimit: 10,
      })
    })

    drawNodeGroup(positioned, { width: logicNodeWidth, height: logicNodeHeight, titleLimit: 18, compact: true })
    positioned.forEach((node, index) => {
      const label = index === 0 ? 'Question' : (index === positioned.length - 1 ? 'Answer' : `Step ${index}`)
      drawStagePill(label, node.x, node.y - logicNodeHeight / 2 - 22, '#0F766E')
    })
    return
  }

  svg.append('text')
    .attr('x', 24)
    .attr('y', 34)
    .attr('fill', '#6D28D9')
    .attr('font-size', 12)
    .attr('font-weight', 900)
    .text('ToT route-family logic lanes')

  const routeCenterY = routeFamilyLayouts.length
    ? (routeFamilyLayouts[0].centerY + routeFamilyLayouts[routeFamilyLayouts.length - 1].centerY) / 2
    : Math.round(height / 2)

  const root = {
    id: 'root',
    kind: 'root',
    kicker: 'Problem Root',
    title: '问题根节点',
    subtitle: 'KG search space',
    micro: '',
    detail: visual.kgRole,
    x: 138,
    y: Math.round(routeCenterY),
  }
  const result = {
    id: 'result',
    kind: 'result',
    kicker: 'Select Answer',
    title: '选择结论',
    subtitle: visual.fusedScore,
    micro: '',
    detail: visual.llmRole,
    x: width - 126,
    y: Math.round(routeCenterY),
  }

  drawStagePill('Problem', root.x, 64, '#6D28D9')
  drawStagePill('Logic route lanes', (branchStartX + evaluateX) / 2, 64, '#7C3AED')
  drawStagePill('Route evaluate', evaluateX, 64, '#4338CA')
  drawStagePill('Select', result.x, 64, '#0F766E')

  const drawRouteFamilyBands = () => {
    const bandX = branchStartX - 76
    const bandWidth = Math.max(420, evaluateX - branchStartX + evalNodeWidth + 156)
    routeFamilyLayouts.forEach(layout => {
      const color = layout.family.color || '#7C3AED'
      const fill = layout.family.fill || '#F5F3FF'
      svg.append('rect')
        .attr('x', bandX)
        .attr('y', layout.topY - 16)
        .attr('width', bandWidth)
        .attr('height', Math.max(88, layout.bottomY - layout.topY + 12))
        .attr('rx', 14)
        .attr('fill', fill)
        .attr('stroke', color)
        .attr('stroke-width', 1)
        .attr('opacity', 0.34)

      const labelGroup = svg.append('g')
        .attr('transform', `translate(${bandX + 14},${layout.topY + 2})`)
      labelGroup.append('rect')
        .attr('x', 0)
        .attr('y', -13)
        .attr('width', Math.max(122, layout.family.label.length * 11 + 58))
        .attr('height', 25)
        .attr('rx', 12.5)
        .attr('fill', '#FFFFFF')
        .attr('stroke', color)
        .attr('stroke-width', 1)
      labelGroup.append('text')
        .attr('x', 12)
        .attr('y', 4)
        .attr('fill', color)
        .attr('font-size', 10.5)
        .attr('font-weight', 900)
        .text(`${layout.family.label} · ${layout.family.branches.length} paths`)
      labelGroup.append('title').text(layout.family.branches.map(branch => `${branch.branchLabel}: ${branch.chain}`).join('\n'))
    })
  }
  drawRouteFamilyBands()

  const drawThoughtLegend = () => {
    const legendGroup = svg.append('g')
      .attr('class', 'cod-routing-thought-legend')
    legendGroup.append('text')
      .attr('x', 24)
      .attr('y', 101)
      .attr('fill', '#475569')
      .attr('font-size', 10.5)
      .attr('font-weight', 900)
      .text('Thought paths')

    let cursorX = 118
    let cursorY = 94
    const maxX = width - 220
    visual.branches.slice(0, 8).forEach((branch, index) => {
      const color = branchPalette[index % branchPalette.length]
      const label = `T${index + 1} ${branch.score}`
      const chipWidth = Math.max(68, label.length * 7 + 18)
      if (cursorX + chipWidth > maxX) {
        cursorX = 118
        cursorY += 24
      }
      const chip = legendGroup.append('g')
        .attr('transform', `translate(${cursorX},${cursorY})`)
      chip.append('rect')
        .attr('x', 0)
        .attr('y', -13)
        .attr('width', chipWidth)
        .attr('height', 20)
        .attr('rx', 10)
        .attr('fill', '#FFFFFF')
        .attr('stroke', color)
        .attr('stroke-width', 1.2)
      chip.append('circle')
        .attr('cx', 11)
        .attr('cy', -3)
        .attr('r', 4)
        .attr('fill', color)
      chip.append('text')
        .attr('x', 22)
        .attr('y', 1)
        .attr('fill', color)
        .attr('font-size', 10)
        .attr('font-weight', 900)
        .text(label)
      chip.append('title').text(`${label}: ${branch.chain}`)
      cursorX += chipWidth + 8
    })
  }
  drawThoughtLegend()

  const drawNodeTypeLegend = () => {
    const legendItems = reasoningNodeToneDefinitions.slice(0, 6)
    const legendGroup = svg.append('g')
      .attr('class', 'cod-routing-node-type-legend')
    legendGroup.append('text')
      .attr('x', 24)
      .attr('y', 129)
      .attr('fill', '#475569')
      .attr('font-size', 10.5)
      .attr('font-weight', 900)
      .text('Node colors')

    let cursorX = 118
    const cursorY = 122
    legendItems.forEach(item => {
      const chipWidth = Math.max(76, item.label.length * 12 + 28)
      const chip = legendGroup.append('g')
        .attr('transform', `translate(${cursorX},${cursorY})`)
      chip.append('rect')
        .attr('x', 0)
        .attr('y', -13)
        .attr('width', chipWidth)
        .attr('height', 20)
        .attr('rx', 10)
        .attr('fill', item.fill)
        .attr('stroke', item.color)
        .attr('stroke-width', 1.2)
      chip.append('rect')
        .attr('x', 8)
        .attr('y', -9)
        .attr('width', 8)
        .attr('height', 12)
        .attr('rx', 3)
        .attr('fill', item.color)
      chip.append('text')
        .attr('x', 22)
        .attr('y', 1)
        .attr('fill', item.color)
        .attr('font-size', 10)
        .attr('font-weight', 900)
        .text(item.label)
      cursorX += chipWidth + 8
    })
  }
  drawNodeTypeLegend()

  const normalizeMergedNodeKey = value => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w\u4e00-\u9fff]+/g, '')

  const layerNodeMaps = Array.from({ length: maxBranchNodeCount }, () => new Map())
  const mergedNodes = []
  const branchTraces = []
  const branchPathColorMap = new Map(
    visual.branches.map((branch, index) => [branch.id, branchPalette[index % branchPalette.length]])
  )

  visual.branches.forEach((branch, branchIndex) => {
    const pathColor = branchPathColorMap.get(branch.id) || branchPalette[branchIndex % branchPalette.length]
    const laneY = branchLaneYMap.get(branch.id) || (routeFamilyTop + routeHeaderHeight + branchIndex * branchGap)
    const sourceNodes = branch.logicalNodes?.length ? branch.logicalNodes : [
      { key: `${branch.key}-fallback-a`, label: 'KG 主体', meta: 'path subject', summary: '' },
      { key: `${branch.key}-fallback-b`, label: '答案目标', meta: 'target', summary: '' },
    ]
    const traceNodes = sourceNodes.map((node, nodeIndex) => {
      const normalizedKey = normalizeMergedNodeKey(node.label || node.fullLabel || node.key) || `node-${nodeIndex}`
      const previousKey = normalizeMergedNodeKey(sourceNodes[nodeIndex - 1]?.label || 'root')
      const nextKey = normalizeMergedNodeKey(sourceNodes[nodeIndex + 1]?.label || 'evaluate')
      const mergeKey = `${branch.routeFamilyKey || 'route'}-${nodeIndex}-${previousKey}-${normalizedKey}-${nextKey}`
      const layerMap = layerNodeMaps[nodeIndex]
      let mergedNode = layerMap.get(mergeKey)
      if (!mergedNode) {
        const nodeTone = inferReasoningNodeTone(node)
        mergedNode = {
          id: `merged-${mergeKey}`,
          kind: 'branch',
          color: nodeTone.color,
          fill: nodeTone.fill,
          nodeTone,
          colors: [],
          branchIds: [],
          branchLabels: [],
          branchRefs: [],
          kicker: nodeTone.label || branch.routeFamily?.shortLabel || `Hop ${nodeIndex + 1}`,
          title: node.label,
          subtitle: '',
          micro: '',
          detail: `${nodeTone.label} · ${branch.routeFamilyLabel || 'reasoning route'}\n${node.fullLabel || node.label}`,
          hopLabel: `H${nodeIndex + 1}`,
          ySum: 0,
          occurrences: 0,
          branchCount: 0,
          x: branchStartX + nodeIndex * branchStepX,
          y: laneY,
        }
        layerMap.set(mergeKey, mergedNode)
        mergedNodes.push(mergedNode)
      }
      if (!mergedNode.colors.includes(pathColor)) mergedNode.colors.push(pathColor)
      if (!mergedNode.branchIds.includes(branch.id)) {
        mergedNode.branchIds.push(branch.id)
        mergedNode.branchLabels.push(branch.branchLabel)
        mergedNode.branchRefs.push(`T${branchIndex + 1}`)
      }
      mergedNode.ySum += laneY
      mergedNode.occurrences += 1
      mergedNode.branchCount = mergedNode.branchIds.length
      return {
        original: node,
        merged: mergedNode,
        edgeIn: branch.logicalEdges?.[nodeIndex - 1],
      }
    })
    branchTraces.push({ branch, branchIndex, color: pathColor, nodes: traceNodes })
  })

  layerNodeMaps.forEach(layerMap => {
    const layerNodes = Array.from(layerMap.values())
      .sort((a, b) => (a.ySum / Math.max(1, a.occurrences)) - (b.ySum / Math.max(1, b.occurrences)))
    let nextY = 116
    layerNodes.forEach(node => {
      const averagedY = node.ySum / Math.max(1, node.occurrences)
      node.y = Math.max(averagedY, nextY)
      node.branchCount = node.branchIds.length
      node.kicker = node.branchCount > 1 ? 'Merged node' : (node.branchLabels[0] || node.kicker)
      node.subtitle = node.branchCount > 1 ? `${formatThoughtRefsForBadge(node.branchRefs)} shared node` : `${node.branchRefs[0] || 'T'} path node`
      node.detail = node.branchCount > 1
        ? `${node.title} shared by ${node.branchLabels.join(', ')}`
        : node.detail
      nextY = node.y + 84
    })
  })

  const routeGateNodes = routeFamilyLayouts.map(layout => ({
    id: `route-gate-${layout.family.key}`,
    kind: 'eval',
    color: layout.family.color,
    fill: layout.family.fill,
    nodeTone: {
      key: 'route_eval',
      label: '路线评估',
      color: layout.family.color,
      fill: layout.family.fill,
    },
    colors: layout.family.branches
      .map(branch => branchPathColorMap.get(branch.id))
      .filter(Boolean),
    branchRefs: layout.family.branchRefs,
    kicker: 'Route eval',
    title: layout.family.shortLabel,
    subtitle: `${layout.family.branches.length} paths`,
    micro: '',
    detail: `${layout.family.label}\n${layout.family.branches.map(branch => `${branch.branchLabel}: ${branch.chain}`).join('\n')}`,
    branchCount: layout.family.branches.length,
    routeFamilyKey: layout.family.key,
    x: evaluateX,
    y: Math.round(layout.centerY),
  }))
  const routeGateByFamily = new Map(routeGateNodes.map(node => [node.routeFamilyKey, node]))

  const graphEdges = []
  branchTraces.forEach(trace => {
    let previousNode = root
    let previousWidth = rootNodeWidth
    const branchRef = `T${trace.branchIndex + 1}`
    const globalPathOffset = (trace.branchIndex - (Math.max(1, visual.branches.length) - 1) / 2) * 5.2
    trace.nodes.forEach((entry, nodeIndex) => {
      const targetNode = entry.merged
      const relationLabel = nodeIndex === 0
        ? 'route-entry'
        : (entry.edgeIn?.fullLabel || entry.edgeIn?.label || '关联')
      graphEdges.push({
        source: previousNode,
        target: targetNode,
        sourceWidth: previousWidth,
        targetWidth: logicNodeWidth,
        color: trace.color,
        width: nodeIndex === 0 ? 2.7 : 2.35,
        relationLabel,
        routeFamilyKey: trace.branch.routeFamilyKey,
        fullLabel: nodeIndex === 0
          ? `${trace.branch.branchLabel}: ${trace.branch.chain}`
          : `${trace.branch.branchLabel}: ${relationLabel}`,
        opacity: nodeIndex === 0 ? 0.82 : 0.76,
        sourceOffsetY: nodeIndex === 0 ? globalPathOffset : 0,
        targetOffsetY: 0,
        branchRef,
        branchLabel: trace.branch.branchLabel,
      })
      previousNode = targetNode
      previousWidth = logicNodeWidth
    })
    const routeGate = routeGateByFamily.get(trace.branch.routeFamilyKey) || routeGateNodes[0]
    const convergeOffset = Math.max(-34, Math.min(34, (previousNode.y - routeGate.y) * 0.32))
    graphEdges.push({
      source: previousNode,
      target: routeGate,
      sourceWidth: previousWidth,
      targetWidth: evalNodeWidth,
      color: trace.color,
      width: 2.25,
      relationLabel: 'route-evaluate',
      routeFamilyKey: trace.branch.routeFamilyKey,
      fullLabel: `${trace.branch.branchLabel}: evaluate within ${trace.branch.routeFamilyLabel}`,
      opacity: 0.72,
      sourceOffsetY: 0,
      targetOffsetY: convergeOffset,
      branchRef,
      branchLabel: trace.branch.branchLabel,
    })
  })

  const normalizeEdgeBundleKey = value => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w\u4e00-\u9fff]+/g, '')

  const edgeBundleMap = new Map()
  graphEdges.forEach(edge => {
    const relationKey = normalizeEdgeBundleKey(edge.relationLabel || edge.fullLabel || '关联') || 'relation'
    const routeKey = edge.routeFamilyKey || 'route'
    const groupKey = `${routeKey}::${edge.source.id}->${edge.target.id}::${relationKey}`
    if (!edgeBundleMap.has(groupKey)) {
      edgeBundleMap.set(groupKey, {
        ...edge,
        relationKey,
        branchRefs: [],
        branchLabels: [],
        fullLabels: [],
        colors: [],
        sourceOffsetSum: 0,
        targetOffsetSum: 0,
        supportCount: 0,
      })
    }
    const bundle = edgeBundleMap.get(groupKey)
    bundle.supportCount += 1
    bundle.sourceOffsetSum += Number(edge.sourceOffsetY || 0)
    bundle.targetOffsetSum += Number(edge.targetOffsetY || 0)
    if (edge.color && !bundle.colors.includes(edge.color)) bundle.colors.push(edge.color)
    if (edge.branchRef && !bundle.branchRefs.includes(edge.branchRef)) bundle.branchRefs.push(edge.branchRef)
    if (edge.branchLabel && !bundle.branchLabels.includes(edge.branchLabel)) bundle.branchLabels.push(edge.branchLabel)
    if (edge.fullLabel && !bundle.fullLabels.includes(edge.fullLabel)) bundle.fullLabels.push(edge.fullLabel)
  })

  const bundledEdges = Array.from(edgeBundleMap.values()).map(bundle => {
    const shared = bundle.supportCount > 1
    return {
      ...bundle,
      color: shared ? bundle.colors[0] || bundle.color : bundle.color,
      sourceOffsetY: bundle.sourceOffsetSum / Math.max(1, bundle.supportCount),
      targetOffsetY: bundle.targetOffsetSum / Math.max(1, bundle.supportCount),
      width: shared ? Math.min(7, 2.4 + bundle.supportCount * 0.72) : bundle.width,
      opacity: shared ? 0.88 : bundle.opacity,
      label: shared ? `×${bundle.supportCount} ${formatThoughtRefsForBadge(bundle.branchRefs)}` : '',
      fullLabel: shared
        ? [
          `${bundle.supportCount} Thought branches share this edge inside one logic route`,
          `Route: ${bundle.routeFamilyKey || 'route'}`,
          `Relation: ${bundle.relationLabel || '关联'}`,
          `Sources: ${bundle.branchLabels.join(', ')}`,
          ...bundle.fullLabels.slice(0, 8),
        ].filter(Boolean).join('\n')
        : (bundle.fullLabels[0] || bundle.fullLabel),
    }
  })

  const clampPortOffset = (value, limit = 34) => Math.max(-limit, Math.min(limit, value))
  const assignNodeEdgePorts = (edges) => {
    const outgoing = new Map()
    const incoming = new Map()
    edges.forEach(edge => {
      if (!edge?.source?.id || !edge?.target?.id) return
      if (!outgoing.has(edge.source.id)) outgoing.set(edge.source.id, [])
      if (!incoming.has(edge.target.id)) incoming.set(edge.target.id, [])
      outgoing.get(edge.source.id).push(edge)
      incoming.get(edge.target.id).push(edge)
    })

    outgoing.forEach(edgeList => {
      const ordered = [...edgeList].sort((a, b) => {
        if (Math.abs(a.target.y - b.target.y) > 0.1) return a.target.y - b.target.y
        return a.target.x - b.target.x
      })
      const count = ordered.length
      if (count <= 1) return
      const gap = Math.min(18, Math.max(10, 72 / Math.max(1, count - 1)))
      ordered.forEach((edge, index) => {
        const portOffset = clampPortOffset((index - (count - 1) / 2) * gap)
        edge.sourceOffsetY = Number(edge.sourceOffsetY || 0) + portOffset
      })
    })

    incoming.forEach(edgeList => {
      const ordered = [...edgeList].sort((a, b) => {
        if (Math.abs(a.source.y - b.source.y) > 0.1) return a.source.y - b.source.y
        return a.source.x - b.source.x
      })
      const count = ordered.length
      if (count <= 1) return
      const gap = Math.min(18, Math.max(10, 72 / Math.max(1, count - 1)))
      ordered.forEach((edge, index) => {
        const portOffset = clampPortOffset((index - (count - 1) / 2) * gap)
        edge.targetOffsetY = Number(edge.targetOffsetY || 0) + portOffset
      })
    })
  }
  assignNodeEdgePorts(bundledEdges)

  const groupedEdges = new Map()
  bundledEdges.forEach(edge => {
    const groupKey = `${edge.source.id}->${edge.target.id}`
    if (!groupedEdges.has(groupKey)) groupedEdges.set(groupKey, [])
    groupedEdges.get(groupKey).push(edge)
  })
  bundledEdges.forEach(edge => {
    const groupKey = `${edge.source.id}->${edge.target.id}`
    const siblingEdges = groupedEdges.get(groupKey) || [edge]
    const siblingIndex = siblingEdges.indexOf(edge)
    const offsetY = siblingEdges.length > 1
      ? (siblingIndex - (siblingEdges.length - 1) / 2) * 5
      : 0
    drawBundledEdge(edge, offsetY)
  })

  routeGateNodes.forEach(routeGate => {
    drawBundledEdge({
      source: routeGate,
      target: result,
      color: routeGate.color || '#0F766E',
      colors: routeGate.colors,
      busLane: true,
      width: Math.min(5.5, 2.6 + Number(routeGate.branchCount || 1) * 0.35),
      sourceWidth: evalNodeWidth,
      targetWidth: resultNodeWidth,
      label: routeGate.branchCount > 1 ? `×${routeGate.branchCount}` : '',
      fullLabel: `${routeGate.title}: route-level evidence enters final answer selection`,
      opacity: 0.82,
    })
  })

  drawNodeGroup(mergedNodes, {
    width: logicNodeWidth,
    height: logicNodeHeight,
    titleLimit: 18,
    compact: true,
  })
  drawNodeGroup(routeGateNodes, {
    width: evalNodeWidth,
    height: 62,
    titleLimit: 12,
    compact: true,
  })
  drawNodeGroup([root], { width: rootNodeWidth, height: 98, titleLimit: 24, subtitleLimit: 28, microLimit: 34 })
  drawNodeGroup([result], { width: resultNodeWidth, height: 92, titleLimit: 24, subtitleLimit: 26, microLimit: 30 })

  const mergeNote = svg.append('text')
    .attr('x', 24)
    .attr('y', 156)
    .attr('fill', '#64748B')
    .attr('font-size', 10.5)
    .attr('font-weight', 800)
    .text('Node colors encode semantic roles; line colors encode different Thought paths, with shared edges drawn as parallel colored lanes.')
  textWithHalo(mergeNote, '#64748B')
}

const codDetailItems = computed(() => {
  const items = []
  const llmAnswer = String(codResult.value?.llm_cod_direct_answer || '').trim()
  const codAnswer = codDirectAnswerContent.value
  const omdAnswer = omdDirectAnswerContent.value
  const logicChain = stripInlineCitationAnchors(codResult.value?.logic_chain_derivation)

  if (llmAnswer) {
    items.push({
      key: 'llm-cod',
      tone: 'llm',
      type: 'markdown',
      title: 'LLMs + CoD 直接回答',
      kicker: `LLM refined CoD answer${codPrimaryInlineCitationCount.value ? ` · ${codPrimaryInlineCitationCount.value} inline citations` : ''}`,
      content: llmAnswer
    })
  }
  if (codAnswer) {
    items.push({
      key: 'cod-direct',
      tone: 'cod',
      type: 'markdown',
      title: 'CoD 直接回答',
      kicker: 'Path-grounded direct answer',
      content: codAnswer
    })
  }
  if (omdAnswer) {
    items.push({
      key: 'omd-direct',
      tone: 'omd',
      type: 'markdown',
      title: 'OMD 本体增强直接回答',
      kicker: 'Ontology-aided direct answer',
      content: omdAnswer
    })
  }
  if (qaMetricCards.value.length) {
    items.push({
      key: 'metrics',
      tone: 'metrics',
      type: 'metrics',
      title: '量化指标',
      kicker: 'OMD quantitative metrics',
      content: ''
    })
  }
  if (logicChain) {
    items.push({
      key: 'logic-chain',
      tone: 'logic',
      type: 'markdown',
      title: '详细逻辑链推导',
      kicker: 'Detailed logic derivation',
      content: logicChain
    })
  }
  if (codReferences.value.length) {
    items.push({
      key: 'references',
      tone: 'references',
      type: 'markdown',
      title: 'References',
      kicker: 'Citation-aware evidence targets',
      content: codReferenceMarkdown.value
    })
  }
  return items
})

const codGlobalOverviewItems = computed(() => (
  codDetailItems.value
))

const selectedCodDetail = computed(() => {
  return codDetailItems.value.find(item => item.key === selectedCodDetailKey.value) || null
})

const openCodDetail = (key) => {
  if (!codDetailItems.value.some(item => item.key === key)) return
  selectedCodDetailKey.value = key
}

const closeCodDetail = () => {
  selectedCodDetailKey.value = null
}

const openCodGlobalOverview = () => {
  if (!codDetailItems.value.length) return
  selectedCodDetailKey.value = null
  codReportPreviewOpen.value = false
  codGlobalOverviewOpen.value = true
}

const closeCodGlobalOverview = () => {
  codGlobalOverviewOpen.value = false
  codReportPreviewOpen.value = false
  codRoutingTraceOpen.value = false
  selectedRoutingMetricKey.value = null
}

const openCodRoutingTrace = () => {
  if (!codReasoningRoute.value) return
  codRoutingTraceOpen.value = true
  renderCodRoutingD3Graph()
}

const closeCodRoutingTrace = () => {
  codRoutingTraceOpen.value = false
  selectedRoutingMetricKey.value = null
}

const openRoutingMetricDetail = (key) => {
  if (!routingMetricDefinitions[key]) return
  selectedRoutingMetricKey.value = key
}

const closeRoutingMetricDetail = () => {
  selectedRoutingMetricKey.value = null
}

const openQaMetricFromGlobal = (key) => {
  openQaMetric(key)
}

const toMetricNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const clampMetric = (value) => Math.max(0, Math.min(1, toMetricNumber(value)))

const formatMetricPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${(toMetricNumber(value) * 100).toFixed(2)}%`
}

const qaMetricShortLabels = {
  confidence: '可信',
  relevance: '相关',
  accuracy: '准确',
  'llms-as-judge': 'Judge',
  'path-validity': '路径',
  'evidence-strength': '证据',
  'condition-completeness': '条件',
  'evidence-coverage': '覆盖',
  'ontology-alignment': '本体',
  'risk-control': '风险',
  'exploration-value': '探索'
}

const qaRadarMetricKeys = [
  'confidence',
  'relevance',
  'accuracy',
  'path-validity',
  'evidence-strength',
  'condition-completeness',
  'ontology-alignment',
  'risk-control'
]

const qaMetricDomainDefinitions = [
  {
    key: 'reliability',
    label: 'Reliability / 回答可信性',
    tone: 'reliability',
    metricKeys: ['confidence', 'accuracy', 'relevance', 'llms-as-judge']
  },
  {
    key: 'evidence',
    label: 'Evidence Maturity / 证据成熟度',
    tone: 'evidence',
    metricKeys: ['path-validity', 'evidence-strength', 'condition-completeness', 'evidence-coverage']
  },
  {
    key: 'ontology',
    label: 'Ontology Alignment / 本体一致性',
    tone: 'ontology',
    metricKeys: ['ontology-alignment', 'path-validity', 'condition-completeness']
  },
  {
    key: 'risk',
    label: 'Risk & Discovery / 风险与探索',
    tone: 'risk',
    metricKeys: ['risk-control', 'exploration-value']
  }
]

const metricBandForValue = (value) => {
  if (value >= 0.88) {
    return {
      band: 'excellent',
      label: 'High-confidence evidence band',
      note: '核心证据、路径合法性与本体对齐均处于高可信区间，可作为强支撑结论展示。'
    }
  }
  if (value >= 0.75) {
    return {
      band: 'strong',
      label: 'Robust evidence band',
      note: '指标整体稳定，适合表达为有条件的机制性结论，并保留实验窗口约束。'
    }
  }
  if (value >= 0.6) {
    return {
      band: 'moderate',
      label: 'Moderate evidence band',
      note: '证据已有结构化支撑，但仍需要补充条件、反例或跨样本验证。'
    }
  }
  return {
    band: 'weak',
    label: 'Evidence gap band',
    note: '当前图谱证据不足，建议仅作为 hypothesis-level 线索。'
  }
}

const qaMetricVisualRows = computed(() => {
  return qaMetricCards.value.map(metric => {
    const value = clampMetric(metric.value)
    const band = metricBandForValue(value)
    return {
      ...metric,
      value,
      percent: formatMetricPercent(value),
      width: `${Math.round(value * 100)}%`,
      band: band.band,
      bandLabel: band.label,
      shortLabel: qaMetricShortLabels[metric.key] || metric.label
    }
  })
})

const qaMetricValueMap = computed(() => {
  return new Map(qaMetricVisualRows.value.map(metric => [metric.key, metric.value]))
})

const getQaMetricVisualValue = (key, fallback = 0) => {
  return qaMetricValueMap.value.has(key) ? qaMetricValueMap.value.get(key) : fallback
}

const meanVisualMetric = (keys) => {
  const values = keys
    .map(key => qaMetricValueMap.value.get(key))
    .filter(value => Number.isFinite(Number(value)))
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const qaMetricDomainGroups = computed(() => {
  return qaMetricDomainDefinitions.map(group => {
    const value = clampMetric(meanVisualMetric(group.metricKeys))
    return {
      ...group,
      value,
      width: `${Math.round(value * 100)}%`,
      band: metricBandForValue(value).band
    }
  })
})

const qaMetricAcademicBand = computed(() => {
  const value = clampMetric(
    meanVisualMetric(['confidence', 'accuracy', 'evidence-strength', 'condition-completeness', 'ontology-alignment', 'risk-control'])
  )
  return {
    value,
    ...metricBandForValue(value)
  }
})

const radarCoordinate = (index, count, value, radius = 82) => {
  const angle = (Math.PI * 2 * index) / Math.max(count, 1) - Math.PI / 2
  const distance = radius * value
  return {
    x: Number((120 + Math.cos(angle) * distance).toFixed(2)),
    y: Number((120 + Math.sin(angle) * distance).toFixed(2))
  }
}

const qaRadarMetrics = computed(() => {
  const rowsByKey = new Map(qaMetricVisualRows.value.map(metric => [metric.key, metric]))
  return qaRadarMetricKeys
    .map(key => rowsByKey.get(key))
    .filter(Boolean)
})

const qaRadarAxes = computed(() => {
  const metrics = qaRadarMetrics.value
  const count = metrics.length
  return metrics.map((metric, index) => {
    const axis = radarCoordinate(index, count, 1, 84)
    const label = radarCoordinate(index, count, 1, 104)
    return {
      ...metric,
      axisX: axis.x,
      axisY: axis.y,
      labelX: label.x,
      labelY: label.y,
      shortLabel: metric.shortLabel
    }
  })
})

const qaRadarPoints = computed(() => {
  const metrics = qaRadarMetrics.value
  const count = metrics.length
  return metrics.map((metric, index) => ({
    ...metric,
    ...radarCoordinate(index, count, metric.value, 84)
  }))
})

const qaRadarPolygonPoints = computed(() => {
  return qaRadarPoints.value.map(point => `${point.x},${point.y}`).join(' ')
})

const qaRadarRings = computed(() => {
  const count = qaRadarMetrics.value.length
  if (count < 3) return []
  return [0.25, 0.5, 0.75, 1].map(level => ({
    level,
    points: qaRadarMetrics.value
      .map((_, index) => {
        const point = radarCoordinate(index, count, level, 84)
        return `${point.x},${point.y}`
      })
      .join(' ')
  }))
})

const formatMetricDecimal = (value) => toMetricNumber(value).toFixed(4)

const meanMetric = (values, fallback = 0) => {
  const numbers = values.map(value => Number(value)).filter(value => Number.isFinite(value))
  if (!numbers.length) return fallback
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

const topMeanMetric = (values, topN = 3, fallback = 0) => {
  const numbers = values.map(value => Number(value)).filter(value => Number.isFinite(value)).sort((a, b) => b - a)
  if (!numbers.length) return fallback
  const selected = numbers.slice(0, topN)
  return selected.reduce((sum, value) => sum + value, 0) / selected.length
}

const getVerifiedMetricValues = (field) => {
  return (codResult.value?.verified_paths || [])
    .filter(path => ['keep', 'revise'].includes(path.decision))
    .map(path => toMetricNumber(path[field], 0))
}

const getMetric = (metrics, key, fallback = 0) => clampMetric(metrics?.[key] ?? fallback)

const weightedRows = (items) => items.map(item => ({
  ...item,
  value: clampMetric(item.value),
  weight: item.weight ?? null,
  contribution: item.weight === null || item.weight === undefined
    ? null
    : clampMetric(item.value) * Number(item.weight)
}))

const weightedSubtotal = (rows) => {
  const values = rows
    .map(row => row.contribution)
    .filter(value => value !== null && Number.isFinite(Number(value)))
  return values.reduce((sum, value) => sum + Number(value), 0)
}

const buildQaMetricRows = (key, metrics) => {
  const plan = codResult.value?.debug_query_plan || {}
  const targetObjectCoverage = Math.min(1, Number(plan.target_objects?.length || 0) / 8)
  const pathPatternCoverage = Math.min(1, Number(plan.required_path_patterns?.length || 0) / 4)
  const validityValues = getVerifiedMetricValues('path_validity')
  const evidenceValues = getVerifiedMetricValues('evidence_sufficiency')
  const conditionValues = getVerifiedMetricValues('condition_match')
  const noveltyValues = getVerifiedMetricValues('novelty_score')
  const contradictionRisk = getMetric(metrics, 'contradiction_risk_score')
  const lowContradiction = clampMetric(1 - contradictionRisk)
  const lowRisk = clampMetric(1 - 0.55 * contradictionRisk)
  const lowMissingPressure = clampMetric(1 - getMetric(metrics, 'missing_evidence_pressure_score'))
  const llmJudge = metrics?.llms_as_judge || {}

  const rowSets = {
    confidence: [
      ['路径有效性', 'path_validity_score', 0.18],
      ['证据强度', 'evidence_strength_score', 0.17],
      ['条件完整性', 'condition_completeness_score', 0.15],
      ['问题相关性', 'relevance_score', 0.13],
      ['社区支持', 'community_support_score', 0.12],
      ['风险控制', 'risk_control_score', 0.10],
      ['本体对齐', 'ontology_alignment_score', 0.08],
      ['支持上下文', 'support_context_score', 0.07]
    ].map(([label, metricKey, weight]) => ({ label, value: getMetric(metrics, metricKey), weight })),
    relevance: [
      { label: '实体密度', value: getMetric(metrics, 'entity_density'), weight: 0.23 },
      { label: '目标对象覆盖', value: targetObjectCoverage, weight: 0.18 },
      { label: '路径模板覆盖', value: pathPatternCoverage, weight: 0.15 },
      { label: '语义抽象度', value: getMetric(metrics, 'semantic_abstraction_score'), weight: 0.13 },
      { label: '社区支持', value: getMetric(metrics, 'community_support_score'), weight: 0.11 },
      { label: '计划特异性', value: getMetric(metrics, 'plan_specificity_score'), weight: 0.10 },
      { label: '路径多样性', value: getMetric(metrics, 'path_diversity_score'), weight: 0.06 },
      { label: '条件细节', value: getMetric(metrics, 'condition_detail_score'), weight: 0.04 }
    ],
    accuracy: [
      ['置信度', 'confidence_score', 0.24],
      ['证据强度', 'evidence_strength_score', 0.18],
      ['条件完整性', 'condition_completeness_score', 0.16],
      ['路径有效性', 'path_validity_score', 0.14],
      ['风险控制', 'risk_control_score', 0.11],
      ['本体对齐', 'ontology_alignment_score', 0.09],
      ['分数离散控制', 'score_dispersion_control_score', 0.08]
    ].map(([label, metricKey, weight]) => ({ label, value: getMetric(metrics, metricKey), weight })),
    'llms-as-judge': [
      { label: 'semantic judge score', value: getMetric(metrics, 'llms_as_judge_score'), weight: 1.0 },
      { label: 'multi-hop reasoning', value: llmJudge.requires_multi_hop_reasoning ? 1 : 0, weight: null },
      { label: 'multiple explanations', value: llmJudge.has_multiple_possible_explanations ? 1 : 0, weight: null },
      { label: 'hypothesis exploration', value: llmJudge.needs_hypothesis_exploration ? 1 : 0, weight: null },
      { label: 'ambiguity score', value: llmJudge.ambiguity_score ?? 0, weight: null }
    ],
    'path-validity': [
      { label: '平均路径有效性', value: meanMetric(validityValues, 0.35), weight: 0.52 },
      { label: 'Top3 路径有效性', value: topMeanMetric(validityValues, 3, meanMetric(validityValues, 0.35)), weight: 0.13 },
      { label: '路径复杂度', value: getMetric(metrics, 'path_complexity_score'), weight: 0.10 },
      { label: '路径多样性', value: getMetric(metrics, 'path_diversity_score'), weight: 0.08 },
      { label: '计划特异性', value: getMetric(metrics, 'plan_specificity_score'), weight: 0.07 },
      { label: '路径支持', value: getMetric(metrics, 'path_support_score'), weight: 0.06 },
      { label: '低缺失压力', value: lowMissingPressure, weight: 0.04 }
    ],
    'evidence-strength': [
      { label: '平均证据充分性', value: meanMetric(evidenceValues, 0.20), weight: 0.46 },
      { label: 'Top3 证据充分性', value: topMeanMetric(evidenceValues, 3, meanMetric(evidenceValues, 0.20)), weight: 0.15 },
      { label: '证据细节', value: getMetric(metrics, 'evidence_detail_score'), weight: 0.18 },
      { label: '社区广度', value: getMetric(metrics, 'community_breadth_score'), weight: 0.08 },
      { label: '路径支持', value: getMetric(metrics, 'path_support_score'), weight: 0.07 },
      { label: '分数离散控制', value: getMetric(metrics, 'score_dispersion_control_score'), weight: 0.06 }
    ],
    'condition-completeness': [
      { label: '平均条件匹配', value: meanMetric(conditionValues, 0.25), weight: 0.48 },
      { label: 'Top3 条件匹配', value: topMeanMetric(conditionValues, 3, meanMetric(conditionValues, 0.25)), weight: 0.16 },
      { label: '条件细节', value: getMetric(metrics, 'condition_detail_score'), weight: 0.14 },
      { label: '计划特异性', value: getMetric(metrics, 'plan_specificity_score'), weight: 0.09 },
      { label: '路径一致性', value: getMetric(metrics, 'path_consistency_score'), weight: 0.07 },
      { label: '证据细节', value: getMetric(metrics, 'evidence_detail_score'), weight: 0.06 }
    ],
    'evidence-coverage': [
      ['路径支持', 'path_support_score', 0.27],
      ['证据强度', 'evidence_strength_score', 0.26],
      ['条件完整性', 'condition_completeness_score', 0.17],
      ['社区支持', 'community_support_score', 0.12],
      ['证据细节', 'evidence_detail_score', 0.10],
      ['路径多样性', 'path_diversity_score', 0.08]
    ].map(([label, metricKey, weight]) => ({ label, value: getMetric(metrics, metricKey), weight })),
    'ontology-alignment': [
      { label: '路径有效性', value: getMetric(metrics, 'path_validity_score'), weight: 0.25 },
      { label: '实体密度', value: getMetric(metrics, 'entity_density'), weight: 0.18 },
      { label: '路径模板覆盖', value: pathPatternCoverage, weight: 0.14 },
      { label: '语义抽象度', value: getMetric(metrics, 'semantic_abstraction_score'), weight: 0.12 },
      { label: '计划特异性', value: getMetric(metrics, 'plan_specificity_score'), weight: 0.11 },
      { label: '路径多样性', value: getMetric(metrics, 'path_diversity_score'), weight: 0.08 },
      { label: '分数离散控制', value: getMetric(metrics, 'score_dispersion_control_score'), weight: 0.07 },
      { label: '低冲突风险', value: lowContradiction, weight: 0.05 }
    ],
    'risk-control': [
      { label: '低冲突风险', value: lowRisk, weight: 0.35 },
      { label: '本体对齐', value: getMetric(metrics, 'ontology_alignment_score'), weight: 0.18 },
      { label: '条件完整性', value: getMetric(metrics, 'condition_completeness_score'), weight: 0.13 },
      { label: '证据强度', value: getMetric(metrics, 'evidence_strength_score'), weight: 0.11 },
      { label: '路径一致性', value: getMetric(metrics, 'path_consistency_score'), weight: 0.09 },
      { label: '社区支持', value: getMetric(metrics, 'community_support_score'), weight: 0.07 },
      { label: '分数离散控制', value: getMetric(metrics, 'score_dispersion_control_score'), weight: 0.07 }
    ],
    'exploration-value': [
      { label: '路径新颖性', value: meanMetric(noveltyValues, 0.35), weight: 0.24 },
      { label: '语义抽象度', value: getMetric(metrics, 'semantic_abstraction_score'), weight: 0.18 },
      { label: '问题相关性', value: getMetric(metrics, 'relevance_score'), weight: 0.17 },
      { label: '社区支持', value: getMetric(metrics, 'community_support_score'), weight: 0.13 },
      { label: '风险控制', value: getMetric(metrics, 'risk_control_score'), weight: 0.10 },
      { label: '机会密度', value: getMetric(metrics, 'community_opportunity_density_score'), weight: 0.08 },
      { label: '计划特异性', value: getMetric(metrics, 'plan_specificity_score'), weight: 0.06 },
      { label: '候选新颖性', value: topMeanMetric(noveltyValues, 3, meanMetric(noveltyValues, 0.35)), weight: 0.04 }
    ]
  }

  return weightedRows(rowSets[key] || [])
}

const buildQaMetricExtraRows = (key, metrics) => {
  const verifiedCount = codResult.value?.verified_paths?.length || 0
  const keptCount = metrics?.kept_path_count ?? (codResult.value?.verified_paths || []).filter(path => ['keep', 'revise'].includes(path.decision)).length
  const llmJudge = metrics?.llms_as_judge || {}
  const rows = [
    { label: '参与路径', value: `${keptCount} keep/revise / ${verifiedCount} verified` },
    { label: '社区报告', value: `${metrics?.community_report_count ?? 0}` },
    { label: '质量上下文', value: formatMetricPercent(metrics?.quality_context_score) },
    { label: '核心证据成熟度', value: formatMetricPercent(metrics?.core_evidence_maturity_score) }
  ]
  if (key === 'llms-as-judge') {
    rows.unshift(
      { label: 'judge status', value: llmJudge.status || 'unknown' },
      { label: 'judge method', value: llmJudge.method || 'semantic_complexity_judge' },
      { label: 'model', value: llmJudge.model || 'heuristic fallback' },
      { label: 'task goal', value: llmJudge.task_goal || 'direct_qa' },
      { label: 'rationale', value: llmJudge.rationale || '—' }
    )
  }
  if (key === 'evidence-strength') {
    rows.push({ label: 'raw evidence strength', value: formatMetricPercent(metrics?.raw_evidence_strength_score) })
  }
  if (key === 'condition-completeness') {
    rows.push({ label: 'raw condition completeness', value: formatMetricPercent(metrics?.raw_condition_completeness_score) })
  }
  if (key === 'risk-control') {
    rows.push({ label: 'contradiction risk', value: formatMetricPercent(metrics?.contradiction_risk_score) })
  }
  if (key === 'relevance') {
    rows.push({ label: 'target objects', value: `${codResult.value?.debug_query_plan?.target_objects?.length || 0}` })
  }
  if (key === 'ontology-alignment') {
    rows.push({ label: 'path patterns', value: `${codResult.value?.debug_query_plan?.required_path_patterns?.length || 0}` })
  }
  if (metrics?.grade) {
    rows.push({ label: '量化等级', value: metrics.grade })
  }
  return rows
}

const selectedQaMetricDetail = computed(() => {
  const key = selectedQaMetricKey.value
  const metrics = codResult.value?.qa_quantitative_metrics
  const definition = qaMetricDefinitions[key]
  if (!key || !metrics || !definition) return null
  const rows = buildQaMetricRows(key, metrics)
  const baseValue = clampMetric(weightedSubtotal(rows))
  return {
    key,
    label: definition.label,
    value: getMetric(metrics, definition.valueKey),
    baseValue,
    description: definition.description,
    formula: definition.formula,
    rows,
    extraRows: buildQaMetricExtraRows(key, metrics),
    sampleText: `${metrics.kept_path_count || 0} 路径 / ${metrics.community_report_count || 0} 社区`,
    note: key === 'llms-as-judge'
      ? '该指标来自 adaptive reasoning routing 的语义 judge trace；LLM 可用时记录 LLM as Judge 结果，关闭、超时或不可用时展示启发式语义评估结果。'
      : `${metrics.score_precision || '0-1 score stored for audit.'} 后端最终值会在上述线性基础值上叠加 OMD 上下文质量校准和核心证据成熟度优先增强，因此最终值以接口返回值为准。`
  }
})

const selectedQaMetricStrictTrace = computed(() => {
  const key = selectedQaMetricKey.value
  const trace = codResult.value?.qa_quantitative_metrics?.strict_metric_derivations?.[key]
  return trace || null
})

const selectedQaProfessionalDetail = computed(() => {
  if (!qaMetricProfessionalOpen.value) return null
  return selectedQaMetricStrictTrace.value
})

const formatStrictNumber = (value, digits = 8) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toFixed(digits)
}

const formatStrictScalar = (value) => {
  if (value === null || value === undefined) return '—'
  const number = Number(value)
  if (Number.isFinite(number)) return formatStrictNumber(number)
  return String(value)
}

const strictObjectRows = (value) => {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).map(([label, itemValue]) => ({ label, value: itemValue }))
}

const strictOperationLabel = (operation) => {
  const labels = {
    linear_clamp01: '线性加权后执行 C(x)=min(1,max(0,x))',
    calibrated_omd_score: 'OMD 本体增强校准',
    contextual_quality_lift: '质量上下文非线性提升',
    priority_metric_lift: '核心证据成熟度优先增强',
    closed_form_clamp01: '闭式表达式后执行 C(x)=min(1,max(0,x))'
  }
  return labels[operation] || operation || '严格计算步骤'
}

const handleQaMetricClick = (event) => {
  const referenceTarget = event.target?.closest?.('.cod-reference-anchor')
  if (referenceTarget) {
    openCodReference(referenceTarget.dataset?.referenceId)
    event.preventDefault()
    event.stopPropagation()
    return
  }
  const target = event.target?.closest?.('.qa-metric-chip')
  if (!target) return
  const key = target.dataset?.metricKey
  openQaMetric(key)
  event.preventDefault()
}

const openQaMetric = (key) => {
  if (!qaMetricDefinitions[key]) return
  selectedQaMetricKey.value = key
  qaMetricProfessionalOpen.value = false
}

const openQaMetricProfessional = () => {
  if (!selectedQaMetricStrictTrace.value) return
  qaMetricProfessionalOpen.value = true
}

const closeQaMetricProfessional = () => {
  qaMetricProfessionalOpen.value = false
}

const closeQaMetricModal = () => {
  qaMetricProfessionalOpen.value = false
  selectedQaMetricKey.value = null
}

const handleQaMetricEscape = (event) => {
  if (event.key !== 'Escape') return
  if (codLlmConfirmOpen.value) {
    closeCodLlmConfirm()
    return
  }
  if (qaFeedbackModalOpen.value) {
    closeQaFeedbackModal()
    return
  }
  if (selectedRoutingMetricKey.value) {
    closeRoutingMetricDetail()
    return
  }
  if (codRoutingTraceOpen.value) {
    closeCodRoutingTrace()
    return
  }
  if (qaMetricProfessionalOpen.value) {
    closeQaMetricProfessional()
    return
  }
  if (selectedQaMetricKey.value) {
    closeQaMetricModal()
    return
  }
  if (selectedCodDetailKey.value) {
    closeCodDetail()
    return
  }
  if (codGlobalOverviewOpen.value) {
    closeCodGlobalOverview()
  }
}

const handleCodLlmToggleClick = () => {
  if (isCodQuerying.value) return
  if (codLlmEnabled.value) {
    codLlmEnabled.value = false
    codAnswerRefinementEnabled.value = false
    codLlmConfirmOpen.value = false
    return
  }
  codLlmConfirmOpen.value = true
}

const closeCodLlmConfirm = () => {
  codLlmConfirmOpen.value = false
}

const confirmEnableCodLlms = () => {
  codLlmEnabled.value = true
  codAnswerRefinementEnabled.value = true
  codLlmConfirmOpen.value = false
}

const topSubgraphScore = computed(() => {
  const top = codResult.value?.retrieved_subgraphs?.[0]?.subgraph_score || 0
  return `top ${Number(top).toFixed(2)}`
})

const showCodAuditDetails = computed(() => Boolean(codResult.value?.debug_trace?.answer_generation?.show_audit_appendix))

const formatCodJson = (value) => {
  if (!value) return '{}'
  return JSON.stringify(value, null, 2)
}

const createCodProgressSteps = () => ([
  ...(codAnswerRefinementEnabled.value
    ? [{
      key: 'llm_initial_question_answer',
      label: 'LLM Initial Answer（初步回答）',
      detail: '先调用 LLM 分析输入问题并生成初步回答，作为后续 CoD 检索融合的起点',
      status: 'pending',
      statusText: '等待中',
      elapsedMs: null
    }]
    : []),
  {
    key: 'query_decomposition',
    label: 'Query Decomposition',
    detail: '规则解析实体、材料体系、性能目标、机理目标和约束条件',
    status: 'pending',
    statusText: '等待中',
    elapsedMs: null
  },
  {
    key: 'llm_free_subgraph_retrieval',
    label: 'LLM-free Subgraph Retrieval',
    detail: '基于实体匹配、关系意图、证据质量和图扩展召回相关子图',
    status: 'pending',
    statusText: '等待中',
    elapsedMs: null
  },
  {
    key: 'adaptive_reasoning_routing',
    label: 'Adaptive Reasoning Router',
    detail: codReasoningMode.value === 'auto'
      ? '分析 KG 子图结构复杂度和问题语义复杂度，自动选择 CoT 或 ToT'
      : `使用 ${codReasoningModeLabel.value} 模式，并记录结构/语义复杂度评分`,
    status: 'pending',
    statusText: '等待中',
    elapsedMs: null
  },
  {
    key: 'candidate_path_reconstruction',
    label: 'Candidate Path Reconstruction',
    detail: '把子图重构为配方/工艺/机理/证据候选路径',
    status: 'pending',
    statusText: '等待中',
    elapsedMs: null
  },
  {
    key: 'lightweight_path_verification',
    label: 'Lightweight Path Verification',
    detail: '启发式验证路径方向、证据充分性、条件匹配和冲突风险',
    status: 'pending',
    statusText: '等待中',
    elapsedMs: null
  },
  {
    key: 'reasoning_path_selection',
    label: 'Reasoning Path Selection',
    detail: '根据路由结果筛选进入 CoT 线性验证或 ToT 多分支比较的 KG 路径',
    status: 'pending',
    statusText: '等待中',
    elapsedMs: null
  },
  {
    key: 'path_grounded_answer_generation',
    label: 'Path-grounded Answer Generation',
    detail: '只基于 keep/revise 路径生成回答和 graph mutation proposals',
    status: 'pending',
    statusText: '等待中',
    elapsedMs: null
  },
  ...(codAnswerRefinementEnabled.value
      ? [{
        key: 'llm_answer_refinement',
        label: 'Answer Synthesis（受约束综合）',
        detail: '融合 LLM 初步回答、CoD 检索路径、accepted claims 和 OMD metrics，生成最终 LLMs + CoD 直接回答',
        status: 'pending',
        statusText: '等待中',
        elapsedMs: null
      }]
    : [])
])

const codProgressPercent = computed(() => {
  if (!codProgressSteps.value.length) return 0
  const completed = codProgressSteps.value.filter(step => ['completed', 'skipped', 'fallback'].includes(step.status)).length
  const inProgress = codProgressSteps.value.some(step => step.status === 'in_progress') ? 0.5 : 0
  return Math.min(100, Math.round(((completed + inProgress) / codProgressSteps.value.length) * 100))
})

const formatDurationMs = (ms) => {
  const value = Number(ms || 0)
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} s`
}

const startCodProgress = () => {
  stopCodProgress()
  codProgressSteps.value = createCodProgressSteps()
  codElapsedSeconds.value = 0
  codQueryStartedAt = Date.now()
  updateCodProgressEstimate()
  codProgressTimer = setInterval(updateCodProgressEstimate, 700)
}

const stopCodProgress = () => {
  if (codProgressTimer) {
    clearInterval(codProgressTimer)
    codProgressTimer = null
  }
}

const updateCodProgressEstimate = () => {
  if (!codQueryStartedAt || !codProgressSteps.value.length) return
  const elapsed = Date.now() - codQueryStartedAt
  codElapsedSeconds.value = Math.max(0, Math.floor(elapsed / 1000))
  const baseThresholds = [800, 1800, 2800, 4100, 5400, 6800]
  const thresholds = codAnswerRefinementEnabled.value
    ? [800, 1800, 2800, 4000, 5300, 6700, 8200, 10000]
    : baseThresholds
  const nextThresholdIndex = thresholds.findIndex(threshold => elapsed < threshold)
  const activeIndex = nextThresholdIndex >= 0
    ? Math.min(nextThresholdIndex, codProgressSteps.value.length - 1)
    : codProgressSteps.value.length - 1
  codProgressSteps.value = codProgressSteps.value.map((step, idx) => ({
    ...step,
    status: idx < activeIndex ? 'completed' : idx === activeIndex ? 'in_progress' : 'pending',
    statusText: idx < activeIndex ? '已完成' : idx === activeIndex ? '执行中' : '等待中'
  }))
}

const applyCodTraceProgress = (trace) => {
  const stageMap = new Map((trace?.stages || []).map(stage => [stage.stage, stage]))
  const initialAnswerTrace = trace?.llm_initial_question_answer || trace?.answer_generation?.llm_initial_question_answer || {}
  const refinementTrace = trace?.answer_generation?.llm_answer_refinement || {}
  codProgressSteps.value = createCodProgressSteps().map(step => {
    const actual = stageMap.get(step.key)
    if (step.key === 'llm_initial_question_answer') {
      const status = initialAnswerTrace.status || actual?.status || 'skipped'
      if (status === 'applied') {
        return {
          ...step,
          status: 'completed',
          statusText: '已完成',
          detail: `LLM 已生成初步回答，长度 ${initialAnswerTrace.answer_chars || actual?.answer_chars || 0} 字符；后续由 CoD 检索内容校正和融合`,
          elapsedMs: actual?.elapsed_ms ?? null
        }
      }
      return {
        ...step,
        status: status === 'skipped' || status === 'disabled' ? 'skipped' : 'fallback',
        statusText: status === 'skipped' || status === 'disabled' ? '已跳过' : '已兜底继续',
        detail: `初步 LLM 回答未生成：${refinementFailureReason(initialAnswerTrace.reason || status)}；继续执行 CoD 检索和最终融合`,
        elapsedMs: actual?.elapsed_ms ?? null
      }
    }
    if (step.key === 'llm_answer_refinement') {
      const status = refinementTrace.status || actual?.status || 'skipped'
      if (status === 'applied' || status === 'applied_with_quality_warnings' || status === 'local_synthesis_applied') {
        return {
          ...step,
          status: 'completed',
          statusText: status === 'applied'
            ? '已完成'
            : status === 'applied_with_quality_warnings'
              ? '已生成（警告）'
              : '已生成（本地兜底）',
          detail: status === 'applied_with_quality_warnings'
            ? `LLM 已生成可用 CoD 直接回答；严格质量闸警告：${refinementTrace.quality_warning || refinementTrace.reason || 'quality_warning'}`
            : status === 'local_synthesis_applied'
            ? `最终 LLM 调用不可用或未通过质量闸；已使用 CoD grounding 本地融合生成 LLMs + CoD 直接回答（${refinementFailureReason(refinementTrace.reason || 'local_synthesis_applied')}）`
            : step.detail,
          elapsedMs: actual?.elapsed_ms ?? null
        }
      }
      if (status === 'fallback') {
        return {
          ...step,
          status: 'fallback',
          statusText: '已兜底',
          detail: refinementTraceNote(refinementTrace),
          elapsedMs: actual?.elapsed_ms ?? null
        }
      }
      if (['failed', 'error'].includes(status)) {
        return {
          ...step,
          status: 'fallback',
          statusText: '已兜底',
          detail: refinementTraceNote(refinementTrace),
          elapsedMs: actual?.elapsed_ms ?? null
        }
      }
      if (['skipped', 'disabled'].includes(status)) {
        return {
          ...step,
          status: 'skipped',
          statusText: '已跳过',
          detail: `${step.detail}（${refinementFailureReason(refinementTrace.reason || status)}）`,
          elapsedMs: actual?.elapsed_ms ?? null
        }
      }
    }
    return {
      ...step,
      status: actual ? 'completed' : 'completed',
      statusText: actual ? '已完成' : '已跳过或合并',
      detail: appendLlmUsageNote(step.detail, trace, step.key),
      elapsedMs: actual?.elapsed_ms ?? null
    }
  })
  codElapsedSeconds.value = Math.ceil(Number(trace?.total_elapsed_ms || 0) / 1000)
}

const refinementFailureReason = (reason) => {
  const labels = {
    missing_llm_api_key: '未配置 LLM API key，已使用 CoD grounding 本地融合生成直接回答',
    no_accepted_kg_paths: '没有可用于改写的 keep/revise KG 路径，已使用当前 CoD 结果生成直接回答',
    no_compact_grounding_payload: '可压缩 grounding payload 不足，已使用当前 CoD 结果生成直接回答',
    llm_timeout: '模型改写超时，已使用 CoD grounding 本地融合生成直接回答',
    llm_rate_limit: '模型服务限流，已使用 CoD grounding 本地融合生成直接回答',
    llm_provider_malformed_response: '模型服务返回非 JSON/损坏响应，已使用 CoD grounding 本地融合生成直接回答',
    llm_auth_failed: 'LLM API key 认证失败，已使用 CoD grounding 本地融合生成直接回答',
    llm_billing_or_quota_failed: 'LLM 额度或余额不可用，已使用 CoD grounding 本地融合生成直接回答',
    llm_forbidden: 'LLM 模型或服务无访问权限，已使用 CoD grounding 本地融合生成直接回答',
    llm_request_failed: '模型改写请求失败，已使用 CoD grounding 本地融合生成直接回答',
    empty_refined_answer: '模型返回为空，已使用 CoD grounding 本地融合生成直接回答',
    empty_refined_answer_after_cleaning: '模型输出清洗后为空，已使用 CoD grounding 本地融合生成直接回答',
    unexpected_refinement_error: 'LLM 改写异常，已使用 CoD grounding 本地融合生成直接回答',
    prior_llm_decomposition_failed: '前序 LLM 分解失败，已继续生成 CoD-grounded 直接回答',
    prior_llm_reasoning_judge_failed: '前序 LLM 语义评估失败，已继续生成 CoD-grounded 直接回答',
    prior_llm_path_verification_failed: '前序 LLM 路径验证失败，已继续生成 CoD-grounded 直接回答',
    local_synthesis_applied: '已使用 CoD grounding 本地融合生成直接回答',
    skipped: '未执行改写增强',
    disabled: '未开启改写增强'
  }
  return labels[reason] || 'LLM 改写不可用，已使用 CoD grounding 本地融合生成直接回答'
}

const refinementTraceNote = (trace = {}) => {
  const base = refinementFailureReason(trace.reason)
  if (trace.forced_refinement_attempted_after_prior_failure) {
    const prior = refinementFailureReason(trace.prior_llm_failure_ignored_by_force)
      .replace('，已使用 CoD grounding 本地融合生成直接回答', '')
      .replace('，已使用当前 CoD 结果生成直接回答', '')
      .replace('，已继续生成 CoD-grounded 直接回答', '')
    return `${base}；已绕过“${prior}”并强制尝试最终 LLM 改写`
  }
  return base
}

const appendLlmUsageNote = (detail, trace, stepKey) => {
  const usageStageByStep = {
    query_decomposition: 'query_decomposition',
    adaptive_reasoning_routing: 'semantic_reasoning_judge',
    lightweight_path_verification: 'path_verification'
  }
  const usageStage = usageStageByStep[stepKey]
  if (!usageStage) return detail
  const usage = (trace?.llm_usage?.stages || []).find(item => item.stage === usageStage)
  if (!usage || !usage.enabled) return detail
  const status = usage.attempted ? usage.status : 'not_attempted'
  const counts = usageStage === 'path_verification'
    ? `；attempted ${usage.attempted_count || 0} / applied ${usage.applied_count || 0}`
    : ''
  return `${detail}（LLM ${status}${counts}）`
}

const markCodProgressFailed = (errorMessage = '') => {
  codProgressSteps.value = codProgressSteps.value.map(step => {
    if (step.status === 'in_progress') {
      return {
        ...step,
        status: 'failed',
        statusText: '请求中断',
        detail: errorMessage
          ? `未收到后端完成响应，不能确认本阶段或本地兜底已完成：${errorMessage}`
          : '未收到后端完成响应，不能确认本阶段或本地兜底已完成'
      }
    }
    return step
  })
}

const submitCodQuery = async () => {
  if (!codQuestion.value.trim() || isCodQuerying.value) return
  isCodQuerying.value = true
  codResult.value = null
  selectedCodReferenceId.value = null
  codQueryError.value = ''
  selectedQaMetricKey.value = null
  selectedRoutingMetricKey.value = null
  selectedCodDetailKey.value = null
  codRoutingTraceOpen.value = false
  qaMetricProfessionalOpen.value = false
  qaFeedbackModalOpen.value = false
  resetQaFeedbackState()
  startCodProgress()
  addLog(`${omdDeepQueryEnabled.value ? 'CoD + 本体机制增强' : 'CoD GraphRAG 查询'} · ${codReasoningModeLabel.value}${codLlmEnabled.value ? '（LLMs 开启）' : '（LLMs 关闭）'}: ${codQuestion.value.substring(0, 60)}...`)
  try {
    const res = await codGraphRAGQuery({
      question: codQuestion.value.trim(),
      mode: omdDeepQueryEnabled.value ? 'ontology_mechanism_query' : undefined,
      reasoning_mode: codReasoningMode.value,
      project_id: props.projectId || undefined,
      graph_id: props.graphId || undefined,
      simulation_id: props.simulationId,
      top_k_subgraphs: 5,
      top_k_paths: 8,
      enable_verification: true,
      enable_llm_decomposition_fallback: false,
      enable_llm_path_verification: false,
      enable_llm_reasoning_judge: false,
      enable_llm_answer_refinement: codAnswerRefinementEnabled.value,
      force_llm_answer_refinement: codAnswerRefinementEnabled.value,
      enable_graph_mutation_proposal: true,
      show_audit_appendix: false
    })
    codResult.value = res.data
    applyCodTraceProgress(codResult.value?.debug_trace)
    const graphContext = codResult.value?.debug_trace?.graph_context
    if (graphContext?.project_id || graphContext?.graph_id) {
      addLog(`CoD 使用KG: project=${graphContext.project_id || 'N/A'}, graph=${graphContext.graph_id || 'N/A'}, scope=${graphContext.scope_resolution || 'unknown'}`)
    }
    addLog(`${omdDeepQueryEnabled.value ? 'CoD + 本体机制增强' : 'CoD GraphRAG'} 返回 ${(codResult.value?.candidate_paths || codResult.value?.evidence_paths || []).length || 0} 条候选路径，路由为 ${routeModeLabel(codResult.value?.reasoning_route?.selected_mode)}`)
  } catch (err) {
    markCodProgressFailed(err.message || '')
    codQueryError.value = `CoD GraphRAG 查询失败：${err.message || '未知错误'}`
    addLog(`CoD GraphRAG 查询失败: ${err.message}`)
  } finally {
    isCodQuerying.value = false
    stopCodProgress()
  }
}

// Chat Methods
const sendMessage = async () => {
  if (!chatInput.value.trim() || isSending.value) return
  
  const message = chatInput.value.trim()
  chatInput.value = ''
  
  // Add user message
  chatHistory.value.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  })
  
  scrollToBottom()
  isSending.value = true
  
  try {
    if (chatTarget.value === 'report_agent') {
      await sendToReportAgent(message)
    } else {
      await sendToAgent(message)
    }
  } catch (err) {
    addLog(`发送失败: ${err.message}`)
    chatHistory.value.push({
      role: 'assistant',
      content: `抱歉，发生了错误: ${err.message}`,
      timestamp: new Date().toISOString()
    })
  } finally {
    isSending.value = false
    scrollToBottom()
    // 自动保存对话记录到缓存
    saveChatHistory()
  }
}

const sendToReportAgent = async (message) => {
  addLog(`向 Report Agent 发送: ${message.substring(0, 50)}...`)
  
  // Build chat history for API
  const historyForApi = chatHistory.value
    .filter(msg => msg.role !== 'user' || msg.content !== message)
    .slice(-10) // Keep last 10 messages
    .map(msg => ({
      role: msg.role,
      content: msg.content
    }))
  
  const res = await chatWithReport({
    simulation_id: props.simulationId,
    message: message,
    chat_history: historyForApi
  })
  
  if (res.success && res.data) {
    chatHistory.value.push({
      role: 'assistant',
      content: res.data.response || res.data.answer || '无响应',
      timestamp: new Date().toISOString()
    })
    addLog('Report Agent 已回复')
  } else {
    throw new Error(res.error || '请求失败')
  }
}

const isInterviewSkipped = (res) => {
  const data = res?.data || {}
  return data.skipped === true || data.reason === 'SIMULATION_NOT_RUNNING'
}

const sendToAgent = async (message) => {
  if (!selectedAgent.value || selectedAgentIndex.value === null) {
    throw new Error('请先选择一个模拟个体')
  }
  
  addLog(`向 ${selectedAgent.value.username} 发送: ${message.substring(0, 50)}...`)
  
  // Build prompt with chat history
  let prompt = message
  if (chatHistory.value.length > 1) {
    const historyContext = chatHistory.value
      .filter(msg => msg.content !== message)
      .slice(-6)
      .map(msg => `${msg.role === 'user' ? '提问者' : '你'}：${msg.content}`)
      .join('\n')
    prompt = `以下是我们之前的对话：\n${historyContext}\n\n现在我的新问题是：${message}`
  }
  
  const agentId = selectedAgentIndex.value

  const extractResponseContent = (responseData, targetAgentId) => {
    if (!responseData?.success || !responseData?.data) return null

    const resultData = responseData.data.result || responseData.data
    const resultsDict = resultData.results || resultData

    if (typeof resultsDict === 'object' && !Array.isArray(resultsDict)) {
      const redditKey = `reddit_${targetAgentId}`
      const twitterKey = `twitter_${targetAgentId}`
      const agentResult = resultsDict[redditKey] || resultsDict[twitterKey] || Object.values(resultsDict)[0]
      return agentResult ? (agentResult.response || agentResult.answer || null) : null
    }

    if (Array.isArray(resultsDict) && resultsDict.length > 0) {
      return resultsDict[0].response || resultsDict[0].answer || null
    }

    return null
  }

  const [officialRes, personalRes] = await Promise.all([
    interviewAgents({
      simulation_id: props.simulationId,
      response_style: 'official',
      interviews: [{
        agent_id: agentId,
        prompt: prompt
      }]
    }),
    interviewAgents({
      simulation_id: props.simulationId,
      response_style: 'personal',
      interviews: [{
        agent_id: agentId,
        prompt: prompt
      }]
    })
  ])

  const officialContent = extractResponseContent(officialRes, agentId)
  const personalContent = extractResponseContent(personalRes, agentId)

  if (!officialContent && !personalContent) {
    if (isInterviewSkipped(officialRes) || isInterviewSkipped(personalRes)) {
      const fallbackMessage = '当前模拟环境未运行，已跳过个体访谈。请使用 Report Agent 基于知识图谱继续进行 KG-only 洞察问答。'
      chatHistory.value.push({
        role: 'assistant',
        content: fallbackMessage,
        timestamp: new Date().toISOString()
      })
      addLog('Interview skipped: simulation not running. Continue with KG-only insight generation.')
      return
    }
    const errMsg = officialRes?.error || personalRes?.error || '无响应数据'
    throw new Error(errMsg)
  }

  chatHistory.value.push({
    role: 'assistant',
    content: '',
    dualVersions: {
      official: officialContent || '无响应',
      personal: personalContent || '无响应'
    },
    timestamp: new Date().toISOString()
  })

  addLog(`${selectedAgent.value.username} 已返回双版本回复`)
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatMessages.value) {
      chatMessages.value.scrollTop = chatMessages.value.scrollHeight
    }
  })
}

// Survey Methods
const toggleAgentSelection = (idx) => {
  const newSet = new Set(selectedAgents.value)
  if (newSet.has(idx)) {
    newSet.delete(idx)
  } else {
    newSet.add(idx)
  }
  selectedAgents.value = newSet
}

const selectAllAgents = () => {
  const newSet = new Set()
  profiles.value.forEach((_, idx) => newSet.add(idx))
  selectedAgents.value = newSet
}

const clearAgentSelection = () => {
  selectedAgents.value = new Set()
}

const submitSurvey = async () => {
  if (selectedAgents.value.size === 0 || !surveyQuestion.value.trim()) return
  
  isSurveying.value = true
  addLog(`发送问卷给 ${selectedAgents.value.size} 个对象...`)
  
  try {
    const interviews = Array.from(selectedAgents.value).map(idx => ({
      agent_id: idx,
      prompt: surveyQuestion.value.trim()
    }))
    
    const res = await interviewAgents({
      simulation_id: props.simulationId,
      interviews: interviews
    })
    
    if (res.success && res.data) {
      if (isInterviewSkipped(res)) {
        addLog('Interview skipped: simulation not running. Continue with KG-only insight generation.')
        surveyResults.value = []
        return
      }
      // 正确的数据路径: res.data.result.results 是一个对象字典
      // 格式: {"twitter_0": {...}, "reddit_0": {...}, "twitter_1": {...}, ...}
      const resultData = res.data.result || res.data
      const resultsDict = resultData.results || resultData
      
      // 将对象字典转换为数组格式
      const surveyResultsList = []
      
      for (const interview of interviews) {
        const agentIdx = interview.agent_id
        const agent = profiles.value[agentIdx]
        
        // 优先使用 reddit 平台回复，其次 twitter
        let responseContent = '无响应'
        
        if (typeof resultsDict === 'object' && !Array.isArray(resultsDict)) {
          const redditKey = `reddit_${agentIdx}`
          const twitterKey = `twitter_${agentIdx}`
          const agentResult = resultsDict[redditKey] || resultsDict[twitterKey]
          if (agentResult) {
            responseContent = agentResult.response || agentResult.answer || '无响应'
          }
        } else if (Array.isArray(resultsDict)) {
          // 兼容数组格式
          const matchedResult = resultsDict.find(r => r.agent_id === agentIdx)
          if (matchedResult) {
            responseContent = matchedResult.response || matchedResult.answer || '无响应'
          }
        }
        
        surveyResultsList.push({
          agent_id: agentIdx,
          agent_name: agent?.username || `Agent ${agentIdx}`,
          profession: agent?.profession,
          question: surveyQuestion.value.trim(),
          answer: responseContent
        })
      }
      
      surveyResults.value = surveyResultsList
      addLog(`收到 ${surveyResults.value.length} 条回复`)
    } else {
      throw new Error(res.error || '请求失败')
    }
  } catch (err) {
    addLog(`问卷发送失败: ${err.message}`)
  } finally {
    isSurveying.value = false
  }
}

// Load Report Data
const loadReportData = async () => {
  if (!props.reportId) return
  
  try {
    addLog(`加载报告数据: ${props.reportId}`)
    
    // Get report info
    const reportRes = await getReport(props.reportId)
    if (reportRes.success && reportRes.data) {
      // Load agent logs to get report outline and sections
      await loadAgentLogs()
    }
  } catch (err) {
    addLog(`加载报告失败: ${err.message}`)
  }
}

const loadAgentLogs = async () => {
  if (!props.reportId) return
  
  try {
    const res = await getAgentLog(props.reportId, 0)
    if (res.success && res.data) {
      const logs = res.data.logs || []
      
      logs.forEach(log => {
        if (log.action === 'planning_complete' && log.details?.outline) {
          reportOutline.value = log.details.outline
        }
        
        if (log.action === 'section_complete' && log.section_index < 100 && log.details?.content) {
          generatedSections.value[log.section_index] = log.details.content
        }
      })
      
      addLog('报告数据加载完成')
    }
  } catch (err) {
    addLog(`加载报告日志失败: ${err.message}`)
  }
}

const loadProfiles = async () => {
  if (!props.simulationId) return
  
  try {
    const res = await getSimulationProfilesRealtime(props.simulationId, 'reddit')
    if (res.success && res.data) {
      profiles.value = res.data.profiles || []
      addLog(`加载了 ${profiles.value.length} 个模拟个体`)
    }
  } catch (err) {
    addLog(`加载模拟个体失败: ${err.message}`)
  }
}

// Click outside to close dropdown
const handleClickOutside = (e) => {
  const dropdown = document.querySelector('.agent-dropdown')
  if (dropdown && !dropdown.contains(e.target)) {
    showAgentDropdown.value = false
  }
}

const handleRoutingGraphResize = () => {
  if (codRoutingTraceOpen.value) {
    renderCodRoutingD3Graph()
  }
}

watch(
  () => [codRoutingTraceOpen.value, codReasoningRouteContent.value],
  () => {
    if (codRoutingTraceOpen.value) {
      renderCodRoutingD3Graph()
    }
  }
)

// Lifecycle
onMounted(() => {
  addLog('Step5 深度互动初始化')
  loadReportData()
  loadProfiles()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleQaMetricEscape)
  window.addEventListener('resize', handleRoutingGraphResize)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleQaMetricEscape)
  window.removeEventListener('resize', handleRoutingGraphResize)
  stopCodProgress()
})

watch(() => props.reportId, (newId) => {
  if (newId) {
    loadReportData()
  }
}, { immediate: true })

watch(() => props.simulationId, (newId) => {
  if (newId) {
    loadProfiles()
  }
}, { immediate: true })
</script>

<style scoped>
.interaction-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #F8F9FA;
  font-family: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
  overflow: hidden;
}

.project-corner-badge {
  flex: 0 1 300px;
  max-width: min(300px, 34vw);
  min-width: 0;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid #BFDBFE;
  border-radius: 8px;
  background: rgba(239, 246, 255, 0.94);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10);
  color: #1E3A8A;
}

.project-corner-label {
  flex: 0 0 auto;
  color: #2563EB;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
}

.project-corner-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 800;
}

/* Utility Classes */
.mono {
  font-family: 'JetBrains Mono', 'SF Mono', 'Monaco', 'Consolas', monospace;
}

/* Main Split Layout */
.main-split-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Left Panel - Report Style (与 Step4Report.vue 完全一致) */
.left-panel.report-style {
  width: 45%;
  min-width: 450px;
  background: #FFFFFF;
  border-right: 1px solid #E5E7EB;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 30px 50px 60px 50px;
}

.left-panel::-webkit-scrollbar {
  width: 6px;
}

.left-panel::-webkit-scrollbar-track {
  background: transparent;
}

.left-panel::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background 0.3s ease;
}

.left-panel:hover::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

.left-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

/* Report Header */
.report-content-wrapper {
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.report-header-block {
  margin-bottom: 30px;
}

.report-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.report-tag {
  background: #000000;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.report-id {
  font-size: 11px;
  color: #9CA3AF;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.main-title {
  font-family: 'Times New Roman', Times, serif;
  font-size: 36px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
  margin: 0 0 16px 0;
  letter-spacing: -0.02em;
}

.sub-title {
  font-family: 'Times New Roman', Times, serif;
  font-size: 16px;
  color: #6B7280;
  font-style: italic;
  line-height: 1.6;
  margin: 0 0 30px 0;
  font-weight: 400;
}

.header-divider {
  height: 1px;
  background: #E5E7EB;
  width: 100%;
}

/* Sections List */
.sections-list {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.report-section-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  transition: background-color 0.2s ease;
  padding: 8px 12px;
  margin: -8px -12px;
  border-radius: 8px;
}

.section-header-row.clickable {
  cursor: pointer;
}

.section-header-row.clickable:hover {
  background-color: #F9FAFB;
}

.collapse-icon {
  margin-left: auto;
  color: #9CA3AF;
  transition: transform 0.3s ease;
  flex-shrink: 0;
  align-self: center;
}

.collapse-icon.is-collapsed {
  transform: rotate(-90deg);
}

.section-number {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  color: #E5E7EB;
  font-weight: 500;
  transition: color 0.3s ease;
}

.section-title {
  font-family: 'Times New Roman', Times, serif;
  font-size: 24px;
  font-weight: 600;
  color: #111827;
  margin: 0;
  transition: color 0.3s ease;
}

/* States */
.report-section-item.is-pending .section-number {
  color: #E5E7EB;
}
.report-section-item.is-pending .section-title {
  color: #D1D5DB;
}

.report-section-item.is-active .section-number,
.report-section-item.is-completed .section-number {
  color: #9CA3AF;
}

.report-section-item.is-active .section-title,
.report-section-item.is-completed .section-title {
  color: #111827;
}

.section-body {
  padding-left: 28px;
  overflow: hidden;
}

/* Generated Content */
.generated-content {
  font-family: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.8;
  color: #374151;
}

.generated-content :deep(p) {
  margin-bottom: 1em;
}

.generated-content :deep(.md-h2),
.generated-content :deep(.md-h3),
.generated-content :deep(.md-h4) {
  font-family: 'Times New Roman', Times, serif;
  color: #111827;
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  font-weight: 700;
}

.generated-content :deep(.md-h2) { font-size: 20px; border-bottom: 1px solid #F3F4F6; padding-bottom: 8px; }
.generated-content :deep(.md-h3) { font-size: 18px; }
.generated-content :deep(.md-h4) { font-size: 16px; }

.generated-content :deep(.md-ul),
.generated-content :deep(.md-ol) {
  padding-left: 20px;
  margin-bottom: 1em;
}

.generated-content :deep(.md-li) {
  margin-bottom: 0.5em;
}

.generated-content :deep(.md-quote) {
  border-left: 3px solid #E5E7EB;
  padding-left: 16px;
  margin: 1.5em 0;
  color: #6B7280;
  font-style: italic;
  font-family: 'Times New Roman', Times, serif;
}

.generated-content :deep(.code-block) {
  background: #F9FAFB;
  padding: 12px;
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  overflow-x: auto;
  margin: 1em 0;
  border: 1px solid #E5E7EB;
}

.generated-content :deep(strong) {
  font-weight: 600;
  color: #111827;
}

.generated-content :deep(.kg-discovery-insight),
.chat-messages :deep(.kg-discovery-insight),
.result-answer :deep(.kg-discovery-insight) {
  color: #0F766E;
  font-weight: 650;
  text-decoration-line: underline;
  text-decoration-color: rgba(20, 184, 166, 0.58);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  background: rgba(240, 253, 250, 0.78);
  border-radius: 3px;
  padding: 0 2px;
}

/* Loading State */
.loading-state {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #6B7280;
  font-size: 14px;
  margin-top: 4px;
}

.loading-icon {
  width: 18px;
  height: 18px;
  animation: spin 1s linear infinite;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-text {
  font-family: 'Times New Roman', Times, serif;
  font-size: 15px;
  color: #4B5563;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Content Styles Override */
.generated-content :deep(.md-h2) {
  font-family: 'Times New Roman', Times, serif;
  font-size: 18px;
  margin-top: 0;
}

/* Waiting Placeholder */
.waiting-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 40px;
  color: #9CA3AF;
}

.waiting-animation {
  position: relative;
  width: 48px;
  height: 48px;
}

.waiting-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 2px solid #E5E7EB;
  border-radius: 50%;
  animation: ripple 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.waiting-ring:nth-child(2) {
  animation-delay: 0.4s;
}

.waiting-ring:nth-child(3) {
  animation-delay: 0.8s;
}

@keyframes ripple {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(2); opacity: 0; }
}

.waiting-text {
  font-size: 14px;
}

/* Right Panel - Interaction */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
  overflow: hidden;
}

/* Action Bar - Professional Design */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  padding: 14px 20px;
  border-bottom: 1px solid #E5E7EB;
  background: linear-gradient(180deg, #FFFFFF 0%, #FAFBFC 100%);
  gap: 16px;
}

.action-bar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 160px;
}

.action-bar-icon {
  color: #1F2937;
  flex-shrink: 0;
}

.action-bar-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-bar-title {
  font-size: 13px;
  font-weight: 600;
  color: #1F2937;
  letter-spacing: -0.01em;
}

.action-bar-subtitle {
  font-size: 11px;
  color: #9CA3AF;
}

.action-bar-subtitle.mono {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
}

.action-bar-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 520px;
  min-width: 280px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.tab-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  color: #6B7280;
  background: #F3F4F6;
  border: 1px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.tab-pill:hover {
  background: #E5E7EB;
  color: #374151;
}

.tab-pill.active {
  background: #1F2937;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(31, 41, 55, 0.15);
}

.tab-pill svg {
  flex-shrink: 0;
  opacity: 0.7;
}

.tab-pill.active svg {
  opacity: 1;
}

.tab-divider {
  width: 1px;
  height: 24px;
  background: #E5E7EB;
  margin: 0 6px;
}

.agent-pill {
  width: 200px;
  justify-content: space-between;
}

.agent-pill span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.survey-pill {
  background: #ECFDF5;
  color: #047857;
}

.survey-pill:hover {
  background: #D1FAE5;
  color: #065F46;
}

.survey-pill.active {
  background: #047857;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(4, 120, 87, 0.2);
}

.cod-pill {
  background: #EEF2FF;
  color: #3730A3;
}

.cod-pill:hover {
  background: #E0E7FF;
  color: #312E81;
}

.cod-pill.active {
  background: #3730A3;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(55, 48, 163, 0.2);
}

/* Interaction Header */
.interaction-header {
  padding: 16px 24px;
  border-bottom: 1px solid #E5E7EB;
  background: #FAFAFA;
}

.tab-switcher {
  display: flex;
  gap: 8px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  color: #6B7280;
  background: transparent;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  background: #F9FAFB;
  border-color: #D1D5DB;
}

.tab-btn.active {
  background: #1F2937;
  color: #FFFFFF;
  border-color: #1F2937;
}

.tab-btn svg {
  flex-shrink: 0;
}

/* Chat Container */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* CoD GraphRAG */
.cod-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #F9FAFB;
}

.cod-query-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid #E5E7EB;
  background: #FFFFFF;
}

.cod-action-stack {
  width: 100%;
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    minmax(0, 1fr)
    minmax(0, 1.7fr)
    minmax(0, 1.15fr)
    minmax(0, 0.85fr)
    minmax(0, 0.62fr);
  align-items: stretch;
  gap: 8px;
}

.cod-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 48px;
  max-height: 120px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  resize: vertical;
  font-family: inherit;
  color: #1F2937;
}

.cod-input:focus {
  outline: none;
  border-color: #3730A3;
}

.cod-omd-toggle {
  min-width: 0;
  height: 48px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0 12px;
}

.cod-omd-toggle.active {
  border-color: #0F766E;
  background: #CCFBF1;
  color: #115E59;
}

.cod-omd-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.cod-feedback-open-btn {
  width: auto;
  min-width: 0;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  color: #0F766E;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  padding: 0 10px;
  white-space: nowrap;
}

.cod-feedback-open-btn.has-feedback {
  border-color: #0F766E;
  background: #F0FDFA;
}

.cod-llm-judge-open-btn {
  border-color: #C7D2FE;
  background: #EEF2FF;
  color: #4338CA;
}

.cod-feedback-open-btn:hover,
.cod-feedback-open-btn:focus-visible {
  border-color: #0F766E;
  background: #ECFDF5;
  outline: none;
}

.cod-llm-judge-open-btn:hover,
.cod-llm-judge-open-btn:focus-visible {
  border-color: #4338CA;
  background: #E0E7FF;
  outline: none;
}

.cod-feedback-open-btn:disabled {
  border-color: #E2E8F0;
  background: #F8FAFC;
  color: #94A3B8;
  cursor: not-allowed;
}

.cod-reasoning-mode-toggle {
  height: 48px;
  width: 100%;
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  padding: 3px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #F8FAFC;
}

.cod-reasoning-mode-toggle button {
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.cod-reasoning-mode-toggle button.active {
  background: #1F2937;
  color: #FFFFFF;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.16);
}

.cod-reasoning-mode-toggle button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.cod-llm-toggle {
  min-width: 0;
  height: 48px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  padding: 0 12px;
}

.cod-llm-toggle.active {
  border-color: #B45309;
  background: #FEF3C7;
  color: #92400E;
}

.cod-llm-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.cod-submit-btn {
  width: auto;
  min-width: 0;
  height: 48px;
  border: none;
  border-radius: 8px;
  background: #3730A3;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cod-submit-btn:disabled {
  background: #E5E7EB;
  color: #9CA3AF;
  cursor: not-allowed;
}

.qa-feedback-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 92;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(15, 23, 42, 0.46);
}

.qa-feedback-modal {
  width: min(980px, 100%);
  max-height: calc(100vh - 44px);
  overflow: hidden;
  border: 1px solid #D8E3E1;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
}

.qa-feedback-review-modal {
  width: min(1480px, calc(100vw - 40px));
  max-height: calc(100dvh - 40px);
}

.qa-feedback-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #E5E7EB;
  background: #F8FAFC;
}

.qa-feedback-modal-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.qa-feedback-modal-header > div:first-child {
  min-width: 0;
  flex: 1;
}

.qa-feedback-modal-kicker,
.qa-feedback-score-summary > span {
  display: block;
  color: #0F766E;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.qa-feedback-modal-header h3 {
  margin: 4px 0 0;
  color: #111827;
  font-size: 18px;
  line-height: 1.3;
}

.qa-feedback-modal-body {
  padding: 16px 20px 20px;
  overflow: auto;
}

.qa-feedback-review-modal .qa-feedback-modal-body {
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.qa-feedback-review-modal .qa-feedback-form {
  min-height: 0;
}

.qa-feedback-review-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
  min-height: 520px;
  height: min(76vh, 780px);
  min-width: 0;
}

.qa-feedback-answer-pane {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 18px 20px 20px;
  border-right: 1px solid #E2E8F0;
  background: #FFFFFF;
}

.qa-feedback-answer-source {
  margin-top: 14px;
  border: 1px solid #D8E3E1;
  border-radius: 8px;
  background: #FFFFFF;
  overflow: hidden;
}

.qa-feedback-answer-source header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #E2E8F0;
  background: #F8FAFC;
}

.qa-feedback-answer-source header span {
  color: #0F766E;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.qa-feedback-answer-source header h4 {
  margin: 0;
  color: #111827;
  font-size: 15px;
  line-height: 1.35;
}

.qa-feedback-answer-source.is-llm header span {
  color: #4338CA;
}

.qa-feedback-answer-text {
  padding: 14px 16px 16px;
  color: #1F2937;
  font-size: 13px;
  line-height: 1.75;
  outline: none;
}

.qa-feedback-answer-text:focus-visible {
  box-shadow: inset 0 0 0 3px rgba(15, 118, 110, 0.12);
}

.qa-feedback-review-sidebar {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 16px;
  background: #F8FAFC;
}

.qa-feedback-sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
}

.qa-feedback-sidebar-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.qa-feedback-sidebar-title span {
  color: #334155;
  font-size: 12px;
  font-weight: 900;
}

.qa-feedback-sidebar-title strong {
  color: #0F766E;
  font-size: 12px;
  font-weight: 900;
}

.qa-feedback-verdict-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.qa-feedback-verdict-toggle button {
  min-height: 38px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  color: #334155;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.qa-feedback-verdict-toggle button.active:first-child {
  border-color: #0F766E;
  background: #ECFDF5;
  color: #0F766E;
}

.qa-feedback-verdict-toggle button.active:last-child {
  border-color: #B45309;
  background: #FEF3C7;
  color: #92400E;
}

.qa-feedback-selected-text {
  padding: 10px;
  border: 1px dashed #CBD5E1;
  border-radius: 8px;
  background: #F8FAFC;
}

.qa-feedback-selected-text span,
.qa-feedback-selected-text small {
  display: block;
  color: #64748B;
  font-size: 11px;
  font-weight: 800;
}

.qa-feedback-selected-text p {
  margin: 5px 0;
  color: #111827;
  font-size: 12px;
  line-height: 1.55;
}

.qa-feedback-annotation-note {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  color: #111827;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 9px;
}

.qa-feedback-annotation-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.qa-feedback-annotation-tools button {
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  background: #FFFFFF;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.qa-feedback-annotation-tools button:hover,
.qa-feedback-annotation-tools button:focus-visible {
  border-color: #0F766E;
  background: #ECFDF5;
  outline: none;
}

.qa-feedback-annotation-tools button:disabled {
  border-color: #E2E8F0;
  background: #F8FAFC;
  color: #94A3B8;
  cursor: not-allowed;
}

.qa-feedback-annotation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qa-feedback-annotation-item {
  padding: 9px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #F8FAFC;
}

.qa-feedback-annotation-item div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.qa-feedback-annotation-item strong {
  color: #92400E;
  font-size: 12px;
  font-weight: 900;
}

.qa-feedback-annotation-item button {
  border: none;
  background: transparent;
  color: #64748B;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.qa-feedback-annotation-item span,
.qa-feedback-annotation-item small {
  display: block;
  margin-top: 4px;
  color: #64748B;
  font-size: 11px;
  line-height: 1.45;
}

.qa-feedback-annotation-item p {
  margin: 5px 0 0;
  color: #111827;
  font-size: 12px;
  line-height: 1.5;
}

.qa-feedback-empty-note {
  margin: 0;
  color: #64748B;
  font-size: 12px;
  line-height: 1.5;
}

.qa-feedback-review-sidebar .qa-feedback-footer {
  flex-direction: column;
  align-items: stretch;
}

.qa-feedback-review-sidebar .qa-feedback-submit {
  width: 100%;
}

.qa-feedback-score-summary {
  min-width: 104px;
  padding: 10px 12px;
  border: 1px solid #CCFBF1;
  border-radius: 8px;
  background: #F0FDFA;
  text-align: right;
}

.qa-feedback-score-summary strong {
  display: block;
  color: #0F172A;
  font-size: 22px;
  line-height: 1.1;
}

.qa-feedback-score-summary small {
  display: block;
  margin-top: 3px;
  color: #0F766E;
  font-size: 11px;
  font-weight: 800;
}

.qa-feedback-llm-judge-btn {
  min-width: 128px;
  min-height: 42px;
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #C7D2FE;
  border-radius: 8px;
  background: #EEF2FF;
  color: #4338CA;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.qa-feedback-llm-judge-btn:hover,
.qa-feedback-llm-judge-btn:focus-visible {
  border-color: #4338CA;
  background: #E0E7FF;
  outline: none;
}

.qa-feedback-llm-judge-btn:disabled {
  border-color: #E2E8F0;
  background: #F8FAFC;
  color: #94A3B8;
  cursor: not-allowed;
}

.qa-feedback-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.qa-feedback-source-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid #BFDBFE;
  border-radius: 8px;
  background: #EFF6FF;
}

.qa-feedback-source-note strong {
  color: #1E3A8A;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.45;
}

.qa-feedback-source-note span {
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
}

.qa-feedback-score-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
  gap: 10px;
}

.qa-feedback-score-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: #F8FAFC;
}

.qa-feedback-score-row > span,
.qa-feedback-field > span,
.qa-feedback-error-group > span {
  color: #334155;
  font-size: 12px;
  font-weight: 800;
}

.qa-feedback-dimension-label,
.qa-feedback-field-label {
  display: flex;
  gap: 5px;
  min-width: 0;
}

.qa-feedback-dimension-label {
  flex-direction: column;
}

.qa-feedback-dimension-label strong,
.qa-feedback-field-label > span {
  color: #334155;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.35;
}

.qa-feedback-dimension-label small {
  color: #64748B;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
}

.qa-feedback-field-label {
  align-items: center;
  flex-wrap: wrap;
}

.qa-feedback-field-label em {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 7px;
  border: 1px solid #C7D2FE;
  border-radius: 999px;
  background: #EEF2FF;
  color: #4338CA;
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
}

.qa-feedback-score-buttons {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
}

.qa-feedback-score-buttons button,
.qa-feedback-error-options button {
  min-height: 30px;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  background: #FFFFFF;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.qa-feedback-score-buttons button.active {
  border-color: #0F766E;
  background: #0F766E;
  color: #FFFFFF;
}

.qa-feedback-meta-grid,
.qa-feedback-text-grid {
  display: grid;
  grid-template-columns: minmax(220px, 0.35fr) minmax(0, 1fr);
  gap: 12px;
}

.qa-feedback-text-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.qa-feedback-field,
.qa-feedback-error-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.qa-feedback-field input,
.qa-feedback-field textarea {
  width: 100%;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  color: #111827;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  padding: 9px 10px;
}

.qa-feedback-field textarea {
  resize: vertical;
  min-height: 72px;
}

.qa-feedback-field input:focus,
.qa-feedback-field textarea:focus {
  outline: none;
  border-color: #0F766E;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}

.qa-feedback-error-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.qa-feedback-error-options button {
  min-height: 31px;
  padding: 0 10px;
}

.qa-feedback-error-options button.active {
  border-color: #B45309;
  background: #FEF3C7;
  color: #92400E;
}

.qa-feedback-llm-judge-panel {
  border: 1px solid #C7D2FE;
  border-radius: 8px;
  background: #F8FAFC;
  padding: 11px 12px;
}

.qa-feedback-llm-judge-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.qa-feedback-llm-judge-result.is-running {
  min-height: 72px;
  justify-content: center;
}

.qa-feedback-llm-judge-result strong {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #312E81;
  font-size: 13px;
  font-weight: 900;
}

.qa-feedback-llm-judge-result span,
.qa-feedback-llm-judge-result p {
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
}

.qa-feedback-score-logic {
  margin-top: 8px;
  padding-top: 9px;
  border-top: 1px solid #E0E7FF;
}

.qa-feedback-score-logic-title {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}

.qa-feedback-score-logic-title strong {
  color: #312E81;
  font-size: 12px;
  font-weight: 900;
}

.qa-feedback-score-logic-title span {
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
}

.qa-feedback-score-logic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.qa-feedback-score-logic-item {
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
}

.qa-feedback-score-logic-item strong {
  display: block;
  color: #1E293B;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.4;
}

.qa-feedback-score-logic-item p {
  margin: 4px 0 0;
  color: #475569;
  font-size: 11px;
  line-height: 1.45;
}

.qa-feedback-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.qa-feedback-result,
.qa-feedback-error {
  min-height: 38px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.qa-feedback-result strong,
.qa-feedback-error {
  color: #0F766E;
  font-size: 12px;
  font-weight: 900;
}

.qa-feedback-result span {
  color: #64748B;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.qa-feedback-error {
  color: #B91C1C;
}

.qa-feedback-submit {
  min-width: 112px;
  height: 38px;
  border: none;
  border-radius: 8px;
  background: #0F766E;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.qa-feedback-submit:disabled {
  background: #CBD5E1;
  cursor: not-allowed;
}

.cod-llm-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.42);
}

.cod-llm-confirm-modal {
  width: min(560px, 100%);
  max-height: calc(100vh - 48px);
  overflow: hidden;
  border: 1px solid #FED7AA;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.24);
  display: flex;
  flex-direction: column;
}

.cod-llm-confirm-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #E5E7EB;
  background: #FFFBEB;
}

.cod-llm-confirm-kicker {
  margin-bottom: 4px;
  color: #B45309;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.cod-llm-confirm-header h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
  color: #111827;
}

.cod-llm-confirm-body {
  padding: 18px 20px 20px;
  overflow: auto;
}

.cod-llm-confirm-body p {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.cod-llm-confirm-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.cod-llm-confirm-grid > div {
  min-height: 76px;
  padding: 12px;
  border: 1px solid #FED7AA;
  border-radius: 8px;
  background: #FFFBEB;
}

.cod-llm-confirm-grid span {
  display: block;
  margin-bottom: 6px;
  color: #B45309;
  font-size: 11px;
  font-weight: 800;
}

.cod-llm-confirm-grid strong {
  color: #1F2937;
  font-size: 13px;
  line-height: 1.45;
}

.cod-llm-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.cod-llm-cancel-btn,
.cod-llm-confirm-btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.cod-llm-cancel-btn {
  border: 1px solid #CBD5E1;
  background: #FFFFFF;
  color: #334155;
}

.cod-llm-confirm-btn {
  border: 1px solid #B45309;
  background: #B45309;
  color: #FFFFFF;
}

.cod-results {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cod-progress-panel {
  margin: 16px 20px 0;
  padding: 14px;
  border: 1px solid #E0E7FF;
  border-radius: 8px;
  background: #FFFFFF;
}

.cod-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 10px;
}

.cod-progress-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.cod-progress-subtitle {
  margin-top: 3px;
  font-size: 12px;
  color: #6B7280;
}

.cod-progress-percent {
  min-width: 44px;
  text-align: right;
  font-size: 14px;
  font-weight: 700;
  color: #3730A3;
}

.cod-progress-track {
  height: 6px;
  background: #EEF2FF;
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 12px;
}

.cod-progress-bar {
  height: 100%;
  background: #3730A3;
  border-radius: 999px;
  transition: width 0.35s ease;
}

.cod-step-list {
  display: grid;
  gap: 9px;
}

.cod-step-item {
  display: grid;
  grid-template-columns: 14px 1fr;
  gap: 9px;
  align-items: flex-start;
}

.cod-step-dot {
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  border: 2px solid #CBD5E1;
  background: #FFFFFF;
}

.cod-step-item.in_progress .cod-step-dot {
  border-color: #3730A3;
  background: #3730A3;
  box-shadow: 0 0 0 4px rgba(55, 48, 163, 0.12);
}

.cod-step-item.completed .cod-step-dot {
  border-color: #059669;
  background: #059669;
}

.cod-step-item.skipped .cod-step-dot {
  border-color: #94A3B8;
  background: #94A3B8;
}

.cod-step-item.fallback .cod-step-dot {
  border-color: #D97706;
  background: #D97706;
  box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.12);
}

.cod-step-item.failed .cod-step-dot {
  border-color: #DC2626;
  background: #DC2626;
}

.cod-step-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.cod-step-name {
  font-size: 12px;
  font-weight: 700;
  color: #1F2937;
}

.cod-step-time {
  flex-shrink: 0;
  font-size: 11px;
  color: #6B7280;
}

.cod-step-detail {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.45;
  color: #6B7280;
}

.cod-step-item.pending .cod-step-name,
.cod-step-item.pending .cod-step-detail,
.cod-step-item.pending .cod-step-time {
  color: #9CA3AF;
}

.cod-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.cod-section {
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 14px;
}

.cod-answer-section {
  border-color: #C7D2FE;
  background: #F8FAFF;
}

.cod-primary-answer-section {
  border-color: #C7D2FE;
  background: #FFFFFF;
  box-shadow: inset 4px 0 0 #4F46E5;
}

.cod-primary-answer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cod-primary-answer-subtitle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  color: #64748B;
  font-size: 12px;
  line-height: 1.45;
}

.cod-inline-citation-status {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border: 1px solid #99F6E4;
  border-radius: 999px;
  background: #F0FDFA;
  color: #0F766E;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.035em;
}

.cod-primary-answer {
  max-height: none;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #F8FAFC;
}

:deep(.cod-reference-anchor) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  min-height: 20px;
  margin: 0 2px;
  padding: 1px 6px;
  border: 1px solid #A5B4FC;
  border-radius: 999px;
  background: #EEF2FF;
  color: #4338CA;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
  vertical-align: super;
  cursor: pointer;
}

:deep(.cod-reference-anchor:hover),
:deep(.cod-reference-anchor:focus-visible) {
  border-color: #4F46E5;
  background: #E0E7FF;
  outline: none;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
}

:deep(.cod-reference-detail-action) {
  margin: 4px 0 0;
  padding: 6px 10px;
  vertical-align: middle;
}

.cod-reference-section {
  border-color: #DDD6FE;
  background: linear-gradient(180deg, #FAFAFF 0%, #FFFFFF 100%);
  box-shadow: inset 4px 0 0 #7C3AED;
}

.cod-reference-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.cod-reference-header p {
  margin: -4px 0 0;
  color: #64748B;
  font-size: 12px;
  line-height: 1.5;
}

.cod-reference-header > span {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  background: #F3E8FF;
  color: #6D28D9;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cod-reference-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cod-reference-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #E2E8F0;
  border-radius: 9px;
  background: #FFFFFF;
}

.cod-reference-card-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  width: 100%;
  padding: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.cod-reference-card-main:hover,
.cod-reference-card-main:focus-visible {
  background: #F5F3FF;
  outline: none;
}

.cod-reference-id {
  padding: 4px 7px;
  border-radius: 6px;
  background: #4F46E5;
  color: #FFFFFF;
  font-size: 10px;
  font-weight: 900;
}

.cod-reference-card-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.cod-reference-card-copy strong,
.cod-reference-card-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cod-reference-card-copy strong {
  color: #1E293B;
  font-size: 11px;
}

.cod-reference-card-copy small {
  color: #64748B;
  font-size: 9px;
}

.cod-reference-score {
  color: #6D28D9;
  font-size: 10px;
  font-weight: 800;
}

.cod-reference-card > blockquote {
  display: -webkit-box;
  margin: 0;
  padding: 0 10px 10px 45px;
  overflow: hidden;
  color: #475569;
  font-size: 10px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.cod-reference-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3300;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.62);
  backdrop-filter: blur(5px);
}

.cod-reference-modal {
  width: min(760px, 96vw);
  max-height: min(780px, 92vh);
  overflow: auto;
  border: 1px solid #C4B5FD;
  border-radius: 14px;
  background: #FFFFFF;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.32);
}

.cod-reference-modal-header,
.cod-reference-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
}

.cod-reference-modal-header {
  border-bottom: 1px solid #E2E8F0;
  background: linear-gradient(135deg, #EEF2FF, #FAF5FF);
}

.cod-reference-modal-header span,
.cod-reference-quote > span,
.cod-reference-conditions > span {
  color: #6D28D9;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cod-reference-modal-header h3 {
  margin: 3px 0 0;
  color: #1E1B4B;
  font-size: 17px;
}

.cod-reference-modal-header > button {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.78);
  color: #475569;
  font-size: 24px;
  cursor: pointer;
}

.cod-reference-modal-body {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.cod-reference-metadata-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.cod-reference-metadata-grid > div {
  min-width: 0;
  padding: 10px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #F8FAFC;
}

.cod-reference-metadata-grid dt {
  color: #64748B;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}

.cod-reference-metadata-grid dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  color: #1E293B;
  font-size: 11px;
  line-height: 1.5;
}

.cod-reference-conditions,
.cod-reference-quote {
  display: grid;
  gap: 8px;
}

.cod-reference-conditions > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cod-reference-conditions small {
  padding: 5px 8px;
  border-radius: 999px;
  background: #ECFDF5;
  color: #047857;
  font-size: 10px;
  font-weight: 700;
}

.cod-reference-quote blockquote {
  margin: 0;
  padding: 14px 16px;
  border-left: 4px solid #8B5CF6;
  border-radius: 0 8px 8px 0;
  background: #FAF5FF;
  color: #334155;
  font-size: 12px;
  line-height: 1.7;
}

.cod-reference-modal-footer {
  border-top: 1px solid #E2E8F0;
  background: #F8FAFC;
}

.cod-reference-modal-footer > span {
  color: #64748B;
  font-size: 10px;
}

.cod-reference-modal-footer > button {
  padding: 8px 13px;
  border: 0;
  border-radius: 7px;
  background: #4F46E5;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.cod-llm-answer-panel {
  border-color: #5EEAD4;
  background: #ECFDF5;
  box-shadow: inset 4px 0 0 #14B8A6;
}

.cod-llm-answer-panel .cod-section-title {
  color: #0F766E;
}

.cod-direct-answer-panel {
  border-color: #C7D2FE;
  background: #F8FAFF;
  box-shadow: inset 4px 0 0 #4F46E5;
}

.cod-direct-answer-panel .cod-section-title {
  color: #3730A3;
}

.cod-logic-panel {
  border-color: #FCD34D;
  background: #FFFBEB;
  box-shadow: inset 4px 0 0 #D97706;
}

.cod-logic-panel .cod-section-title {
  color: #92400E;
}

.cod-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 10px;
}

.cod-detail-launch-section {
  border-color: #D1D5DB;
  background: #FFFFFF;
}

.cod-detail-launch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.cod-detail-launch-header .cod-section-title {
  margin-bottom: 0;
}

.cod-global-overview-btn {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #F8FAFC;
  color: #334155;
  font-family: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.cod-global-overview-btn:hover,
.cod-global-overview-btn:focus-visible {
  outline: none;
  border-color: #64748B;
  background: #FFFFFF;
  color: #0F172A;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.cod-detail-button-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.cod-detail-launch-btn {
  min-height: 72px;
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: #FFFFFF;
  color: #1F2937;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.cod-detail-launch-btn:hover,
.cod-detail-launch-btn:focus-visible {
  outline: none;
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.10);
}

.cod-detail-launch-icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #F3F4F6;
  color: #374151;
}

.cod-detail-launch-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  justify-content: center;
}

.cod-detail-launch-text strong {
  font-size: 13px;
  line-height: 1.35;
  color: #111827;
  overflow-wrap: anywhere;
}

.cod-detail-launch-btn.is-llm {
  border-color: #99F6E4;
}

.cod-detail-launch-btn.is-llm .cod-detail-launch-icon {
  background: #ECFDF5;
  color: #0F766E;
}

.cod-detail-launch-btn.is-cod {
  border-color: #C7D2FE;
}

.cod-detail-launch-btn.is-cod .cod-detail-launch-icon {
  background: #EEF2FF;
  color: #3730A3;
}

.cod-detail-launch-btn.is-omd {
  border-color: #A7F3D0;
}

.cod-detail-launch-btn.is-omd .cod-detail-launch-icon {
  background: #F0FDF4;
  color: #15803D;
}

.cod-detail-launch-btn.is-metrics {
  border-color: #BAE6FD;
}

.cod-detail-launch-btn.is-metrics .cod-detail-launch-icon {
  background: #F0F9FF;
  color: #0369A1;
}

.cod-detail-launch-btn.is-router {
  border-color: #DDD6FE;
}

.cod-detail-launch-btn.is-router .cod-detail-launch-icon {
  background: #F5F3FF;
  color: #6D28D9;
}

.cod-detail-launch-btn.is-logic {
  border-color: #FDE68A;
}

.cod-detail-launch-btn.is-logic .cod-detail-launch-icon {
  background: #FFFBEB;
  color: #A16207;
}

.cod-global-query-page {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: #EEF2F7;
  color: #0F172A;
}

.cod-global-query-header {
  position: sticky;
  top: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid #D8E0EA;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
}

.cod-global-report-brand {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.cod-global-report-brand span {
  font-size: 11px;
  font-weight: 900;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0;
}

.cod-global-report-brand strong {
  max-width: min(52vw, 760px);
  overflow: hidden;
  color: #0F172A;
  font-size: 18px;
  line-height: 1.25;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cod-global-report-brand small {
  color: #64748B;
  font-size: 11px;
  font-weight: 800;
}

.cod-global-report-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.cod-global-action-btn,
.cod-global-run-btn {
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  color: #1E293B;
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.cod-global-action-btn:hover,
.cod-global-action-btn:focus-visible,
.cod-global-run-btn:hover,
.cod-global-run-btn:focus-visible,
.cod-global-query-toolbar .cod-feedback-open-btn:hover,
.cod-global-query-toolbar .cod-feedback-open-btn:focus-visible,
.cod-global-omd-toggle:hover,
.cod-global-omd-toggle:focus-visible,
.cod-global-llm-toggle:hover,
.cod-global-llm-toggle:focus-visible,
.cod-global-reasoning-toggle button:hover,
.cod-global-reasoning-toggle button:focus-visible {
  outline: none;
  border-color: #64748B;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.cod-global-action-btn.is-secondary {
  background: #F8FAFC;
}

.cod-global-query-main {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.cod-global-query-composer {
  width: min(1840px, calc(100% - 40px));
  justify-self: center;
  margin-top: 12px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
}

.cod-global-query-toolbar {
  display: grid;
  grid-template-columns:
    minmax(360px, 2fr)
    minmax(126px, 0.36fr)
    minmax(126px, 0.36fr)
    minmax(174px, 0.54fr)
    minmax(210px, 260px)
    minmax(116px, 142px)
    112px;
  gap: 12px;
  align-items: stretch;
}

.cod-global-query-input {
  width: 100%;
  min-height: 76px;
  max-height: 112px;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  padding: 11px 12px;
  color: #111827;
  background: #F8FAFC;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.55;
}

.cod-global-query-input:focus {
  outline: none;
  border-color: #3730A3;
  background: #FFFFFF;
}

.cod-global-query-toolbar .cod-feedback-open-btn,
.cod-global-omd-toggle,
.cod-global-llm-toggle {
  min-width: 0;
  min-height: 76px;
  height: auto;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  color: #334155;
  font-family: inherit;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
  cursor: pointer;
  padding: 0 16px;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.cod-global-query-toolbar .cod-feedback-open-btn {
  width: auto;
  color: #0F766E;
  padding: 0 12px;
}

.cod-global-query-toolbar .cod-feedback-open-btn.has-feedback {
  border-color: #0F766E;
  background: #F0FDFA;
}

.cod-global-omd-toggle.active {
  border-color: #0F766E;
  background: #CCFBF1;
  color: #115E59;
}

.cod-global-llm-toggle.active {
  border-color: #B45309;
  background: #FEF3C7;
  color: #92400E;
}

.cod-global-reasoning-toggle {
  min-height: 76px;
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  padding: 5px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #F8FAFC;
}

.cod-global-reasoning-toggle button {
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #475569;
  font-family: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.cod-global-reasoning-toggle button.active {
  background: #1F2937;
  color: #FFFFFF;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.18);
}

.cod-global-run-btn {
  height: auto;
  min-height: 76px;
  background: #0F172A;
  color: #FFFFFF;
  border-color: #0F172A;
  font-size: 13px;
}

.cod-global-run-btn:disabled,
.cod-global-action-btn:disabled,
.cod-global-query-toolbar .cod-feedback-open-btn:disabled,
.cod-global-omd-toggle:disabled,
.cod-global-llm-toggle:disabled,
.cod-global-reasoning-toggle button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  box-shadow: none;
}

.cod-global-progress {
  width: min(980px, calc(100% - 28px));
  justify-self: center;
  padding: 12px 14px;
  border: 1px solid #D8E0EA;
  border-radius: 8px;
  background: #FFFFFF;
}

.cod-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  color: #0F172A;
  font-size: 14px;
  font-weight: 900;
}

.cod-progress-head strong {
  flex: 0 0 auto;
  color: #3730A3;
}

.cod-global-stepboard {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 16px 16px;
  padding: 16px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
  overflow: auto;
  border: 1px solid #D8E0EA;
  border-radius: 8px;
  background: #FFFFFF;
}

.cod-global-step-item {
  min-height: 88px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
  padding: 13px 14px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #F8FAFC;
}

.cod-global-step-item.in_progress {
  border-color: #C7D2FE;
  background: #EEF2FF;
}

.cod-global-step-item.completed {
  border-color: #BBF7D0;
  background: #F0FDF4;
}

.cod-global-step-item.fallback {
  border-color: #FED7AA;
  background: #FFFBEB;
}

.cod-global-step-item.failed {
  border-color: #FECACA;
  background: #FEF2F2;
}

.cod-global-step-item.pending {
  opacity: 0.68;
}

.cod-global-step-item.in_progress .cod-step-dot {
  border-color: #3730A3;
  background: #3730A3;
  box-shadow: 0 0 0 4px rgba(55, 48, 163, 0.12);
}

.cod-global-step-item.completed .cod-step-dot {
  border-color: #059669;
  background: #059669;
}

.cod-global-step-item.skipped .cod-step-dot {
  border-color: #94A3B8;
  background: #94A3B8;
}

.cod-global-step-item.fallback .cod-step-dot {
  border-color: #D97706;
  background: #D97706;
  box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.12);
}

.cod-global-step-item.failed .cod-step-dot {
  border-color: #DC2626;
  background: #DC2626;
}

.cod-global-step-content {
  min-width: 0;
}

.cod-global-step-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.cod-global-step-row strong {
  color: #111827;
  font-size: 13px;
  line-height: 1.35;
  font-weight: 900;
}

.cod-global-step-row span {
  flex: 0 0 auto;
  color: #64748B;
  font-size: 12px;
  font-weight: 900;
}

.cod-global-step-content p {
  margin: 6px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.55;
  font-weight: 700;
}

.cod-global-step-item.pending .cod-global-step-row strong,
.cod-global-step-item.pending .cod-global-step-row span,
.cod-global-step-item.pending .cod-global-step-content p {
  color: #94A3B8;
}

.cod-global-overview-grid.is-page {
  flex: 1 1 auto;
  min-height: 0;
  padding-top: 0;
}

.cod-global-empty-answer {
  width: min(980px, calc(100% - 28px));
  flex: 1 1 auto;
  min-height: 320px;
  justify-self: center;
  align-self: center;
  display: grid;
  place-content: center;
  gap: 6px;
  border: 1px solid #D8E0EA;
  border-radius: 8px;
  background: #FFFFFF;
  color: #64748B;
  text-align: center;
}

.cod-global-empty-answer strong {
  color: #0F172A;
  font-size: 18px;
}

.cod-global-empty-answer span {
  font-size: 13px;
  font-weight: 700;
}

.kg-report-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 170;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.44);
}

.kg-report-preview-modal {
  width: min(980px, 100%);
  max-height: min(820px, calc(100dvh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.24);
}

.kg-report-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid #E5EAF0;
  background: #F8FAFC;
}

.kg-report-preview-header span {
  display: block;
  margin-bottom: 4px;
  color: #64748B;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0;
}

.kg-report-preview-header h3 {
  margin: 0;
  color: #0F172A;
  font-size: 18px;
}

.kg-report-preview-body {
  min-height: 0;
  overflow: auto;
  padding: 18px 22px;
  font-size: 13.5px;
  line-height: 1.75;
}

@media (max-width: 1180px) {
  .cod-global-query-composer {
    width: min(980px, calc(100% - 28px));
  }

  .qa-feedback-score-grid {
    grid-template-columns: repeat(3, minmax(120px, 1fr));
  }

  .qa-feedback-review-layout {
    grid-template-columns: minmax(0, 1fr) minmax(330px, 380px);
  }

  .cod-global-query-toolbar {
    grid-template-columns: minmax(320px, 1fr) minmax(260px, 1fr);
  }

  .cod-global-query-input,
  .cod-global-query-toolbar .cod-feedback-open-btn,
  .cod-global-omd-toggle,
  .cod-global-llm-toggle,
  .cod-global-reasoning-toggle,
  .cod-global-run-btn {
    min-height: 58px;
  }
}

@media (max-width: 720px) {
  .cod-global-query-header {
    position: static;
    align-items: stretch;
    flex-direction: column;
  }

  .cod-global-report-brand strong {
    max-width: 100%;
    white-space: normal;
  }

  .cod-global-report-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .cod-global-query-main {
    overflow: auto;
  }

  .cod-global-query-toolbar {
    grid-template-columns: 1fr;
  }

  .cod-global-run-btn {
    min-height: 42px;
  }

  .cod-global-stepboard {
    grid-template-columns: 1fr;
    margin: 0 12px 12px;
    padding: 12px;
  }

  .qa-feedback-modal-backdrop {
    padding: 12px;
  }

  .qa-feedback-modal-header,
  .qa-feedback-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .qa-feedback-modal-actions {
    width: 100%;
  }

  .qa-feedback-modal-actions .qa-feedback-llm-judge-btn {
    flex: 1;
  }

  .qa-feedback-modal {
    max-height: calc(100dvh - 24px);
  }

  .qa-feedback-review-modal {
    width: calc(100vw - 24px);
  }

  .qa-feedback-review-modal .qa-feedback-modal-body {
    overflow: auto;
  }

  .qa-feedback-review-layout {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 0;
  }

  .qa-feedback-answer-pane {
    border-right: none;
    border-bottom: 1px solid #E2E8F0;
  }

  .qa-feedback-review-sidebar {
    overflow: visible;
  }

  .qa-feedback-score-summary {
    text-align: left;
  }

  .qa-feedback-score-grid,
  .qa-feedback-meta-grid,
  .qa-feedback-text-grid,
  .qa-feedback-score-logic-grid {
    grid-template-columns: 1fr;
  }

  .cod-global-step-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .kg-report-preview-backdrop {
    padding: 12px;
  }
}

.cod-global-overview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 140;
  padding: 16px;
  box-sizing: border-box;
  background: #EEF2F7;
}

.cod-global-overview-shell {
  width: 100%;
  height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #F8FAFC;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.22);
}

.cod-global-overview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid #DCE3EC;
  background: #FFFFFF;
}

.cod-global-overview-title {
  flex: 0 0 auto;
  min-width: 180px;
}

.cod-global-overview-kicker {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 900;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0;
}

.cod-global-overview-header h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
  color: #0F172A;
}

.cod-global-overview-question {
  flex: 1;
  min-width: 220px;
  max-width: min(860px, 58vw);
  display: grid;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid #D8E0EA;
  border-radius: 8px;
  background: #F8FAFC;
}

.cod-global-overview-question span {
  font-size: 10px;
  font-weight: 900;
  color: #64748B;
  text-transform: uppercase;
  letter-spacing: 0;
}

.cod-global-overview-question strong {
  max-height: 48px;
  overflow: auto;
  color: #0F172A;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.cod-global-overview-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-auto-rows: auto;
  grid-auto-flow: row dense;
  align-content: start;
  align-items: stretch;
  gap: 16px;
  padding: 16px;
  overflow: auto;
}

.cod-global-card {
  position: relative;
  min-height: auto;
  display: flex;
  flex-direction: column;
  overflow: visible;
  border: 1px solid #D8E0EA;
  border-top: 4px solid #64748B;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
}

.cod-global-card.is-llm-cod {
  grid-column: 1 / -1;
  min-height: auto;
}

.cod-global-card.is-cod-direct {
  grid-column: span 8;
  min-height: auto;
}

.cod-global-card.is-omd-direct {
  grid-column: span 4;
  grid-row: span 2;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  align-self: stretch;
}

.cod-global-card.is-metrics {
  grid-column: span 8;
  min-height: auto;
}

.cod-global-card.is-reasoning-route {
  grid-column: 1 / -1;
  min-height: auto;
}

.cod-global-card.is-logic-chain {
  grid-column: span 12;
  height: clamp(620px, calc(100dvh - 255px), 980px);
  min-height: 620px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px #D8E0EA, 0 10px 28px rgba(15, 23, 42, 0.06);
}

.cod-global-card.is-logic-chain::after {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 0;
  border: 1px solid #D8E0EA;
  border-top: 0;
  border-radius: 8px;
}

.cod-global-card.is-llm {
  border-top-color: #0F766E;
}

.cod-global-card.is-cod {
  border-top-color: #4338CA;
}

.cod-global-card.is-omd {
  border-top-color: #15803D;
}

.cod-global-card.is-metrics {
  border-top-color: #0369A1;
}

.cod-global-card.is-router {
  border-top-color: #6D28D9;
}

.cod-global-card.is-logic {
  border-top-color: #A16207;
}

.cod-global-card-header {
  flex-shrink: 0;
  padding: 12px 14px;
  border-bottom: 1px solid #E5EAF0;
  background: #FBFCFE;
}

.cod-global-card-kicker {
  margin-bottom: 4px;
  font-size: 10px;
  font-weight: 900;
  color: #64748B;
  text-transform: uppercase;
  letter-spacing: 0;
}

.cod-global-card h4 {
  margin: 0;
  font-size: 14px;
  line-height: 1.35;
  color: #111827;
}

.cod-global-card-body {
  flex: 1;
  min-height: auto;
  overflow: visible;
  padding: 16px 18px 18px;
  font-size: 13.5px;
  line-height: 1.76;
}

.cod-global-card.is-omd-direct .cod-global-card-body {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.cod-global-card.is-logic-chain .cod-global-card-body {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding-bottom: 96px;
  scrollbar-gutter: stable;
}

.cod-global-card.is-logic-chain .cod-global-card-body::after {
  content: "";
  display: block;
  height: 28px;
}

.cod-global-card-body :deep(.md-h2),
.cod-global-card-body :deep(.md-h3),
.cod-global-card-body :deep(.md-h4),
.cod-global-card-body :deep(.md-h5) {
  margin-top: 8px;
}

.cod-router-card-body {
  padding: 0;
  overflow: visible;
}

.cod-router-detail-panel {
  min-height: 520px;
}

.cod-router-visual {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
  padding: 14px;
  background: #FBFCFE;
}

.cod-router-visual.is-detail {
  min-height: 520px;
  padding: 18px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
}

.cod-router-summary {
  display: grid;
  grid-template-columns: 1.15fr 1.25fr 0.8fr;
  gap: 10px;
}

.cod-router-summary div,
.cod-router-score-row .cod-router-score-chip {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
}

.cod-router-summary span,
.cod-router-score-row span {
  display: block;
  margin-bottom: 4px;
  color: #64748B;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.cod-router-summary strong,
.cod-router-score-row strong {
  display: block;
  color: #0F172A;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.cod-router-visual.is-cot .cod-router-summary div:first-child,
.cod-router-visual.is-cot .cod-router-chain-step {
  border-color: #99F6E4;
  background: #F0FDFA;
}

.cod-router-visual.is-tot .cod-router-summary div:first-child,
.cod-router-visual.is-tot .cod-router-tree-root,
.cod-router-visual.is-tot .cod-router-branch {
  border-color: #DDD6FE;
  background: #F7F4FF;
}

.cod-router-chain {
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 18px;
  overflow: auto;
  padding: 8px 2px 12px;
}

.cod-router-chain.is-detail {
  align-items: stretch;
}

.cod-router-chain-step {
  position: relative;
  flex: 0 0 min(180px, 32%);
  min-height: 108px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 14px 13px;
  border: 1px solid #CCFBF1;
  border-radius: 8px;
}

.cod-router-chain-step:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -19px;
  width: 18px;
  height: 2px;
  background: #14B8A6;
}

.cod-router-chain-step:not(:last-child)::before {
  content: "";
  position: absolute;
  top: calc(50% - 4px);
  right: -21px;
  width: 8px;
  height: 8px;
  border-top: 2px solid #14B8A6;
  border-right: 2px solid #14B8A6;
  transform: rotate(45deg);
}

.cod-router-chain-step span {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #0F766E;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 900;
}

.cod-router-chain-step strong,
.cod-router-branch-head strong,
.cod-router-tree-root strong {
  color: #0F172A;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.cod-router-chain-step small,
.cod-router-branch small {
  color: #64748B;
  font-size: 11px;
  font-weight: 700;
}

.cod-router-tree {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(150px, 190px) minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  overflow: hidden;
}

.cod-router-tree-root {
  position: relative;
  min-height: 130px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border: 1px solid #DDD6FE;
  border-radius: 8px;
}

.cod-router-tree-root::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -17px;
  width: 16px;
  height: 2px;
  background: #8B5CF6;
}

.cod-router-tree-root span,
.cod-router-branch-head span {
  color: #6D28D9;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.cod-router-branches {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  overflow: auto;
  padding: 2px;
}

.cod-router-tree.is-detail .cod-router-branches {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cod-router-branch {
  min-height: 112px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #DDD6FE;
  border-left: 4px solid #8B5CF6;
  border-radius: 8px;
}

.cod-router-branch-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.cod-router-branch p {
  margin: 0;
  color: #334155;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.cod-router-score-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.cod-router-score-row .cod-router-score-chip {
  padding: 8px 10px;
}

.cod-router-score-row strong {
  font-size: 12px;
}

.cod-router-rationale {
  padding: 12px 14px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
  color: #475569;
  font-size: 12.5px;
  line-height: 1.6;
}

.cod-logic-route-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid #DDD6FE;
  border-left: 4px solid #7C3AED;
  border-radius: 8px;
  background: #F7F4FF;
}

.cod-logic-route-action span {
  display: block;
  margin-bottom: 3px;
  color: #6D28D9;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.cod-logic-route-action strong {
  display: block;
  color: #1E1B4B;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
}

.cod-logic-route-action button {
  flex: 0 0 auto;
  max-width: 260px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #6D28D9;
  border-radius: 8px;
  background: #6D28D9;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.35;
  white-space: normal;
  cursor: pointer;
}

.cod-logic-route-action button:hover,
.cod-logic-route-action button:focus-visible {
  background: #5B21B6;
}

.cod-routing-page-backdrop {
  position: fixed;
  inset: 0;
  z-index: 180;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(4px);
}

.cod-routing-page {
  width: 100%;
  height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #C4B5FD;
  border-radius: 8px;
  background: #F8FAFC;
  box-shadow: 0 26px 76px rgba(15, 23, 42, 0.28);
}

.cod-routing-page-header {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr) 40px;
  gap: 14px;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid #DDD6FE;
  background: #FFFFFF;
}

.cod-routing-page-kicker {
  margin-bottom: 4px;
  color: #6D28D9;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.cod-routing-page-header h3 {
  margin: 0;
  color: #0F172A;
  font-size: 22px;
  line-height: 1.2;
}

.cod-routing-page-question {
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #F8FAFC;
}

.cod-routing-page-question span {
  color: #64748B;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.cod-routing-page-question strong {
  color: #0F172A;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.cod-routing-page-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 14px;
  padding: 14px;
  overflow: auto;
}

.cod-routing-page-side,
.cod-routing-page-main {
  min-height: 0;
}

.cod-routing-page-side {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
}

.cod-routing-decision-card,
.cod-routing-academic-panel,
.cod-routing-score-stack,
.cod-routing-flags,
.cod-routing-trace-text {
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
}

.cod-routing-decision-card {
  order: 0;
  padding: 14px;
  border-color: #DDD6FE;
  background: #F7F4FF;
}

.cod-routing-decision-card span,
.cod-routing-score-stack span,
.cod-routing-trace-head span {
  display: block;
  margin-bottom: 5px;
  color: #64748B;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.cod-routing-decision-card strong,
.cod-routing-score-stack strong,
.cod-routing-trace-head strong {
  color: #0F172A;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.35;
}

.cod-routing-decision-card p {
  margin: 8px 0 0;
  color: #6D28D9;
  font-size: 12px;
  font-weight: 800;
}

.cod-routing-score-stack {
  order: 2;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 10px;
  overflow: auto;
}

.cod-routing-score-card {
  display: block;
  width: 100%;
  padding: 10px;
  border: 1px solid #EEF2F7;
  border-radius: 8px;
  background: #FBFCFE;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.cod-routing-score-card:hover {
  border-color: #A78BFA;
  box-shadow: 0 10px 24px rgba(124, 58, 237, 0.10);
  transform: translateY(-1px);
}

.cod-routing-score-card small {
  display: block;
  margin-top: 5px;
  color: #7C3AED;
  font-size: 10px;
  font-weight: 800;
}

.cod-routing-academic-panel {
  order: 1;
  padding: 12px;
  background: linear-gradient(180deg, #FFFFFF 0%, #FAF7FF 100%);
}

.cod-routing-academic-head span {
  display: block;
  color: #64748B;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.cod-routing-academic-head strong {
  display: block;
  margin-top: 4px;
  color: #1E1B4B;
  font-size: 12px;
  line-height: 1.35;
}

.cod-routing-radar {
  display: block;
  width: 100%;
  max-width: 190px;
  margin: 8px auto 6px;
}

.cod-routing-radar polygon,
.cod-routing-radar line {
  stroke: #DDD6FE;
  stroke-width: 1;
  fill: none;
}

.cod-routing-radar-area {
  fill: rgba(124, 58, 237, 0.18) !important;
  stroke: #7C3AED !important;
  stroke-width: 2 !important;
}

.cod-routing-radar circle {
  fill: #FFFFFF;
  stroke: #7C3AED;
  stroke-width: 1.6;
}

.cod-routing-radar text {
  fill: #475569;
  font-size: 9px;
  font-weight: 900;
}

.cod-routing-academic-bars {
  display: grid;
  gap: 7px;
}

.cod-routing-academic-bars div {
  position: relative;
  display: grid;
  grid-template-columns: 54px 42px;
  gap: 8px;
  align-items: center;
  padding-bottom: 7px;
}

.cod-routing-academic-bars div::before,
.cod-routing-academic-bars em {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  border-radius: 999px;
}

.cod-routing-academic-bars div::before {
  background: #EDE9FE;
}

.cod-routing-academic-bars em {
  right: auto;
  background: linear-gradient(90deg, #7C3AED, #14B8A6);
}

.cod-routing-academic-bars span {
  color: #475569;
  font-size: 10px;
  font-weight: 900;
}

.cod-routing-academic-bars strong {
  color: #111827;
  font-size: 11px;
  font-weight: 900;
  text-align: right;
}

.cod-routing-flags {
  order: 3;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}

.cod-routing-flags span {
  padding: 6px 9px;
  border: 1px solid #C4B5FD;
  border-radius: 999px;
  background: #F5F3FF;
  color: #5B21B6;
  font-size: 11px;
  font-weight: 900;
}

.cod-routing-page-main {
  display: block;
  overflow: visible;
}

.cod-router-visual.is-page {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
  overflow: visible;
}

.cod-router-hero {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 260px);
  gap: 12px;
  align-items: stretch;
}

.cod-router-hero > div {
  min-width: 0;
  padding: 13px 14px;
  border: 1px solid #D8E0EA;
  border-radius: 8px;
  background: #FBFCFE;
}

.cod-router-hero span,
.cod-router-cot-terminal span,
.cod-router-tot-root span,
.cod-router-tot-result span,
.cod-router-role-grid span,
.cod-router-score-strip span {
  display: block;
  margin-bottom: 5px;
  color: #64748B;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.cod-router-hero strong,
.cod-router-cot-terminal strong,
.cod-router-tot-root strong,
.cod-router-tot-result strong {
  display: block;
  color: #0F172A;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.25;
}

.cod-router-hero-route {
  border-color: #C7D2FE !important;
  background: #F8FAFF !important;
}

.cod-router-hero-route strong {
  color: #4338CA;
  font-size: 24px;
}

.cod-router-cot-board,
.cod-router-tot-board {
  flex: 1;
  min-height: 0;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #F8FAFC;
  overflow: hidden;
}

.cod-router-d3-board {
  flex: 0 0 auto;
  min-height: 0;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
  overflow: hidden;
}

.cod-router-d3-board.is-cot {
  border-color: #99F6E4;
}

.cod-router-d3-board.is-tot {
  border-color: #DDD6FE;
}

.cod-router-d3-svg {
  width: 100%;
  height: auto;
  min-width: 0;
  min-height: 0;
  display: block;
  font-family: inherit;
}

.cod-router-cot-board {
  display: grid;
  grid-template-columns: minmax(130px, 160px) minmax(0, 1fr) minmax(140px, 170px);
  gap: 0;
  align-items: stretch;
}

.cod-router-cot-terminal {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 16px;
  border-right: 1px solid #CCFBF1;
  background: #F0FDFA;
}

.cod-router-cot-terminal.is-answer {
  border-right: none;
  border-left: 1px solid #CCFBF1;
  background: #ECFDF5;
}

.cod-router-cot-terminal small,
.cod-router-tot-root small,
.cod-router-tot-result small {
  color: #64748B;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.4;
}

.cod-router-cot-lane {
  position: relative;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 26px 22px;
  overflow-x: auto;
  overflow-y: hidden;
}

.cod-router-cot-lane::before {
  content: "";
  position: absolute;
  left: 22px;
  right: 22px;
  top: 50%;
  height: 3px;
  border-radius: 999px;
  background: #99F6E4;
}

.cod-router-cot-step {
  position: relative;
  z-index: 1;
  flex: 0 0 178px;
  min-height: 158px;
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  align-content: center;
  gap: 8px;
  padding: 15px 14px;
  border: 1px solid #99F6E4;
  border-top: 4px solid #0F766E;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 10px 24px rgba(15, 118, 110, 0.08);
}

.cod-router-cot-step span {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #0F766E;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 900;
}

.cod-router-cot-step strong {
  color: #0F172A;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.cod-router-cot-step small,
.cod-router-cot-step em {
  color: #64748B;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
  line-height: 1.35;
}

.cod-router-cot-step em {
  align-self: end;
  width: fit-content;
  padding: 4px 7px;
  border: 1px solid #CCFBF1;
  border-radius: 999px;
  background: #F0FDFA;
  color: #0F766E;
}

.cod-router-tot-board {
  display: grid;
  grid-template-columns: minmax(150px, 190px) minmax(0, 1fr) minmax(140px, 170px);
  align-items: stretch;
}

.cod-router-tot-root,
.cod-router-tot-result {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 16px;
  background: #F7F4FF;
}

.cod-router-tot-root {
  border-right: 1px solid #DDD6FE;
}

.cod-router-tot-result {
  border-left: 1px solid #DDD6FE;
  background: #F8FAFF;
}

.cod-router-tot-root::after,
.cod-router-tot-result::before {
  content: "";
  position: absolute;
  top: 50%;
  width: 18px;
  height: 3px;
  border-radius: 999px;
  background: #8B5CF6;
}

.cod-router-tot-root::after {
  right: -18px;
}

.cod-router-tot-result::before {
  left: -18px;
}

.cod-router-tot-branches {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  align-content: start;
  gap: 12px;
  padding: 18px 22px;
  overflow: auto;
}

.cod-router-tot-branch {
  min-width: 0;
  min-height: 156px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #DDD6FE;
  border-left: 4px solid #8B5CF6;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 10px 24px rgba(91, 33, 182, 0.07);
}

.cod-router-tot-branch.is-primary {
  border-color: #99F6E4;
  border-left-color: #0F766E;
  background: #F8FFFD;
}

.cod-router-tot-branch-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.cod-router-tot-branch-head span {
  display: block;
  margin-bottom: 3px;
  color: #6D28D9;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.cod-router-tot-branch-head strong {
  color: #0F172A;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.cod-router-tot-branch-head small {
  flex: 0 0 auto;
  padding: 4px 7px;
  border: 1px solid #DDD6FE;
  border-radius: 999px;
  background: #F5F3FF;
  color: #5B21B6;
  font-size: 11px;
  font-weight: 900;
}

.cod-router-tot-branch p {
  margin: 0;
  color: #334155;
  font-size: 12.5px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.cod-router-tot-branch-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.cod-router-tot-branch-metrics span {
  min-width: 0;
  padding: 5px 6px;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  background: #F8FAFC;
  color: #475569;
  font-size: 10.5px;
  font-weight: 800;
  text-align: center;
}

.cod-router-tot-branch em {
  margin-top: auto;
  color: #0F766E;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}

.cod-router-info-panel {
  flex-shrink: 0;
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #F8FAFC;
}

.cod-router-score-strip {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  gap: 8px;
}

.cod-router-score-strip .cod-router-score-chip {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
}

.cod-router-score-chip {
  width: 100%;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease, background 0.16s ease;
}

.cod-router-score-chip:hover,
.cod-router-score-chip:focus-visible {
  border-color: #8B5CF6;
  background: #FBFAFF;
  box-shadow: 0 10px 24px rgba(124, 58, 237, 0.11);
  transform: translateY(-1px);
  outline: none;
}

.cod-router-score-strip strong {
  color: #0F172A;
  font-size: 14px;
  font-weight: 900;
}

.cod-router-role-grid {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cod-router-role-grid div {
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid #D8E0EA;
  border-radius: 8px;
  background: #FFFFFF;
}

.cod-router-role-grid strong {
  color: #334155;
  font-size: 12.5px;
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.cod-router-gain-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #BAE6FD;
  border-left: 4px solid #0284C7;
  border-radius: 8px;
  background: #F0F9FF;
}

.cod-router-gain-head {
  display: grid;
  gap: 5px;
}

.cod-router-gain-head span,
.cod-router-gain-grid span {
  color: #0369A1;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.cod-router-gain-head strong {
  color: #0F172A;
  font-size: 14px;
  font-weight: 950;
  line-height: 1.35;
}

.cod-router-gain-head p,
.cod-router-gain-grid p {
  margin: 0;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.55;
}

.cod-router-gain-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.cod-router-gain-grid div {
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 10px;
  border: 1px solid #BFDBFE;
  border-radius: 8px;
  background: #FFFFFF;
}

.cod-router-gain-grid strong {
  color: #0F172A;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.cod-router-tree.is-page {
  grid-template-columns: minmax(170px, 230px) minmax(0, 1fr);
}

.cod-router-tree.is-page .cod-router-branches {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cod-router-chain.is-page {
  align-items: stretch;
}

.cod-routing-trace-text {
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto;
  overflow: hidden;
}

.cod-routing-trace-head {
  padding: 12px 14px;
  border-bottom: 1px solid #E2E8F0;
  background: #FBFCFE;
}

.cod-routing-trace-text pre {
  margin: 0;
  padding: 14px;
  overflow: hidden;
  color: #334155;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.cod-metric-visual-suite {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #D7E3EE;
  border-radius: 8px;
  background: #FBFCFE;
}

.cod-metric-visual-suite.is-global {
  padding: 12px;
}

.cod-metric-visual-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cod-metric-visual-header span {
  font-size: 11px;
  font-weight: 900;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0;
}

.cod-metric-visual-header strong {
  padding: 4px 8px;
  border: 1px solid #B7D4E8;
  border-radius: 8px;
  background: #F0F7FC;
  color: #075985;
  font-size: 11px;
  font-weight: 900;
  text-align: right;
}

.cod-metric-visual-layout {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.cod-metric-radar-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
}

.cod-metric-radar {
  width: min(240px, 100%);
  height: auto;
}

.cod-radar-ring {
  fill: none;
  stroke: #D8E2EC;
  stroke-width: 1;
}

.cod-radar-axis {
  stroke: #E2E8F0;
  stroke-width: 1;
}

.cod-radar-area {
  fill: rgba(14, 116, 144, 0.18);
  stroke: #0E7490;
  stroke-width: 2.5;
}

.cod-radar-point {
  fill: #0F766E;
  stroke: #FFFFFF;
  stroke-width: 1.5;
}

.cod-radar-label {
  fill: #475569;
  font-size: 10px;
  font-weight: 800;
}

.cod-metric-domain-panel {
  display: grid;
  gap: 10px;
}

.cod-metric-domain-row {
  display: grid;
  gap: 6px;
}

.cod-metric-domain-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
}

.cod-metric-domain-head strong {
  flex-shrink: 0;
  color: #0F172A;
  font-variant-numeric: tabular-nums;
}

.cod-metric-domain-track {
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: #E8EEF5;
}

.cod-metric-domain-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #0E7490;
}

.cod-metric-domain-row.is-reliability .cod-metric-domain-track i {
  background: #4338CA;
}

.cod-metric-domain-row.is-evidence .cod-metric-domain-track i {
  background: #0F766E;
}

.cod-metric-domain-row.is-ontology .cod-metric-domain-track i {
  background: #15803D;
}

.cod-metric-domain-row.is-risk .cod-metric-domain-track i {
  background: #A16207;
}

.cod-metric-visual-note {
  padding: 9px 10px;
  border-left: 3px solid #0E7490;
  border-radius: 8px;
  background: #F8FAFC;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

.cod-global-metrics-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cod-global-metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}

.cod-global-inline-metrics {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #E2E8F0;
}

.cod-global-inline-metrics-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cod-global-inline-metrics-head span {
  display: block;
  margin-bottom: 3px;
  color: #64748B;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.cod-global-inline-metrics-head strong {
  display: block;
  color: #0F172A;
  font-size: 15px;
  font-weight: 900;
}

.cod-global-inline-metrics-head button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #0E7490;
  border-radius: 8px;
  background: #F0F9FF;
  color: #075985;
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.cod-global-inline-metrics-head button:hover,
.cod-global-inline-metrics-head button:focus-visible {
  background: #E0F2FE;
}

.cod-metric-visual-suite.is-inline {
  margin-bottom: 12px;
  padding: 12px;
}

.cod-global-metric-grid.is-inline {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.cod-global-metric-chip {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #BAE6FD;
  border-radius: 8px;
  background: #F8FCFF;
  color: #0C4A6E;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.cod-global-metric-chip:hover,
.cod-global-metric-chip:focus-visible {
  outline: none;
  border-color: #0284C7;
  box-shadow: 0 8px 20px rgba(2, 132, 199, 0.12);
  transform: translateY(-1px);
}

.cod-global-metric-chip span {
  min-width: 0;
  font-size: 11.5px;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.cod-global-metric-chip strong {
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.cod-global-metric-chip.is-excellent,
.cod-qa-metric-chip.is-excellent {
  border-color: #86EFAC;
  background: #F0FDF4;
  color: #14532D;
}

.cod-global-metric-chip.is-strong,
.cod-qa-metric-chip.is-strong {
  border-color: #BAE6FD;
  background: #F0F9FF;
  color: #0C4A6E;
}

.cod-global-metric-chip.is-moderate,
.cod-qa-metric-chip.is-moderate {
  border-color: #FDE68A;
  background: #FFFBEB;
  color: #713F12;
}

.cod-global-metric-chip.is-weak,
.cod-qa-metric-chip.is-weak {
  border-color: #FECACA;
  background: #FEF2F2;
  color: #7F1D1D;
}

.cod-detail-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 76;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.42);
}

.cod-detail-modal {
  width: min(1080px, 100%);
  max-height: min(840px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.24);
  display: flex;
  flex-direction: column;
}

.cod-detail-modal.is-llm {
  border-color: #99F6E4;
}

.cod-detail-modal.is-cod {
  border-color: #C7D2FE;
}

.cod-detail-modal.is-omd {
  border-color: #A7F3D0;
}

.cod-detail-modal.is-metrics {
  border-color: #BAE6FD;
}

.cod-detail-modal.is-router {
  border-color: #DDD6FE;
}

.cod-detail-modal.is-logic {
  border-color: #FDE68A;
  width: min(1440px, calc(100vw - 32px));
  max-height: min(920px, calc(100dvh - 32px));
}

.cod-detail-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #E5E7EB;
  background: #F8FAFC;
}

.cod-detail-modal-kicker {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 800;
  color: #4B5563;
  text-transform: uppercase;
}

.cod-detail-modal.is-llm .cod-detail-modal-kicker {
  color: #0F766E;
}

.cod-detail-modal.is-cod .cod-detail-modal-kicker {
  color: #3730A3;
}

.cod-detail-modal.is-omd .cod-detail-modal-kicker {
  color: #15803D;
}

.cod-detail-modal.is-metrics .cod-detail-modal-kicker {
  color: #0369A1;
}

.cod-detail-modal.is-router .cod-detail-modal-kicker {
  color: #6D28D9;
}

.cod-detail-modal.is-logic .cod-detail-modal-kicker {
  color: #A16207;
}

.cod-detail-modal-header h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
  color: #111827;
}

.cod-detail-modal-body {
  overflow: auto;
  padding: 18px 20px 22px;
}

.cod-detail-modal.is-logic .cod-detail-modal-body {
  padding: 20px 24px 44px;
}

.cod-detail-content {
  color: #374151;
}

.cod-answer :deep(.cod-domain-term),
.cod-detail-content :deep(.cod-domain-term) {
  border-radius: 3px;
  color: #123F46;
  font-weight: 850;
  text-decoration-skip-ink: auto;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.cod-answer :deep(.cod-domain-term:hover),
.cod-detail-content :deep(.cod-domain-term:hover) {
  background: rgba(20, 184, 166, 0.09);
  color: #0F766E;
}

.cod-answer :deep(.cod-domain-term u),
.cod-detail-content :deep(.cod-domain-term u),
.cod-answer :deep(strong > u) {
  font-weight: inherit;
  text-decoration-color: #14B8A6;
  text-decoration-thickness: 1.7px;
  text-underline-offset: 3px;
}

.cod-detail-content :deep(.cod-chain-highlight) {
  color: #0F766E;
  font-weight: 800;
  text-decoration: underline;
  text-decoration-color: #14B8A6;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.cod-detail-content :deep(u),
.cod-answer :deep(u) {
  color: #0F766E;
  font-weight: 800;
  text-decoration-color: #14B8A6;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.cod-detail-metric-panel {
  display: grid;
  gap: 12px;
}

.cod-question-text {
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
}

.cod-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.cod-tags span {
  padding: 3px 8px;
  border-radius: 999px;
  background: #EEF2FF;
  color: #3730A3;
  font-size: 11px;
  font-weight: 600;
}

.cod-json {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  background: #111827;
  color: #E5E7EB;
  font-size: 11px;
  line-height: 1.5;
}

.cod-metric-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #6B7280;
}

.cod-mini-card,
.cod-path-card {
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: #F9FAFB;
  padding: 10px 12px;
}

.cod-mini-card + .cod-mini-card {
  margin-top: 8px;
}

.mini-title {
  font-size: 12px;
  font-weight: 700;
  color: #1F2937;
  margin-bottom: 4px;
}

.mini-body {
  font-size: 12px;
  color: #6B7280;
  line-height: 1.5;
}

.cod-path-list,
.cod-verify-list,
.cod-proposal-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cod-path-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  font-weight: 700;
  color: #4B5563;
  margin-bottom: 8px;
}

.cod-path-text {
  font-size: 13px;
  line-height: 1.6;
  color: #1F2937;
}

.cod-evidence-line,
.cod-empty-line,
.cod-empty-state {
  margin-top: 8px;
  font-size: 12px;
  color: #6B7280;
}

.cod-empty-state {
  padding: 32px 20px;
  text-align: center;
}

.cod-query-error {
  max-width: 760px;
  margin: 0 auto;
  padding: 14px 16px;
  border: 1px solid #FCA5A5;
  border-radius: 8px;
  background: #FEF2F2;
  color: #991B1B;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.cod-verify-row {
  display: grid;
  grid-template-columns: 72px 72px repeat(3, minmax(90px, 1fr));
  gap: 8px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: #F9FAFB;
  font-size: 12px;
  color: #4B5563;
}

.cod-verify-row.keep {
  border-left: 3px solid #059669;
}

.cod-verify-row.revise {
  border-left: 3px solid #D97706;
}

.cod-verify-row.reject {
  border-left: 3px solid #DC2626;
}

.verify-id,
.verify-decision {
  font-weight: 700;
  color: #111827;
}

.cod-answer {
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

.cod-logic-chain {
  white-space: normal;
  overflow-wrap: anywhere;
}

.cod-logic-chain :deep(p),
.cod-logic-chain :deep(li) {
  overflow-wrap: anywhere;
}

.cod-logic-chain :deep(ul),
.cod-logic-chain :deep(ol) {
  margin-bottom: 14px;
}

.cod-qa-metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(178px, 1fr));
  gap: 10px;
}

.cod-qa-metric-chip {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #99F6E4;
  border-radius: 8px;
  background: #F8FFFD;
  color: #134E4A;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.cod-qa-metric-chip:hover,
.cod-qa-metric-chip:focus-visible {
  border-color: #14B8A6;
  box-shadow: 0 10px 28px rgba(20, 184, 166, 0.14);
  transform: translateY(-1px);
  outline: none;
}

.cod-qa-metric-chip span {
  font-size: 12px;
  font-weight: 800;
}

.cod-qa-metric-chip strong {
  font-size: 15px;
  font-weight: 900;
}

.cod-answer :deep(.cod-direct-answer-block),
.cod-answer :deep(.omd-direct-answer-block) {
  display: block;
  margin: 12px 0;
  padding: 14px 16px;
  border-radius: 8px;
  line-height: 1.75;
}

.cod-answer :deep(.cod-direct-answer-block) {
  background: #F8FAFC;
  border: 1px solid #CBD5E1;
  color: #334155;
}

.cod-answer :deep(.omd-direct-answer-block) {
  background: #ECFDF5;
  border: 1px solid #99F6E4;
  color: #115E59;
}

.cod-answer :deep(.direct-answer-block-title) {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 800;
  color: #475569;
}

.cod-answer :deep(.direct-answer-block-title.omd) {
  color: #0F766E;
}

.cod-answer :deep(.qa-metric-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.cod-answer :deep(.qa-metric-chip) {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  background: #FFFFFF;
  border: 1px solid #99F6E4;
  color: #134E4A;
  font-size: 12px;
  font-weight: 800;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.cod-answer :deep(.qa-metric-chip:hover),
.cod-answer :deep(.qa-metric-chip:focus-visible) {
  outline: none;
  border-color: #14B8A6;
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.14);
  transform: translateY(-1px);
}

.cod-answer :deep(.qa-metric-note) {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

.cod-answer :deep(.omd-gain-label) {
  color: #0F766E;
  font-weight: 800;
}

.cod-answer :deep(.omd-gain-text) {
  color: #115E59;
  font-weight: 600;
}

.cod-answer :deep(.omd-term) {
  color: #7C2D12;
  font-weight: 800;
}

.cod-answer :deep(.omd-term u) {
  text-decoration-color: #F97316;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.cod-answer :deep(.omd-reasoning-scaffold) {
  margin: 12px 0;
  padding: 12px 14px;
  border: 1px solid #5EEAD4;
  border-left: 4px solid #0F766E;
  border-radius: 8px;
  background: #F8FFFD;
  color: #134E4A;
}

.cod-answer :deep(.omd-reasoning-scaffold strong) {
  color: #0F766E;
  font-weight: 900;
}

.cod-answer :deep(.omd-reasoning-scaffold ol) {
  margin: 8px 0 0;
  padding-left: 20px;
}

.cod-answer :deep(.omd-reasoning-scaffold li) {
  margin: 6px 0;
  line-height: 1.65;
}

.qa-metric-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.42);
}

.routing-metric-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 210;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.48);
}

.qa-metric-modal {
  width: min(820px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid #CCFBF1;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.24);
  display: flex;
  flex-direction: column;
}

.routing-metric-modal {
  width: min(920px, 100%);
  max-height: min(780px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid #DDD6FE;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 28px 78px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
}

.qa-metric-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #E5E7EB;
  background: #F8FAFC;
}

.routing-metric-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #E5E7EB;
  background: #FAF5FF;
}

.qa-metric-modal-kicker {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 800;
  color: #0F766E;
  text-transform: uppercase;
}

.qa-metric-modal-header h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
  color: #111827;
}

.routing-metric-modal-header h3 {
  margin: 0;
  color: #111827;
  font-size: 18px;
  line-height: 1.3;
}

.qa-metric-modal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.qa-metric-professional-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #0F766E;
  border-radius: 8px;
  background: #0F766E;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.qa-metric-professional-btn:hover {
  border-color: #115E59;
  background: #115E59;
}

.qa-metric-modal-close {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  color: #334155;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.qa-metric-modal-close:hover {
  border-color: #94A3B8;
  background: #F8FAFC;
}

.qa-metric-modal-body {
  overflow: auto;
  padding: 18px 20px 20px;
}

.routing-metric-modal-body {
  overflow: auto;
  padding: 18px 20px 20px;
}

.qa-metric-final-band {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.routing-metric-final-band {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.qa-metric-final-band > div {
  min-height: 68px;
  padding: 12px;
  border: 1px solid #CCFBF1;
  border-radius: 8px;
  background: #F0FDFA;
}

.routing-metric-final-band > div {
  min-height: 68px;
  padding: 12px;
  border: 1px solid #DDD6FE;
  border-radius: 8px;
  background: #F5F3FF;
}

.qa-metric-final-band span {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #0F766E;
}

.routing-metric-final-band span {
  display: block;
  margin-bottom: 6px;
  color: #6D28D9;
  font-size: 11px;
  font-weight: 800;
}

.qa-metric-final-band strong {
  display: block;
  font-size: 20px;
  line-height: 1.25;
  color: #134E4A;
}

.routing-metric-final-band strong {
  display: block;
  color: #1E1B4B;
  font-size: 18px;
  font-weight: 900;
  line-height: 1.25;
}

.routing-metric-explain,
.routing-metric-formula,
.routing-metric-note-panel {
  margin-bottom: 14px;
  border-radius: 8px;
}

.routing-metric-explain {
  padding: 12px 14px;
  border: 1px solid #E2E8F0;
  background: #FFFFFF;
  color: #334155;
  font-size: 13px;
  line-height: 1.65;
}

.routing-metric-formula {
  padding: 12px 14px;
  border: 1px solid #DDD6FE;
  background: #FAF5FF;
  color: #4C1D95;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.55;
}

.routing-metric-section {
  margin-bottom: 14px;
}

.routing-metric-section h4 {
  margin: 0 0 8px;
  color: #334155;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.routing-metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.routing-metric-grid div {
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FBFCFE;
}

.routing-metric-grid span {
  display: block;
  margin-bottom: 4px;
  color: #64748B;
  font-size: 10px;
  font-weight: 900;
}

.routing-metric-grid strong {
  color: #0F172A;
  font-size: 13px;
  font-weight: 900;
  word-break: break-word;
}

.routing-metric-table {
  margin-bottom: 14px;
}

.routing-metric-note-panel {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid #CCFBF1;
  background: #F0FDFA;
  color: #115E59;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}

.routing-metric-note-panel p {
  margin: 0;
}

.qa-metric-explain,
.qa-metric-formula,
.qa-metric-note-panel {
  font-size: 13px;
  line-height: 1.65;
  color: #475569;
}

.qa-metric-formula {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  color: #1F2937;
  font-weight: 700;
}

.qa-calc-table {
  margin-top: 14px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  overflow: hidden;
}

.qa-calc-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.5fr) minmax(88px, 0.7fr) minmax(72px, 0.5fr) minmax(88px, 0.7fr);
  gap: 10px;
  align-items: center;
  padding: 9px 12px;
  border-top: 1px solid #E5E7EB;
  font-size: 12px;
  color: #334155;
}

.qa-calc-row:first-child {
  border-top: none;
}

.qa-calc-head {
  background: #F8FAFC;
  color: #475569;
  font-size: 11px;
  font-weight: 800;
}

.qa-calc-row span:not(:first-child) {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.qa-metric-extra {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.qa-extra-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: #FFFFFF;
  font-size: 12px;
  color: #475569;
}

.qa-extra-row strong {
  color: #111827;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.qa-metric-note-panel {
  margin-top: 14px;
  padding: 10px 12px;
  border-left: 3px solid #14B8A6;
  border-radius: 8px;
  background: #F8FAFC;
}

.qa-professional-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 160;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.55);
}

.qa-professional-modal {
  width: min(1040px, 100%);
  max-height: min(860px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 28px 86px rgba(15, 23, 42, 0.32);
  display: flex;
  flex-direction: column;
}

.qa-professional-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #E2E8F0;
  background: #F8FAFC;
}

.qa-professional-header h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
  color: #0F172A;
}

.qa-professional-body {
  overflow: auto;
  padding: 18px 20px 22px;
}

.qa-professional-final {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.qa-professional-final > div,
.qa-professional-source-item,
.qa-professional-input,
.qa-professional-meta-item {
  padding: 10px 12px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
}

.qa-professional-final > div {
  background: #F8FAFC;
}

.qa-professional-final span,
.qa-professional-source-item span,
.qa-professional-input span,
.qa-professional-meta-item span {
  display: block;
  margin-bottom: 5px;
  font-size: 11px;
  font-weight: 800;
  color: #64748B;
}

.qa-professional-final strong,
.qa-professional-source-item strong,
.qa-professional-input strong,
.qa-professional-meta-item strong {
  display: block;
  color: #0F172A;
  font-size: 13px;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.qa-professional-final strong {
  font-size: 15px;
}

.qa-professional-source,
.qa-professional-inputs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.qa-professional-inputs {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.qa-professional-steps {
  margin-top: 16px;
  display: grid;
  gap: 12px;
}

.qa-professional-step {
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #FFFFFF;
  overflow: hidden;
}

.qa-professional-step-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border-bottom: 1px solid #E2E8F0;
  background: #F8FAFC;
}

.qa-professional-step-header span {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 800;
  color: #0F766E;
}

.qa-professional-step-header h4 {
  margin: 0;
  font-size: 14px;
  line-height: 1.35;
  color: #111827;
}

.qa-professional-step-header strong {
  flex-shrink: 0;
  color: #0F172A;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.qa-professional-operation,
.qa-professional-formula {
  margin: 10px 14px 0;
  font-size: 12px;
  line-height: 1.6;
  color: #475569;
}

.qa-professional-operation {
  font-weight: 800;
  color: #334155;
}

.qa-professional-formula {
  padding: 9px 10px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  background: #F8FAFC;
  color: #1F2937;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  overflow-wrap: anywhere;
}

.qa-professional-term-table {
  margin: 12px 14px 0;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  overflow-x: auto;
}

.qa-professional-term-row {
  min-width: 760px;
  display: grid;
  grid-template-columns: 110px minmax(210px, 1.5fr) repeat(3, minmax(110px, 0.7fr));
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-top: 1px solid #E2E8F0;
  font-size: 12px;
  color: #334155;
}

.qa-professional-term-row:first-child {
  border-top: none;
}

.qa-professional-term-head {
  background: #F8FAFC;
  color: #475569;
  font-size: 11px;
  font-weight: 800;
}

.qa-professional-term-row span:nth-child(n+3) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.qa-professional-step-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 14px 14px;
}

@media (max-width: 900px) {
  .cod-action-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cod-submit-btn {
    grid-column: span 2;
  }
}

@media (max-width: 720px) {
  .action-bar {
    align-items: flex-start;
    padding: 12px;
  }

  .action-bar-header {
    order: 1;
    min-width: 150px;
  }

  .project-corner-badge {
    order: 2;
    flex: 0 1 calc(100% - 170px);
    max-width: calc(100% - 170px);
    margin-left: auto;
  }

  .action-bar-tabs {
    order: 3;
    min-width: 0;
    flex-basis: 100%;
    justify-content: flex-start;
  }

  :deep(.md-table) {
    min-width: 760px;
    font-size: 12px;
  }

  .cod-query-bar {
    grid-template-columns: 1fr;
  }

  .cod-action-stack {
    grid-template-columns: 1fr;
  }

  .cod-feedback-open-btn,
  .cod-omd-toggle,
  .cod-llm-toggle,
  .cod-submit-btn {
    grid-column: auto;
  }

  .cod-llm-confirm-backdrop,
  .cod-detail-modal-backdrop,
  .routing-metric-modal-backdrop,
  .qa-metric-modal-backdrop,
  .qa-professional-modal-backdrop {
    align-items: stretch;
    padding: 12px;
  }

  .cod-llm-confirm-modal,
  .cod-detail-modal,
  .routing-metric-modal,
  .qa-metric-modal,
  .qa-professional-modal {
    max-height: calc(100vh - 24px);
  }

  .cod-detail-button-grid {
    grid-template-columns: 1fr;
  }

  .cod-detail-launch-header {
    align-items: stretch;
    flex-direction: column;
  }

  .cod-global-overview-btn {
    justify-content: center;
    width: 100%;
  }

  .cod-global-overview-backdrop {
    padding: 10px;
  }

  .cod-global-overview-shell {
    height: calc(100dvh - 20px);
  }

  .cod-global-overview-header {
    align-items: stretch;
    flex-wrap: wrap;
    gap: 10px;
  }

  .cod-global-overview-title {
    min-width: 0;
  }

  .cod-global-overview-question {
    order: 3;
    flex-basis: 100%;
    min-width: 0;
    max-width: none;
  }

  .cod-global-overview-grid {
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
    overflow: auto;
  }

  .cod-global-card,
  .cod-global-card.is-llm-cod,
  .cod-global-card.is-cod-direct,
  .cod-global-card.is-omd-direct,
  .cod-global-card.is-metrics,
  .cod-global-card.is-reasoning-route,
  .cod-global-card.is-logic-chain {
    grid-column: 1 / -1;
    min-height: 360px;
  }

  .cod-metric-visual-layout {
    grid-template-columns: 1fr;
  }

  .cod-metric-radar-panel {
    min-height: 200px;
  }

  .cod-metric-visual-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .cod-router-summary,
  .cod-router-tree,
  .cod-router-branches,
  .cod-router-score-row,
  .cod-router-tree.is-detail .cod-router-branches {
    grid-template-columns: 1fr;
  }

  .cod-router-tree-root::after,
  .cod-router-chain-step::before,
  .cod-router-chain-step::after {
    display: none;
  }

  .cod-router-chain {
    align-items: stretch;
    flex-direction: column;
    overflow: visible;
  }

  .cod-router-chain-step {
    flex-basis: auto;
    min-height: 96px;
  }

  .cod-logic-route-action {
    align-items: stretch;
    flex-direction: column;
  }

  .cod-logic-route-action button {
    width: 100%;
  }

  .cod-routing-page-backdrop {
    padding: 10px;
  }

  .cod-routing-page {
    height: calc(100dvh - 20px);
  }

  .cod-routing-page-header,
  .cod-routing-page-body,
  .cod-routing-page-main {
    grid-template-columns: 1fr;
  }

  .cod-routing-page-header {
    align-items: stretch;
  }

  .cod-routing-page-body {
    overflow: auto;
  }

  .cod-routing-page-side,
  .cod-routing-page-main,
  .cod-router-visual.is-page,
  .cod-routing-trace-text {
    min-height: auto;
  }

  .cod-routing-page-main {
    grid-template-rows: auto auto;
  }

  .cod-router-hero,
  .cod-router-cot-board,
  .cod-router-tot-board,
  .cod-router-info-panel,
  .cod-router-role-grid,
  .cod-router-gain-grid,
  .routing-metric-final-band,
  .routing-metric-grid,
  .cod-router-score-strip {
    grid-template-columns: 1fr;
  }

  .cod-router-visual.is-page {
    overflow: visible;
  }

  .cod-router-d3-board {
    overflow: hidden;
  }

  .cod-router-d3-svg {
    min-width: 0;
  }

  .cod-router-cot-lane {
    align-items: stretch;
    flex-direction: column;
    overflow: visible;
  }

  .cod-router-cot-lane::before,
  .cod-router-tot-root::after,
  .cod-router-tot-result::before {
    display: none;
  }

  .cod-router-cot-step {
    flex-basis: auto;
    min-height: 118px;
  }

  .cod-router-tot-branches {
    grid-template-columns: 1fr;
    overflow: visible;
  }

  .cod-router-tot-root,
  .cod-router-tot-result {
    border: none;
    border-bottom: 1px solid #DDD6FE;
  }

  .cod-router-tree.is-page .cod-router-branches {
    grid-template-columns: 1fr;
  }

  .cod-global-metric-grid {
    grid-template-columns: 1fr;
  }

  .cod-llm-confirm-grid,
  .qa-metric-final-band,
  .qa-metric-extra,
  .qa-professional-final,
  .qa-professional-source,
  .qa-professional-inputs,
  .qa-professional-step-meta {
    grid-template-columns: 1fr;
  }

  .qa-calc-row {
    grid-template-columns: minmax(130px, 1fr) 78px 56px 78px;
    gap: 6px;
    padding: 8px;
    font-size: 11px;
  }
}

/* Report Agent Tools Card */
.report-agent-tools-card {
  border-bottom: 1px solid #E5E7EB;
  background: linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%);
}

.tools-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
}

.tools-card-avatar {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  background: linear-gradient(135deg, #1F2937 0%, #374151 100%);
  color: #FFFFFF;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(31, 41, 55, 0.2);
}

.tools-card-info {
  flex: 1;
  min-width: 0;
}

.tools-card-name {
  font-size: 15px;
  font-weight: 600;
  color: #1F2937;
  margin-bottom: 2px;
}

.tools-card-subtitle {
  font-size: 12px;
  color: #6B7280;
}

.tools-card-toggle {
  width: 28px;
  height: 28px;
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6B7280;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.tools-card-toggle:hover {
  background: #F9FAFB;
  border-color: #D1D5DB;
}

.tools-card-toggle svg {
  transition: transform 0.3s ease;
}

.tools-card-toggle svg.is-expanded {
  transform: rotate(180deg);
}

.tools-card-body {
  padding: 0 20px 16px 20px;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.tool-item {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: #FFFFFF;
  border-radius: 10px;
  border: 1px solid #E5E7EB;
  transition: all 0.2s ease;
}

.tool-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tool-icon-wrapper {
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tool-purple .tool-icon-wrapper {
  background: rgba(139, 92, 246, 0.1);
  color: #8B5CF6;
}

.tool-blue .tool-icon-wrapper {
  background: rgba(59, 130, 246, 0.1);
  color: #3B82F6;
}

.tool-orange .tool-icon-wrapper {
  background: rgba(249, 115, 22, 0.1);
  color: #F97316;
}

.tool-green .tool-icon-wrapper {
  background: rgba(34, 197, 94, 0.1);
  color: #22C55E;
}

.tool-content {
  flex: 1;
  min-width: 0;
}

.tool-name {
  font-size: 12px;
  font-weight: 600;
  color: #1F2937;
  margin-bottom: 4px;
}

.tool-desc {
  font-size: 11px;
  color: #6B7280;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Agent Profile Card */
.agent-profile-card {
  border-bottom: 1px solid #E5E7EB;
  background: linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%);
}

.response-style-hint {
  margin: 10px 24px 0;
  padding: 10px 12px;
  font-size: 12px;
  color: #4b5563;
  border: 1px solid #e5e7eb;
  border-left: 3px solid #111827;
  border-radius: 8px;
  background: #f9fafb;
}

.profile-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
}

.profile-card-avatar {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  background: linear-gradient(135deg, #1F2937 0%, #374151 100%);
  color: #FFFFFF;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(31, 41, 55, 0.2);
}

.profile-card-info {
  flex: 1;
  min-width: 0;
}

.profile-card-name {
  font-size: 15px;
  font-weight: 600;
  color: #1F2937;
  margin-bottom: 2px;
}

.profile-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #6B7280;
}

.profile-card-handle {
  color: #9CA3AF;
}

.profile-card-profession {
  padding: 2px 8px;
  background: #E5E7EB;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.profile-card-toggle {
  width: 28px;
  height: 28px;
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6B7280;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.profile-card-toggle:hover {
  background: #F9FAFB;
  border-color: #D1D5DB;
}

.profile-card-toggle svg {
  transition: transform 0.3s ease;
}

.profile-card-toggle svg.is-expanded {
  transform: rotate(180deg);
}

.profile-card-body {
  padding: 0 20px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.profile-card-label {
  font-size: 11px;
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.profile-card-bio {
  background: #FFFFFF;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #E5E7EB;
}

.profile-card-bio p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #4B5563;
}

/* Target Selector */
.target-selector {
  padding: 16px 24px;
  border-bottom: 1px solid #E5E7EB;
}

.selector-label {
  font-size: 11px;
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}

.selector-options {
  display: flex;
  gap: 12px;
}

.target-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.target-option:hover {
  border-color: #D1D5DB;
}

.target-option.active {
  background: #1F2937;
  color: #FFFFFF;
  border-color: #1F2937;
}

/* Agent Dropdown */
.agent-dropdown {
  position: relative;
}

.dropdown-arrow {
  margin-left: 4px;
  transition: transform 0.2s ease;
  opacity: 0.6;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 240px;
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06);
  max-height: 320px;
  overflow-y: auto;
  z-index: 100;
}

.dropdown-header {
  padding: 12px 16px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #F3F4F6;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
  border-left: 3px solid transparent;
}

.dropdown-item:hover {
  background: #F9FAFB;
  border-left-color: #1F2937;
}

.dropdown-item:first-of-type {
  margin-top: 4px;
}

.dropdown-item:last-child {
  margin-bottom: 4px;
}

.agent-avatar {
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  background: linear-gradient(135deg, #1F2937 0%, #374151 100%);
  color: #FFFFFF;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(31, 41, 55, 0.1);
}

.agent-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 13px;
  font-weight: 600;
  color: #1F2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-role {
  font-size: 11px;
  color: #9CA3AF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Chat Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #9CA3AF;
}

.empty-icon {
  opacity: 0.3;
}

.empty-text {
  font-size: 14px;
  text-align: center;
  max-width: 280px;
  line-height: 1.6;
}

.chat-message {
  display: flex;
  gap: 12px;
}

.chat-message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.chat-message.user .message-avatar {
  background: #1F2937;
  color: #FFFFFF;
}

.chat-message.assistant .message-avatar {
  background: #F3F4F6;
  color: #374151;
}

.message-content {
  max-width: 70%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-message.user .message-content {
  align-items: flex-end;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-message.user .message-header {
  flex-direction: row-reverse;
}

.sender-name {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.message-time {
  font-size: 11px;
  color: #9CA3AF;
}

.message-text {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
}

.chat-message.user .message-text {
  background: #1F2937;
  color: #FFFFFF;
  border-bottom-right-radius: 4px;
}

.chat-message.assistant .message-text {
  background: #F3F4F6;
  color: #374151;
  border-bottom-left-radius: 4px;
}

.dual-message-text {
  width: 100%;
}

.dual-version-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.dual-version-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #ffffff;
  overflow: hidden;
}

.dual-version-card.official {
  border-top: 3px solid #374151;
}

.dual-version-card.personal {
  border-top: 3px solid #16a34a;
}

.dual-version-title {
  font-size: 12px;
  font-weight: 700;
  color: #111827;
  padding: 8px 10px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.dual-version-content {
  padding: 10px;
  font-size: 13px;
  line-height: 1.55;
}

.dual-version-content :deep(.md-p) {
  margin: 0 0 8px 0;
}

.dual-version-content :deep(.md-p:last-child) {
  margin-bottom: 0;
}

@media (max-width: 1024px) {
  .dual-version-grid {
    grid-template-columns: 1fr;
  }
}

.message-text :deep(.md-p) {
  margin: 0;
}

.message-text :deep(.md-p:last-child) {
  margin-bottom: 0;
}

/* 修复有序列表编号 - 使用 CSS 计数器让多个 ol 连续编号 */
.message-text {
  counter-reset: list-counter;
}

.message-text :deep(.md-ol) {
  list-style: none;
  padding-left: 0;
  margin: 8px 0;
}

.message-text :deep(.md-oli) {
  counter-increment: list-counter;
  display: flex;
  gap: 8px;
  margin: 4px 0;
}

.message-text :deep(.md-oli)::before {
  content: counter(list-counter) ".";
  font-weight: 600;
  color: #374151;
  min-width: 20px;
  flex-shrink: 0;
}

/* 无序列表样式 */
.message-text :deep(.md-ul) {
  padding-left: 20px;
  margin: 8px 0;
}

.message-text :deep(.md-li) {
  margin: 4px 0;
}

/* Typing Indicator */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 10px 14px;
  background: #F3F4F6;
  border-radius: 12px;
  border-bottom-left-radius: 4px;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #9CA3AF;
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: 0s; }
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
}

/* Chat Input */
.chat-input-area {
  padding: 16px 24px;
  border-top: 1px solid #E5E7EB;
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.chat-input {
  flex: 1;
  padding: 12px 16px;
  font-size: 14px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  resize: none;
  font-family: inherit;
  line-height: 1.5;
  transition: border-color 0.2s ease;
}

.chat-input:focus {
  outline: none;
  border-color: #1F2937;
}

.chat-input:disabled {
  background: #F9FAFB;
  cursor: not-allowed;
}

.send-btn {
  width: 44px;
  height: 44px;
  background: #1F2937;
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.send-btn:hover:not(:disabled) {
  background: #374151;
}

.send-btn:disabled {
  background: #E5E7EB;
  color: #9CA3AF;
  cursor: not-allowed;
}

/* Survey Container */
.survey-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.survey-setup {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  border-bottom: 1px solid #E5E7EB;
  overflow: hidden;
}

.setup-section {
  margin-bottom: 24px;
}

.setup-section:first-child {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.setup-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.setup-section .section-header .section-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.selection-count {
  font-size: 12px;
  color: #9CA3AF;
}

/* Agents Grid */
.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  align-content: start;
}

.agent-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-checkbox:hover {
  border-color: #D1D5DB;
}

.agent-checkbox.checked {
  background: #F0FDF4;
  border-color: #10B981;
}

.agent-checkbox input {
  display: none;
}

.checkbox-avatar {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  background: #E5E7EB;
  color: #374151;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.agent-checkbox.checked .checkbox-avatar {
  background: #10B981;
  color: #FFFFFF;
}

.checkbox-info {
  flex: 1;
  min-width: 0;
}

.checkbox-name {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #1F2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.checkbox-role {
  display: block;
  font-size: 10px;
  color: #9CA3AF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.checkbox-indicator {
  width: 20px;
  height: 20px;
  border: 2px solid #E5E7EB;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.agent-checkbox.checked .checkbox-indicator {
  background: #10B981;
  border-color: #10B981;
  color: #FFFFFF;
}

.checkbox-indicator svg {
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.2s ease;
}

.agent-checkbox.checked .checkbox-indicator svg {
  opacity: 1;
  transform: scale(1);
}

.selection-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.action-link {
  font-size: 12px;
  color: #6B7280;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.action-link:hover {
  color: #1F2937;
  text-decoration: underline;
}

.action-divider {
  color: #E5E7EB;
}

/* Survey Input */
.survey-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 14px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  resize: none;
  font-family: inherit;
  line-height: 1.5;
  transition: border-color 0.2s ease;
}

.survey-input:focus {
  outline: none;
  border-color: #1F2937;
}

.survey-submit-btn {
  width: 100%;
  padding: 14px 24px;
  font-size: 14px;
  font-weight: 600;
  color: #FFFFFF;
  background: #1F2937;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}

.survey-submit-btn:hover:not(:disabled) {
  background: #374151;
}

.survey-submit-btn:disabled {
  background: #E5E7EB;
  color: #9CA3AF;
  cursor: not-allowed;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #FFFFFF;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Survey Results */
.survey-results {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.results-title {
  font-size: 14px;
  font-weight: 600;
  color: #1F2937;
}

.results-count {
  font-size: 12px;
  color: #9CA3AF;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-card {
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  padding: 20px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.result-avatar {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  background: #1F2937;
  color: #FFFFFF;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.result-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-name {
  font-size: 14px;
  font-weight: 600;
  color: #1F2937;
}

.result-role {
  font-size: 12px;
  color: #9CA3AF;
}

.result-question {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  background: #FFFFFF;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #6B7280;
}

.result-question svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.result-answer {
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

/* Markdown Styles */
:deep(.md-p) {
  margin: 0 0 12px 0;
}

:deep(.md-h2) {
  font-size: 20px;
  font-weight: 700;
  color: #1F2937;
  margin: 24px 0 12px 0;
}

:deep(.md-h3) {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  margin: 20px 0 10px 0;
}

:deep(.md-h4) {
  font-size: 14px;
  font-weight: 600;
  color: #4B5563;
  margin: 16px 0 8px 0;
}

:deep(.md-h5) {
  font-size: 13px;
  font-weight: 600;
  color: #6B7280;
  margin: 12px 0 6px 0;
}

:deep(.md-ul), :deep(.md-ol) {
  margin: 12px 0;
  padding-left: 24px;
}

:deep(.md-li), :deep(.md-oli) {
  margin: 6px 0;
}

:deep(.md-link) {
  color: #1D4ED8;
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid rgba(29, 78, 216, 0.28);
}

:deep(.md-link:hover) {
  color: #1E40AF;
  border-bottom-color: currentColor;
}

:deep(.md-table-wrap) {
  width: 100%;
  margin: 14px 0 18px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  background: #FFFFFF;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

:deep(.md-table-scroll) {
  width: 100%;
  overflow-x: auto;
}

:deep(.md-table) {
  width: 100%;
  min-width: 860px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 13px;
  line-height: 1.6;
}

:deep(.md-table.col-count-4 .md-col-1) {
  width: 22%;
}

:deep(.md-table.col-count-4 .md-col-2) {
  width: 14%;
}

:deep(.md-table.col-count-4 .md-col-3) {
  width: 50%;
}

:deep(.md-table.col-count-4 .md-col-4) {
  width: 14%;
}

:deep(.md-table th),
:deep(.md-table td) {
  padding: 12px 14px;
  border-bottom: 1px solid #E5E7EB;
  border-right: 1px solid #E5E7EB;
  vertical-align: top;
  text-align: left;
  overflow-wrap: anywhere;
  word-break: normal;
}

:deep(.md-table th:last-child),
:deep(.md-table td:last-child) {
  border-right: 0;
}

:deep(.md-table tbody tr:last-child td) {
  border-bottom: 0;
}

:deep(.md-table th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: linear-gradient(180deg, #F8FAFC 0%, #EEF2F7 100%);
  color: #111827;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

:deep(.md-table td) {
  color: #374151;
  background: #FFFFFF;
}

:deep(.md-table tbody tr:nth-child(even) td) {
  background: #F8FAFC;
}

:deep(.md-table tbody tr:hover td) {
  background: #EFF6FF;
}

:deep(.md-table td:first-child) {
  color: #111827;
  font-weight: 700;
}

:deep(.md-evidence-badge) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
  border: 1px solid transparent;
}

:deep(.md-evidence-badge.is-high) {
  color: #047857;
  background: #D1FAE5;
  border-color: #A7F3D0;
}

:deep(.md-evidence-badge.is-medium) {
  color: #92400E;
  background: #FEF3C7;
  border-color: #FDE68A;
}

:deep(.md-evidence-badge.is-low) {
  color: #991B1B;
  background: #FEE2E2;
  border-color: #FECACA;
}

:deep(.md-evidence-badge.is-neutral) {
  color: #374151;
  background: #F3F4F6;
  border-color: #E5E7EB;
}

:deep(.thinking-chain) {
  display: block;
  color: #1F2937;
}

/* 聊天/问卷区域的引用样式 */
.chat-messages :deep(.md-quote),
.result-answer :deep(.md-quote) {
  margin: 12px 0;
  padding: 12px 16px;
  background: #F9FAFB;
  border-left: 3px solid #1F2937;
  color: #4B5563;
}

:deep(.code-block) {
  margin: 12px 0;
  padding: 12px 16px;
  background: #1F2937;
  border-radius: 6px;
  overflow-x: auto;
}

:deep(.code-block code) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #E5E7EB;
}

:deep(.inline-code) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  background: #F3F4F6;
  padding: 2px 6px;
  border-radius: 4px;
  color: #1F2937;
}

:deep(.md-hr) {
  border: none;
  border-top: 1px solid #E5E7EB;
  margin: 24px 0;
}
</style>
