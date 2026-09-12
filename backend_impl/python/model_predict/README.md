# model_predict — 预测模型服务（example 推理内嵌）

本目录是 `example` 项目推理服务的**内嵌副本**，为 `backend_impl` 提供**统一的预测模型后端**。
对外 API 与数据格式 **完全对齐 example**（`/api/v1/...`），以后**只替换模型文件即可，API 不变**。

## 架构
```
backend_impl/python/model_predict/        # 本服务（镜像 example 目录结构）
  ├── API/app.py                          # FastAPI 推理服务（API 契约）
  ├── API/{model_contract.json,openapi.yaml,INTERFACE.md,*.json}   # 契约与示例
  ├── FEATURE/build_features.py           # 特征工程（推理依赖）
  ├── MODEL/model_property_more.py        # model_utils（特征/工况拼接）
  ├── FEATURE/outputs/metadata_<variant>.json    # 元数据（**模型资产，未入库**）
  └── MODEL/outputs/models/<variant>/*.joblib    # 模型（**模型资产，未入库**）
        │  uvicorn（hub 服务 `modelapi`，:8100）
        ▼
backend_impl(Node :3001)  ──反向代理 /api/v1/*──▶  model_predict 服务
```
- 3001 的 `src/routes/predictProxy.js` 将 `/api/v1/*` 透明转发到 `PREDICT_BASE_URL`（默认 `http://127.0.0.1:8100`）。

## API（与 example 一致，永久稳定）
- `GET  /health`
- `GET  /api/v1/model/metadata?variant=minmax`
- `POST /api/v1/predict`（包 `sample`）
- `POST /api/v1/predict/simple`（最简：`X_comp` / `X_global` / `conditions` / `properties`）
- `POST /api/v1/predict/batch`

数据格式：一条 `yangquan.npy['samples']` 样本。
- `X_comp`：二维数组，列顺序 = `component_feature_names`（51 列，含 `material_id`、`ratio_pct`、`particle_size_min/max`、`base`、`PC1..PC20`、氧化物、…、`reserved_feature_1..4`）。允许短行（≥2 列 `material_id+ratio_pct`），服务端自动补 `None` 展开。
- `X_global`：`[water_amount, hardening_time, hardening_time_uncertainty]`（或按名对象）。
- `conditions`：如 `["110℃","1500℃"]`；不传=按属性全部已训练工况（bulk_density/…：110/1100/1300/1500℃）。
- `properties`：如 `["bulk_density","cold_modulus","crushing_strength","linear_change"]`；不传=全部。
- 响应：`{request_id, recipe_id, variant, predictions:[{property, property_name_zh, condition, value, unit, model, input_feature_count}], warnings}`。

## 物料名称映射（material_id → 名称）
- 端点：`GET /api/v1/model/materials` → `{materials:[{material_id,name,samples}]}`（由数据集 `base` 列生成）。
- 生成：`python3 backend_impl/python/model_predict/scripts/build_material_map.py <yangquan.npy>` → 写入 `FEATURE/outputs/material_map.json`（**派生资产，未入库**，同模型资产一起放置）。
- 用途：前端「性能预测」的组分 `material_id` 以「名称 (id)」下拉展示（如 `棕刚玉 (61)`）；映射缺失时回退为数字输入。

## 模型资产（未入库 — 需放置）
`.gitignore` 忽略：
```
backend_impl/python/model_predict/.venv
backend_impl/python/model_predict/MODEL/outputs/
backend_impl/python/model_predict/FEATURE/outputs/
```
首次使用需把 example 的模型资产放到对应位置：
- `MODEL/outputs/models/minmax/{bulk_density,cold_modulus,crushing_strength,linear_change}.joblib`
- `FEATURE/outputs/metadata_minmax.json`

## 运行
```bash
# 依赖（独立 venv，避免污染全局）
python3 -m venv backend_impl/python/model_predict/.venv
backend_impl/python/model_predict/.venv/bin/pip install -r backend_impl/python/model_predict/API/requirements.txt

# 起服务（或交给 hub：服务名 modelapi）
cd backend_impl/python/model_predict
.venv/bin/uvicorn API.app:app --host 127.0.0.1 --port 8100
```
- 3001 侧：`backend_impl/.env` 设 `PREDICT_BASE_URL=http://127.0.0.1:8100`。

### pip 安装注意
本机直连 PyPI 会被代理 TLS 干扰（SSL EOF）。若失败改用：
```
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -i https://pypi.org/simple -r API/requirements.txt
```

## 换模型（API 不变）
1. 用新数据重训 → 覆盖 `MODEL/outputs/models/<variant>/*.joblib` 与 `FEATURE/outputs/metadata_<variant>.json`。
2. 重启 `modelapi`（hub: `restart modelapi`）。
3. `/api/v1/*` 契约与调用方**无需任何改动**。

## 兼容性
- `API/app.py` 内置 **sklearn 兼容补丁**（`_install_sklearn_compat`）：旧版 sklearn 训练的 pickle 在新版下缺 `SimpleImputer._fill_dtype`，类级兜底使其可推理。
- example 训练环境为 cp39；本机 venv 为 py3.11（xgboost 3.x/sklearn 新版），实测推理可用。

## 与旧路径的关系
- 旧的 `/api/model1/*`（recipe_opt 96 原料模型）**暂时保留**；新的规范预测 API 为 `/api/v1/*`。
- 前端若要接入新模型，按其契约提交 `X_comp/X_global/conditions/properties`。
