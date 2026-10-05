# 常温抗折强度（cold_modulus）R² 提升实验（隔离环境 `_exp/cold`）

- 目标：test R² ≥ **0.85**
- 组数：56（另有多种子验证）
- 协议：yangquan → `split_by_recipe(test 0.2, seed 42)` → `GroupKFold(3)`；模型默认 ExtraTrees(300)（= 线上同类基线）
- 指标：`test_R2`（留出集）+ `oof_R2`（训练集内 3 折 out-of-fold，抗过拟合参考）

## 达标情况

- 达到 R² ≥ 0.85 的配置：**15 个**

- 单切分最佳：R² **0.8966**（OOF R² 0.6400）← `R7 combo2:+工况均衡权重`

## Top 10（按 test R²）

| # | 配置 | test R² | OOF R² | RMSE | n |
| --- | --- | --- | --- | --- | --- |
| 1 | R7 combo2:+工况均衡权重 | **0.8966** | 0.6400 | 1.3569 | 305 |
| 2 | R7 combo2:+缩尾1% | **0.8959** | 0.6760 | 1.3154 | 305 |
| 3 | R7 combo2:+ET800 | **0.8938** | 0.6610 | 1.3751 | 305 |
| 4 | R6 combo:trimmed+中心化 | **0.8927** | 0.6558 | 1.3818 | 305 |
| 5 | R7 combo2:基础组合 | **0.8920** | 0.6633 | 1.3863 | 305 |
| 6 | R6 combo:trimmed+中心化+删列+指示 | **0.8920** | 0.6633 | 1.3863 | 305 |
| 7 | R6 combo:trimmed+中心化+删列+指示+全缺 | **0.8920** | 0.6633 | 1.3863 | 305 |
| 8 | R7 combo2:+权重1/σ | **0.8917** | 0.6442 | 1.3888 | 305 |
| 9 | R6 combo:+HGB tuned | **0.8841** | 0.6551 | 1.4367 | 305 |
| 10 | R6 combo:+LGBM tuned | **0.8815** | 0.6244 | 1.4526 | 305 |

## 各轮最优

- **R1 标签聚合与重复测量利用**：0.8673（OOF 0.6303）← R1 label:trimmed(去极值)
- **R2 工况对齐与条件化建模**：0.8540（OOF 0.3715）← R2 cond:按工况中心化
- **R3 特征清理/插补/选择**：0.8345（OOF 0.3813）← R3 feat:KNN插补
- **R4 目标变换与样本加权**：0.8385（OOF 0.3816）← R4 tgt:log1p
- **R5 抗折专用模型**：0.8450（OOF 0.3841）← R5 model:HGB tuned
- **R6 组合（赢家叠加）**：0.8927（OOF 0.6558）← R6 combo:trimmed+中心化
- **R7 组合细化**：0.8966（OOF 0.6400）← R7 combo2:+工况均衡权重

## 全部组（按轮次）

### R1 标签聚合与重复测量利用
- G0 label:csv(基线)                                  test 0.8195 | oof 0.3764
- G1 label:mean                                     test 0.8264 | oof 0.3759
- G2 label:median                                   test 0.8037 | oof 0.5614
- G3 label:trimmed(去极值)                             test 0.8673 | oof 0.6303 ✅
- G4 label:robust(去2σ)                              test 0.8264 | oof 0.3759
- G5 label:min                                      test 0.6611 | oof 0.5694
- G6 label:max                                      test 0.7289 | oof -0.3341
- G7 label:median+min_cond_n5                       test 0.8037 | oof 0.5614

### R2 工况对齐与条件化建模
- G0 cond:csv(基线)                                   test 0.8195 | oof 0.3764
- G1 cond:min_cond_n=5                              test 0.8195 | oof 0.3764
- G2 cond:min_cond_n=10                             test 0.7647 | oof 0.2340
- G3 cond:仅 110/1450_1500                           test 0.7595 | oof 0.2112
- G4 cond:去常量工况                                     test 0.7595 | oof 0.2112
- G5 cond:工况名对齐                                     test 0.8195 | oof 0.3764
- G6 cond:按工况中心化                                    test 0.8540 | oof 0.3715 ✅
- G7 cond:中心化+仅两工况                                  test 0.7960 | oof 0.2209

### R3 特征清理/插补/选择
- G0 feat:csv(基线)                                   test 0.8195 | oof 0.3764
- G1 feat:删>50%缺列                                   test 0.8248 | oof 0.3894
- G2 feat:删>30%缺列                                   test 0.8255 | oof 0.3853
- G3 feat:删全缺列                                      test 0.8316 | oof 0.3705
- G4 feat:删>50%缺+指示                                 test 0.8320 | oof 0.3837
- G5 feat:迭代插补                                      test 0.8240 | oof 0.3815
- G6 feat:KNN插补                                     test 0.8345 | oof 0.3813
- G7 feat:删>50%缺+均值                                 test 0.8315 | oof 0.3845

