/**
 * Deterministic labelling for tool calls and tool spans.
 *
 * Everything here is a heuristic over tool names and inputs — no network, no model.
 * `SpanLabelProvider` is the seam where AI-generated intent labels plug in later
 * without changing derivation or rendering.
 */

import { formatCount } from './formatters.js'
import type { ToolCall, ToolSpan } from './spanTypes.js'

/** Longest single-line label we will render before truncating. */
export const LABEL_MAX_CHARS = 120

/**
 * Optional source of AI intent labels, consulted once per span during derivation.
 * Implementations must be synchronous — resolve asynchronously and re-derive.
 */
export interface SpanLabelProvider {
  labelFor(span: ToolSpan): string | undefined
}

/** Collapse whitespace and clip to a single readable line. */
export function truncateLabel(value: string, max: number = LABEL_MAX_CHARS): string {
  const flattened = value.replace(/\s+/g, ' ').trim()
  return flattened.length <= max ? flattened : `${flattened.slice(0, max - 1)}…`
}

/** Strip an `mcp__<server>__<tool>` prefix; returns the server when there was one. */
export function splitMcpToolName(toolName: string): { server: string | null; tool: string } {
  const match = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(toolName)
  if (!match) return { server: null, tool: toolName }
  return { server: match[1], tool: match[2] }
}

function stringInput(input: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/** Everything after the last slash. */
export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index === -1 ? trimmed : trimmed.slice(index + 1)
}

/** Everything up to and including the last slash, or '' when there is none. */
export function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

/**
 * One-line description of a call: the command, the file, the pattern — whatever
 * actually identifies this invocation to a human scanning the list.
 */
export function describeToolCall(toolName: string, input: Record<string, unknown> | null): string {
  if (!input) return ''
  const { tool } = splitMcpToolName(toolName)
  const name = tool.toLowerCase()

  if (name === 'bash' || name === 'shell') {
    return truncateLabel(stringInput(input, 'command') ?? '')
  }

  if (name === 'read' || name === 'edit' || name === 'write' || name === 'multiedit') {
    return truncateLabel(stringInput(input, 'file_path', 'filePath', 'path') ?? '')
  }

  if (name === 'notebookedit') {
    return truncateLabel(stringInput(input, 'notebook_path', 'notebookPath') ?? '')
  }

  if (name === 'str_replace_editor') {
    const command = stringInput(input, 'command') ?? ''
    const path = stringInput(input, 'path') ?? ''
    if (command && path) return truncateLabel(`${command}: ${path}`)
    return truncateLabel(path || command)
  }

  if (name === 'grep' || name === 'glob') {
    const pattern = stringInput(input, 'pattern') ?? ''
    const path = stringInput(input, 'path', 'glob')
    return truncateLabel(path ? `${pattern} in ${path}` : pattern)
  }

  if (name === 'task' || name === 'agent') {
    return truncateLabel(stringInput(input, 'description', 'prompt') ?? '')
  }

  if (name === 'webfetch' || name === 'websearch') {
    return truncateLabel(stringInput(input, 'url', 'query', 'prompt') ?? '')
  }

  if (name === 'todowrite') {
    const todos = Array.isArray(input.todos) ? input.todos : []
    const done = todos.filter(
      todo =>
        typeof todo === 'object' &&
        todo !== null &&
        (todo as Record<string, unknown>).status === 'completed'
    ).length
    return `${todos.length} todos · ${done} done`
  }

  // Fallback: the first string-valued key is usually the interesting one.
  const fallback = Object.values(input).find(
    value => typeof value === 'string' && value.trim().length > 0
  )
  return typeof fallback === 'string' ? truncateLabel(fallback) : ''
}

