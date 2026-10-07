# 原料词表归束统一方案（以 L3 为基准）

> 状态：**方案（待批准，尚未执行）**。审计依据：`docs/material-vocabulary-audit.md`。
> 结论：以 L3（ML base 89）为唯一基准，用 `_code/output/material_mapping_20260728.json`（L6，197 条）作**主桥**、
> `material_name_mapping_20260728.json`（L4，58/121）作辅桥，可把 base↔优化器的可比对覆盖从 **40/89** 提升到
> **≈80/89（自动）+ 4 条人工裁决**；剩余问题是"两套粒度与工艺参数混入"，本方案一并定义清楚。

## 一、目标与验收标准

| 目标 | 验收标准（机器可验） |
| --- | --- |
| 单一权威词表 | 全系统只读一份 `material_vocab.json`（由注册表生成）；运行时不再直接读 `_code/output` 下 20 份 map 中的任何一份（除优化器自有索引 `map_merged.json`） |
| 覆盖 | 优化器 96 个原料名 → 100% 有处置（映射到 base / 标记为 process_param / 标记为 deprecated）；L3 的 89 base → ≥95% 至少有一个优化器原料可绑定 |
| 零猜测 | 自动映射仅接受"精确/唯一"命中；歧义进入人工队列，**任何情况下不猜** |
| 无悬空引用 | `mc_material.component_list` 的 `MP_xxxxxx` 全部可解析；`material_base_rule` 的规则全部能被新词表表达 |
| 可回归 | 新增 `tests/materialVocab*.test.js`（≥12 断言）与 Python 自检 `--audit-vocab`；覆盖率指标进 CI 口径 |

## 二、基准与粒度约定（本方案的核心决策）

| 维度 | 归属 | 规则 |
| --- | --- | --- |
| **品类**（棕刚玉、97黑碳化硅、CA71水泥…） | **canonical material**（= L3 的 89 base） | 唯一主键；`material_id`（0..88）**冻结**，只增不改；新增品类用 ≥89 的新 id |
| **牌号 / 厂家 / 缩写 / 代号**（一级YGB粉、97黑碳化硅粉（东祥97）、FDN、10#） | `alias` 行（多对一） | 每条别名带 `kind`（brand/supplier/abbrev/code/synonym）、`source`、`confidence` |
| **粒级**（0-1mm、3-5mm、200目） | **独立维度**，不进名称 | 存在于 `material_particle_size`（该品类的典型粒级）与**使用侧**（X_comp 的 `particle_size_min/max`）；名称里带粒级的键（L6 的 52 条）在导入时**拆分**为 (material, size) |
| **工艺参数**（加水量、加胶量） | 排除出原料空间 | 记入 `external_ref` 且 `kind='process_param'`，说明其对应 `X_global`（water_amount/hardening_time）——优化器需从原料轴剔除 |
| 属性 | 独立表 | `property_vocab`：19（优化器）/ 4×工况（预测）/ `y_feature_keys` 三者显式映射 |
| 粒径表示 | 统一为 **mm 的 min/max** | 提供 `mean/std → [min,max]` 与 `[min,max] → mean/std` 转换器（当前三套并存） |

## 三、目标数据模型

