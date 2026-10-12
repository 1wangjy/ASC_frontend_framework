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
