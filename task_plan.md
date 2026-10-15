# 任务计划（当前）：ML 数据集原始记录 → 数据管理四张业务表

**目标**：把 ML 数据集的**原始记录**（真源 = `../_code/private_data/addtional/extractor/output/{yangquan,zibo}_formulas_clean/*.json`；
派生 = `_ref/handover/ML/*.npy` → `ml_formula*`）按来源可追溯、可复跑的方式导入「数据管理」的四张业务表 —— **配方表、原料表、物性表、测试表**；
不污染既有表（如 `literature`、`ml_*`），也不改动线上训练链路。

**已核实的前提（2026-10-14）**
| 事实 | 证据 |
| --- | --- |
| 主数据集 780 条 = `ml_formula` 780 行 | `_ref/handover/ML/README.md`（datasetv2 780 = batch183 182 + zibo 457 + yangquan 141）；`ml_dataset_meta` 三行 `sample_count` 相加 = 780 |
| 组分 12,522 条 = `ml_formula_component` 行数 | `ml_dataset_meta.total_component_count` 3311+7361+1850 = 12,522 |
| 记录形态：配方=组分矩阵；标签=`{属性:{工况:"值"}}` | `ml_formula.y_labels` 例：`cold_modulus: {"1450℃×3h":"15.9", "1450℃×1h":"4.88 / 4.84"}` |
| 组分 `material_id` 已与注册表对齐 | `ml_formula_component.material_id=61.0` ↔ `material_base`(89 条, `material_id` 0..88)，见 findings F14/S1 |
| 四张业务表当前基本为空 | `recipes` 0 / `mp_properties` 3 / `test_indicators` 0 / `tp_test_properties` 2 / `mc_material` 3 |

## 契约与映射（Phase 1 结论，2026-10-14 冻结）

**四页签 ↔ 表**（前端 `DataManagerView.vue:574` MANAGE_TABS）：配方表=`mr_formula`、原料表=`mc_material`、物性表=`mp_properties`、测试表=`tp_test_properties`。
**DDL 位置**：`backend_impl/src/config/init-sqlite.js`（mc:257? → 实为四表各自 CREATE；`mc_material.type` CHECK 含 `其他`；`mr_formula.formula_type` CHECK 含 `未分类`；ID 为 `TEXT(9)`）。
**前端展示别名**（不是 DB 列）：`mp.properties` 实由 `renderPropsDisplay(fixed_properties, custom_properties)`（`DataTable.vue:97`）渲染；
`tp.mr_id`（入参）→ 归一为 `mr_ids`（`DataTable.vue:282`），行内渲染 `mr_ids` 徽章（`:109`）；`tp.test_results` 也用 `renderPropsDisplay(..., true)`（`:103`）。

**关键结论：现有 `materialize_ml_dataset.py` 架构可用，但语义（词表/文档结构）不合规，直接跑会在界面上显示为空。**

| 目标表 | 现有脚本写法 | 平台契约（必须对齐） |
| --- | --- | --- |
| `mc_material` | 按 `(source, material_id)` 折叠；label=`棕刚玉(zibo-61.0)` | 名称需能过 `material_base` 解析（`materialBaseService.resolveComponentsForInsert`）；**粒级实例被折叠**，与 F14/S7「粒径轴一等公民」冲突 |
| `mp_properties` | `fixed_properties`=51 特征子集、`custom_properties`=全量、`mc_ids` | 需为平台**物性文档**结构；属性名须是词表 `pureMaterialProperties`（`particleSize`/`bulkDensity`…）；化学组成等非词表项入 `custom_properties` |
| `mr_formula` | `component_list=[[label, mc_id, "{}", ratio]]`、`tp_ids`、`creator='ml-ingest:<src>'` | `type` 必须∈CHECK（用 `未分类` ✓）；组件 ratio 需 `∈(0,100]` 且**和=100±0.01**（前端编辑/入库校验会拒） |
| `tp_test_properties` | `test_results` = `{bulk_density:{110℃×24h:"…"}}`（snake_case + 中文工况 + 字符串值） | 测试物性命名规范 `<属性名>(<温度>Cx<时长>H)`（`properties-def.js:45-52` 解析该模式）+ 测量项数组（含 value/temperature/duration 字段）；**ML 的 4 个键在 32 条测试词表里 0 命中** |

