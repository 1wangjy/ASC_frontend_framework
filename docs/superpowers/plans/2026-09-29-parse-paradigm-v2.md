# 智能解析范式 v2 实施计划（含旧界面 old_ver 保留）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一套"以预测模型输入为规范"的解析范式替换现有智能解析界面（旧界面原样保留为 old_ver），让一次解析同时产出六张业务表与 ML 表，并且其结果可直接喂给 `/api/v1/predict/simple` 做性能预测。

**Architecture:** 解析不再"想写哪张表就写哪张表"，而是先归一到一个中间模型 `ParsedRecord`（配方 + 组分 + 全局工艺 + 测试 + 工况 + 服役），再经 `parseProjection` 分别投影为「六表 payload」与「ML payload（48 列）」；前端只做输入与人工确认（预览/告警/差异），写入由后端单事务完成（`POST /api/parse-v2/commit`）。规范字段以预测模型契约为准（48 列 X_comp + 3 列 X_global），避免再次出现"库里的口径与模型口径不一致"。

**Tech Stack:** Vue 3 + Vite（`src/`）；Node/Express + sqlite3（`backend_impl/src`，:3001）；Python 模型服务（`backend_impl/python/model_predict`，:8100，venv 内 sklearn 1.9.1 / lightgbm / xgboost）；测试用 `node --test`（`tests/`、`backend_impl/test/`）。

## Global Constraints

- 规范 X_comp（48 列，顺序即契约）：`material_id, ratio_pct, particle_size_min, particle_size_max, base, PC1…PC20, component_batch, SiC, SiO2, AL2O3, Fe2O3, TiO2, CaO, MgO, K2O, Na2O, PH, loss_on_ignition, bulk_density, true_density, water_absorption, porosity, moisture, d50, ph, fired_bulk_density, fired_cold_modulus, fired_crushing_strength, fired_linear_change`
- 规范 X_global（3 列）：`water_amount, hardening_time, hardening_time_uncertainty`
- 模型侧约定：`categorical_columns = ['material_id']`、`dropped_component_columns = ['base']`（来源：`FEATURE/outputs/metadata_yangquan.json`，与 `enterprise_input_template.json` 逐列一致，实测 48/48 无差异）
- 组分比例校验沿用现有语义（`src/platform/types/entities.js#validateComponentRows`）：`0 < ratio ≤ 100`、同一 `material_id` 不重复、合计 `100 ± 0.1`
- 六表 payload 形态不可改（实测样例）：
  - `mc_material.component_list = [["高铝铝土","MP_000001","{}",100]]`（`type ∈ {支撑骨料,抗侵蚀原料,抗氧化剂,填充细粉,结合剂,水,其他}`）
  - `mr_formula.component_list = [["高铝铝土","MC_000001","{}",70], …]`，另有 `tp_ids/fe_ids/ru_ids/creator`
  - `mp_properties.fixed_properties = [32 个槽位]`、`custom_properties=[{name,value}]`
  - `tp_test_properties.test_params = {"temperature":1100,"time":24,"atmosphere":"air"}`、`test_results={"fixed":[32 槽],"custom":[{name,value}]}`
  - `fe_working_condition.condition_params = {…}`、`ru_service_data.service_params = {…}`
- ML 表写入沿用既有表：`ml_formula(dataset_source, recipe_id, n_components, x_global, x_global_names, y_labels)` + `ml_formula_component(dataset_source, recipe_id, comp_index, material_id, ratio_pct, component_features)`；`ml_dataset_meta.comp_feature_names` 必须为 48 列规范
- 隐私：解析/摄取日志与接口响应不得回显 ML 原始样本值（沿用 `materialize_ml_dataset.py` 的约定：只打印计数/ID/键）
- 不新增运行时依赖；输入格式第一版限定 **JSON / YAML / 纯文本 / CSV**（Excel 留待后续，YAGNI）
- 旧界面必须仍可访问：路由 `/platform/data/old`（name `PlatformDataOld`），导航「解析（旧版）」

---

## 现状事实（勘察结论，计划的前提）

