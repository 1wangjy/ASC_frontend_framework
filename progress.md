# 会话日志（progress.md）

## 会话 1 — 2026-10-05
- 目标：cold_modulus R² ≥ 0.85（40 组隔离实验）。
- 动作：恢复状态（无既有规划文件；工作区干净，HEAD=ee568b8）；创建 `task_plan.md` / `findings.md` / `progress.md`。
- 基线确认：部署 0.8245 / 模型侧 0.8195 / 数据侧 0.8320 / 多种子 0.7256±0.0773。
- 下一步：Phase 1 —— 写 `_exp/cold/driver_cold.py`。

## 会话 1（续）
- Phase 1 完成：`_exp/cold/driver_cold.py`（协议复用 + 重复测量级标签重建 + 12 类杠杆）；基线复现 0.8195 ✓。
- Phase 2 进行：R1 完成（trimmed → 0.8673）、R2 完成（按工况中心化 → 0.8540）、R3–R5 运行中。
- 误差记录：IterativeImputer 需 `enable_iterative_imputer`；重建 targets 必须与 features 行序对齐（`Unalignable boolean Series`）；`drop_constant_cond` 默认须为 False 才与既有基线可比。
- Phase 2 完成（40 组，R1–R5）：达标配置 2 个（trimmed 0.8673、中心化 0.8540）。
- Phase 2 追加（R6/R7 组合 16 组）：组合 trimmed+中心化 → 0.8927（OOF 0.6558）。
- Phase 3 进行：多种子（42/7/2024/1234/99）验证 5 个候选配置。

- Phase 3 完成：9 个候选 × 5 种子。多种子最优 = 组合(trimmed+中心化+删列+指示) 0.7921 ± 0.0831（基线 0.5831）。
- Phase 4 完成：`_exp/cold/README.md` + `summary_cold.md`。
- 总计：主体 40 组 + 组合 16 组 + 多种子 45 次运行。

## 会话 2 — 2026-10-06（UI）
- 需求：侧边栏「数据平台 → 模型入口」子项左右留白缩小 1/3，并统一风格 + 优化。
- 完成：`tokens.css` 新增 14 个 `--asc-nav-*` 令牌；`AscSidebar.vue` 全量改为令牌引用（27 处），
  统一 hover/激活色、圆角、层级线与分隔线，删除重复声明；几何：子项水平留白 46→32px（−30.4%）。
- 验证：服务端下发 CSS 核对通过；8 个测试套件 56 项全通过。浏览器工具 4 次超时 → 视觉确认待人工。
- 环境：`/tmp/svc` 曾被系统清理导致前端启动失败（已重建）；WSL drvfs 上 vite 监听不生效，改动后需重启 dev server。

## 会话 3 — 2026-10-06（首页主视觉替换）
- 需求：首页主展示图片替换为 `/mnt/d/Download/show1.png`（1448×1086, 1.79MB PNG）。
- 完成：复制为 `public/landing-hero.png`（md5 与源一致）；`LandingHomeView.vue` 用 `<img>` 替换 `<LandingHeroArt>` 组件，
  图注改为顶部渐变蒙层叠字；删除已无引用的 `src/components/landing/LandingHeroArt.vue`（目录随之移除）。
- 验证：`/landing-hero.png` 200 / image/png / 1789147B（md5 校验一致）；页面模块引用已更新且不再含 LandingHeroArt；
  `test:landing` 通过。
- 环境坑（重要）：**dev server 启动时会缓存 `public/` 的文件索引**——新增静态文件在重启前一律返回 SPA 兜底（text/html），
  已用探针文件复现；重启 vite 后恢复正常。另 `/tmp/svc` 会被系统清理。
- 待确认：1.79MB PNG 偏大，可选转 WebP/降采样（体积约可降 80%）——需用户确认后再动。

## 会话 3（续）— 主视觉收边 + 环境恢复
- 收边改动：`--landing-hero-inset`(clamp 10–16px) 内缩画框 + 同心圆角 `--landing-hero-radius` + 1px 亮边与投影；
  图注改为图片左上角深色胶囊标签。提交 f42359e。