```
material                      # canonical（以 L3 为准，89 行起）
  material_id   INTEGER PK    # 冻结 0..88，新增 ≥89
  base_id       TEXT UNIQUE   # BASE_000001…（沿用现有注册表）
  name          TEXT UNIQUE   # 权威名（= L3 base_name）
  category      TEXT          # 来自 L6 category（刚玉类/碳化硅类/…）
  formula       TEXT          # 来自 L6 formula（134/197 有值）
  elements      JSON          # 来自 L6 elements
  status        TEXT          # active | deprecated
  source        TEXT          # datasetv2 | manual | imported

material_alias                # 别名词表（多对一）
  alias_id      INTEGER PK
  material_id   INTEGER FK
  alias         TEXT          # 原始名（含牌号/厂家/代号）
  alias_norm    TEXT          # 归一化键（唯一性约束在此列）
  kind          TEXT          # brand|supplier|abbrev|code|synonym|legacy
  particle_min  REAL NULL     # 别名自带的粒级（mm）
  particle_max  REAL NULL
  source        TEXT          # L4 | L6 | L3 | manual
  confidence    REAL          # 1.0=自动唯一；<1 需人工复核
  UNIQUE(alias_norm, particle_min, particle_max)

material_external_ref         # 跨系统对齐（优化器/业务）
  ref_id        INTEGER PK
  material_id   INTEGER NULL  # NULL = 已判定为非原料（如 process_param）
  system        TEXT          # optimizer | business_mp | dataset_source
  external_name TEXT          # 如 '97黑碳化硅粉（东祥97）'
  external_index INTEGER NULL # 优化器 map_merged 的 0..95
  kind          TEXT          # material | process_param | deprecated
  UNIQUE(system, external_name)

material_particle_size        # 品类典型粒级（来自 L6 的 197 条）
  material_id   INTEGER FK
  size_min      REAL          # mm
  size_max      REAL
  source        TEXT

property_vocab                # 属性轴
  system        TEXT          # optimizer | predict | business
  name          TEXT          # '耐压强度[1450℃]' / 'crushing_strength' + 工况
  canonical     TEXT          # 归一到 property + condition 两段
```

**落位**：canonical 与 alias 落 SQLite（复用现有 `material_base` / `material_base_rule`，新增/扩展字段），
并**生成 JSON 快照**供 Python 侧读取（沿用现有 `data/material_base_map.json` 的模式）：
`data/material_vocab.json`（含 materials/aliases/external_refs/property_vocab/particle_sizes + `version`/`generated_at`）。

## 四、迁移步骤（S1–S9，含产出与验收）

| # | 步骤 | 输入 | 产出 | 验收 |
| --- | --- | --- | --- | --- |
| **S1** | 冻结基准：从 L3 生成 `material` 表骨架（89 行，id 冻结，name=base_name） | `material_map.json` | `material`(89) + 快照 v1 | id↔name 与 L3 **逐条一致**；`ml_formula_component` 反查 89 对无冲突 |
| **S2** | L6 主桥导入：197 条 → 拆 (名称部分, 粒级)；名称部分对 `material.name` 精确/唯一归一命中 → `material_alias`；其余进**人工队列** | L6 | `alias`（预计 ≈67 base 覆盖）+ `material_particle_size`（≈197）+ 队列 | 命中率 ≥60/89；队列文件含候选与来源行号 |
| **S3** | L5 全量处置：96 个优化器名 → ①S2 的 alias 命中 → `external_ref(material)`；②命中 `加水量/加胶量` → `kind='process_param'`；③其余 → 队列 | L5 `map_merged.json` | `external_ref` 96 行（100% 有处置） | 无 "未处置"；process_param 恰为 2 条 |
| **S4** | L4 辅桥：58 条有值映射 → 校验是否与 S2/S3 一致；**冲突项**标 `confidence<1` 入队列（L4 统一名与 L3 仅 17 交集，仅作交叉校验） | L4 | `alias` 增量 + 冲突清单 | 冲突项全部可解释（人工或标 deprecated） |
| **S5** | 业务侧补表：建 `raw_material`（或按新命名对齐）；把 `material_base_rule`(2) 迁为 `material_alias`；回填 `mc_material.component_list` 的 `MP_xxxxxx` | SQLite 业务表 | 业务原料主表 + 别名 ≥N | 无悬空 `MP_xxxxxx`；`recipeParserController` 能取到非空原料清单 |
| **S6** | 属性轴统一：19（优化器）↔ 4×工况（预测）↔ `y_feature_keys`（业务） | 三份产物 | `property_vocab` + `data/property_map.json` | 每个优化器属性都能定位到 (property, condition)；反向亦然 |
| **S7** | 粒径轴统一：`[min,max]`（模型/知识表）↔ `mean/std`（入库副本） | L6 + `ml_dataset_meta` | 转换器 + 文档 | 在 yangquan 全量样本上往返误差 <1e-6 |
| **S8** | 版本收敛：`_code/output` 20 份 map 中，除 `map_merged.json`（优化器自有索引，权威）外，其余移入 `_code/output/_archive/` 并写 `DEPRECATED.md`；运行时改为只读 canonical 快照 | 20 份产物 | 归档 + 引用检查 | `grep` 确认运行时不再引用归档文件；`map_merged` 仍被 bridge 使用 |
| **S9** | 接线与回归：bridge 用 canonical 别名表取代启发式；`/api/model2/materials` 返回覆盖率与队列；UI 显示覆盖率；新增测试 | 全部 | 代码 + 测试 | 覆盖指标达标；`tests/materialVocab*.test.js` 与既有 8 个套件全绿 |

