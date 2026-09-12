<template>
  <div class="platform-page model1-page m1-page">
    <!-- ════ Compact page header ════ -->
    <div class="page-header m1-header">
      <div class="m1-header__titles">
        <h1>性能预测</h1>
        <div class="m1-header__sub">配方组成 X_comp → 烧成性能 · 工况环雷达对比</div>
        <div class="m1-header__chips">
          <span class="m1-chip m1-chip--brand"><i class="m1-dot m1-dot--live" />属性预测引擎 · {{ variant || '—' }}</span>
          <span class="m1-chip">{{ propertiesMeta.length || '—' }} 项性能属性</span>
          <span class="m1-chip">{{ conditionOptions.length || '—' }} 个训练工况</span>
          <span v-if="metadataLoading" class="m1-chip m1-chip--running"><i class="m1-spin" /> 元数据加载中…</span>
          <span v-else-if="metadataError" class="m1-chip m1-chip--warn">元数据不可用</span>
          <span v-if="predicting" class="m1-chip m1-chip--running"><i class="m1-spin" /> 预测中…</span>
          <span v-else-if="result" class="m1-chip m1-chip--ok">最近预测 · {{ predictions.length }} 条 · {{ resultAt }}</span>
          <span v-else class="m1-chip m1-chip--idle">等待预测</span>
        </div>
      </div>
      <a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a>
    </div>

    <!-- ════ Two-panel shell: LEFT config / RIGHT results ════ -->
    <div class="card m1-shell m1-layout pl-eqcols">
      <!-- ── LEFT: stacked config ── -->
      <aside class="m1-left pl-eqcol" aria-label="性能预测 · 输入配置">
        <div class="m1-body pl-eqfill pl-scroll">
          <div class="m1-sec-head">
            <div>
              <h3 class="m1-sec-title">输入配置</h3>
              <p class="m1-sec-sub">X_comp 组分 + X_global 全局工艺 → /api/v1/predict/simple</p>
            </div>
            <button v-if="metadataError" type="button" class="m1-link-btn" @click="loadMetadata">重试元数据</button>
          </div>

          <!-- ── 组分 X_comp ── -->
          <section class="m1-sec" aria-labelledby="m1-sec-comp">
            <div class="m1-sec-head">
              <div>
                <h4 id="m1-sec-comp" class="m1-sec-title">组分 X_comp</h4>
                <p class="m1-sec-sub">
                  每行 [material_id, ratio_pct]<template v-if="hasMaterials"> · 原料 {{ materialOptions.length }} 项可选（名称为 base 名）</template>
                </p>
              </div>
              <span class="m1-sec-badge">组分数 {{ validRows.length }} · Σ {{ sumRatioText }}%</span>
            </div>

            <div class="m1-rows" role="group" aria-label="组分列表">
              <div class="m1-rows__head" aria-hidden="true">
                <span>#</span>
                <span>原料 · material_id</span>
                <span>ratio_pct %</span>
                <span />
              </div>
              <div v-for="(r, i) in rows" :key="r.uid" class="m1-row" :class="{ 'is-bad': rowInvalid(r) }">
                <span class="m1-row__no" aria-hidden="true">{{ i + 1 }}</span>
                <!-- 原料列表可用 → 名称感知下拉；加载失败 → 回退为原始编码输入 -->
                <select v-if="hasMaterials" class="m1-input m1-select" v-model="r.material_id"
                  :aria-label="`第 ${i + 1} 行原料`" :aria-invalid="rowInvalid(r) || undefined"
                  :title="rowInvalid(r) ? '请选择原料，ratio_pct 需为 >0 的数值' : materialLabel(r.material_id)">
                  <option value="" disabled>选择原料…</option>
                  <option v-for="m in materialOptions" :key="m.id" :value="m.id">{{ m.label }}</option>
                  <option v-if="r.material_id && !materialIds.has(String(r.material_id))" :value="r.material_id">
                    {{ r.material_id }}（自定义编码）
                  </option>
                </select>
                <input v-else class="m1-input m1-input--id" type="number" step="1" inputmode="numeric"
                  v-model="r.material_id" :aria-label="`第 ${i + 1} 行 material_id`" placeholder="61"
                  :aria-invalid="rowInvalid(r) || undefined"
                  :title="rowInvalid(r) ? 'material_id 需为数值，ratio_pct 需为 >0 的数值' : ''" />
                <div class="m1-input-wrap">
                  <input class="m1-input m1-input--pct" type="number" step="any" min="0" inputmode="decimal"
                    v-model="r.ratio_pct" :aria-label="`第 ${i + 1} 行 ratio_pct 百分比`" placeholder="70"
                    :aria-invalid="rowInvalid(r) || undefined" />
                  <span class="m1-input-suffix" aria-hidden="true">%</span>
                </div>
                <button type="button" class="m1-remove" :aria-label="`移除第 ${i + 1} 行组分`" title="移除"
                  @click="removeRow(i)">✕</button>
              </div>
              <p v-if="!rows.length" class="m1-rows-empty">尚未添加组分 —— 点击「＋ 添加组分」或下方「载入示例」。</p>
            </div>

            <div class="m1-inline-actions">
              <button type="button" class="m1-ghost-btn m1-ghost-btn--sm" @click="addRow()">＋ 添加组分</button>
              <span class="m1-inline-hint">下拉显示「名称 (编码)」，提交的仍是 material_id。</span>
            </div>
            <p v-if="materialsError" class="m1-hint-txt m1-hint-txt--warn">
              原料列表不可用（{{ materialsError }}）—— 已回退为手工输入 material_id 编码，不影响预测。
              <button type="button" class="m1-link-btn" @click="loadMaterials">重试</button>
            </p>
            <p v-else-if="materialsLoading" class="m1-hint-txt"><i class="m1-spin" /> 原料列表加载中…</p>
            <p class="m1-hint-txt">
              允许<b>短行</b>：仅传 [material_id, ratio_pct]，服务端按 component_feature_names（51 列）自动展开补齐。
              建议 Σ ratio_pct ≈ 100%。
            </p>
          </section>

          <!-- ── 全局 X_global ── -->
          <section class="m1-sec" aria-labelledby="m1-sec-glob">
            <div class="m1-sec-head">
              <div>
                <h4 id="m1-sec-glob" class="m1-sec-title">全局 X_global</h4>
                <p class="m1-sec-sub">顺序同 global_feature_names（{{ globalNames.join(' / ') }}）· 全部留空 = 不下发（服务端默认）</p>
              </div>
            </div>
            <div class="m1-globals">
              <label v-for="(name, i) in globalNames" :key="name" class="m1-gfield">
                <span class="m1-gfield__label">{{ globalLabel(name, i) }}</span>
                <input class="m1-input" type="number" step="any" inputmode="decimal"
                  v-model="globalValues[i]" :aria-label="globalLabel(name, i)"
                  :placeholder="GLOBAL_PLACEHOLDERS[i] || ''" />
              </label>
            </div>
          </section>

          <!-- ── 工况 conditions ── -->
          <section class="m1-sec" aria-labelledby="m1-sec-cond">
            <div class="m1-sec-head">
              <div>
                <h4 id="m1-sec-cond" class="m1-sec-title">预测工况 conditions</h4>
                <p class="m1-sec-sub">多选；不选 = 全部已训练工况。</p>
              </div>
              <span class="m1-sec-badge">{{ selectedConditions.length ? `已选 ${selectedConditions.length}` : '全部' }}</span>
            </div>
            <div v-if="conditionOptions.length" class="m1-chips" role="group" aria-label="预测工况多选">
              <button v-for="c in conditionOptions" :key="c" type="button" class="m1-chipbtn"
                :class="{ 'is-on': selectedConditions.includes(c) }" :aria-pressed="selectedConditions.includes(c)"
                @click="toggle(selectedConditions, c)">{{ c }}</button>
            </div>
            <p v-else class="m1-inline-hint">{{ metadataLoading ? '工况列表加载中…' : '暂无工况（元数据不可用时默认全部）。' }}</p>
          </section>

          <!-- ── 属性 properties ── -->
          <section class="m1-sec" aria-labelledby="m1-sec-prop">
            <div class="m1-sec-head">
              <div>
                <h4 id="m1-sec-prop" class="m1-sec-title">性能属性 properties</h4>
                <p class="m1-sec-sub">多选；不选 = 全部属性。</p>
              </div>
              <span class="m1-sec-badge">{{ selectedProperties.length ? `已选 ${selectedProperties.length}` : '全部' }}</span>
            </div>
            <div v-if="propertiesMeta.length" class="m1-chips" role="group" aria-label="预测属性多选">
              <button v-for="p in propertiesMeta" :key="p.property" type="button" class="m1-chipbtn"
                :class="{ 'is-on': selectedProperties.includes(p.property) }"
                :aria-pressed="selectedProperties.includes(p.property)"
                :title="`${p.property} · ${p.unit || '—'}`"
                @click="toggle(selectedProperties, p.property)">
                {{ p.property_name_zh }}<span class="m1-chipbtn__k">{{ p.property }}</span>
              </button>
            </div>
            <p v-else class="m1-inline-hint">{{ metadataLoading ? '属性列表加载中…' : '暂无属性（元数据不可用时默认全部）。' }}</p>
          </section>

          <!-- ── actions ── -->
          <div class="m1-foot">
            <div class="m1-actions">
              <button type="button" class="m1-ghost-btn" @click="resetAll">重置</button>
              <button type="button" class="m1-ghost-btn" title="填入示例：X_comp [[61,70],[42,30]]、X_global [3.6,10,0]、工况 110℃/1500℃"
                @click="loadExample">载入示例</button>
              <button type="button" class="m1-run-btn" :disabled="predicting || !validRows.length" @click="runPrediction">
                <span v-if="predicting" class="m1-run__spinner" aria-hidden="true" />
                {{ predicting ? '预测中…' : '预测' }}
              </button>
            </div>
            <p v-if="predictError" class="m1-errorbar" role="alert">{{ predictError }}</p>
            <p v-else-if="!validRows.length && rows.length" class="m1-hint-txt m1-hint-txt--warn">
              每一行都需要数值 material_id 与 &gt;0 的 ratio_pct 才能预测。
            </p>
          </div>
        </div>
      </aside>

      <!-- ── RIGHT: results workbench ── -->
      <section class="m1-right pl-eqcol" aria-label="预测结果工作台">
        <div class="m1-rhead pl-workbench-head">
          <span class="m1-chip m1-chip--brand">模型变体 · {{ result?.variant || variant || '—' }}</span>
          <span v-if="predictions.length" class="m1-chip">{{ predictions.length }} 条预测</span>
          <span v-if="selectedConditions.length" class="m1-chip">工况 {{ selectedConditions.join(' / ') }}</span>
          <span v-else-if="predictions.length" class="m1-chip">工况 全部</span>
          <span v-if="warnings.length" class="m1-chip m1-chip--warn">警告 {{ warnings.length }}</span>
          <span class="m1-rhead__status m1-chip" :class="result ? 'm1-chip--ok' : 'm1-chip--idle'">
            {{ result ? `最近 · ${resultAt}` : '尚未预测' }}
          </span>
        </div>

        <!-- ── RIGHT workbench: 预测结果 / 雷达图 ── -->
        <div class="card m1-panel m1-workbench pl-eqfill">
          <div class="m1-subtabs" role="tablist" aria-label="预测结果子页签">
            <button v-for="rt in RIGHT_TABS" :key="rt.id" type="button" role="tab"
              class="m1-subtab" :class="{ 'is-on': rightTab === rt.id }"
              :aria-selected="rightTab === rt.id"
              :aria-controls="`m1-subpanel-${rt.id}`"
              :id="`m1-subtab-${rt.id}`"
              @click="rightTab = rt.id">{{ rt.label }}</button>
          </div>

          <!-- SUB-TAB · 预测结果 (default) -->
          <section v-show="rightTab === 'table'" id="m1-subpanel-table" role="tabpanel"
            aria-labelledby="m1-subtab-table" class="m1-subpanel pl-eqfill pl-scroll">
            <div class="m1-panel-head">
              <div>
                <h2 class="m1-panel-title">预测结果
                  <span v-if="result" class="m1-panel-sub-inline">request_id {{ result.request_id || '—' }}</span>
                </h2>
                <p class="m1-panel-sub">按属性分组 · 每行 = 一个「属性 × 工况」的模型输出</p>
              </div>
              <div class="m1-chart-actions">
                <span v-if="result" class="m1-chip">variant {{ result.variant || '—' }}</span>
                <span v-if="predictions.length" class="m1-chip">{{ predictions.length }} 条</span>
                <span v-if="warnings.length" class="m1-chip m1-chip--warn">警告 {{ warnings.length }}</span>
              </div>
            </div>

            <div v-if="predicting" class="m1-loading">
              <i class="m1-spin m1-spin--lg" aria-hidden="true" />
              <p>正在调用预测服务（/api/v1/predict/simple）…</p>
            </div>

            <div v-else-if="!predictions.length" class="m1-empty">
              <div class="m1-empty__glyph" aria-hidden="true">
                <svg viewBox="0 0 120 120" width="120" height="120" fill="none">
                  <circle cx="60" cy="60" r="46" stroke="#dbe7f2" stroke-width="1" stroke-dasharray="4 4" />
                  <polygon points="60,18 98,44 84,92 36,92 22,44" stroke="#c9d9e8" stroke-width="1.4" fill="none" />
                  <text x="60" y="66" text-anchor="middle" font-size="15" fill="#c9d9e8" font-weight="700">—</text>
                </svg>
              </div>
              <h3 class="m1-empty__title">预测结果将在此展示…</h3>
              <p class="m1-empty__desc">
                在左侧填入 <strong>X_comp 组分</strong> 与 <strong>X_global 全局工艺</strong>，
                选择工况 / 属性后点击 <strong>预测</strong>。返回结果按属性分组列出（中文名 / 工况 / 预测值 / 单位 / 模型）。
              </p>
            </div>

            <template v-else>
              <div v-if="warnings.length" class="m1-warnbox" role="status">
                <span class="m1-warnbox__title">{{ warnings.length }} 条警告</span>
                <ul>
                  <li v-for="(w, i) in warnings" :key="`${w.code || 'w'}-${i}`">
                    <code>{{ w.code || 'WARNING' }}</code> {{ w.message }}
                  </li>
                </ul>
              </div>

              <table class="m1-table">
                <caption class="m1-sr">预测结果：按属性分组的属性、工况、预测值、单位与模型信息</caption>
                <thead>
                  <tr>
                    <th>工况</th>
                    <th class="m1-th--val">预测值</th>
                    <th>单位</th>
                    <th class="m1-th--model">模型 · 特征数</th>
                  </tr>
                </thead>
                <tbody v-for="g in groups" :key="g.property">
                  <tr class="m1-tprop">
                    <td colspan="4">
                      <span class="m1-tprop__name">{{ g.nameZh }}</span>
                      <span class="m1-tprop__key">{{ g.property }}</span>
                      <span class="m1-tprop__unit">{{ g.unit || '—' }}</span>
                    </td>
                  </tr>
                  <tr v-for="p in g.rows" :key="`${p.property}-${p.condition}`" class="m1-trow">
                    <td><span class="m1-tdot" :style="{ background: condColor(p.condition) }" />{{ p.condition }}</td>
                    <td class="m1-tval">{{ fmtVal(p.value) }}</td>
                    <td class="m1-tunit">{{ p.unit || g.unit || '—' }}</td>
                    <td class="m1-tmodel">
                      <span class="m1-tmodel__name">{{ p.model?.name || '—' }}</span>
                      <span class="m1-tmodel__meta">
                        {{ p.model?.variant || '—' }}<template v-if="p.model?.version"> · {{ p.model.version }}</template>
                        · 特征 {{ p.input_feature_count ?? '—' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>
          </section>

          <!-- SUB-TAB · 雷达图 -->
          <section v-show="rightTab === 'radar'" id="m1-subpanel-radar" role="tabpanel"
            aria-labelledby="m1-subtab-radar" class="m1-subpanel pl-eqfill pl-scroll">
            <div class="m1-panel-head">
              <div>
                <h2 class="m1-panel-title">雷达图</h2>
                <p class="m1-panel-sub">轴 = 属性（各自单位）· 环 = 工况 · 每轴按该属性在各工况间 min~max 归一化，实/虚线交替区分重叠环</p>
              </div>
              <div class="m1-chart-actions">
                <span v-if="radar" class="m1-chip">{{ radar.axes.length }} 轴 · {{ radar.rings.length }} 环</span>
              </div>
            </div>

            <div v-if="predicting" class="m1-loading">
              <i class="m1-spin m1-spin--lg" aria-hidden="true" />
              <p>正在计算预测结果…</p>
            </div>

            <div v-else-if="!radar" class="m1-empty">
              <div class="m1-empty__glyph" aria-hidden="true">
                <svg viewBox="0 0 120 120" width="120" height="120" fill="none">
                  <circle cx="60" cy="60" r="46" stroke="#dbe7f2" stroke-width="1" stroke-dasharray="4 4" />
                  <circle cx="60" cy="60" r="30" stroke="#dbe7f2" stroke-width="1" stroke-dasharray="4 4" />
                  <polygon points="60,16 99,42 85,92 35,92 21,42" stroke="#c9d9e8" stroke-width="1.4" fill="none" />
                </svg>
              </div>
              <h3 class="m1-empty__title">预测结果将在此展示…</h3>
              <p class="m1-empty__desc">
                运行一次预测后，返回的属性（如 体积密度 / 常温抗折强度 / 常温耐压强度 / 线变化率）将作为雷达轴，
                每个工况为一圈叠加对比。
              </p>
            </div>

            <template v-else>
              <div class="m1-chartgrid">
                <div class="m1-svgwrap">
                  <svg :viewBox="`0 0 ${SVG.W} ${SVG.H}`" class="m1-radar" role="img" :aria-label="radarAriaLabel">
                    <!-- grid rings -->
                    <polygon v-for="g in gridFracs" :key="`grid-${g}`" :points="polyOf(radar.axes.map(() => g))"
                      fill="none" stroke="#e4ebf2" stroke-width="1" />
                    <!-- spokes -->
                    <line v-for="(a, i) in radar.axes" :key="`spoke-${i}`"
                      :x1="pt(i, 0)[0]" :y1="pt(i, 0)[1]" :x2="pt(i, 1)[0]" :y2="pt(i, 1)[1]"
                      stroke="#e4ebf2" stroke-width="1" />
                    <!-- axis labels: 中文名 + 单位 -->
                    <g v-for="(a, i) in radar.axes" :key="`lbl-${i}`">
                      <text class="m1-axis-label" :text-anchor="labelPos(i).anchor"
                        :x="labelPos(i).x" :y="labelPos(i).y" dy="-1">{{ a.nameZh }}</text>
                      <text class="m1-axis-unit" :text-anchor="labelPos(i).anchor"
                        :x="labelPos(i).x" :y="labelPos(i).y" dy="12">{{ a.unit || '—' }}</text>
                    </g>
                    <text :x="SVG.CX" :y="20" class="m1-radar-caption" text-anchor="middle">
                      径向 = 该属性在各工况间的相对位置（每轴独立归一化）· 外缘 = 该轴最大 · 圆心 = 该轴最小
                    </text>

                    <!-- one ring per 工况 -->
                    <g v-for="ring in rings" :key="`ring-${ring.condition}`">
                      <polygon v-if="radar.axes.length >= 2" :points="polyOf(ring.vals)"
                        :fill="ring.color" fill-opacity="0.06" :stroke="ring.color" stroke-width="2.4"
                        stroke-linejoin="round" :stroke-dasharray="ring.dash || 'none'" />
                      <template v-for="(v, i) in ring.vals" :key="`${ring.condition}-${i}`">
                        <circle :cx="pt(i, v.frac)[0]" :cy="pt(i, v.frac)[1]" r="2.6"
                          :fill="v.missing ? '#fff' : ring.color" :stroke="ring.color"
                          :stroke-width="v.missing ? 1.6 : 0" />
                      </template>
                    </g>
                  </svg>
                  <p class="m1-svg-note">
                    每环 = 一个工况（颜色 + 实/虚线双重编码）。各轴量纲不同（单位见图），
                    故每根轴按<b>该属性在各工况间的 min~max</b> 独立归一化，环的形状只表达「同一属性在不同工况下的相对高低」。
                    <template v-if="radar.rings.length === 1">
                      当前仅一个工况 —— 无跨工况尺度，各顶点落在固定中圈（径向不代表数值大小）。
                    </template>
                    <template v-if="missingCount">
                      缺失输出（该工况对该属性无预测值）以空心点 + 中圈占位，表格以「—」表示。
                    </template>
                  </p>
                </div>

                <div class="m1-side">
                  <h4 class="m1-side-title">工况环图例</h4>
                  <ul class="m1-legend">
                    <li v-for="ring in rings" :key="`lg-${ring.condition}`" class="m1-legend__item">
                      <span class="m1-sw" :style="{ borderColor: ring.color, borderTopStyle: ring.dash ? 'dashed' : 'solid' }" />
                      <span class="m1-legend__label">{{ ring.condition }}</span>
                      <span class="m1-legend__style">{{ ring.dash ? '虚线' : '实线' }}</span>
                    </li>
                  </ul>

                  <div class="m1-side-divider" />

                  <h4 class="m1-side-title">轴值域 <span class="m1-side-count">{{ radar.axes.length }}</span></h4>
                  <div class="m1-ranges">
                    <div v-for="a in radar.axes" :key="`r-${a.property}`" class="m1-range">
                      <span class="m1-range__name">{{ a.nameZh }}</span>
                      <span class="m1-range__unit">{{ a.unit || '—' }}</span>
                      <span class="m1-range__val">{{ fmtRange(a.lo) }} ~ {{ fmtRange(a.hi) }}</span>
                    </div>
                  </div>
                  <p class="m1-inline-hint">轴值域 = 该属性在当前结果中的最小 / 最大值（归一化端点）。</p>
                </div>
              </div>
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
import { getPredictMetadata, getPredictMaterials, predictSimple } from '../api/predictV1'

const router = useRouter()

/* ───────────────────────── 契约常量 ───────────────────────── */
// 全局特征的中文标签（global_feature_names 的顺序/名称由模型契约固定）。
const GLOBAL_LABELS = {
  water_amount: '加水量',
  hardening_time: '硬化时间',
  hardening_time_uncertainty: '硬化时间不确定度',
}
const DEFAULT_GLOBAL_NAMES = ['water_amount', 'hardening_time', 'hardening_time_uncertainty']
// 输入占位（与示例一致的量纲提示；非默认值，仅 placeholder）
const GLOBAL_PLACEHOLDERS = ['3.6', '10', '0']

// 工况环配色（色盲安全 + 实/虚线交替，避免重叠环混淆）。
const RING_COLORS = ['#005bac', '#e69f00', '#009e73', '#d55e00', '#cc79a7', '#56b4e9', '#7f7f7f', '#6a3d9a']

// 雷达几何（轴数动态 1~N）。
const SVG = { W: 620, H: 620, CX: 310, CY: 310, R_IN: 24, R_OUT: 198 }
const gridFracs = [0.25, 0.5, 0.75, 1]

const RIGHT_TABS = [
  { id: 'table', label: '预测结果' },
  { id: 'radar', label: '雷达图' },
]
const rightTab = ref('table')

/* ───────────────────────── 元数据 (/api/v1/model/metadata) ───────────────────────── */
const metadata = ref(null)
const metadataLoading = ref(false)
const metadataError = ref('')

const variant = computed(() => metadata.value?.variant || '')
const propertiesMeta = computed(() => metadata.value?.properties || [])
const globalNames = computed(() => {
  const names = metadata.value?.global_feature_names
  return Array.isArray(names) && names.length ? names : DEFAULT_GLOBAL_NAMES
})

async function loadMetadata() {
  metadataLoading.value = true
  metadataError.value = ''
  try {
    const data = await getPredictMetadata()
    metadata.value = data || null
  } catch (e) {
    metadataError.value = e?.response?.data?.detail?.message || e?.message || '元数据加载失败'
  } finally {
    metadataLoading.value = false
  }
}
onMounted(loadMetadata)

/* ───────────────────────── 原料名单 (/api/v1/model/materials) ─────────────────────────
 * material_id → 可显示名称（base 名）。仅用于把编码变成「名称 (编码)」的可读下拉；
 * 加载失败时静默降级为原始 material_id 数字输入，预测不受影响。 */
const materials = ref([])
const materialsLoading = ref(false)
const materialsError = ref('')

const materialOptions = computed(() => materials.value
  .map((m) => ({ id: String(m.material_id), label: `${m.name} (${m.material_id})` }))
  .filter((m) => m.id))
const materialIds = computed(() => new Set(materialOptions.value.map((m) => m.id)))
const hasMaterials = computed(() => materialOptions.value.length > 0)
const materialLabel = (id) => materialOptions.value.find((m) => m.id === String(id))?.label || ''

async function loadMaterials() {
  materialsLoading.value = true
  materialsError.value = ''
  try {
    const data = await getPredictMaterials()
    materials.value = Array.isArray(data?.materials) ? data.materials : []
    if (!materials.value.length) materialsError.value = '接口返回了空原料列表'
  } catch (e) {
    materialsError.value = e?.response?.data?.detail?.message || e?.message || '原料列表加载失败'
  } finally {
    materialsLoading.value = false
  }
  normalizeRowIds()
}
onMounted(loadMaterials)

const globalLabel = (name, i) => GLOBAL_LABELS[name] || name || `X_global[${i}]`

// 训练工况并集（按温度数值排序）
const conditionOptions = computed(() => {
  const set = new Set()
  for (const p of propertiesMeta.value) for (const c of p.trained_conditions || []) set.add(c)
  return [...set].sort((a, b) => condNum(a) - condNum(b))
})
function condNum(c) {
  const m = String(c).match(/\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY
}

/* ───────────────────────── X_comp 组分编辑 ───────────────────────── */
const rows = ref([])
let rowSeq = 0

function addRow(material_id = '', ratio_pct = '') {
  rows.value.push({ uid: `r${++rowSeq}`, material_id: String(material_id), ratio_pct })
}
// 编码统一为字符串，才能与 <select> 的选项值匹配（原料名单晚于手工输入到达时）
function normalizeRowIds() {
  rows.value.forEach((r) => {
    if (r.material_id !== '' && r.material_id !== null && r.material_id !== undefined) {
      r.material_id = String(r.material_id)
    }
  })
}
function removeRow(i) {
  rows.value.splice(i, 1)
}

// 严格数值解析：空串 / 非数字 -> null（Number('') === 0 会被误当有效值）
const numOr = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
// 合法行：material_id 为有限数值、ratio_pct > 0
const validRows = computed(() => rows.value
  .map((r) => ({ material_id: numOr(r.material_id), ratio_pct: numOr(r.ratio_pct) }))
  .filter((r) => r.material_id !== null && r.ratio_pct !== null && r.ratio_pct > 0))
// 已填内容但不合法的行（空行不标记）
function rowInvalid(r) {
  const empty = `${r.material_id ?? ''}`.trim() === '' && `${r.ratio_pct ?? ''}`.trim() === ''
  if (empty) return false
  const id = numOr(r.material_id)
  const pct = numOr(r.ratio_pct)
  return id === null || pct === null || pct <= 0
}

const sumRatio = computed(() => validRows.value.reduce((s, r) => s + r.ratio_pct, 0))
const sumRatioText = computed(() => {
  const v = sumRatio.value
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
})

/* ───────────────────────── X_global ───────────────────────── */
const globalValues = ref(DEFAULT_GLOBAL_NAMES.map(() => ''))
// 全空 -> 不下发 X_global（契约中为可选字段）；部分填写 -> 空白项按 0 下发
const globalPayload = computed(() => {
  const nums = globalNames.value.map((_, i) => numOr(globalValues.value[i]))
  if (nums.every((n) => n === null)) return null
  return nums.map((n) => (n === null ? 0 : n))
})

/* ───────────────────────── conditions / properties 多选 ───────────────────────── */
const selectedConditions = ref([])
const selectedProperties = ref([])
function toggle(list, value) {
  const i = list.value.indexOf(value)
  if (i === -1) list.value.push(value)
  else list.value.splice(i, 1)
}

/* ───────────────────────── 预测 (/api/v1/predict/simple) ───────────────────────── */
const predicting = ref(false)
const predictError = ref('')
const result = ref(null)
const resultAt = ref('')

const predictions = computed(() => result.value?.predictions || [])
const warnings = computed(() => result.value?.warnings || [])

function errText(e) {
  const d = e?.response?.data
  return d?.detail?.message || d?.message || e?.message || '预测请求失败，请稍后重试'
}

async function runPrediction() {
  predictError.value = ''
  if (!validRows.value.length) {
    predictError.value = '请至少添加一行有效组分（数值 material_id + >0 的 ratio_pct）。'
    return
  }
  const payload = {
    // 短行 [material_id, ratio_pct] —— 服务端按 51 列 component_feature_names 展开补齐
    X_comp: validRows.value.map((r) => [r.material_id, r.ratio_pct]),
  }
  if (globalPayload.value) payload.X_global = globalPayload.value
  if (selectedConditions.value.length) payload.conditions = [...selectedConditions.value]
  if (selectedProperties.value.length) payload.properties = [...selectedProperties.value]

  predicting.value = true
  try {
    result.value = await predictSimple(payload)
    resultAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (e) {
    predictError.value = errText(e)
  } finally {
    predicting.value = false
  }
}

/* ───────────────────────── 示例 / 重置 ───────────────────────── */
function loadExample() {
  rows.value = []
  rowSeq = 0
  addRow('61', 70)
  addRow('42', 30)
  globalValues.value = globalNames.value.map((_, i) => GLOBAL_PLACEHOLDERS[i] ?? '')
  selectedConditions.value = ['110℃', '1500℃']
  selectedProperties.value = []
  predictError.value = ''
}
function resetAll() {
  rows.value = []
  rowSeq = 0
  globalValues.value = globalNames.value.map(() => '')
  selectedConditions.value = []
  selectedProperties.value = []
  predictError.value = ''
  result.value = null
  resultAt.value = ''
}

/* ───────────────────────── 结果分组（表格） ───────────────────────── */
const groups = computed(() => {
  const map = new Map()
  for (const p of predictions.value) {
    if (!map.has(p.property)) {
      map.set(p.property, { property: p.property, nameZh: p.property_name_zh || p.property, unit: p.unit, rows: [] })
    }
    map.get(p.property).rows.push(p)
  }
  const list = [...map.values()]
  for (const g of list) g.rows.sort((a, b) => condNum(a.condition) - condNum(b.condition))
  return list
})

const condColor = (condition) => {
  const i = rings.value.findIndex((r) => r.condition === condition)
  return i === -1 ? '#8a9aa9' : rings.value[i].color
}

/* ───────────────────────── 雷达数据模型 ─────────────────────────
 * 轴 = 返回的属性；环 = 工况。
 * 每轴按该属性在「当前结果内全部工况」的 min~max 线性归一化 → 0..1：
 *   量纲不同的属性因此共享同一径向（形状表达同一属性跨工况的相对高低）。
 * 该属性在各工况值恒定时 (spread≈0) → 固定中圈；单工况 → 同理。
 * 缺失值 (null) → 中圈占位 + 空心点标记（表格以 — 表示）。 */
const radar = computed(() => {
  const preds = predictions.value
  if (!preds.length) return null

  const props = []
  const conds = []
  const byKey = new Map()
  for (const p of preds) {
    const key = `${p.property}\u0000${p.condition}`
    byKey.set(key, p.value)
    if (!props.includes(p.property)) props.push(p.property)
    if (!conds.includes(p.condition)) conds.push(p.condition)
  }
  conds.sort((a, b) => condNum(a) - condNum(b))

  const metaOf = (prop) => propertiesMeta.value.find((m) => m.property === prop)

  const axes = props.map((prop) => {
    const meta = metaOf(prop)
    const raw = conds.map((c) => {
      const v = byKey.get(`${prop}\u0000${c}`)
      return v == null || !Number.isFinite(Number(v)) ? null : Number(v)
    })
    const finite = raw.filter((v) => v !== null)
    const lo = finite.length ? Math.min(...finite) : 0
    const hi = finite.length ? Math.max(...finite) : 0
    const spread = hi - lo
    const fracs = raw.map((v) => {
      if (v === null) return { frac: 0.5, missing: true }
      if (spread < 1e-9) return { frac: 0.5, missing: false }
      return { frac: Math.min(1, Math.max(0, (v - lo) / spread)), missing: false }
    })
    return {
      property: prop,
      nameZh: meta?.property_name_zh || prop,
      unit: meta?.unit || preds.find((p) => p.property === prop)?.unit || '',
      lo, hi, spread, fracs,
    }
  })

  const rings = conds.map((condition, i) => ({
    condition,
    color: RING_COLORS[i % RING_COLORS.length],
    dash: i % 2 === 1 ? '7 5' : null,
    vals: axes.map((a) => a.fracs[conds.indexOf(condition)]),
  }))

  return { axes, rings }
})

const rings = computed(() => radar.value?.rings || [])
const missingCount = computed(() => (radar.value ? radar.value.axes.reduce((s, a) => s + a.fracs.filter((f) => f.missing).length, 0) : 0))

const radarAriaLabel = computed(() => {
  const r = radar.value
  if (!r) return '性能预测雷达图'
  const axesText = r.axes.map((a) => a.nameZh).join('、')
  const ringsText = r.rings.map((g) => `${g.condition}（${g.dash ? '虚线' : '实线'}）`).join('、')
  return `性能预测雷达图：${r.axes.length} 个属性轴（${axesText}），${r.rings.length} 条工况环（${ringsText}）；每轴按该属性在工况间归一化`
})

/* ───────────────────────── 雷达几何 ───────────────────────── */
const angleOf = (i, n = radar.value?.axes.length || 1) => ((-90 + (360 / n) * i) * Math.PI) / 180
const rOf = (frac) => SVG.R_IN + Math.min(1, Math.max(0, frac)) * (SVG.R_OUT - SVG.R_IN)
function pt(i, frac) {
  const a = angleOf(i)
  const r = rOf(frac)
  return [SVG.CX + r * Math.cos(a), SVG.CY + r * Math.sin(a)]
}
function polyOf(vals) {
  return vals.map((v, i) => {
    const frac = typeof v === 'object' && v !== null ? v.frac : v
    return pt(i, frac).join(',')
  }).join(' ')
}
function labelPos(i, frac = 1.17) {
  const a = angleOf(i)
  const r = rOf(frac)
  const c = Math.cos(a)
  const anchor = Math.abs(c) < 0.25 ? 'middle' : c > 0 ? 'start' : 'end'
  return { x: SVG.CX + r * c + (anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0), y: SVG.CY + r * Math.sin(a), anchor }
}

/* ───────────────────────── 格式化 ───────────────────────── */
const fmtVal = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(4))
const fmtRange = (v) => (Math.abs(v) >= 100 ? Number(v).toFixed(0) : Number(v).toFixed(3))
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
.m1-dot--live { background: #22c55e; animation: m1-pulse 1.6s infinite; }
.m1-spin {
  width: 10px; height: 10px; border-radius: 50%; flex: none;
  border: 2px solid #9fc9e8; border-top-color: #0869ad;
  animation: m1-rot .8s linear infinite; display: inline-block;
}
.m1-spin--lg { width: 22px; height: 22px; border-width: 3px; }
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

/* layout — the row IS the viewport fill (see .pl-eqcols) */
.m1-layout { display: grid; grid-template-columns: minmax(340px, 384px) minmax(0, 1fr); gap: var(--pl-workbench-gap, 12px); }
.m1-left {
  gap: 8px;
  font-size: 12.5px; color: #2c4a63;
  background: #f3f7fb; border: 1px solid #e3ebf3; border-radius: 10px; padding: 10px;
}
.m1-right { gap: var(--pl-workbench-col-gap, 10px); }
.m1-body { display: flex; flex-direction: column; gap: 9px; min-height: var(--pl-workbench-body-min, 380px); }
/* the config body itself is the scroll region: children keep natural height */
.m1-body > * { flex: none; }

.m1-sec { display: flex; flex-direction: column; gap: 7px; padding-top: 8px; border-top: 1px solid #e5ecf2; }
.m1-sec:first-of-type { padding-top: 0; border-top: none; }
.m1-sec-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.m1-sec-title { margin: 0; font-size: 13px; font-weight: 750; color: #17324d; letter-spacing: -.1px; }
.m1-sec-sub { margin: 1px 0 0; font-size: 11px; color: #72879c; line-height: 1.5; }
.m1-sec-badge {
  flex: none; font-size: 10.5px; font-weight: 700; color: #005bac;
  background: rgba(0,91,172,.08); border: 1px solid rgba(0,91,172,.18);
  padding: 2px 8px; border-radius: 999px; white-space: nowrap; margin-top: 1px;
}
.m1-link-btn {
  font: inherit; font-size: 12px; font-weight: 650; color: #0869ad; background: none;
  border: none; padding: 2px; cursor: pointer;
}
.m1-link-btn:hover { color: #005bac; text-decoration: underline; }
.m1-link-btn:focus-visible { outline: 2px solid #0aa3d8; outline-offset: 2px; border-radius: 4px; }
.m1-hint-txt { margin: 0; font-size: 11px; color: #72879c; line-height: 1.6; }
.m1-hint-txt--warn { color: #b26a14; }
.m1-hint-txt b { color: #2c4a63; }
.m1-inline-hint { margin: 0; font-size: 11px; color: #8a9aa9; line-height: 1.6; }
.m1-inline-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* inputs */
.m1-input {
  font: inherit; font-size: 12px; color: #17324d; width: 100%; min-width: 0;
  background: #fff; border: 1px solid #d5e0ea; border-radius: 7px; padding: 5px 8px;
  -moz-appearance: textfield;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.m1-input::-webkit-outer-spin-button, .m1-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.m1-input:focus { outline: none; border-color: #0aa3d8; box-shadow: 0 0 0 3px rgba(10,163,216,.14); }

/* composition rows */
.m1-rows { display: flex; flex-direction: column; gap: 4px; }
.m1-rows__head {
  display: grid; grid-template-columns: 20px minmax(0, 1.6fr) minmax(0, 1fr) 22px;
  gap: 7px; padding: 0 2px; font-size: 10px; font-weight: 750; color: #7c8b98;
}
.m1-row {
  display: grid; grid-template-columns: 20px minmax(0, 1.6fr) minmax(0, 1fr) 22px;
  gap: 7px; align-items: center;
  padding: 4px 5px; border: 1px solid #e5ecf2; border-radius: 8px; background: #fff; line-height: 1.2;
}
.m1-row__no {
  font-size: 10px; font-weight: 750; color: #9aa8b7; text-align: center;
  background: #f2f6fa; border-radius: 4px; padding: 2px 0;
}
.m1-input-wrap { position: relative; min-width: 0; }
.m1-input--pct { padding-right: 18px; }
.m1-input-suffix {
  position: absolute; right: 7px; top: 50%; transform: translateY(-50%);
  font-size: 10.5px; color: #98a6b4; pointer-events: none;
}
.m1-rows-empty {
  font-size: 12px; color: #72879c; background: #f6f9fc; border: 1px dashed #cbd9e6;
  border-radius: 9px; padding: 12px 10px; margin: 0;
}
.m1-select {
  appearance: none; -webkit-appearance: none; -moz-appearance: none; cursor: pointer;
  padding-right: 20px; text-overflow: ellipsis;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%237c8b98' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 6px center; background-size: 9px 6px;
}
.m1-row.is-bad { border-color: #f0c2bb; background: #fffafa; }
.m1-row.is-bad .m1-input { border-color: #f0c2bb; }
.m1-remove {
  font: inherit; width: 22px; height: 22px; border-radius: 6px; cursor: pointer; flex: none;
  border: 1px solid transparent; background: transparent; color: #a3b0bd; font-size: 11px; line-height: 1;
}
.m1-remove:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
.m1-remove:focus-visible { outline: 2px solid #0aa3d8; outline-offset: 1px; }

/* X_global */
.m1-globals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.m1-gfield { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.m1-gfield__label { font-size: 10.5px; font-weight: 650; color: #7c8b98; line-height: 1.3; }

/* multi-select chips */
.m1-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.m1-chipbtn {
  font: inherit; font-size: 11.5px; font-weight: 650; color: #2c4a63;
  background: #fff; border: 1px solid #d9e3ec; border-radius: 999px;
  padding: 4px 11px; cursor: pointer; line-height: 1.35;
  display: inline-flex; align-items: baseline; gap: 5px;
  transition: all .15s ease;
}
.m1-chipbtn:hover { border-color: #9fc0d8; color: #0869ad; }
.m1-chipbtn.is-on {
  color: #fff; background: linear-gradient(135deg, #005bac, #0aa3d8);
  border-color: transparent; box-shadow: 0 2px 8px rgba(8,105,173,.28);
}
.m1-chipbtn__k { font-size: 9.5px; font-weight: 600; opacity: .68; }
.m1-chipbtn:focus-visible { outline: 2px solid #0aa3d8; outline-offset: 1px; }

/* footer + actions */
.m1-foot { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; padding-top: 9px; border-top: 1px solid #e5ecf2; }
.m1-actions { display: flex; gap: 8px; align-items: center; }
.m1-actions .m1-run-btn { margin-left: auto; }
.m1-ghost-btn {
  font: inherit; font-size: 12px; font-weight: 650; color: #5b6b7c;
  background: #fff; border: 1px solid #d9e3ec; border-radius: 7px; padding: 7px 12px; cursor: pointer;
  transition: all .15s ease;
}
.m1-ghost-btn:hover { border-color: #b7c6d4; color: #17324d; }
.m1-ghost-btn--sm { font-size: 11.5px; padding: 5px 10px; }
.m1-ghost-btn:focus-visible { outline: 2px solid #0aa3d8; outline-offset: 1px; }
.m1-run-btn {
  font: inherit; font-size: 13px; font-weight: 750; color: #fff;
  background: linear-gradient(135deg, #005bac 0%, #0869ad 55%, #0aa3d8 130%);
  border: none; border-radius: 8px; padding: 8px 22px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  box-shadow: 0 8px 22px rgba(8,105,173,.28);
  transition: transform .16s ease, box-shadow .16s ease;
}
.m1-run-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(8,105,173,.34); }
.m1-run-btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }
.m1-run-btn:focus-visible { outline: 2px solid #0aa3d8; outline-offset: 2px; }
.m1-run__spinner { width: 13px; height: 13px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,.35); border-top-color: #fff; animation: m1-rot .8s linear infinite; display: inline-block; flex: none; }
.m1-errorbar {
  margin: 0; font-size: 12px; color: #c0392b; background: #fef0ee;
  border: 1px solid #f5c6c0; border-radius: 7px; padding: 7px 10px; line-height: 1.5;
}

/* right header row (geometry shared via .pl-workbench-head) */
.m1-rhead { padding: 0 2px; }
.m1-rhead__status { margin-left: auto; }

/* right panels */
.m1-panel { min-width: 0; min-height: 0; }
.m1-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.m1-panel-title { font-size: 15px; font-weight: 800; color: #17324d; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.m1-panel-sub { margin: 2px 0 0; font-size: 11px; color: #72879c; line-height: 1.6; }
.m1-panel-sub-inline { font-size: 11px; font-weight: 600; color: #0e7a4c; background: #e7f7ef; border: 1px solid #bfe9d3; border-radius: 999px; padding: 1px 8px; }
.m1-chart-actions { display: flex; gap: 6px; align-items: center; flex: none; flex-wrap: wrap; }

/* workbench sub-tabs */
.m1-workbench { display: flex; flex-direction: column; gap: var(--pl-workbench-col-gap, 10px); min-height: 0; }
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
.m1-subpanel > *:not(.m1-empty):not(.m1-loading) { flex: none; }

/* loading / empty states */
.m1-loading { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #5b6b7c; font-size: 12.5px; }
.m1-loading p { margin: 0; }
.m1-empty { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px; padding: 30px 20px 22px; }
.m1-empty__glyph { opacity: .8; margin-bottom: 4px; }
.m1-empty__title { margin: 0; font-size: 15px; font-weight: 800; color: #2c4a63; }
.m1-empty__desc { margin: 0; max-width: 560px; font-size: 12px; color: #72879c; line-height: 1.8; }
.m1-empty__desc strong { color: #0869ad; }

/* warnings */
.m1-warnbox {
  margin-bottom: 10px; padding: 8px 10px; border-radius: 8px;
  background: #fdf3e4; border: 1px solid #f0d9b4; color: #8a5310; font-size: 11.5px;
}
.m1-warnbox__title { font-weight: 750; display: block; margin-bottom: 4px; }
.m1-warnbox ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 2px; line-height: 1.55; }
.m1-warnbox code { font-size: 10.5px; background: rgba(178,106,20,.12); border-radius: 4px; padding: 0 4px; }

/* results table */
.m1-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.m1-table th {
  text-align: left; font-size: 10.5px; font-weight: 750; color: #7c8b98;
  padding: 5px 8px; border-bottom: 1px solid #e5ecf2; background: #f8fafc;
}
.m1-th--val { text-align: right; }
.m1-th--model { width: 34%; }
.m1-tprop td { padding: 8px 8px 4px; border-bottom: none; }
.m1-tprop__name { font-size: 12.5px; font-weight: 800; color: #17324d; margin-right: 8px; }
.m1-tprop__key { font-size: 10px; font-weight: 650; color: #8a9aa9; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-right: 8px; }
.m1-tprop__unit { font-size: 10px; font-weight: 700; color: #005bac; background: rgba(0,91,172,.08); border-radius: 4px; padding: 0 6px; }
.m1-trow td { padding: 3px 8px; color: #2c4a63; border-bottom: 1px solid #f4f7fa; }
.m1-trow:last-child td { border-bottom: none; }
.m1-tdot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; }
.m1-tval { text-align: right; font-weight: 800; color: #17324d; font-variant-numeric: tabular-nums; }
.m1-tunit { color: #5b6b7c; font-size: 10.5px; }
.m1-tmodel { font-size: 10.5px; }
.m1-tmodel__name { font-weight: 700; color: #2c4a63; margin-right: 6px; }
.m1-tmodel__meta { color: #8a9aa9; }

/* radar layout */
.m1-chartgrid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(190px, .8fr); gap: 6px 16px; align-items: start; }
.m1-svgwrap { min-width: 0; }
.m1-radar { width: 100%; height: auto; display: block; }
.m1-axis-label { font-size: 12.5px; font-weight: 750; fill: #1d3a57; }
.m1-axis-unit { font-size: 10px; fill: #8a9aa9; }
.m1-radar-caption { font-size: 10px; fill: #9aa8b7; }
.m1-svg-note { margin: 6px 0 0; font-size: 10.5px; color: #8a9aa9; line-height: 1.65; }
.m1-svg-note b { color: #5b6b7c; }

/* side legend */
.m1-side { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding-top: 4px; }
.m1-side-title { margin: 0; font-size: 12px; font-weight: 800; color: #17324d; display: flex; align-items: center; gap: 6px; }
.m1-side-count {
  font-size: 10px; font-weight: 800; color: #005bac; background: rgba(0,91,172,.08);
  border-radius: 999px; padding: 0 7px; line-height: 16px;
}
.m1-side-divider { height: 1px; background: #eef2f6; }
.m1-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.m1-legend__item { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: #2c4a63; }
.m1-legend__label { font-weight: 650; }
.m1-legend__style { margin-left: auto; font-size: 10px; color: #98a6b4; }
.m1-sw {
  width: 20px; height: 0; flex: none; border-top-width: 2.5px; border-top-style: solid;
  border-top-color: #98a6b4; display: inline-block;
}
.m1-ranges { display: flex; flex-direction: column; gap: 3px; }
.m1-range {
  display: flex; align-items: baseline; gap: 7px;
  background: #fff; border: 1px solid #eef2f6; border-radius: 6px; padding: 4px 8px; font-size: 11px;
}
.m1-range__name { font-weight: 700; color: #17324d; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m1-range__unit { font-size: 10px; color: #8a9aa9; flex: none; }
.m1-range__val { margin-left: auto; color: #2c4a63; font-variant-numeric: tabular-nums; flex: none; }

/* responsive */
@media (max-width: 1180px) {
  .m1-layout { grid-template-columns: minmax(320px, 348px) minmax(0, 1fr); }
}
@media (max-width: 960px) {
  /* stacked: heights go back to content-driven (see platform.css) */
  .m1-layout { grid-template-columns: 1fr; }
  .m1-chartgrid { grid-template-columns: 1fr; }
  .m1-side { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); align-items: start; }
  .m1-side .m1-side-divider { display: none; }
  .m1-rhead__status { margin-left: 0; }
}
@media (max-width: 720px) {
  .model1-page { padding: 10px 12px; }
  .m1-globals { grid-template-columns: 1fr; }
  .m1-th--model { width: auto; }
}
</style>