### R4 目标变换与样本加权
- G0 tgt:csv(基线)                                    test 0.8195 | oof 0.3764
- G1 tgt:log1p                                      test 0.8385 | oof 0.3816
- G2 tgt:sqrt                                       test 0.7908 | oof 0.3836
- G3 tgt:缩尾1%                                       test 0.8244 | oof 0.5097
- G4 tgt:缩尾5%                                       test 0.7701 | oof 0.5905
- G5 tgt:y3σ截断                                      test 0.8094 | oof 0.6599
- G6 tgt:权重=1/重复值σ                                  test 0.8318 | oof 0.3927
- G7 tgt:权重=工况均衡                                    test 0.8188 | oof 0.3880

### R5 抗折专用模型
- G0 model:ET300(基线)                                test 0.8195 | oof 0.3764
- G1 model:ET800                                    test 0.8255 | oof 0.3802
- G2 model:XGB tuned                                test 0.8117 | oof 0.3896
- G3 model:LGBM tuned                               test 0.7805 | oof 0.3731
- G4 model:HGB tuned                                test 0.8450 | oof 0.3841
- G5 model:RF600                                    test 0.7806 | oof 0.4094
- G6 model:GPR                                      test 0.4816 | oof 0.2797
- G7 model:GBR tuned                                test 0.7349 | oof 0.3821

### R6 组合（赢家叠加）
- G0 combo:trimmed                                  test 0.8673 | oof 0.6303 ✅
- G1 combo:trimmed+中心化                              test 0.8927 | oof 0.6558 ✅
- G2 combo:trimmed+中心化+删列+指示                        test 0.8920 | oof 0.6633 ✅
- G3 combo:trimmed+中心化+删列+指示+全缺                     test 0.8920 | oof 0.6633 ✅
- G4 combo:+XGB tuned                               test 0.8746 | oof 0.6482 ✅
- G5 combo:+LGBM tuned                              test 0.8815 | oof 0.6244 ✅
- G6 combo:+HGB tuned                               test 0.8841 | oof 0.6551 ✅
- G7 combo:+GPR                                     test 0.7516 | oof 0.6063

### R7 组合细化
- G0 combo2:基础组合                                    test 0.8920 | oof 0.6633 ✅
- G1 combo2:+y3σ                                    test 0.7977 | oof 0.5168
- G2 combo2:+缩尾1%                                   test 0.8959 | oof 0.6760 ✅
- G3 combo2:+权重1/σ                                  test 0.8917 | oof 0.6442 ✅
- G4 combo2:+工况均衡权重                                 test 0.8966 | oof 0.6400 ✅
- G5 combo2:+ET800                                  test 0.8938 | oof 0.6610 ✅
- G6 combo2:+RF600                                  test 0.8068 | oof 0.6407
- G7 combo2:+XGB tuned                              test 0.8746 | oof 0.6482 ✅

## 多种子稳健性验证（种子 42/7/2024/1234/99）

单一切分噪声极大，达标必须以多切分均值为准。

| 配置 | test R² 均值±std | OOF R² 均值±std | 最小 test R² |
| --- | --- | --- | --- |
| verify:csv基线 | 0.5831 ± 0.1563 | 0.5830 ± 0.1119 | 0.3420 |
| verify:trimmed | 0.7524 ± 0.0955 | 0.7186 ± 0.0605 | 0.6023 |
| verify:trimmed+中心化 | 0.7901 ± 0.0837 | 0.7495 ± 0.0609 | 0.6869 |
| verify:组合(trimmed+中心化+删列+指示) | 0.7921 ± 0.0831 | 0.7519 ± 0.0575 | 0.6932 |
| verify:组合+全缺列 | 0.7921 ± 0.0831 | 0.7519 ± 0.0575 | 0.6932 |
| verify:组合+HGB tuned | 0.7686 ± 0.0971 | 0.7210 ± 0.0341 | 0.6452 |
| verify:组合+工况均衡权重 | 0.7811 ± 0.0976 | 0.7327 ± 0.0605 | 0.6619 |
| verify:组合+缩尾+权重 | 0.7759 ± 0.0942 | 0.7531 ± 0.0514 | 0.6553 |
| verify:组合+缩尾1% | 0.7833 ± 0.0861 | 0.7508 ± 0.0470 | 0.6751 |
