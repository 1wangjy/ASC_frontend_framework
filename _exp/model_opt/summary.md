# 性质预测模型优化实验（隔离环境 `_exp/model_opt`）

- 组数：41（含失败 0）
- 记录条数：164（属性 × 组）
- 协议：`make_long_property_frame`（交接脚本工况展开）→ `split_by_recipe(test 0.2, seed 42)` → `GroupKFold(3)`
- 指标口径：`test_rmse` 为主（越小越好），附 `cv_rmse`、`test_r2`

## 每属性最优配置（按 test_rmse）

| 属性 | 基线 test_rmse / R² | 最优 test_rmse / R² | 相对基线 | 最优配置 | 下一档（次优） |
| --- | --- | --- | --- | --- | --- |
| 体积密度 | 0.0737 / 0.926 | **0.0658 / 0.941** | -10.7% | R2G4 fs:sfm-1.5xmean（yangquan）| 0.0667 lgbm:{"n_estimators":  |
| 常温抗折强度 | 1.7881 / 0.819 | **1.7881 / 0.819** | +0.0% | R0G0 baseline(deployed: xgboost + extra_trees)（yangquan）| 1.7881 model:extra_trees |
| 常温耐压强度 | 6.6142 / 0.855 | **6.2492 / 0.870** | -5.5% | R1G6 model:xgboost(default)（yangquan）| 6.5305 model:random_forest |
| 线变化率 | 0.0461 / 0.951 | **0.0461 / 0.951** | +0.0% | R0G0 baseline(deployed: xgboost + extra_trees)（yangquan）| 0.0461 model:extra_trees |

## 各轮结论

### R0
- 体积密度：0.0737（R² 0.926）← baseline(deployed: xgboost + extra_trees) / yangquan
- 常温抗折强度：1.7881（R² 0.819）← baseline(deployed: xgboost + extra_trees) / yangquan
- 常温耐压强度：6.6142（R² 0.855）← baseline(deployed: xgboost + extra_trees) / yangquan
- 线变化率：0.0461（R² 0.951）← baseline(deployed: xgboost + extra_trees) / yangquan

### R1
- 体积密度：0.0667（R² 0.939）← model:hist_gbm / yangquan
- 常温抗折强度：1.7881（R² 0.819）← model:extra_trees / yangquan
- 常温耐压强度：6.2492（R² 0.870）← model:xgboost(default) / yangquan
- 线变化率：0.0461（R² 0.951）← model:extra_trees / yangquan

### R2
- 体积密度：0.0658（R² 0.941）← fs:sfm-1.5xmean / yangquan
- 常温抗折强度：2.0851（R² 0.755）← fs:none / yangquan
- 常温耐压强度：6.8271（R² 0.845）← fs:sfm-2xmean / yangquan
- 线变化率：0.0573（R² 0.924）← fs:sfm-2xmean / yangquan

### R3
- 体积密度：0.0667（R² 0.940）← lgbm:{"n_estimators": 300, "learning_rate": 0.05, "num_leaves":  / yangquan
- 常温抗折强度：1.9304（R² 0.790）← lgbm:{"n_estimators": 600, "learning_rate": 0.03, "num_leaves":  / yangquan
- 常温耐压强度：6.5951（R² 0.856）← lgbm:{"n_estimators": 600, "learning_rate": 0.03, "num_leaves":  / yangquan
- 线变化率：0.0487（R² 0.945）← lgbm:{"n_estimators": 800, "learning_rate": 0.02, "num_leaves":  / yangquan

### R4
- 体积密度：0.0668（R² 0.939）← condition:onehot / yangquan
- 常温抗折强度：2.0851（R² 0.755）← condition:onehot / yangquan
- 常温耐压强度：7.0578（R² 0.835）← condition:onehot / yangquan
- 线变化率：0.0582（R² 0.921）← condition:onehot / yangquan

### R5
- 体积密度：0.0668（R² 0.939）← variant:yangquan / yangquan
- 常温抗折强度：1.8231（R² -0.019）← variant:zibo / zibo
- 常温耐压强度：7.0578（R² 0.835）← variant:yangquan / yangquan
- 线变化率：0.0582（R² 0.921）← variant:yangquan / yangquan

## 每属性 Top5 配置（全部组，含跨变体，仅供定位线索）

**体积密度**
- 0.0658 (R² 0.941, cv 0.0677) — R2G4 fs:sfm-1.5xmean @ yangquan
- 0.0667 (R² 0.940, cv 0.0536) — R3G0 lgbm:{"n_estimators": 300, "learning_rate": 0.05, "num_leaves":  @ yangquan
- 0.0667 (R² 0.939, cv 0.0484) — R1G4 model:hist_gbm @ yangquan
- 0.0668 (R² 0.939, cv 0.0661) — R1G5 model:lightgbm(default) @ yangquan
- 0.0668 (R² 0.939, cv 0.0661) — R2G0 fs:none @ yangquan

**常温抗折强度**
- 1.7881 (R² 0.819, cv 3.1551) — R0G0 baseline(deployed: xgboost + extra_trees) @ yangquan
- 1.7881 (R² 0.819, cv 3.1551) — R1G3 model:extra_trees @ yangquan
- 1.8231 (R² -0.019, cv 1.7402) — R5G4 variant:zibo @ zibo
- 1.8959 (R² 0.797, cv 3.1321) — R1G6 model:xgboost(default) @ yangquan
- 1.9304 (R² 0.790, cv 3.2370) — R3G5 lgbm:{"n_estimators": 600, "learning_rate": 0.03, "num_leaves":  @ yangquan

**常温耐压强度**
- 6.2492 (R² 0.870, cv 7.9834) — R1G6 model:xgboost(default) @ yangquan
- 6.5305 (R² 0.859, cv 7.3682) — R1G2 model:random_forest @ yangquan
- 6.5951 (R² 0.856, cv 7.3890) — R3G1 lgbm:{"n_estimators": 600, "learning_rate": 0.03, "num_leaves":  @ yangquan
- 6.6142 (R² 0.855, cv 7.6390) — R0G0 baseline(deployed: xgboost + extra_trees) @ yangquan
- 6.6142 (R² 0.855, cv 7.6390) — R1G3 model:extra_trees @ yangquan

**线变化率**
- 0.0461 (R² 0.951, cv 0.0638) — R0G0 baseline(deployed: xgboost + extra_trees) @ yangquan
- 0.0461 (R² 0.951, cv 0.0638) — R1G3 model:extra_trees @ yangquan
- 0.0487 (R² 0.945, cv 0.0713) — R3G2 lgbm:{"n_estimators": 800, "learning_rate": 0.02, "num_leaves":  @ yangquan
- 0.0504 (R² 0.941, cv 0.1750) — R1G4 model:hist_gbm @ yangquan
- 0.0506 (R² 0.941, cv 0.0665) — R3G5 lgbm:{"n_estimators": 600, "learning_rate": 0.03, "num_leaves":  @ yangquan

## 提升空间判断（同变体 yangquan 内可比）

- **体积密度**：同变体内极差 0.1691（257.0% of best，最差配置 condition:hours_only）；Top3 差异 1.4%；相对 R0 基线提升 +10.7%；已接近该变体的可解释上限：Top3 配置差异仅 1.4%，继续调参收益有限；主要瓶颈是样本量（141 条）与标签噪声，需要数据侧改进
- **常温抗折强度**：同变体内极差 21.8391（1221.4% of best，最差配置 model:elastic_net）；Top3 差异 6.0%；相对 R0 基线提升 +0.0%；仍有调参空间：Top3 配置差异 6.0%
- **常温耐压强度**：同变体内极差 50.6701（810.8% of best，最差配置 model:elastic_net）；Top3 差异 5.5%；相对 R0 基线提升 +5.5%；仍有调参空间：Top3 配置差异 5.5%
- **线变化率**：同变体内极差 0.1381（299.9% of best，最差配置 lgbm:{"n_estimators": 400,）；Top3 差异 5.7%；相对 R0 基线提升 +0.0%；仍有调参空间：Top3 配置差异 5.7%

## 与线上已部署模型（metrics_all.csv, yangquan）对照

| 属性 | 线上 test_rmse / R² | 本轮最优 | 变化 |
| --- | --- | --- | --- |
| 体积密度 | 0.0689 / 0.936 | 0.0658 / 0.941 | -4.5% |
| 常温抗折强度 | 1.7628 / 0.825 | 1.7881 / 0.819 | +1.4% |
| 常温耐压强度 | 6.6991 / 0.851 | 6.2492 / 0.870 | -6.7% |
| 线变化率 | 0.0541 / 0.932 | 0.0461 / 0.951 | -14.9% |

## 失败组

- 无
