# 原料词表端到端审计（material vocabulary audit）

> 结论先行：**不是"某一张词表没建完"，而是"跨层对应关系从未作为数据资产落库"。**
> 系统里并存 **6 层原料/材料词表**，其中 2 层自洽可用、2 层是半成品孤儿产物、2 层根本不存在。

审计时间：2026-10-06（只读审计，未改动任何数据；证据均为文件/DB/接口实读值）。

## 一、词表层清单（含证据）

| 层 | 载体（证据） | 规模 | 来源 / 时间 | 运行时是否使用 |
| --- | --- | ---: | --- | --- |
| **L1 业务录入** | SQLite `mc_material.component_list`（名称 + `MP_xxxxxx` 引用） | 3 条配方 | 手工录入 2026-09-11 | 是（业务表） |
| **L2 业务原料主表** | SQLite `raw_material` —— **表不存在**；`mp_properties` 仅 3 行物性 | **0** | — | `recipeParserController` 查询它（异常被 catch 吞掉）→ 解析拿不到原料 |
| **L3 ML base（预测模型）** | `model_predict/FEATURE/outputs/material_map.json`；SQLite `material_base`(89) / `material_vocab`(427) / `ml_formula_component`(12522 行，含 `material_id` + `base`) | **89** | `datasetv2.npy`（羊泉 141 / 淄博 457 / 183批次 182） | 是（预测接口、注册表、成分约束） |
| **L4 归并对应表** | `_code/output/material_name_mapping_20260728.json`：`mapping` 121 条 = 原始名 → 统一名，`unified_names` 71 | 121（**63 个值为 null**） | 2026-07-28 | **否 —— 无任何运行时引用（孤儿产物）** |
| **L5 优化器原料（model2）** | `_code/output/map_merged.json`：`material_map` 96 名 + `property_map` 19 属性；数据 `dataset_merged.npy` = `X(183, 96, 3)` | **96** | `batch1-No1.txt…` 即 183 批次；2026-05/07 | 是（`recipe_opt_bridge.py` MAP_PATH、`recipe_predict_bridge.py`） |
| **L6 材料知识表** | `_code/output/material_mapping_20260728.json`：每条 = `{formula, elements, category, particle_size[min,max], text_prompt}` | 197（粒径 197、化学式 134） | 2026-07-28 | **否 —— 孤儿产物** |
| **L7 属性词表** | `map.json` 31 属性 → `map_merged.json` 19 属性；预测侧 4 属性 × 工况（15 个 target 列）；`ml_dataset_meta.y_feature_keys` 4 键 | 31 / 19 / 15 / 4 | — | 各自使用，互不对应 |

补充证据：`_code/output/` 下共有 **20 份** map/mapping 产物（`map.json`、`map_20260723/0725/0727_MT(+v2)/0727_unified`、
`map_726_*`（T/hybrid/hybrid_v4/v2/v3/v5_enhanced/enriched）、`map_batch183/yangquan/zibo_20260728`、
`map_merged`、`material_mapping`、`material_name_mapping`、`mapping_audit`），运行时只固定读 `map_merged.json`。

## 二、断点（按数据流顺序，8 条）

| # | 断点 | 证据 |
| --- | --- | --- |
| **B1** | 业务原料主表 `raw_material` **缺表** | `recipeParserController.js` 查询 `SELECT * FROM raw_material WHERE is_delete=0` → 异常被 catch（`materials = []`）；DB 24 张表里无该表；`mc_material` 的 `MP_000001..MP_000003` 无对应主表 → **悬空引用** |
| **B2** | 业务名 → base 只有 **2 条手工别名规则** | `material_base_rule`：`高铝铝土→BASE_000010`、`碳化硅→BASE_000018`，恰好就是 `mc_material` 里出现的两个名字 → 补丁式而非建设 |
| **B3** | 归并表只完成一半且**未接入** | `material_name_mapping_20260728.stats` = `{old_count:96, new_count:121, unified_count:71, exact_match_count:41, substring_match_count:17, unmapped_count:63}`；`mapping` 中 **63/121 为 null**；grep 全仓：除 `map_merged.json` 外无人引用这些产物 |
| **B4** | **粒度错配**（三套粒度无桥） | L5 名称把牌号/厂家/粒级编进名字（`97黑碳化硅粉（东祥97）`、`90黑碳化硅0-1mm（铁沟组专用）`、`98黑碳化硅粉200目（铁沟组专用）`、`VICAL71水泥`）；L6 是"品类×粒级"197 条；L3 是"品类"89 条 |
| **B5** | **非原料项混入原料词表** | L5 的 96 名里含 `加水量`、`加胶量`（工艺参数），而预测侧它们是 `X_global`（`water_amount/hardening_time`）→ 同名不同义 |
| **B6** | 按来源建词表的产物是**空文件** | `map_batch183_20260728.json` / `map_yangquan_20260728.json` / `map_zibo_20260728.json` 的 `material_count = 0` |
| **B7** | 属性轴无对应 | L5 19 属性（由 31 归并）↔ 预测 4 属性×工况 15 列 ↔ `ml_dataset_meta.y_feature_keys` 4 键；无映射表 |
| **B8** | **粒径表示三套并存** | 模型侧 `particle_size_min/max`（`metadata_yangquan.json`）；入库副本 `particle_size_mean/std`（`ml_dataset_meta.comp_feature_names`）；知识表 `particle_size:[min,max]`（197 条全有） |
| **B9** | 版本泛滥无权威 | 20 份 map 产物并存；`map.json` 31 属性 vs `map_merged.json` 19 属性；`mapping_audit_20260728.json` 里 batch183/zibo/yangquan 三段**内容完全相同**（`total:197`、同一 `by_category`）→ 该审计本身失真 |

