# ASC Frontend Framework

ASC 耐火材料智能研究平台前端项目，基于 Vue 3、Vite 和 Pinia 构建。

本仓库包含两部分代码：

- Vue 统一前端，开发端口为 `3005`
- Node.js 数据平台后端，目录为 `backend_impl/`，端口为 `3001`

知识图谱、模拟、报告和问答功能会调用外部 Python 后端 `5001`。该 Python 后端不属于本仓库，本项目不会用 3001 替代 5001。

## 系统边界

| 服务 | 默认端口 | 职责 | 是否包含在本仓库 |
|---|---:|---|---|
| Vue + Vite | 3005 | 统一页面、路由和开发代理 | 是 |
| Node.js | 3001 | 数据平台、登录、文献库、附件和模型接口 | 是，位于 `backend_impl/` |
| Python | 5001 | 知识图谱、模拟、报告和问答 | 否，需单独取得并启动 |
| MongoDB | 27017 | GridFS 文献附件存储 | 否，需本机安装 MongoDB Server |
| SQLite | 无独立端口 | 数据平台业务数据 | 是，运行时在 `backend_impl/data/sqlite/` 生成 |

> MongoDB Compass 只是管理工具，不是 MongoDB Server。使用文献 PDF 上传、预览和下载功能时，必须保证 MongoDB Server 正在监听 `27017`。

## 环境要求

- Node.js 18+
- npm
- MongoDB Server（文献附件功能需要）
- Python（仅 3001 的配方解析、PDF 元数据提取等可选能力需要）
- 外部 Python 5001 后端（知识图谱、模拟、报告和问答功能需要）

## 首次安装

### 1. 安装前端依赖

在仓库根目录执行：

```bash
npm install
```

### 2. 安装 3001 后端依赖

```bash
cd backend_impl
npm install
```

### 3. 配置 3001 环境变量

复制配置模板：

```powershell
Copy-Item .env.example .env
```

Linux/macOS：

```bash
cp .env.example .env
```

然后按本机环境修改 `backend_impl/.env`。不要把真实 `.env`、API Key、管理员信息或数据库文件提交到 Git。

最小开发配置示例：

```dotenv
PORT=3001
NODE_ENV=development
DB_TYPE=sqlite
MONGODB_URI=mongodb://127.0.0.1:27017/asc-platform
JWT_SECRET=请替换为随机且足够长的字符串
PYTHON_CMD=python
```

其余模型、LLM 和 PDF 元数据提取配置见 [`backend_impl/.env.example`](backend_impl/.env.example)。未配置可选服务时，对应能力可能不可用，但普通 SQLite CRUD 不应受影响。

## 本地启动

建议按照下面的顺序启动。

### 1. 启动 MongoDB Server

确认 MongoDB 正在监听：

```text
127.0.0.1:27017
```

如果暂时不使用 PDF 附件，可以先不启动 MongoDB；此时文献记录 CRUD 仍可使用，但附件接口会返回服务不可用。

### 2. 启动外部 Python 后端

知识图谱、模拟、报告和问答功能要求外部 Python 服务运行在：

```text
http://127.0.0.1:5001
```

Python 后端的安装、环境变量和启动方式由其独立项目负责，不在本 README 展开。

### 3. 启动 3001 数据平台后端

打开一个终端：

```bash
cd backend_impl
npm start
```

开发时需要自动重启可使用：

```bash
npm run dev
```

健康检查：

```text
http://127.0.0.1:3001/health
```

MongoDB/GridFS 检查：

```text
http://127.0.0.1:3001/api/attachment/test
```

### 4. 启动 3005 前端

回到仓库根目录，打开另一个终端：

```bash
npm run dev
```

访问：

```text
http://localhost:3005
```

Vite 使用 `strictPort`，如果 3005 已被占用，启动会直接失败。请先关闭重复进程，不要随意改成其他端口。

## API 分流

开发环境通过 `vite.config.js` 代理请求。

### 转发到 3001

- `/api/auth`
- `/api/new-data`
- `/api/admin`
- `/api/recipe-parser`
- `/api/attachment`
- `/api/user`
- `/api/embedding`
- `/api/llm`
- `/api/ext-field`
- `/api/model1`
- `/api/model2`
- `/api/model3`
- `/api/model4`
- `/api/ml-dataset`
- `/config`
- `/health`

