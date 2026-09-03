import type {
  ContentBlock,
  MessageType,
  ParsedMessage,
  ParsedSession,
  ToolResultContent,
  ToolUseContent,
} from '@guidemode/types'
import { isStructuredMessageContent } from '@guidemode/types'
import { stripSystemReminders } from '../../utils/system-reminders.js'
import {
  type CondenseOptions,
  type CondensedTranscript,
  DEFAULT_CONVERSATIONAL_TOOLS,
  DEFAULT_HEAD_CHARS,
  DEFAULT_MAX_CHARS,
  DEFAULT_TAIL_CHARS,
  type ToolUsageSummary,
} from './types.js'

/**
 * Message types the person authored. All of these are kept: they are cheap, and they are
 * the only direct evidence of intent and steering.
 *
 * The canonical parser splits user turns across four types, so filtering on `'user'`
 * alone silently discards every interruption and slash command.
 */
const USER_AUTHORED_TYPES: ReadonlySet<MessageType> = new Set([
  'user',
  'user_input', // legacy alias still permitted by the MessageType union
  'interruption',
  'command',
  'compact',
])

/** Types that are pure machinery and never rendered as their own line. */
const TOOL_TYPES: ReadonlySet<MessageType> = new Set(['tool_use', 'tool_result'])

/** Types that carry no conversation and are skipped outright. */
const IGNORED_TYPES: ReadonlySet<MessageType> = new Set(['meta', 'system'])

/**
 * Tools whose RESULT is the person's actual reply rather than an acknowledgement.
 *
 * A subset of the conversational allowlist: `TodoWrite` results are boilerplate
 * ("Todos have been modified successfully..."), so rendering them as a user turn would
 * fabricate input the person never gave.
 */
const USER_REPLY_TOOLS: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode'])

/**
 * Extract plain text from a message's content, whatever shape it arrived in.
 */
function extractText(content: ParsedMessage['content']): string {
  if (typeof content === 'string') {
    return content
  }
  if (isStructuredMessageContent(content)) {
    return content.text ?? ''
  }
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter((block): block is ContentBlock & { text: string } => block.type === 'text')
      .map(block => block.text)
      .join(' ')
  }
  return ''
}

/** Pull the tool use out of a message, handling both canonical and array content. */
function extractToolUses(content: ParsedMessage['content']): ToolUseContent[] {
  if (isStructuredMessageContent(content)) {
    return content.toolUse ? [content.toolUse] : []
  }
  if (Array.isArray(content)) {
    return (content as ContentBlock[]).filter(
      (block): block is ToolUseContent => block.type === 'tool_use'
    )
  }
  return []
}

/** Pull the tool result out of a message, handling both canonical and array content. */
function extractToolResults(content: ParsedMessage['content']): ToolResultContent[] {
  if (isStructuredMessageContent(content)) {
    return content.toolResult ? [content.toolResult] : []
  }
  if (Array.isArray(content)) {
    return (content as ContentBlock[]).filter(
      (block): block is ToolResultContent => block.type === 'tool_result'
    )
  }
  return []
}

/**
 * Truncate keeping the head AND the tail.
 *
 * Head-only truncation loses the conclusion of a message, which is usually where the
 * outcome is stated.
 */
function headTailTruncate(text: string, headChars: number, tailChars: number): string {
  if (text.length <= headChars + tailChars) {
    return text
  }
  const omitted = text.length - headChars - tailChars
  return `${text.slice(0, headChars)}\n... [${omitted} chars omitted] ...\n${text.slice(-tailChars)}`
}

/** Render a tool result's content as a short string for conversational tools. */
function renderToolResultContent(result: ToolResultContent, limit: number): string {
  const raw =
    typeof result.content === 'string' ? result.content : JSON.stringify(result.content ?? '')
  const clean = stripSystemReminders(raw)
  return clean.length > limit ? `${clean.slice(0, limit)}... [truncated]` : clean
}

/**
 * Render a conversational tool call (a plan, a question, a todo list) as prose.
 *
 * Plans are reproduced VERBATIM and never truncated. They are the single most
 * information-dense artefact in a session - the agreed statement of intent and scope - so
 * they are exempt from the character budget rather than competing with it. Real plans run
 * to 11-26k characters, which is why they get their own allowance (see `fitToBudget`).
 */