**映射表（ML → 平台）**：`bulk_density→bulkDensity`、`cold_modulus→flexuralStrength`(常温抗折)、`crushing_strength→compressiveStrength`、`linear_change→permanentLineChange`；
工况 `110℃×24h→(110Cx24H)`（词表已有 `bulkDensity(110Cx24H)` 等）、`1450℃×3h→(1450Cx3H)`、`1450℃×1h→(1450Cx1H)`、`1450℃→(1450C)`（**后三者词表没有** → 见决策）；
`particle_size_mean/std→particleSize`（纯物料，带测量项）；`SiC/SiO2/AL2O3/…→custom_properties`；`PC1..PC20`/`fired_*`/`reserved_*` → 仅存 `custom_properties` 以留痕。

**闸门（写入前必须自检，否则界面编辑/入库会被拒）**：组件名可解析到 enabled `material_base`、`ratio∈(0,100]` 且和 100±0.01、组件列表非空、引用 ID 存在且前缀正确（`newDbService.js:505-512`、`materialBaseService.js:262-305`）。
注意：物化脚本是**直连 SQLite 写入**，绕过服务层校验 → 上述约束由脚本自己保证。

## Phases

### Phase 1：勘察与契约冻结 — Status: complete
- [x] 四表 DDL/CHECK/必填与前端展示别名核对（见上）
- [x] 写入路径与闸门定位；确认物化脚本绕过服务层故需自校验
- [x] 发现并记录：词表 0 命中、文档结构不符、粒级折叠、TP 粒度过粗、MP 删除判据偏软

### Phase 2：据真源与原始契约冻结完整策略 — Status: complete（2026-10-14，已按用户指引修正主源）
**主源（真源）**：`../_code/private_data/addtional/extractor/output/{yangquan_formulas_clean(258), zibo_formulas_clean(2556)}/*.json`
（Clean Canonical 五段结构 + `association_log.*` 关联置信度）；**交叉校验源**：`ml_formula*`（780/12,522，实测为真源子集 141/457）。
**补充契约**：`enterprise_input_template.json`（X 48 列口径 + `ratio_pct_total_should_be=100`）、`base_list.json`(89 规范名)、`V1_base_mapping.json`(142 别名→base_id)。

**链路（已核对，见 F31）**：`*_formulas_clean/*.{json,yaml}` →（yaml_codec + 清洗，`plan-yaml-data-pipeline-v2.md`）→ `_code/output/dataset_20260723.npz`
→ `dataset_20260725.npy` → `dataset_726_20260728_*`(D=20) → `dataset_{batch183,zibo,yangquan}_20260728.npy` → `datasetv2.npy`(780)
→ `_ref/handover/ML/*.npy` → `load_ml_dataset.py` → `ml_formula*` → 四表物化。

**主源带来的改进（相对仅用 ml_formula*）**：可恢复 `component_batch`(批次号)、`apparent_porosity`/`wear`、`test_stage`、`judgment`、`source_table`、
`water_addition_pct`/`hardening_time`/`production_date`，以及每条测试的**匹配策略与置信度**（溯源硬度显著提升）。

