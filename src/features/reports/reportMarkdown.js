function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInline(value) {
  const codeTokens = []
  let html = String(value ?? '').replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`
    codeTokens.push(`<code class="report-md__inline-code">${code}</code>`)
    return token
  })

  html = html
    .replace(/\[([^\]]+)\]\(#([A-Za-z0-9_-]+)\)/g, '<a class="report-md__link" href="#$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')

  codeTokens.forEach((code, index) => {
    html = html.replace(`\u0000CODE${index}\u0000`, code)
  })
  return html
}

function splitTableRow(line) {
  let value = String(line || '').trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split('|').map(cell => cell.trim())
}

function isTableSeparator(line) {
  const cells = splitTableRow(line)
  return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function isBlockStart(lines, index) {
  const line = lines[index] || ''
  const next = lines[index + 1] || ''
  return /^```/.test(line)
    || /^#{1,4}\s+/.test(line)
    || /^&gt;\s?/.test(line)
    || /^\s*[-*]\s+/.test(line)
    || /^\s*\d+\.\s+/.test(line)
    || /^---+$/.test(line.trim())
    || (line.includes('|') && isTableSeparator(next))
}

function renderTable(lines, start) {
  const headers = splitTableRow(lines[start])
  const rows = []
  let index = start + 2
  while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
    rows.push(splitTableRow(lines[index]))
    index += 1
  }
  const head = headers.map(cell => `<th>${renderInline(cell)}</th>`).join('')
  const body = rows.map(row => (
    `<tr>${headers.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] || '')}</td>`).join('')}</tr>`
  )).join('')
  return {
    html: `<div class="report-md__table-wrap"><table class="report-md__table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
    nextIndex: index
  }
}

export function renderReportMarkdown(markdown) {
  if (!markdown) return ''
  const lines = escapeHtml(markdown).replace(/\r\n?/g, '\n').split('\n')
  const output = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (/^```/.test(line)) {
      const language = line.slice(3).trim().replace(/[^A-Za-z0-9_-]/g, '')
      const code = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      output.push(`<pre class="report-md__code"><code${language ? ` data-language="${language}"` : ''}>${code.join('\n')}</code></pre>`)
      continue
    }

    if (line.includes('|') && isTableSeparator(lines[index + 1] || '')) {
      const table = renderTable(lines, index)
      output.push(table.html)
      index = table.nextIndex
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      output.push(`<h${level} class="report-md__h${level}">${renderInline(heading[2])}</h${level}>`)
      index += 1
      continue
    }

    if (/^&gt;\s?/.test(line)) {
      const quote = []
      while (index < lines.length && /^&gt;\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^&gt;\s?/, ''))
        index += 1
      }
      output.push(`<blockquote class="report-md__quote">${renderInline(quote.join('<br>'))}</blockquote>`)
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      output.push(`<ul class="report-md__list">${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      output.push(`<ol class="report-md__list">${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ol>`)
      continue
    }

    if (/^---+$/.test(line.trim())) {
      output.push('<hr class="report-md__divider">')
      index += 1
      continue
    }

    const paragraph = []
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index])
      index += 1
    }
    if (!paragraph.length) {
      paragraph.push(line)
      index += 1
    }
    output.push(`<p class="report-md__paragraph">${paragraph.map(renderInline).join('<br>')}</p>`)
  }

  return output.join('\n')
}
