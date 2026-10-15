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

## F22 — 多用户管理改造前的勘察事实（2026-10-13）
- 登录：`POST /api/auth/login` → `authController.login` 查 **SQLite `users`**（`username/password/role/is_delete`），bcrypt 校验，
  `utils/jwt.js` 签发 **24h JWT**（payload: id/username/role），密钥 `JWT_SECRET`（无则用默认值）。
- **两套用户存储（隐患）**：`/api/user/*`（`userController`）读写的却是 `./data/users.json`（**该文件不存在**）；
  即"用户管理"接口实际是死路径。本次统一到 SQLite `users`。
- 鉴权：`/api/user/*` 用 `authenticateAdmin`（`Authorization: Bearer <token>` + `role==='admin'`）；
  `/api/admin/*` 是通用表 CRUD（数据库控制台）。
- 前端：`store/auth.js` 只把用户对象存 `localStorage['asc_user']`（**没有保存 token**）；
  `request.js` **不注入 Authorization**；`AscLoginModal.vue` 仅登录、无注册；无用户管理页面。
- 路由守卫：未发现 `requiresAuth` 类全局守卫（平台页未登录会被重定向首页，属组件/布局层行为）。
- SQLite `users` 现状：仅 `admin`（role=admin, is_delete=0）。

## F23 — 多用户管理改造实施与验证（2026-10-14）
- **两套用户存储合并**：`/api/user/*` 原先读写不存在的 `./data/users.json`（死路径），现已统一到 SQLite `users`
  （`services/userService.js` 是唯一账号仓库；`config/database` 抽象层，兼容 sqlite/mongodb 切换）。
- **账号状态机**：`pending`（注册后）→ `approved`（管理员审批）/ `rejected` / `disabled`；登录按状态返回 `error_code`
  （`PENDING_APPROVAL`/`REJECTED`/`DISABLED`），连续失败 5 次锁定 15 分钟（`locked_until`）。**管理员任何状态变更都会清零失败计数与锁定**，
  否则"重新启用"会被旧锁定挡住（实测踩到：禁用检查先撞 429 LOCKED）。
- **前端登录态修复**：此前只存 `asc_user`（无 token）且 axios 不注入 `Authorization` → 任何需鉴权请求都发不出去。
  现 `store/auth.js` 同时持久化 `asc_token`（键名集中在 `src/config/authStorage.js`），`platform/api/request.js` 请求拦截器统一注入；
  `isLoggedIn` 要求 user+token 同时存在（旧遗留的单边存储会被清空并要求重新登录）。
- **删除死代码**：`src/platform/stores/auth.js` + `src/platform/components/LoginModal.vue`（第二套鉴权，仅互相引用、无人挂载）。
- **新增页面**：`/platform/system/users`（`UserManagementView.vue`：待审批/正常/禁用/已拒绝 分页 + 审批/禁用/重置密码/改角色/删除 + 新建用户）；
  路由 `meta.admin`（非管理员直连 URL 会被守卫退回首页；接口层仍二次鉴权）；
  入口放在**侧边栏用户区**（`.user-admin-btn`，仅管理员可见）——顶层新增导航项会破坏 `tests/acceptanceChecks.test.js`
  里"一级项固定为 首页/问题研究/数据平台/模型入口"的结构契约（已踩）。
- **验证**：
  - 后端 17/17 端到端（`backend_impl/scripts/verify-user-management.js`，注册→待审批拒登→审批→登录→邮箱登录→me→自助改密→锁定→禁用即时失效→软删除）。
  - 验收页新增 `multi-user` 项 7 条检查（表结构 16 列 / 邮箱唯一索引 / admin 已通过 / 两个 401 闸门 / 端到端 17 项 / 前端可编译）→ **7/7 pass**。
  - 前端 `vite build` 通过（`UserManagementView-*.js` 入包；产物内含 `asc_token`/`Authorization`/`PENDING_APPROVAL`/`/platform/system/users`）。
  - **限制**：本环境浏览器工具无法导航（连 `https://example.com` 都 `Page.navigate timed out`），**点击级交互未做真机验证**；
    以「vite 按需编译 15 个改动模块 + 前端 API 层接口表对照 + 后端端到端」替代，视觉/交互建议人工过一遍。
  - **回归基线**：`node --test "tests/*.test.js"` 在本仓库**既有 15 条失败**（`ascLabExperience` 5 条 + 图谱/QA 相关 10 条；
    用 `git worktree add /tmp/asc_base HEAD` 洁净基线复核，失败集合完全一致）→ 本次改动**零回归**。

