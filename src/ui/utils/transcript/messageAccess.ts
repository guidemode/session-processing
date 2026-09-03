/**
 * Standalone accessors over `BaseSessionMessage`.
 *
 * The equivalents on `BaseMessageProcessor` are `protected`, and span derivation is a
 * free function by design (pure, testable, no class). These mirror that logic exactly —
 * see `BaseMessageProcessor.extractToolUseId` / `extractToolResultId`.
 */

import { isStructuredMessageContent } from '@guidemode/types'
import type { BaseSessionMessage } from '../sessionTypes.js'
import type { TimelineMessage } from '../timelineTypes.js'

/**
 * Tool result payloads that mean failure without setting `is_error`.
 *
 * Matched only at the START of the result. These phrases are the whole message when a
 * call really failed, but they also appear inside ordinary content that quotes them —
 * an approved plan discussing error handling would otherwise be counted as a failure,
 * inflating every error count downstream.
 */
const ERROR_TEXT_PREFIXES = [
  'error:',
  '<tool_use_error>',
  "the user doesn't want to proceed with this tool use",
  'the user rejected',
]

export function getToolUseId(message: BaseSessionMessage): string | null {
  if (isStructuredMessageContent(message.content) && message.content.toolUse) {
    return message.content.toolUse.id
  }
  return message.content?.id || message.metadata?.toolUseId || message.id.split('-tool-')[1] || null
}

export function getToolResultId(message: BaseSessionMessage): string | null {
  if (isStructuredMessageContent(message.content) && message.content.toolResult) {
    return message.content.toolResult.tool_use_id
  }
  return message.linkedTo || message.content?.tool_use_id || null
}

export function getToolName(message: BaseSessionMessage): string {
  if (isStructuredMessageContent(message.content) && message.content.toolUse) {
    return message.content.toolUse.name
  }
  if (typeof message.content?.name === 'string') return message.content.name
  if (typeof message.metadata?.toolName === 'string') return message.metadata.toolName
  return 'unknown'
}

export function getToolInput(message: BaseSessionMessage): Record<string, unknown> | null {
  if (isStructuredMessageContent(message.content) && message.content.toolUse) {
    return message.content.toolUse.input ?? null
  }
  const input = message.content?.input
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : null
}

export function getToolResultContent(message: BaseSessionMessage): unknown {
  if (isStructuredMessageContent(message.content) && message.content.toolResult) {
    return message.content.toolResult.content
  }
  return message.content?.content ?? message.content ?? null
}

/**
 * Whether a tool result represents a failure.
 *
 * `is_error` is authoritative when present, but several providers signal failure only
 * in the payload text — including a user rejecting the call outright.
 */
export function isErrorResult(message: BaseSessionMessage): boolean {
  if (isStructuredMessageContent(message.content) && message.content.toolResult) {
    if (message.content.toolResult.is_error === true) return true
  }
  if (message.content?.is_error === true) return true

  const content = getToolResultContent(message)
  const text = typeof content === 'string' ? content.trimStart().toLowerCase() : ''
  if (!text) return false
  return ERROR_TEXT_PREFIXES.some(prefix => text.startsWith(prefix))
}

/** Stringify a result payload once, for character counting and previews. */
export function stringifyResult(content: unknown): string {
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content) ?? ''
  } catch {
    return ''
  }
}

/** Milliseconds since epoch, or `null` when the timestamp is missing or malformed. */
export function parseTimestamp(timestamp: string | undefined): number | null {
  if (!timestamp) return null
  const parsed = Date.parse(timestamp)
  return Number.isNaN(parsed) ? null : parsed
}

/** Sidechain messages come from subagents rather than the main thread. */
export function isSidechain(message: TimelineMessage): boolean {
  return message.originalMessage.metadata?.isSidechain === true
}
