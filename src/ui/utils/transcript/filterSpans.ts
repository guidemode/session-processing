/**
 * Filtering, in three stages, in this order:
 *
 *   1. PREFILTER MESSAGES, then derive. The meta and thinking toggles run on messages
 *      *before* derivation. This matters: with meta hidden, a tool run interrupted only
 *      by metadata records must merge into ONE span, and only filter-then-derive gets
 *      that right.
 *   2. Derive (see `deriveSpans`).
 *   3. PROJECT, don't re-group. Tool-name and search filters narrow what is *shown*
 *      within spans, never the span boundaries — re-grouping would silently merge
 *      non-adjacent runs and make the counters lie.
 */

import type { TimelineMessage } from '../timelineTypes.js'
import { getToolName } from './messageAccess.js'
import type { TranscriptSpan } from './spanTypes.js'

export interface MessagePrefilterOptions {
  showMetaMessages: boolean
  showThinkingBlocks: boolean
}

/**
 * Whether a block would actually show the reader anything.
 *
 * The processor wraps a contentless structured envelope in a `json` block, so a bare
 * `content !== null` check (as the old transcript did) lets blank assistant turns
 * through as empty rows. Recurse for a non-blank string instead.
 */
function hasVisibleContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(hasVisibleContent)
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      // `type` is structural bookkeeping, never content.
      ([key, entry]) => key !== 'type' && hasVisibleContent(entry)
    )
  }
  return false
}

/** True when an assistant message has nothing worth a row. */
function isEmptyAssistant(message: TimelineMessage): boolean {
  if (message.role !== 'assistant') return false
  return !message.contentBlocks.some(block => hasVisibleContent(block.content))
}

/** Stage 1: drop messages entirely, so derivation sees the reduced session. */
export function prefilterMessages(
  messages: TimelineMessage[],
  { showMetaMessages, showThinkingBlocks }: MessagePrefilterOptions
): TimelineMessage[] {
  return messages.filter(message => {
    if (!showMetaMessages && message.originalMessage.type === 'meta') return false
    if (!showThinkingBlocks && message.originalMessage.metadata?.isThinking === true) return false
    return !isEmptyAssistant(message)
  })
}

export interface SpanProjectionOptions {
  /** `all` | `user-assistant` | `assistant-only` | `user-only` | a specific tool name. */
  messageFilter: string
  searchQuery: string
}

export interface ProjectedSpan {
  span: TranscriptSpan
  /** Open on render, because the user filtered or searched their way here. */
  autoExpand: boolean
  /** When set, only these calls are shown; the rest are behind "show all". */
  visibleCallIds: string[] | null
  /** Messages matching the search query, for highlighting. */
  matchedMessageIds: string[]
}

const ROLE_FILTERS = new Set(['user-assistant', 'assistant-only', 'user-only'])

function matchesRoleFilter(span: TranscriptSpan, filter: string): boolean {
  // Role filters are about the conversation, so tool and metadata spans drop out.
  if (filter === 'user-only') return span.kind === 'human'
  if (filter === 'assistant-only') return span.kind === 'assistant'
  return span.kind === 'human' || span.kind === 'assistant' || span.kind === 'event'
}

function messageMatchesQuery(message: TimelineMessage, query: string): boolean {
  return message.contentBlocks.some(block => {
    if (typeof block.content === 'string') return block.content.toLowerCase().includes(query)
    try {
      return JSON.stringify(block.content).toLowerCase().includes(query)
    } catch {
      return false
    }
  })
}

/** Every message a span owns, for search purposes. */
function spanMessages(span: TranscriptSpan): TimelineMessage[] {
  switch (span.kind) {
    case 'tools':
      return span.calls.flatMap(call =>
        [call.useMessage, call.resultMessage].filter((m): m is TimelineMessage => m !== null)
      )
    case 'meta':
      return span.records.map(record => record.message)
    case 'event':
      return [span.message, span.resultMessage].filter((m): m is TimelineMessage => m !== null)
    default:
      return [span.message]
  }
}

/** Stage 3: narrow what is shown, preserving span boundaries and counters. */
export function projectSpans(
  spans: TranscriptSpan[],
  { messageFilter, searchQuery }: SpanProjectionOptions
): ProjectedSpan[] {
  const query = searchQuery.trim().toLowerCase()
  const isRoleFilter = ROLE_FILTERS.has(messageFilter)
  const isToolFilter = messageFilter !== 'all' && !isRoleFilter

  const projected: ProjectedSpan[] = []

  for (const span of spans) {
    if (isRoleFilter && !matchesRoleFilter(span, messageFilter)) continue

    let visibleCallIds: string[] | null = null
    if (isToolFilter) {
      if (span.kind !== 'tools') continue
      const matching = span.calls.filter(
        call =>
          call.toolName === messageFilter ||
          (call.useMessage !== null &&
            getToolName(call.useMessage.originalMessage) === messageFilter)
      )
      if (matching.length === 0) continue
      visibleCallIds = matching.map(call => call.id)
    }

    let matchedMessageIds: string[] = []
    if (query) {
      matchedMessageIds = spanMessages(span)
        .filter(message => messageMatchesQuery(message, query))
        .map(message => message.id)
      if (matchedMessageIds.length === 0) continue
    }

    projected.push({
      span,
      autoExpand: visibleCallIds !== null || matchedMessageIds.length > 0,
      visibleCallIds,
      matchedMessageIds,
    })
  }

  return projected
}
