# 数据转化链贯通探索（独立环境）

**范围**：只读线上数据与代码；所有原型、测试、产物写在本目录，不修改线上服务与库。
**结论一句话**：`ML 数据集 → 配方解析 → 预测模型` 的转化链**不完备**，三处断点已定位并在本环境验证了修复方案。

## 一、现状诊断（证据）

### 断点 1：`/api/recipe-parser/parse` 必然失败——路径写错
- `backend_impl/src/controllers/recipeParserController.js:65,77` spawn `backend_impl/python/recipe_processor.py`。
- 该文件**不存在**（`backend_impl/python/` 只有 stl_generator.py、recipe_opt_bridge.py、recipe_predict_bridge.py、model_predict/、pdf_metadata/）。
- 真实实现在 `_code/python/recipe_processor.py`（469 行）与 `_code/python/parse_recipe.py`（366 行）。
- 证据：`tests/wiring_probe.py` → 当前路径 `ModuleNotFoundError: No module named 'recipe_processor'`；指向 `_code/python` 后 `success=True`、`embedding_shape=[4,385]`。

### 断点 2：粒径/规格解析缺失，且不进 X_comp
- 后端解析器把粒径放在属性块里：`{粒径:5-3mm}` → `properties.grid_size = "5-3mm"`（**原样字符串**）。
- 无单位归一化（目/mm/μm 混写）、无区间拆分（5-3mm 不拆 min/max）、无 D50/上下界、无级配多段。
- 前端 `useRecipeParser.js` 把 `[粒径: …]` 一律塞进泛用 `comp.properties`，不映射到任何模型列。
- X_comp 的 `particle_size_min/max` 是**真实模型特征**（`_ref/handover/ML/*.npy` 的 X_comp 第 3、4 列，实测取值 15/17 个离散档位），但：
  - 旧组装路径 `predictFormulaService.js:172` 只发 `[material_id, ratio_pct]` **两列**，模型侧补 null → 粒径永远丢；
  - 因此文本录入的配方，模型看不见粒度信息。

### 断点 3：base 名 → baseid 未贯通
- ML 的 `material_id` 就是 baseid：`material_map.json` 89 条 `{material_id, name}`，`base`（如 `棕刚玉`=61、`97黑碳化硅`=17）被 drop（`dropped_component_columns:['base']`）。
- 注册表 `data/material_base_map.json` 有 89 bases（`base_id`/`base_name`/`material_id`）+ 2 条 alias 规则，`materialBaseService.resolveMaterialBase` 实现了解析链（exact→alias→normalize→rule→decompose→suggestions）。
- 但**只在提交入库闸门**调用，解析 UI 阶段不查注册表；且 `SPEC_RE` 仅覆盖 `目|mm|厘米|um|µm|μm|mesh|MM`，无 cm/nm/D50/区间/上下界。
- 预测路径也不产出 baseid 列。

## 二、本环境新增（原型 + 测试）

| 文件 | 作用 |
| --- | --- |
| `lib/units.js` | 粒径单位归一化：目↔mm 标准筛表、μm/cm/nm、D50/D90、区间(5-3mm/3~1mm/3至5mm/12-8mm)、上下界(≤/-/以下/≥/以上)、级配多段；并**吸附到数据集实测档位**防量纲漂移 |
| `lib/parser.js` | 增强解析：行分类(`*` 测试行 / `[...]` 属性行 / 组分行)、规格与类别词剥离、base 解析(exact→alias→normalize→rule(5 种 kind, priority 升序)→containment→代号 `#61`/`代号61`)、配比归一化(`%` 直用 / `份` 按总和折算 / 诊断)、未匹配给 suggestions、歧义不猜测、**输出规范组分与 X_comp 行** |
| `bin/parse-cli.js` | stdin/stdout JSON 桥接，供 Python 端复用同一套解析逻辑 |
| `chain.py` | 端到端链测试：npy 真实样本 → 渲染多写法文本 → 解析 → 三种 X_comp 组装 → 真实推理 → 与 `y_labels` 真值比对 |
| `tests/units.test.js`、`tests/parser.test.js` | 20 条断言，全绿（`node --test`） |
| `tests/wiring_probe.py` | 断点 1 的证据与修复验证 |