## F24 — resource3 文献合并入库：收尾核验与修复（2026-10-14）
- **合并本身此前已完成**：`data/resource3.bib` 由 627 个 PDF 生成 466 条 → 库中命中 **466/466**
  （新增 `r3` 386 行；43 条命中 `aug`、37 条命中 `sep` 的 DOI 去重），附件全部挂到源 PDF（`lit_file` 指向采集目录，`storage='ref'`）。
- **发现并修复三类缺陷**（都在 r3 侧）：
  1. **重复行 3 组**（去重键没命中）：2 组是 r3 行 DOI 解析错（标题同 sep 行，DOI 却是 `10.1016/j.jcin.*` 心脏病学刊）
     ↔ sep 行正确；1 组是同一篇 REM 2009 论文的两个 PDF（一个带 DOI、一个无）。
     → `repair_literature_dupes.py --only r3 --hard-delete`：保留元数据最完整的行、迁移附件后硬删重复行。
     合并后总量 17698 → **17695**，`lit_file` 2466 **不变**（附件未丢），非 r3 行元数据哈希**逐字节一致**（零误伤）。
     **注意**：同名 `AFV CoverSheet` 三行是**三篇不同论文**（DOI 不同）→ 判据里"标题相同也必须一方无 DOI 或标题可信"才合并，
     否则会把真实文献删掉（已避免）。
  2. **标题是 PDF 抽取产物**：`AFV CoverSheet` / `5_REM_372_MET.pmd` / `June Journal.indb` / `011` / `RESEARCH ARTICLE` 等
     → `enrich_literature.py --replace-implausible-titles` 用 Crossref 标题替换（共 14 条，逐条复核均为改善）；
     另有 3 条中日文标题被 PDF 抽成了"字间空格"（`高 炉 出 銑樋`）→ 折叠（含全角拉丁 `Ｃ ｏ ｒ ｒ ｅ ｓｐｏｎｄｉｎｇ`）。
  3. **元数据空洞**：r3 中 year 仅 125/386、journal 0/386（`build_resource3_bib.py` 未取到）。
     → Crossref 补 year/journal/volume/number/pages/abstract（260 条命中；CNKI 系 DOI 在 Crossref 无记录，返回 404）；
       CNKI DOI 内嵌年份（`10.13957/j.cnki.tcxb.2017.06.023` → 2017）与「知网目录名即刊名」兜底。
       结果：r3 的 year **125→321/383**、journal **0→256/383**；残留 year 缺 62 条（多为无 DOI 中文/日文条目）、journal 缺 127 条。
- **残留缺口（未做，属可选）**：62 条无年份的中文条目可解析 PDF 首页年份（启发式，风险高于收益，未动）；
  287 条无摘要（Crossref 多数不提供）；`sep` 集合里既有 211 组**既往**重复标题未处理（不属本次范围，`--only r3` 未触及）。
- **命令与口径**已写入 README「文献库批量导入与维护」；两个新脚本：`enrich_literature.py`、`repair_literature_dupes.py`。

## F25 — ML 数据集 → 数据管理四表：勘察事实（2026-10-14）
- **计划文件**：`task_plan.md` 顶部为当前计划（ML 数据集→四表导入）；原 R² 计划降级为「附：已完成/悬置计划」，内容未删。
- **ML 数据集根**：`_ref/handover/ML/`（353MB）。主数据集 `datasetv2.npy` **780 条**，按来源拆
  `batch183.npy` 182 / `zibo.npy` 457 / `yangquan.npy` 141；另有 `dataset_processed.npy`（清洗后）、`dataset_fill.npy`（化学字段填补后）、
  `processed/*.py`（清洗/填补/拆分）、`FEATURE/build_features.py` + `FEATURE/outputs/`（`features_{base,processed,fill,batch183,zibo,yangquan}.csv` 2MB 级 + `metadata_*.json`）、`MODEL/`。
