<template>
  <div class="platform-page model1-page m1-page">
    <!-- ════ Compact page header ════ -->
    <div class="page-header m1-header">
      <div class="m1-header__titles">
        <h1>性能预测</h1>
        <div class="m1-header__sub">配方组成 → 19 项烧成性能 · 温度环雷达对比</div>
        <div class="m1-header__chips">
          <span class="m1-chip m1-chip--brand"><i class="m1-dot m1-dot--live" />属性预测引擎 · recipe_opt</span>
          <span class="m1-chip">{{ materials.length || '—' }} 原料空间</span>
          <span class="m1-chip">19 项性能属性 · 4 温度</span>
          <span v-if="result" class="m1-chip m1-chip--ok">
            最近预测 · {{ usedCount(result) }} 原料 · {{ resultAt }}
          </span>
          <span v-else-if="predicting" class="m1-chip m1-chip--running"><i class="m1-spin" /> 预测中 · 加载模型 ~7s</span>
          <span v-else class="m1-chip m1-chip--idle">等待预测</span>
        </div>
      </div>
      <a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a>
    </div>

    <!-- ════ Two-panel shell: LEFT tools / RIGHT results ════ -->
    <div class="card m1-shell m1-layout pl-eqcols">
      <!-- ── LEFT: multi-tab tool card (default 配方输入) ── -->
      <aside class="m1-left pl-eqcol" aria-label="性能预测 · 配方输入与工具">
        <div class="m1-tabbar" role="tablist" aria-label="左侧工具页签">
          <button
            v-for="t in TABS" :key="t.id" type="button" role="tab"
            class="m1-tab" :class="{ 'is-on': activeTab === t.id }"
            :aria-selected="activeTab === t.id"
            :aria-controls="`m1-panel-${t.id}`"
            :id="`m1-tab-${t.id}`"
            @click="activeTab = t.id"
          >{{ t.label }}</button>
        </div>

        <!-- ════ TAB · 配方输入 (default) ════ -->
        <section v-show="activeTab === 'recipe'" id="m1-panel-recipe" role="tabpanel"
          aria-labelledby="m1-tab-recipe" class="m1-body m1-recipe pl-eqfill pl-scroll">
          <div class="m1-sec-head">
            <div>
              <h3 class="m1-sec-title">组成编辑 <span class="m1-sec-badge">96 原料</span></h3>
              <p class="m1-sec-sub">从预测器原料空间添加 {原料, 百分比}</p>
            </div>
            <span v-if="materialsError" class="m1-link-btn" @click="loadMaterials">重试加载原料</span>
            <span v-else-if="materialsLoading" class="m1-loading-txt"><i class="m1-spin" /> 原料加载中…</span>
          </div>

          <!-- autocomplete adder -->
          <div class="m1-adder">
            <div class="m1-adder__field">
              <label class="m1-sr" for="m1-material-search">搜索原料 (96 空间)</label>
              <input id="m1-material-search" v-model="searchText" type="text"
                class="m1-textinput" placeholder="输入原料名检索 · 如 97黑碳化硅 / 矾土…"
                autocomplete="off" @focus="focused = true" @blur="onAdderBlur" @keydown.enter.prevent="pickMatch(0)" />
              <button type="button" class="m1-adder__add" :disabled="!currentMatch" @click="pickMatch(0)"
                aria-label="添加当前匹配原料">＋ 添加</button>
            </div>
            <ul v-if="focused && matches.length" class="m1-matches" role="listbox" aria-label="原料候选">
              <li v-for="(m, i) in matches" :key="m.name" role="option" :aria-selected="i === 0"
                :class="['m1-match', { 'is-cur': i === 0 }]"
                @mousedown.prevent="pickMatch(i)">
                <span class="m1-match__name">{{ m.name }}</span>
                <span class="m1-match__idx">#{{ m.index }}</span>
              </li>
              <li v-if="!matches.length" class="m1-match m1-match--empty">无匹配原料</li>
            </ul>
            <p v-else-if="!materialsError && !materialsLoading && searchText" class="m1-hint-txt">
              未找到「{{ searchText }}」—— 可尝试更短关键词 (如 矾土) 或使用下方粘贴解析。
            </p>
          </div>

          <!-- rows -->
          <div class="m1-rows" role="list" aria-label="已添加原料">
            <div v-for="(r, i) in rows" :key="r.name" class="m1-row" role="listitem">
              <span class="m1-row__idx" :title="`96 空间索引 #${r.index}`">{{ r.index }}</span>
              <span class="m1-row__name" :title="r.name">{{ r.name }}</span>
              <div class="m1-stepper">
                <button type="button" class="m1-step-btn" aria-label="百分比 −1" @click="bump(i, -1)">−</button>
                <input class="m1-step-val" type="number" min="0" max="100" step="any" v-model.number="r.percent"
                  :aria-label="`${r.name} 百分比`" />
                <button type="button" class="m1-step-btn" aria-label="百分比 +1" @click="bump(i, 1)">＋</button>
              </div>
              <span class="m1-row__pct">%</span>
              <button type="button" class="m1-remove" :aria-label="`移除 ${r.name}`" title="移除" @click="rows.splice(i, 1)">✕</button>
            </div>
            <div v-if="!rows.length" class="m1-rows-empty">
              尚未添加原料 —— 通过上方检索框选择，或
              <button type="button" class="m1-link-btn" @click="loadExample">载入示例配方</button>。
            </div>
          </div>

          <!-- sum + actions -->
          <div class="m1-foot">
            <div class="m1-sumline">
              <span class="m1-sumlabel">合计</span>
              <span class="m1-sumval" :class="sumState.class">{{ totalPercent.toFixed(2) }}%</span>
              <span class="m1-sumhint">{{ sumState.text }}</span>
            </div>
            <div class="m1-actions">
              <button type="button" class="m1-ghost-btn" :disabled="!rows.length" @click="rows = []; clearOutcomes()">清空</button>
              <button type="button" class="m1-ghost-btn" @click="loadExample" title="载入一组真实原料示例">载入示例</button>
              <button type="button" class="m1-run-btn" :disabled="predicting || !predictableRows.length" @click="runPrediction">
                <span v-if="predicting" class="m1-run__spinner" aria-hidden="true" />
                {{ predicting ? '预测中…' : '预测属性' }}
              </button>
            </div>
          </div>
          <p v-if="predictError" class="m1-errorbar" role="alert">{{ predictError }}</p>

          <!-- paste / free-text -->
          <details class="m1-paste">
            <summary>粘贴配方文本 (自由文本解析)</summary>
            <p class="m1-paste__hint">
              每行「原料名 + 百分比」，支持 <code>90矾土 62</code> / <code>90矾土:62</code> /
              <code>Al2O3微粉 12%</code> 及 <code>、</code> 分隔。原料名与 96 空间
              精确/子串匹配，未匹配项单独列出、不参与预测。
            </p>
            <textarea v-model="pasteText" class="m1-textarea" rows="6"
              placeholder="90矾土 62&#10;97黑碳化硅 18&#10;Al2O3微粉 10&#10;CA70水泥 8&#10;防爆纤维 2" />
            <div class="m1-paste__bar">
              <button type="button" class="m1-ghost-btn m1-ghost-btn--sm" :disabled="!pasteText.trim()" @click="applyPaste">解析并合并到配方</button>
              <button type="button" class="m1-ghost-btn m1-ghost-btn--sm" @click="loadPasteExample">填入示例文本</button>
            </div>
            <div v-if="pasteOutcome" class="m1-paste__outcome">
              <span v-if="pasteOutcome.added.length" class="m1-chip m1-chip--ok">新匹配 {{ pasteOutcome.added.length }} 项</span>
              <span v-if="pasteOutcome.matched.length" class="m1-chip">覆盖 {{ pasteOutcome.matched.length }} 项</span>
              <span v-if="pasteOutcome.unmatched.length" class="m1-chip m1-chip--warn">未匹配 {{ pasteOutcome.unmatched.length }} 项</span>
              <span v-if="!pasteOutcome.added.length && !pasteOutcome.matched.length && !pasteOutcome.unmatched.length" class="m1-chip">无可解析内容</span>
            </div>
          </details>
        </section>

        <!-- ════ TAB · 匹配状态 ════ -->
        <section v-show="activeTab === 'status'" id="m1-panel-status" role="tabpanel"
          aria-labelledby="m1-tab-status" class="m1-body m1-status pl-eqfill pl-scroll">
          <div class="m1-sec-head">
            <div>
              <h3 class="m1-sec-title">解析匹配状态</h3>
              <p class="m1-sec-sub">当前组成在 96 原料空间内的匹配情况</p>
            </div>
          </div>
          <div class="m1-status-grid">
            <div class="m1-stat"><span class="m1-stat__k">已选原料</span><span class="m1-stat__v">{{ rows.length }} / 96</span></div>
            <div class="m1-stat"><span class="m1-stat__k">合计百分比</span><span class="m1-stat__v">{{ totalPercent.toFixed(2) }}%</span></div>
            <div class="m1-stat"><span class="m1-stat__k">文本未匹配</span><span class="m1-stat__v">{{ pasteOutcome?.unmatched.length || 0 }}</span></div>
            <div class="m1-stat"><span class="m1-stat__k">上次预测用量</span><span class="m1-stat__v">{{ result ? usedCount(result) : '—' }}</span></div>
          </div>

          <template v-if="rows.length">
            <h4 class="m1-subtitle">已匹配 (参与预测)</h4>
            <ul class="m1-kvlist">
              <li v-for="r in rows" :key="r.name"><span class="m1-kvlist__k">{{ r.name }}</span><span class="m1-kvlist__v">{{ r.percent }}%</span></li>
            </ul>
          </template>
          <p v-else class="m1-inline-hint">尚未添加原料。</p>

          <h4 class="m1-subtitle">未匹配 (仅自由文本可能产生)</h4>
          <ul v-if="pasteOutcome?.unmatched.length" class="m1-kvlist">
            <li v-for="(u, i) in pasteOutcome.unmatched" :key="i" class="m1-kvlist--warn">
              <span class="m1-kvlist__k">{{ u.raw }}</span>
              <span class="m1-kvlist__v">{{ u.reason }}</span>
            </li>
          </ul>
          <p v-else class="m1-inline-hint">当前无未匹配原料。服务器丢弃的未知原料会在右侧结果状态中显示。</p>

          <template v-if="result">
            <h4 class="m1-subtitle">服务器报告 (上次预测)</h4>
            <div class="m1-util-row">
              <span class="m1-chip m1-chip--ok">used {{ usedCount(result) }} 项</span>
              <span class="m1-chip" :class="result.normalization?.applied ? 'm1-chip--warn' : 'm1-chip--ok'">
                {{ result.normalization?.applied ? `Σ${result.normalization.raw_sum}% 已归一化×${result.normalization.scale}` : 'Σ=100% 未归一化' }}
              </span>
              <span v-if="Object.keys(result.unused || {}).length" class="m1-chip m1-chip--warn">unused {{ Object.keys(result.unused).length }} 项</span>
              <span class="m1-chip">source: {{ result.source }}</span>
            </div>
          </template>
        </section>

        <!-- ════ TAB · 多模态上传 (预留) ════ -->
        <section v-show="activeTab === 'upload'" id="m1-panel-upload" role="tabpanel"
          aria-labelledby="m1-tab-upload" class="m1-body pl-eqfill pl-scroll">
          <div class="m1-sec-head">
            <div>
              <h3 class="m1-sec-title">多模态配方上传</h3>
              <p class="m1-sec-sub">Excel / Word / PDF / 图片配方单据</p>
            </div>
            <span class="m1-sec-badge m1-sec-badge--amber">多模态解析预留</span>
          </div>
          <div class="m1-dropzone" tabindex="0" role="button" :aria-label="`上传配方文件，当前 ${files.length} 个`"
            @click="fileInput?.click()" @keydown.enter.prevent="fileInput?.click()"
            @dragover.prevent @drop.prevent="onDrop">
            <div class="m1-dropzone__main">拖放文件到此处，或点击选择</div>
            <div class="m1-dropzone__sub">支持 .xlsx .xls .doc .docx .pdf .png .jpg .jpeg .csv .txt</div>
            <input ref="fileInput" type="file" multiple class="m1-sr"
              accept=".xlsx,.xls,.doc,.docx,.pdf,.png,.jpg,.jpeg,.csv,.txt" @change="onPick" />
          </div>
          <p class="m1-note">
            该区域当前仅收集文件名（共 {{ files.length }} 个），
            多模态解析（LLM 从单据中提取 96 空间原料与配比）为后续版本预留，暂不解析。
          </p>
          <ul v-if="files.length" class="m1-filelist">
            <li v-for="(f, i) in files" :key="`${f.name}-${f.lastModified}`" class="m1-file">
              <span class="m1-file__icon">{{ fileIcon(f.name) }}</span>
              <span class="m1-file__name" :title="f.name">{{ f.name }}</span>
              <span class="m1-file__size">{{ humanSize(f.size) }}</span>
              <button type="button" class="m1-remove" :aria-label="`移除文件 ${f.name}`" @click="files.splice(i, 1)">✕</button>
            </li>
          </ul>
          <button v-if="files.length" type="button" class="m1-ghost-btn m1-ghost-btn--sm" @click="files = []">清空文件列表</button>
        </section>

        <!-- ════ TAB · Embedding 分析 (预留) ════ -->
        <section v-show="activeTab === 'embed'" id="m1-panel-embed" role="tabpanel"
          aria-labelledby="m1-tab-embed" class="m1-body pl-eqfill pl-scroll">
          <div class="m1-sec-head">
            <div>
              <h3 class="m1-sec-title">配方 Embedding 分析</h3>
              <p class="m1-sec-sub">组成向量空间中的配方表征</p>
            </div>
            <span class="m1-sec-badge m1-sec-badge--amber">预留模块</span>
          </div>
          <p class="m1-note">
            计划能力：将当前 96 维配方组成映射到稠密向量，分析嵌入邻域、离群程度与聚类倾向，
            并与历史配方库比对。尚未接入向量服务 —— 待 embedding 管线在本页启用后开放。
          </p>
          <div class="m1-placeholder-tile">
            <span>Embedding 服务未接入</span>
            <span class="m1-placeholder-tile__sub">点击预测即可先使用真实性能预测；嵌入分析将在后续迭代提供</span>
          </div>
        </section>

        <!-- ════ TAB · 相似度分析 (预留) ════ -->
        <section v-show="activeTab === 'sim'" id="m1-panel-sim" role="tabpanel"
          aria-labelledby="m1-tab-sim" class="m1-body pl-eqfill pl-scroll">
          <div class="m1-sec-head">
            <div>
              <h3 class="m1-sec-title">相似配方检索</h3>
              <p class="m1-sec-sub">与历史/优化配方的组成与性能相似度</p>
            </div>
            <span class="m1-sec-badge m1-sec-badge--amber">预留模块</span>
          </div>
          <p class="m1-note">
            计划能力：以当前组成为查询，在 recipe_opt 96 空间中按组成距离 (如余弦/加权 L1) 检索最近配方，
            并对照其训练实测性能区间。依赖历史配方语料索引，后续接入。
          </p>
          <div class="m1-placeholder-tile">
            <span>相似度索引未就绪</span>
            <span class="m1-placeholder-tile__sub">当前可保存多条预测快照进行「历史对比」以人工比较相似配方</span>
          </div>
        </section>
      </aside>

      <!-- ── RIGHT: radar workbench ── -->
      <section class="m1-right pl-eqcol" aria-label="预测结果工作台">
        <div class="m1-rhead pl-workbench-head">
          <span class="m1-chip m1-chip--brand">属性预测引擎 · recipe_opt</span>
          <span class="m1-chip">温度环: 常温(110) / 1100 / 1450℃</span>
          <span v-if="result" class="m1-rhead__status m1-chip m1-chip--ok">
            最近 · {{ usedCount(result) }} 原料 · {{ resultAt }}
            <template v-if="result.normalization?.applied"> · 已归一化 Σ{{ result.normalization.raw_sum }}%</template>
          </span>
          <span v-else class="m1-rhead__status m1-chip">尚未预测</span>
        </div>

        <!-- ── RIGHT 结果工作台：雷达图 / 数值表 两个子页签 (默认 预测属性 · 雷达图) ── -->
        <div class="card m1-panel m1-workbench pl-eqfill">
          <div class="m1-subtabs" role="tablist" aria-label="预测结果子页签">
            <button v-for="rt in RIGHT_TABS" :key="rt.id" type="button" role="tab"
              class="m1-subtab" :class="{ 'is-on': rightTab === rt.id }"
              :aria-selected="rightTab === rt.id"
              :aria-controls="`m1-subpanel-${rt.id}`"
              :id="`m1-subtab-${rt.id}`"
              @click="rightTab = rt.id">{{ rt.label }}</button>
          </div>

          <!-- SUB-TAB · 预测属性 · 雷达图 (default; 预测前空态停留于此) -->
          <section v-show="rightTab === 'radar'" id="m1-subpanel-radar" role="tabpanel"
            aria-labelledby="m1-subtab-radar" class="m1-subpanel pl-eqfill pl-scroll">
            <div class="m1-panel-head">
              <div>
                <h2 class="m1-panel-title">预测属性 · 雷达图</h2>
                <p class="m1-panel-sub">每环 = 一个热处理温度 · 实/虚线交替避免重叠混淆 · 径向越外 = 该轴越优</p>
              </div>
              <div class="m1-chart-actions">
                <button type="button" class="m1-ghost-btn m1-ghost-btn--sm" :disabled="!radar" @click="saveSnapshot"
                  title="把本次预测的 4 个温度环加入历史对比">＋ 保存当前曲线</button>
                <button type="button" class="m1-ghost-btn m1-ghost-btn--sm" :disabled="!history.length" @click="history = []"
                  title="清空全部历史快照">清空历史</button>
              </div>
            </div>

            <div v-if="!radar" class="m1-empty">
              <div class="m1-empty__glyph" aria-hidden="true">
                <svg viewBox="0 0 120 120" width="120" height="120" fill="none">
                  <circle cx="60" cy="60" r="46" stroke="#dbe7f2" stroke-width="1" stroke-dasharray="4 4" />
                  <circle cx="60" cy="60" r="30" stroke="#dbe7f2" stroke-width="1" stroke-dasharray="4 4" />
                  <polygon points="60,16 99,42 85,92 35,92 21,42" stroke="#c9d9e8" stroke-width="1.4" fill="none" />
                </svg>
              </div>
              <h3 class="m1-empty__title">预测属性将在此以雷达图呈现</h3>
              <p class="m1-empty__desc">
                在左侧「配方输入」中添加原料 (recipe_opt 96 空间) 并点击
                <strong>预测属性</strong>。模型将真实预测 19 项性能 (体密 / 耐压 / 抗折 / 高温抗折 /
                线变化率 / 气孔率 / 吸水率)，按温度呈现为 3 条可对比的雷达环。
              </p>
            </div>

            <template v-else>
              <div class="m1-chartgrid">
                <div class="m1-svgwrap">
                  <svg :viewBox="`0 0 ${SVG.W} ${SVG.H}`" class="m1-radar" role="img"
                    aria-label="性能预测雷达图：7 个属性轴，4 条温度环">
                    <!-- grid rings: 25/50/75/100% 刻度 -->
                    <circle v-for="g in gridFracs" :key="g" :cx="SVG.CX" :cy="SVG.CY"
                      :r="gridRadius(g)" fill="none" stroke="#e4ebf2" stroke-width="1" />
                    <!-- spokes -->
                    <line v-for="(f, i) in radar.axes" :key="`spoke-${i}`"
                      :x1="pt(i, 0)[0]" :y1="pt(i, 0)[1]" :x2="pt(i, 1)[0]" :y2="pt(i, 1)[1]"
                      stroke="#e4ebf2" stroke-width="1" />
                    <!-- axis labels -->
                    <g v-for="(f, i) in radar.axes" :key="`lbl-${i}`" :transform="`translate(${pt(i, 1.2)[0]} ${pt(i, 1.2)[1]})`">
                      <text class="m1-axis-label" text-anchor="middle" dy="-1">{{ f.base }}<tspan class="m1-axis-dir">{{ f.dir === 'high' ? '↑' : '↓' }}</tspan></text>
                      <text class="m1-axis-unit" text-anchor="middle" dy="12">{{ f.unit }} · {{ f.dir === 'high' ? '越大越优' : '越小越优' }}</text>
                    </g>
                    <!-- per-axis outer scale: 每轴满半径真实值 + 单位 (量值 = 归一化同一组 min/max) -->
                    <g v-for="(f, i) in radar.axes" :key="`scl-${i}`"
                      :transform="`translate(${pt(i, 1.05)[0]} ${pt(i, 1.05)[1]})`">
                      <text class="m1-axis-scale" text-anchor="middle" dy="-3">{{ scaleText(f) }}</text>
                    </g>
                    <text :x="SVG.CX" :y="26" class="m1-radar-caption" text-anchor="middle">径向 = 归一化后「更优」方向 · 每轴按本次 4 温度 min~max 缩放 · 外缘刻度 = 满半径真实值 + 单位</text>

                    <!-- history snapshots (under current) -->
                    <g v-for="h in visibleHistory" :key="h.id" class="m1-history-layer">
                      <polygon v-for="(ring) in h.rings" :key="`${h.id}-${ring.tempKey}`"
                        :points="polyOf(ring.vals)" fill="none" :stroke="h.hue" stroke-width="1.7"
                        stroke-linejoin="round" :stroke-dasharray="dashOfTemp(ring.tempKey)" opacity="0.8" />
                    </g>

                    <!-- current run: 4 temperature rings -->
                    <g v-for="ring in orderedRings" :key="`cur-${ring.temp.key}`">
                      <polygon :points="polyOf(ring.vals)" :fill="ring.temp.color" fill-opacity="0.06"
                        :stroke="ring.temp.color" stroke-width="2.4" stroke-linejoin="round"
                        :stroke-dasharray="ring.temp.dash || 'none'" />
                      <circle v-for="(v, i) in ring.vals" :key="`${ring.temp.key}-${i}`"
                        :cx="pt(i, v)[0]" :cy="pt(i, v)[1]" r="2.3" :fill="ring.temp.color" />
                    </g>
                  </svg>
                  <p class="m1-svg-note">
                    温度环颜色 + 实/虚线双重编码 · 常温(110℃) 环 = 实线深蓝；
                    缺失温度轴的数值默认沿用常温(110℃) 实测（无常温项则沿用该族唯一/最近实测），各环在该轴重合。
                  </p>
                </div>

                <div class="m1-side">
                  <h4 class="m1-side-title">温度环图例</h4>
                  <ul class="m1-legend">
                    <li v-for="t in DRAW_TEMPS" :key="t.key" class="m1-legend__item">
                      <span class="m1-sw" :style="{ borderColor: t.color, borderTopStyle: t.dash ? 'dashed' : 'solid' }" />
                      <span class="m1-legend__label">{{ t.label }}</span>
                      <span class="m1-legend__style">{{ t.dash ? '虚线' : '实线' }}</span>
                    </li>
                  </ul>

                  <div class="m1-side-divider" />

                  <div class="m1-side-row">
                    <h4 class="m1-side-title">历史对比 <span class="m1-side-count">{{ history.length }}</span></h4>
                    <div class="m1-side-row__hint">保存当前曲线后可叠加对比 (不同色相 + 半透明)</div>
                  </div>
                  <ul v-if="history.length" class="m1-hlist">
                    <li v-for="h in history" :key="h.id" class="m1-hitem" :class="{ 'is-off': !h.visible }">
                      <label class="m1-hitem__toggle" :title="h.visible ? '隐藏此快照' : '显示此快照'">
                        <input type="checkbox" :checked="h.visible" @change="h.visible = !h.visible" class="m1-sr" />
                        <span class="m1-sw" :style="{ borderColor: h.hue, borderTopStyle: 'solid' }" />
                        <span class="m1-hitem__name">{{ h.name }}</span>
                      </label>
                      <span class="m1-hitem__at">{{ fmtTime(h.at) }}</span>
                      <button type="button" class="m1-remove" :aria-label="`删除 ${h.name}`" title="删除快照"
                        @click="removeSnapshot(h.id)">✕</button>
                    </li>
                  </ul>
                  <p v-else class="m1-inline-hint">尚无快照 —— 点击「＋ 保存当前曲线」把本次温度环加入对比。</p>
                </div>
              </div>

              <!-- axis semantics / fallback annotation -->
              <div class="m1-axisnote">
                <div v-for="(f, i) in radar.axes" :key="f.base" class="m1-axisnote__item">
                  <span class="m1-axisnote__name">{{ f.base }}</span>
                  <span class="m1-axisnote__tag" :class="f.dir === 'high' ? 'is-high' : 'is-low'">
                    {{ f.dir === 'high' ? '↑ 越大越优' : '↓ 越小越优' }}
                  </span>
                  <span class="m1-axisnote__temps">{{ tempsInfoOf(f.base) }}</span>
                  <span class="m1-axisnote__val">{{ axisSummary(i) }}</span>
                </div>
              </div>
            </template>
          </section>

          <!-- SUB-TAB · 预测数值表 -->
          <section v-show="rightTab === 'table'" id="m1-subpanel-table" role="tabpanel"
            aria-labelledby="m1-subtab-table" class="m1-subpanel pl-eqfill pl-scroll">
            <div class="m1-panel-head">
              <div>
                <h2 class="m1-panel-title">预测数值表 <span v-if="result" class="m1-panel-sub-inline">recipe_opt 单次确定性预测 · 原始值 (精度列)</span></h2>
                <p class="m1-panel-sub">表格展示 19 项真实预测数值；雷达图为归一化形状展示，精度以此表为准</p>
              </div>
            </div>
            <div v-if="!radar" class="m1-empty m1-empty--mini">
              <p class="m1-empty__desc">运行一次预测后，19 项性能数值将在此按属性族分组列出。</p>
            </div>
            <template v-else>
              <table class="m1-table">
                <caption class="m1-sr">19 项预测性能数值（按属性族 × 温度）</caption>
                <thead>
                  <tr><th class="m1-th--prop">属性族</th><th>温度</th><th class="m1-th--val">预测值</th><th>单位 · 方向</th></tr>
                </thead>
                <tbody>
                  <template v-for="(f, i) in radar.axes" :key="f.base">
                    <tr class="m1-tfam">
                      <td colspan="4">
                        <span class="m1-tfam__name">{{ f.base }}</span>
                        <span class="m1-tfam__dir" :class="f.dir === 'high' ? 'is-high' : 'is-low'">{{ f.dir === 'high' ? '↑ 越大越优' : '↓ 越小越优' }}</span>
                        <span class="m1-tfam__temps">{{ tempsInfoOf(f.base) }}</span>
                      </td>
                    </tr>
                    <tr v-for="(row, j) in familyRows(f.base)" :key="`${f.base}-${row.tempKey}`" class="m1-trow">
                      <td class="m1-trow__spacer" />
                      <td><span class="m1-tdot" :style="{ background: tempOf(row.tempKey).color }" />{{ tempOf(row.tempKey).label }}</td>
                      <td class="m1-tval">{{ fmtVal(row.value) }}</td>
                      <td class="m1-tunit">{{ f.unit }}<span v-if="row.fallback" class="m1-tfallback" :title="row.fallbackNote"> (沿用)</span></td>
                    </tr>
                  </template>
                </tbody>
              </table>
              <p class="m1-table-note">
                雷达「沿用」填充：某温度无实测的属性项在雷达上沿用常温(110℃) 值（该族无常温项时沿用其唯一/最近温度实测），
                使缺失温度的各环在该轴重合而非断口；表格仅列出模型真实输出的 19 项。
              </p>
            </template>
          </section>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchModel1Materials, predictModel1 } from '../api/models'