| 项目 | 事实 |
|---|---|
| 入口 | `/platform/data?tab=parse`，实现全在 `src/platform/views/DataManagerView.vue`（1535 行，含 4 个主标签） |
| 子页 | `PARSE_TABS = recipe/working/service/reconstruct`（L561）；只有 `recipe` 有实体组件，其余 3 个是内联「功能开发中」div |
| 配方解析 | `src/platform/components/RecipeParserPanel.vue`(217) + `src/platform/composables/useRecipeParser.js`(282) + `src/platform/api/recipeParser.js` |
| 写库 | 仅 `POST /api/recipe-parser/submit` → `backend_impl/src/controllers/recipeParserController.js#submitFinalRecipe`，直写 `mp/mc/tp/mr` 四表；**fe/ru 无解析写入路径** |
| ML 表 | `ml_formula` 780 行 / `ml_formula_component` 12522 行（=datasetv2 的 182+457+141），但 `ml_dataset_meta.comp_feature_names` 是**旧的 51 列**（`particle_size_mean/std` + `reserved_feature_1..4`），与模型/企业模板的 **48 列**（`particle_size_min/max` + `component_batch`）**不一致**；摄取来源 `private/dataset_clean_meanstd.npy` |
| 反向物化 | `backend_impl/scripts/materialize_ml_dataset.py`：ml_* → 六表（mc/mr/mp/tp） |
| 其它解析通道 | `POST /api/material-encoder/encode`（NL→材料代号，用于 Model1View）；`/api/ml-dataset/*`（读 ML 表） |
| 读源码的测试 | `tests/platformPropertyMeasurements.test.js`、`tests/researchWorkflowIntegration.test.js` 直读 `DataManagerView.vue`；`tests/platformFourTableContracts.test.js` 直读 `RecipeParserPanel.vue`/`useRecipeParser.js`；多条路由断言 `/platform/data → PlatformData` |

---

## File Structure

**Create — 前端解析内核（纯函数，可单测）**
- `src/platform/parse/parseSchema.js` — 48 列 + 3 global 的规范字段、别名表、单位表、`MATERIAL_FIELD_GROUPS`（唯一真源）
- `src/platform/parse/parsePipeline.js` — 输入（JSON/YAML/文本/CSV）→ `ParsedRecord[]`（归一化全角/单位/别名，标注来源行）
- `src/platform/parse/parseValidate.js` — 校验与分级告警（error/warning）
- `src/platform/parse/parseProjection.js` — `ParsedRecord` → `{ business: {mc,mr,mp,tp,fe,ru}, ml: {formula, components} }`

**Create — 前端界面**
- `src/platform/views/parse/ParseWorkspaceView.vue` — 工作台骨架（左输入 / 中映射预览 / 右问题清单与入库）
- `src/platform/views/parse/ParseSourcePanel.vue` — 输入区（粘贴/上传/示例/字段模板下载）
- `src/platform/views/parse/ParseMappingTable.vue` — 组分与测试的映射预览（可改、可删、可绑定既有 MC/MP）
- `src/platform/views/parse/ParseIssueList.vue` — 告警/错误/入库结果
- `src/platform/views/DataManagerViewOld.vue` — **旧界面原名改名副本**（旧 `DataManagerView.vue` 的逐字节复制）

**Create — 后端**
- `backend_impl/src/routes/parseV2.js` — `POST /api/parse-v2/preview`、`POST /api/parse-v2/commit`
- `backend_impl/src/services/parseIngestService.js` — 事务化写入六表 + ML 表（幂等、隐私安全）
- `backend_impl/src/config/ml-schema.js` — 48 列规范 + `ML_SCHEMA_VERSION = 'v2'`

**Modify**
- `src/platform/views/DataManagerView.vue` — parse 区改为挂载 `<ParseWorkspaceView>`；`PARSE_TABS` 退化为单页
- `src/config/ascRoutes.js`、`src/features/navigation/appNavigation.js` — 新增旧版入口
- `backend_impl/src/index.js` — 挂载 `parseV2` 路由
- `backend_impl/scripts/load_ml_dataset.py` — 支持 48 列 npy 与 `dataset_version`
- `src/platform/api/parseV2.js`（Create）— 前端 API 客户端

**Tests**
- Create: `tests/parseSchema.test.js`、`tests/parsePipeline.test.js`、`tests/parseValidate.test.js`、`tests/parseProjection.test.js`、`backend_impl/test/parseIngest.test.js`
- Modify（路由/源码断言同步）：`tests/ascLabExperience.test.js`、`tests/navigationCleanup.test.js`、`tests/routeAccess.test.js`、`tests/sidebarWorkflowNavigationMigration.test.js`、`tests/sidebarDocumentNavigationRemoval.test.js`、`tests/workflowPageContinuity.test.js`、`tests/researchWorkflowIntegration.test.js`、`tests/platformPropertyMeasurements.test.js`

---

## Task 1: 旧界面保留为 old_ver

**Files:**
- Create: `src/platform/views/DataManagerViewOld.vue`（= `git show HEAD:src/platform/views/DataManagerView.vue` 的逐字节副本）
- Modify: `src/config/ascRoutes.js`（数据平台路由段）、`src/features/navigation/appNavigation.js:18`、`tests/routeAccess.test.js`、`tests/ascLabExperience.test.js`