function renderConversationalTool(
  tool: ToolUseContent,
  headChars: number,
  tailChars: number
): string {
  const input = tool.input ?? {}

  if (tool.name === 'ExitPlanMode' && typeof input.plan === 'string') {
    return `[Plan presented to the user]\n${input.plan}`
  }

  if (tool.name === 'AskUserQuestion' && Array.isArray(input.questions)) {
    const rendered = (input.questions as Array<Record<string, unknown>>)
      .map(q => {
        const options = Array.isArray(q.options)
          ? (q.options as Array<Record<string, unknown>>)
              .map(o => String(o.label ?? ''))
              .filter(Boolean)
              .join(' | ')
          : ''
        return `Q: ${String(q.question ?? '')}${options ? `\n   options: ${options}` : ''}`
      })
      .join('\n')
    return `[Question asked of the user]\n${headTailTruncate(rendered, headChars, tailChars)}`
  }

  if (tool.name === 'TodoWrite' && Array.isArray(input.todos)) {
    const todos = (input.todos as Array<Record<string, unknown>>)
      .map(t => `- [${String(t.status ?? '')}] ${String(t.content ?? '')}`)
      .join('\n')
    return `[Todo list]\n${headTailTruncate(todos, headChars, tailChars)}`
  }

  // Allowlisted but unrecognised shape - fall back to compact JSON.
  const json = JSON.stringify(input)
  return `[${tool.name}]\n${json.length > 1000 ? `${json.slice(0, 1000)}... [truncated]` : json}`
}

/**
 * Per-line overhead added by rendering: the `Step N [ISO timestamp] - ` prefix plus the
 * blank line between entries. Budgeting without this overshoots by several percent on
 * sessions with many short lines.
 */
const LINE_OVERHEAD = 48

/** A line of rendered output, tagged with the original message index it came from. */
interface RenderedLine {
  index: number
  /** Last original index this line accounts for; equals `index` for single-message lines. */
  endIndex: number
  text: string
  /** User-authored lines are never elided to fit the budget. */
  protected: boolean
  /** Number of source messages this line stands in for (>1 for collapsed tool runs). */
  covers: number
  /** Verbatim plan text: exempt from the budget and never truncated. */
  isPlan?: boolean
}

/**
 * Condense a parsed session into a conversation-only transcript for an LLM prompt.
 *
 * Keeps every user-authored turn, keeps assistant prose (head+tail truncated), collapses
 * runs of tool calls into a single count marker, and preserves the payloads of tools that
 * are themselves conversation (plans, questions, todos).
 *
 * Every rendered line is labelled with its ORIGINAL 1-based message index. Indices are
 * therefore sparse; consumers that map model output back onto messages (phase analysis)
 * depend on this.
 */
