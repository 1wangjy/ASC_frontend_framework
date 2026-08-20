# Changelog

## [1.0.0] - 2026-08-19

### 新增模块（完全解耦）

#### 数据平台模块 (`src/platform/`)
- **数据管理**：6 张材料数据表的完整 CRUD（mc/mr/mp/tp/fe/ru），支持行内编辑、搜索过滤、导航历史
- **文献库管理**：文献/专利的增删改查，PDF 附件上传与预览
- **配方解析**：支持 YAML 和文本双格式配方解析，成分匹配，物性数据管理
- **MongoDB 状态检查**：后端连接状态检测

#### AI 模型模块 (`src/platform/views/`)
- **性能预测** (Model1)：配方文本解析 → Embedding 生成 → 性能预测
- **配方优化** (Model2)：输入测试指标 → 配方参数优化
- **服役预测** (Model3)：输入工况指标 → 服役性能评估
- **3D温度场重建** (Model4)：STL 文件加载 + 温度点插值 + Three.js 可视化

#### 认证系统
- 全局 Pinia 认证 Store (`src/store/auth.js`)
- 登录弹窗组件 (`src/components/ui/AscLoginModal.vue`)
- 侧边栏底部用户信息栏（头像/用户名/登录登出）
- 登录状态持久化到 `localStorage`

#### 独立后端 (`backend_impl/`)
- 从 `_code` 完整迁移的 Node.js + Express 后端
- 支持 SQLite / MongoDB 双数据库
- 包含认证、数据管理、配方解析、模型推理等全部 API

### 架构变更

- **解耦迁移**：将 `_code` 下的数据平台前端代码迁移到 `src/platform/` 目录，与知识图谱代码完全分离
- **独立 API 层**：平台模块使用独立 axios 实例，知识图谱 API 互不干扰
- **独立 Pinia Stores**：使用命名空间隔离（`usePlatform*`）
- **独立 CSS**：以 `.platform-page` 为根选择器，不污染全局样式
- **`_code` 加入 `.gitignore`**：不再依赖 `_code` 软链接

### 最小修改文件清单

仅修改以下 8 个现有文件即可完成全部集成：

| 文件 | 修改内容 |
|------|---------|
| `package.json` | 新增 `pinia`, `three.js`, `js-yaml` 依赖 |
| `vite.config.js` | `@` 别名、`_code` 扫描排除、平台 API 代理（port 3001） |
| `src/main.js` | 注册 Pinia、导入平台 CSS |
| `src/config/ascRoutes.js` | 新增 6 个平台路由 |
| `src/features/navigation/appNavigation.js` | 新增「数据平台」和「模型入口」导航项 |
| `src/components/navigation/AscSidebar.vue` | 支持 divider 导航项 + 底部用户信息栏 |
| `src/App.vue` | 挂载 LoginModal 组件，初始化认证 |
| `src/store/auth.js` | 新增全局认证 Store |

### 新增文件

- **34 个平台模块文件**（`src/platform/`）
- **2 个认证文件**（`src/store/auth.js`, `src/components/ui/AscLoginModal.vue`）
- **43 个后端文件**（`backend_impl/`）