**Interfaces:**
- Produces: 路由 `{ path: '/platform/data/old', name: 'PlatformDataOld' }`；旧视图组件默认导出名不变（`DataManagerViewOld.vue`）

- [ ] **Step 1: 写失败测试**（`tests/parseLegacyRoute.test.js`）

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { ascRouteDefinitions } from '../src/config/ascRoutes.js'

test('旧解析界面保留在 /platform/data/old 且未与主路由重名', () => {
  const names = ascRouteDefinitions.map((r) => r.name)
  assert.ok(names.includes('PlatformDataOld'))
  const legacy = ascRouteDefinitions.find((r) => r.name === 'PlatformDataOld')
  assert.equal(legacy.path, '/platform/data/old')
  assert.equal(new Set(names).size, names.length)
})
```

- [ ] **Step 2: 运行并确认失败**

Run: `node --test tests/parseLegacyRoute.test.js`
Expected: FAIL（`PlatformDataOld` 不存在）

- [ ] **Step 3: 复制旧视图并加路由/导航**

```bash
git show HEAD:src/platform/views/DataManagerView.vue > src/platform/views/DataManagerViewOld.vue
```
`src/config/ascRoutes.js` 在 `/platform/data` 之后插入：
```js
{ path: '/platform/data/old', name: 'PlatformDataOld',
  component: () => import('../platform/views/DataManagerViewOld.vue'),
  meta: { title: '数据平台（旧版）' } },
```
`appNavigation.js` 数据平台 children 追加 `{ label: '解析（旧版）', path: '/platform/data/old' }`

- [ ] **Step 4: 运行测试 + 同步既有路由断言**

Run: `npm run test:route-access && node --test tests/parseLegacyRoute.test.js tests/ascLabExperience.test.js tests/navigationCleanup.test.js`
Expected: PASS（如既有断言按"数据平台 children 数量"写死，则同步为 +1，并写明理由）

- [ ] **Step 5: 提交**

```bash
git add src/platform/views/DataManagerViewOld.vue src/config/ascRoutes.js src/features/navigation/appNavigation.js tests/
git commit -m "feat(parse): keep the legacy parse UI reachable at /platform/data/old"
```

---

## Task 2: 规范字段单一真源 `parseSchema.js`

**Files:**
- Create: `src/platform/parse/parseSchema.js`、`tests/parseSchema.test.js`

**Interfaces:**
- Produces:
  - `COMP_FIELDS: string[]`（48 列，顺序如上）
  - `GLOBAL_FIELDS = ['water_amount','hardening_time','hardening_time_uncertainty']`
  - `FIELD_ALIASES: Record<string, string>`（中文/常见写法 → 规范列名，如 `'碳化硅'` 不是字段；字段别名如 `'al2o3'→'AL2O3'`、`'烧失'→'loss_on_ignition'`、`'粒度下限'→'particle_size_min'`）
  - `FIELD_UNITS: Record<string,string>`、`MATERIAL_FIELD_GROUPS: {identity,particle,composition,mineral,physical,fired}[]`（各组包含的列，供 UI 分组显示）
  - `canonicalField(name: string): string | null`

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COMP_FIELDS, GLOBAL_FIELDS, canonicalField, MATERIAL_FIELD_GROUPS } from '../src/platform/parse/parseSchema.js'

const modelMeta = JSON.parse(readFileSync(
  new URL('../backend_impl/python/model_predict/FEATURE/outputs/metadata_yangquan.json', import.meta.url),
  'utf8',
))

test('规范字段与模型契约逐列一致（顺序敏感）', () => {
  assert.deepEqual(COMP_FIELDS, modelMeta.component_feature_names)
  assert.deepEqual(GLOBAL_FIELDS, modelMeta.global_feature_names)
})
test('字段分组覆盖全部列且不重复', () => {
  const grouped = MATERIAL_FIELD_GROUPS.flatMap((g) => g.fields)
  assert.deepEqual([...grouped].sort(), [...COMP_FIELDS].sort())
})
test('别名归一（大小写/全角/中文）', () => {
  assert.equal(canonicalField('al2o3'), 'AL2O3')
  assert.equal(canonicalField('Ａｌ２Ｏ３'), 'AL2O3')
  assert.equal(canonicalField('烧失'), 'loss_on_ignition')
  assert.equal(canonicalField('不存在'), null)
})
```

- [ ] **Step 2: 运行确认失败** — `node --test tests/parseSchema.test.js` → FAIL（模块不存在）
- [ ] **Step 3: 实现 `parseSchema.js`**（48 列数组 + 3 列 global + 别名/单位/分组；别名查询先做全角→半角、去空格、小写）
- [ ] **Step 4: 运行确认通过** — `node --test tests/parseSchema.test.js` → PASS
- [ ] **Step 5: 提交** — `git commit -m "feat(parse): pin the canonical 48-column schema to the model contract"`