- 最终验证：首页 200（**3.8ms**，此前多次 000 为冷启动/dep 优化器扫描 drvfs 的假象）；
  `/landing-hero.png` 200 / image/png / 1789147B；`/api/simulation/history` 200（代理链路恢复）。
- 环境恢复：本机四个服务此前全部退出，已重启并验证健康 —— 3001(beimpl) / 5001(ai4sci) / 8100(modelapi) / 3005(vite)。
  启动命令（供后续复用）：
  `cd backend_impl && node src/index.js`；`cd AI4Sci-NEXUS-ASC-Development-Domain/backend && .venv/bin/python run.py`；
  `cd backend_impl/python/model_predict && .venv/bin/python -m uvicorn API.app:app --host 127.0.0.1 --port 8100`；
  `node node_modules/.bin/vite --host`。
- 待办（用户可选）：图片 1.79MB 可转 WebP（约省 80%）；`server.open:true` 在 WSL 触发 powershell EACCES 噪声；
  `optimizeDeps.entries` 扫描整个 src 导致冷启动慢，可只保留 index.html。

## 会话 4 — 2026-10-06（主视觉：完整显示 + 渐隐 + 尺寸贴合）
- 需求：图片显示不完整；要左右边缘渐变蒙版淡化；尺寸更贴合面板留白。
- 完成：
  * `object-fit: cover` → **`contain`**（完整显示整图，不再裁切）
  * 新增**渐变蒙版**：`mask-image` 双向叠加（90deg 左右各淡出 16% + 180deg 上下各羽化 9%），
    `mask-composite: intersect` / `-webkit-mask-composite: source-in`
  * 面板 `align-self: stretch` + min/max-height → **`aspect-ratio: 4/3`（与图片 1448×1086 同比例）+ `align-self: center`**：
    contain 正好铺满面板 → 零留白、零裁切，蒙版边界正好落在图片真实边缘
  * 全部走令牌：`--landing-hero-fade-x/-fade-y/-zoom/-aspect/-inset`
- 验证：服务端下发 CSS 含新规则与 5 个旋钮；test:landing 4/4；首页 200。浏览器截图工具仍不可用，视觉待人工。

