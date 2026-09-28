# ML 耐火材料性能预测项目

本项目是一套面向耐火材料配方数据的机器学习流水线，用于从 `.npy` 格式的配方样本中生成固定宽度特征，并训练多个回归模型来预测材料性能。当前代码覆盖数据预处理、缺失值填补、按数据来源拆分、特征工程、模型训练、预测结果导出和特征重要性分析。

## 项目概览

项目中的样本以配方为单位组织。每条样本包含材料组分矩阵、全局工艺特征和多个性能标签。模型训练时会把同一性能属性在不同工况下的标签展开成长表，并把工况信息编码为额外特征，从而分别训练以下四类性能预测模型：

- `bulk_density`：体积密度
- `cold_modulus`：常温抗折强度
- `crushing_strength`：耐压强度
- `linear_change`：线变化率

当前主数据集 `datasetv2.npy` 共 780 条样本，来源分布如下：

| 数据来源 | 样本数 |
| --- | ---: |
| `batch183` | 182 |
| `zibo` | 457 |
| `yangquan` | 141 |

## 目录结构

```text
.
├── datasetv2.npy                  # 原始/基础数据集
├── dataset_processed.npy          # 清洗后的数据集
├── dataset_fill.npy               # 化学字段缺失值填补后的数据集
├── batch183.npy                   # 按来源拆分的数据集
├── zibo.npy                       # 按来源拆分的数据集
├── yangquan.npy                   # 按来源拆分的数据集
├── processed/
│   ├── preprocess_dataset.py      # 标签清洗、异常值过滤和单位修正
│   ├── fill_dataset.py            # 随机森林迭代填补化学字段缺失值
│   └── split_dataset_by_source.py # 按 dataset_source 拆分数据集
├── FEATURE/
│   ├── build_features.py          # 从 .npy 构建 features/targets/metadata
│   └── outputs/                   # 特征表、标签表和元数据
└── MODEL/
    ├── model.py                   # 基础版模型训练脚本
    ├── model_selective_selector.py# 带特征选择和 stacking 的模型训练脚本
    ├── outputs/                   # 基础版模型输出
    └── outputs_selective_selector/# 特征选择版模型输出
```

## 环境依赖

建议使用 Python 3.9 或更高版本。核心依赖如下：

```bash
pip install numpy pandas scikit-learn joblib
```

可选模型依赖：

```bash
pip install xgboost lightgbm catboost
```

说明：

- `xgboost` 和 `lightgbm` 安装后会被训练脚本自动纳入候选模型。
- `catboost` 在代码中作为可选依赖导入，当前主训练脚本 `model_selective_selector.py` 的候选模型列表未实际启用它。
- 如果可选依赖未安装，脚本会跳过对应模型，不影响基础模型训练。

## 数据格式

每个 `.npy` 文件保存的是一个 Python 字典，读取方式如下：

```python
import numpy as np

data = np.load("datasetv2.npy", allow_pickle=True).item()
samples = data["samples"]
metadata = data.get("metadata", {})
```

典型样本包含以下字段：

- `recipe_id`：配方 ID，用于分组划分训练集和测试集，避免同一配方泄漏到不同集合。
- `dataset_source`：样本来源，例如 `batch183`、`zibo`、`yangquan`。
- `X_comp`：组分矩阵，每行代表一种原料或组分，列名由 `metadata[*]["X_comp_names"]` 给出。
- `X_global`：配方级全局特征，目前包含 `water_amount`、`hardening_time`、`hardening_time_uncertainty`。
- `y_labels`：性能标签，按属性和工况组织，例如 `bulk_density -> 110℃`。

当前基础数据集中，首条样本的 `X_comp` 形状为 `(17, 48)`，`X_global` 长度为 3，标签属性包含 `bulk_density`、`cold_modulus`、`crushing_strength` 和 `linear_change`。

## 完整运行流程

### 1. 数据预处理

```bash
python processed/preprocess_dataset.py
```

输入：

- `datasetv2.npy`

输出：

- `dataset_processed.npy`

主要处理逻辑：

- 对 `yangquan` 来源中小于 `0.1` 的 `linear_change` 数值乘以 100，修正可能的单位比例问题。
- 过滤 `bulk_density` 中小于 1 的无效数值。
- 过滤 `crushing_strength` 中低于 `18.65` 或高于 `108.65` 的异常数值。
- 保留全部样本，不删除样本，只清洗标签值。
- 更新 `metadata` 中的来源样本统计。

### 2. 化学字段缺失值填补

```bash
python processed/fill_dataset.py
```

输入：

- `dataset_processed.npy`

输出：

- `dataset_fill.npy`

该脚本会对以下化学字段进行随机森林迭代填补：