---

## Task 3: 输入归一化管线 `parsePipeline.js`

**Files:** Create `src/platform/parse/parsePipeline.js`、`tests/parsePipeline.test.js`（依赖 Task 2 的 `parseSchema`）

**Interfaces:**
- Produces: `parseInput(raw: string, { format?: 'auto'|'json'|'yaml'|'text'|'csv', sourceName?: string }): { records: ParsedRecord[], issues: Issue[] }`
- `ParsedRecord = { recipe_id, dataset_source, name, formula_type, batch_no, components: Component[], globals: Record<string, number|null>, tests: TestEntry[], condition?: object, service?: object, provenance: {line?: number, raw?: string}[] }`
- `Component = { material_id, material_name, ratio_pct, attrs: Partial<Record<CompField, number|string|null>> }`
- 复用既有能力：全角归一化与 `名称[id]:比例` 文本语法沿用 `useRecipeParser.parseRecipeText` 的规则；`parseValueWithUnit` 语义保留（单位非法 → issue，不静默取数）

- [ ] **Step 1: 写失败测试**（企业 JSON、文本、YAML 各一）

```js
test('企业录入 JSON → ParsedRecord（48 列属性映射 + globals）', () => {
  const rec = parseInput(JSON.stringify(enterpriseSample), { format: 'json' }).records[0]
  assert.equal(rec.components[0].material_id, '61')
  assert.equal(rec.components[0].ratio_pct, 21.1)
  assert.equal(rec.components[0].attrs.SiC, 8.4)
  assert.deepEqual(Object.keys(rec.globals), GLOBAL_FIELDS)
})
test('文本配方：* 行是测试项，不进组分', () => {
  const out = parseInput('铁线配方A: 70%\n碳化硅[17]: 30%\n*常温耐压: 50 MPa', { format: 'text' })
  assert.equal(out.records[0].components.length, 2)
  assert.deepEqual(out.records[0].components.map((c) => c.material_id), [null, '17'])
  assert.equal(out.records[0].tests.length, 1)
  assert.equal(out.records[0].tests[0].value, 50)
  assert.equal(out.records[0].tests[0].unit, 'MPa')
})

test('非法数值进入 issues 且不落数', () => {
  const out = parseInput('碳化硅[17]: 三十', { format: 'text' })
  assert.equal(out.records[0].components[0].ratio_pct, null)
  assert.ok(out.issues.some((i) => i.code === 'RATIO_INVALID'))
})
```

- [ ] **Step 2: 运行确认失败** → `node --test tests/parsePipeline.test.js`
- [ ] **Step 3: 实现**：`format:'auto'` 依首字符判定（`{`/`[`→json，`名称:`+缩进→yaml，含 `[` 或 `*` 行→text，逗号列→csv）；每条记录带 `provenance`（行号/原文片段）以便 UI 定位
- [ ] **Step 4: 运行确认通过**
- [ ] **Step 5: 提交** — `feat(parse): normalise json/yaml/text/csv into ParsedRecord`

---

## Task 4: 校验与分级告警 `parseValidate.js`

**Files:** Create `src/platform/parse/parseValidate.js`、`tests/parseValidate.test.js`

**Interfaces:**
- Produces: `validateRecord(record, { knownMaterialIds: Set<string> }): Issue[]`
- `Issue = { level: 'error'|'warning', code: string, message: string, path?: string }`
- 复用/对齐 `types/entities.validateComponentRows` 的比例语义；错误码：`RATIO_NOT_100`、`RATIO_INVALID`、`MATERIAL_UNKNOWN`、`MATERIAL_DUPLICATE`、`FIELD_OUT_OF_RANGE`、`GLOBAL_MISSING`、`TEST_UNIT_UNKNOWN`、`CONDITION_INCOMPLETE`

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRecord } from '../src/platform/parse/parseValidate.js'

const record = (over = {}) => ({
  recipe_id: 'r1', dataset_source: 'enterprise', name: '铁线配方A', formula_type: '铁线配方', batch_no: 'No.1',
  components: [{ material_id: '61', material_name: '棕刚玉', ratio_pct: 70, attrs: {} },
               { material_id: '17', material_name: '97黑碳化硅', ratio_pct: 30, attrs: {} }],
  globals: { water_amount: 3.6, hardening_time: 10, hardening_time_uncertainty: 0 },
  tests: [], provenance: [], ...over,
})

test('比例合计必须为 100 ± 0.1', () => {
  const issues = validateRecord(record({ components: [{ material_id: '61', ratio_pct: 69.5, attrs: {} }] }), { knownMaterialIds: new Set(['61']) })
  assert.ok(issues.some((i) => i.code === 'RATIO_NOT_100' && i.level === 'error'))
})