### 转发到 5001

- 其他通用 `/api/*` 请求

代理规则的顺序不能随意调整：3001 的明确路径必须位于通用 `/api` 规则之前，否则数据平台请求会被错误发送到 5001。

Vite proxy 只在开发服务器中生效。部署 `npm run build` 生成的静态文件时，需要由 Nginx、网关或部署平台配置相同的 API 分流。

## 页面路由

| 路径 | 模块 | 说明 |
|---|---|---|
| `/` | 首页 | 图谱问答入口 |
| `/documents` | 兼容路由 | 跳转到数据平台文献库的构图选择模式 |
| `/process/:projectId?` | 知识图谱 | 图谱项目与构建流程 |
| `/simulation/:simulationId` | 知识图谱 | 模拟配置 |
| `/simulation/:simulationId/start` | 知识图谱 | 模拟运行与证据推理 |
| `/reports` | 报告 | 报告中心 |
| `/report/:reportId` | 报告 | 报告查看 |
| `/interaction/:reportId` | 问答 | 报告问答与证据评估 |
| `/platform/data` | 数据平台 | 原料、配方、物性、测试、工况、服役和文献库管理 |
| `/platform/models` | 模型入口 | 模型选择页面 |
| `/platform/model1` | AI 模型 | 性能预测 |
| `/platform/model2` | AI 模型 | 配方优化 |
| `/platform/model3` | AI 模型 | 服役预测 |
| `/platform/model4` | AI 模型 | 三维重建 |

## 项目结构

```text
frontend/
├── src/
│   ├── api/                         # 5001 知识图谱 API
│   ├── components/                  # 通用及工作流组件
│   ├── config/                      # 路由等前端配置
│   ├── features/                    # 图谱、问答、项目等业务逻辑
│   ├── layouts/                     # 全局 Shell 布局
│   ├── platform/
│   │   ├── api/                     # 3001 数据平台 API
│   │   ├── components/              # 数据表、文献和属性编辑组件
│   │   ├── composables/             # 数据平台组合逻辑
│   │   ├── services/                # 文献导入、构图桥接等服务
│   │   ├── stores/                  # 数据平台状态
│   │   ├── styles/                  # 数据平台样式
│   │   ├── types/                   # 实体类型说明
│   │   ├── utils/                   # 属性、文献等工具函数
│   │   └── views/                   # 数据平台和模型页面
│   ├── router/                      # Vue Router
│   ├── store/                       # 全局 Pinia Store
│   └── views/                       # 首页、图谱、模拟和报告页面
├── backend_impl/
│   ├── .env.example                 # 3001 环境变量模板
│   ├── package.json
│   ├── python/                      # 3001 调用的轻量 Python 工具
│   ├── src/
│   │   ├── config/                  # SQLite、MongoDB 和属性配置
│   │   ├── controllers/             # 请求控制器
│   │   ├── models/                  # 数据访问模型
│   │   ├── routes/                  # Express 路由
│   │   ├── services/                # CRUD、附件和元数据服务
│   │   └── index.js                 # 3001 入口
│   └── test/                        # 3001 聚焦测试
├── tests/                            # 前端测试
├── vite.config.js                   # 3005 与代理配置
└── package.json
```

## 数据存储

### SQLite

3001 的业务数据默认保存到：

```text
backend_impl/data/sqlite/database.db
```

主要包括用户、原料、配方、物性、测试、工况、服役和文献记录。该文件属于本地运行数据，不应作为源码直接提交。

### MongoDB / GridFS

文献附件存储在 MongoDB GridFS 中，SQLite 文献记录只保存附件对应的 filename。MongoDB 不可用时：

- 3001 服务不应因此崩溃
- SQLite 文献 CRUD 仍可使用
- PDF 上传、预览、下载等附件功能不可用

### 文献库批量导入与维护（backend_impl/scripts/）

文献库（`literature` + `lit_file`）按 `collection` 标记来源：`aug`(2026-08, 1000, 带附件) / `sep`(2026-09, 16312, 仅元数据) / `r3`(research papers 与知网 PDF, 383)。

