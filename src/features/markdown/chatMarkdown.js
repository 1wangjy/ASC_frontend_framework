/**
 * 会话 markdown 渲染：智能体输出与多轮讨论共用的唯一渲染器。
 *
 * 输入先整体转义 HTML（模型/用户文本一律不可执行），再按已知语法还原为展示标记：
 * 标题、表格、围栏代码、列表、引用、行内 code/粗体/斜体/下划线、安全链接，
 * 以及领域相关的化学式下标（Al2O3 → Al₂O₃）与行内/块级 LaTeX。
 * 流式输出安全：未闭合的围栏/公式按"到文本末尾"处理，不会抛错或吃掉内容。
 */
const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const safeLink = value => {
  const href = String(value || '').trim()
  return /^(?:https?:\/\/|#)[^\s]*$/i.test(href) ? href : ''
}

const SUBSCRIPT_DIGITS = Object.freeze({
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄',
  5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉'
})

const ELEMENT_SYMBOLS = new Set((
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn ' +
  'Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce ' +
  'Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn ' +
  'Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc ' +
  'Lv Ts Og Me'
).split(/\s+/))

const normalizeChemicalFormulae = value => String(value || '').replace(
  /(^|[^A-Za-z0-9])([A-Z][A-Za-z0-9]*(?:-[A-Z][A-Za-z0-9]*)*)(?=$|[^A-Za-z0-9])/g,
  (match, prefix, token) => {
    if (!/\d/.test(token)) return match
    let atomCount = 0
    const valid = token.split('-').every(segment => {
      const atom = /([A-Z][a-z]?)(\d*)/gy
      let cursor = 0
      let parsed = 0
      while (cursor < segment.length) {
        atom.lastIndex = cursor
        const found = atom.exec(segment)
        if (!found || found.index !== cursor || !ELEMENT_SYMBOLS.has(found[1])) return false
        cursor = atom.lastIndex
        parsed += 1
      }
      atomCount += parsed
      return parsed > 0
    })
    if (!valid || atomCount < 2) return match
    return prefix + token.replace(/\d/g, digit => SUBSCRIPT_DIGITS[digit] || digit)
  }
)

const LATEX_SYMBOLS = Object.freeze({
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ',
  lambda: 'λ', mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ',
  Psi: 'Ψ', Omega: 'Ω', partial: '∂', nabla: '∇', pm: '±', times: '×', cdot: '·',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', approx: '≈', infty: '∞',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', degree: '°'
})

const readLatexGroup = (source, start) => {
  if (source[start] !== '{') return null
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return { value: source.slice(start + 1, index), end: index + 1 }
  }
  return null
}

const readLatexAtom = (source, start) => {
  let index = start
  while (/\s/.test(source[index] || '')) index += 1
  const group = readLatexGroup(source, index)
  if (group) return group
  if (source[index] === '\\') {
    const command = source.slice(index).match(/^\\[A-Za-z]+/)
    if (command) return { value: command[0], end: index + command[0].length }
  }
  return { value: source[index] || '', end: Math.min(source.length, index + 1) }
}

const renderLatexFragment = source => {
  const value = String(source || '')
  let html = ''
  let index = 0
  while (index < value.length) {
    const char = value[index]
    if (char === '{') {
      const group = readLatexGroup(value, index)
      if (group) {
        html += renderLatexFragment(group.value)
        index = group.end
        continue
      }
    }
    if (char === '_' || char === '^') {
      const atom = readLatexAtom(value, index + 1)
      const tag = char === '_' ? 'sub' : 'sup'
      html += `<${tag}>${renderLatexFragment(atom.value)}</${tag}>`
      index = atom.end
      continue
    }
    if (char === '\\') {
      const commandMatch = value.slice(index).match(/^\\([A-Za-z]+|[,;! ])/)
      if (!commandMatch) {
        html += '&#92;'
        index += 1
        continue
      }
      const command = commandMatch[1]
      index += commandMatch[0].length
      if (command === 'left' || command === 'right') continue
      if ([',', ';', '!', ' '].includes(command)) {
        if (command !== '!') html += '<span class="md-latex-space"> </span>'
        continue
      }
      if (command === 'frac') {
        const numerator = readLatexGroup(value, index)
        const denominator = numerator ? readLatexGroup(value, numerator.end) : null
        if (numerator && denominator) {
          html += `<span class="md-latex-frac"><span class="md-latex-num">${renderLatexFragment(numerator.value)}</span><span class="md-latex-den">${renderLatexFragment(denominator.value)}</span></span>`
          index = denominator.end
          continue
        }
      }
      if (['mathrm', 'mathbf', 'mathit', 'text', 'operatorname'].includes(command)) {
        const group = readLatexGroup(value, index)
        if (group) {
          const className = command === 'mathbf' ? 'md-latex-bold' : command === 'mathit' ? 'md-latex-italic' : 'md-latex-roman'
          html += `<span class="${className}">${renderLatexFragment(group.value)}</span>`
          index = group.end
          continue
        }
      }
      html += escapeHtml(LATEX_SYMBOLS[command] || `\\${command}`)
      continue
    }
    html += escapeHtml(char)
    index += 1
  }
  return html
}

