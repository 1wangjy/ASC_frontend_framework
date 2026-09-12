# 耐火材料性能预测模型接口文档

版本：1.0.0  
日期：2026-09-11  
模型数据源：`yangquan.npy`  
服务封装：特征工程 + 模型预测

## 1. 接入方式

前端平台按 `yangquan.npy` 中 `samples[]` 的数据格式提交一条样本，接口内部完成：

- `X_comp` / `X_global` 解析。
- 与训练阶段一致的特征工程。
- 工况特征展开。
- 按属性加载对应 `joblib` 模型。
- 返回预测结果。

前端不需要生成 `features_minmax.csv`，也不需要直接调用或加载 `joblib`。

如果前端只想要最简调用，可以直接使用：

```http
POST /api/v1/predict/simple
```

请求体只需要：

```json
{
  "X_comp": [
    [61, 70],
    [42, 30]
  ],
  "X_global": [3.6, 10, 0],
  "conditions": ["110℃", "1500℃"],
  "properties": ["bulk_density"]
}
```

其中真正的数据输入只有 `X_comp` 和 `X_global`；`conditions` 和 `properties` 是告诉后端要预测哪些结果。

新增文件：

- `API/app.py`：FastAPI 推理服务。
- `API/openapi.yaml`：OpenAPI 接口规范。
- `API/model_contract.json`：机器可读模型契约。
- `API/request_example.json`：按 `npy samples[]` 格式编写的请求示例。
- `API/simple_request_example.json`：前端最简请求示例。
- `API/response_example.json`：响应示例。
- `API/requirements.txt`：接口服务依赖。

## 1.1 两个特征工程脚本的关系

项目里有两个相关脚本：

| 文件 | 作用 | 预测接口是否直接依赖 |
| --- | --- | --- |
| `FEATURE/build_features.py` | 基础特征工程，负责把 `X_comp` / `X_global` 转成模型输入特征。 | 是 |
| `FEATURE/build_features_v1_merge_y_more_models.py` | 训练数据构建脚本，复用 `build_features.py`，额外处理 `y_labels` 的工况合并和目标列生成。 | 否 |

预测接口只需要输入样本做特征工程，不使用 `y_labels`，所以直接依赖的是 `FEATURE/build_features.py`。但如果交付包还希望支持重新生成 `FEATURE/outputs/*.csv` 或重新训练模型，建议两个脚本都一起给。

## 2. 启动服务

在项目根目录执行：

```powershell
pip install -r API/requirements.txt
uvicorn API.app:app --host 0.0.0.0 --port 8000
```

访问：

- `GET http://localhost:8000/health`
- `GET http://localhost:8000/docs`

## 2.1 Swagger 页面怎么用

打开 `http://127.0.0.1:8000/docs` 后，会看到多个自动生成的接口按钮。前端日常联调只需要使用：

```text
POST /api/v1/predict/simple
```

各按钮作用如下：

| Swagger 按钮 | 作用 | 前端是否常用 |
| --- | --- | --- |
| `GET /health` | 检查接口服务是否启动成功。 | 偶尔用 |
| `GET /api/v1/model/metadata` | 查看模型支持的字段、属性、工况和指标。 | 开发初始化时用 |
| `POST /api/v1/predict` | 标准预测接口，请求体需要包一层 `sample`。 | 不推荐前端直接用 |
| `POST /api/v1/predict/simple` | 前端最简预测接口，只传 `X_comp`、`X_global`、`conditions`、`properties`。 | 推荐使用 |
| `POST /api/v1/predict/batch` | 批量预测接口，一次提交多个样本。 | 批量场景用 |

页面底部的 `Schemas` 是数据结构说明，不是接口按钮，普通测试时不用点。

测试步骤：

1. 展开 `POST /api/v1/predict/simple`。
2. 点击 `Try it out`。
3. 粘贴最简请求体。
4. 点击 `Execute`。
5. 在 `Response body` 中查看预测结果。

最简请求体：

```json
{
  "X_comp": [
    [61, 70],
    [42, 30]
  ],
  "X_global": [3.6, 10, 0],
  "conditions": ["110℃", "1500℃"],
  "properties": ["bulk_density"]
}
```

可选环境变量：

| 变量名 | 示例 | 说明 |
| --- | --- | --- |
| `MODEL_API_KEY` | `your-secret-key` | 设置后，除 `/health` 外都要带 `X-API-Key`。 |
| `MODEL_API_CORS_ORIGINS` | `http://localhost:3000` | 前端跨域白名单。默认 `*`。 |

## 3. npy 样本格式

`yangquan.npy` 顶层结构为：