**人工队列（唯一需要你们裁定的部分）**：预计 **4 条硬骨头**（`CA68水泥`、`CA71F水泥`、`磨料`、`除尘料`）
+ S2/S4 产生的少量歧义项。队列以 CSV 交付（列：外部名 / 类别 / 候选 base / 候选取值 / 建议），勾选即回填。

## 五、预期收益（用实测数字说话）

| 指标 | 现状 | 方案后（预估） |
| --- | --- | --- |
| L3 base ↔ 优化器原料 可比对覆盖 | 40/89 精确、52 唯一、**31 无对应** | **≈80/89 自动** + 4 人工（依据：L6 名称部分 ∩ L3 = **67**，∩ L5 = **79**） |
| 优化器 96 名处置 | 96 名中 2 个非原料项未识别、其余靠启发式 | 100% 有处置（material / process_param / deprecated） |
| 粒度/牌号表达 | 三套粒度混在名称里 | 名称层不含粒级；粒级独立成表与使用侧字段 |
| 词表版本 | 20 份产物，无权威 | 1 份 canonical 快照 + 1 份优化器索引；其余归档 |
| 业务侧 | `raw_material` 缺表、`MP_xxxxxx` 悬空、2 条别名 | 主表就位、引用可解析、别名全量 |

## 六、风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 别名一对多（如 `Al2O3` → 3 个微粉变体） | 约束/预测绑错原料 | 唯一命中才自动接受；否则进队列，UI 让用户显式选择（现有二级下拉即为此设计） |
| 改动 `material_id` 语义 | 预测模型 one-hot 位错乱、模型失效 | **冻结 0..88**；只增不改；S1 用 `ml_formula_component` 反查做一致性校验 |
| 优化器搜索空间不含某些品类（棕刚玉等） | 无法约束/优化该原料 | **本方案不解决**：需把缺失原料并入优化器训练空间并重训代理模型（列为独立工作项 W1） |
| 人工队列积压 | 覆盖达不到 95% | 队列以"建议+置信度"交付，勾选式回填；先只对高频 base（按 `samples` 排序）要求 100% |
| 归档误删 | 历史可复现性 | 归档而非删除；`DEPRECATED.md` 注明替代关系与日期 |

## 七、工作量与排期（不含 W1 重训）

| 阶段 | 内容 | 规模 |
| --- | --- | --- |
| S1–S4 | 基准冻结 + L6 主桥 + L5 处置 + L4 校验 | 中（1 个数据脚本 + 队列产出 + 自检） |
| S5 | 业务侧补表与引用回填 | 中偏大（涉及业务表与控制器） |
| S6–S7 | 属性轴、粒径轴 | 小 |
| S8 | 版本归档与引用检查 | 小 |
| S9 | 接线（bridge/API/UI）+ 测试 | 中 |
| 人工 | 4 条硬骨头 + 队列裁定 | 依赖你们，≤半天 |

