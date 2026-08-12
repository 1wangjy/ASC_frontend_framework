const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*]+/g
const SEPARATORS = /[-\s]+/g
const MAX_BASENAME_LENGTH = 252
const REPORT_SUFFIX = '-研究报告'
const FALLBACK_PROJECT_NAME = '未命名项目'

export function buildReportFilename(projectName) {
  const normalizedProjectName = String(projectName ?? '')
    .replace(INVALID_FILENAME_CHARACTERS, '-')
    .replace(SEPARATORS, '-')
    .replace(/^-+|-+$/g, '')

  const safeProjectName = normalizedProjectName || FALLBACK_PROJECT_NAME
  const maximumProjectNameLength = MAX_BASENAME_LENGTH - REPORT_SUFFIX.length
  const basename = `${safeProjectName.slice(0, maximumProjectNameLength)}${REPORT_SUFFIX}`
  return `${basename}.md`
}

export async function saveReportDownload({ reportId, projectName, downloadReport, browser }) {
  const response = await downloadReport(reportId)
  const blob = response instanceof Blob ? response : response?.data

  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('后端未返回可下载的报告文件')
  }

  const document = browser?.document
  const urlApi = browser?.URL
  if (!document?.createElement || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL) {
    throw new Error('浏览器下载能力不可用')
  }

  const filename = buildReportFilename(projectName)
  const objectUrl = urlApi.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.hidden = true
    anchor.click()
    return filename
  } finally {
    urlApi.revokeObjectURL(objectUrl)
  }
}