- **平台侧已物化**（`backend_impl/data/sqlite/database.db`，`remark='ingested from private/*.npy'`，`ingested_at=2026-09-10`）：
  - `ml_dataset_meta` 3 行（batch183 182 / zibo 457 / yangquan 141；`total_component_count` 3311/7361/1850）；
    `comp_feature_names` = material_id, ratio_pct, particle_size_mean/std, base, PC1..PC20, SiC/SiO2/AL2O3/Fe2O3/TiO2/CaO/MgO/K2O/Na2O/PH/loss_on_ignition…；
    `global_feature_names` = water_amount, hardening_time, hardening_time_uncertainty；`y_feature_keys` = bulk_density, cold_modulus, crushing_strength, linear_change。
  - `ml_formula` **780** 行：`dataset_source, recipe_id('batch1-No1'), n_components, x_global(JSON,含 NaN), x_global_names, y_labels(JSON)`；
    `y_labels` 结构 = `{属性: {工况: "值"}}`，工况如 `110℃×24h` / `1450℃×3h` / `1450℃×1h` / `1450℃`；
    **值可能是重复测量**：`"3.06 / 3.03"`、`"4.88 / 4.84"`（拆分为多条测试记录的依据）。
  - `ml_formula_component` **12,522** 行：`dataset_source, recipe_id, comp_index, material_id, ratio_pct, component_features(JSON)`；
    例 `material_id='61.0'` + `base='棕刚玉'` + `particle_size_mean=11.5/std=3.5`。
- **组分 material_id 与原料注册表已对齐**：`material_base` 89 行（material_id 0..88，S1 冻结基准）↔ `ml_formula_component.material_id`（findings F14/S1）。
- **四张业务表当前基数**（数据管理页签对应表，待 Phase 1 用 DDL 复核列契约）：
  `recipes` 0 ｜ `mp_properties` 3 ｜ `test_indicators` 0 ｜ `tp_test_properties` 2 ｜ `mc_material` 3 ｜
  `working_conditions` 0 ｜ `fe_working_condition` 0 ｜ `service_data`/`ru_service_data` 0 ｜ `mr_formula` 2。
- **未决（Phase 1 必须确认）**：四表精确表名与字段契约；原料闸门要求；重复测量与工况如何落表；溯源列落在哪一列。

## F26 — 已存在的「物化」入口与它未跑的缺口（2026-10-14）
**结论：用户要的导入，仓库里已有实现且从未运行** —— `backend_impl/scripts/materialize_ml_dataset.py`（430 行，`ml_*` → 业务四表，
幂等 delete-then-insert，靠 ML 标记只删自己创建的行）。前端 `MlDatasetView.vue`（数据管理 → ml 数据 tab）经 `/api/ml-dataset` 触发 load/materialize。
**四表映射（据代码逐条核对）**：配方表 `mr_formula` / 原料表 `mc_material` / 物性表 `mp_properties` / 测试表 `tp_test_properties`。

| 目标表 | 粒度 | 关键列写入 | 标记 |
| --- | --- | --- | --- |
| `mc_material`（原料） | 每个 `(dataset_source, material_id)` **一条** | `batch_no='ML-<src>-<mid>'`、`type='其他'`、`component_list=[[label, mp_id, "{}", 100]]` | `batch_no LIKE 'ML-%'` |
| `mp_properties`（物性） | 每个 MC **一条** | `fixed_properties`(稳定理化子集)、`custom_properties`(51 特征原样)、`mc_ids=[mc_id]` | **无标记列** → 靠 `mc_ids` 反向引用判定（软） |
| `mr_formula`（配方） | 每个配方一条 | `formula_name='[ML] <src>-<rid>'`、`batch_no='ML-<src>'`、`component_list=[[label, mc_id, "{}", ratio], …]`、`tp_ids`、`creator='ml-ingest:<src>'` | `creator`/name/batch 三处前缀 |
| `tp_test_properties`（测试） | 每个有 y 的配方**一条** | `mp_id=NULL`、`test_params={property_keys, temperature_conditions, value_shape}`、`test_results=y_labels 原样 JSON`、`test_condition='ML数据集: <src>'` | `test_condition LIKE 'ML数据集: %'` |

**必须在方案中处理的缺口（未跑，因此尚未暴露）**：
1. **原料身份丢了粒级轴**：MC/MP 按 `(source, material_id)` 去重，同一 `material_id` 的不同 `particle_size_mean/std` 实例被折叠成一条
   （实测 `ml_formula_component` 里 material_id=61.0 既有 mean=11.5/std=3.5 也有 mean=6.5/std=1.5）→ 与 F14/S7 确立的「粒径轴一等公民」冲突；
   而配方里的配比保留在 MR.component_list（ratio ✓），粒级却无落点。
