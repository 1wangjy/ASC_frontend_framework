const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// 加载环境变量
dotenv.config();

// 确保 data/uploads 目录存在（embedding 上传需要）
const uploadsDir = path.join(__dirname, '../data/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 数据库连接
const database = require('./config/database');
const materialBaseService = require('./services/materialBaseService');
const materialBaseRoutes = require('./routes/materialBase');
const predictFormulaRoutes = require('./routes/predictFormula');

database.connect()
  .then(async () => {
    // 原料 base 注册表：建表（幂等）+ 首次从 data/material_base_map.json 引导种子
    await materialBaseService.ensureReady();
    const boot = await materialBaseService.bootstrapFromJson();
    if (boot.inserted || boot.rulesInserted) {
      console.log(`[material-base] bootstrapped ${boot.inserted} bases / ${boot.rulesInserted} rules from json`);
    }
  })
  .catch(error => {
    console.error('Database connection failed:', error);
    process.exit(1);
  });

// 创建Express应用
const app = express();

// 中间件配置
app.use(cors());

// 安全中间件 - 允许内联脚本（用于 SidebarModule 初始化）
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"],
    }
  }
}));

// API 速率限制
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100个请求
  message: { code: 429, message: '请求过于频繁，请稍后再试' }
});
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', apiLimiter);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 - 开发环境禁用缓存
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// 路由导入
const model1Routes = require('./routes/model1');
const materialEncoderRoutes = require('./routes/materialEncoder');
const model2Routes = require('./routes/model2');
const model3Routes = require('./routes/model3');
const model4Routes = require('./routes/model4');
const embeddingRoutes = require('./routes/embedding');
const llmRoutes = require('./routes/llm');
const recipeParserRoutes = require('./routes/recipeParser');
const extFieldRoutes = require('./routes/extField');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const mlDatasetRoutes = require('./routes/mlDataset');
const predictProxyRoutes = require('./routes/predictProxy');
const newDataRoutes = require('./routes/newData');
const userRoutes = require('./routes/user');
const attachmentRoutes = require('./routes/attachment');
const filesRoutes = require('./routes/files');
const acceptanceRoutes = require('./routes/acceptance');
const agentRoutes = require('./agent');

// 使用路由
app.use('/api/embedding', embeddingRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/model1', model1Routes);
app.use('/api/material-encoder', materialEncoderRoutes);
app.use('/api/material-base', materialBaseRoutes);
app.use('/api/predict', predictFormulaRoutes);
app.use('/api/model2', model2Routes);
app.use('/api/model3', model3Routes);
app.use('/api/model4', model4Routes);
app.use('/api/recipe-parser', recipeParserRoutes);
app.use('/api/ml-dataset', mlDatasetRoutes);
app.use('/api/v1', predictProxyRoutes);
app.use('/api/ext-field', extFieldRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/new-data', newDataRoutes);
app.use('/api/user', userRoutes);
app.use('/api/attachment', attachmentRoutes);
// 统一文件管理（MongoDB GridFS + file_meta，按 DOI/sha256/visibility 管理）
app.use('/api/files', filesRoutes);
// 验收测试[2026]：独立只读路由，不与业务路由耦合
app.use('/api/acceptance', acceptanceRoutes);
// 多轮对话 Agent（模块化：删除本行即移除该功能）
app.use('/api/agent', agentRoutes.router);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 提供带输入字段定义的可变长物性配置
app.get('/config/properties-config.json', (req, res) => {
  const { PURE_MATERIAL_PROPERTIES, TEST_PROPERTIES } = require('./config/properties-def');
  res.json({
    schemaVersion: 3,
    pureMaterialProperties: PURE_MATERIAL_PROPERTIES,
    testProperties: TEST_PROPERTIES
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ code: 404, message: 'Not Found' });
});

// 全局异常处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ code: 500, message: 'Internal Server Error' });
});

// 启动服务
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
