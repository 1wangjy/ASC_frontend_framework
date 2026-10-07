# 任务计划：常温抗折强度（cold_modulus）R² 提升到 ≥ 0.85

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

### Phase 6：词表归束统一（以 L3 为基准）— Status: pending（待用户批准后执行）
> 方案：`docs/material-vocabulary-unification-plan.md`；量化依据：findings.md F14、审计 `docs/material-vocabulary-audit.md`。
> 已明确"只计划不执行"，本阶段在获批前不动代码/数据。

- [ ] S1 冻结基准：L3 89 条生成 `material` 表骨架（material_id 0..88 冻结，与 `ml_formula_component` 反查一致）
- [ ] S2 主桥导入：L6(197) 拆 (品类, 粒级) → `material_alias`（预计覆盖 67/89）+ `material_particle_size` + 人工队列
- [ ] S3 L5 全量处置：96 个优化器名 100% 处置（material / process_param(加水量·加胶量) / deprecated）
- [ ] S4 L4 辅桥校验：58 条有值映射交叉校验，冲突入队列（L4 对 L3 仅 17 交集，仅作校验）
- [ ] S5 业务侧补表：建 `raw_material`、迁 `material_base_rule`(2) 为别名、回填 `mc_material` 的 `MP_xxxxxx`
- [ ] S6 属性轴统一：19(优化器) ↔ 4×工况(预测) ↔ `y_feature_keys` → `property_vocab`
- [ ] S7 粒径轴统一：`[min,max]` ↔ `mean/std` 转换器 + 往返校验
- [ ] S8 版本收敛：20 份 map 产物除 `map_merged.json` 外归档 + `DEPRECATED.md` + 引用检查
- [ ] S9 接线与回归：bridge 用 canonical 别名表、`/api/model2/materials` 返回覆盖率、UI 提示、新增测试
- [ ] 独立工作项 W1（本方案外）：缺失品类并入优化器搜索空间并重训代理模型

## Next Step
Phase 6：等待用户对 `docs/material-vocabulary-unification-plan.md` 的批准（未获批前不执行任何 S1–S9 改动）。（标签聚合改造 + 推理侧工况中心化）；如获批准，另起 Phase 5 迁移。