```json
{
  "metadata": {},
  "samples": [],
  "total_samples_all": 141
}
```

预测接口接收的是 `samples[]` 中的一条样本，JSON 字段如下：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `recipe_id` | 否 | 配方编号，原样返回。 |
| `X_comp` | 是 | 组分二维数组，列顺序必须按 `component_feature_names`。 |
| `X_global` | 否 | 全局工艺参数，一维数组，顺序按 `global_feature_names`。 |
| `y_labels` | 否 | 训练标签，预测时不使用，可不传。 |
| `remark` | 否 | 备注，预测时不使用。 |
| `dataset_source` | 否 | 数据来源，默认 `frontend`。 |

JSON 没有合法的 `NaN` 值，前端缺失值统一传 `null`。

## 4. X_comp 列顺序

`X_comp` 是位置敏感的二维数组。每一行表示一个配方组分，每一列的顺序如下：

| 序号 | 字段 |
| --- | --- |
| 0 | `material_id` |
| 1 | `ratio_pct` |
| 2 | `particle_size_min` |
| 3 | `particle_size_max` |
| 4 | `base` |
| 5-24 | `PC1` 到 `PC20` |
| 25 | `SiC` |
| 26 | `SiO2` |
| 27 | `AL2O3` |
| 28 | `Fe2O3` |
| 29 | `TiO2` |
| 30 | `CaO` |
| 31 | `MgO` |
| 32 | `K2O` |
| 33 | `Na2O` |
| 34 | `PH` |
| 35 | `loss_on_ignition` |
| 36 | `bulk_density` |
| 37 | `true_density` |
| 38 | `water_absorption` |
| 39 | `porosity` |
| 40 | `moisture` |
| 41 | `d50` |
| 42 | `ph` |
| 43 | `fired_bulk_density` |
| 44 | `fired_cold_modulus` |
| 45 | `fired_crushing_strength` |
| 46 | `fired_linear_change` |
| 47 | `reserved_feature_1` |
| 48 | `reserved_feature_2` |
| 49 | `reserved_feature_3` |
| 50 | `reserved_feature_4` |

`material_id` 和 `ratio_pct` 至少要有。接口会允许行长度短于 51，并用 `null` 补齐尾部字段；但正式联调建议每行都传 51 列，避免前端字段映射出错。

## 5. X_global 顺序

`X_global` 推荐传数组：

| 序号 | 字段 | 说明 |
| --- | --- | --- |
| 0 | `water_amount` | 加水量。 |
| 1 | `hardening_time` | 硬化时间。 |
| 2 | `hardening_time_uncertainty` | 硬化时间不确定度。 |

也支持对象写法：

```json
{
  "water_amount": 3.6,
  "hardening_time": 10,
  "hardening_time_uncertainty": 0
}
```

## 6. 模型输出能力

| 属性 key | 中文名 | 单位 | 模型实际输出工况 |
| --- | --- | --- | --- |
| `bulk_density` | 体积密度 | `g/cm3` | `110℃`, `1100℃`, `1300℃`, `1500℃` |
| `cold_modulus` | 常温抗折强度 | `MPa` | `110℃`, `1100℃`, `1300℃`, `1500℃` |
| `crushing_strength` | 常温耐压强度 | `MPa` | `110℃`, `1100℃`, `1300℃`, `1500℃` |
| `linear_change` | 线变化率 | `%` | `1100℃`, `1300℃`, `1500℃` |

如果 `conditions` 不传，接口会按每个属性的已训练工况全部预测。例如 `linear_change` 默认不会返回 `110℃`。

如果 `conditions` 指定了某个属性没有直接训练过的工况，接口仍会返回模型外推结果，并在 `warnings` 中提示 `UNTRAINED_CONDITION`。

## 7. 单条预测接口

`POST /api/v1/predict`

请求体：

```json
{
  "request_id": "web-20260911-0001",
  "sample": {
    "recipe_id": "frontend-demo-001",
    "dataset_source": "frontend",
    "X_comp": [
      [61, 10.0, 8.0, 15.0, "重质料", -3.16907, 1.18401],
      [42, 30.0, 0.045, 1.0, "细粉", 5.43185, 7.20677]
    ],
    "X_global": [3.6, 10.0, 0.0]
  },
  "conditions": ["110℃", "1500℃"],
  "properties": ["bulk_density", "cold_modulus"]
}
```

上面为了展示简短，只写了 `X_comp` 的前几列；完整示例见 `API/request_example.json`。

