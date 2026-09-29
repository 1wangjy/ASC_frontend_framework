# 六张业务表 ↔ 预测链路打通 实施计划（原料 base 名注册与 one-hot 对齐）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让六张业务表里的原料/配方能被解析成「base 规范名 + 模型 material_id + 配比」，从而正确落到预测模型的 one-hot 位（`material_id__<id>_frac`），并支持在原料业务表中管理 base 名（不合规 base 不得入表、可新建映射规则使其入表）。

**Architecture:** 新增「原料 base 注册表 + 解析规则表」作为单一真源，并双写一份版本化 JSON（`data/material_base_map.json`）；所有写入 mc/mr 的路径（数据管理新增、解析提交）先过 `resolveMaterialBase` 闸门；未命中即 400 并回传可一键新建规则的载荷。预测侧新增 `POST /api/predict/from-formula`：由 base/material_id + 配比组装 `X_comp` 短行与 `X_global`，复用 `predictProxy` 调 8100 的 `/api/v1/predict/simple`，并附「变体词表覆盖报告」。

**Tech Stack:** Node/Express + sqlite3（`backend_impl/src`，:3001）；Vue 3（`src/platform`）；Python 模型服务（`backend_impl/python/model_predict`，:8100）；测试 `node --test`。

## Global Constraints

- **one-hot 词表是变体相关的**（实测）：`yangquan` 26 位、`processed` 89 位；列名形态 `material_id__<material_id>_frac`。词表从各变体 bundle 的 `input_feature_columns` 解析得出，**不得硬编码**。
- **base 名全集来自交接数据**：`_ref/handover/ML/datasetv2.npy` 中 89 个 `material_id` 均**唯一**对应一个 `base` 名（实测：89/89，无一对多），据此作为注册表种子。
- 现有 `FEATURE/outputs/material_map.json` 只有 26 条（源自 yangquan.npy），**必须重建为 89 条**再作为前端展示来源。
- 六表 `component_list` 元组形态：`[name, refId, meta, ratio]`；`meta` 现为字符串 `'{}'`，本计划升级为对象 `{base_id, material_id, raw}`，读取端必须兼容旧字符串。
- 业务表 ID 生成沿用 `backend_impl/src/utils/idGenerator`（`generateMcId/MrId/MpId/TpId/FeId/RuId`）；base/规则 ID 用 `BASE_%06d` / `MBR_%06d`（同风格）。
- **不合规 base 不得入表**：两处 mc 写入路径（`POST /api/new-data/mc`、`POST /api/recipe-parser/submit`）必须闸门化，返回 400 + `code: 'UNRESOLVED_BASE'`。
- JSON 与表必须一致：任何写操作后同步导出 `data/material_base_map.json`（含 `version`、`updated_at`）；`data/` 已在 `.gitignore`。
- 隐私：接口响应不得回显 ML 原始样本值（沿用既有约定）。

---

## 现状事实（勘察结论）

| 项 | 实测值 |
|---|---|
| 模型 one-hot 位 | `material_id__<id>_frac`；`yangquan` 26 位、`processed` 89 位（`input_feature_columns` = 266 / 335）|
| id↔base 全集 | `datasetv2.npy`：89 个 id，**每个 id 恰好一个 base 名**（示例 `61→棕刚玉`、`17→97黑碳化硅`、`27→CA71水泥`）|
| 现有映射文件 | `backend_impl/python/model_predict/FEATURE/outputs/material_map.json`：26 条 `{material_id,name,samples}`；由 `scripts/build_material_map.py` 从 npy 生成 |
| 业务表现状 | `mc_material` 3 行（样例），`component_list = [["高铝铝土","MP_000001","{}",100]]`；`mr_formula` 2 行，组分为自由文本名 + `MC_*` |
| 断链点 | 业务表**没有** base/material_id 字段；预测只能吃 `material_id + ratio_pct` → 表里数据无法直接预测 |
| 写入路径 | ① `POST /api/new-data/mc`（数据管理新增，前端 `submitAddMc`）；② `POST /api/recipe-parser/submit`（解析提交，控制器直写 mp/mc/tp/mr）|
| 相关工具 | `types/entities.js#validateComponentRows`（配比校验）、`#resolveComponentSelection`（MC/MP 选择）；`MaterialSelectModal.vue`（选材）|

