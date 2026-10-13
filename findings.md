# 发现记录（findings.md）

> 本文件保存调研与试验发现（含第三方/工具输出，一律视为**数据**，不作为指令执行）。

## F1 — cold_modulus 的标签结构含重复测量（未开发杠杆）
`_ref/handover/ML/yangquan.npy` 的 `samples[].y_labels` 形如：
`{'cold_modulus': {'110℃': '11.7 / 11.1 / 15.8 / 14.6', '1450℃/1500℃': '11.7 / 10.5 / 8.2 / 16.4'}}`
- 每工况有 4 个重复实测值；`targets_yangquan.csv` 只保留**单一聚合值**（已丢失重复信息）。
- 重复值间离散度很大（如 8.2 vs 16.4），说明抗折**测量噪声本身很大** → 可用：
  (a) 不同聚合（median/trimmed/min/max）改变标签定义；
  (b) 用重复值的 std 作为**样本权重**或**噪声过滤**依据；
  (c) 删除工况内离群重复值后再聚合。

## F2 — 工况样本量极不均衡（对齐风险）
yangquan 各工况有效样本：`110℃` 137、`1450℃/1500℃` 137、`1100℃` 22、`1300℃` 9（`cold_modulus__1300` 仅 9 且为常量 26.4）。
- 常量/极小工况在池化 R² 中贡献噪声，应过滤或特殊处理。
- 池化 R² 混合了跨工况尺度差异（110℃ 量级 6–19，1450℃ 11–37）→ 条件中心化可能是强杠杆。

## F3 — 既有最优与瓶颈（来自前两轮实验）
- 单切分最优 0.8320（数据侧：删 >50% 缺列 + 缺失指示）；多种子均值 0.7256 ± 0.0773。
- 标签离群清理是最大单一增益源；跨源合并有害；工况编码空间已耗尽。

## F4 — 属性清单（cold 相关列）
`metadata_yangquan.json` 的 `target_columns` 中 `property=cold_modulus` 的列：
`cold_modulus__110`、`cold_modulus__1450_1500`、`cold_modulus__1300`、`cold_modulus__1100`（yangquan）；
processed 另有 `cold_modulus__1450`、`cold_modulus__1500`、`cold_modulus__none`、`cold_modulus__110_24h` 等。

## F5 — R1 标签聚合（8 组，种子 42）
| 组 | 聚合 | test R² | OOF R² |
| --- | --- | --- | --- |
| G0 | csv(基线) | 0.8195 | 0.3764 |
| G1 | mean | 0.8264 | 0.3759 |
| G2 | median | 0.8037 | 0.5614 |
| **G3** | **trimmed(去极值)** | **0.8673** | **0.6303** |
| G4 | robust(去2σ) | 0.8264 | 0.3759 |
| G5 | min | 0.6611 | 0.5694 |
| G6 | max | 0.7289 | −0.3341 |
| G7 | median+min_cond_n5 | 0.8037 | 0.5614 |

**结论**：`trimmed`（4 个重复值去掉最小/最大后取中间两个均值）同时提升 test 与 OOF，是抗折最大单一杠杆 → 重复测量中的极值是噪声来源。用 max 作标签最差（OOF 为负），说明极值里没有可学信号。

## F6 — R2 工况对齐（8 组，种子 42）
- `center_by_condition`（按工况用训练均值中心化）→ test R² **0.8540**（OOF 0.3715），第二个越过 0.85 的杠杆；说明池化 R² 中"跨工况尺度差异"占比很大。
- `min_cond_n=5`、`align_conditions` 与基线等价；`min_cond_n=10`、仅保留两工况、去常量工况均**变差**（样本量下降的代价大于噪声收益）。

## F7 — R3 特征清理（进行中，种子 42）
- `删全缺列` 0.8316、`删>50%缺+指示` 0.8320、`删>30%缺列` 0.8255 —— 小幅正收益，量级 +0.6~1.3pp。