const router = useRouter()

/* ───────────────────────── 常量 · 属性族 / 温度环 ───────────────────────── */
// 7 个属性族 (由 19 项预测属性按名称前缀归纳) —— 雷达图的轴。
// dir: 'high' = 越高越好; 'low' = 越低越好 (径向统一为「越外越优」，low 族在归一化后取反)。
const FAMILY = [
  { base: '体密',     unit: 'g/cm³', dir: 'high' },
  { base: '耐压强度', unit: 'MPa',   dir: 'high' },
  { base: '抗折强度', unit: 'MPa',   dir: 'high' },
  { base: '高温抗折', unit: 'MPa',   dir: 'high' },
  { base: '线变化率', unit: '%',     dir: 'low'  },
  { base: '气孔率',   unit: '%',     dir: 'low'  },
  { base: '吸水率',   unit: '%',     dir: 'low'  },
]

// 4 温度环：颜色(色盲安全)+ 实/虚线 双重编码; 交替 stroke 让重叠环可区分。
const TEMPS = [
  { key: '110',  label: '常温(110℃)', color: '#005bac', dash: null },
  { key: '1100', label: '1100℃',      color: '#e69f00', dash: '6 4' },
  { key: '1450', label: '1450℃',      color: '#009e73', dash: null },
  { key: '1500', label: '1500℃',      color: '#d55e00', dash: '6 4' },
]