test('未知 material_id 只告警不阻断', () => {
  const issues = validateRecord(record(), { knownMaterialIds: new Set(['61']) })
  assert.ok(issues.some((i) => i.code === 'MATERIAL_UNKNOWN' && i.level === 'warning'))
})

test('粒度下限大于上限是错误', () => {
  const issues = validateRecord(
    record({ components: [{ material_id: '61', ratio_pct: 100, attrs: { particle_size_min: 5, particle_size_max: 1 } }] }),
    { knownMaterialIds: new Set(['61']) },
  )
  assert.ok(issues.some((i) => i.code === 'FIELD_OUT_OF_RANGE' && i.level === 'error'))
})

test('缺加水量的工艺参数只告警', () => {
  const issues = validateRecord(record({ globals: { water_amount: null, hardening_time: 10, hardening_time_uncertainty: 0 } }), { knownMaterialIds: new Set(['61', '17']) })
  assert.ok(issues.some((i) => i.code === 'GLOBAL_MISSING' && i.level === 'warning'))
})
```

- [ ] **Step 2: 运行确认失败** — `node --test tests/parseValidate.test.js` → FAIL（模块不存在）
- [ ] **Step 3: 实现**（比例语义复用 `types/entities.validateComponentRows` 的判定；错误码见 Interfaces）
- [ ] **Step 4: 运行确认通过** — `node --test tests/parseValidate.test.js` → PASS
- [ ] **Step 5: 提交** — `feat(parse): validate ratios, materials and field domains with graded issues`

---

## Task 5: 投影 `parseProjection.js`（六表 + ML）

**Files:** Create `src/platform/parse/parseProjection.js`、`tests/parseProjection.test.js`

**Interfaces:**
- Produces: `projectRecord(record, { idFactory, existing }): { business, ml }`
  - `business.mc[]`：`{ type, batch_no, component_list: [[name, mpRef, '{}', 100]] }`
  - `business.mr`：`{ formula_name, formula_type, batch_no, component_list: [[name, mcId, '{}', ratio]], tp_ids, fe_ids, ru_ids, creator }`
  - `business.mp`：`{ fixed_properties: number[32], custom_properties: [{name,value}], mc_ids }`（经既有 32 槽定义映射，禁止自造槽位）
  - `business.tp`：`{ test_params, test_results: {fixed, custom}, mr_ids, test_condition }`（`test_condition` 由 `110℃×24h` 规范为 `110C24H` 风格，与既有库存一致）
  - `business.fe/ru`：`{ condition_name/type/params, mr_ids }`、`{ service_name/type/params, fe_ids, mr_ids }`
  - `ml.formula`：`{ dataset_source, recipe_id, n_components, x_global: number[], x_global_names: GLOBAL_FIELDS, y_labels: {} }`
  - `ml.components[]`：`{ dataset_source, recipe_id, comp_index, material_id, ratio_pct, component_features: Record<CompField, value> }`（**48 键，缺列显式 `null`**）
- Consumes: `parseSchema.COMP_FIELDS/GLOBAL_FIELDS`（Task 2）、`ParsedRecord`（Task 3）

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { COMP_FIELDS, GLOBAL_FIELDS } from '../src/platform/parse/parseSchema.js'
import { projectRecord } from '../src/platform/parse/parseProjection.js'

const record = {
  recipe_id: 'r1', dataset_source: 'enterprise', name: '铁线配方A', formula_type: '铁线配方', batch_no: 'No.1',
  components: [{ material_id: '61', material_name: '棕刚玉', ratio_pct: 70, attrs: { SiC: 8.4, particle_size_min: 0.045 } },
               { material_id: '17', material_name: '97黑碳化硅', ratio_pct: 30, attrs: {} }],
  globals: { water_amount: 3.6, hardening_time: 10, hardening_time_uncertainty: 0 },
  tests: [{ name: '常温耐压', value: 50, unit: 'MPa' }], provenance: [],
}
const ids = { mc: () => 'MC_000009', mp: () => 'MP_000009', mr: () => 'MR_000009', tp: () => 'TP_000009', fe: () => 'FE_000009', ru: () => 'RU_000009' }

test('ML 组分特征恰好覆盖 48 列规范，缺列为 null', () => {
  const out = projectRecord(record, { idFactory: ids, existing: {} })
  assert.equal(out.ml.components.length, 2)
  assert.deepEqual(Object.keys(out.ml.components[0].component_features), COMP_FIELDS)
  assert.equal(out.ml.components[0].component_features.SiC, 8.4)
  assert.equal(out.ml.components[0].component_features.TiO2, null)
  assert.deepEqual(out.ml.formula.x_global_names, GLOBAL_FIELDS)
  assert.deepEqual(out.ml.formula.x_global, [3.6, 10, 0])
})

test('业务产物：MR 组分与输入比例一致，MP 固定槽为 32 位', () => {
  const out = projectRecord(record, { idFactory: ids, existing: {} })
  assert.deepEqual(out.business.mr.component_list.map((c) => c[3]), [70, 30])
  assert.equal(out.business.mp[0].fixed_properties.length, 32)
  assert.equal(out.business.mc[0].component_list[0][3], 100)
})

test('测试项映射为 tp（含 32 槽与 custom），并回填 mr.tp_ids', () => {
  const out = projectRecord(record, { idFactory: ids, existing: {} })
  assert.equal(out.business.tp.length, 1)
  assert.equal(out.business.tp[0].test_results.fixed.length, 32)
  assert.deepEqual(out.business.mr.tp_ids, [out.business.tp[0].tp_id])
})
```