- 生成 bib：`python3 backend_impl/scripts/build_resource3_bib.py`（扫描 PDF → `data/resource3.bib`；DOI 来源见文件头注释）
- 导入：`python3 backend_impl/scripts/import_bib.py data/resource3.bib --apply --collection r3 --roots <pdf 根目录,…>`
  —— 幂等键 `dedupe_key`（有 DOI 用 `doi:<doi>`，无 DOI 用 标题+作者+年份 的 sha1）；重复 DOI 只更新，不新增
- 元数据补齐：`python3 backend_impl/scripts/enrich_literature.py --collection r3 --apply --replace-implausible-titles`
  —— 有 DOI 走 Crossref（缓存 `data/crossref_cache.json`）；中文知网条目用「目录名即刊名」+「CNKI DOI 内嵌年份」
- 重复合并：`python3 backend_impl/scripts/repair_literature_dupes.py --only r3 --hard-delete --apply`
  —— 同 DOI/dedupe_key，或「标题相同且一方无 DOI / 标题可信」才合并；保留元数据最完整的行并迁移附件
  （注意：文献列表接口不过滤 `is_delete`，合并请用 `--hard-delete`）

## 认证与多用户账号

- 账号存储：SQLite `users` 表（`email` 唯一，`status` 取 `pending|approved|rejected|disabled`）；
  首次启动会补充账号字段并把内置 `admin` 置为 `approved`。
- 注册：`POST /api/auth/register`（邮箱必填）→ 新账号为 `pending`，需管理员在「用户管理」页审批后登录。
- 登录：`POST /api/auth/login`（用户名或邮箱 + 密码）。仅 `approved` 可登录，失败响应带 `error_code`：
  `PENDING_APPROVAL` / `REJECTED` / `DISABLED` / `BAD_PASSWORD`；连续失败 5 次锁定 15 分钟（`LOCKED` + `retry_after_minutes`）。
- 会话：JWT 存 `localStorage['asc_token']`，用户对象存 `localStorage['asc_user']`；
  axios 请求拦截器统一注入 `Authorization: Bearer <token>`（键名见 `src/config/authStorage.js`）。
  `GET /api/auth/me` 可随时校验会话——被禁用/拒绝/删除后立即失效（前端 `refreshSession` 会自动登出）。
- 用户管理（需管理员令牌；页面 `/platform/system/users`，仅管理员可见）：
  - `GET /api/user/users?status=&keyword=&page=&pageSize=`、`GET /api/user/users/stats`
  - `POST /api/user/users`、`PUT /api/user/users/:id`
  - `POST /api/user/users/:id/approve`、`POST /api/user/users/:id/reject`、`POST /api/user/users/:id/reset-password`、`DELETE /api/user/users/:id`
  - `POST /api/user/password/change`（自助改密，任意已登录用户）、`POST /api/user/generate-password`
- 自检：`node backend_impl/scripts/verify-user-management.js`（17 项端到端；已接入验收页 `multi-user` 检查项）。
- `NODE_ENV=development` 时不启用 API 限流，便于联调
- `NODE_ENV=production` 时启用 `/api/*` 限流
- 生产环境必须更换安全的 `JWT_SECRET`

## 可选外部能力

以下功能依赖额外配置，不属于基础 CRUD 的必要条件：

- 文献 PDF 元数据提取：`MISTRAL_API_KEY`
- LLM/Embedding：`LLM_API_URL`、`LLM_API_KEY`
- Model1：`LOCAL_MODEL1_URL`，默认指向 8000
- Model2：`LOCAL_MODEL2_URL`，默认指向 8001
- Model3：`LOCAL_MODEL3_URL`，默认指向 8002

没有配置对应服务时，应将相关功能视为不可用，不要使用 5001 端口或其他地址冒充 API Key/模型服务。

## 构建与验证

前端生产构建：

```bash
npm run build
```

3001 聚焦测试：

```bash
cd backend_impl
node --test test/*.test.js
```

交接前至少确认：

```text
3005 页面可以打开
3001 /health 返回成功
5001 /health 返回成功（需要图谱功能时）
27017 正在监听（需要附件功能时）
文献 CRUD 正常
PDF 上传/预览正常
原料、配方、物性和测试 CRUD 正常
npm run build 成功
```

## Git 提交注意事项

提交前执行：

```bash
git status --short
git diff --stat
```