## 三、关键澄清（纠正一个直觉误判）

L5（96）与 L3（89）**同源**，但不是"同一批数据的两种命名"：

- L5 的数据是 `dataset_merged.npy` = **183 批次单来源**（`batch1-No1.txt…`），`X(183, 96, 3)`；
- L3 的数据是 `datasetv2.npy` = **三来源合并**（183 批次 182 + 淄博 457 + 羊泉 141），材料收敛为 **89 个 base 品类**。
- 两者在 batch183 的 **60 个 base** 上只重叠 **40 个**：编码类名字（`101E/600R/80L-A2/90矾土/92硅灰`…）对得上；
  品类名（`棕刚玉`、`高铝`、`金属硅`、`氮化硅`、`磨料`、`Al2O3`、`CA71水泥`…）在 L5 里没有对应条目，
  而 L5 里的 `一级YGB粉`、`97黑碳化硅粉（自家）` 等原始条目在 L3 里也没有对应 base。
- 也就是说：**"原始条目 → base 品类"这次归并发生在 ML 交接/整理阶段，但归并关系没有随之交付**（只交付了归并后的结果）。

## 四、修复建议（按性价比排序）

1. **把 L4/L6 接进运行时**（成本最低、收益立刻）：
   - L4 提供 `原始名 → 统一名`（含 63 条 null 需补），L6 提供 `category/formula/particle_size/text_prompt`；
   - 用它替换当前"启发式归一化"（现为 52 唯一 / 6 多候选 / 31 无对应），预计可把 base↔优化器覆盖提升到 60+；
   - 同时用 L6 的 `particle_size` 补齐"原料级粒径"，缓解 B8。
2. **建 L2 业务原料主表**（`raw_material` 或改名对齐），把 `mc_material.component_list` 的 `MP_xxxxxx` 落成真实引用；
   把 B2 的 2 条 alias 扩成"业务名 → base"全量映射（可先由 L4/L6 自动生成候选，人工确认）。
3. **清洗 L5**：剔除 `加水量/加胶量`（属 `X_global`），并把名称规范到"品类（+可选粒级）"，与 L3 对齐。
4. **全量可约束**需要把 L3 中缺失的原料并入优化器搜索空间并**重训代理模型**（数据/模型侧工作，非前端可解）。
5. **收敛版本**：20 份产物标注权威/废弃，只保留 `map_merged.json` + 一份 mapping；修正 `mapping_audit` 的三来源雷同问题。
6. **统一属性与粒径轴**：把 `ml_dataset_meta` 的 `particle_size_mean/std` 与模型侧 `particle_size_min/max` 对齐（或明确两者各自的用途并落文档）。

## 五、复现命令（只读）

```bash
# 词表层
python3 -c "import json;d=json.load(open('backend_impl/python/model_predict/FEATURE/outputs/material_map.json'));print(len(d['materials']))"
python3 -c "import json;d=json.load(open('_code/output/map_merged.json'));print(d['material_count'], d['property_count'])"
python3 -c "import json;d=json.load(open('_code/output/material_name_mapping_20260728.json'));print(d['stats'])"
python3 -c "import json;d=json.load(open('_code/output/material_mapping_20260728.json'));print(len(d))"
# DB 侧
python3 -c "import sqlite3;c=sqlite3.connect('backend_impl/data/sqlite/database.db');print([ (t[0], c.execute('SELECT COUNT(*) FROM \"%s\"'%t[0]).fetchone()[0]) for t in c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\")])"
# 覆盖对照
python3 -c "import json;b={m['name'] for m in json.load(open('backend_impl/python/model_predict/FEATURE/outputs/material_map.json'))['materials']};o=json.load(open('_code/output/map_merged.json'))['metadata']['material_names'];print('交集', len(b&set(o)), '/ base', len(b), '/ 优化器', len(o))"
```
