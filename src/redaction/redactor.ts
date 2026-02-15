import { type RedactionPattern, patterns } from './patterns.js'

export interface RedactionStats {
  totalRedactions: number
  byCategory: Record<string, number>
  linesProcessed: number
  linesWithRedactions: number
  malformedLines: number
}

export interface RedactedContent {
  content: string
  stats: RedactionStats
}

interface RedactionMatch {
  start: number
  end: number
  category: string
}

interface CompiledPattern {
  regex: RegExp
  name: string
  captureGroup: number | null
  replacement: string | null
}

let compiledPatterns: CompiledPattern[] | null = null

function getCompiledPatterns(): CompiledPattern[] {
  if (compiledPatterns) return compiledPatterns

  compiledPatterns = patterns.map((p: RedactionPattern) => {
    let flags = 'g'
    if (p.caseInsensitive) flags += 'i'
    if (p.multiline) flags += 'm'
    return {
      regex: new RegExp(p.pattern, flags),
      name: p.name,
      captureGroup: p.captureGroup,
      replacement: p.replacement,
    }
  })
  return compiledPatterns
}

function mergeAndDedup(matches: RedactionMatch[]): RedactionMatch[] {
  if (matches.length === 0) return []
  const sorted = [...matches].sort((a, b) => a.start - b.start)

  const result: RedactionMatch[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = result[result.length - 1]
    if (current.start < last.end) {
      if (current.end > last.end) {
        last.end = current.end
      }
    } else {
      result.push(current)
    }
  }
  return result
}

function applyReplacements(
  text: string,
  matches: RedactionMatch[]
): { text: string; counts: Record<string, number> } {
  if (matches.length === 0) return { text, counts: {} }

  const counts: Record<string, number> = {}
  const sorted = [...matches].sort((a, b) => b.start - a.start)

  let result = text
  for (const match of sorted) {
    const replacement = match.category === 'HOME_DIR' ? '~' : `[REDACTED:${match.category}]`
    result = result.slice(0, match.start) + replacement + result.slice(match.end)
    counts[match.category] = (counts[match.category] || 0) + 1
  }
  return { text: result, counts }
}

function detectPatterns(text: string): RedactionMatch[] {
  const matches: RedactionMatch[] = []
  const compiled = getCompiledPatterns()

  for (const { regex, name, captureGroup, replacement } of compiled) {
    regex.lastIndex = 0
    let match = regex.exec(text)
    while (match !== null) {
      if (captureGroup !== null && match[captureGroup] !== undefined) {
        const groupValue = match[captureGroup]
        const groupStart = match.index + match[0].indexOf(groupValue)
        matches.push({
          start: groupStart,
          end: groupStart + groupValue.length,
          category: name,
        })
      } else {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          category: name,
        })
      }
      // For patterns with custom replacements, record the replacement category name
      // (replacement is applied by applyReplacements via the category name)
      void replacement
      match = regex.exec(text)
    }
  }
  return matches
}

/** Redact all secrets and PII from a text string */
export function redactText(
  text: string,
  _homeDir?: string
): { text: string; counts: Record<string, number> } {
  if (!text || text.length === 0) return { text, counts: {} }

  const matches = detectPatterns(text)
  const deduped = mergeAndDedup(matches)
  return applyReplacements(text, deduped)
}

// biome-ignore lint/suspicious/noExplicitAny: JSONL content blocks have variable structure
function isContentArray(value: any): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === 'object'
}

function redactContentBlock(block: Record<string, unknown>): Record<string, number> {
  const allCounts: Record<string, number> = {}

  const mergeCounts = (counts: Record<string, number>): void => {
    for (const [k, v] of Object.entries(counts)) {
      allCounts[k] = (allCounts[k] || 0) + v
    }
  }

  for (const field of ['text', 'thinking']) {
    if (typeof block[field] === 'string') {
      const { text, counts } = redactText(block[field] as string)
      block[field] = text
      mergeCounts(counts)
    }
  }

  if (block.type === 'tool_result') {
    if (typeof block.content === 'string') {
      const { text, counts } = redactText(block.content as string)
      block.content = text
      mergeCounts(counts)
    } else if (isContentArray(block.content)) {
      for (const sub of block.content as Array<Record<string, unknown>>) {
        const counts = redactContentBlock(sub)
        mergeCounts(counts)
      }
    }
  }

  if (block.type === 'tool_use' && block.input && typeof block.input === 'object') {
    const counts = redactObjectValues(block.input as Record<string, unknown>)
    mergeCounts(counts)
  }

  return allCounts
}

