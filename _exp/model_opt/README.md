# 性质预测模型优化实验（隔离环境）

- 环境隔离：只**读**交接数据（`_ref/handover/ML`）与训练脚本，所有产物写在 `_exp/model_opt/`，不触碰线上模型目录
  （`backend_impl/python/model_predict/MODEL`）与线上库。
- 运行：`backend_impl/python/model_predict/.venv/bin/python _exp/model_opt/driver.py --reset`
- 汇总：`… -c` 之后 `backend_impl/python/model_predict/.venv/bin/python _exp/model_opt/analyze.py` → `summary.md`
- 协议（所有组一致，保证可比）：`make_long_property_frame`（交接脚本的工况展开）→ `split_by_recipe(test 0.2, seed 42)`
  → `GroupKFold(3)`；指标 `test_rmse` 为主，附 `cv_rmse` / `test_r2`。
- 5 轮 × 8 组 = 40 组 + R0 基线（复现线上部署配置），共 41 组、0 失败。