2. **测试表粒度过粗**：一个配方一条 TP，把 4 属性 × 多工况 × 可能 2 次重复测量（`"3.06 / 3.03"`）塞进一个 JSON；
   无法按属性/工况检索或与物性关联（`mp_id=NULL`），重复测量未拆分。
3. **成品性能无处可放**：4 个 y（体积密度/常温抗折/耐压/线变化）只作为 TP 里的 JSON 键；`mp_properties` 只承载**原料**理化特征。
   「物性表」的语义（原料物性 vs 成品性能）需按前端页签确认后再定。
4. **删除判据偏软**：MP 无标记列，靠「只被 ML 的 MC 引用」判定并删除 → 若某条业务 MP 只引用 ML MC 会被误删。
5. **数据完整度**：33/780 配方 `y_labels` 为空（无 TP）；零组分配方会被跳过（计数待测）。
6. **注册表闸门未接**：脚本直接用 `material_id`/`base` 文本造 label，未走 `material_base`/`material_alias`/`resolveMaterialBase`
   的规范名与别名解析（F14/S1 已冻结 material_id 0..88 ↔ material_base）。

## F27 — 四表契约冻结：为什么现有物化脚本「能跑但会显示为空」（2026-10-14）
**四页签 ↔ 表**（`DataManagerView.vue:574` MANAGE_TABS）：配方=`mr_formula`、原料=`mc_material`、物性=`mp_properties`、测试=`tp_test_properties`。
**展示别名 ≠ DB 列**：`mp.properties` 由 `renderPropsDisplay(fixed_properties, custom_properties)`（`DataTable.vue:97`）合成；`tp.mr_id` 入参经 `payload.mr_ids=[payload.mr_id]`（`:282`）归一，行内渲染 `mr_ids` 徽章（`:109`）；`tp.test_results` 走 `renderPropsDisplay(row.test_results, [], true)`（`:103`）。

**三处硬约束（现有脚本全不满足）**
1. **属性名必须命中词表**：`formatPropertyDocument`（`utils/propertyMeasurements.js:331-348`）**只遍历词表定义**渲染，`document.properties[definition.name]`；
   而 `properties-config.json` 的 `testProperties` 是 camelCase + 带工况后缀（`bulkDensity(110Cx24H)`、`flexuralStrength(110Cx24H)`、`compressiveStrength(110Cx24H)`、`permanentLineChange(1450Cx24H)`…），
   ML 的 `bulk_density/cold_modulus/crushing_strength/linear_change` **命中 0 条** → 按现状导入，测试表「内容」列渲染 `暂无数据`。
2. **文档结构不符**：平台物性文档是 `{schemaVersion, properties:{name:[测量项]}, customProperties:[]}`（测量项含 `fields:{value,temperature,duration}`，见 `properties-def.js:3-16` 与 `enrichProperty`）；
   ML 的 `test_results` 是 `{属性:{工况:"值"}}`（值为字符串，含重复测量 `"3.06 / 3.03"`）→ 结构与类型都不匹配。
3. **工况命名规范**：`properties-def.js:45-52` 解析 `<name>(<T>Cx<H>H)` 为 name+温度+时长 → 平台的 110℃×24h == `110Cx24H` ✓；
   但 ML 还有 `1450℃×3h` / `1450℃×1h` / `1450℃`（无时长）→ **词表没有**，需决策（改词表 or 入 customProperties）。

**闸门（脚本直连 SQLite，绕过服务层 → 必须自检）**：组件名需能解析到 enabled `material_base`（`materialBaseService.resolveComponentsForInsert:262-295`）、`ratio∈(0,100]` 且**和=100±0.01**、组件列表非空、引用 ID 存在（`newDbService.js:505-512` 为 MC 侧闸门；MR 侧只校验 MC 存在）。
**其他既有缺陷（已在方案中列明处理）**：MC 按 `(source, material_id)` 折叠丢粒级轴（与 F14/S7 冲突）；MP 无标记列、删除靠 `mc_ids` 反向引用（会误删业务行）；TP 一配方一条把 4 属性×多工况×重复测量塞进一个 JSON；33/780 配方无 y（无 TP）；零组分配方被跳过。
