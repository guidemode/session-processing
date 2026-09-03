/**
 * Lane classification — which visual lane a message belongs to.
 *
 * Only `tools` and `meta` coalesce into multi-message spans; every other lane is
 * always a span of exactly one message.
 */

import type { TimelineMessage } from '../timelineTypes.js'
import { getToolName } from './messageAccess.js'
import type { EventKind } from './spanTypes.js'

export type Lane = 'human' | 'assistant' | 'tools' | 'meta' | 'event'

/** Tools that are really conversation, not work, and so earn an event row. */
export const CONVERSATIONAL_TOOLS = new Set(['ExitPlanMode', 'AskUserQuestion'])

const META_TYPES = new Set(['meta', 'system', 'command_output'])
const HUMAN_TYPES = new Set(['user', 'user_input', 'command'])

/** The event kind for a message, or `null` when it is not a notable event. */
export function eventKindOf(message: TimelineMessage): EventKind | null {
  const { type, metadata } = message.originalMessage
  if (type === 'interruption') return 'interruption'
  if (type === 'compact') return 'compact'
  if (type === 'tool_use') {
    const toolName = getToolName(message.originalMessage)
    if (toolName === 'ExitPlanMode') return 'plan'
    if (toolName === 'AskUserQuestion') return 'question'
  }
  // Claude emits a rolling conversation summary as its own record.
  if (metadata?.providerMetadata?.claude_type === 'summary') return 'summary'
  return null
}

export function laneOf(message: TimelineMessage): Lane {
  if (eventKindOf(message) !== null) return 'event'

  const { type, metadata } = message.originalMessage
  if (type === 'tool_use' || type === 'tool_result') return 'tools'
  if (META_TYPES.has(type) || metadata?.isMeta === true) return 'meta'
  if (message.role === 'user' && HUMAN_TYPES.has(type)) return 'human'
  return 'assistant'
}

/** Human-readable kind for a collapsed metadata record. */
export function metaRecordKind(message: TimelineMessage): string {
  const claudeType = message.originalMessage.metadata?.providerMetadata?.claude_type
  if (claudeType === 'file-history-snapshot') return 'file snapshot'
  if (claudeType === 'summary') return 'summary'
  if (typeof claudeType === 'string' && claudeType) return claudeType.replace(/[-_]/g, ' ')

  const { type } = message.originalMessage
  if (type === 'command_output') return 'command output'
  if (type === 'system') return 'system'
  return 'meta'
}
