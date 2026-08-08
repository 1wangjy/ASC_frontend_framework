/**
 * 项目注册表 —— 前端本地维护项目列表的简单方案。
 *
 * 后端初始提交（f8b9ee4）没有 `GET /api/graph/project/list` 接口，
 * 问答页面需要从本地注册表恢复已知项目。
 * 本模块将 project_id 存入 localStorage，通过 `getProject(projectId)` 逐个获取。
 *
 * 使用方式：
 * 1. 旧工作流创建项目成功后调用 `registerProject(projectId)`
 * 2. 新页面调用 `getRegisteredProjectIds()` 获取已注册的 ID 列表
 * 3. 调用 `getProject(id)` 逐个获取详情
 */
const REGISTRY_KEY = 'asc_project_registry'

export function registerProject(projectId) {
  if (!projectId) return
  try {
    const stored = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]')
    if (!stored.includes(projectId)) {
      stored.push(projectId)
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(stored))
    }
  } catch {
    // localStorage 不可用时静默忽略
  }
}

export function getRegisteredProjectIds() {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]')
  } catch {
    return []
  }
}

export function removeProjectFromRegistry(projectId) {
  if (!projectId) return
  try {
    const stored = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]')
    const filtered = stored.filter(id => id !== projectId)
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(filtered))
  } catch {
    // ignore
  }
}