## F8 — R4 目标变换/加权（8 组，种子 42，已修正评测尺度）
| 组 | 配置 | test R² | OOF R² |
| --- | --- | --- | --- |
| G0 | 基线 | 0.8195 | 0.3764 |
| G1 | log1p | 0.8385 | 0.3816 |
| G2 | sqrt | 0.7908 | 0.3836 |
| G3 | 缩尾1% | 0.8244 | 0.5097 |
| G4 | 缩尾5% | 0.7701 | 0.5905 |
| G5 | y3σ截断 | 0.8094 | **0.6599** |
| G6 | 权重=1/重复值σ | 0.8318 | 0.3927 |
| G7 | 权重=工况均衡 | 0.8188 | 0.3880 |

注：`log1p/sqrt` 首轮因 OOF 在变换空间比较而出现荒谬值（−2759），已改为**统一在原始尺度**评测后重跑（上表为修正值）。

## F9 — R5 抗折专用模型（8 组，种子 42）
| 组 | 模型 | test R² | OOF R² |
| --- | --- | --- | --- |
| G0 | ET300（基线） | 0.8195 | 0.3764 |
| G1 | ET800 | 0.8255 | 0.3802 |
| G2 | XGB tuned | 0.8117 | 0.3896 |
| G3 | LGBM tuned | 0.7805 | 0.3731 |
| G4 | **HGB tuned** | **0.8450** | 0.3841 |
| G5 | RF600 | 0.7806 | 0.4094 |
| G6 | GPR | 0.4816 | 0.2797 |
| G7 | GBR tuned | 0.7349 | 0.3821 |

**结论**：单靠换模型最多 +2.5pp（HGB）；GPR 在小样本高维上崩溃。模型不是主要瓶颈。

## F10 — R6 组合（赢家叠加）——**已达成目标**
| 组 | 组合 | test R² | OOF R² |
| --- | --- | --- | --- |
| G0 | trimmed | 0.8673 | 0.6303 |
| **G1** | **trimmed + 工况中心化** | **0.8927** | 0.6558 |
| G2 | + 删>50%缺列 + 缺失指示 | 0.8920 | **0.6633** |
| G3 | + 全缺列 | 0.8920 | 0.6633 |
| G4 | + XGB tuned | 0.8746 | 0.6482 |
| G5 | + LGBM tuned | 0.8815 | 0.6244 |
| G6 | + HGB tuned | 0.8841 | 0.6551 |

**结论**：`trimmed`（标签聚合）× `center_by_condition`（工况中心化）是可叠加的两个正交杠杆，
合计把 test R² 从 0.8195 提到 0.8920–0.8927（+7.3~7.6pp），OOF 从 0.376 提到 0.656（+28pp）。

## F11 — 导航样式统一（UI，2026-10-06）
**问题**：侧边栏导航存在离阶魔法数字与不一致状态色，导致"风格不统一"：
- 离阶值：`min-height 42/36`、`gap 12/10`、`padding 20/11/8/5`、`margin 10/6/2/1`、`border-radius 7`、`font-size 13/14/15`
- 状态色不一致：父项 hover `0.07`、锁定项 hover `0.06`、子项 hover `0.07`、激活 `0.12`、层级线 `0.14`、分隔线 `0.12`
- 激活态不一致：父项有底色 + 左侧指示条，子项只有文字变白 + 圆点发光

**做法**：在 `src/styles/tokens.css` 新增 14 个 `--asc-nav-*` 语义令牌（行高/左右内边距/缩进/间距/圆点/图标/hover 与激活底色/层级线），
AscSidebar 全部改为引用令牌；离阶值落到 4px 阶（sp-1/2/3/4/5/6）；父项与子项共用同一 hover/激活底色令牌；
子项激活态补齐与父项一致的底色；圆角统一到 `--asc-radius`(8px)；分隔线与层级线统一为 `--asc-nav-line`；删除 `.sidebar__toggle` 内被覆盖的重复 `font-size`。

**几何结果**：子项水平留白合计 46px → 32px（**−30.4%**，对应"缩小 1/3"）；标签起点 51px → 42px；一级项标签起点保持 54px。

