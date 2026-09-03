/**
 * Building and aggregating individual tool calls.
 *
 * Split out of `deriveSpans` to keep that file focused on the run-boundary walk.
 */

import type { TimelineMessage } from '../timelineTypes.js'
import {
  getToolInput,
  getToolName,
  getToolResultContent,
  getToolResultId,
  getToolUseId,
  isErrorResult,
  isSidechain,
  parseTimestamp,
  stringifyResult,
} from './messageAccess.js'
import { buildHistogram, describeToolCall } from './spanLabels.js'
import type { ToolCall, ToolSpanStats } from './spanTypes.js'

/** Wall clock across a set of messages. `0` when no timestamp parses. */
export function elapsedAcross(messages: TimelineMessage[]): number {
  const times = messages
    .map(message => parseTimestamp(message.timestamp))
    .filter((value): value is number => value !== null)
  if (times.length === 0) return 0
  return Math.max(0, Math.max(...times) - Math.min(...times))
}

/**
 * Build one call row.
 *
 * `use` is null for an orphan result — a `tool_result` whose originating `tool_use`
 * appears nowhere in the session. It still gets a row rather than being dropped.
 */
export function buildToolCall(
  use: TimelineMessage | null,
  result: TimelineMessage | null,
  orphanResult: TimelineMessage | null
): ToolCall {
  const anchor = use ?? orphanResult
  if (!anchor) throw new Error('buildToolCall requires a use or an orphan result')

  const isOrphan = use === null
  const toolName = String(
    isOrphan
      ? (anchor.originalMessage.metadata?.toolName ?? 'unknown')
      : getToolName(anchor.originalMessage)
  )
  const input = isOrphan ? null : getToolInput(anchor.originalMessage)
  const resultMessage = result ?? orphanResult

  const resultContent = resultMessage ? getToolResultContent(resultMessage.originalMessage) : null
  const resultText = resultMessage ? stringifyResult(resultContent) : ''
  const isError = resultMessage ? isErrorResult(resultMessage.originalMessage) : false

  const startedMs = parseTimestamp(anchor.timestamp)
  const endedMs = resultMessage ? parseTimestamp(resultMessage.timestamp) : null
  const durationMs =
    startedMs !== null && endedMs !== null ? Math.max(0, endedMs - startedMs) : null

  const subagentType = typeof input?.subagent_type === 'string' ? input.subagent_type : undefined

  return {
    id: `call-${anchor.id}`,
    toolUseId: isOrphan
      ? getToolResultId(anchor.originalMessage)
      : getToolUseId(anchor.originalMessage),
    toolName,
    label: describeToolCall(toolName, input),
    input,
    inputChars: input ? stringifyResult(input).length : 0,
    result: resultMessage ? { content: resultContent, chars: resultText.length } : null,
    outputChars: resultText.length,
    status: resultMessage ? (isError ? 'error' : 'ok') : 'pending',
    isError,
    startedAt: anchor.timestamp,
    endedAt: resultMessage?.timestamp ?? null,
    durationMs,
    isSidechain: isSidechain(anchor),
    subagentType,
    useMessage: use,
    resultMessage,
  }
}

export function buildToolStats(calls: ToolCall[], members: TimelineMessage[]): ToolSpanStats {
  return {
    callCount: calls.length,
    resultCount: calls.filter(call => call.result !== null).length,
    errorCount: calls.filter(call => call.isError).length,
    pendingCount: calls.filter(call => call.status === 'pending').length,
    histogram: buildHistogram(calls),
    inputChars: calls.reduce((total, call) => total + call.inputChars, 0),
    outputChars: calls.reduce((total, call) => total + call.outputChars, 0),
    elapsedMs: elapsedAcross(members),
  }
}
