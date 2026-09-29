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
    open: true,
    watch: {
      ignored: ['**/_code/**', '**/node_modules/**', '**/dist/**', '**/.git/**'],
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
      '/api/agent': {
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