---

## File Structure

**Create — 后端**
- `backend_impl/src/config/material-base-schema.js` — 建表 DDL（`material_base` / `material_base_rule` / `material_vocab`）+ 迁移函数
- `backend_impl/src/services/materialBaseService.js` — 注册表 CRUD、JSON 双写/引导、`resolveMaterialBase(rawName)`、`decomposeMaterialName(rawName)`、`coverageReport(variant, materials)`
- `backend_impl/src/services/vocabService.js` — 从各变体 joblib 解析 one-hot 词表 → `material_vocab`；缓存与刷新
- `backend_impl/src/routes/materialBase.js` — `GET/POST/PUT /api/material-base/*`（含 `/rules`、`/resolve`、`/export`、`/import`）
- `backend_impl/src/routes/predictFormula.js` — `POST /api/predict/from-formula`
- `backend_impl/scripts/seed_material_base.py` — 从 `datasetv2.npy` 生成 89 条种子 + 重建 `material_map.json`（一次性，可重复执行）

**Create — 前端**
- `src/platform/views/manage/MaterialBasePanel.vue` — 「原料 base 名管理」页签（列表/新增/别名/启用禁用/规则管理/导入导出/覆盖度）
- `src/platform/components/BaseRuleDialog.vue` — 未解析原料时弹出的「新建 base 映射规则」对话框（含建议与拆解预览）
- `src/platform/api/materialBase.js` — API 客户端

**Modify**
- `backend_impl/src/index.js` — 挂载新路由 + 启动时 `ensureMaterialBaseSchema()`
- `backend_impl/src/routes/newData.js`（或对应 controller）— mc 写入前闸门
- `backend_impl/src/controllers/recipeParserController.js` — 解析提交前闸门 + `component_list.meta` 升级
- `src/platform/views/DataManagerView.vue` — `MANAGE_TABS` 增加「原料 base 名」子标签；`submitAddMc` 错误分支改为弹出规则对话框
- `src/platform/api/newData.js` — 保留；错误载荷透传
- `src/platform/components/ComponentListEditor.vue` / `MaterialSelectModal.vue` — 选择器按 base 分组，展示 `base（id）`
- `src/platform/views/Model1View.vue` — 增加「从配方表带入」（选 mr → 自动填 X_comp/X_global）+ 覆盖度提示
- `src/platform/types/entities.js` — 新增 `resolveBaseMeta(component)`（兼容 `'{}'` 与对象 meta）

**Tests**
- Create: `tests/materialBaseResolve.test.js`、`tests/materialBaseSchema.test.js`、`backend_impl/test/materialBaseGate.test.js`、`backend_impl/test/predictFromFormula.test.js`、`tests/materialBasePanel.test.js`
- Modify: `tests/platformFourTableContracts.test.js`（若断言 `'{}'` 元组形态则同步）

---

## Task 1: 注册表 schema + 种子（89 条） + JSON 双写

**Files:**
- Create: `backend_impl/src/config/material-base-schema.js`、`backend_impl/src/services/materialBaseService.js`、`backend_impl/scripts/seed_material_base.py`
- Test: `backend_impl/test/materialBaseSchema.test.js`

**Interfaces:**
- Produces:
  - `ensureMaterialBaseSchema(db)` → 建三表（幂等）
  - `materialBaseService.listBases({keyword, enabled}) / upsertBase({base_name, material_id, aliases, category}) / addRule({kind, pattern, target_base_id, priority})`
  - `materialBaseService.exportJson()` → 写 `data/material_base_map.json`，返回 `{version, updated_at, bases, rules}`
  - `materialBaseService.bootstrapFromJson()` → 首次启动从 JSON 灌入（表为空时）