- `SiC`
- `SiO2`
- `AL2O3`
- `Fe2O3`
- `TiO2`
- `CaO`
- `MgO`
- `K2O`
- `Na2O`

填补器使用 `IterativeImputer`，基础估计器为 `RandomForestRegressor`。

### 3. 按来源拆分数据集

```bash
python processed/split_dataset_by_source.py
```

输入：

- `dataset_processed.npy`

输出：

- `batch183.npy`
- `zibo.npy`
- `yangquan.npy`

该步骤会根据每条样本的 `dataset_source` 字段拆分数据，并同步更新每个拆分数据集中的 `metadata`。

### 4. 构建特征和标签表

```bash
python FEATURE/build_features.py
```

默认会处理以下数据变体：

- `base` -> `datasetv2.npy`
- `processed` -> `dataset_processed.npy`
- `fill` -> `dataset_fill.npy`
- `zibo` -> `zibo.npy`
- `yangquan` -> `yangquan.npy`
- `batch183` -> `batch183.npy`

输出目录：

```text
FEATURE/outputs/
```

每个数据变体会生成三类文件：

- `features_<variant>.csv`：固定宽度特征表
- `targets_<variant>.csv`：标签表
- `metadata_<variant>.json`：特征列、标签列和数据处理元信息

当前已有输出规模如下：

| 文件 | 行数 | 列数 |
| --- | ---: | ---: |
| `features_base.csv` | 780 | 323 |
| `features_processed.csv` | 780 | 323 |
| `features_fill.csv` | 780 | 323 |
| `features_zibo.csv` | 457 | 280 |
| `features_yangquan.csv` | 141 | 258 |
| `features_batch183.csv` | 182 | 292 |
| `targets_base.csv` | 780 | 40 |
| `targets_processed.csv` | 780 | 40 |
| `targets_fill.csv` | 780 | 40 |
| `targets_zibo.csv` | 457 | 5 |
| `targets_yangquan.csv` | 141 | 16 |
| `targets_batch183.csv` | 182 | 28 |

常用参数：

```bash
# 只构建某一个数据变体
python FEATURE/build_features.py --dataset processed

# 指定输出目录
python FEATURE/build_features.py --output-dir FEATURE/outputs

# 合并等价工况，并额外生成 target_merge_report_<variant>.csv
python FEATURE/build_features.py --merge-target-conditions

# 指定作为类别变量编码的组分列
python FEATURE/build_features.py --categorical-columns material_id

# 指定不参与特征生成的组分列
python FEATURE/build_features.py --drop-component-columns base
```

特征工程逻辑：

- `recipe_id` 和 `dataset_source` 会保留在特征表中，用于追踪样本和分组。
- `X_global` 会展开为 `global_0`、`global_1`、`global_2`。
- `material_id` 默认作为类别变量，按配方比例编码为加权占比特征。
- 其他数值型组分列会按 `ratio_pct` 权重计算：
  - `wmean`
  - `wstd`
  - `min`
  - `max`
  - `missing_frac`
- 全空特征列会保留在 CSV 中，由训练阶段的 pipeline 只基于训练集决定是否丢弃。

## 模型训练

推荐使用：

```bash
python MODEL/model_selective_selector.py
```

默认输入：

```text
FEATURE/outputs/
```

默认输出：

```text
MODEL/outputs_selective_selector/
```

训练脚本会遍历 `FEATURE/outputs/features_*.csv`，并为每个数据变体分别训练四个性能属性的模型。

### 训练逻辑

1. 读取 `features_<variant>.csv`、`targets_<variant>.csv` 和 `metadata_<variant>.json`。
2. 按性能属性筛选目标列。
3. 将同一属性下不同工况的标签展开为长表。
4. 为工况生成额外特征，例如：
   - 是否无工况
   - 温度最小值、最大值、均值
   - 温度数量
   - 保温小时数
   - 工况 one-hot 特征
5. 使用 `recipe_id` 作为 group，按配方分组划分训练集和测试集。
6. 使用 `GroupKFold` 做交叉验证，按 `cv_rmse_mean` 选择最佳模型。
7. 在全量可用数据上重新训练最终模型。
8. 导出模型、测试集预测结果、特征重要性和指标表。

### 候选模型

`MODEL/model_selective_selector.py` 当前候选模型包括：

- `ridge`
- `extra_trees`
- `random_forest`
- `hist_gradient_boosting`
- `stacking`
- `xgboost`，需要安装 `xgboost`
- `lightgbm`，需要安装 `lightgbm`

其中，`bulk_density` 和 `linear_change` 默认会启用 `SelectFromModel` 做特征选择；`cold_modulus` 和 `crushing_strength` 会保留全量特征。

### 常用训练命令