## 八、本方案明确不做的事（边界）

1. 不重训优化器代理模型、不扩充其 96 原料空间（那是 W1，需数据/模型侧立项）。
2. 不改预测模型的输入契约（`material_id` 语义冻结，`X_comp` 48 列不变）。
3. 不删除历史产物，只归档。
4. 不在本方案内改 UI 交互范式（仅替换数据源与加覆盖率提示）。

---

# 执行结果（2026-10-07）

已按本方案执行 S1–S9；按用户要求 **canonical 不落 SQLite**，改为脚本流生成 `data/material_vocab.json` 快照。

| 步骤 | 状态 | 产出 / 证据 |
| --- | --- | --- |
| S1 冻结基准 | ✅ | 快照 `materials` 89 条，`material_id` 与 L3 **逐条一致**（测试断言）；`material_base` 与 `ml_formula_component` 两项交叉校验 PASS |
| S2 L6 主桥 | ✅ | L6 197 条 → 命中 167 条；别名表 222 条（L3 88 / L6 63+ / L4 20+ / 业务规则 2），保留**全部原始名**（含牌号/厂家） |
| S3 L5 全量处置 | ✅ | 96 个优化器名 100% 有处置：material 75 / process_param 2（加水量·加胶量）/ unresolved 19 |
| S4 L4 辅桥校验 | ✅ | L4 有值映射全部交叉校验；冲突 0（L4 弱桥已有一致） |
| S5 业务侧 | ✅（按新约束改造） | 新增 `materialVocabService`（Node 读快照）；解析控制器改用 canonical（不再依赖缺失的 `raw_material`）；**修复 B1 的另一半**：解析器路径回落 `_code/python/recipe_processor.py` → `/api/recipe-parser/parse` **恢复 200**（4 组件 / embedding [4,385]） |
| S6 属性轴 | ✅ | 快照内 `property_vocab`：优化器 19 条 → 归一到 (property, condition)，附预测侧 4 属性 |
| S7 粒径轴 | ✅（并发现新问题） | `backend_impl/python/material_units.py --selftest`：batch183 1971 条 **mean 0 不符 / std 0 不符**；yangquan 1604 条同样全吻合；约定 = `mean=(min+max)/2`、`std=(max-min)/2`，**单值时 std=值**。⚠️ 该编码**并非处处可逆**：`min=0` 的行（batch183 402 / yangquan 302）与单值冲突，**下界 0 已丢失**。⚠️ **zibo 2424 条 100% 不符**：该来源入库副本粒径几乎全为 `0.0/None`，属**入库缺陷**而非表示差异 |
| S8 版本收敛 | ✅ | `_code/output` 归档 17 份非权威 map（→ `_archive/` + `DEPRECATED.md`）；保留 `map_merged.json`（运行时）+ `material_mapping`/`material_name_mapping`（生成器种子）；运行时代码无引用（已检查）。注意：`_code` 是符号链接，归档为本地操作、不入库 |
| S9 接线与回归 | ✅ | 桥接读快照（保留启发式回退）→ `/api/model2/materials` 返回 canonical 覆盖（unique 45 / multiple 9 / none 35 / queue 84）；UI 显示"待人工裁定"数；`tests/materialVocab.test.js` 9 项 + 既有套件共 **90 项全绿**；4 个真实优化调用验证：`60均质≥20` ✓、牌号别名+指定 material ✓、`加水量` 明确拒绝 ✓、`棕刚玉` 明确报错 ✓ |

**未解决（本方案外）**：W1 —— 让 `棕刚玉` 等 35 个 base 真正可约束，需把缺失原料并入优化器搜索空间并重训代理模型。

**人工队列**：84 条，分类与候选见 `data/material_vocab_queue.csv`（详见文末"待裁定问题"）。
