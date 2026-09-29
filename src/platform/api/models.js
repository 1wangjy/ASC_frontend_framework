import request from './request'
import { unwrapApiResult } from './request'

export function submitModel1(data) {
  return request.post('/api/model1/submit', data).then(unwrapApiResult)
}

// 列出性能预测器的 96 原料空间
// ⚠️ DEPRECATED：旧占位预测(96 原料)。新规范 API 见 src/platform/api/predictV1.js (/api/v1)。
export function fetchModel1Materials() {
  return request.get('/api/model1/materials').then(unwrapApiResult)
}

// 配方 -> 19 项性能预测 (真实 recipe_opt RecipePredictor)
// ⚠️ DEPRECATED：旧占位预测。改用 predictV1(/api/v1/predict/simple)。
export function predictModel1(recipe) {
  return request.post('/api/model1/predict', { recipe }).then(unwrapApiResult)
}

// 可优化原料清单（配方优化"逐成分约束"编辑器用；与优化器同一份映射）
export function getModel2Materials() {
  return request.get('/api/model2/materials').then(unwrapApiResult)
}

export function submitModel2(data) {
  return request.post('/api/model2/submit', data).then(unwrapApiResult)
}

// 反向优化：给定目标性能与算法，搜索最优配方 + 返回探索轨迹
export function optimizeModel2(data) {
  return request.post('/api/model2/optimize', data).then(unwrapApiResult)
}

// 一键把 ./private/*.npy 载入当前 sqlite（后端 spawn load_ml_dataset.py，幂等）
export function loadMlDataset() {
  return request.post('/api/ml-dataset/load', {}).then(unwrapApiResult)
}


/**
 * 流式反向优化 (POST /api/model2/optimize/stream, SSE-over-POST)。
 *
 * 用 fetch + ReadableStream 逐帧解析 SSE：
 *   - `data: {..}` 默认消息 → onProgress({type:'progress', iteration, best_objective, algorithm})
 *   - `event: done / data: <result payload>` → onDone(resultData)
 *   - `event: error / data: {message}` → onError(Error(message))
 * 返回 { abort } 用于断开/取消本次请求。
 *
 * @param {object} payload { algorithm, budget, targets? }
 * @param {(msg: object) => void} onProgress
 * @param {(data: object) => void} onDone
 * @param {(err: Error) => void} onError
 */
export function streamOptimizeModel2(payload, onProgress, onDone, onError) {
  const controller = new AbortController()

  const parseSseFrame = (raw) => {
    let event = 'message'
    const dataLines = []
    for (const line of raw.split('\n')) {
      if (line.startsWith(':')) continue // comment / heartbeat
      if (line.startsWith('event:')) {
        const v = line.slice(6).trim()
        if (v) event = v
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
    if (!dataLines.length) return null
    let data
    try {
      data = JSON.parse(dataLines.join('\n'))
    } catch {
      return null
    }
    return { event, data }
  }

  ;(async () => {
    try {
      const response = await fetch('/api/model2/optimize/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}`)
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let finished = false
      while (!finished) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep
        while (!finished && (sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = parseSseFrame(buffer.slice(0, sep))
          buffer = buffer.slice(sep + 2)
          if (!frame) continue
          if (frame.event === 'done') {
            finished = true
            onDone(frame.data)
          } else if (frame.event === 'error') {
            finished = true
            onError(new Error((frame.data && frame.data.message) || '配方优化失败'))
          } else if (frame.data && frame.data.type === 'progress') {
            onProgress(frame.data)
          }
        }
      }
      if (!finished) {
        throw new Error('优化流意外结束，未收到最终结果')
      }
      reader.cancel().catch(() => {})
    } catch (error) {
      if (!controller.signal.aborted) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    }
  })()

  return { abort: () => controller.abort() }
}

export function submitModel3(data) {
  return request.post('/api/model3/submit', data).then(unwrapApiResult)
}

export function reconstructModel4(data) {
  return request.post('/api/model4/reconstruct', data)
}

// 提示：request 的响应拦截器已返回 body，故 .then(res => …) 的 res 即
// { code, message, data: { success, type, data | frames, … } }，unwrapApiResult(res) 就是 res.data。
export function generateStatic() {
  return request.get('/api/model4/generate-static')
    .then(res => unwrapApiResult(res)?.data || null)   // { vertices, faces }
}

export function generateAnimation() {
  return request.get('/api/model4/generate-animation')
    .then(res => {
      const frames = unwrapApiResult(res)?.frames
      return Array.isArray(frames) ? frames : []       // 10 帧：{ step, vertices, faces, thickness_matrix }
    })
}