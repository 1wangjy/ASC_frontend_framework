export function getBrowserStorage(browser = globalThis) {
  try {
    return browser?.localStorage ?? null
  } catch {
    return null
  }
}

export function readBrowserStorageItem(key, browser = globalThis) {
  const storage = getBrowserStorage(browser)
  if (!storage?.getItem) return null

  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}
