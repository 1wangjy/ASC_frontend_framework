// Only change the display label. Keep the original error for logs and history.
export function agentErrorMessage(error) {
  const text = typeof error === 'string' ? error : String(error?.message || error || '')
  const modelRequest = /LLM request failed|model request failed/i.test(text)
  const unavailable = /HTTP\s*503\b|service_unavailable_error|service\s+is\s+too\s+busy/i.test(text)
  return modelRequest && unavailable ? '模型服务繁忙，请稍后重试' : text
}