/** Tool name counts, sorted by count desc then name asc so ties are deterministic. */
export function buildHistogram(calls: ToolCall[]): Array<{ toolName: string; count: number }> {
  const counts = new Map<string, number>()
  for (const call of calls) {
    counts.set(call.toolName, (counts.get(call.toolName) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([toolName, count]) => ({ toolName, count }))
    .sort((a, b) => b.count - a.count || a.toolName.localeCompare(b.toolName))
}

/** The deepest directory shared by every path, or '' when there isn't one. */
function commonDirectory(paths: string[]): string {
  if (paths.length === 0) return ''
  const split = paths.map(path => dirname(path).split('/').filter(Boolean))
  const [first, ...rest] = split
  const shared: string[] = []
  for (let i = 0; i < first.length; i++) {
    if (rest.every(parts => parts[i] === first[i])) shared.push(first[i])
    else break
  }
  return shared.join('/')
}

const EDIT_TOOLS = new Set(['edit', 'write', 'multiedit', 'notebookedit', 'str_replace_editor'])
const EXPLORE_TOOLS = new Set(['read', 'grep', 'glob'])
const AGENT_TOOLS = new Set(['task', 'agent'])

function matches(calls: ToolCall[], names: Set<string>): number {
  return calls.filter(call => names.has(splitMcpToolName(call.toolName).tool.toLowerCase())).length
}

/**
 * A short phrase describing what a whole span did, e.g. `12 Bash commands` or
 * `Read 6 files in src/ui/components`.
 */
export function deriveToolSpanLabel(calls: ToolCall[]): string {
  if (calls.length === 0) return 'No tool calls'
  const histogram = buildHistogram(calls)
  const errorCount = calls.filter(call => call.isError).length
  const suffix = errorCount > 0 ? ` (${formatCount(errorCount)} failed)` : ''
  const [dominant] = histogram

  // 1. Every call is the same tool.
  if (histogram.length === 1) {
    const { tool } = splitMcpToolName(dominant.toolName)
    const lower = tool.toLowerCase()
    if (lower === 'bash' || lower === 'shell') {
      return `${formatCount(calls.length)} ${tool} command${calls.length === 1 ? '' : 's'}${suffix}`
    }
    const paths = calls.map(call => call.label).filter(label => label.includes('/'))
    if (paths.length === calls.length) {
      const shared = commonDirectory(paths)
      if (shared) {
        return `${tool} ${formatCount(calls.length)} file${calls.length === 1 ? '' : 's'} in ${shared}${suffix}`
      }
    }
    return `${formatCount(calls.length)} ${tool} call${calls.length === 1 ? '' : 's'}${suffix}`
  }

  // 2. One tool clearly dominates.
  if (dominant.count / calls.length >= 0.6) {
    const others = calls.length - dominant.count
    const { tool } = splitMcpToolName(dominant.toolName)
    return `${tool} ×${dominant.count} and ${formatCount(others)} other${others === 1 ? '' : 's'}${suffix}`
  }

  // 3. A verb for the mix.
  if (matches(calls, AGENT_TOOLS) > 0) {
    const agents = matches(calls, AGENT_TOOLS)
    return `Ran ${formatCount(agents)} subagent${agents === 1 ? '' : 's'} and ${formatCount(calls.length - agents)} more${suffix}`
  }
  if (matches(calls, EDIT_TOOLS) > 0) {
    const edits = matches(calls, EDIT_TOOLS)
    return `Edited ${formatCount(edits)} file${edits === 1 ? '' : 's'}${suffix}`
  }
  if (matches(calls, EXPLORE_TOOLS) === calls.length) {
    return `Explored ${formatCount(calls.length)} location${calls.length === 1 ? '' : 's'}${suffix}`
  }

  // 4. Nothing distinctive.
  return `${formatCount(calls.length)} tool call${calls.length === 1 ? '' : 's'}${suffix}`
}

/**
 * Stable cache key for a span's identity, over tool names and tool_use ids.
 *
 * Shipped now so a future AI label cache has keys that survive re-derivation, order
 * flips and unrelated edits elsewhere in the session.
 */
export function hashSpan(span: ToolSpan): string {
  const parts = span.calls.map(call => `${call.toolName}:${call.toolUseId ?? call.id}`)
  const payload = parts.join('|')
  // FNV-1a, 32-bit. Cheap, dependency-free and stable across runtimes.
  let hash = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${span.calls.length}-${hash.toString(16).padStart(8, '0')}`
}
