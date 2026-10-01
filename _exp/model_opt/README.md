# 性质预测优化实验（隔离环境）

- 环境隔离：只**读**交接数据（`_ref/handover/ML`）与训练脚本，所有产物写在 `_exp/model_opt/`，不触碰线上模型目录
  （`backend_impl/python/model_predict/MODEL`）与线上库。
- 统一协议（两个驱动一致，结果可比）：`make_long_property_frame`（交接脚本的工况展开）→ `split_by_recipe(test 0.2, seed 42)`
  → `GroupKFold(3)`；主指标 `test_rmse`，附 `cv_rmse` / `test_r2`。

## 模型侧（`driver.py` + `analyze.py` → `results.jsonl` / `summary.md`）
5 轮 × 8 组 + R0 基线 = 41 组、0 失败：R1 模型族 / R2 特征选择（相对阈值）/ R3 LightGBM 网格 /
R4 工况编码 / R5 数据变体与融合。

## 数据侧（`driver_data.py` + `analyze_data.py` → `results_data.jsonl` / `results_verify.jsonl` / `summary_data.md`）
5 轮 × 8 组 = 40 组、0 失败；模型固定为模型侧选出的每属性最优，使差异只来自数据处理：
- R1 单位/量纲与物理约束（`bulk_density` 自适应折算回 g/cm³、`linear_change` 分数×100、`crushing_strength` 钳制/丢弃越界）
- R2 缺失与列清理（全缺列、>30%/>50% 缺列、缺失指示、均值/KNN/迭代插补）
- R3 数据源与合并（zibo/processed/fill/base，及 yangquan+processed+zibo 合并）
- R4 条件粒度与标签聚合（丢弃小样本条件列、配方聚合均值/中位数、y σ 截断）
- R5 清洗 × 数据规模 × 模型（与模型侧最优叠加）
- **多种子验证**（`--verify`，种子 42/7/2024/1234/99）：同一配置在不同切分下的均值±std，避免单种子选择偏差。

运行：
```bash
VENV=backend_impl/python/model_predict/.venv/bin/python
$VENV _exp/model_opt/driver.py --reset            # 模型侧
$VENV _exp/model_opt/driver_data.py --reset       # 数据侧
$VENV _exp/model_opt/driver_data.py --verify      # 多种子稳健性验证
$VENV _exp/model_opt/dedupe.py                    # 账本去重（同轮同组保留最新）
$VENV _exp/model_opt/analyze.py && $VENV _exp/model_opt/analyze_data.py
```