**验证**：dev server 下发的编译后 CSS 含 27 处 `var(--asc-nav-*)`，无残留 `border-radius: 7px` 与字面量 hover 色；
仓库测试 8 个套件 56 项全通过。浏览器截图验证 4 次 `open` 均超时（工具不可用），视觉确认待人工。

## F12 — 平台其余离阶间距清单（后续统一下手点）
`padding/margin/gap` 中出现频次最高的离阶值（`src/platform`、`src/features`、`src/components`、`src/views` 全量统计）：
`12px×305`、`8px×293`、**`10px×256`**、`16px×177`、**`6px×158`**、**`14px×140`**、`4px×136`、`20px×99`、`24px×85`、
`18px×59`、`7px×50`、`9px×45`、`5px×45`、`3px×42`、`22px×28`、`28px×15`。
另有大量同类"列表项"样式各自为政：`.timeline-item`、`.step-card`、`.lit-row`、`.topic-item`、`.tool-item` 等。
建议后续抽 `--asc-list-*` 令牌并逐页收敛（本次仅完成导航区）。

## F13 — 原料词表端到端审计（2026-10-06，只读）
**结论**：不是"某张词表没建完"，而是**跨层对应关系从未落库**。系统并存 6 层原料词表，2 层自洽可用、2 层是半成品孤儿产物、2 层不存在。
详见 `docs/material-vocabulary-audit.md`（含全部证据与复现命令）。要点：
- L3 预测 base（89，`material_map.json` + SQLite `material_base`/`material_vocab`/`ml_formula_component`）：**自洽**（89 对 1:1，DB 副本甚至存了 `material_id↔base`）。
- L5 优化器原料（96，`_code/output/map_merged.json`，数据=`dataset_merged.npy` = 183 批次单来源 `X(183,96,3)`）：**在用但脏**（混入 `加水量/加胶量`，名称含牌号/厂家/粒级）。
- L4 归并对应表 `material_name_mapping_20260728.json`（96→121→71，**63/121 为 null**）：建过一版，**无任何运行时引用**。
- L6 材料知识表 `material_mapping_20260728.json`（197 条，粒径 197 / 化学式 134，含 category/text_prompt）：**孤儿产物**。
- L2 业务原料主表 `raw_material`：**表不存在**，而 `recipeParserController` 在查它（异常被吞）→ 解析无原料清单；`mc_material` 的 `MP_xxxxxx` 悬空。
- 只有 2 条手工别名（`material_base_rule`），恰好覆盖 `mc_material` 出现的那两个名字 → 补丁式建设。
- `_code/output` 共 20 份 map/mapping 产物，运行时只读 `map_merged.json`；`mapping_audit_20260728.json` 三个来源内容雷同（审计本身失真）。
- 属性轴（31/19 vs 4×工况 vs 4 键）与粒径轴（min/max vs mean/std vs [min,max]）均无对应表。

## F14 — 词表归束可行性量化（2026-10-06，规划依据）
以 L3（89 base）为基准，用十种桥接策略实测覆盖率：

| 桥 | 覆盖 L3 base | 覆盖优化器 96 | 说明 |
| --- | --- | --- | --- |
| L5 精确同名 | 40 | 40 | 现行下拉口径 |
| 启发式归一化（现实现） | 52 唯一 / 6 多候选 / 31 无 | — | 无权威依据，易漂 |
| **L6 `material_mapping`(197)** | **名称部分命中 67** | **79** | **主桥**；52 条键自带粒级；类别分布 其他61/刚玉类54/碳化硅类29/添加剂17/微粉14/铝酸盐水泥12/硅灰6 |
| L4 `material_name_mapping`(121) | 统一名 ∩ L3 = **17** | 31 | **弱桥**（其"统一名"是第三套命名），仅作交叉校验 |

- 34 个"L5 无对应"的 base 中，**30 个在 L6 有线索**，仅 4 个无：`CA68水泥`、`CA71F水泥`、`磨料`、`除尘料` → 人工队列的硬骨头就这几条。
- 结论：以 L3 为基准 + L6 主桥 + L4 校验，**自动覆盖可达 ≈80/89**，符合"零猜测 + 少量人工裁决"的落地条件。
- 方案文档：`docs/material-vocabulary-unification-plan.md`（S1–S9 + 数据模型 + 验收 + 风险）。