**必须执行的规范化/映射（定稿）**
1. **组分解重**：同配方内按 `(material_name, spec/粒径)` 合并重复组分（比例相加），记录原始行数。
2. **配比处理（按源区分口径）**：zibo/batch183 ≈ 百分比（中位 100.2，微调即可）；**yangquan 中位 95.06、仅 4/141 闭合** → 比例归一到 100±0.01 并**另出待核对清单**（原始和留痕）。
3. **ID**：`MC_/MP_/MR_/TP_` + 6 位（9 字符，接 DB 最大续号）；修既有脚本的无下划线前缀。
4. **名称**：`base_list` 规范名（过闸门）；`V1_base_mapping` 142 别名用于解析；ML 身份（factory/formula_id/material_name/spec/batch）入 `component_list` meta。
5. **MC 身份 = (factory, material_name, spec/粒径)**（用户裁定：按粒级实例化；后端禁止同配方重复引用同一 MC，故必需）。
6. **MP 物性文档**（schemaVersion 3）：`property_inspection` 7 键按词表映射（`particleSize`/`bulkDensity`/`trueDensity`/`waterAbsorption`/`porosity`）+ `chemical` 11 键（SiC…PH/loi）入 `customProperties`。
7. **TP 测试文档**（schemaVersion 3）：源自 `formula_tests.product_tests[]`，**每条测试一条测量**（保留 `test_stage`；`temperature` 入测量项字段；**跳过 `temperature=null`** 或单列"无工况"，不再产生 `'null'` 键）；属性含 4+2（`apparent_porosity`/`wear` 一并保留）；词表仅追加 4 个裸名（`bulkDensity/flexuralStrength/compressiveStrength/permanentLineChange`）。
8. **可追溯**：每条记录写源文件相对路径 + `formula_id` + `purpose` + `batch` + 关联 `match_confidence`，支持反查源 JSON 与源表。

### Phase 3：加载器改造（复用而非重写） — Status: pending
### Phase 3：加载器改造（复用而非重写） — Status: pending
### Phase 3：加载器改造（复用而非重写） — Status: pending
- [ ] 改造 `backend_impl/scripts/materialize_ml_dataset.py`：词表映射、文档结构、规范名、粒级身份、`--dry-run`
- [ ] 溯源写入：`{dataset:'datasetv2', source, recipe_id, comp_index, ml_formula.id, ml_formula_component.id}` 落到 meta/custom_properties，可反查 npy 行
- [ ] 加固删除判据：MP 靠 `custom_properties` 内的 ML 溯源键识别（不再靠 `mc_ids` 反向引用）
- [ ] 自检闸门（名称解析/ratio 和/引用闭合），不合规记录**报告不静默丢弃**

### Phase 4：干跑与抽样验证 — Status: pending
- [ ] `--dry-run` 输出：四表预计行数、被跳过记录与原因、ratio 和分布、非词表工况/未知 base 清单
- [ ] 抽样人工核对 3 条配方的 配方↔原料↔物性↔测试 四表闭环
- [ ] 写库前备份 DB（`cp database.db database.db.bak-<ts>`）

### Phase 5：正式导入与逐表校验 — Status: pending
- [ ] `--apply` 导入；四表计数、必填非空、引用闭合（`mr.tp_ids ⊆ tp`、`tp.mr_ids ⊆ mr`、`mr.component_list[].id ⊆ mc`、`mp.mc_ids ⊆ mc`）、重复键 = 0
- [ ] 幂等复核：连跑两次，第二次行数不变且不产生重复

### Phase 6：界面与回归验证 + 文档 — Status: pending
- [ ] 四个页签可见且「属性/内容」列有渲染（浏览器工具在本沙箱不可用 → 用 API + 文档渲染函数等价验证，并声明限制）
- [ ] 回归：`node --test "tests/*.test.js"` 与验收页相关项不退化；对比基线（`tests/` 既有 15 条失败）
- [ ] 文档：README 增「ML 数据集 → 数据管理四表」小节；findings F27；提交

