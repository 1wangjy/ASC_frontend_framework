/**
 * 登录态持久化的键名 —— 单一事实来源。
 * store（写入）与 axios 拦截器（读取）共用，避免两处各写一个字符串而失配。
 */
export const TOKEN_STORAGE_KEY = 'asc_token'
export const USER_STORAGE_KEY = 'asc_user'
