import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(currentDirectory, 'src'),
    },
  },
  server: {
    port: 3005,
    strictPort: true,
    // WSL 下 open:true 会尝试调用 powershell.exe 打开浏览器；该调用 EACCES 会让 dev server 退出。
    // 脚本化启动时设 VITE_NO_OPEN=1 即可无头运行（人类 `npm run dev` 仍保持自动打开）。
    open: process.env.VITE_NO_OPEN ? false : true,
    watch: {
      // 仓库在 /mnt/e（9p/DrvFs）：inotify 不可靠，编辑后 HMR/模块缓存不失效 → 页面仍是旧代码。
      // 开启轮询保证改动可靠生效（ignored 已排除 node_modules/.venv/backend_impl/AI4Sci，轮询面很小）。
      usePolling: true,
      interval: 400,
      ignored: [
        '**/_code/**', '**/node_modules/**', '**/dist/**', '**/.git/**',
        // Python 虚拟环境/日志库：几十万文件，WSL 下会把 inotify watch 配额打满（ENOSPC 导致 dev server 退出）
        '**/.venv/**', '**/backend_impl/**', '**/AI4Sci-NEXUS-ASC-Development-Domain/**',
      ],
    },
    proxy: {
      // 数据平台 API → Node.js 后端 (端口 3001)
      '/api/auth': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/new-data': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      // 原料 base 注册表 / 解析规则 / 覆盖报告
      '/api/material-base': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      // 从配方（业务表）直接预测
      '/api/predict': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/admin': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/recipe-parser': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/attachment': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/user': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/embedding': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/llm': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/ext-field': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      // 材料编码（自然语言配方 → 材料代号）：Node 侧新增能力，不属于 Python /api/v1 代理
      '/api/material-encoder': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/model1': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/v1': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/ml-dataset': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/model2': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/model3': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/model4': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      // 智能体（SSE 流式）→ Node.js 后端
      // MongoDB 可视化管理（只读浏览 + 索引管理 + 统计）
      '/api/mongo': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false
      },
      // 统一文件管理（GridFS asc_files + file_meta）
      '/api/files': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false
      },
      '/api/agent': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      // 验收测试[2026]（独立只读路由）→ Node.js 后端；必须排在兜底 '/api' 之前，
      // 否则会被兜底规则转发到 5001（知识图谱后端）而得到 404。
      '/api/acceptance': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      // 通用 API → Python 知识图谱后端
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false
      },
      '/config': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    }
  },
  optimizeDeps: {
    entries: ['src/**/*.{vue,js,ts}', 'index.html'],
    exclude: [],
  },
})