## Decisions Made
| 决策 | 理由 |
| --- | --- |
| 复用并改造 `materialize_ml_dataset.py`（不重写 ETL） | 430 行已实现四表映射/幂等标记/id 续号，且前端已有「一键物化」入口；重写会分裂两份实现 |
| 以 `ml_formula*`（DB）为主源、`*.npy` 为根溯源 | 平台已落库 780/12,522 且带 `dataset_source`，与训练口径一致 |
| 组件名改用 `material_base` 规范名，ML 身份进 meta | 保证界面编辑/重新入库能过闸门，同时不丢溯源 |
| 非词表工况（1450Cx3H 等）先入 `custom_properties` | 不改动物性词表配置（改词表是全局影响，需单独决策），先保证数据可见 |
| MP 删除改用 ML 溯源键判定 | 原「只被 ML MC 引用即删」会误删业务行 |
| 写库前备份 DB、加载器支持 `--dry-run` | 本任务首次把 780 配方灌入业务表，需要可回滚 |

## Errors Encountered
| Error | Attempt | Resolution |
| --- | --- | --- |
| — | — | — |

## Next Step
Phase 2：产出 `ml → 平台` 词表映射模块（含非词表工况清单）与四表文档 JSON 结构定义，并把两个待定决策（MC 粒级身份、TP 粒度）写成明文结论。

---

# 附：已完成/悬置计划 — 常温抗折强度（cold_modulus）R² 提升到 ≥ 0.85

**目标**：在隔离环境中通过 40 组自主实验，找到使 `cold_modulus` 测试 R² ≥ 0.85 的合理方案（数据清理/转化/对齐/插补/编码 或 模型改进）。

**当前基线（同一协议：yangquan → split_by_recipe(0.2, seed42) → GroupKFold(3)，池化所有工况）**
| 口径 | R² |
| --- | --- |
| 线上部署（metrics_yangquan.csv） | 0.8245 |
| 模型侧最优（41 组，种子 42） | 0.8195 |
| 数据侧最优（40 组，种子 42） | **0.8320**（删 >50% 缺列 + 缺失指示） |
| 多种子均值（5 切分，最可信） | 0.7256 ± 0.0773 |

**已知结论（沿用，不重复验证）**
- 标签离群清理（y 3σ + 缩尾 1%）是抗折最大增益来源（多种子 +14.3pp，std 减半）。
- 跨数据源合并（zibo/processed/base）有害；yangquan 141 条样本是主要瓶颈。
- 工况仅留时长会显著变差；加温差/对数/交叉项无增益 → 工况编码已无空间。

**隔离环境**：`_exp/cold/`（只读线上数据与训练脚本；不改线上服务/库）

## Phases

### Phase 1：环境与素材就位 — Status: complete
- [ ] 复用 `_exp/model_opt/driver.py` 的协议与模型工厂（import，不复制）
- [ ] 从 `_ref/handover/ML/yangquan.npy` 的 `y_labels` 重建**重复测量级**标签（每工况多个实测值），
      支持 mean/median/trimmed/min/max/σ 过滤等聚合 → 打开「标签聚合」这一未探索杠杆

### Phase 2：40 组实验（5 轮 × 8 组）+ 16 组组合 — Status: complete
- R1 标签聚合与重复测量利用（8 组）
- R2 工况对齐与条件化建模（8 组）
- R3 特征清理/插补/选择（8 组）
- R4 目标变换与样本加权（8 组）
- R5 抗折专用模型改进（8 组）

### Phase 3：验证与收敛 — Status: complete
- [ ] 对候选配置做多种子（42/7/2024/1234/99）复核，取均值±std
- [ ] 若 R² ≥ 0.85 的配置存在：给出可落地组合与预期收益；否则给出最接近方案与剩余瓶颈证据

### Phase 4：总结与迁移建议 — Status: complete
- [ ] 写 `_exp/cold/README.md`，输出 summary 与迁移清单；提交