- [ ] **Step 2: 运行确认失败** — `node --test tests/parseProjection.test.js` → FAIL（模块不存在）
- [ ] **Step 3: 实现投影**（接口见本任务 Interfaces；`component_features` 用 `Object.fromEntries(COMP_FIELDS.map((f) => [f, attrs[f] ?? null]))` 保证 48 键）
- [ ] **Step 4: 运行确认通过** — `node --test tests/parseProjection.test.js` → PASS
- [ ] **Step 5: 提交** — `feat(parse): project ParsedRecord into six business tables and the ML tables`

---

## Task 6: 后端事务化摄取（preview / commit）

**Files:** Create `backend_impl/src/routes/parseV2.js`、`backend_impl/src/services/parseIngestService.js`；Modify `backend_impl/src/index.js`；Create `backend_impl/test/parseIngest.test.js`

**Interfaces:**
- `POST /api/parse-v2/preview` body `{ records: ParsedRecord[], dataset_source: string }` → `{ issues: Issue[], plan: { counts: {mc,mr,mp,tp,fe,ru, ml_formula, ml_component}, newMaterials: number[] } }`（**不写库**）
- `POST /api/parse-v2/commit` body 同上 + `{ dryRun?: false }` → `{ ok: true, ids: {mr: string[], mc: string[], mp: string[], tp: string[]}, ml: {dataset_source, count} }`
- 事务：六表与 ML 表在同一 `BEGIN/COMMIT` 内；失败整体回滚；重复提交同 `dataset_source + recipe_id` 幂等（ML 表 UNIQUE 冲突时 upsert，业务表按 ML marker 先删后插，沿用 `materialize_ml_dataset.py` 的 marker 约定）
- 隐私：响应只回计数与 ID，不回样本值

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const tmpDb = path.join(os.tmpdir(), `parse-ingest-${Date.now()}.db`)
process.env.DB_PATH = tmpDb
const { initDatabase } = await import('../src/config/init-sqlite.js')
const { previewIngest, commitIngest } = await import('../src/services/parseIngestService.js')
const { record } = await import('./fixtures/parseRecord.js')

test('preview 只算计划、不写库', async () => {
  const db = await initDatabase(tmpDb)
  const plan = await previewIngest(db, { records: [record], dataset_source: 'enterprise' })
  assert.equal(plan.counts.mr, 1)
  assert.equal((await db.get('SELECT COUNT(*) c FROM mr_formula')).c, 0)
  assert.equal((await db.get('SELECT COUNT(*) c FROM ml_formula')).c, 0)
})