不要提交：

- `backend_impl/.env`
- `backend_impl/data/`
- MongoDB 数据目录
- API Key、JWT Secret 和管理员密码
- `node_modules/`
- `dist/`
- 本地日志、临时渲染文件和个人文档

建议提交 `package-lock.json`，以便下一位开发者安装一致的依赖版本。

## 常见问题

### 3001 启动时报 `EADDRINUSE`

表示 3001 已被其他 Node 进程占用。先找到并关闭旧进程，再重新启动，不要同时运行多个 3001 实例。

### PDF 附件接口返回 503

先确认 MongoDB Server 已启动并监听 27017，再访问：

```text
http://127.0.0.1:3001/api/attachment/test
```

### 页面可以打开，但图谱或问答请求失败

确认外部 Python 5001 后端已启动，并检查 `vite.config.js` 中通用 `/api` 代理是否仍指向 5001。

### 开发环境请求过多被限流

确认 `backend_impl/.env` 中使用：

```dotenv
NODE_ENV=development
```

修改环境变量后需要重启 3001。

## 共享 `_code` 兄弟仓库（Model1/Model2 Python 能力前置）

本仓库部分后端 Python 能力**依赖仓库外的共享 `_code` 兄弟仓库**，克隆本仓库到别处后必须满足以下前置才可跑通：

- 仓库内存在软链接 `backend_impl/python/recipe_opt`，其目标为
  `../../../_code/recipe-opt-model/src/recipe_opt`（仓库上一级 `Report-ASC/_code`）。
- `../_code` 是一个独立的 git 仓库，需包含（至少）：
  - `recipe-opt-model/src/recipe_opt/`（配方优化/预测核心包，被软链指向）
  - `component-mlp-model/`（预测代理模型的数据读取）
  - `output/`（已训练预测器 `predictor_model.pkl` 与数据集 `dataset_merged.npy`）

缺失该共享仓库时，软链会悬空，以下**真实**模型能力不可用（但普通 SQLite CRUD 不受影响）：
`POST /api/model2/optimize`（配方优化）、`GET /api/model1/materials` + `POST /api/model1/predict`（性能预测）、ML 数据集的预测相关能力。

### ML 数据集与本地数据（隐私）

- 最新拟用于机器学习预测的数据集位于 `./private/*.npy`（隐私，已加入 `.gitignore`，**永不提交/推送**）。结构为 780 个配方样本：每样本 `X_comp`(n×51 特征，含 PC1..PC20 等) + `X_global`(3) + `y_labels`(4 目标性质，按温度均值/方差)。
- 载入 SQLite：`cd backend_impl && npm run ml:load`（或 `POST /api/ml-dataset/load`），幂等。
- 拆分到业务四表：`cd backend_impl && npm run ml:materialize`（或 `POST /api/ml-dataset/materialize`），幂等。
- 业务 SQLite 数据位于 `backend_impl/data/sqlite/database.db`（本地运行数据，不入库）。

## 预测模型（已迁移至 /api/v1，旧模型已废弃）

- **规范预测 API**（与 `example` 模型服务契约一致，长期稳定）：
  - `GET  /api/v1/model/metadata`
  - `POST /api/v1/predict/simple`（`X_comp` / `X_global` / `conditions` / `properties`）
  - `POST /api/v1/predict`、`POST /api/v1/predict/batch`
  - 由 `backend_impl` 反向代理到模型服务（`backend_impl/python/model_predict`，uvicorn，默认 `PREDICT_BASE_URL=http://127.0.0.1:8100`）。
- **换模型**：只替换 `backend_impl/python/model_predict/MODEL/outputs/models/<variant>/*.joblib` 与 `FEATURE/outputs/metadata_<variant>.json`，重启服务；API/数据格式不变。详见 `backend_impl/python/model_predict/README.md`。
- **⚠️ 已废弃（DEPRECATED）**：旧占位预测 `/api/model1/materials`、`/api/model1/predict`（recipe_opt 96 原料空间，`backend_impl/python/recipe_predict_bridge.py`）——响应带 `Deprecation` 头，仅为兼容暂时保留，请改用上表 `/api/v1/*`。`/api/model1/submit` 同为旧占位（外部 `:8000`），亦已废弃。
