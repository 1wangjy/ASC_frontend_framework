import request from './request'
import { unwrapApiResult } from './request'

export function submitModel1(data) {
  return request.post('/api/model1/submit', data).then(unwrapApiResult)
}

// 列出性能预测器的 96 原料空间
export function fetchModel1Materials() {
  return request.get('/api/model1/materials').then(unwrapApiResult)
}

// 配方 -> 19 项性能预测 (真实 recipe_opt RecipePredictor)
export function predictModel1(recipe) {
  return request.post('/api/model1/predict', { recipe }).then(unwrapApiResult)
}

export function submitModel2(data) {
  return request.post('/api/model2/submit', data).then(unwrapApiResult)
}

// 反向优化：给定目标性能与算法，搜索最优配方 + 返回探索轨迹
export function optimizeModel2(data) {
  return request.post('/api/model2/optimize', data).then(unwrapApiResult)
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

export function generateStatic() {
  return request.get('/api/model4/generate-static')
    .then(res => unwrapApiResult(res).data)
}

export function generateAnimation() {
  return request.get('/api/model4/generate-animation')
    .then(res => unwrapApiResult(res).frames)
}