test('commit 后六表与 ML 表行数等于计划，且可重复提交（幂等）', async () => {
  const db = await initDatabase(tmpDb)
  const first = await commitIngest(db, { records: [record], dataset_source: 'enterprise' })
  const one = async (t) => (await db.get(`SELECT COUNT(*) c FROM ${t}`)).c
  assert.equal(first.ids.mr.length, 1)
  assert.equal(await one('mr_formula'), 1)
  assert.equal(await one('ml_formula'), 1)
  assert.equal(await one('ml_formula_component'), record.components.length)
  await commitIngest(db, { records: [record], dataset_source: 'enterprise' })
  assert.equal(await one('mr_formula'), 1)
  assert.equal(await one('ml_formula_component'), record.components.length)
  fs.rmSync(tmpDb, { force: true })
})
```

（`backend_impl/test/fixtures/parseRecord.js` 导出本计划 Task 5 测试中那份 `record`，避免两处漂移。）

- [ ] **Step 2: 运行确认失败** — `node --test backend_impl/test/parseIngest.test.js` → FAIL（服务不存在）
- [ ] **Step 2: 运行确认失败** → `node --test backend_impl/test/parseIngest.test.js`
- [ ] **Step 3: 实现服务与路由**（复用 `utils/idGenerator` 的 `generateMcId/MrId/MpId/TpId/FeId/RuId`；写入用参数化 SQL，沿用 `properties-def.toFixedAndCustomProperties`）
- [ ] **Step 4: 运行确认通过**（+ `node --test backend_impl/test/newDataFourTableContracts.test.js` 不回归）
- [ ] **Step 5: 提交** — `feat(parse): transactional ingest for six tables + ML tables`

---

## Task 7: 新解析工作台界面

**Files:** Create `src/platform/views/parse/{ParseWorkspaceView,ParseSourcePanel,ParseMappingTable,ParseIssueList}.vue`、`src/platform/api/parseV2.js`；Modify `src/platform/views/DataManagerView.vue`（parse 区挂载新工作台，`PARSE_TABS` 退化为单页）

**Interfaces:**
- `api/parseV2.js`：`previewParsed(payload)`→`POST /api/parse-v2/preview`；`commitParsed(payload)`→`POST /api/parse-v2/commit`
- `ParseWorkspaceView` 三区布局：左（`ParseSourcePanel`：粘贴/上传/下载字段模板/示例）→ 中（`ParseMappingTable`：组分与测试可编辑、可绑定既有 MC/MP）→ 右（`ParseIssueList`：错误阻断提交、警告可确认继续、提交后显示生成的 MR/ML ID，并提供「立即预测」跳 `/platform/model1` 并预填 X_comp/X_global）
- 复用：`MaterialSelectModal.vue`（选既有原料）、`utils/propertyMeasurements.js`（单位与物性输入）

- [ ] **Step 1: 写失败的组件契约测试**（`tests/parseWorkspace.test.js`，用 `tests/helpers/renderSfc.js` 编译 SFC）

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mountSfcWithMemoryRouter } from './helpers/mountSfcWithMemoryRouter.js'

test('粘贴企业 JSON 后渲染组分行，比例不足 100% 时禁止提交', async () => {
  const { wrapper } = await mountSfcWithMemoryRouter('src/platform/views/parse/ParseWorkspaceView.vue')
  await wrapper.vm.$nextTick()
  wrapper.vm.sourceText = JSON.stringify({ records: [{ name: 'A', components: [{ material_id: '61', ratio_pct: 70 }] }] })
  await wrapper.vm.runPreview()
  assert.equal(wrapper.vm.mappingRows.length, 1)
  assert.equal(wrapper.vm.canCommit, false)
  assert.ok(wrapper.vm.issues.some((i) => i.code === 'RATIO_NOT_100'))
})

test('提交成功后展示生成的 MR 与 ML 计数', async () => {
  const { wrapper } = await mountSfcWithMemoryRouter('src/platform/views/parse/ParseWorkspaceView.vue')
  wrapper.vm.mappingRows = [{ material_id: '61', ratio_pct: 100, attrs: {} }]
  wrapper.vm.stubCommit = async () => ({ ok: true, ids: { mr: ['MR_000009'] }, ml: { dataset_source: 'enterprise', count: 1 } })
  await wrapper.vm.commit()
  assert.equal(wrapper.vm.result.ids.mr[0], 'MR_000009')
  assert.equal(wrapper.vm.result.ml.count, 1)
})
```

- [ ] **Step 2: 运行确认失败** — `node --test tests/parseWorkspace.test.js` → FAIL（组件不存在）
- [ ] **Step 3: 实现工作台与 API 客户端**（接口见本任务 Interfaces；`stubCommit` 仅测试注入点）
- [ ] **Step 4: 运行确认通过** — `node --test tests/parseWorkspace.test.js` → PASS
- [ ] **Step 5: 浏览器实测**（Vite :3005，需重启前端）：粘贴 `enterprise_input_template.json` 的一条 record → 预览 → 提交 → 六表页签出现新行、ML 数据集页签计数 +1
- [ ] **Step 6: 提交** — `feat(parse): new parse workspace wired to preview/commit`

---

## Task 8: ML 表口径对齐（48 列）

**Files:** Modify `backend_impl/scripts/load_ml_dataset.py`、`src/platform/components/MlDatasetView.vue`；Create `backend_impl/src/config/ml-schema.js`

**Interfaces:**
- `load_ml_dataset.py [npy] [db]` 自动读取 npy `metadata[*].X_comp_names`；写入 `ml_dataset_meta.comp_feature_names` 时校验列集合 ∈ 规范 48 列，否则拒绝并提示（防止再次写入 51 列口径）
- `ml_dataset_meta.dataset_version`：新数据写 `'v2'`；旧的 51 列行保持 `'v1'` 不清洗
- `MlDatasetView.vue` 在概览处标注 `dataset_version`，并在列数与规范不符时显示 ⚠ 提示

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { COMP_FIELDS } from '../src/config/ml-schema.js'
import { assertSchemaCompatible } from '../src/config/ml-schema.js'