const renderLatex = (source, display = false) => {
  const value = String(source || '').trim()
  const tag = display ? 'div' : 'span'
  const className = display ? 'md-latex md-latex-block' : 'md-latex md-latex-inline'
  return `<${tag} class="${className}" role="math" aria-label="${escapeHtml(value)}">${renderLatexFragment(value)}</${tag}>`
}

const stripLegacyHtml = value => String(value || '')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<div\b[^>]*class=["'][^"']*(?:thinking-chain|logic-chain)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
  .replace(/<u\b[^>]*>/gi, '++')
  .replace(/<\/u>/gi, '++')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<strong\b[^>]*>/gi, '**')
  .replace(/<\/strong>/gi, '**')
  .replace(/<em\b[^>]*>/gi, '*')
  .replace(/<\/em>/gi, '*')
  .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
  .replace(/<\/?[A-Za-z][^>]*>/g, '')

export const normalizeChatMarkdown = value => {
  let text = stripLegacyHtml(value)
    .replace(/\r\n/g, '\n')
    .replace(/\*{4,}/g, '**')
    .replace(/^\s*(#{1,6})[ \t]*(?=\S)(.+)$/gm, (_match, hashes, title) => `${hashes} ${title.trim()}`)
  const roleMarkup = content => {
    const clean = String(content || '').replace(/[+*]/g, '').trim()
    const sentenceLike = clean.length > 18 || /[。！？；，,!?;:]|取决于|能否|导致|决定|使得|会使|可以|能够|因此|从而|降低|提高|改善|影响|形成|发生|转入|失效/.test(clean)
    return sentenceLike ? `++${clean}++` : `**${clean}**`
  }
  text = text
    .replace(/\*\*\+\+([^+\n]+)\+\+\*\*/g, (_match, content) => roleMarkup(content))
    .replace(/\+\+\*\*([^*\n]+)\*\*\+\+/g, (_match, content) => roleMarkup(content))
    .replace(/\*\*([^*\n]+)\*\*/g, (_match, content) => roleMarkup(content))
  const directSection = text.match(
    /^#{1,4}\s*(?:\d+[.、]?\s*)?直接(?:结论|回答)[^\n]*\n([\s\S]*?)(?=^#{1,4}\s+|(?![\s\S]))/m
  )
  if (directSection) text = directSection[1]
  text = text
    .replace(/\s*\{#[A-Za-z0-9_-]+\}\s*$/gm, '')
    .replace(/^\s*(?:[-*+]\s*)?(?:思维链|逻辑链|推理链|详细逻辑链)\s*[：:].*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text
}

const inlineMarkdown = value => {
  const tokens = []
  const token = html => {
    const id = `\u0000MD${tokens.length}\u0000`
    tokens.push(html)
    return id
  }

  let text = String(value ?? '')
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => token(`<code class="md-inline-code">${escapeHtml(code)}</code>`))
  text = text.replace(/\\\(([^\n]+?)\\\)/g, (_match, formula) => token(renderLatex(formula)))
  text = text.replace(/(^|[^\\$])\$([^$\n]+)\$/g, (_match, prefix, formula) => `${prefix}${token(renderLatex(formula))}`)
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
    const safeHref = safeLink(href)
    if (!safeHref) return escapeHtml(label)
    return token(`<a class="md-link" href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(normalizeChemicalFormulae(label))}</a>`)
  })
  text = escapeHtml(normalizeChemicalFormulae(text))
  text = text.replace(/\+\+([^+\n]+)\+\+/g, (_match, content) => token(`<u class="md-key-underline">${content}</u>`))
  text = text.replace(/\*\*([^*\n]+)\*\*/g, (_match, content) => token(`<strong>${content}</strong>`))
  text = text.replace(/__([^_\n]+)__/g, (_match, content) => token(`<strong>${content}</strong>`))
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_match, prefix, content) => `${prefix}${token(`<em>${content}</em>`)}`)
  // Never expose malformed Markdown delimiters in the rendered answer. Valid
  // emphasis has already been converted to protected HTML tokens above.
  text = text.replace(/\*{2,}|\+{2,}/g, '')

  let previous
  do {
    previous = text
    text = text.replace(/\u0000MD(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || '')
  } while (text !== previous && /\u0000MD\d+\u0000/.test(text))
  return text
}

const splitTableRow = line => {
  let text = String(line || '').trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  return text.split('|').map(cell => cell.trim())
}

const isTableSeparator = line => {
  const cells = splitTableRow(line)
  return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

const renderTable = rows => {
  const headers = splitTableRow(rows[0])
  const body = rows.slice(2).map(splitTableRow).filter(row => row.some(Boolean))
  const head = headers.map(header => `<th>${inlineMarkdown(header)}</th>`).join('')
  const bodyHtml = body.map(row => (
    `<tr>${headers.map((header, index) => `<td data-label="${escapeHtml(header)}">${inlineMarkdown(row[index] || '—')}</td>`).join('')}</tr>`
  )).join('')
  return `<div class="md-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
}

const renderList = (lines, ordered) => {
  const tag = ordered ? 'ol' : 'ul'
  const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/
  const items = lines.map(line => {
    const match = line.match(pattern)
    return `<li>${inlineMarkdown(match?.[1] || line)}</li>`
  }).join('')
  return `<${tag} class="md-list">${items}</${tag}>`
}

export const renderChatMarkdown = value => {
  const source = normalizeChatMarkdown(value)
  if (!source) return ''
  const lines = source.split('\n')
  const blocks = []
  let paragraph = []
  let index = 0

  const flushParagraph = () => {
    const content = paragraph.map(line => inlineMarkdown(line)).join('<br>')
    if (content) blocks.push(`<p>${content}</p>`)
    paragraph = []
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      index += 1
      continue
    }

    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
      flushParagraph()
      const dollarMode = trimmed.startsWith('$$')
      const closing = dollarMode ? '$$' : '\\]'
      let formula = trimmed.slice(2)
      if (formula.endsWith(closing)) {
        formula = formula.slice(0, -2)
        index += 1
      } else {
        const formulaLines = [formula]
        index += 1
        while (index < lines.length && !lines[index].trim().endsWith(closing)) {
          formulaLines.push(lines[index])
          index += 1
        }
        if (index < lines.length) {
          formulaLines.push(lines[index].trim().slice(0, -2))
          index += 1
        }
        formula = formulaLines.join(' ')
      }
      blocks.push(renderLatex(formula, true))
      continue
    }

    if (trimmed.startsWith('```')) {
      flushParagraph()
      const language = trimmed.slice(3).replace(/[^A-Za-z0-9_-]/g, '')
      const code = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(`<pre class="md-code"><code${language ? ` data-language="${escapeHtml(language)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    if (index + 1 < lines.length && line.includes('|') && isTableSeparator(lines[index + 1])) {
      flushParagraph()
      const rows = [line, lines[index + 1]]
      index += 2
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(lines[index])
        index += 1
      }
      blocks.push(renderTable(rows))
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      const level = Math.min(4, heading[1].length + 1)
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      index += 1
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph()
      const rows = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        rows.push(lines[index])
        index += 1
      }
      blocks.push(renderList(rows, false))
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph()
      const rows = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        rows.push(lines[index])
        index += 1
      }
      blocks.push(renderList(rows, true))
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph()
      const quote = []
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(`<blockquote>${inlineMarkdown(quote.join('\n')).replace(/\n/g, '<br>')}</blockquote>`)
      continue
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph()
      blocks.push('<hr>')
      index += 1
      continue
    }

    paragraph.push(line)
    index += 1
  }

  flushParagraph()
  return blocks.join('')
}
