/**
 * File reading utilities.
 */

/** Read a File as ArrayBuffer */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsArrayBuffer(file)
  })
}

/** Read a File as text */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file)
  })
}

/**
 * Parse temperature-point data from CSV or JSON content.
 */
export function parseTempData(content, filename) {
  const points = []
  if (filename.endsWith('.csv')) {
    const lines = content.split('\n').filter((line) => line.trim())
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => parseFloat(v.trim()))
      if (values.length >= 4) {
        points.push({ x: values[0], y: values[1], z: values[2], temperature: values[3] })
      }
    }
  } else if (filename.endsWith('.json')) {
    const data = JSON.parse(content)
    const raw = data.points || data
    if (Array.isArray(raw)) {
      raw.forEach((p) => {
        if (typeof p.x === 'number' && typeof p.temperature === 'number') {
          points.push(p)
        }
      })
    }
  }
  return points
}