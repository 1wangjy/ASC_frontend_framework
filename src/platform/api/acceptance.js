import request, { unwrapApiResult } from './request'

/**
 * 验收测试[2026] 客户端。
 *   getAcceptanceChecks()   验收项与检查清单（声明式）
 *   runAcceptanceCheck(id)  运行单条检查
 *   streamAcceptanceRun(…)  批量运行（SSE：event: check / done / error）
 */

export function getAcceptanceChecks() {
  return request.get('/api/acceptance/checks').then(unwrapApiResult)
}

export function runAcceptanceCheck(id) {
  return request.post(`/api/acceptance/run/${encodeURIComponent(id)}`).then(unwrapApiResult)
}

export function streamAcceptanceRun(payload, onCheck, onDone, onError) {
  const controller = new AbortController()

  const parseSseFrame = (raw) => {
    let event = 'message'
    const dataLines = []
    for (const line of raw.split('\n')) {
      if (line.startsWith(':')) continue // 心跳/注释帧
      if (line.startsWith('event:')) {
        const value = line.slice(6).trim()
        if (value) event = value
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
    if (!dataLines.length) return null
    try {
      return { event, data: JSON.parse(dataLines.join('\n')) }
    } catch {
      return null
    }
  }

  ;(async () => {
    try {
      const response = await fetch('/api/acceptance/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(`验收运行请求失败（HTTP ${response.status}）`)
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let index
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const frame = parseSseFrame(buffer.slice(0, index))
          buffer = buffer.slice(index + 2)
          if (!frame) continue
          if (frame.event === 'check') onCheck?.(frame.data)
          else if (frame.event === 'done') onDone?.(frame.data)
          else if (frame.event === 'error') onError?.(new Error(frame.data?.message || '验收运行失败'))
        }
      }
      controller.abort()
    } catch (error) {
      if (error?.name !== 'AbortError') onError?.(error)
    }
  })()

  return controller
}