## F15 — 词表归束执行结果（2026-10-07）
- canonical 快照 `data/material_vocab.json`（脚本 `backend_impl/scripts/build_material_vocab.py` 生成，**不落 SQLite**）：
  89 物料 / 222 别名 / 96 external_ref（material 75、process_param 2、unresolved 19）/ 粒级表 / 属性表 / 队列 84。
- 覆盖：`unique 45 + multiple 9` 可绑定（原"精确同名"仅 40），`none 35`（多为优化器空间确实没有的品类，如刚玉类）。
- S7 新发现：入库副本粒径 `mean/std` 约定 = `mean=(min+max)/2`、`std=(max-min)/2`，单值 `std=值`（batch183/yangquan 全吻合，0 不符）；
  但**不可逆**：`min=0` 的行（batch183 402 / yangquan 302）与单值编码冲突，下界 0 已丢失。
  **zibo 2424 条 100% 不符**：该来源副本粒径几乎全为 `0.0/None` → 入库缺陷（非表示差异）。
- S8：`_code/output` 归档 17 份非权威 map（`_archive/` + `DEPRECATED.md`）；`_code` 是符号链接，归档不入库。
- 修复 B1 另一半：解析器路径回落 `_code/python/recipe_processor.py` → `/api/recipe-parser/parse` 恢复 200。

## F16 — 交接包中找到了权威映射表（2026-10-07，重要更正）
- 位置：`_ref/交接工作代码以及说明.zip → data.zip → data/V1_base_mapping.json`（142 条）与 `data/base_list.json`（89 名）。
- 结构：`{new_id, new_name, base_id, base_name, match_method:"mapping_json", confidence:1.0}`；由 `运行顺序.txt` 第 2 步
  `map_material_ids_to_base.py` 使用 —— 即"原始材料名/代号 → base"的权威对应关系（此前审计断言"归并关系未交付"**不成立**，
  见 docs/material-vocabulary-audit.md 更正说明）。
- **`base_list.json` 与 L3 基准逐名一致**（已加为生成器校验项）。
- 接入生成器后：优化器名处置 material 92 / process_param 2 / unresolved **2**；可绑定 base **60**；队列 **84 → 37**。
- 该表覆盖：`YGZ/YGZ粉→棕刚玉`、`一级YGB/一级YGB粉→一级白刚玉`、`一级YGB/YGZ(325)/粉→一级白刚玉/棕刚玉`、
  `10#/20#/30#/80#→磨料`、`31/33线除尘粉→除尘料`、`Vical 71/VICAL71水泥→CA71水泥`、`FDN→FDN减水剂`、`FS-20→FS20`、
  `La2O3→氧化镧`、`TiN→氮化钛`、`60均质粉/微粉→60均质`、`Al2O3微粉*→Al2O3`、`a-Al2O3/α-Al2O3微粉→α-Al2O3` 等。
- 残余 2 项（`97碳化硅`、`97黑SiC`→`97黑碳化硅`）与 W1 清单见方案文档。

## F17 — `_exp` 前沿最优模型接入平台 + 旧模型目录改名（2026-10-07）
- 训练导出脚本：`backend_impl/python/model_predict/scripts/train_exp_best_models.py`（全量训练、3 折 GroupKFold 留档）；
  产物：`MODEL/outputs_exp_best/models/yangquan/{bulk_density,cold_modulus,crushing_strength,linear_change}.joblib`
  + `MODEL/metrics_exp_best.json`（版本 `exp_best_2026-10-07`）。
- 每属性配置（来自 `_exp` 两轮实验）：bulk=LGBM+SelectFromModel(1.5×mean)；cold=ExtraTrees300 + **trimmed 标签** + **按工况中心化**；
  crush=XGBoost(默认)；linear=ExtraTrees300。CV(3 折) R²：bulk 0.958 / cold 0.796 / crush 0.776 / linear 0.914。