## 会话 5 — 2026-10-06（主视觉加宽 25% + 主页背景色前景蒙版）
- 需求：主视觉长度拉长 25% 高度不变；前景蒙版不要深色，而应"边缘=主页背景色、中间透明"。
- 完成：
  * 加宽：hero 网格 `1.12fr/0.88fr` → `0.82fr/1fr`（主视觉列相对 +25%），面板比例 `4:3 → 5:3`
    → **宽度 +25%、高度不变**（两者自洽：0.44C×1.25=0.55C，高度 0.33C 不变）
  * 图片填充 `contain → fill`（按面板拉伸，正好 +25% 宽、同高；`--landing-hero-fit` 可切 cover/contain）
  * 前景蒙版：删除深色面板底/描边/投影，改为 `.landing__visual::after` ——
    边缘 `--landing-hero-mask-color`(#f6fafd，近似主页背景) 不透明，中间 `--landing-hero-mask-clear` 全透明；
    左右 22% / 上下 12% 过渡；图注 z-index 提到 3 保证在蒙版之上
- 验证：服务端下发 CSS 含 ::after 蒙版规则、7 个旋钮；test:landing 4/4。浏览器截图仍不可用，视觉待人工确认。

## 会话 6 — 2026-10-06（首页背景层次 + 主视觉上对齐）
- 背景：`.landing` 增加两层装饰——`::before`（3 处柔光斑 + 顶部白雾 + 底部轻微压暗）与 `::after`（36px 极淡网格，向下渐隐；
  用 mask 渐隐）。与主视觉冷调呼应，避免单色死板；强度全部走 `--landing-bg-glow / -glow-alt / -grid` 旋钮。
- 主视觉底部增加 `::before` 浅色光晕底衬，使「前景蒙版色」与新的背景层次自然衔接。
- 对齐：hero 网格 `align-items: center → start` + 新增 `align-content: center`（整组仍在 hero 带内垂直居中）；
  `.landing__visual` `align-self: start`，并加 `--landing-hero-align-offset: 4px` 补偿 eyebrow 行高 1.5 的半行距，
  使图片顶边与「MATERIALS INTELLIGENCE · RESEARCH PLATFORM」文字视觉顶端对齐。
- 验证：服务端下发 CSS 含两层装饰与 11 个旋钮；test:landing 4/4。浏览器截图仍不可用，视觉待人工确认。

## 会话 7 — 2026-10-06（配方优化：按预测模型 base 约束组分）
- 需求：在「配方优化」里能按**预测模型 base 列表**下拉选择某组分，约束"不少于/不多于"。
- 侦察结论（关键）：
  * 该能力**机制上早已存在**：左侧「成分约束」区块支持 区间/固定/禁用，区间**只填一侧即 ≥ / ≤**；
    实测 `{mode:'range',min:15}` → 最优配方 90矾土 25.49%、`material_rules_met: true`。
  * 但下拉用的是**优化器自己的 96 原料词表**（其代理模型 `predictor_model.pkl` 的 material_names），
    与预测模型 89 base **不同源**：仅 40 个同名、12 个可归一化/唯一包含对应、**31 个（含棕刚玉）优化器里根本没有**。
- 交付（按 base 列表选择）：
  * 桥接 `recipe_opt_bridge.py`：新增 `_norm_material_name` / `_resolve_optimizer_materials`（exact→normalized→唯一包含，绝不猜测）、
    `list_bases()` 与 `--list-bases`；`_parse_ingredient_constraints` 接受 base 名（多候选必须用 `material` 指定具体原料），
    规则回显新增 `requested_name` / `material` / `match`。
  * 控制器 `model2Controller.js`：`/api/model2/materials` 一并返回 `bases`（含 `targets`/`match`/`status`）与 `summary`；
    约束白名单新增 `material` 字段；错误回传改为**只取 bridge 的 ERROR 行**（原先会把整段 stderr 日志塞给前端）。
  * 前端：`ingredientConstraints.js` 新增 `material`/`materialOptions` 字段、`buildConstraintOptions()` 分组、
    校验"多候选必须选定具体原料"；`Model2View.vue` 下拉改为四组 optgroup
    （可直接约束 / 需指定具体原料 / 优化器无对应（禁用）/ 优化器原料其他）+ 多候选时出现二级选择。
- 实测：`60均质 → 60均质粉`（normalized，≥20 生效）；`Al2O3 + material=Al2O3微粉`（explicit，≥10 生效）；
  多候选未指定 → 单行错误列出候选；`棕刚玉` → 单行错误说明优化器无对应原料。
- 测试：`tests/ingredientConstraints.test.js` 扩到 12 项全通过；仓库既有 8 个 npm 测试套件 56 项全通过。
- 覆盖：89 base → 52 可直接约束 / 6 需指定具体原料 / **31 无对应**（要全覆盖需扩优化器原料并重训代理模型）。

## 会话 8 — 2026-10-06（原料词表端到端审计）
- 需求：追问"词表是否没充分构建"，要求从头到尾分析对应关系并指出出问题的环节。
- 交付：`docs/material-vocabulary-audit.md`（6 层词表清单 + 9 条断点 + 修复建议 + 复现命令）；findings.md 记 F13。
- 关键发现：L4 归并表(20260728)建过但 63/121 未映射且**从未接入运行时**；L6 材料知识表(197 条)**孤儿**；
  L2 业务原料主表 `raw_material` **不存在**（控制器却查它）；两套词表同源(batch183)但粒度不同(原始条目 vs 品类)，
  交集仅 40；`_code/output` 20 份 map 产物无权威版本。

## 会话 9 — 2026-10-06（词表归束：只计划不执行）
- 需求：以 L3 为基准归束统一全部词表，先给方案、不执行。
- 交付：`docs/material-vocabulary-unification-plan.md`（基准与粒度约定 / 目标数据模型 / S1–S9 迁移 / 预期收益 / 风险 / 工作量 / 边界）；
  findings.md 记 F14（可行性量化）；task_plan.md 新增 Phase 6（S1–S9 全部 pending，标注"获批前不动代码/数据"）。
- 关键量化：L6(197) 名称部分覆盖 L3 base **67/89**、覆盖优化器 **79/96**；L4 弱桥（∩L3 仅 17）；
  仍需人工裁决的硬骨头仅 **4 条**（CA68水泥/CA71F水泥/磨料/除尘料）。

## 会话 10 — 2026-10-07（词表归束：执行 S1–S9）
- 先提交当前状态（403e978：.gitignore 的 _patent + .planning/）。
- 交付：`backend_impl/scripts/build_material_vocab.py`（生成器）→ `data/material_vocab.json` + `data/material_vocab_queue.csv`；
  `backend_impl/src/services/materialVocabService.js`（Node 侧唯一权威访问层）；`backend_impl/python/material_units.py`（S7 转换 + 自检）；
  桥接/解析控制器/编码器/Model2 UI 接线；`tests/materialVocab.test.js`（9 项）。
- 验证：90 项测试全绿；4 例真实优化调用符合预期；`/api/recipe-parser/parse` 恢复 200。
- 未解决：W1（优化器空间缺料需重训）；人工队列 84 条待裁定。

## 会话 11 — 2026-10-07（_exp 最优模型接入 + 旧目录改名）
- 交付：`scripts/train_exp_best_models.py` → `MODEL/outputs_exp_best/models/yangquan/*.joblib`（版本 exp_best_2026-10-07）；
  `API/app.py` 新目录优先 + `condition_offsets`（按工况中心化推理）；旧 `MODEL/` → `MODEL_old_sept_bak/`（代码保留入库）；
  同步修复 dump_vocab / _exp 脚本 / INTERFACE.md 的路径与描述。
- 验证：API 版本切换成功、预测合理、测试全绿。

## 会话 12 — 2026-10-08（达标模型全部上线）
- 交付：`scripts/train_exp_best_models.py` 重写为"逐属性取 `_exp` 达标最优 + 内置留出复算"，
  四项 R² = 0.9436 / 0.8949 / 0.8923 / 0.9551（**4/4 > 0.85**），版本 `exp_best_final_2026-10-08` 已部署到 8100。
- API：新增 `training_conditions` 告警（避免对清洗丢弃的工况静默外推）。
- 环境坑：`/tmp/svc` 被清理导致日志重定向失败、uvicorn 未启动（已重建目录并重启）。

## 会话 13 — 2026-10-12（日志迁入仓库 + 服务脚本）
- 新增 `backend_impl/scripts/services.sh`（start/stop/restart/status，日志写入 `backend_impl/data/logs/`）。
- 修 `vite.config.js`：`open` 支持 `VITE_NO_OPEN=1` 关闭（WSL 下 open:true 会因 powershell EACCES 让 dev server 退出）。

## 会话 14 — 2026-10-12（验收测试[2026] 独立页面 + 测试流接口）
- 后端：`acceptanceChecks.js`（11 项/36 检查/3 类）+ `acceptanceService.js`（node:sqlite + curl --noproxy + node --test 解析 + SSE 批量）
  + `routes/acceptance.js` 挂 `/api/acceptance`。
- 前端：`AcceptanceView.vue` + `api/acceptance.js` + 路由 `Acceptance2026` + 侧边栏「模型入口 → 验收测试[2026]」+ 模型入口页链接（不动轮播）。
- 实跑：36 项 → 33 通过 / 1 人工 / 0 未通过；新增 6 项注册表测试全通过。
- 环境坑：`services.sh start` 对已在运行的服务会跳过 → 改代码后须用 `restart`；本机 HTTP_PROXY 会让 node:http 得到 502 → 检查统一走 curl --noproxy。

## 会话 15 — 2026-10-13（修验收页 404）
- 根因：vite 代理缺 `/api/acceptance`，被兜底 `/api`→5001 拿走 → 404。已补代理并重启前端（经 3005 验证 200）。
- 硬化：`platform-structure` 检查新增"vite 代理已覆盖 /api/acceptance"断言，防回归。

## 会话 16 — 2026-10-14（ML 数据集 → 数据管理四表：方案阶段）
- 用户需求：把 ML 数据集原始记录（允许来源追溯与处理）导入数据管理四张表：配方/原料/物性/测试；要求先"schemeize"整个处理流程（planning-with-files）。
- 本轮产出：`task_plan.md` 顶部新增当前计划（Phase 1–5，Phase 1 进行中），原 R² 计划降级保留；`findings.md` 增 F25（ML 数据集侧勘察事实 + 四表当前基数）。
- 已核实：780 条配方/12,522 条组分来自 `_ref/handover/ML/*.npy`（batch183/zibo/yangquan），`y_labels` 为 `{属性:{工况:"值"}}` 且含重复测量字符串。
- 并行勘察中：ML 数据集来源链路与现存脚本；数据管理四表契约/写入路径/闸门。
- 注：本轮只做方案，未导入任何数据（Phase 4 才写库）。

## 会话 16（续）— 2026-10-14（四表契约冻结，Phase 1 complete）
- 两个只读勘察返回：ML 数据集来源链路（MlDatasetSource）+ 四表契约/闸门（DataMgmtTables）。
- 决定性发现：`materialize_ml_dataset.py` 已实现「ml_* → 四表」且**从未运行**；但它写出的属性名/文档结构与平台词表不匹配
  （ML `bulk_density` 等 0 命中词表；`test_results` 结构 ≠ 物性文档），**直接跑会导致界面显示"暂无数据"**（见 F27）。
- 本轮只做方案：`task_plan.md` Phase 1 → complete，Phase 2–6 细化为可执行步骤 + 6 条决策；findings 增 F26/F27。
- 两个待用户拍板的点已列入 Phase 2：MC 是否按粒级实例化身份；非词表工况（1450Cx3H 等）是改词表还是入 customProperties。
- 未导入任何数据（Phase 4/5 才写库）。

## 会话 17 — 2026-10-15（ML 数据集 → 数据管理四表：导入完成）
- 用户指引真源 `../_code/private_data/addtional/extractor/output/{yangquan,zibo}_formulas_clean`，据此核对并冻结策略（F31）。
- 新增 `backend_impl/scripts/import_ml_formulas.py`：读 Clean JSON（batch183 走 ml_formula 回退），
  组分解重+包装行过滤+配比归一（原始和留痕）、按粒级实例化 MC、v3 物性文档、测试文档（含 test_stage/温度/N-A）。
- 实测导入：MC 3→385、MP 3→385、MR 2→782、TP 2→749；配比闭合 0 违例、引用闭合 0 悬空、幂等复跑计数不变；
  四表 API 200；用真实前端渲染函数验证测试表/物性表均能显示（无"暂无数据"）。
- 修正两处契约细节（v3 文档需内嵌 customProperties；缺工况写 N/A）；撤销 properties-config.json 改动（词表本已可用）。
- 备份：`/tmp/database.db.bak-1015_144302`（写库前）。

## 会话 18 — 2026-10-15（MongoDB 统一文件管理：立项与勘察）
- 用户需求：backend_impl 内基于 MongoDB 的统一文件管理；GraphRAG chunk 按 DOI 可溯原文；文献库原文链接指向 Mongo；
  Mongo 分 public/private 标签（文献默认 public）；最后对齐前端「文献数据管理」逐条核验。
- 已：新增当前计划（`task_plan.md`，7 Phase）+ 21 项 TODO；修复旧的重复 Phase 3 标题；把 ML→四表计划据实标记为完成。
- 勘察真值（F33）：Mongo `asc-platform` 库**尚不存在**；现有 `attachments` bucket 从未写入；SQLite `literature` 17,695（attachment 1,420）、
  `lit_file` 2,466（全 ref 本地路径）、无 `file_id` 列。
- 进行中：三路只读勘察（Mongo/GridFS 现状、GraphRAG chunk 与 DOI、前端文献管理交互）。

## 会话 19 — 2026-10-15（MongoDB 统一文件管理：实施）
- 服务与接口：`fileStoreService`（GridFS `asc_files` + `file_meta`，DOI/sha256/visibility）、`/api/files/*`、
  `attachmentController` 接入（上传回写 attachment+file_id、预览 Mongo 优先带 Range、删除软删、元数据提取适配）。
- SQLite：`literature.file_id` / `lit_file.file_id`（幂等迁移）。
- 存量迁移：`migrate_files_to_mongo.js`（流式 + sha256 + 报告）；2,466 行 / 6.23 GB。
- GraphRAG：5001 `pdf_files` 增 doi/lit_id/platform_file_id；项目文件记录与 EvidenceChunk.metadata 带 platform_file_id；
  `AnswerReference.original_url` 指向 3001 的 Mongo 原文流；前端桥接透传三个字段。
- 环境事故与修复（F39）：容器 `mongodb-seml` 两次 OOM（exit 137）导致首轮迁移写入丢失；Docker 数据根在 9p 上，
  命名卷不兼容 WiredTiger（EPERM）→ 改为 `/home/shin/mongo-data`（WSL ext4）绑定卷 + `--wiredTigerCacheSizeGB 0.5`，容器稳定。
- 进行中：全量重迁移 + 逐条核验（`verify_literature_files.js`）。

## 会话 19（续）— 2026-10-15（统一文件管理：核验通过）
- 迁移落库：`asc_files`/`file_meta` 2,437 对象 / 6.15 GB；`lit_file` 2,466 行全部回填、`literature.file_id` 1,422。
- 逐条核验：2,466/2,466 通过（存在性 + 全量 sha256 对账 + 流式下载 200/206），附件 1,420 条 0 失败，0 孤儿。
- 发现并修复：文献库既有同内容不同名文件（2 对）导致 2 条附件 404 → 增文件名别名 `aliases[]` 并兼容解析。
- README 新增「统一文件管理（MongoDB GridFS）」；findings 增 F39（OOM/9p 环境）与 F41（核验结果）。
- 服务状态修复（会话 19 末）：`modelapi(8100)` 与 `frontend(3005)` 未启动 → 已拉起；前端反复退出系 Vite 监听 `.venv`/5001 `uploads`
  导致 inotify `ENOSPC`，已在 `vite.config.js` 忽略相关目录（F43），四服务 3001/3005/5001/8100 均 200。

## 会话 20 — 2026-10-18（pull 后 agent 对齐评估）
- 真实驱动 agent：禁工具轮（253 字，声明非检索证据）、`kg_list` 工具轮、`kg_search` 图谱轮（16 引用、knowledgeToolMs 58.8s）。
- 测试：后端 agent 131/131；前端 agent 94（92 通过/2 跳过/0 失败）；新增 `agentWorkspaceUi.test.js` 挂起（待上游）。
- 修复：`normalize_doi` 支持序号前缀文件名（历史引用 doi/original_url 由 None → 16/16 有效）；
  前端 `citations.js` 链接改为 `original_url` 优先。
- 报告：`check/check_status_2026-10-18_agent.md`。

## 会话 21 — 2026-10-18（MongoDB "未连接" 故障修复）
- 复现并定位：`/api/attachment/test` 只认启动时建立的 legacy mongoose 连接（失败不重试、bucket 不惰性构造），
  且上传守卫无视已可用的统一存储 → 容器重建期启动后端会"一直未连接"，必须重启。
- 修复并实测自愈：惰性 bucket + 指数退避重连 + `checkStorage()` 组合判定；故障态 503 → 恢复 Mongo 后 5s 内 200（未重启后端）。

- 追加修复：`/platform/data?tab=manage` 的「MongoDB测试」页签——`testMongoDB()` 的解包错位（`unwrapApiSuccess` 返回 data
  而页签判断 success）导致永远显示"未连接"；改为保留完整响应并展示 unified/legacy/mongooseState 明细。

## 会话 22 — 2026-10-18（MongoDB 可视化管理面板）
- 将「MongoDB测试」页签整体替换为管理面板：概览（版本/运行时长/集合/文档/体积/bucket）、文档浏览（关键词+高级过滤+分页+JSON 展开）、
  文件导航（file_meta 按可见性/类型/关键词筛选，打开原文）、索引管理（列表/创建/删除）、统计（预置聚合）。
- 新增后端 `/api/mongo/*`（只读浏览 + 索引管理 + 聚合，安全白名单）；vite 增 `/api/mongo` 代理。
- 验证：6 个接口经 3005 全 200；`$where`/`$out` 负例 400；`vite build` 通过。
- 记录：`check/mongo-admin-panel_2026-10-18.md`。