## 三、关键实测结果

### 解析准确率（yangquan 20 样本 / 258 行，文本按 4 种粒径写法交替渲染）
| 指标 | 数值 |
| --- | --- |
| material_id（baseid）准确率 | **1.000** |
| 配比准确率 | **1.000** |
| particle_size_min / max 准确率 | **1.000 / 1.000** |
| 粒径召回（真值有粒径时被解析出） | **1.000**（丢失 0 行） |

### 端到端预测（RMSE，与样本 `y_labels` 真值比）
| 路径 | 体积密度 | 抗折 | 耐压 | 线变化 |
| --- | --- | --- | --- | --- |
| **D 原始 48 列（参照）** | 0.0187 | 0.1739 | 0.6910 | 0.0261 |
| **B 文本列 + 实测列** | 0.0187 | 0.1739 | 0.6910 | 0.0261 |
| A 仅文本可推导列（补 null） | 0.1729 (9.2×) | 1.9798 (11.4×) | 9.5843 (13.9×) | 0.1009 (3.9×) |
| C 旧链路 `[material_id, ratio]` | 0.1756 (9.4×) | 2.2856 (13.1×) | 10.7946 (15.6×) | 0.1055 (4.0×) |

- **B ≡ D（误差倍率 1.000，逐位一致）**：文本→X_comp 的转化对「文本能承载的信息」已**无损**（含粒径与 base 列）。
- **A 优于 C**：把粒径/base 列发过去，比旧的两列路径更准（各属性 3.9–13.9× vs 4.0–15.6×）。
- **真正的剩余缺口是「物料实测属性」**：PC1–20、化学(SiO2/Al2O3/…)、物性(d50/bulk_density/…) 无法从配方文本推导；缺它们精确率下降 3.9–13.9 倍。而物料库 schema（`material-base-schema.js`）**没有这些字段**，等于没有数据源。

## 四、迁移方案（待确认后执行）

1. **修接线**（1 行级）：控制器指向 `_code/python/recipe_processor.py`（或把该文件纳入 `backend_impl/python/`），让 `/api/recipe-parser/parse` 恢复可用；同时把其组分分隔符（`;`）与前端（换行/逗号）对齐。
2. **统一文法**：前端 `useRecipeParser.js` 与后端 Python 解析器合并为**一套**：前端只做输入收集与校验，解析统一走后端（消除两套正则与词表）。
3. **粒径贯通**：把 `lib/units.js` 的归一化逻辑移植进 Python 解析器，输出 `particle_size_min/max`（mm、吸附数据集档位），并让 `predictFormulaService` 组装 **48 列 X_comp**（而非 2 列）；保留旧 2 列兼容。
4. **baseid 贯通**：解析阶段即查注册表（复用 `resolveMaterialBase`），输出 `base_id/base(material_id)`，并在 `material_base` 增补 `spec/particle_size_*` 字段以支撑"按牌号+粒级"维护。
5. **补实测属性数据源**（收益最大）：为 89 个 base 建立实测属性表（PC/化学/物性），来源可以是 ML 数据集按 base 聚合（中位数）、或物料库录入；接入 X_comp 组装。
6. **契约与文档**：更新 `API/model_contract.json`（陈旧：51 列含 reserved_feature_1-4、缺 component_batch；运行时为 48 列）。

## 五、运行方式

```bash
# 单元测试（20 条）
cd _exp/chain && node --test tests/units.test.js tests/parser.test.js

# 接线探针（断点 1 证据）
backend_impl/python/model_predict/.venv/bin/python _exp/chain/tests/wiring_probe.py

# 端到端链测试（需要 modelapi:8100 在跑）
backend_impl/python/model_predict/.venv/bin/python _exp/chain/chain.py --variant yangquan --samples 20
```