// 雷达仅绘制常温/1100/1450 三条温度环；1500℃ 保留在预测数值表 (TEMPS 全量)。
const DRAW_TEMPS = TEMPS.filter((t) => t.key !== '1500')

// 历史快照色相 (避开 4 个温度环色) —— 叠加层用色相 + 环内线型区分。
const HISTORY_HUES = ['#cc79a7', '#56b4e9', '#7f7f7f', '#6a3d9a', '#8b4513', '#008b8b', '#c2185b', '#808000']
let snapshotSeq = 0

const tempC = (t) => (t.key === '110' ? '110℃' : `${t.key}℃`)
const propKeyOf = (base, t) => `${base}[${tempC(t)}]`

/* ───────────────────────── 页签 ───────────────────────── */
const TABS = [
  { id: 'recipe', label: '配方输入' },
  { id: 'status', label: '匹配状态' },
  { id: 'upload', label: '多模态上传' },
  { id: 'embed',  label: 'Embedding 分析' },
  { id: 'sim',    label: '相似度分析' },
]
const activeTab = ref('recipe')

// 右侧结果工作台的子页签 (雷达图 / 数值表)。仅显示当前激活子页签内容；
// 二者共享同一 result / radar / history 状态，切换即时、无重算。
const RIGHT_TABS = [
  { id: 'radar', label: '预测属性 · 雷达图' },
  { id: 'table', label: '预测数值表' },
]
const rightTab = ref('radar')