```bash
# 默认训练所有已有特征数据集
python MODEL/model_selective_selector.py

# 指定输出目录
python MODEL/model_selective_selector.py --output-dir MODEL/outputs_selective_selector

# 只使用部分模型
python MODEL/model_selective_selector.py --models ridge,extra_trees,random_forest

# 调整最少样本数、交叉验证折数、测试集比例和随机种子
python MODEL/model_selective_selector.py --min-samples 30 --max-cv-folds 3 --test-size 0.2 --random-state 42
```

## 输出文件说明

模型训练输出目录结构如下：

```text
MODEL/outputs_selective_selector/
├── metrics_all.csv
├── metrics_<variant>.csv
├── models/
│   └── <variant>/
│       ├── bulk_density.joblib
│       ├── cold_modulus.joblib
│       ├── crushing_strength.joblib
│       └── linear_change.joblib
├── predictions/
│   └── <variant>/
│       └── <property>.csv
└── feature_importance/
    └── <variant>/
        └── <property>.csv
```

### `metrics_<variant>.csv`

每个数据变体一份指标表。主要列包括：

- `variant`：数据变体名称。
- `property`：性能属性。
- `status`：`trained` 表示该行模型是当前属性的最佳模型，`candidate` 表示候选模型。
- `best_model`：当前属性选出的最佳模型名称。
- `n_observations`：展开成长表后的有效标签数量。
- `n_recipes`：涉及的配方数量。
- `n_conditions`：涉及的工况数量。
- `condition_counts`：各工况样本数量。
- `n_input_features`：输入特征数量。
- `n_model_features`：模型实际使用特征数量。
- `cv_rmse_mean` / `cv_rmse_std`：交叉验证 RMSE 均值和标准差。
- `cv_mae_mean`：交叉验证 MAE。
- `cv_r2_mean`：交叉验证 R2。
- `test_rmse` / `test_mae` / `test_r2`：独立测试集指标。

当前 `MODEL/outputs_selective_selector/metrics_all.csv` 规模为 168 行、19 列。

### `models/<variant>/<property>.joblib`

每个模型文件保存一个字典，包含：

- `version`
- `variant`
- `property`
- `input_feature_columns`
- `model_feature_columns`
- `feature_columns`
- `model_name`
- `model`

加载示例：

```python
import joblib

bundle = joblib.load("MODEL/outputs_selective_selector/models/base/cold_modulus.joblib")
model = bundle["model"]
feature_columns = bundle["input_feature_columns"]
```

### `predictions/<variant>/<property>.csv`

保存测试集预测结果，主要列包括：

- `recipe_id`
- `property`
- `target_column`
- `condition`
- `y_true`
- `y_pred`
- `residual`
- `recipe_group`

### `feature_importance/<variant>/<property>.csv`

保存最多前 80 个重要特征。对于树模型，优先使用模型内置的 `feature_importances_`；其他模型使用测试集上的 permutation importance。

## 基础版训练脚本

`MODEL/model.py` 是较早的基础版训练脚本，默认输出到：

```text
MODEL/outputs/
```

它和 `model_selective_selector.py` 的整体训练流程类似，但没有 stacking 模型，也没有按属性启用的特征选择逻辑。一般建议优先使用 `model_selective_selector.py`。

## 复现实验建议

从零复现当前流水线时，建议按以下顺序执行：

```bash
python processed/preprocess_dataset.py
python processed/fill_dataset.py
python processed/split_dataset_by_source.py
python FEATURE/build_features.py
python MODEL/model_selective_selector.py
```

如果只想重新训练模型，并且 `FEATURE/outputs/` 已经存在，可以只运行：

```bash
python MODEL/model_selective_selector.py
```

如果只想基于清洗后数据重新生成特征，可以运行：

```bash
python FEATURE/build_features.py --dataset processed
```

## 注意事项

- 当前项目没有 `requirements.txt`，依赖需要手动安装。
- 当前目录不是 Git 仓库，无法通过 Git 追踪数据和模型输出版本。
- `.npy` 数据文件和 `.joblib` 模型文件体积较大，建议在正式版本管理时考虑加入 `.gitignore` 或使用外部数据/模型存储。
- 训练脚本使用 `recipe_id` 做 group split，这是为了降低同一配方在训练集和测试集之间泄漏的风险。
- 指标表中的 `test_r2` 可能受随机划分、异常标签和样本分布影响较大；建议主要结合 `cv_rmse_mean`、`cv_mae_mean` 和测试集残差一起判断模型质量。
- `FEATURE/build_features.py` 中 `--merge-target-conditions` 可以合并类似工况，但当前已有 `FEATURE/outputs/` 是按未合并工况生成的。
- enterprise_input_template.json为企业录入json规范格式