export function condenseSession(
  session: ParsedSession,
  options: CondenseOptions
): CondensedTranscript {
  const {
    userName,
    maxChars = DEFAULT_MAX_CHARS,
    headChars = DEFAULT_HEAD_CHARS,
    tailChars = DEFAULT_TAIL_CHARS,
    includeToolSummary = true,
    keepToolPayloadsFor = DEFAULT_CONVERSATIONAL_TOOLS,
  } = options

  const conversationalTools = new Set(keepToolPayloadsFor)
  const messages = session.messages ?? []

  // Tool usage is tallied across the WHOLE session, independent of what gets rendered,
  // so callers get true counts even when the middle is elided.
  const usageByTool = new Map<string, ToolUsageSummary>()
  const toolNameById = new Map<string, string>()
  let toolErrorCount = 0

  for (const msg of messages) {
    for (const tool of extractToolUses(msg.content)) {
      if (!tool.name) continue
      toolNameById.set(tool.id, tool.name)
      const entry = usageByTool.get(tool.name) ?? { name: tool.name, count: 0, errorCount: 0 }
      entry.count += 1
      usageByTool.set(tool.name, entry)
    }
  }
  for (const msg of messages) {
    for (const result of extractToolResults(msg.content)) {
      if (!result.is_error) continue
      toolErrorCount += 1
      const name = toolNameById.get(result.tool_use_id)
      if (!name) continue
      const entry = usageByTool.get(name) ?? { name, count: 0, errorCount: 0 }
      entry.errorCount += 1
      usageByTool.set(name, entry)
    }
  }

  const lines: RenderedLine[] = []
  let userTurnCount = 0
  let interruptionCount = 0

  // Buffer of consecutive tool calls awaiting collapse into one marker.
  let pendingTools: {
    names: string[]
    errors: number
    firstIndex: number
    lastIndex: number
    count: number
  } | null = null

  const flushTools = (): void => {
    // A run with no named tools (e.g. an orphan tool_result) carries no information.
    if (!pendingTools || !includeToolSummary || pendingTools.names.length === 0) {
      pendingTools = null
      return
    }
    const tally = new Map<string, number>()
    for (const name of pendingTools.names) {
      tally.set(name, (tally.get(name) ?? 0) + 1)
    }
    const breakdown = [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => (n > 1 ? `${name} x${n}` : name))
      .join(', ')
    const errors = pendingTools.errors > 0 ? ` - ${pendingTools.errors} error(s)` : ''
    const label = pendingTools.names.length === 1 ? 'tool call' : 'tool calls'
    lines.push({
      index: pendingTools.firstIndex,
      endIndex: pendingTools.lastIndex,
      text: `[${pendingTools.names.length} ${label}: ${breakdown}${errors}]`,
      protected: false,
      covers: pendingTools.count,
    })
    pendingTools = null
  }

  messages.forEach((msg, i) => {
    const stepNum = i + 1

    if (IGNORED_TYPES.has(msg.type)) {
      return
    }

    // Conversational tool payloads are promoted out of the machinery and rendered as prose.
    const toolUses = extractToolUses(msg.content)
    const conversational = toolUses.filter(t => conversationalTools.has(t.name))
    if (conversational.length > 0) {
      flushTools()
      for (const tool of conversational) {
        lines.push({
          index: stepNum,
          endIndex: stepNum,
          text: `Assistant:\n${renderConversationalTool(tool, headChars, tailChars)}`,
          protected: true,
          covers: 1,
          isPlan: tool.name === 'ExitPlanMode',
        })
      }
      // Any non-conversational tool uses in the same message still count as machinery.
      const rest = toolUses.filter(t => !conversationalTools.has(t.name))
      if (rest.length > 0) {
        const buffer = pendingTools ?? {
          names: [],
          errors: 0,
          firstIndex: stepNum,
          lastIndex: stepNum,
          count: 0,
        }
        buffer.names.push(...rest.map(t => t.name))
        buffer.count += 1
        buffer.lastIndex = stepNum
        pendingTools = buffer
      }
      return
    }

    if (TOOL_TYPES.has(msg.type)) {
      const results = extractToolResults(msg.content)
      const errors = results.filter(r => r.is_error).length
      const buffer = pendingTools ?? {
        names: [],
        errors: 0,
        firstIndex: stepNum,
        lastIndex: stepNum,
        count: 0,
      }
      buffer.names.push(...toolUses.map(t => t.name).filter(Boolean))
      buffer.errors += errors
      buffer.count += 1
      buffer.lastIndex = stepNum
      pendingTools = buffer

      // Only promote results that are genuinely the person's reply (see USER_REPLY_TOOLS).
      for (const result of results) {
        const name = toolNameById.get(result.tool_use_id)
        if (name && conversationalTools.has(name) && USER_REPLY_TOOLS.has(name)) {
          const rendered = renderToolResultContent(result, 1_000)
          if (rendered) {
            flushTools()
            lines.push({
              index: stepNum,
              endIndex: stepNum,
              text: `${userName} (answer):\n${rendered}`,
              protected: true,
              covers: 1,
            })
          }
        }
      }
      return
    }

    const text = stripSystemReminders(extractText(msg.content)).trim()
    if (!text) {
      return
    }

    flushTools()

    if (USER_AUTHORED_TYPES.has(msg.type)) {
      userTurnCount += 1
      if (msg.type === 'interruption') interruptionCount += 1
      const suffix =
        msg.type === 'interruption'
          ? ' (interruption)'
          : msg.type === 'command'
            ? ' (command)'
            : msg.type === 'compact'
              ? ' (context compaction)'
              : ''
      lines.push({
        index: stepNum,
        endIndex: stepNum,
        text: `${userName}${suffix}:\n${headTailTruncate(text, headChars, tailChars)}`,
        protected: true,
        covers: 1,
      })
      return
    }

    lines.push({
      index: stepNum,
      endIndex: stepNum,
      text: `Assistant:\n${headTailTruncate(text, headChars, tailChars)}`,
      protected: false,
      covers: 1,
    })
  })

  flushTools()

  // Plans are exempt from the ceiling: it applies to everything else, and plan text is
  // added on top. A session with a 26k-character plan therefore keeps the plan in full
  // AND a complete budget of surrounding conversation.
  const planChars = lines.reduce(
    (sum, line) => (line.isPlan ? sum + line.text.length + LINE_OVERHEAD : sum),
    0
  )
  const effectiveMax = maxChars + planChars
  const { kept, truncated } = fitToBudget(lines, effectiveMax)

  let rendered = renderLines(kept, messages)
  let hardTruncated = false

  // The estimate above can still overshoot (gap markers, long timestamps). The budget is
  // a hard ceiling because it is what keeps prompt cost bounded, so enforce it directly.
  if (rendered.length > effectiveMax) {
    rendered = `${rendered.slice(0, effectiveMax - 40)}\n\n[... transcript truncated ...]`
    hardTruncated = true
  }

  const coveredByLines = kept.reduce((sum, line) => sum + line.covers, 0)

  return {
    text: rendered,
    includedIndices: kept.map(line => line.index),
    userTurnCount,
    interruptionCount,
    totalMessages: messages.length,
    droppedMessages: Math.max(0, messages.length - coveredByLines),
    toolUsage: [...usageByTool.values()].sort((a, b) => b.count - a.count),
    uniqueToolCount: usageByTool.size,
    toolErrorCount,
    estimatedChars: rendered.length,
    planChars,
    truncated: truncated || hardTruncated,
  }
}

