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

/**
 * Filters that select whole spans by what they are, as opposed to by tool name.
 *
 * The header counters toggle these, so every counter that can be clicked needs one — which is
 * why `tools-only`, `events-only` and `errors-only` exist alongside the three role filters the
 * dropdown has always offered.
 */
const ROLE_FILTERS = new Set([
  'user-assistant',
  'assistant-only',
  'user-only',
  'tools-only',
  'events-only',
  'errors-only',
])

function matchesRoleFilter(span: TranscriptSpan, filter: string): boolean {
  // Role filters are about the conversation, so tool and metadata spans drop out.
  if (filter === 'user-only') return span.kind === 'human'
  if (filter === 'assistant-only') return span.kind === 'assistant'
  if (filter === 'tools-only') return span.kind === 'tools'
  if (filter === 'events-only') return span.kind === 'event'
  // A failed call lives inside a tool span, so this selects the spans holding one. The calls
  // themselves are narrowed below, so the span opens on the failure rather than on its first call.
  if (filter === 'errors-only') return span.kind === 'tools' && span.stats.errorCount > 0
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

/**
 * The human turn that answered an interruption.
 *
 * An interruption on its own records only that the run was stopped; what makes it worth reading
 * is the steer that followed, and under `events-only` that turn is filtered out — leaving four
 * rows all saying "Interrupted by user" and nothing about why. So the steer is carried in with
 * its interruption.
 *
 * The search stops at the next event as well as at the first human turn: if a run was stopped
 * and never steered, the next prompt belongs to whatever came after, not to this interruption.
 */
function steerSpanIds(spans: TranscriptSpan[]): Set<string> {
  const ids = new Set<string>()

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]
    if (span.kind !== 'event' || span.eventKind !== 'interruption') continue

    for (let j = i + 1; j < spans.length; j++) {
      const candidate = spans[j]
      if (candidate.kind === 'event') break
      if (candidate.kind === 'human') {
        ids.add(candidate.id)
        break
      }
    }
  }

  return ids
}

/** Stage 3: narrow what is shown, preserving span boundaries and counters. */
export function projectSpans(
  spans: TranscriptSpan[],
  { messageFilter, searchQuery }: SpanProjectionOptions
): ProjectedSpan[] {
  const query = searchQuery.trim().toLowerCase()
  const isRoleFilter = ROLE_FILTERS.has(messageFilter)
  const isToolFilter = messageFilter !== 'all' && !isRoleFilter
  const steers = messageFilter === 'events-only' ? steerSpanIds(spans) : null

  const projected: ProjectedSpan[] = []

  for (const span of spans) {
    if (isRoleFilter && !matchesRoleFilter(span, messageFilter) && !steers?.has(span.id)) continue

    let visibleCallIds: string[] | null = null
    if (messageFilter === 'errors-only' && span.kind === 'tools') {
      visibleCallIds = span.calls.filter(call => call.isError).map(call => call.id)
    }
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
