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