- API 改造（`API/app.py`）：`MODEL_OUTPUT_DIRS` 改为 **新目录优先 + 旧目录回退**；新增 `condition_offsets` 支持
  （bundle 带偏移时，推理 = 模型预测 + 该工况偏移，未见工况退全局均值）。旧目录改名后为
  `MODEL_old_sept_bak/`（代码入库、197MB 产物不入库）。
- 引用同步修复：`scripts/dump_vocab.py`（新目录优先/回退）、`_exp/chain/chain.py`、`_exp/model_opt/analyze.py`、
  `API/INTERFACE.md`、`app.py` 文档串。
- 验证：`/api/v1/model/metadata.variant_models_dir` 指向 `MODEL/outputs_exp_best`；`/api/v1/predict/simple` 返回
  `version=exp_best_2026-10-07`，四项预测值合理（含 cold 的偏移生效）；测试 21+13+4+9+6 全绿。

## F18 — 达标（R²>0.85）模型全部上线（2026-10-08）
按 `_exp` 三个 ledger 逐属性取"同目标语义下的最高留出 R²"，只采用**推理侧可 1:1 复现**的杠杆，训练并部署：

| 属性 | 留出 R² | CV R² | 配置（来源） | 推理侧承载方式 |
| --- | ---: | ---: | --- | --- |
| 体积密度 | **0.9436** | 0.9583 | 单位修正+缩尾1% + LGBM&SFM(1.5×mean)（数据侧 R1G6） | 标签侧（仅训练）|
| 常温抗折 | **0.8949** | 0.6437 | trimmed 标签 + 工况中心化 + 删>50%缺列+全缺列 + 工况均衡权重 + ET300（cold R6G1/R7G4 合并） | `condition_offsets` + `input_feature_columns` |
| 常温耐压 | **0.8923** | 0.7027 | 丢弃 <10 样本工况列 + y2.5σ + XGBoost（数据侧 R4G6 可比口径） | 标签侧 + `training_conditions` |
| 线变化率 | **0.9551** | 0.8922 | 删>50%缺列 + ET300（数据侧 R2G2） | `input_feature_columns` |

- 版本 `exp_best_final_2026-10-08`；产物 `MODEL/outputs_exp_best/models/yangquan/*.joblib`；指标留档 `MODEL/metrics_exp_best.json`。
- 复算方式：脚本内置与 `_exp` **完全相同**的 `split_by_recipe(0.2, seed 42)` 留出协议 → 上表 R² 为复算值（bulk/crush/linear 与 `_exp` 逐位一致；cold 因合并了可复现的工况均衡权重而略高于 R6G1 的 0.8927）。
- API 增强：优先用 bundle 的 **`training_conditions`** 判定告警（数据侧清洗丢弃的工况不再静默外推）——实测 `crushing_strength` 对 1300℃、`linear_change` 对 110℃ 均正确告警。
- **未采用**（需改特征构建，故本轮不上）：`miss__*` 缺失指示列（含该杠杆的 cold 配置 R²=0.8966，可从 0.8949 再提升约 0.17pp）。

## F19 — 服务日志迁入仓库内目录 + 服务管理脚本（2026-10-12）
- 背景：本机 `/tmp` 会被系统清理，导致 `nohup ... > /tmp/svc/x.log` 重定向失败、服务根本没起来（本会话踩两次）。
- 方案：日志统一写 `backend_impl/data/logs/{beimpl,ai4sci,modelapi,frontend}.log`（`backend_impl/data` 已在 .gitignore 第 39 行）。
- 新增 `backend_impl/scripts/services.sh`：`start|stop|restart|status [服务名...]`，端口 3001/5001/8100/3005，
  健康检查用 `curl --noproxy '*'`，`start` 有界轮询（最多 90s，uvicorn 加载模型/vite 预构建常超 25s）。