- 表结构：
  ```sql
  CREATE TABLE IF NOT EXISTS material_base (
    base_id TEXT(9) PRIMARY KEY, base_name TEXT NOT NULL UNIQUE, material_id TEXT,
    category TEXT, aliases TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1,
    source TEXT DEFAULT 'manual', create_time TIMESTAMP, update_time TIMESTAMP);
  CREATE TABLE IF NOT EXISTS material_base_rule (
    rule_id TEXT(9) PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('exact','alias','normalize','regex','keyword')),
    pattern TEXT NOT NULL, target_base_id TEXT NOT NULL REFERENCES material_base(base_id),
    priority INTEGER NOT NULL DEFAULT 100, enabled INTEGER NOT NULL DEFAULT 1, note TEXT,
    create_time TIMESTAMP, update_time TIMESTAMP);
  CREATE TABLE IF NOT EXISTS material_vocab (
    variant TEXT NOT NULL, material_id TEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (variant, material_id));
  ```

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, readFileSync } from 'node:fs'

const tmp = mkdtempSync(path.join(os.tmpdir(), 'mbase-'))
process.env.DB_PATH = path.join(tmp, 'db.sqlite')
const { ensureMaterialBaseSchema } = await import('../src/config/material-base-schema.js')
const svc = await import('../src/services/materialBaseService.js')

test('建表幂等且可写入 base 与规则', async () => {
  const db = await ensureMaterialBaseSchema()
  await svc.upsertBase({ base_name: '棕刚玉', material_id: '61', aliases: ['白刚玉一级'] })
  await svc.addRule({ kind: 'keyword', pattern: '刚玉', target_base_id: (await svc.listBases({}))[0].base_id })
  assert.equal((await svc.listBases({})).length, 1)
  assert.equal((await svc.listBases({})).length, (await svc.listBases({})).length) // 幂等
})

test('导出 JSON 含版本与全部 base，且文件落在 data/', async () => {
  const json = await svc.exportJson()
  assert.ok(json.version && json.updated_at)
  assert.equal(json.bases.length, (await svc.listBases({})).length)
  const onDisk = JSON.parse(readFileSync(json.path, 'utf8'))
  assert.deepEqual(onDisk.bases.map(b => b.base_name), json.bases.map(b => b.base_name))
})

test('bootstrap 从 JSON 灌入（表空时）且不重复', async () => {
  const first = await svc.bootstrapFromJson()
  const second = await svc.bootstrapFromJson()
  assert.equal(second.inserted, 0)
  assert.ok(first.inserted >= 0)
})
```

- [ ] **Step 2: 运行确认失败** — `node --test backend_impl/test/materialBaseSchema.test.js` → FAIL（模块不存在）
- [ ] **Step 3: 实现 schema + service + 种子脚本**；种子脚本从 `_ref/handover/ML/datasetv2.npy` 读 89 组 `(material_id, base)`，写出 `data/material_base_map.json`（`source: 'datasetv2'`），并重建 `FEATURE/outputs/material_map.json` 为 89 条
- [ ] **Step 4: 运行确认通过**；并核对 `material_map.json` 条数：`python3 -c "import json;print(len(json.load(open('backend_impl/python/model_predict/FEATURE/outputs/material_map.json'))['materials']))"` → **89**
- [ ] **Step 5: 提交** — `feat(material-base): registry schema, 89-basis seed and versioned JSON mirror`

---

## Task 2: 名称解析 `resolveMaterialBase`（归一化/别名/规则/拆解/建议）

**Files:**
- Modify: `backend_impl/src/services/materialBaseService.js`
- Test: `tests/materialBaseResolve.test.js`

**Interfaces:**
- Produces:
  - `decomposeMaterialName(raw)` → `{ normalized, brand, form, matrix, tokens[] }`（如 `'97黑碳化硅'` → `{brand:'97', matrix:'黑碳化硅', form:''}`；`'325目棕刚玉细粉'` → `{matrix:'棕刚玉', form:'细粉', spec:'325目'}`）
  - `resolveMaterialBase(raw)` → `{ resolved: boolean, base?: {base_id, base_name, material_id}, via: 'exact'|'alias'|'normalize'|'rule'|'decompose', suggestions: string[] }`
  - 归一化：全角→半角、去空白/破折号/括号、单位与目数/粒径后缀剥离（`325目`、`1-3mm`、`0-1mm`）、`Al2O3` 等大小写统一

- [ ] **Step 1: 写失败测试（含对抗样本）**

```js
const cases = [
  ['棕刚玉', 'exact'],
  ['９７黑碳化硅', 'normalize'],      // 全角数字
  ['97黑碳化硅 ', 'normalize'],
  ['325目棕刚玉', 'decompose'],
  ['棕刚玉细粉', 'decompose'],
  ['白刚玉一级', 'alias'],
  ['高铝铝土', null],                  // 未命中 → 有建议、不臆造
]
test('名称解析：命中路径与未命中建议', async () => {
  for (const [raw, expectVia] of cases) {
    const r = await resolveMaterialBase(raw)
    if (expectVia) {
      assert.equal(r.resolved, true, `${raw} 应命中`)
      assert.equal(r.via, expectVia, `${raw} 命中路径`)
      assert.ok(r.base.material_id, `${raw} 应带 material_id`)
    } else {
      assert.equal(r.resolved, false, `${raw} 不应臆造`)
      assert.ok(r.suggestions.length >= 1, `${raw} 应给出候选`)
    }
  }
})