function redactObjectValues(obj: Record<string, unknown>): Record<string, number> {
  const allCounts: Record<string, number> = {}
  const mergeCounts = (counts: Record<string, number>): void => {
    for (const [k, v] of Object.entries(counts)) {
      allCounts[k] = (allCounts[k] || 0) + v
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const { text, counts } = redactText(value)
      obj[key] = text
      mergeCounts(counts)
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'string') {
          const { text, counts } = redactText(value[i])
          value[i] = text
          mergeCounts(counts)
        } else if (value[i] && typeof value[i] === 'object') {
          const counts = redactObjectValues(value[i] as Record<string, unknown>)
          mergeCounts(counts)
        }
      }
    } else if (value && typeof value === 'object') {
      const counts = redactObjectValues(value as Record<string, unknown>)
      mergeCounts(counts)
    }
  }
  return allCounts
}

/** Replace home directory paths in a string */
export function replaceHomeDir(text: string, homeDir: string): string {
  if (!homeDir || !text.includes(homeDir)) return text
  return text.split(homeDir).join('~')
}

/** Redact secrets and PII in a single canonical JSONL line */
export function redactCanonicalMessage(
  jsonLine: string,
  homeDir?: string
): { line: string; counts: Record<string, number> } {
  const allCounts: Record<string, number> = {}
  const mergeCounts = (counts: Record<string, number>): void => {
    for (const [k, v] of Object.entries(counts)) {
      allCounts[k] = (allCounts[k] || 0) + v
    }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonLine)
  } catch {
    return { line: jsonLine, counts: {} }
  }

  // Redact cwd field
  if (typeof parsed.cwd === 'string' && homeDir) {
    const original = parsed.cwd as string
    parsed.cwd = replaceHomeDir(original, homeDir)
    if (parsed.cwd !== original) {
      allCounts.HOME_DIR = (allCounts.HOME_DIR || 0) + 1
    }
  }

  // Redact message.content
  const message = parsed.message as Record<string, unknown> | undefined
  if (message && typeof message === 'object') {
    if (typeof message.content === 'string') {
      const { text, counts } = redactText(message.content as string)
      message.content = text
      mergeCounts(counts)
    } else if (isContentArray(message.content)) {
      for (const block of message.content as Array<Record<string, unknown>>) {
        const counts = redactContentBlock(block)
        mergeCounts(counts)
      }
    }
  }

  return { line: JSON.stringify(parsed), counts: allCounts }
}

/** Redact all secrets and PII across all lines of a JSONL string */
export function redactJsonlContent(fileContent: string, homeDir?: string): RedactedContent {
  const lines = fileContent.split('\n')

  const stats: RedactionStats = {
    totalRedactions: 0,
    byCategory: {},
    linesProcessed: 0,
    linesWithRedactions: 0,
    malformedLines: 0,
  }

  const resultLines: string[] = []

  for (const line of lines) {
    if (line.trim() === '') {
      resultLines.push(line)
      continue
    }

    stats.linesProcessed++

    try {
      JSON.parse(line)
    } catch {
      stats.malformedLines++
      resultLines.push(line)
      continue
    }

    const { line: redactedLine, counts } = redactCanonicalMessage(line, homeDir)
    resultLines.push(redactedLine)

    const lineTotal = Object.values(counts).reduce((sum, n) => sum + n, 0)
    if (lineTotal > 0) {
      stats.linesWithRedactions++
      stats.totalRedactions += lineTotal
      for (const [category, count] of Object.entries(counts)) {
        stats.byCategory[category] = (stats.byCategory[category] || 0) + count
      }
    }
  }

  return {
    content: resultLines.join('\n'),
    stats,
  }
}