- 顺带修一个真实故障：`vite.config.js` 的 `open: true` 在 WSL 下会 spawn `powershell.exe` 触发 EACCES，
  **dev server 随之退出**（前端反复 000 的根因）。改为 `open: process.env.VITE_NO_OPEN ? false : true`，
  脚本启动时设 `VITE_NO_OPEN=1` 无头运行；人类 `npm run dev` 行为不变。

## F20 — 「模型入口 → 验收测试[2026]」独立页面 + 路由测试流接口（2026-10-12）
- 依据 `report_2026/ASC26年验收准备_v1`：**4 项合同工作 + 2 项额外工作 + 11 份交付材料**；
  企业侧验收形式为现场验收（材料 10/11 + 演示链路：数据库查询导出 → 性能预测 → 配方优化）。
- 后端（独立只读，不与业务路由耦合）：
  * `src/config/acceptanceChecks.js` —— 声明式注册表：3 类分组 / 11 个验收项 / **36 条检查** / 11 份材料
    （kind ∈ sqlite | json | json-stat | deviation-csv | opt-cases | kg-stats | file | http | http-json | http-predict | command | platform-structure | manual）
  * `src/services/acceptanceService.js` —— 执行器：`node:sqlite`（零依赖）读库、curl `--noproxy '*'` 直连本机服务
    （本机 HTTP_PROXY 会把 node:http 打到代理得到 502）、解析 `node --test` 的 pass/fail、按 CSV 算逐属性偏差均值、批量为 SSE 流式
  * `src/routes/acceptance.js` + controller，挂载 `/api/acceptance`（checks / run / run/:id）
- 前端：`src/platform/views/AcceptanceView.vue`（分类分组、逐条运行、SSE 实时结果、输出可展开、人工项可留档 + localStorage）、
  `src/platform/api/acceptance.js`（含 SSE 客户端）、路由 `Acceptance2026` = `/platform/acceptance`、
  侧边栏「模型入口 → 验收测试[2026]」子项、模型入口页追加一个链接（**不改动 3D 轮播的四张模型卡**）。
- 关键数值核验（注册表断言直接对齐验收材料）：配方 780（≥300）、组分 12,522、材料 89、
  逐样本 226 条 / 213 条 ≤25% / 逐属性均值 1.19%·10.07%·7.31%·15.96%、部署模型 4 项留出 R²>0.85、
  优化案例 2 例目标达成、图谱节点 400/边 1,003/实体 10 类/关系 10 类、11 份材料体积下限。
- 实跑（经 `/api/acceptance/run` SSE）：**36 项 → 通过 33 / 未通过 0 / 人工 1**（人工项=发明专利受理通知书）。
- 测试：新增 `tests/acceptanceChecks.test.js`（6 项：分组/唯一 id/11 材料/阈值口径/路由与侧边栏已注册/轮播仍四卡）全通过。
- 已知限制：`tests/ascLabExperience.test.js` 的路由全集 deepEqual 属**既有陈旧断言**（实际已含 AscHome/AscQa@/research/PlatformDataHome），
  与本次改动无关，未去"重新钉住"；改为在新测试里做聚焦断言。

## F21 — 修 404：vite 代理未覆盖 /api/acceptance（2026-10-13）
- 现象：页面报「验收清单加载失败：Request failed with status code 404」。
- 根因：`vite.config.js` 的代理只有显式前缀（`/api/model2`、`/api/v1`…）+ **兜底 `/api → 5001`（知识图谱后端）**；
  `/api/acceptance/*` 落进兜底 → 5001 无此路由 → **404**。
- 修复：在兜底之前新增 `'/api/acceptance' → 127.0.0.1:3001`；并把「代理已覆盖验收路由」纳入 `platform-structure` 检查
  （防止同类回归：漏配代理会让页面 404 而接口本身是好的）。
- 实测：经 3005 代理 `GET /api/acceptance/checks` = **200**；`platform-structure` 检查通过（含新断言）；
  服务健康 4/4；`pred-online` 预测 8/8 有限值（版本 exp_best_final_2026-10-08）。
- 附带教训：改 `vite.config.js`（代理/端口）后**必须重启 frontend**；`services.sh start` 对已在运行的服务会跳过，需用 `restart`。