/* ───────────────────────── 96 原料空间 ───────────────────────── */
const materials = ref([])
const materialsLoading = ref(false)
const materialsError = ref('')
const materialIndex = computed(() => {
  const map = new Map()
  materials.value.forEach((m) => map.set(m.name, m.index))
  return map
})

async function loadMaterials() {
  materialsLoading.value = true
  materialsError.value = ''
  try {
    const data = await fetchModel1Materials()
    materials.value = (data?.materials || []).slice()
    if (!materials.value.length) materialsError.value = '接口返回了空原料列表'
  } catch (e) {
    materialsError.value = e?.message || '原料列表加载失败'
  } finally {
    materialsLoading.value = false
  }
}
onMounted(loadMaterials)

/* ───────────────────────── 配方编辑器 ───────────────────────── */
const rows = ref([]) // { name, percent, index }
const searchText = ref('')
const focused = ref(false)
const fileInput = ref(null)
const files = ref([])
const pasteText = ref('')
const pasteOutcome = ref(null)

const suggestedPercent = computed(() => {
  const remaining = 100 - totalPercent.value
  return remaining > 0.5 ? Math.round(remaining * 100) / 100 : 10
})

const matches = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return materials.value.slice(0, 14)
  const exact = []
  const inc = []
  for (const m of materials.value) {
    const n = m.name.toLowerCase()
    if (n === q) exact.push(m)
    else if (n.includes(q) || (q.includes(n) && n.length >= 2)) inc.push(m)
  }
  const scored = inc
    .map((m) => ({ m, score: Math.abs(m.name.length - q.length) }))
    .sort((a, b) => a.score - b.score || a.m.index - b.m.index)
    .map((s) => s.m)
  return exact.concat(scored).slice(0, 14)
})

const currentMatch = computed(() => matches.value[0] || null)

function pickMatch(i) {
  const m = matches.value[i]
  if (!m) return
  const exist = rows.value.find((r) => r.name === m.name)
  if (!exist) {
    rows.value.push({ name: m.name, percent: suggestedPercent.value, index: m.index })
  }
  searchText.value = ''
}

function onAdderBlur() {
  // 允许 mousedown.prevent 的选择先触发 pickMatch
  setTimeout(() => { focused.value = false }, 120)
}

function bump(i, delta) {
  const v = (Number(rows.value[i].percent) || 0) + delta
  rows.value[i].percent = Math.max(0, Math.round(v * 100) / 100)
}

const totalPercent = computed(() => rows.value.reduce((s, r) => s + (Number(r.percent) || 0), 0))
const predictableRows = computed(() => rows.value.filter((r) => (Number(r.percent) || 0) > 0))

const sumState = computed(() => {
  const diff = Math.abs(totalPercent.value - 100)
  if (diff < 0.5) return { class: 'is-ok', text: 'Σ100% ✓' }
  return {
    class: totalPercent.value > 100 ? 'is-high' : 'is-low',
    text: totalPercent.value > 100 ? '超过 100% —— 预测前将自动归一化' : '不足 100% —— 预测前将自动归一化',
  }
})

const EXAMPLE = [
  ['90矾土', 62], ['97黑碳化硅', 18], ['Al2O3微粉', 10], ['CA70水泥', 8], ['防爆纤维', 2],
]
function loadExample() {
  const idxMap = materialIndex.value
  rows.value = EXAMPLE.map(([name, percent]) => ({
    name, percent, index: idxMap.get(name) ?? -1,
  }))
  clearOutcomes()
}
function loadPasteExample() {
  pasteText.value = '90矾土 62\n97黑碳化硅 18\nAl2O3微粉 10\nCA70水泥 8\n防爆纤维 2'
}
function clearOutcomes() {
  pasteOutcome.value = null
}

function resolveMaterialName(token) {
  const names = materialIndex.value
  if (names.has(token)) return { name: token, exact: true }
  let best = null
  for (const name of names.keys()) {
    if (name.includes(token) || (token.includes(name) && name.length >= 2)) {
      if (!best || name.length < best.length) best = name
    }
  }
  return best ? { name: best, exact: false } : null
}