test('规范 schema 恰为模型契约的 48 列', () => {
  assert.equal(COMP_FIELDS.length, 48)
  assert.deepEqual(COMP_FIELDS.slice(0, 5), ['material_id', 'ratio_pct', 'particle_size_min', 'particle_size_max', 'base'])
})

test('51 列（mean/std + reserved）被拒绝并给出差异', () => {
  const legacy = [...COMP_FIELDS.slice(0, 2), 'particle_size_mean', 'particle_size_std', 'base', 'reserved_feature_1']
  const res = assertSchemaCompatible(legacy)
  assert.equal(res.ok, false)
  assert.deepEqual(res.unknown, ['particle_size_mean', 'particle_size_std', 'reserved_feature_1'])
  assert.deepEqual(res.missing, ['particle_size_min', 'particle_size_max', 'component_batch'])
})

test('48 列规范数据通过校验', () => {
  assert.equal(assertSchemaCompatible([...COMP_FIELDS]).ok, true)
})
```

- [ ] **Step 2: 运行确认失败** — `node --test backend_impl/test/mlSchema.test.js` → FAIL（模块不存在）
- [ ] **Step 3: 实现 `ml-schema.js`**（`COMP_FIELDS` 与前端 `parseSchema.js` 同源同序；`assertSchemaCompatible(cols)` 返回 `{ok, unknown, missing, ordered}`）
- [ ] **Step 4: 运行确认通过** — `node --test backend_impl/test/mlSchema.test.js` → PASS
- [ ] **Step 5: 用交接包数据重摄取**（本地执行，落在 `private/`）：
```bash
cp _ref/handover/ML/datasetv2.npy private/datasetv2_handover.npy
python3 backend_impl/scripts/load_ml_dataset.py private/datasetv2_handover.npy backend_impl/data/sqlite/database.db
```
Expected: `ml_dataset_meta` 出现 `dataset_version='v2'` 的 3 行；`ml_formula` 计数不减少（v1 行保留）
- [ ] **Step 6: 提交** — `feat(ml): enforce the 48-column schema when ingesting ML datasets`

---

## Task 9: 端到端验收与文档

**Files:** Modify `docs/API_contact.md`（新增 `/api/parse-v2/*` 契约）、`src/platform/views/DataPlatformHome.vue`（卡片文案与新范式一致）

- [ ] **Step 1: 全链路实测**（浏览器 + HTTP 双证）
  1. `POST /api/parse-v2/preview` 返回 plan 计数且库内无新增行（`SELECT COUNT(*)` 前后相等）
  2. 界面提交 → `SELECT` 六表各出现 1 行、`ml_formula` +1、`ml_formula_component` +(n_components)
  3. 用同一份输入调 `POST /api/v1/predict/simple`（`X_comp` 取 `[material_id, ratio_pct]` 短行、`X_global` 取 3 列）→ 返回四项属性预测，`variant='yangquan'`
- [ ] **Step 2: 回归**：`/platform/data/old` 仍可打开并完成一次旧流程提交；`npm run test:*` 全绿
- [ ] **Step 3: 提交** — `docs(parse): document parse-v2 endpoints and new paradigm`

---

## 验收标准（本计划的 Definition of Done）

1. `/platform/data?tab=parse` 呈现新工作台：一次解析同时产出六表与 ML 表，且**提交前可预览、可按字段告警阻断**
2. `/platform/data/old` 保留旧界面，旧流程（粘贴→解析→提交）仍可完成（回归通过）
3. 解析产物可直接用于预测：同一份输入 → `predict/simple` 返回四项性能预测
4. `ml_dataset_meta.comp_feature_names` 与模型/企业模板 48 列逐列一致；`dataset_version` 可区分 v1/v2
5. 新增测试全绿且既有测试不回归：`tests/parse*.test.js`、`backend_impl/test/parseIngest.test.js`、`backend_impl/test/mlSchema.test.js`、既有 `platformFourTableContracts` / `newDataFourTableContracts` / `routeAccess` / `ascLabExperience`

## 待你确认的三个决策（默认值已在计划中采用）

1. **规范字段**：以预测模型 48 列为唯一真源（而非沿用库里旧的 51 列）—— 计划默认如此
2. **旧界面保留方式**：`/platform/data/old` + 导航「解析（旧版）」（而非删除或改为下载包）
3. **输入格式第一版范围**：JSON / YAML / 文本 / CSV（Excel 与 PDF 留待后续）