/**
 * Drop lines from the MIDDLE until the transcript fits the budget.
 *
 * User-authored turns and conversational tool payloads are protected and never dropped;
 * only assistant prose and tool markers are. Dropping from the middle rather than the tail
 * is deliberate - the ending is where completion is stated, and truncating it is what
 * makes "was the work finished?" unanswerable.
 */
function fitToBudget(
  lines: RenderedLine[],
  maxChars: number
): { kept: RenderedLine[]; truncated: boolean } {
  const total = lines.reduce((sum, line) => sum + line.text.length + LINE_OVERHEAD, 0)
  if (total <= maxChars) {
    return { kept: lines, truncated: false }
  }

  const droppable: number[] = []
  lines.forEach((line, i) => {
    if (!line.protected) droppable.push(i)
  })

  // Drop from the centre outwards.
  const centre = lines.length / 2
  droppable.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))

  const dropped = new Set<number>()
  let size = total
  for (const i of droppable) {
    if (size <= maxChars) break
    dropped.add(i)
    size -= lines[i].text.length + LINE_OVERHEAD
  }

  const kept = lines.filter((_, i) => !dropped.has(i))

  // Still over budget with only protected lines left: hard-trim their text.
  if (size > maxChars && kept.length > 0) {
    const perLine = Math.max(200, Math.floor(maxChars / kept.length) - LINE_OVERHEAD)
    for (const line of kept) {
      if (line.text.length > perLine) {
        line.text = `${line.text.slice(0, perLine)}... [truncated]`
      }
    }
  }

  return { kept, truncated: dropped.size > 0 }
}

/**
 * Render retained lines with their ORIGINAL step numbers, marking every gap explicitly so
 * the model knows the numbering is sparse rather than assuming messages are contiguous.
 */
function renderLines(lines: RenderedLine[], messages: ParsedMessage[]): string {
  const parts: string[] = []
  let previousIndex = 0

  for (const line of lines) {
    const gap = line.index - previousIndex - 1
    if (gap > 0 && previousIndex > 0) {
      parts.push(`[... ${gap} message(s) omitted ...]`)
    }
    const msg = messages[line.index - 1]
    const timestamp = msg?.timestamp ? new Date(msg.timestamp).toISOString() : 'unknown'
    parts.push(`Step ${line.index} [${timestamp}] - ${line.text}`)
    previousIndex = Math.max(line.index, line.endIndex)
  }

  return parts.join('\n\n')
}