function applyPaste() {
  const outcome = { added: [], matched: [], unmatched: [] }

  // 提交一个已解析的 {name, percent>0}
  const commit = (name, percent) => {
    const exist = rows.value.find((r) => r.name === name)
    if (exist) {
      exist.percent = percent
      outcome.matched.push({ name, percent })
    } else {
      rows.value.push({ name, percent, index: materialIndex.value.get(name) ?? -1 })
      outcome.added.push({ name, percent })
    }
  }

  // 解析单个「原料名 + 可选百分比」文本段（段内不含 、，; 等多项分隔符）。
  const parseSegment = (seg) => {
    const s = seg.trim()
    if (!s) return true // 空段直接跳过
    if (/^\d+(?:\.\d+)?\s*%?$/.test(s)) return true // 孤立数字(如 "、8")静默忽略
    const trailing = s.match(/(\d+(?:\.\d+)?)\s*%?\s*$/)
    let percent = null
    let nameTok = null
    if (trailing) {
      // 末尾数字视为百分比；紧贴原料名尾部的 “-”(如 FS-20 的 “20”)不算分隔，
      // 数字前为 ：= 空格 等分隔符时才剥离。
      const prevCh = s.slice(0, trailing.index).slice(-1) || ''
      if (!/[-–—]/.test(prevCh)) {
        const head = s
          .slice(0, s.length - trailing[0].length)
          .replace(/[:\s：=＝\-—]+$/, '')
          .trim()
        if (head) {
          nameTok = head
          percent = Number(trailing[1])
        }
      }
    }
    if (percent === null) nameTok = s // 无百分比 -> 整段作为原料名候选

    if (nameTok) {
      const r = resolveMaterialName(nameTok)
      if (r) {
        // 名称本身以数字结尾(如 Vical71 / FS20)：整段即原料名时，数字属于名称。
        if (percent !== null && r.name === s) {
          outcome.unmatched.push({ raw: s, reason: '仅匹配到原料名 (名称含数字) · 请确认百分比' })
          return true
        }
        if (percent === null || percent <= 0) {
          outcome.unmatched.push({ raw: s, reason: '仅匹配到原料名 · 缺 >0 的百分比' })
          return true
        }
        commit(r.name, percent)
        return true
      }
      // 剥离候选未匹配：可能整段就是名称(本身含数字)，整段能匹配 -> 按缺百分比提示。
      if (percent !== null) {
        const whole = resolveMaterialName(s)
        if (whole) {
          outcome.unmatched.push({ raw: s, reason: '仅匹配到原料名 (名称含数字) · 请确认百分比' })
          return true
        }
      }
    }
    outcome.unmatched.push({
      raw: nameTok && percent !== null ? nameTok : s,
      reason: '未匹配到 96 空间原料',
    })
    return true
  }

  const lines = pasteText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  for (const line of lines) {
    if (!/[、,，;；]/.test(line)) {
      parseSegment(line) // 单段（支持 “97黑碳化硅:18” / “CA70水泥 8”）
      continue
    }
    // 多项文本：先按分隔符拆分，再把游离的纯数字片段并入前一项（“CA70水泥、8”）。
    const items = []
    for (const piece of line.split(/[、,，;；]+/)) {
      const p = piece.trim()
      if (/^\d+(?:\.\d+)?\s*%?$/.test(p) && items.length) items[items.length - 1] += ` ${p}`
      else items.push(p)
    }
    for (const item of items) parseSegment(item)
  }
  pasteOutcome.value = {
    added: outcome.added,
    matched: outcome.matched,
    unmatched: outcome.unmatched,
  }
}

/* ───────────────────────── 预测 ───────────────────────── */
const predicting = ref(false)
const predictError = ref('')
const result = ref(null) // 服务端 data { ok, predicted, used, unused, normalization, source }
const resultAt = ref('')

function errText(e) {
  return e?.response?.data?.message || e?.message || '预测请求失败，请稍后重试'
}

async function runPrediction() {
  predictError.value = ''
  if (!predictableRows.value.length) {
    predictError.value = '请至少添加一种原料并填写 >0 的百分比。'
    return
  }
  const recipe = {}
  predictableRows.value.forEach((r) => { recipe[r.name] = r.percent })
  predicting.value = true
  try {
    const data = await predictModel1(recipe)
    result.value = data
    resultAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    predictError.value = ''
  } catch (e) {
    predictError.value = errText(e)
  } finally {
    predicting.value = false
  }
}

const usedCount = (r) => Object.keys(r?.used || {}).length

/* ───────────────────────── 雷达数据模型 ─────────────────────────
 * valueFor(family, temp)：温度实测 -> 常温(110℃) 回退 -> 该族最近/唯一实测。
 * 归一化：每个轴按「该次预测 4 个温度 (回退后)」的 min~max 线性缩放；若族在全部
 * 温度上恒定 (min==max, 常见于仅 1450℃ 实测的 吸水率/气孔率) -> 0.5 中圈，各环重合。
 * dir==='low' 的轴取反，保证「径向越外 = 越优」对所有轴一致。 */
function valueFor(pred, base, t) {
  const direct = pred[propKeyOf(base, t)]
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct)
  if (t.key !== '110') {
    const room = pred[propKeyOf(base, TEMPS[0])]
    if (room != null && Number.isFinite(Number(room))) return Number(room)
  }
  for (const other of TEMPS) {
    if (other.key === t.key) continue
    const v = pred[propKeyOf(base, other)]
    if (v != null && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}

function buildRadar(pred) {
  const axes = FAMILY.map((f) => {
    const vals = TEMPS.map((t) => valueFor(pred, f.base, t))
    const finite = vals.filter((v) => v != null)
    if (!finite.length) return null
    const lo = Math.min(...finite)
    const hi = Math.max(...finite)
    const spread = hi - lo
    // 每个轴：该次预测中 4 个温度在该属性族上的取值 -> 0..1
    const normed = vals.map((v) => {
      if (v == null) return null
      if (spread < 1e-9) return 0.5 // 恒定轴 -> 中圈重合
      return Math.min(1, Math.max(0, (v - lo) / spread))
    })
    // low=越小越优 取反 -> 径向统一“越大越优”
    const oriented = f.dir === 'low' ? normed.map((v) => (v == null ? null : 1 - v)) : normed
    return { ...f, lo, hi, vals, oriented }
  }).filter(Boolean)

  const rings = DRAW_TEMPS.map((t) => {
    const ti = TEMPS.findIndex((x) => x.key === t.key)
    return { temp: t, vals: axes.map((a) => a.oriented[ti]) }
  })
  return { axes, rings }
}

const radar = computed(() => (result.value?.predicted ? buildRadar(result.value.predicted) : null))
const orderedRings = computed(() => (radar.value ? [...radar.value.rings].reverse() : [])) // 常温最后画(最上)

/* ───────────────────────── 历史快照 ───────────────────────── */
const history = ref([])
const visibleHistory = computed(() => history.value.filter((h) => h.visible))
function saveSnapshot() {
  if (!radar.value) return
  snapshotSeq += 1
  history.value.push({
    id: `snap-${Date.now()}`,
    name: `快照 ${snapshotSeq}`,
    hue: HISTORY_HUES[(snapshotSeq - 1) % HISTORY_HUES.length],
    visible: true,
    at: new Date(),
    rings: radar.value.rings.map((r) => ({ tempKey: r.temp.key, vals: r.vals.slice() })),
  })
}
function removeSnapshot(id) {
  history.value = history.value.filter((h) => h.id !== id)
}
const fmtTime = (d) => d.toLocaleTimeString('zh-CN', { hour12: false })

/* ───────────────────────── 雷达几何 ───────────────────────── */
const N_AXES = FAMILY.length
const SVG = { W: 620, H: 620, CX: 310, CY: 310, R_IN: 18, R_OUT: 208 }
const gridFracs = [0, 0.25, 0.5, 0.75, 1]

function angleOf(i) {
  return ((-90 + (360 / N_AXES) * i) * Math.PI) / 180
}
function pt(i, frac) {
  const r = SVG.R_IN + frac * (SVG.R_OUT - SVG.R_IN)
  return [SVG.CX + r * Math.cos(angleOf(i)), SVG.CY + r * Math.sin(angleOf(i))]
}
function gridRadius(f) {
  return SVG.R_IN + f * (SVG.R_OUT - SVG.R_IN)
}
function polyOf(vals) {
  return vals.map((v, i) => pt(i, Math.min(1, Math.max(0, v))).join(',')).join(' ')
}
function dashOfTemp(tempKey) {
  const t = TEMPS.find((x) => x.key === tempKey)
  return t?.dash || 'none'
}
const tempOf = (tempKey) => TEMPS.find((t) => t.key === tempKey) || TEMPS[0]

/* ───────────────────────── 轴/表格辅助 ───────────────────────── */
function measuredTemps(pred, base) {
  return TEMPS.filter((t) => pred[propKeyOf(base, t)] != null).map((t) => tempC(t))
}
function tempsInfoOf(base) {
  if (!result.value) return ''
  const list = measuredTemps(result.value.predicted, base)
  return `实测温度: ${list.join(' / ') || '—'}`
}
function familyRows(base) {
  // 表格只列模型真实输出的测量项（回退值仅用于雷达作图，不在此合成）
  const pred = result.value?.predicted || {}
  return TEMPS
    .map((t) => ({ tempKey: t.key, value: pred[propKeyOf(base, t)] }))
    .filter((r) => r.value != null)
}
function axisSummary(axisIdx) {
  const a = radar.value?.axes[axisIdx]
  if (!a) return ''
  const raw = a.vals.filter((v) => v != null)
  if (!raw.length) return ''
  return `预测区间 ${a.lo.toFixed(2)} ~ ${a.hi.toFixed(2)} ${a.unit}`
}
// 每轴刻度外端真实值：该轴满半径(100%)处对应的真实量值 + 单位。
// 径向统一为「越外越优」，故 high 族满半径 = 该轴 max(hi)；low 族满半径 = 该轴 min(lo)。
// 量值即 buildRadar 归一化所用的同一组 per-axis lo/hi 边界。
function axisOuterValue(a) {
  return a.dir === 'high' ? a.hi : a.lo
}
function scaleText(a) {
  const tip = axisOuterValue(a)
  const num = Math.abs(tip) >= 100 ? tip.toFixed(0) : tip.toFixed(1)
  return `≈${num} ${a.unit}`
}
const fmtVal = (v) => Number(v).toFixed(4)
function humanSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['xlsx', 'xls'].includes(ext)) return ext.toUpperCase()
  if (['doc', 'docx'].includes(ext)) return 'DOC'
  if (['pdf'].includes(ext)) return 'PDF'
  if (['png', 'jpg', 'jpeg'].includes(ext)) return ext.toUpperCase()
  if (['csv', 'txt'].includes(ext)) return ext.toUpperCase()
  return 'FILE'
}
function onDrop(ev) {
  const dropped = Array.from(ev.dataTransfer?.files || [])
  if (dropped.length) files.value.push(...dropped)
}
function onPick(ev) {
  const picked = Array.from(ev.target.files || [])
  if (picked.length) files.value.push(...picked)
  ev.target.value = ''
}
</script>