test('拆解结果可直接用于新建别名/规则', () => {
  const d = decomposeMaterialName('325目棕刚玉细粉')
  assert.equal(d.matrix, '棕刚玉')
  assert.equal(d.form, '细粉')
  assert.match(d.spec, /325/)
})
```

- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（优先级：exact base_name → aliases → normalize → rules(priority) → decompose 候选；`suggestions` 用「矩阵名 + 编辑距离」排序，绝不自动写库）
- [ ] **Step 4: 运行确认通过**
- [ ] **Step 5: 提交** — `feat(material-base): name normalisation, rule engine and decomposition`

---

## Task 3: 规则/注册表 API（支持"新建映射规则即可入库"）

**Files:** Create `backend_impl/src/routes/materialBase.js`；Modify `backend_impl/src/index.js`

**Interfaces（HTTP）:**
- `GET /api/material-base` → `{bases:[...], stats:{total, mapped, unmapped}}`
- `POST /api/material-base` body `{base_name, material_id?, aliases?, category?}` → 新增 base；`material_id` 为空=未映射（可入库但预测覆盖报告会标记）
- `POST /api/material-base/rules` body `{kind, pattern, target_base_id, priority?}` → 新增规则并立即生效
- `POST /api/material-base/resolve` body `{name}` → 解析结果（供前端预览）
- `GET /api/material-base/export` → JSON（同时刷新磁盘文件）；`POST /api/material-base/import`（合并模式）

- [ ] **Step 1: 写失败测试**（`backend_impl/test/materialBaseApi.test.js`，supertest 风格直接调 router 或 `fetch` + 起临时 app）：新增规则后同一名称可解析；未授权删除 base 时若被 mc 引用 → 409；导出后再导入不产生重复
- [ ] **Step 2-4: 红 → 实现 → 绿**
- [ ] **Step 5: 提交** — `feat(material-base): CRUD + rule API + import/export`

---

## Task 4: 入库闸门（两条 mc 写入路径）

**Files:** Modify `backend_impl/src/controllers/recipeParserController.js`、`backend_impl/src/routes/newData.js`（mc 分支）；Create `backend_impl/test/materialBaseGate.test.js`

**Interfaces:**
- 闸门函数 `assertMaterialBaseResolved(components)` → 全部解析成功返回增强后的 components（meta 升为 `{base_id, material_id, raw}`）；任一未解析抛 `{code:'UNRESOLVED_BASE', raw, suggestions, ruleTemplate}` → 由路由映射为 **400**
- `component_list` 元组第 3 位升级：`{"base_id":"BASE_000061","material_id":"61","raw":"97黑碳化硅"}`；读取侧兼容旧 `'{}'`

- [ ] **Step 1: 写失败测试**

```js
test('未解析原料被拒绝且载荷可用于一键建规则', async () => {
  const res = await postMc({ component_list: [['高铝铝土', 'MP_000001', '{}', 100]] })
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'UNRESOLVED_BASE')
  assert.ok(res.body.raw.includes('高铝铝土'))
  assert.ok(res.body.ruleTemplate && res.body.ruleTemplate.kind)
})

