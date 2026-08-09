<template>
  <div class="env-setup-panel">
    <div class="scroll-container">
      <section v-if="preparationState === 'missing-question'" class="missing-question-notice" role="alert">
        <p>当前项目缺少研究问题，无法开始 ASC 分析准备。</p>
        <p>你仍可使用图谱问答。</p>
        <button class="action-btn" type="button" @click="emit('go-qa', projectData)">去图谱问答</button>
      </section>
      <!-- Step 01: 分析工作台实例 -->
      <div class="step-card" :class="{ 'active': phase === 0, 'completed': phase > 0 }">
        <div class="card-header">
          <div class="step-info">
            <span class="step-num">01</span>
            <span class="step-title">分析工作台初始化</span>
          </div>
          <div class="step-status">
            <span v-if="phase > 0" class="badge success">已完成</span>
            <span v-else class="badge processing">初始化</span>
          </div>
        </div>
        
        <div class="card-content">
          <p class="api-note">POST /api/simulation/create</p>
          <p class="description">
            创建ASC文献分析工作台实例，绑定项目图谱与查询 Prompt
          </p>

          <div v-if="simulationId" class="info-card">
            <div class="info-row">
              <span class="info-label">Project ID</span>
              <span class="info-value mono">{{ projectData?.project_id }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Graph ID</span>
              <span class="info-value mono">{{ projectData?.graph_id }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Analysis ID</span>
              <span class="info-value mono">{{ simulationId }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Task ID</span>
              <span class="info-value mono">{{ taskId || '异步任务已完成' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 02: 生成分析模块 -->
      <div class="step-card" :class="{ 'active': phase === 1, 'completed': phase > 1 }">
        <div class="card-header">
          <div class="step-info">
            <span class="step-num">02</span>
            <span class="step-title">生成ASC分析模块</span>
          </div>
          <div class="step-status">
            <span v-if="phase > 1" class="badge success">已完成</span>
            <span v-else-if="phase === 1" class="badge processing">{{ prepareProgress }}%</span>
            <span v-else class="badge pending">等待</span>
          </div>
        </div>

        <div class="card-content">
          <p class="api-note">POST /api/simulation/prepare</p>
          <p class="description">
            基于ASC知识图谱梳理文献知识点、证据边与关联节点，生成抽取、核查、洞察、建议和查询模块
          </p>

          <!-- Profiles Stats -->
          <div v-if="profiles.length > 0" class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{{ profiles.length }}</span>
              <span class="stat-label">当前模块数</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ expectedTotal || '-' }}</span>
              <span class="stat-label">预期知识点总数</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ totalTopicsCount }}</span>
              <span class="stat-label">关联主题数</span>
            </div>
          </div>

          <!-- Profiles List Preview -->
          <div v-if="profiles.length > 0" class="profiles-preview">
            <div class="preview-header">
              <span class="preview-title">已生成的ASC分析模块</span>
            </div>
            <div class="profiles-list">
              <div 
                v-for="(profile, idx) in profiles" 
                :key="idx" 
                class="profile-card"
                @click="selectProfile(profile)"
              >
                <div class="profile-header">
                  <span class="profile-realname">{{ profile.name || '未命名知识点' }}</span>
                  <span class="profile-username">{{ profile.display_entity_type || profile.entity_type || `模块_${idx + 1}` }}</span>
                </div>
                <div class="profile-meta">
                  <span class="profile-profession">{{ profile.profession || 'ASC分析模块' }}</span>
                </div>
                <p class="profile-bio">{{ profile.bio || '暂无简介' }}</p>
                <div v-if="profile.interested_topics?.length" class="profile-topics">
                  <span 
                    v-for="topic in profile.interested_topics.slice(0, 3)" 
                    :key="topic" 
                    class="topic-tag"
                  >{{ topic }}</span>
                  <span v-if="profile.interested_topics.length > 3" class="topic-more">
                    +{{ profile.interested_topics.length - 3 }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 03: 生成洞察与查询配置 -->
      <div class="step-card" :class="{ 'active': phase === 2, 'completed': phase > 2 }">
        <div class="card-header">
          <div class="step-info">
            <span class="step-num">03</span>
            <span class="step-title">生成洞察与查询配置</span>
          </div>
          <div class="step-status">
            <span v-if="phase > 2" class="badge success">已完成</span>
            <span v-else-if="phase === 2" class="badge processing">生成中</span>
            <span v-else class="badge pending">等待</span>
          </div>
        </div>

        <div class="card-content">
          <p class="api-note">POST /api/simulation/prepare</p>
          <p class="description">
            根据查询 Prompt、图谱节点和关系边，生成检索范围、证据规则、洞察任务和建议输出配置
          </p>
          
          <!-- Config Preview -->
          <div v-if="simulationConfig" class="config-detail-panel">
            <!-- 分析与检索配置 -->
            <div class="config-block">
              <div class="config-grid">
                <div class="config-item">
                  <span class="config-item-label">分析阶段</span>
                  <span class="config-item-value">{{ simulationConfig.time_config?.analysis_rounds || '-' }} 阶段</span>
                </div>
                <div class="config-item">
                  <span class="config-item-label">节点TopK</span>
                  <span class="config-item-value">{{ simulationConfig.retrieval_config?.node_top_k || '-' }}</span>
                </div>
                <div class="config-item">
                  <span class="config-item-label">关系TopK</span>
                  <span class="config-item-value">{{ simulationConfig.retrieval_config?.edge_top_k || '-' }}</span>
                </div>
                <div class="config-item">
                  <span class="config-item-label">分析模块</span>
                  <span class="config-item-value">{{ analysisModuleConfigs.length }} 个</span>
                </div>
              </div>
              <div v-if="simulationConfig.analysis_config?.workflow_steps?.length" class="time-periods">
                <div
                  v-for="(step, idx) in simulationConfig.analysis_config.workflow_steps"
                  :key="idx"
                  class="period-item"
                >
                  <span class="period-label">流程 {{ idx + 1 }}</span>
                  <span class="period-hours">{{ step }}</span>
                </div>
              </div>
            </div>

            <!-- 分析模块配置 -->
            <div class="config-block">
              <div class="config-block-header">
                <span class="config-block-title">分析模块配置</span>
                <span class="config-block-badge">{{ analysisModuleConfigs.length }} 个</span>
              </div>
              <div class="agents-cards">
                <div 
                  v-for="module in analysisModuleConfigs.slice(0, 12)" 
                  :key="module.module_id || module.agent_id" 
                  class="agent-card"
                >
                  <div class="agent-card-header">
                    <div class="agent-identity">
                      <span class="agent-id">模块 {{ module.module_id || (module.agent_id + 1) }}</span>
                      <span class="agent-name">{{ module.entity_name }}</span>
                    </div>
                    <div class="agent-tags">
                      <span class="agent-type">{{ module.entity_type_zh || module.entity_type }}</span>
                      <span class="agent-stance stance-evidence_based">证据驱动</span>
                    </div>
                  </div>

                  <div class="agent-timeline">
                    <span class="timeline-label">分析焦点</span>
                    <div class="profile-topics">
                      <span
                        v-for="focus in (module.analysis_focus || []).slice(0, 5)"
                        :key="focus"
                        class="topic-tag"
                      >{{ focus }}</span>
                    </div>
                  </div>

                  <div v-if="module.module_mission" class="agent-timeline">
                    <span class="timeline-label">模块使命</span>
                    <p class="param-value">{{ module.module_mission }}</p>
                  </div>

                  <div class="agent-params">
                    <div class="param-group">
                      <div class="param-item">
                        <span class="param-label">优先级</span>
                        <span class="param-value highlight">{{ module.priority_tier || '-' }}</span>
                      </div>
                      <div class="param-item">
                        <span class="param-label">重要性</span>
                        <span class="param-value">{{ module.importance_score ? (module.importance_score * 100).toFixed(0) + '%' : '-' }}</span>
                      </div>
                      <div class="param-item">
                        <span class="param-label">检索权重</span>
                        <span class="param-value with-bar">
                          <span class="mini-bar" :style="{ width: ((module.retrieval_weight || module.activity_level || 0) * 100) + '%' }"></span>
                          {{ (((module.retrieval_weight || module.activity_level || 0) * 100)).toFixed(0) }}%
                        </span>
                      </div>
                      <div class="param-item">
                        <span class="param-label">证据深度</span>
                        <span class="param-value highlight">{{ module.evidence_depth || module.influence_weight || '-' }}</span>
                      </div>
                      <div class="param-item">
                        <span class="param-label">证据风险</span>
                        <span class="param-value">{{ module.evidence_risk || '-' }}</span>
                      </div>
                      <div class="param-item">
                        <span class="param-label">输出角色</span>
                        <span class="param-value">{{ (module.output_roles || []).join(' / ') || '抽取 / 洞察 / 建议' }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 检索与证据配置 -->
            <div class="config-block">
              <div
                class="config-block-header collapsible-header"
                role="button"
                tabindex="0"
                @click="showRetrievalEvidenceConfig = !showRetrievalEvidenceConfig"
                @keydown.enter.prevent="showRetrievalEvidenceConfig = !showRetrievalEvidenceConfig"
                @keydown.space.prevent="showRetrievalEvidenceConfig = !showRetrievalEvidenceConfig"
              >
                <div class="config-title-group">
                  <span class="config-block-title">检索与证据配置</span>
                  <span class="config-block-subtitle">
                    GraphRAG / Node {{ simulationConfig.retrieval_config?.node_top_k || '-' }} / Edge {{ simulationConfig.retrieval_config?.edge_top_k || '-' }}
                  </span>
                </div>
                <span class="collapse-indicator" :class="{ open: showRetrievalEvidenceConfig }">
                  {{ showRetrievalEvidenceConfig ? '收起' : '展开' }}
                </span>
              </div>
              <div v-show="showRetrievalEvidenceConfig" class="platforms-grid collapsible-content">
                <div class="platform-card">
                  <div class="platform-card-header">
                    <span class="platform-name">GraphRAG 检索</span>
                  </div>
                  <div class="platform-params">
                    <div class="param-row">
                      <span class="param-label">图谱范围</span>
                      <span class="param-value">{{ simulationConfig.retrieval_config?.graph_scope || '-' }}</span>
                    </div>
                    <div class="param-row">
                      <span class="param-label">召回预算</span>
                      <span class="param-value">
                        Node {{ simulationConfig.retrieval_config?.node_top_k || '-' }} /
                        Edge {{ simulationConfig.retrieval_config?.edge_top_k || '-' }} /
                        Path {{ simulationConfig.retrieval_config?.path_top_k || '-' }}
                      </span>
                    </div>
                    <div class="param-row">
                      <span class="param-label">重排策略</span>
                      <span class="param-value">{{ simulationConfig.retrieval_config?.rerank_strategy || '-' }}</span>
                    </div>
                    <div v-if="simulationConfig.retrieval_config?.rerank_features?.length" class="param-row">
                      <span class="param-label">重排特征</span>
                      <span class="param-value">{{ simulationConfig.retrieval_config.rerank_features.slice(0, 8).join(' / ') }}</span>
                    </div>
                    <div class="param-row">
                      <span class="param-label">证据规则</span>
                      <span class="param-value">{{ simulationConfig.retrieval_config?.evidence_policy || '-' }}</span>
                    </div>
                    <div v-if="simulationConfig.retrieval_config?.quality_gate_policy?.length" class="param-row">
                      <span class="param-label">质量门控</span>
                      <span class="param-value">{{ simulationConfig.retrieval_config.quality_gate_policy.slice(0, 3).join('；') }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="simulationConfig.analysis_config?.quality_checks?.length" class="platform-card">
                  <div class="platform-card-header">
                    <span class="platform-name">质量检查</span>
                  </div>
                  <div class="platform-params">
                    <div
                      v-for="(check, idx) in simulationConfig.analysis_config.quality_checks"
                      :key="idx"
                      class="param-row"
                    >
                      <span class="param-label">规则 {{ idx + 1 }}</span>
                      <span class="param-value">{{ check }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 配置生成说明 -->
            <div v-if="simulationConfig.graph_growth_config" class="config-block">
              <div
                class="config-block-header collapsible-header"
                role="button"
                tabindex="0"
                @click="showGraphGrowthConfig = !showGraphGrowthConfig"
                @keydown.enter.prevent="showGraphGrowthConfig = !showGraphGrowthConfig"
                @keydown.space.prevent="showGraphGrowthConfig = !showGraphGrowthConfig"
              >
                <div class="config-title-group">
                  <span class="config-block-title">图谱成长与涌现触发配置</span>
                  <span class="config-block-subtitle">
                    {{ simulationConfig.graph_growth_config.growth_mode || 'balanced' }} / 探索 {{ ((simulationConfig.graph_growth_config.exploration_intensity || 0) * 100).toFixed(0) }}%
                  </span>
                </div>
                <div class="config-header-actions">
                  <span class="config-block-badge">{{ simulationConfig.graph_growth_config.growth_mode || 'balanced' }}</span>
                  <span class="collapse-indicator" :class="{ open: showGraphGrowthConfig }">
                    {{ showGraphGrowthConfig ? '收起' : '展开' }}
                  </span>
                </div>
              </div>
              <div v-show="showGraphGrowthConfig" class="platforms-grid collapsible-content">
                <div class="platform-card">
                  <div class="platform-card-header">
                    <span class="platform-name">Growth Control</span>
                  </div>
                  <div class="platform-params">
                    <div class="param-row">
                      <span class="param-label">探索强度</span>
                      <span class="param-value">{{ ((simulationConfig.graph_growth_config.exploration_intensity || 0) * 100).toFixed(0) }}%</span>
                    </div>
                    <div class="param-row">
                      <span class="param-label">新颖阈值</span>
                      <span class="param-value">{{ ((simulationConfig.graph_growth_config.novelty_threshold || 0) * 100).toFixed(0) }}%</span>
                    </div>
                    <div class="param-row">
                      <span class="param-label">入图阈值</span>
                      <span class="param-value">
                        Entity {{ ((simulationConfig.graph_growth_config.entity_accept_threshold || 0) * 100).toFixed(0) }}% /
                        Edge {{ ((simulationConfig.graph_growth_config.edge_accept_threshold || 0) * 100).toFixed(0) }}%
                      </span>
                    </div>
                    <div class="param-row">
                      <span class="param-label">每轮预算</span>
                      <span class="param-value">
                        新节点 {{ simulationConfig.graph_growth_config.max_new_entities_per_review_round || '-' }} /
                        新边 {{ simulationConfig.graph_growth_config.max_new_edges_per_review_round || '-' }}
                      </span>
                    </div>
                  </div>
                </div>
                <div v-if="simulationConfig.graph_growth_config.algorithm_stack?.length" class="platform-card">
                  <div class="platform-card-header">
                    <span class="platform-name">Emergence Algorithms</span>
                  </div>
                  <div class="platform-params">
                    <div
                      v-for="algo in simulationConfig.graph_growth_config.algorithm_stack.slice(0, 10)"
                      :key="algo.name"
                      class="param-row"
                    >
                      <span class="param-label">{{ algo.name }}</span>
                      <span class="param-value">{{ algo.purpose || algo.trigger }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="simulationConfig.generation_reasoning" class="config-block">
              <div class="config-block-header">
                <span class="config-block-title">配置生成说明</span>
              </div>
              <div class="reasoning-content">
                <div 
                  v-for="(reason, idx) in simulationConfig.generation_reasoning.split('|').slice(0, 2)" 
                  :key="idx" 
                  class="reasoning-item"
                >
                  <p class="reasoning-text">{{ reason.trim() }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 04: 洞察任务编排 -->
      <div class="step-card" :class="{ 'active': phase === 3, 'completed': phase > 3 }">
        <div class="card-header">
          <div class="step-info">
            <span class="step-num">04</span>
            <span class="step-title">洞察任务编排</span>
          </div>
          <div class="step-status">
            <span v-if="phase > 3" class="badge success">已完成</span>
            <span v-else-if="phase === 3" class="badge processing">生成中</span>
            <span v-else class="badge pending">等待</span>
          </div>
        </div>

        <div class="card-content">
          <p class="api-note">POST /api/simulation/prepare</p>
          <p class="description">
            根据图谱知识点和查询 Prompt 编排初始分析任务、重点知识点和证据核查方向
          </p>

          <div v-if="simulationConfig?.event_config" class="orchestration-content">
            <!-- 叙事方向 -->
            <div class="narrative-box">
              <span class="box-label narrative-label">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="special-icon">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="url(#paint0_linear)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M16.24 7.76L14.12 14.12L7.76 16.24L9.88 9.88L16.24 7.76Z" fill="url(#paint0_linear)" stroke="url(#paint0_linear)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <defs>
                    <linearGradient id="paint0_linear" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                      <stop stop-color="#FF5722"/>
                      <stop offset="1" stop-color="#FF9800"/>
                    </linearGradient>
                  </defs>
                </svg>
                分析主线
              </span>
              <p class="narrative-text">{{ simulationConfig.event_config.narrative_direction }}</p>
            </div>

            <!-- 热点话题 -->
            <div class="topics-section">
              <span class="box-label">重点知识点</span>
              <div class="hot-topics-grid">
                <span v-for="topic in simulationConfig.event_config.hot_topics" :key="topic" class="hot-topic-tag">
                  # {{ topic }}
                </span>
              </div>
            </div>

            <!-- 初始分析任务 -->
            <div class="initial-posts-section">
              <span class="box-label">初始分析任务 ({{ initialAnalysisTasks.length }})</span>
              <div class="posts-timeline">
                <div v-for="(task, idx) in initialAnalysisTasks" :key="idx" class="timeline-item">
                  <div class="timeline-marker"></div>
                  <div class="timeline-content">
                    <div class="post-header">
                      <span class="post-role">{{ task.task_type || 'analysis' }}</span>
                      <span class="post-agent-info">{{ task.owner || 'ASC文献分析任务' }}<span v-if="task.stage"> · Stage {{ task.stage }}</span></span>
                    </div>
                    <p class="post-text">{{ task.content }}</p>
                    <p v-if="task.output" class="post-text">输出：{{ task.output }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 05: 准备完成 -->
      <div class="step-card" :class="{ 'active': phase === 4 }">
        <div class="card-header">
          <div class="step-info">
            <span class="step-num">05</span>
            <span class="step-title">准备完成</span>
          </div>
          <div class="step-status">
            <span v-if="phase >= 4" class="badge success">已完成</span>
            <span v-else class="badge pending">等待</span>
          </div>
        </div>

        <div class="card-content">
          <p class="api-note">GET /api/simulation/:id/config/realtime</p>
          <p class="description">ASC文献分析工作台已准备完成，可以进入文献洞察、建议生成与图谱证据查询阶段</p>
          
          <!-- 分析准备摘要 -->
          <div v-if="simulationConfig" class="rounds-config-section">
            <div class="rounds-header">
              <div class="header-left">
                <span class="section-title">分析准备摘要</span>
                <span class="section-desc">已生成 <span class="desc-highlight">{{ profiles.length }}</span> 个分析模块，检索范围为 <span class="desc-highlight">{{ simulationConfig.retrieval_config?.graph_scope || 'ASC知识点子图' }}</span></span>
              </div>
              <label class="switch-control">
                <input type="checkbox" v-model="useCustomRounds">
                <span class="switch-track"></span>
                <span class="switch-label">自定义深入阶段</span>
              </label>
            </div>
            
            <div class="rounds-content auto">
              <div class="auto-info-card">
                <div class="auto-value">
                  <span class="val-num">{{ selectedAnalysisRounds }}</span>
                  <span class="val-unit">阶段</span>
                </div>
                <div class="auto-content">
                  <div class="auto-meta-row">
                    <span class="duration-badge">
                      节点TopK {{ simulationConfig.retrieval_config?.node_top_k || '-' }} / 关系TopK {{ simulationConfig.retrieval_config?.edge_top_k || '-' }}
                    </span>
                  </div>
                  <div class="auto-desc">
                    <p class="highlight-tip">{{ simulationConfig.time_config?.round_meaning || '每个阶段代表一次知识抽取、证据核查、关系解释或建议生成。' }}</p>
                  </div>
                </div>
              </div>
              <div v-if="useCustomRounds" class="rounds-content">
                <div class="slider-display">
                  <div class="slider-main-value">
                    <span class="val-num">{{ customMaxRounds }}</span>
                    <span class="val-unit">阶段</span>
                  </div>
                  <div class="slider-meta-info">推荐 {{ recommendedAnalysisRounds }} / 上限 {{ maxAnalysisRounds }}</div>
                </div>
                <div class="range-wrapper">
                  <input
                    v-model.number="customMaxRounds"
                    type="range"
                    class="minimal-slider"
                    :min="minAnalysisRounds"
                    :max="maxAnalysisRounds"
                    :style="{ '--percent': customRoundPercent + '%' }"
                  />
                  <div class="range-marks">
                    <span>{{ minAnalysisRounds }}</span>
                    <span
                      class="mark-recommend"
                      :class="{ active: customMaxRounds === recommendedAnalysisRounds }"
                      @click="customMaxRounds = recommendedAnalysisRounds"
                    >推荐</span>
                    <span>{{ maxAnalysisRounds }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounds-header growth-header">
              <div class="header-left">
                <span class="section-title">图谱成长控制</span>
                <span class="section-desc">控制新节点、新关系边和涌现探索强度</span>
              </div>
              <label class="switch-control">
                <input type="checkbox" v-model="useCustomGrowthConfig">
                <span class="switch-track"></span>
                <span class="switch-label">自定义成长参数</span>
              </label>
            </div>

            <div class="rounds-content auto">
              <div class="auto-info-card">
                <div class="auto-value">
                  <span class="val-num">{{ displayGrowthIntensity }}</span>
                  <span class="val-unit">%</span>
                </div>
                <div class="auto-content">
                  <div class="auto-meta-row">
                    <span class="duration-badge">
                      新节点 {{ displayEntityBudget }} / 新边 {{ displayEdgeBudget }} / Novelty {{ displayNoveltyThreshold }}%
                    </span>
                  </div>
                  <div class="auto-desc">
                    <p class="highlight-tip">按证据缺口、冲突密度、桥接潜力、机制缺段和迁移潜力触发 KG mutation 与 system memory 沉淀。</p>
                  </div>
                </div>
              </div>

              <div v-if="useCustomGrowthConfig" class="rounds-content">
                <div class="growth-mode-row">
                  <span class="param-label">成长模式</span>
                  <select v-model="customGrowthMode" class="growth-select">
                    <option value="balanced_emergence">Balanced Emergence</option>
                    <option value="conservative_audit">Conservative Audit</option>
                    <option value="exploratory_discovery">Exploratory Discovery</option>
                  </select>
                </div>

                <div class="growth-sliders-grid">
                  <div class="growth-slider-card">
                    <div class="slider-display compact">
                      <div class="slider-main-value">
                        <span class="val-num">{{ customExplorationIntensity }}</span>
                        <span class="val-unit">%</span>
                      </div>
                      <div class="slider-meta-info">探索强度</div>
                    </div>
                    <input
                      v-model.number="customExplorationIntensity"
                      type="range"
                      class="minimal-slider"
                      min="20"
                      max="95"
                      :style="{ '--percent': customExplorationIntensity + '%' }"
                    />
                  </div>

                  <div class="growth-slider-card">
                    <div class="slider-display compact">
                      <div class="slider-main-value">
                        <span class="val-num">{{ customNoveltyThreshold }}</span>
                        <span class="val-unit">%</span>
                      </div>
                      <div class="slider-meta-info">新颖阈值</div>
                    </div>
                    <input
                      v-model.number="customNoveltyThreshold"
                      type="range"
                      class="minimal-slider"
                      min="35"
                      max="90"
                      :style="{ '--percent': customNoveltyThreshold + '%' }"
                    />
                  </div>

                  <div class="growth-slider-card">
                    <div class="slider-display compact">
                      <div class="slider-main-value">
                        <span class="val-num">{{ customEntityBudget }}</span>
                        <span class="val-unit">个</span>
                      </div>
                      <div class="slider-meta-info">每轮新节点</div>
                    </div>
                    <input
                      v-model.number="customEntityBudget"
                      type="range"
                      class="minimal-slider"
                      min="1"
                      max="10"
                      :style="{ '--percent': (customEntityBudget * 10) + '%' }"
                    />
                  </div>

                  <div class="growth-slider-card">
                    <div class="slider-display compact">
                      <div class="slider-main-value">
                        <span class="val-num">{{ customEdgeBudget }}</span>
                        <span class="val-unit">条</span>
                      </div>
                      <div class="slider-meta-info">每轮新边</div>
                    </div>
                    <input
                      v-model.number="customEdgeBudget"
                      type="range"
                      class="minimal-slider"
                      min="2"
                      max="18"
                      :style="{ '--percent': Math.round((customEdgeBudget - 2) / 16 * 100) + '%' }"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="action-group dual">
            <button 
              class="action-btn secondary"
              @click="$emit('go-back')"
            >
              ← 返回图谱构建
            </button>
            <button 
              class="action-btn primary"
              :disabled="phase < 4"
              @click="handleStartSimulation"
            >
              进入文献洞察查询 ➝
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Profile Detail Modal -->
    <Transition name="modal">
      <div v-if="selectedProfile" class="profile-modal-overlay" @click.self="selectedProfile = null">
        <div class="profile-modal">
          <div class="modal-header">
          <div class="modal-header-info">
            <div class="modal-name-row">
              <span class="modal-realname">{{ selectedProfile.name }}</span>
              <span class="modal-username">{{ selectedProfile.display_entity_type || selectedProfile.entity_type }}</span>
            </div>
            <span class="modal-profession">{{ selectedProfile.profession }}</span>
          </div>
          <button class="close-btn" @click="selectedProfile = null">×</button>
        </div>
        
        <div class="modal-body">
          <!-- 基本信息 -->
          <div class="modal-info-grid">
            <div class="info-item">
              <span class="info-label">模块ID</span>
              <span class="info-value">{{ selectedProfile.username || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">知识类型</span>
              <span class="info-value">{{ selectedProfile.display_entity_type || selectedProfile.entity_type || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">证据范围</span>
              <span class="info-value">{{ selectedProfile.evidence_scope || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">模块类型</span>
              <span class="info-value mbti">ASC文献分析</span>
            </div>
          </div>

          <!-- 简介 -->
          <div class="modal-section">
            <span class="section-label">模块简介</span>
            <p class="section-bio">{{ selectedProfile.bio || '暂无简介' }}</p>
          </div>

          <!-- 分析焦点 -->
          <div class="modal-section" v-if="selectedProfile.analysis_focus?.length">
            <span class="section-label">分析焦点</span>
            <div class="topics-grid">
              <span
                v-for="focus in selectedProfile.analysis_focus"
                :key="focus"
                class="topic-item"
              >{{ focus }}</span>
            </div>
          </div>

          <!-- 研究主题 -->
          <div class="modal-section" v-if="selectedProfile.interested_topics?.length">
            <span class="section-label">关联知识点与证据主题</span>
            <div class="topics-grid">
              <span 
                v-for="topic in selectedProfile.interested_topics" 
                :key="topic" 
                class="topic-item"
              >{{ topic }}</span>
            </div>
          </div>

          <!-- 模块说明 -->
          <div class="modal-section" v-if="selectedProfile.persona">
            <span class="section-label">模块说明</span>
            
            <!-- 分析维度概览 -->
            <div class="persona-dimensions">
              <div class="dimension-card">
                <span class="dim-title">知识抽取</span>
                <span class="dim-desc">定位ASC文献核心知识点</span>
              </div>
              <div class="dimension-card">
                <span class="dim-title">证据核查</span>
                <span class="dim-desc">回到图谱边与原文证据</span>
              </div>
              <div class="dimension-card">
                <span class="dim-title">关系解释</span>
                <span class="dim-desc">分析配比-工艺-结构-性能链</span>
              </div>
              <div class="dimension-card">
                <span class="dim-title">工程建议</span>
                <span class="dim-desc">输出可追溯建议与边界</span>
              </div>
            </div>

            <div class="persona-content">
              <p class="section-persona">{{ selectedProfile.persona }}</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </Transition>

    <!-- Bottom Info / Logs -->
    <div class="system-logs">
      <div class="log-header">
        <span class="log-title">ASC ANALYSIS DASHBOARD</span>
        <span class="log-id">{{ simulationId || 'NO_ANALYSIS' }}</span>
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
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { 
  prepareSimulation, 
  getPrepareStatus, 
  getSimulationProfilesRealtime,
  getSimulationConfig,
  getSimulationConfigRealtime 
} from '../api/simulation'
import { simulationPreparationState } from '../features/research/simulationPreparationModel.js'
import { createSimulationPreparationController } from '../features/research/simulationPreparationController.js'

const props = defineProps({
  simulationId: String,  // 从父组件传入
  projectData: Object,
  graphData: Object,
  systemLogs: Array
})

const emit = defineEmits(['go-back', 'next-step', 'add-log', 'update-status', 'go-qa'])

// State
const phase = ref(0) // 0: 初始化, 1: 生成分析模块, 2: 生成配置, 3: 任务编排, 4: 完成
const taskId = ref(null)
const prepareProgress = ref(0)
const currentStage = ref('')
const progressMessage = ref('')
const preparationState = computed(() => simulationPreparationState(props.simulationId, props.projectData))
const profiles = ref([])
const entityTypes = ref([])
const expectedTotal = ref(null)
const simulationConfig = ref(null)
const selectedProfile = ref(null)
const showProfilesDetail = ref(true)
const showRetrievalEvidenceConfig = ref(false)
const showGraphGrowthConfig = ref(false)

// 日志去重：记录上一次输出的关键信息
let lastLoggedMessage = ''
let lastLoggedProfileCount = 0
let lastLoggedConfigStage = ''

const ASC_ENTITY_TYPE_LABELS = {
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

const localizeEntityType = (type) => ASC_ENTITY_TYPE_LABELS[type] || type

const useCustomRounds = ref(false)
const customMaxRounds = ref(24)
const useCustomGrowthConfig = ref(false)
const customGrowthMode = ref('balanced_emergence')
const customExplorationIntensity = ref(72)
const customNoveltyThreshold = ref(62)
const customEntityBudget = ref(4)
const customEdgeBudget = ref(8)

// Watch stage to update phase
watch(currentStage, (newStage) => {
  if (newStage === '生成分析模块' || newStage === 'generating_profiles') {
    phase.value = 1
  } else if (newStage === '生成洞察查询配置' || newStage === 'generating_config') {
    phase.value = 2
    // 进入配置生成阶段，开始轮询配置
    if (!configTimer) {
      addLog('开始生成洞察与查询配置...')
      startConfigPolling()
    }
  } else if (newStage === '整理分析产物' || newStage === 'copying_scripts') {
    phase.value = 2 // 仍属于配置阶段
  }
})

const recommendedAnalysisRounds = computed(() => {
  return simulationConfig.value?.time_config?.recommended_analysis_rounds
    || simulationConfig.value?.time_config?.analysis_rounds
    || 24
})

const minAnalysisRounds = computed(() => {
  return simulationConfig.value?.time_config?.min_analysis_rounds || 18
})

const maxAnalysisRounds = computed(() => {
  return simulationConfig.value?.time_config?.max_analysis_rounds || 48
})

const selectedAnalysisRounds = computed(() => {
  return useCustomRounds.value ? customMaxRounds.value : recommendedAnalysisRounds.value
})

const graphGrowthConfig = computed(() => {
  return simulationConfig.value?.graph_growth_config || {}
})

const displayGrowthIntensity = computed(() => {
  return useCustomGrowthConfig.value
    ? customExplorationIntensity.value
    : Math.round((graphGrowthConfig.value.exploration_intensity || 0) * 100)
})

const displayNoveltyThreshold = computed(() => {
  return useCustomGrowthConfig.value
    ? customNoveltyThreshold.value
    : Math.round((graphGrowthConfig.value.novelty_threshold || 0) * 100)
})

const displayEntityBudget = computed(() => {
  return useCustomGrowthConfig.value
    ? customEntityBudget.value
    : graphGrowthConfig.value.max_new_entities_per_review_round || '-'
})

const displayEdgeBudget = computed(() => {
  return useCustomGrowthConfig.value
    ? customEdgeBudget.value
    : graphGrowthConfig.value.max_new_edges_per_review_round || '-'
})

const selectedGraphGrowthConfig = computed(() => {
  if (!useCustomGrowthConfig.value) return null
  return {
    ...graphGrowthConfig.value,
    growth_mode: customGrowthMode.value,
    exploration_intensity: Number((customExplorationIntensity.value / 100).toFixed(2)),
    novelty_threshold: Number((customNoveltyThreshold.value / 100).toFixed(2)),
    max_new_entities_per_review_round: customEntityBudget.value,
    max_new_edges_per_review_round: customEdgeBudget.value
  }
})

const customRoundPercent = computed(() => {
  const min = minAnalysisRounds.value
  const max = maxAnalysisRounds.value
  if (max <= min) return 0
  return Math.round(((customMaxRounds.value - min) / (max - min)) * 100)
})

watch(simulationConfig, (config) => {
  const timeConfig = config?.time_config
  if (timeConfig) {
    const recommended = timeConfig.recommended_analysis_rounds || timeConfig.analysis_rounds || 24
    customMaxRounds.value = Math.min(timeConfig.max_analysis_rounds || 48, Math.max(timeConfig.min_analysis_rounds || 18, recommended))
  }
  const growthConfig = config?.graph_growth_config
  if (growthConfig) {
    customGrowthMode.value = growthConfig.growth_mode || 'balanced_emergence'
    customExplorationIntensity.value = Math.round((growthConfig.exploration_intensity || 0.72) * 100)
    customNoveltyThreshold.value = Math.round((growthConfig.novelty_threshold || 0.62) * 100)
    customEntityBudget.value = growthConfig.max_new_entities_per_review_round || 4
    customEdgeBudget.value = growthConfig.max_new_edges_per_review_round || 8
  }
})

// Polling timer
let pollTimer = null
let profilesTimer = null
let configTimer = null
let activePreparationContext = null

const isCurrentPreparation = (context = activePreparationContext) => Boolean(context?.isCurrent())

// Computed
const displayProfiles = computed(() => {
  if (showProfilesDetail.value) {
    return profiles.value
  }
  return profiles.value.slice(0, 6)
})

const analysisModuleConfigs = computed(() => {
  return simulationConfig.value?.module_configs || simulationConfig.value?.agent_configs || []
})

const initialAnalysisTasks = computed(() => {
  const eventConfig = simulationConfig.value?.event_config || {}
  return eventConfig.initial_tasks || eventConfig.initial_posts || []
})

// 计算所有分析模块的关联主题总数
const totalTopicsCount = computed(() => {
  return profiles.value.reduce((sum, p) => {
    return sum + (p.interested_topics?.length || 0)
  }, 0)
})

// Methods
const addLog = (msg) => {
  emit('add-log', msg)
}

// 进入下一步文献洞察查询
const handleStartSimulation = () => {
  addLog('进入ASC文献洞察查询阶段')
  const payload = {
    analysisMode: true,
    modulesCount: profiles.value.length,
    queryModes: simulationConfig.value?.analysis_config?.query_modes || []
  }
  if (useCustomRounds.value) {
    payload.maxRounds = selectedAnalysisRounds.value
    addLog(`使用自定义深入阶段数: ${selectedAnalysisRounds.value}`)
  }
  if (selectedGraphGrowthConfig.value) {
    payload.graphGrowthConfig = selectedGraphGrowthConfig.value
    addLog(`使用自定义图谱成长参数: 探索强度 ${customExplorationIntensity.value}%, 新节点 ${customEntityBudget.value}, 新边 ${customEdgeBudget.value}`)
  }
  emit('next-step', payload)
}

const truncateBio = (bio) => {
  if (bio.length > 80) {
    return bio.substring(0, 80) + '...'
  }
  return bio
}

const selectProfile = (profile) => {
  selectedProfile.value = profile
}

// 自动开始准备ASC文献分析工作台
const startPrepareSimulation = async (context) => {
  if (!isCurrentPreparation(context)) return
  const simulationId = context.simulationId
  if (!simulationId) {
    addLog('错误：缺少 simulationId')
    emit('update-status', 'error')
    return
  }
  
  // 标记第一步完成，开始第二步
  phase.value = 1
  addLog(`ASC分析工作台实例已创建: ${simulationId}`)
  addLog('正在准备ASC文献分析工作台...')
  emit('update-status', 'processing')
  
  try {
    const res = await prepareSimulation({
      simulation_id: simulationId,
      use_llm_for_profiles: false,
      parallel_profile_count: 5
    })
    
    if (!isCurrentPreparation(context)) return
    if (res.success && res.data) {
      if (res.data.already_prepared) {
        addLog('检测到已有完成的ASC分析准备工作，直接使用')
        await loadPreparedData(context)
        return
      }
      
      if (!isCurrentPreparation(context)) return
      taskId.value = res.data.task_id
      addLog(`ASC分析准备任务已启动`)
      addLog(`  └─ Task ID: ${res.data.task_id}`)
      
      // 立即设置预期知识点总数（从prepare接口返回值获取）
      if (res.data.expected_entities_count) {
        expectedTotal.value = res.data.expected_entities_count
        addLog(`从Zep图谱读取到 ${res.data.expected_entities_count} 个ASC知识点`)
        if (res.data.entity_types && res.data.entity_types.length > 0) {
          addLog(`  └─ 知识点类型: ${res.data.entity_types.map(localizeEntityType).join(', ')}`)
        }
      }
      
      addLog('开始轮询ASC分析准备进度...')
      // 开始轮询进度
      if (!isCurrentPreparation(context)) return
      startPolling(context)
      // 开始实时获取分析模块
      startProfilesPolling(context)
    } else {
      addLog(`准备失败: ${res.error || '未知错误'}`)
      emit('update-status', 'error')
    }
  } catch (err) {
    if (!isCurrentPreparation(context)) return
    addLog(`准备异常: ${err.message}`)
    emit('update-status', 'error')
  }
}

const startPolling = (context = activePreparationContext) => {
  if (!isCurrentPreparation(context) || pollTimer) return
  pollTimer = setInterval(() => pollPrepareStatus(context), 2000)
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const startProfilesPolling = (context = activePreparationContext) => {
  if (!isCurrentPreparation(context) || profilesTimer) return
  profilesTimer = setInterval(() => fetchProfilesRealtime(context), 3000)
}

const stopProfilesPolling = () => {
  if (profilesTimer) {
    clearInterval(profilesTimer)
    profilesTimer = null
  }
}

const pollPrepareStatus = async (context = activePreparationContext) => {
  if (!isCurrentPreparation(context) || (!taskId.value && !context.simulationId)) return
  
  try {
    const res = await getPrepareStatus({
      task_id: taskId.value,
      simulation_id: context.simulationId
    })
    
    if (!isCurrentPreparation(context)) return
    if (res.success && res.data) {
      const data = res.data
      
      // 更新进度
      prepareProgress.value = data.progress || 0
      progressMessage.value = data.message || ''
      
      // 解析阶段信息并输出详细日志
      if (data.progress_detail) {
        currentStage.value = data.progress_detail.current_stage_name || ''
        
        // 输出详细进度日志（避免重复）
        const detail = data.progress_detail
        const logKey = `${detail.current_stage}-${detail.current_item}-${detail.total_items}`
        if (logKey !== lastLoggedMessage && detail.item_description) {
          lastLoggedMessage = logKey
          const stageInfo = `[${detail.stage_index}/${detail.total_stages}]`
          if (detail.total_items > 0) {
            addLog(`${stageInfo} ${detail.current_stage_name}: ${detail.current_item}/${detail.total_items} - ${detail.item_description}`)
          } else {
            addLog(`${stageInfo} ${detail.current_stage_name}: ${detail.item_description}`)
          }
        }
      } else if (data.message) {
        // 从消息中提取阶段
        const match = data.message.match(/\[(\d+)\/(\d+)\]\s*([^:]+)/)
        if (match) {
          currentStage.value = match[3].trim()
        }
        // 输出消息日志（避免重复）
        if (data.message !== lastLoggedMessage) {
          lastLoggedMessage = data.message
          addLog(data.message)
        }
      }
      
      // 检查是否完成
      if (data.status === 'completed' || data.status === 'ready' || data.already_prepared) {
        addLog('✓ ASC分析准备已完成')
        stopPolling()
        stopProfilesPolling()
        await loadPreparedData(context)
      } else if (data.status === 'failed') {
        addLog(`✗ 准备失败: ${data.error || '未知错误'}`)
        stopPolling()
        stopProfilesPolling()
      }
    }
  } catch (err) {
    console.warn('轮询状态失败:', err)
  }
}

const fetchProfilesRealtime = async (context = activePreparationContext) => {
  if (!isCurrentPreparation(context) || !context.simulationId) return
  
  try {
    const res = await getSimulationProfilesRealtime(context.simulationId, 'reddit')
    
    if (!isCurrentPreparation(context)) return
    if (res.success && res.data) {
      const prevCount = profiles.value.length
      profiles.value = res.data.profiles || []
      // 只有当 API 返回有效值时才更新，避免覆盖已有的有效值
      if (res.data.total_expected) {
        expectedTotal.value = res.data.total_expected
      }
      
      // 提取实体类型
      const types = new Set()
      profiles.value.forEach(p => {
        const type = p.display_entity_type || p.entity_type
        if (type) types.add(localizeEntityType(type))
      })
      entityTypes.value = Array.from(types)
      
      // 输出分析模块生成进度日志（仅当数量变化时）
      const currentCount = profiles.value.length
      if (currentCount > 0 && currentCount !== lastLoggedProfileCount) {
        lastLoggedProfileCount = currentCount
        const total = expectedTotal.value || '?'
        const latestProfile = profiles.value[currentCount - 1]
        const profileName = latestProfile?.name || latestProfile?.username || `模块_${currentCount}`
        if (currentCount === 1) {
          addLog(`开始生成ASC分析模块...`)
        }
        addLog(`→ 分析模块 ${currentCount}/${total}: ${profileName} (${latestProfile?.profession || 'ASC分析模块'})`)
        
        // 如果全部生成完成
        if (expectedTotal.value && currentCount >= expectedTotal.value) {
          addLog(`✓ 全部 ${currentCount} 个分析模块生成完成`)
        }
      }
    }
  } catch (err) {
    console.warn('获取分析模块失败:', err)
  }
}

// 配置轮询
const startConfigPolling = (context = activePreparationContext) => {
  if (!isCurrentPreparation(context) || configTimer) return
  configTimer = setInterval(() => fetchConfigRealtime(context), 2000)
}

const stopConfigPolling = () => {
  if (configTimer) {
    clearInterval(configTimer)
    configTimer = null
  }
}

const fetchConfigRealtime = async (context = activePreparationContext) => {
  if (!isCurrentPreparation(context) || !context.simulationId) return
  
  try {
    const res = await getSimulationConfigRealtime(context.simulationId)
    
    if (!isCurrentPreparation(context)) return
    if (res.success && res.data) {
      const data = res.data
      
      // 输出配置生成阶段日志（避免重复）
      if (data.generation_stage && data.generation_stage !== lastLoggedConfigStage) {
        lastLoggedConfigStage = data.generation_stage
        if (data.generation_stage === 'generating_profiles') {
          addLog('正在生成ASC分析模块配置...')
        } else if (data.generation_stage === 'generating_config') {
          addLog('正在生成洞察与查询配置...')
        }
      }
      
      // 如果配置已生成
      if (data.config_generated && data.config) {
        simulationConfig.value = data.config
        addLog('✓ 洞察与查询配置生成完成')
        
        // 显示详细配置摘要
        if (data.summary) {
          addLog(`  ├─ 分析模块: ${data.summary.total_modules || data.summary.total_agents || 0}个`)
          addLog(`  ├─ 工作流步骤: ${data.summary.workflow_steps_count || 0}个`)
          addLog(`  ├─ 初始任务: ${data.summary.initial_tasks_count || data.summary.initial_posts_count || 0}条`)
          addLog(`  ├─ 重点知识点: ${data.summary.hot_topics_count || 0}个`)
          addLog(`  └─ 检索TopK: 节点 ${data.summary.node_top_k || '-'} / 关系 ${data.summary.edge_top_k || '-'}`)
        }
        
        // 显示分析主线
        if (data.config.event_config?.narrative_direction) {
          const narrative = data.config.event_config.narrative_direction
          addLog(`分析主线: ${narrative.length > 50 ? narrative.substring(0, 50) + '...' : narrative}`)
        }
        
        stopConfigPolling()
        phase.value = 4
        addLog('✓ ASC文献分析工作台准备完成')
        emit('update-status', 'completed')
      }
    }
  } catch (err) {
    console.warn('获取 Config 失败:', err)
  }
}

const loadPreparedData = async (context = activePreparationContext) => {
  if (!isCurrentPreparation(context)) return
  phase.value = 2
  addLog('正在加载已有ASC分析配置...')

  // 最后获取一次分析模块
  await fetchProfilesRealtime(context)
  if (!isCurrentPreparation(context)) return
  addLog(`已加载 ${profiles.value.length} 个ASC分析模块`)

  // 获取配置（使用实时接口）
  try {
    const res = await getSimulationConfigRealtime(context.simulationId)
    if (!isCurrentPreparation(context)) return
    if (res.success && res.data) {
      if (res.data.config_generated && res.data.config) {
        simulationConfig.value = res.data.config
        addLog('✓ ASC分析配置加载成功')
        
        // 显示详细配置摘要
        if (res.data.summary) {
          addLog(`  ├─ 分析模块: ${res.data.summary.total_modules || res.data.summary.total_agents || 0}个`)
          addLog(`  ├─ 工作流步骤: ${res.data.summary.workflow_steps_count || 0}个`)
          addLog(`  └─ 初始任务: ${res.data.summary.initial_tasks_count || res.data.summary.initial_posts_count || 0}条`)
        }
        
        addLog('✓ ASC文献分析工作台准备完成')
        phase.value = 4
        emit('update-status', 'completed')
      } else {
        // 配置尚未生成，开始轮询
        addLog('ASC分析配置生成中，开始轮询等待...')
        startConfigPolling()
      }
    }
  } catch (err) {
    if (!isCurrentPreparation(context)) return
    addLog(`加载配置失败: ${err.message}`)
    emit('update-status', 'error')
  }
}

const stopAllPreparationTimers = () => {
  stopPolling()
  stopProfilesPolling()
  stopConfigPolling()
}

const resetPreparationState = (context) => {
  activePreparationContext = context
  taskId.value = null
  prepareProgress.value = 0
  currentStage.value = ''
  progressMessage.value = ''
  profiles.value = []
  entityTypes.value = []
  expectedTotal.value = null
  simulationConfig.value = null
  selectedProfile.value = null
  phase.value = 0
  lastLoggedMessage = ''
  lastLoggedProfileCount = 0
  lastLoggedConfigStage = ''
}

const preparationController = createSimulationPreparationController({
  stop: stopAllPreparationTimers,
  reset: resetPreparationState,
  reportMissing: () => {
    progressMessage.value = '当前项目缺少研究问题，无法开始 ASC 分析准备。'
    emit('update-status', 'error')
  },
  start: async (context) => {
    activePreparationContext = context
    addLog('Step2 ASC文献分析准备初始化')
    await startPrepareSimulation(context)
  }
})

watch(
  () => [
    props.simulationId,
    props.projectData?.project_id,
    props.projectData?.graph_id,
    props.projectData?.query_prompt,
    props.projectData?.simulation_requirement
  ],
  () => preparationController.update(props.simulationId, props.projectData),
  { immediate: true }
)

// Scroll log to bottom
const logContent = ref(null)
watch(() => props.systemLogs?.length, () => {
  nextTick(() => {
    if (logContent.value) {
      logContent.value.scrollTop = logContent.value.scrollHeight
    }
  })
})

onUnmounted(() => {
  preparationController.stop()
})
</script>

<style scoped>
.env-setup-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #FAFAFA;
  font-family: 'Space Grotesk', 'Noto Sans SC', system-ui, sans-serif;
}

.missing-question-notice {
  margin: 16px 20px 0;
  padding: 16px;
  border: 1px solid #F59E0B;
  border-radius: 8px;
  background: #FFFBEB;
  color: #92400E;
}

.missing-question-notice p {
  margin: 0 0 8px;
}

.scroll-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Step Card */
.step-card {
  background: #FFF;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border: 1px solid #EAEAEA;
  transition: all 0.3s ease;
  position: relative;
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
.badge.pending { background: #F5F5F5; color: #999; }
.badge.accent { background: #E3F2FD; color: #1565C0; }

.card-content {
  /* No extra padding - uses step-card's padding */
}

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

/* Action Section */
.action-section {
  margin-top: 16px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn.primary {
  background: #000;
  color: #FFF;
}

.action-btn.primary:hover:not(:disabled) {
  opacity: 0.8;
}

.action-btn.secondary {
  background: #F5F5F5;
  color: #333;
}

.action-btn.secondary:hover:not(:disabled) {
  background: #E5E5E5;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-group {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.action-group.dual {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.action-group.dual .action-btn {
  width: 100%;
}

/* Info Card */
.info-card {
  background: #F5F5F5;
  border-radius: 6px;
  padding: 16px;
  margin-top: 16px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed #E0E0E0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 12px;
  color: #666;
}

.info-value {
  font-size: 13px;
  font-weight: 500;
}

.info-value.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

/* Stats Grid */
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

/* Profiles Preview */
.profiles-preview {
  margin-top: 20px;
  border-top: 1px solid #E5E5E5;
  padding-top: 16px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.preview-title {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.profiles-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}

.profiles-list::-webkit-scrollbar {
  width: 4px;
}

.profiles-list::-webkit-scrollbar-thumb {
  background: #DDD;
  border-radius: 2px;
}

.profiles-list::-webkit-scrollbar-thumb:hover {
  background: #CCC;
}

.profile-card {
  background: #FAFAFA;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.profile-card:hover {
  border-color: #999;
  background: #FFF;
}

.profile-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.profile-realname {
  font-size: 14px;
  font-weight: 700;
  color: #000;
}

.profile-username {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #999;
}

.profile-meta {
  margin-bottom: 8px;
}

.profile-profession {
  font-size: 11px;
  color: #666;
  background: #F0F0F0;
  padding: 2px 8px;
  border-radius: 3px;
}

.profile-bio {
  font-size: 12px;
  color: #444;
  line-height: 1.6;
  margin: 0 0 10px 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.profile-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.topic-tag {
  font-size: 10px;
  color: #1565C0;
  background: #E3F2FD;
  padding: 2px 8px;
  border-radius: 10px;
}

.topic-more {
  font-size: 10px;
  color: #999;
  padding: 2px 6px;
}

/* Config Preview */
/* Config Detail Panel */
.config-detail-panel {
  margin-top: 16px;
}

.config-block {
  margin-top: 16px;
  border-top: 1px solid #E5E5E5;
  padding-top: 12px;
}

.config-block:first-child {
  margin-top: 0;
  border-top: none;
  padding-top: 0;
}

.config-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.collapsible-header {
  cursor: pointer;
  padding: 10px 12px;
  margin: -4px -4px 12px;
  border-radius: 6px;
  transition: background 0.2s ease;
}

.collapsible-header:hover,
.collapsible-header:focus-visible {
  background: #F8FAFC;
  outline: none;
}

.config-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.config-block-title {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.config-block-subtitle {
  font-size: 11px;
  color: #94A3B8;
  line-height: 1.4;
}

.config-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.config-block-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  background: #F1F5F9;
  color: #475569;
  padding: 2px 8px;
  border-radius: 10px;
}

.collapse-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #64748B;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  padding: 2px 8px;
  white-space: nowrap;
}

.collapse-indicator::after {
  content: '▾';
  font-size: 10px;
  transition: transform 0.2s ease;
}

.collapse-indicator.open::after {
  transform: rotate(180deg);
}

.collapsible-content {
  animation: fadeIn 0.2s ease;
}

/* Config Grid */
.config-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.config-item {
  background: #F9F9F9;
  padding: 12px 14px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-item-label {
  font-size: 11px;
  color: #94A3B8;
}

.config-item-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 600;
  color: #1E293B;
}

/* Time Periods */
.time-periods {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.period-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #F9F9F9;
  border-radius: 6px;
}

.period-label {
  font-size: 12px;
  font-weight: 500;
  color: #64748B;
  min-width: 70px;
}

.period-hours {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #475569;
  flex: 1;
}

.period-multiplier {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  color: #6366F1;
  background: #EEF2FF;
  padding: 2px 6px;
  border-radius: 4px;
}

/* Analysis Module Cards */
.agents-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;
}

.agents-cards::-webkit-scrollbar {
  width: 4px;
}

.agents-cards::-webkit-scrollbar-thumb {
  background: #DDD;
  border-radius: 2px;
}

.agents-cards::-webkit-scrollbar-thumb:hover {
  background: #CCC;
}

.agent-card {
  background: #F9F9F9;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  padding: 14px;
  transition: all 0.2s ease;
}

.agent-card:hover {
  border-color: #999;
  background: #FFF;
}

/* Analysis Module Card Header */
.agent-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #F1F5F9;
}

.agent-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #94A3B8;
}

.agent-name {
  font-size: 14px;
  font-weight: 600;
  color: #1E293B;
}

.agent-tags {
  display: flex;
  gap: 6px;
}

.agent-type {
  font-size: 10px;
  color: #64748B;
  background: #F1F5F9;
  padding: 2px 8px;
  border-radius: 4px;
}

.agent-stance {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
}

.stance-neutral {
  background: #F1F5F9;
  color: #64748B;
}

.stance-supportive {
  background: #DCFCE7;
  color: #16A34A;
}

.stance-opposing {
  background: #FEE2E2;
  color: #DC2626;
}

.stance-observer {
  background: #FEF3C7;
  color: #D97706;
}

/* Analysis Focus */
.agent-timeline {
  margin-bottom: 14px;
}

.timeline-label {
  display: block;
  font-size: 10px;
  color: #94A3B8;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.mini-timeline {
  display: flex;
  gap: 2px;
  height: 16px;
  background: #F8FAFC;
  border-radius: 4px;
  padding: 3px;
}

.timeline-hour {
  flex: 1;
  background: #E2E8F0;
  border-radius: 2px;
  transition: all 0.2s;
}

.timeline-hour.active {
  background: linear-gradient(180deg, #6366F1, #818CF8);
}

.timeline-marks {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #94A3B8;
}

/* Analysis Params */
.agent-params {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.param-group {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.param-item .param-label {
  font-size: 10px;
  color: #94A3B8;
}

.param-item .param-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.param-value.with-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-bar {
  height: 4px;
  background: linear-gradient(90deg, #6366F1, #A855F7);
  border-radius: 2px;
  min-width: 4px;
  max-width: 40px;
}

.param-value.positive {
  color: #16A34A;
}

.param-value.negative {
  color: #DC2626;
}

.param-value.neutral {
  color: #64748B;
}

.param-value.highlight {
  color: #6366F1;
}

/* Platforms Grid */
.platforms-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.platform-card {
  background: #F9F9F9;
  padding: 14px;
  border-radius: 6px;
}

.platform-card-header {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #E5E5E5;
}

.platform-name {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

.platform-params {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.param-label {
  font-size: 12px;
  color: #64748B;
}

.param-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: #1E293B;
}

/* Reasoning Content */
.reasoning-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reasoning-item {
  padding: 12px 14px;
  background: #F9F9F9;
  border-radius: 6px;
}

.reasoning-text {
  font-size: 13px;
  color: #555;
  line-height: 1.7;
  margin: 0;
}

/* Profile Modal */
.profile-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.profile-modal {
  background: #FFF;
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px;
  background: #FFF;
  border-bottom: 1px solid #F0F0F0;
}

.modal-header-info {
  flex: 1;
}

.modal-name-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.modal-realname {
  font-size: 20px;
  font-weight: 700;
  color: #000;
}

.modal-username {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #999;
}

.modal-profession {
  font-size: 12px;
  color: #666;
  background: #F5F5F5;
  padding: 4px 10px;
  border-radius: 4px;
  display: inline-block;
  font-weight: 500;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  color: #999;
  border-radius: 50%;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: color 0.2s;
  padding: 0;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

/* 基本信息网格 */
.modal-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px 16px;
  margin-bottom: 32px;
  padding: 0;
  background: transparent;
  border-radius: 0;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.info-value {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.info-value.mbti {
  font-family: 'JetBrains Mono', monospace;
  color: #FF5722;
}

/* 模块区域 */
.modal-section {
  margin-bottom: 28px;
}

.section-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.section-bio {
  font-size: 14px;
  color: #333;
  line-height: 1.6;
  margin: 0;
  padding: 16px;
  background: #F9F9F9;
  border-radius: 6px;
  border-left: 3px solid #E0E0E0;
}

/* 话题标签 */
.topics-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.topic-item {
  font-size: 11px;
  color: #1565C0;
  background: #E3F2FD;
  padding: 4px 10px;
  border-radius: 12px;
  transition: all 0.2s;
  border: none;
}

.topic-item:hover {
  background: #BBDEFB;
  color: #0D47A1;
}

/* 模块说明 */
.persona-dimensions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.dimension-card {
  background: #F8F9FA;
  padding: 12px;
  border-radius: 6px;
  border-left: 3px solid #DDD;
  transition: all 0.2s;
}

.dimension-card:hover {
  background: #F0F0F0;
  border-left-color: #999;
}

.dim-title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #333;
  margin-bottom: 4px;
}

.dim-desc {
  display: block;
  font-size: 10px;
  color: #888;
  line-height: 1.4;
}

.persona-content {
  max-height: none;
  overflow: visible;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
}

.persona-content::-webkit-scrollbar {
  width: 4px;
}

.persona-content::-webkit-scrollbar-thumb {
  background: #DDD;
  border-radius: 2px;
}

.section-persona {
  font-size: 13px;
  color: #555;
  line-height: 1.8;
  margin: 0;
  text-align: justify;
}

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

/* Spinner */
.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid #E5E5E5;
  border-top-color: #FF5722;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
/* Orchestration Content */
.orchestration-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 16px;
}

.box-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.narrative-box {
  background: #FFFFFF;
  padding: 20px 24px;
  border-radius: 12px;
  border: 1px solid #EEF2F6;
  box-shadow: 0 4px 24px rgba(0,0,0,0.03);
  transition: all 0.3s ease;
}

.narrative-box .box-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
  font-size: 13px;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  font-weight: 600;
}

.special-icon {
  filter: drop-shadow(0 2px 4px rgba(255, 87, 34, 0.2));
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.narrative-box:hover .special-icon {
  transform: rotate(180deg);
}

.narrative-text {
  font-family: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
  font-size: 14px;
  color: #334155;
  line-height: 1.8;
  margin: 0;
  text-align: justify;
  letter-spacing: 0.01em;
}

.topics-section {
  background: #FFF;
}

.hot-topics-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hot-topic-tag {
  font-size: 12px;
  color:rgba(255, 86, 34, 0.88);
  background: #FFF3E0;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
}

.hot-topic-more {
  font-size: 11px;
  color: #999;
  padding: 4px 6px;
}

.initial-posts-section {
  border-top: 1px solid #EAEAEA;
  padding-top: 16px;
}

.posts-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-left: 8px;
  border-left: 2px solid #F0F0F0;
  margin-top: 12px;
}

.timeline-item {
  position: relative;
  padding-left: 20px;
}

.timeline-marker {
  position: absolute;
  left: 0;
  top: 14px;
  width: 12px;
  height: 2px;
  background: #DDD;
}

.timeline-content {
  background: #F9F9F9;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #EEE;
}

.post-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.post-role {
  font-size: 11px;
  font-weight: 700;
  color: #333;
  text-transform: uppercase;
}

.post-agent-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.post-id,
.post-username {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #666;
  line-height: 1;
  vertical-align: baseline;
}

.post-username {
  margin-right: 6px;
}

.post-text {
  font-size: 12px;
  color: #555;
  line-height: 1.5;
  margin: 0;
}

/* 分析准备摘要样式 */
.rounds-config-section {
  margin: 24px 0;
  padding-top: 24px;
  border-top: 1px solid #EAEAEA;
}

.rounds-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.growth-header {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px dashed #E2E8F0;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1E293B;
}

.section-desc {
  font-size: 12px;
  color: #94A3B8;
}

.desc-highlight {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  color: #1E293B;
  background: #F1F5F9;
  padding: 1px 6px;
  border-radius: 4px;
  margin: 0 2px;
}

/* Switch Control */
.switch-control {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px 4px 4px;
  border-radius: 20px;
  transition: background 0.2s;
}

.switch-control:hover {
  background: #F8FAFC;
}

.switch-control input {
  display: none;
}

.switch-track {
  width: 36px;
  height: 20px;
  background: #E2E8F0;
  border-radius: 10px;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
}

.switch-track::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 16px;
  height: 16px;
  background: #FFF;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
}

.switch-control input:checked + .switch-track {
  background: #000;
}

.switch-control input:checked + .switch-track::after {
  transform: translateX(16px);
}

.switch-label {
  font-size: 12px;
  font-weight: 500;
  color: #64748B;
}

.switch-control input:checked ~ .switch-label {
  color: #1E293B;
}

/* Slider Content */
.rounds-content {
  animation: fadeIn 0.3s ease;
}

.slider-display {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
}

.slider-display.compact {
  margin-bottom: 10px;
}

.slider-main-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.val-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  font-weight: 700;
  color: #000;
}

.val-unit {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.slider-meta-info {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #64748B;
  background: #F1F5F9;
  padding: 4px 8px;
  border-radius: 4px;
}

.range-wrapper {
  position: relative;
  padding: 0 2px;
}

.growth-mode-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.growth-select {
  min-width: 190px;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  background: #FFF;
  color: #1E293B;
  font-size: 12px;
  padding: 8px 10px;
}

.growth-sliders-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.growth-slider-card {
  border: 1px solid #EEF2F6;
  border-radius: 8px;
  padding: 14px;
  background: #FFF;
}

.minimal-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: #E2E8F0;
  border-radius: 2px;
  outline: none;
  background-image: linear-gradient(#000, #000);
  background-size: var(--percent, 0%) 100%;
  background-repeat: no-repeat;
  cursor: pointer;
}

.minimal-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #FFF;
  border: 2px solid #000;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  transition: transform 0.1s;
  margin-top: -6px; /* Center thumb */
}

.minimal-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.minimal-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
}

.range-marks {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #94A3B8;
  position: relative;
}

.mark-recommend {
  cursor: pointer;
  transition: color 0.2s;
  position: relative;
}

.mark-recommend:hover {
  color: #000;
}

.mark-recommend.active {
  color: #000;
  font-weight: 600;
}

.mark-recommend::after {
  content: '';
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  height: 4px;
  background: #CBD5E1;
}

/* Auto Info */
.auto-info-card {
  display: flex;
  align-items: center;
  gap: 24px;
  background: #F8FAFC;
  padding: 16px 20px;
  border-radius: 8px;
}

.auto-value {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
  padding-right: 24px;
  border-right: 1px solid #E2E8F0;
}

.auto-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}

.auto-meta-row {
  display: flex;
  align-items: center;
}

.duration-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  color: #64748B;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  padding: 3px 8px;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}

.auto-desc {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.auto-desc p {
  margin: 0;
  font-size: 13px;
  color: #64748B;
  line-height: 1.5;
}

.highlight-tip {
  margin-top: 4px !important;
  font-size: 12px !important;
  color: #000 !important;
  font-weight: 500;
  cursor: pointer;
}

.highlight-tip:hover {
  text-decoration: underline;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .profile-modal {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active .profile-modal {
  transition: all 0.3s ease-in;
}

.modal-enter-from .profile-modal,
.modal-leave-to .profile-modal {
  transform: scale(0.95) translateY(10px);
  opacity: 0;
}
</style>
