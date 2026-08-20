# ASC Frontend Framework

ASC 前端项目，基于 Vue 3 + Vite 构建。

集成了**知识图谱问答**（原系统）与**数据平台 + AI 模型**（解耦模块）两大子系统，共享同一套侧边栏导航。

---

## 环境要求

- Node.js 18+
- npm

## 快速启动

```bash
npm install
npm run dev
```

访问 http://localhost:3000

---

## 项目架构

### 模块解耦设计

```
src/
├── App.vue                     # 根组件（挂载 LoginModal）
├── main.js                     # 入口（注册 Pinia + Router）
├── router/                     # 路由定义
├── layouts/
│   └── AscShell.vue            # 全局布局（侧边栏 + 内容区）
├── components/
│   ├── navigation/
│   │   └── AscSidebar.vue      # 侧边栏导航（含用户信息栏）
│   └── ui/
│       ├── AscIcon.vue         # 图标组件
│       └── AscLoginModal.vue   # 登录弹窗
├── store/
│   ├── auth.js                 # 全局认证 Store (Pinia)
│   └── pendingUpload.js        # 上传暂存（原系统）
├── views/                      # 知识图谱相关页面
│   ├── AscQaView.vue           # 问答首页
│   ├── DocumentLibraryView.vue # 文献管理
│   ├── GraphProjectWorkspaceView.vue  # 图谱演化
│   └── ...
├── features/                   # 知识图谱业务逻辑
├── api/                        # 知识图谱 API 层
│
└── platform/                   # ★ 数据平台 & AI 模型模块（完全解耦）
    ├── api/                    # 独立 API 层（独立 axios 实例）
    ├── stores/                 # 独立 Pinia Stores
    ├── composables/            # 业务逻辑 composables
    ├── types/                  # JSDoc 类型定义
    ├── utils/                  # 工具函数
    ├── views/                  # 页面视图
    │   ├── DataManagerView.vue # 数据平台（6张表 CRUD）
    │   ├── HomeView.vue        # 模型入口
    │   ├── Model1View.vue      # 性能预测
    │   ├── Model2View.vue      # 配方优化
    │   ├── Model3View.vue      # 服役预测
    │   └── Model4View.vue      # 3D温度场重建
    ├── components/             # 平台组件
    │   ├── DataTable.vue       # 通用数据表格
    │   ├── ComponentListEditor.vue  # 成分列表编辑器
    │   ├── RecipeParserPanel.vue    # 配方解析面板
    │   ├── MaterialSelectModal.vue  # 材料选择弹窗
    │   └── LoginModal.vue      # 平台登录弹窗
    └── styles/                 # 独立 CSS（以 .platform-page 为根选择器）
```

### 后端

```
backend_impl/                   # ★ 独立 Node.js 后端（从 _code 迁移）
├── package.json
├── .env.example
└── src/
    ├── index.js                # 入口（端口 3001）
    ├── config/                 # 数据库配置
    ├── controllers/            # 控制器
    ├── routes/                 # 路由定义
    ├── services/               # 服务层
    ├── utils/                  # 工具函数
    └── models/                 # 数据模型
```

---

## 路由一览

| 路径 | 子系统 | 说明 |
|------|--------|------|
| `/` | 知识图谱 | 问答首页 |
| `/documents` | 知识图谱 | 文献管理 |
| `/process/:projectId?` | 知识图谱 | 图谱演化 |
| `/reports` | 知识图谱 | 报告生成 |
| `/platform/data` | 数据平台 | 数据管理（6张表 CRUD + 文献库 + 配方解析） |
| `/platform/models` | 模型入口 | 模型选择卡片页 |
| `/platform/model1` | AI 模型 | 性能预测 |
| `/platform/model2` | AI 模型 | 配方优化 |
| `/platform/model3` | AI 模型 | 服役预测 |
| `/platform/model4` | AI 模型 | 3D温度场重建 |

---

## 启动后端

```bash
# 安装依赖
cd backend_impl
npm install

# 启动服务（默认端口 3001）
npm start
```

前端开发服务器会自动将平台 API 请求代理到 `localhost:3001`。

---

## 认证系统

- 侧边栏底部提供用户登录/登出入口
- 登录状态持久化到 `localStorage`
- 后端 API: `POST /api/auth/login`
- 认证代理: `http://localhost:3001`（Node.js 后端）

---

## 主要目录说明

| 目录 | 说明 |
|------|------|
| `src/views/` | 知识图谱页面 |
| `src/platform/` | 数据平台 & AI 模型模块（完全解耦） |
| `src/api/` | 知识图谱 API 请求 |
| `src/store/` | 全局状态管理 |
| `backend_impl/` | 独立 Node.js 后端 |
| `docs/` | 文档 |
| `tests/` | 测试 |
| `tmp/` | 临时文件 |
| `done/` | 已完成任务存档 |