<style scoped>
/* ── page / card shells (shared chrome tokens from platform.css) ── */
.model1-page { color: #16324f; padding: var(--pl-gutter-y, 12px) var(--pl-gutter-x, 20px); }
.model1-page .page-header { margin-bottom: var(--pl-header-mb, 10px); }
.model1-page .page-header h1 { font-size: var(--pl-header-h1, 22px); }
.model1-page .back-btn { padding: var(--pl-back-pad, 7px 14px); font-size: var(--pl-back-fs, 12.5px); }
.m1-page .card {
  padding: var(--pl-card-pad, 12px 16px 14px);
  margin-bottom: var(--pl-card-mb, 12px);
  border-radius: var(--pl-card-radius, 12px);
}
.m1-page .card::before { height: 3px; border-radius: var(--pl-card-radius, 12px) var(--pl-card-radius, 12px) 0 0; }
.m1-page .card h2 { margin-bottom: 0; }

/* header */
.m1-header { align-items: flex-start; }
.m1-header__titles { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.m1-header__sub { font-size: 12px; color: #72879c; margin: -2px 0 0; }
.m1-header__chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.m1-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px;
  background: #eef4fb; border: 1px solid #dbe7f2;
  color: #2c4a63; font-size: 11.5px; font-weight: 650; line-height: 1.35;
}
.m1-chip--brand { background: linear-gradient(135deg, rgba(0,91,172,.1), rgba(10,163,216,.12)); border-color: rgba(0,91,172,.22); color: #005bac; }
.m1-chip--ok { background: #e7f7ef; border-color: #bfe9d3; color: #0e7a4c; }
.m1-chip--warn { background: #fdf3e4; border-color: #f0d9b4; color: #b26a14; }
.m1-chip--running { background: #f0f8ff; border-color: #cfe8f7; color: #0869ad; }
.m1-chip--idle { background: #f4f7fa; border-color: #e2e8ee; color: #7c8b98; }
.m1-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; background: currentColor; opacity: .85; }
.m1-dot--live { background: #22c55e; box-shadow: 0 0 0 0 rgba(34,197,94,.5); animation: m1-pulse 1.6s infinite; }
.m1-spin {
  width: 10px; height: 10px; border-radius: 50%; flex: none;
  border: 2px solid #9fc9e8; border-top-color: #0869ad;
  animation: m1-rot .8s linear infinite; display: inline-block;
}
@keyframes m1-rot { to { transform: rotate(360deg); } }
@keyframes m1-pulse {
  0% { box-shadow: 0 0 0 0 rgba(34,197,94,.45); }
  70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
  100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
}
.m1-sr {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}

/* layout — the two columns stretch to ONE row height (see .pl-eqcols); the
   column ceiling keeps a tall result body scrolling inside the column. */
.m1-layout { display: grid; grid-template-columns: minmax(340px, 384px) minmax(0, 1fr); gap: var(--pl-workbench-gap, 12px); }
.m1-left {
  gap: 8px; max-height: var(--pl-workbench-col-max, 760px);
  font-size: 12.5px; color: #2c4a63;
  background: #f3f7fb; border: 1px solid #e3ebf3; border-radius: 10px; padding: 10px;
}
.m1-right { gap: var(--pl-workbench-col-gap, 10px); max-height: var(--pl-workbench-col-max, 760px); }

/* left tabbar */
.m1-tabbar {
  display: flex; flex-wrap: wrap; gap: 4px;
  background: #f2f6fa; border: 1px solid #e3ebf3; border-radius: 9px; padding: 4px;
}
.m1-tab {
  font: inherit; font-size: 12px; font-weight: 700; color: #5b6b7c;
  background: transparent; border: none; border-radius: 7px;
  padding: 6px 9px; cursor: pointer; transition: all .15s ease; line-height: 1.2;
  flex: 1 1 auto;
}
.m1-tab:hover:not(.is-on) { color: #0869ad; background: #e9f2fa; }
.m1-tab.is-on { background: #fff; color: #005bac; box-shadow: 0 1px 5px rgba(23,50,77,.16); }
.m1-tab:focus-visible { outline: 2px solid #0aa3d8; outline-offset: 1px; }
.m1-body { display: flex; flex-direction: column; gap: 9px; min-height: var(--pl-workbench-body-min, 380px); }
/* the tool body itself is the scroll region: children keep their natural
   height so nothing gets squashed when the column is capped */
.m1-body > * { flex: none; }

.m1-sec-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.m1-sec-title { margin: 0; font-size: 13px; font-weight: 750; color: #17324d; letter-spacing: -.1px; }
.m1-sec-sub { margin: 1px 0 0; font-size: 11px; color: #72879c; line-height: 1.5; }
.m1-sec-badge {
  flex: none; font-size: 10.5px; font-weight: 700; color: #005bac;
  background: rgba(0,91,172,.08); border: 1px solid rgba(0,91,172,.18);
  padding: 2px 8px; border-radius: 999px; white-space: nowrap; margin-top: 1px;
}
.m1-sec-badge--amber { color: #b26a14; background: #fdf3e4; border-color: #f0d9b4; }
.m1-loading-txt { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #72879c; }
.m1-link-btn {
  font: inherit; font-size: 12px; font-weight: 650; color: #0869ad; background: none;
  border: none; padding: 2px 2px; cursor: pointer;
}
.m1-link-btn:hover:not(:disabled) { color: #005bac; text-decoration: underline; }
.m1-link-btn:disabled { opacity: .5; cursor: not-allowed; }

/* adder + autocomplete */
.m1-adder { position: relative; }
.m1-adder__field { display: flex; gap: 6px; }
.m1-textinput {
  font: inherit; flex: 1 1 auto; min-width: 0; font-size: 12px; color: #17324d;
  background: #fff; border: 1px solid #d5e0ea; border-radius: 7px; padding: 6px 9px;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.m1-textinput:focus { outline: none; border-color: #0aa3d8; box-shadow: 0 0 0 3px rgba(10,163,216,.14); }
.m1-adder__add {
  flex: none; font: inherit; font-size: 11.5px; font-weight: 700; color: #005bac;
  background: #eef6fd; border: 1px solid #bcd9ee; border-radius: 7px; padding: 6px 10px; cursor: pointer;
}
.m1-adder__add:hover:not(:disabled) { background: #e0f0fc; }
.m1-adder__add:disabled { opacity: .5; cursor: not-allowed; }
.m1-matches {
  position: absolute; z-index: 30; left: 0; right: 0; top: calc(100% + 3px);
  margin: 0; padding: 4px; list-style: none; max-height: 210px; overflow: auto;
  background: #fff; border: 1px solid #d5e0ea; border-radius: 8px;
  box-shadow: 0 10px 24px rgba(15,55,88,.16);
}
.m1-match {
  display: flex; justify-content: space-between; gap: 8px; align-items: center;
  padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 12px; color: #2c4a63;
}
.m1-match.is-cur { background: #eaf4fc; color: #005bac; }
.m1-match--empty { cursor: default; color: #98a6b4; }
.m1-match__idx { font-size: 10px; color: #9aa8b7; font-weight: 650; flex: none; }
.m1-hint-txt { margin: 0; font-size: 11px; color: #72879c; }

/* rows */
.m1-rows { display: flex; flex-direction: column; gap: 5px; max-height: 236px; overflow: auto; padding-right: 2px; }
.m1-row {
  display: grid; grid-template-columns: 22px minmax(0, 1fr) auto 14px 20px;
  gap: 7px; align-items: center;
  padding: 5px 7px; border: 1px solid #e5ecf2; border-radius: 8px; background: #fff; line-height: 1.2;
}
.m1-row__idx {
  font-size: 9.5px; font-weight: 750; color: #9aa8b7; text-align: right;
  background: #f2f6fa; border-radius: 4px; padding: 1px 3px;
}
.m1-row__name { font-size: 12px; font-weight: 650; color: #17324d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m1-row__pct { font-size: 11px; color: #72879c; }
.m1-rows-empty {
  font-size: 12px; color: #72879c; background: #f6f9fc; border: 1px dashed #cbd9e6;
  border-radius: 9px; padding: 12px 10px; display: flex; gap: 4px; align-items: center; flex-wrap: wrap;
}
.m1-stepper { display: flex; align-items: center; gap: 2px; }
.m1-step-btn {
  font: inherit; width: 20px; height: 22px; line-height: 1; flex: none;
  border: 1px solid #d5e0ea; background: #fff; color: #2c4a63;
  border-radius: 5px; cursor: pointer; font-size: 13px; padding: 0;
}
.m1-step-btn:hover:not(:disabled) { border-color: #0aa3d8; color: #0869ad; }
.m1-step-btn:disabled { opacity: .45; cursor: not-allowed; }
.m1-step-val {
  font: inherit; font-size: 11.5px; font-weight: 650; color: #17324d; text-align: center;
  width: 52px; padding: 3px 1px; border: 1px solid #d5e0ea; border-radius: 5px; background: #fff;
  -moz-appearance: textfield;
}
.m1-step-val::-webkit-outer-spin-button, .m1-step-val::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.m1-remove {
  font: inherit; width: 20px; height: 20px; border-radius: 6px; cursor: pointer; flex: none;
  border: 1px solid transparent; background: transparent; color: #a3b0bd; font-size: 11px; line-height: 1;
}
.m1-remove:hover:not(:disabled) { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
.m1-remove:disabled { opacity: .4; cursor: not-allowed; }

/* footer + actions */
.m1-foot { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }
.m1-sumline { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.m1-sumlabel { font-size: 11px; font-weight: 650; color: #72879c; }
.m1-sumval { font-size: 15px; font-weight: 800; }
.m1-sumval.is-ok { color: #0e7a4c; }
.m1-sumval.is-low { color: #b26a14; }
.m1-sumval.is-high { color: #c0392b; }
.m1-sumhint { font-size: 10.5px; color: #8a9aa9; }
.m1-actions { display: flex; gap: 8px; align-items: center; }
.m1-actions .m1-run-btn { margin-left: auto; }
.m1-ghost-btn {
  font: inherit; font-size: 12px; font-weight: 650; color: #5b6b7c;
  background: #fff; border: 1px solid #d9e3ec; border-radius: 7px; padding: 7px 12px; cursor: pointer;
  transition: all .15s ease;
}
.m1-ghost-btn:hover:not(:disabled) { border-color: #b7c6d4; color: #17324d; }
.m1-ghost-btn:disabled { opacity: .5; cursor: not-allowed; }
.m1-ghost-btn--sm { font-size: 11.5px; padding: 5px 10px; }
.m1-run-btn {
  font: inherit; font-size: 13px; font-weight: 750; color: #fff;
  background: linear-gradient(135deg, #005bac 0%, #0869ad 55%, #0aa3d8 130%);
  border: none; border-radius: 8px; padding: 8px 22px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  box-shadow: 0 8px 22px rgba(8,105,173,.28);
  transition: transform .16s ease, box-shadow .16s ease;
}
.m1-run-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(8,105,173,.34); }
.m1-run-btn:disabled { opacity: .65; cursor: not-allowed; transform: none; }
.m1-run__spinner { width: 13px; height: 13px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,.35); border-top-color: #fff; animation: m1-rot .8s linear infinite; display: inline-block; flex: none; }
.m1-errorbar {
  margin: 0; font-size: 12px; color: #c0392b; background: #fef0ee;
  border: 1px solid #f5c6c0; border-radius: 7px; padding: 7px 10px; line-height: 1.5;
}

/* paste (free-text) */
.m1-paste { border: 1px solid #e5ecf2; border-radius: 9px; background: #fbfdff; }
.m1-paste summary {
  cursor: pointer; font-size: 12px; font-weight: 700; color: #2c4a63;
  padding: 7px 10px; user-select: none;
}
.m1-paste[open] summary { border-bottom: 1px solid #eef2f6; }
.m1-paste__hint { margin: 8px 10px 0; font-size: 11px; color: #72879c; line-height: 1.6; }
.m1-paste__hint code { background: #eef2f6; border-radius: 4px; padding: 0 4px; color: #17324d; }
.m1-textarea {
  display: block; margin: 8px 10px 0; width: calc(100% - 20px); box-sizing: border-box;
  font: inherit; font-size: 11.5px; color: #17324d; line-height: 1.6;
  border: 1px solid #d5e0ea; border-radius: 7px; padding: 7px 9px; resize: vertical; background: #fff;
}
.m1-textarea:focus { outline: none; border-color: #0aa3d8; box-shadow: 0 0 0 3px rgba(10,163,216,.14); }
.m1-paste__bar { display: flex; gap: 8px; padding: 8px 10px 10px; }
.m1-paste__outcome { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 10px 10px; }

/* status tab */
.m1-status-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.m1-stat {
  background: #fff; border: 1px solid #e5ecf2; border-radius: 8px;
  padding: 7px 9px; display: flex; flex-direction: column; gap: 2px;
}
.m1-stat__k { font-size: 10.5px; color: #7c8b98; font-weight: 600; }
.m1-stat__v { font-size: 15px; font-weight: 800; color: #17324d; }
.m1-subtitle { margin: 2px 0 -2px; font-size: 11.5px; font-weight: 750; color: #17324d; }
.m1-kvlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; max-height: 150px; overflow: auto; }
.m1-kvlist li {
  display: flex; justify-content: space-between; gap: 10px; align-items: center;
  font-size: 11.5px; padding: 4px 8px; background: #fff;
  border: 1px solid #eef2f6; border-radius: 6px;
}
.m1-kvlist li.m1-kvlist--warn { background: #fdf6ec; border-color: #f3e0c2; }
.m1-kvlist__k { color: #2c4a63; font-weight: 650; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m1-kvlist__v { color: #17324d; font-weight: 700; flex: none; font-size: 11px; }
.m1-kvlist--warn .m1-kvlist__v { color: #b26a14; font-weight: 650; }
.m1-util-row { display: flex; flex-wrap: wrap; gap: 6px; }
.m1-inline-hint { margin: 0; font-size: 11.5px; color: #8a9aa9; line-height: 1.6; }

/* upload tab */
.m1-dropzone {
  border: 1.5px dashed #bcd3e6; border-radius: 10px; background: #f6fafd;
  padding: 20px 12px; text-align: center; cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}
.m1-dropzone:hover, .m1-dropzone:focus-visible { border-color: #0aa3d8; background: #eef8fe; outline: none; }
.m1-dropzone__main { font-size: 13px; font-weight: 700; color: #2c4a63; }
.m1-dropzone__sub { margin-top: 3px; font-size: 10.5px; color: #8a9aa9; }
.m1-note { margin: 0; font-size: 11px; color: #72879c; line-height: 1.65; }
.m1-filelist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 170px; overflow: auto; }
.m1-file {
  display: grid; grid-template-columns: minmax(30px, auto) minmax(0, 1fr) auto 20px; gap: 8px; align-items: center;
  padding: 5px 8px; background: #fff; border: 1px solid #eef2f6; border-radius: 7px; font-size: 11.5px;
}
.m1-file__name { color: #2c4a63; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m1-file__size { color: #98a6b4; font-size: 10.5px; flex: none; }
.m1-file__icon {
  font-size: 8.5px; font-weight: 800; letter-spacing: .2px; text-align: center;
  color: #0869ad; background: #e8f2fb; border: 1px solid #c7ddef; border-radius: 4px;
  padding: 1px 3px; line-height: 1.5; flex: none; min-width: 0;
}
.m1-placeholder-tile {
  border: 1px solid #eef2f6; border-radius: 9px; background: repeating-linear-gradient(135deg, #fafcfe, #fafcfe 10px, #f4f8fb 10px, #f4f8fb 20px);
  padding: 14px 12px; display: flex; flex-direction: column; gap: 4px;
  font-size: 12.5px; font-weight: 700; color: #5b6b7c;
}
.m1-placeholder-tile__sub { font-size: 11px; font-weight: 500; color: #8a9aa9; line-height: 1.6; }

/* right header row (chip band — geometry shared via .pl-workbench-head) */
.m1-rhead { padding: 0 2px; }
.m1-rhead__status { margin-left: auto; }

/* right panels */
.m1-panel { min-width: 0; min-height: 0; }
.m1-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.m1-panel-title { font-size: 15px; font-weight: 800; color: #17324d; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.m1-panel-sub { margin: 2px 0 0; font-size: 11px; color: #72879c; line-height: 1.6; }
.m1-panel-sub-inline { font-size: 11px; font-weight: 600; color: #0e7a4c; background: #e7f7ef; border: 1px solid #bfe9d3; border-radius: 999px; padding: 1px 8px; }
.m1-chart-actions { display: flex; gap: 6px; align-items: center; flex: none; }

/* right workbench sub-tabs (segmented pills, distinct from LEFT tool tabs) */
.m1-workbench { display: flex; flex-direction: column; gap: var(--pl-workbench-col-gap, 10px); min-height: 0; }
/* the workbench panel is the column's last flex child: no card bottom margin,
   so its bottom edge sits flush with the tool column */
.m1-page .m1-workbench {
  margin-bottom: 0;
  padding: var(--pl-workbench-pad, 12px 14px 14px);
  border-radius: var(--pl-workbench-radius, 11px);
}
.m1-subtabs {
  display: inline-flex; align-self: flex-start; flex-wrap: wrap; gap: 2px;
  background: #eef4fb; border: 1px solid #d9e6f2; border-radius: 999px; padding: 3px;
}
.m1-subtab {
  font: inherit; font-size: 11.5px; font-weight: 700; color: #5b6b7c;
  background: transparent; border: none; border-radius: 999px;
  padding: 5px 14px; cursor: pointer; transition: all .16s ease; line-height: 1.25;
  white-space: nowrap;
}
.m1-subtab:hover:not(.is-on) { color: #0869ad; background: rgba(255,255,255,.6); }
.m1-subtab.is-on {
  color: #fff; background: linear-gradient(135deg, #005bac, #0aa3d8);
  box-shadow: 0 2px 8px rgba(8,105,173,.30);
}
.m1-subtab:focus-visible { outline: 2px solid #0aa3d8; outline-offset: 1px; }
.m1-subpanel {
  display: flex; flex-direction: column;
  min-width: 0; min-height: var(--pl-workbench-body-min, 380px);
}
/* sub-tab body scrolls as a whole — only the empty state grows to centre */
.m1-subpanel > *:not(.m1-empty) { flex: none; }

/* empty state */
.m1-empty { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px; padding: 30px 20px 22px; }
.m1-empty__glyph { opacity: .8; margin-bottom: 4px; }
.m1-empty__title { margin: 0; font-size: 15px; font-weight: 800; color: #2c4a63; }
.m1-empty__desc { margin: 0; max-width: 560px; font-size: 12px; color: #72879c; line-height: 1.8; }
.m1-empty__desc strong { color: #0869ad; }
.m1-empty--mini { padding: 14px 10px; }

/* chart layout */
.m1-chartgrid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(190px, .8fr); gap: 6px 16px; align-items: start; }
.m1-svgwrap { min-width: 0; }
.m1-radar { width: 100%; height: auto; display: block; }
.m1-axis-label { font-size: 12.5px; font-weight: 750; fill: #1d3a57; }
.m1-axis-dir { fill: #005bac; font-size: 12px; }
.m1-axis-unit { font-size: 9.5px; fill: #8a9aa9; }
.m1-axis-scale {
  font-size: 10px; font-weight: 700; fill: #005bac;
  paint-order: stroke; stroke: #ffffff; stroke-width: 3px; stroke-linejoin: round;
}
.m1-radar-caption { font-size: 10px; fill: #9aa8b7; }
.m1-svg-note { margin: 6px 0 0; font-size: 10.5px; color: #8a9aa9; line-height: 1.65; }
.m1-history-layer polygon { pointer-events: none; }

/* side legend + history */
.m1-side { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding-top: 4px; }
.m1-side-title { margin: 0; font-size: 12px; font-weight: 800; color: #17324d; display: flex; align-items: center; gap: 6px; }
.m1-side-count {
  font-size: 10px; font-weight: 800; color: #005bac; background: rgba(0,91,172,.08);
  border-radius: 999px; padding: 0 7px; line-height: 16px;
}
.m1-side-row { display: flex; flex-direction: column; gap: 2px; }
.m1-side-row__hint { font-size: 10px; color: #98a6b4; line-height: 1.5; }
.m1-side-divider { height: 1px; background: #eef2f6; }
.m1-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.m1-legend__item { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: #2c4a63; }
.m1-legend__label { font-weight: 650; }
.m1-legend__style { margin-left: auto; font-size: 10px; color: #98a6b4; }
.m1-sw {
  width: 20px; height: 0; flex: none; border-top-width: 2.5px; border-top-style: solid;
  border-top-color: #98a6b4; display: inline-block;
}
.m1-hlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 190px; overflow: auto; }
.m1-hitem {
  display: flex; align-items: center; gap: 8px;
  background: #fff; border: 1px solid #eef2f6; border-radius: 7px; padding: 4px 8px;
}
.m1-hitem.is-off { opacity: .45; }
.m1-hitem__toggle { display: flex; align-items: center; gap: 7px; cursor: pointer; min-width: 0; }
.m1-hitem__name { font-size: 11.5px; font-weight: 700; color: #17324d; }
.m1-hitem__at { margin-left: auto; font-size: 10px; color: #98a6b4; flex: none; }
.m1-hitem input:focus-visible + .m1-sw { outline: 2px solid #0aa3d8; }

/* axis annotation strip */
.m1-axisnote {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 5px 14px;
  margin-top: 8px; padding-top: 8px; border-top: 1px solid #eef2f6;
}
.m1-axisnote__item { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; font-size: 11px; min-width: 0; }
.m1-axisnote__name { font-weight: 750; color: #1d3a57; }
.m1-axisnote__tag { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 0 5px; }
.m1-axisnote__tag.is-high { color: #005bac; background: rgba(0,91,172,.08); }
.m1-axisnote__tag.is-low { color: #b26a14; background: #fdf3e4; }
.m1-axisnote__temps { color: #8a9aa9; font-size: 10px; }
.m1-axisnote__val { margin-left: auto; color: #5b6b7c; font-size: 10px; }

/* numbers table */
.m1-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.m1-table th {
  text-align: left; font-size: 10.5px; font-weight: 750; color: #7c8b98; text-transform: none;
  padding: 4px 8px; border-bottom: 1px solid #e5ecf2; background: #f8fafc;
}
.m1-th--prop { width: 34%; }
.m1-th--val { text-align: right; }
.m1-tfam td { padding: 7px 8px 3px; border-bottom: none; }
.m1-tfam__name { font-size: 12.5px; font-weight: 800; color: #17324d; margin-right: 8px; }
.m1-tfam__dir { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 0 5px; margin-right: 8px; }
.m1-tfam__dir.is-high { color: #005bac; background: rgba(0,91,172,.08); }
.m1-tfam__dir.is-low { color: #b26a14; background: #fdf3e4; }
.m1-tfam__temps { font-size: 10px; color: #8a9aa9; }
.m1-trow td { padding: 2.5px 8px; color: #2c4a63; }
.m1-trow__spacer { width: 14px; }
.m1-tdot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: baseline; }
.m1-tval { text-align: right; font-weight: 800; color: #17324d; font-variant-numeric: tabular-nums; }
.m1-tunit { color: #8a9aa9; font-size: 10.5px; }
.m1-tfallback { color: #b26a14; font-size: 10px; margin-left: 3px; }
.m1-table-note { margin: 8px 0 0; font-size: 10.5px; color: #8a9aa9; line-height: 1.65; }

/* responsive */
@media (max-width: 1180px) {
  .m1-layout { grid-template-columns: minmax(320px, 348px) minmax(0, 1fr); }
}
@media (max-width: 960px) {
  .m1-layout { grid-template-columns: 1fr; }
  /* stacked: heights go back to content-driven, no column ceiling */
  .m1-left, .m1-right { max-height: none; }
  .m1-chartgrid { grid-template-columns: 1fr; }
  .m1-side { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); align-items: start; }
}
@media (max-width: 720px) {
  .model1-page { padding: 10px 12px; }
  .m1-status-grid { grid-template-columns: 1fr; }
  .m1-chart-actions { width: 100%; }
}
</style>