test('新建规则后同一名称可入库，且 meta 带 base_id 与 material_id', async () => {
  await addRule({ kind: 'alias', pattern: '高铝铝土', target_base_id: baseIdOf('80均质矾土') })
  const ok = await postMc({ component_list: [['高铝铝土', 'MP_000001', '{}', 100]] })
  assert.equal(ok.status, 200)
  const meta = JSON.parse((await getMc(ok.body.data.mc_id)).component_list)[0][2]
  assert.equal(meta.material_id, '9')
  assert.ok(meta.base_id)
})
```

- [ ] **Step 2-4: 红 → 实现 → 绿**（同时跑 `backend_impl/test/newDataFourTableContracts.test.js` 防回归）
- [ ] **Step 5: 提交** — `feat(material-base): gate mc inserts and upgrade component meta`

---

## Task 5: 变体词表覆盖（one-hot 位对齐）

**Files:** Create `backend_impl/src/services/vocabService.js`；Modify `material-base-schema.js`（`material_vocab`）

**Interfaces:**
- `refreshVocab()` → 遍历 `MODEL/outputs_selective_selector/models/*/*.joblib`，解析 `input_feature_columns` 中 `material_id__<id>_frac` → 写 `material_vocab(variant, material_id)`
- `coverageReport(variant, materialIds)` → `{variant, known:[], unknown:[], hitRate, vocabSize, recommendedVariant}`（`recommendedVariant` = 覆盖率最高者）
- `GET /api/material-base/vocab?variant=` → 词表大小与覆盖统计

- [ ] **Step 1: 写失败测试**：对 `yangquan` 词表规模断言 26、`processed` 断言 89（来自实测）；`coverageReport('yangquan', ['61','999'])` → `known=['61']`、`unknown=['999']`、`recommendedVariant='processed'`
- [ ] **Step 2-4: 红 → 实现 → 绿**
- [ ] **Step 5: 提交** — `feat(predict): variant vocabulary coverage report`

---

## Task 6: 预测打通 `POST /api/predict/from-formula`

**Files:** Create `backend_impl/src/routes/predictFormula.js`；Modify `backend_impl/src/index.js`；Test `backend_impl/test/predictFromFormula.test.js`

**Interfaces:**
- 入参二选一：`{ mr_id }` 或 `{ components:[{base_name|material_id, ratio_pct}], globals?:{water_amount,hardening_time,hardening_time_uncertainty}, conditions?, properties?, variant? }`
- 流程：解析组件 → `X_comp = [[material_id, ratio_pct], …]`（**短行**，模型侧补 48 列）→ `X_global` 3 列（缺省用 0/空）→ 复用 `predictProxy` 转发 `/api/v1/predict/simple` → 返回预测 + `coverage` + 解析明细（每行 raw → base → id）
- 覆盖度不足（unknown > 0）时附 `warnings: [{code:'MATERIAL_NOT_IN_VOCAB', message, bases}]` 并给 `recommendedVariant`

- [ ] **Step 1: 写失败测试**（对本地 8100 打真请求；若不可用则跳过并显式报错，不静默通过）：`{components:[{base_name:'棕刚玉',ratio_pct:70},{base_name:'97黑碳化硅',ratio_pct:30}], conditions:['110℃'], properties:['bulk_density']}` → 200、`predictions[0].value` 为有限数、`coverage.unknown` 为空；含未知原料时 `warnings` 含 `MATERIAL_NOT_IN_VOCAB`
- [ ] **Step 2-4: 红 → 实现 → 绿**
- [ ] **Step 5: 提交** — `feat(predict): predict directly from business-table formula`

---

## Task 7: 前端（base 名管理页签 + 未解析弹窗 + 从配方表带入）

**Files:** Create `src/platform/views/manage/MaterialBasePanel.vue`、`src/platform/components/BaseRuleDialog.vue`、`src/platform/api/materialBase.js`；Modify `DataManagerView.vue`（`MANAGE_TABS` 增加「原料 base 名」）、`ComponentListEditor.vue`/`MaterialSelectModal.vue`（按 base 分组显示 `base（id）`）、`Model1View.vue`（「从配方表带入」+ 覆盖提示）

**Interfaces:**
- `MANAGE_TABS` 追加 `{ key: 'mbase', label: '原料 base 名' }`（放在「原料表」之后）
- `MaterialBasePanel`：列表（base 名 / material_id / 别名 / 引用数 / 启用）、新增、规则管理、导出/导入、覆盖度卡片（各变体已知/未知）
- 未解析原料入库失败 → 打开 `BaseRuleDialog`（kind 选择、pattern 预填 raw、target 选择、拆解预览与建议），提交后**自动重试入库**

- [ ] **Step 1: 写失败的组件契约测试**（`tests/materialBasePanel.test.js`，用 `tests/helpers/renderSfc.js`）：面板渲染 base 列表；未解析错误负载 → 打开对话框并预填 pattern；提交规则后发出重试事件
- [ ] **Step 2-4: 红 → 实现 → 绿**
- [ ] **Step 5: 浏览器实测**：新增 base → 新增 mc（未映射名先被拒 → 建规则 → 重试成功）→ 检查 `component_list` meta；Model1「从配方表带入」→ 预测返回结果与覆盖度
- [ ] **Step 6: 提交** — `feat(material-base): management tab, rule dialog and predict-from-formula entry`

---

## Task 8: 端到端验收 + 文档

- [ ] **Step 1: 全链路实测（命令 + 浏览器双证）**
  1. `mc_material`/`mr_formula` 现有 3+2 行 → 用 `POST /api/predict/from-formula {mr_id:'MR_000001'}`：因 `'高铝铝土'` 未映射 → 400 `UNRESOLVED_BASE`（**证明闸门有效**）
  2. 建规则 `alias: 高铝铝土 → 80均质矾土`，并把 `'碳化硅'→97黑碳化硅`、`'金属铝粉'→?`（若无对应 base 则**新建 base**）后重试 → 200 + 预测值
  3. 覆盖度：同一配方分别用 `yangquan` / `processed` → 报告未知原料数与 `recommendedVariant`
- [ ] **Step 2: 回归**：`npm run test:*` 全绿；`backend_impl/test/*materialBase*`、`predictFromFormula` 全绿；四表契约测试不回归
- [ ] **Step 3: 文档**：`docs/API_contact.md` 增补 `/api/material-base/*` 与 `/api/predict/from-formula` 契约；`API/INTERFACE.md` 说明 one-hot 词表随变体变化与覆盖度提示
- [ ] **Step 4: 提交** — `docs(material-base): contract + end-to-end verification notes`

---

## 验收标准（Definition of Done）

1. `material_base` 至少含 89 条（来自 datasetv2 种子），`FEATURE/outputs/material_map.json` 重建为 89 条
2. 不合规 base 名**无法**写入 mc（两条路径都被 400 拒绝，载荷含 raw + 建议 + 规则模板）
3. 新建映射规则后，同一名称可成功入库，且 `component_list.meta` 含 `base_id` 与 `material_id`
4. `data/material_base_map.json` 与表内容一致（导出/导入双向幂等）
5. 给定 mr 或组件清单，`POST /api/predict/from-formula` 返回四项属性预测，并附变体覆盖报告（未知原料 ↔ one-hot 全 0 的关系显式可见）
6. 前端可从「原料 base 名」页签管理 base 与规则；预测页可「从配方表带入」

## 待确认的三个决策（默认值已写入计划）

1. **base 全集基准** = 交接 `datasetv2.npy` 的 89 条（唯一映射，覆盖最广）；`material_map.json` 相应从 26 条重建为 89 条 —— 默认采用
2. **未映射 base 是否允许入库** = 允许入库但 `material_id` 为空，预测时进入 unknown 并给告警（而不是直接拒绝）—— 默认采用；若你要"未映射一律拒绝"我改成硬闸门
3. **默认预测变体** = 仍为 `yangquan`，但覆盖报告会在 `processed` 覆盖更高时给出切换建议 —— 默认采用