请求字段：

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `request_id` | 否 | string | 请求追踪 ID，原样返回。 |
| `sample` | 是 | object | 一条 `npy samples[]` 风格样本。 |
| `conditions` | 否 | array | 指定预测工况；不传则按属性返回全部已训练工况。 |
| `properties` | 否 | array | 指定预测属性；不传则预测全部属性。 |

响应体：

```json
{
  "request_id": "web-20260911-0001",
  "recipe_id": "frontend-demo-001",
  "variant": "minmax",
  "predictions": [
    {
      "property": "bulk_density",
      "property_name_zh": "体积密度",
      "condition": "110℃",
      "value": 2.91,
      "unit": "g/cm3",
      "model": {
        "variant": "minmax",
        "version": "V2_by_property",
        "name": "xgboost"
      },
      "input_feature_count": 281
    }
  ],
  "warnings": []
}
```

## 8. 前端最简预测接口

`POST /api/v1/predict/simple`

这个接口给前端联调用，去掉了 `sample` 外层包装，也不需要传 `recipe_id`、`dataset_source`、`variant`。

请求体：

```json
{
  "X_comp": [
    [61, 70],
    [42, 30]
  ],
  "X_global": [3.6, 10, 0],
  "conditions": ["110℃", "1500℃"],
  "properties": ["bulk_density"]
}
```

响应体与 `/api/v1/predict` 一样：

```json
{
  "request_id": null,
  "recipe_id": null,
  "variant": "minmax",
  "predictions": [],
  "warnings": []
}
```

## 9. 批量预测接口

`POST /api/v1/predict/batch`

请求体：

```json
{
  "request_id": "batch-0001",
  "items": [
    {
      "request_id": "item-0001",
      "sample": {
        "recipe_id": "R001",
        "X_comp": [
          [61, 100.0, 8.0, 15.0, "重质料"]
        ],
        "X_global": [3.6, 10.0, 0.0]
      },
      "properties": ["bulk_density"]
    }
  ]
}
```

## 10. 元数据接口

`GET /api/v1/model/metadata?variant=minmax`

用途：前端初始化字段映射、属性枚举、工况枚举和指标展示。

返回关键字段：

| 字段 | 说明 |
| --- | --- |
| `properties` | 属性 key、中文名、单位、已训练工况。 |
| `component_feature_names` | `X_comp` 的完整列顺序。 |
| `global_feature_names` | `X_global` 的完整列顺序。 |
| `target_condition_merge` | 训练时工况合并规则。 |
| `metrics` | 当前已选模型的指标摘要。 |

## 11. 错误码

| HTTP 状态 | code | 场景 |
| --- | --- | --- |
| 400 | `EMPTY_X_COMP` | `sample.X_comp` 为空。 |
| 400 | `INVALID_X_COMP_ROW` | 某个 `X_comp` 行少于 `material_id` 和 `ratio_pct` 两列。 |
| 400 | `EMPTY_CONDITIONS` | 传了 `conditions` 但为空数组。 |
| 401 | `UNAUTHORIZED` | `MODEL_API_KEY` 已启用但请求头错误。 |
| 404 | `VARIANT_NOT_FOUND` | 未找到指定模型版本元数据。 |
| 404 | `NO_MODELS` | 指定版本没有可用模型文件。 |
| 404 | `PROPERTY_NOT_FOUND` | 请求了不存在的属性模型。 |

## 12. 前端调用示例

```ts
export async function predictSimple(payload: {
  X_comp: unknown[][];
  X_global: unknown[];
  conditions?: string[];
  properties?: string[];
}) {
  const response = await fetch("http://localhost:8000/api/v1/predict/simple", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail?.message ?? "模型预测失败");
  }
  return data;
}
```

## 13. 联调注意事项

- `X_comp` 必须按列顺序传，不要把列名和值拆开后随意排序。
- 缺失值传 `null`，不要传 `NaN`。
- `y_labels` 预测时不需要传；即使传了也不会参与推理。
- 前端属性使用英文 key：`bulk_density`, `cold_modulus`, `crushing_strength`, `linear_change`。
- 预测值是模型输出，单位以后端返回的 `unit` 为准。
- 生产环境建议启用 `MODEL_API_KEY`，并设置明确的 CORS 域名。

## 14. 已知模型加载注意事项

现有模型文件中的自定义预处理类被 pickle 记录为 `__main__.TrainOnlyFeatureFilter`。`API/app.py` 已做兼容处理：

```python
sys.modules["__main__"].TrainOnlyFeatureFilter = model_utils.TrainOnlyFeatureFilter
```

后续重新训练时，建议把 `TrainOnlyFeatureFilter` 放到稳定模块里再训练，避免模型文件依赖脚本入口名。