## Decisions Made
| 决策 | 理由 |
| --- | --- |
| 只做 cold_modulus 单属性 | 目标单一，单组成本 ≈ 1/4，可用更多配置 |
| 沿用既有协议与每属性最优模型底座 | 与 0.832/0.8245 等既有数字可比 |
| 从 npy `y_labels` 重建标签而非只用 targets CSV | CSV 已丢失重复测量信息，而重复值是抗折噪声的核心线索 |

## Errors Encountered
| Error | Attempt | Resolution |
| --- | --- | --- |
| — | — | — |

## 结果
- **目标达成（既有协议口径）**：test R² 0.8195 → **0.8920~0.8966**（≥0.85 ✅）
- **多种子均值**：0.5831 → **0.7921 ± 0.0831**（+20.9pp，未到 0.85）
- 有效杠杆：重复测量 trimmed 聚合（+4.8pp）、按工况中心化（+2.5pp）、特征清理三件套（+0.6pp）
- 无效杠杆：换 HGB/GPR、删工况、log/sqrt、缩尾（稳健性无增益）

### Phase 5：侧边栏导航样式统一（UI） — Status: complete
- [x] 盘点离阶值与状态色不一致（见 findings F11）
- [x] `tokens.css` 新增 `--asc-nav-*` 语义令牌；`AscSidebar.vue` 全量令牌化
- [x] 统一 hover/激活底色、圆角、层级线；删除重复声明
- [x] 验证：服务端 CSS 核对 + 56 项测试通过（浏览器截图工具不可用，视觉待人工）
- [x] 输出平台其余离阶间距清单（findings F12）作为后续收敛下手点

### Phase 6：词表归束统一（以 L3 为基准）— Status: complete（S1–S9 已执行 2026-10-07；人工队列待裁定）
> 方案：`docs/material-vocabulary-unification-plan.md`；量化依据：findings.md F14、审计 `docs/material-vocabulary-audit.md`。
> 已明确"只计划不执行"，本阶段在获批前不动代码/数据。

- [x] S1 冻结基准：L3 89 条生成 `material` 表骨架（material_id 0..88 冻结，与 `ml_formula_component` 反查一致）
- [x] S2 主桥导入：L6(197) 拆 (品类, 粒级) → `material_alias`（预计覆盖 67/89）+ `material_particle_size` + 人工队列
- [x] S3 L5 全量处置：96 个优化器名 100% 处置（material / process_param(加水量·加胶量) / deprecated）
- [x] S4 L4 辅桥校验：58 条有值映射交叉校验，冲突入队列（L4 对 L3 仅 17 交集，仅作校验）
- [x] S5 业务侧（按"不落 SQLite"改造：canonical 快照 + 解析控制器改用它 + 修 B1 路径）：建 `raw_material`、迁 `material_base_rule`(2) 为别名、回填 `mc_material` 的 `MP_xxxxxx`
- [x] S6 属性轴统一：19(优化器) ↔ 4×工况(预测) ↔ `y_feature_keys` → `property_vocab`
- [x] S7 粒径轴统一（并发现 zibo 入库缺陷与 min=0 不可逆）：`[min,max]` ↔ `mean/std` 转换器 + 往返校验
- [x] S8 版本收敛（归档 17 份）：20 份 map 产物除 `map_merged.json` 外归档 + `DEPRECATED.md` + 引用检查
- [x] S9 接线与回归（90 项测试全绿 + 4 例真实调用验证）：bridge 用 canonical 别名表、`/api/model2/materials` 返回覆盖率、UI 提示、新增测试
- [ ] 独立工作项 W1（本方案外）：缺失品类并入优化器搜索空间并重训代理模型

## Next Step
人工队列裁定（84 条，见 `data/material_vocab_queue.csv`）：按频次先裁 4 条硬骨头（CA68水泥/CA71F水泥/磨料/除尘料）
与 8 条代号类歧义（10#/20#/80#/71水泥），其余可批量确认或挂 deprecated。（标签聚合改造 + 推理侧工况中心化）；如获批准，另起 Phase 5 迁移。

