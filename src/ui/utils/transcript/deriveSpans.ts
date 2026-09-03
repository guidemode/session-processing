/**
 * deriveSpans — turn a chronological message array into the condensed transcript model.
 *
 * ORDERING INVARIANT
 * ------------------
 * Spans are ALWAYS derived from the chronological array. `reverseOrder` is applied by
 * the renderer as a single `[...spans].reverse()` on the top-level list. Nothing inside
 * a span is ever reversed — `calls[]`, `records[]` and `messageIds[]` stay chronological
 * in both display modes.
 *
 * A tool span is a *unit of work*: "7 Bash · 2 Read" read backwards is meaningless, and
 * `elapsedMs` would invert. Newest-first therefore means "newest unit of work first",
 * exactly like `git log` — each commit's diff is still in file order. Keeping derivation
 * a pure function of chronological input also means no test reasons about order, and
 * `span.id` stays stable when the user flips the sort, so expand state, deep links and
 * the density strip survive the toggle.
 *
 * Pure and synchronous: no React, no DOM, no `Date.now()`.
 */

import type { TimelineMessage } from '../timelineTypes.js'
import { extractPlanPayload, extractQuestionPayload } from './eventPayloads.js'
import { type Lane, eventKindOf, laneOf, metaRecordKind } from './lanes.js'
import { getToolResultId, getToolUseId } from './messageAccess.js'
import { type SpanLabelProvider, deriveToolSpanLabel } from './spanLabels.js'
import { buildSummary } from './spanSummary.js'
import type {
  AssistantSpan,
  EventSpan,
  HumanSpan,
  MetaRecord,
  MetaSpan,
  ToolCall,
  ToolSpan,
  TranscriptModel,
  TranscriptSpan,
} from './spanTypes.js'
import { buildToolCall, buildToolStats } from './toolCalls.js'

export interface DeriveSpansOptions {
  /** Optional source of AI intent labels, consulted once per tool span. */
  labelProvider?: SpanLabelProvider
}

const EVENT_TITLES: Record<string, string> = {
  interruption: 'Interrupted by user',
  plan: 'Plan presented',
  question: 'Asked the user',
  compact: 'Context compacted',
  summary: 'Conversation summary',
}

/**
 * Derive the condensed transcript model.
 *
 * @param messages Chronological, already prefiltered (meta/thinking toggles applied).
 */
export function deriveSpans(
  messages: TimelineMessage[],
  opts: DeriveSpansOptions = {}
): TranscriptModel {
  // Pass 1: index every tool result by the call it answers, across the WHOLE array, so
  // a subagent result that lands sixty records later is still findable.
  const resultsByToolUseId = new Map<string, TimelineMessage>()
  for (const message of messages) {
    if (message.originalMessage.type !== 'tool_result') continue
    const id = getToolResultId(message.originalMessage)
    if (id && !resultsByToolUseId.has(id)) resultsByToolUseId.set(id, message)
  }

  const spans: TranscriptSpan[] = []
  const consumedResultIds = new Set<string>()

  // Open run state for the two lanes that coalesce.
  let runLane: Lane | null = null
  let runMembers: TimelineMessage[] = []
  let runCalls: ToolCall[] = []
  let runRecords: MetaRecord[] = []

  const pushSpan = (span: TranscriptSpan) => {
    spans.push({ ...span, index: spans.length })
  }

  const flushRun = () => {
    if (runLane === null || runMembers.length === 0) {
      runLane = null
      runMembers = []
      runCalls = []
      runRecords = []
      return
    }
    const first = runMembers[0]
    const messageIds = runMembers.map(message => message.id)
    const startedAt = first.timestamp
    const endedAt = runMembers[runMembers.length - 1].timestamp

    if (runLane === 'tools') {
      const stats = buildToolStats(runCalls, runMembers)
      const span: ToolSpan = {
        id: `span-${first.id}`,
        index: spans.length,
        kind: 'tools',
        startedAt,
        endedAt,
        messageIds,
        calls: runCalls,
        stats,
        label: deriveToolSpanLabel(runCalls),
      }
      // The AI seam: the deterministic label is always computed; an AI label, when a
      // provider supplies one, is layered on top and preferred at render time.
      const aiLabel = opts.labelProvider?.labelFor(span)
      pushSpan(aiLabel ? { ...span, aiLabel } : span)
    } else {
      const kinds: string[] = []
      for (const record of runRecords) {
        if (!kinds.includes(record.kind)) kinds.push(record.kind)
      }
      const span: MetaSpan = {
        id: `span-${first.id}`,
        index: spans.length,
        kind: 'meta',
        startedAt,
        endedAt,
        messageIds,
        records: runRecords,
        kinds,
      }
      pushSpan(span)
    }

    runLane = null
    runMembers = []
    runCalls = []
    runRecords = []
  }

  // Pass 2: walk chronologically, coalescing tool and meta runs.
  for (const message of messages) {
    // A result already absorbed by an earlier call is not a call, not a span, and must
    // never re-open a run — otherwise a late subagent result spawns a phantom span.
    if (message.originalMessage.type === 'tool_result' && consumedResultIds.has(message.id)) {
      continue
    }

    const lane = laneOf(message)

    if (lane === 'tools' || lane === 'meta') {
      if (runLane !== null && runLane !== lane) flushRun()
      runLane = lane
      runMembers.push(message)

      if (lane === 'meta') {
        runRecords.push({ id: message.id, kind: metaRecordKind(message), message })
        continue
      }

      if (message.originalMessage.type === 'tool_use') {
        const toolUseId = getToolUseId(message.originalMessage)
        const result = toolUseId ? (resultsByToolUseId.get(toolUseId) ?? null) : null
        if (result) {
          consumedResultIds.add(result.id)
          // The result belongs to this span even when it arrived much later, so the
          // span's elapsed time covers the real wait.
          if (!runMembers.includes(result)) runMembers.push(result)
        }
        runCalls.push(buildToolCall(message, result, null))
      } else {
        // A result with no call anywhere in the session.
        runCalls.push(buildToolCall(null, null, message))
      }
      continue
    }

    // Every other lane is a single-message span, and closes any open run.
    flushRun()

    if (lane === 'human') {
      const span: HumanSpan = {
        id: `span-${message.id}`,
        index: spans.length,
        kind: 'human',
        startedAt: message.timestamp,
        endedAt: message.timestamp,
        messageIds: [message.id],
        message,
      }
      pushSpan(span)
      continue
    }

    if (lane === 'event') {
      const eventKind = eventKindOf(message) ?? 'summary'
      let resultMessage: TimelineMessage | null = null
      if (message.originalMessage.type === 'tool_use') {
        const toolUseId = getToolUseId(message.originalMessage)
        resultMessage = toolUseId ? (resultsByToolUseId.get(toolUseId) ?? null) : null
        if (resultMessage) consumedResultIds.add(resultMessage.id)
      }

      const payload =
        eventKind === 'plan'
          ? extractPlanPayload(message, resultMessage)
          : eventKind === 'question'
            ? extractQuestionPayload(message, resultMessage)
            : null

      const messageIds = resultMessage ? [message.id, resultMessage.id] : [message.id]
      const span: EventSpan = {
        id: `span-${message.id}`,
        index: spans.length,
        kind: 'event',
        startedAt: message.timestamp,
        endedAt: resultMessage?.timestamp ?? message.timestamp,
        messageIds,
        eventKind,
        title: EVENT_TITLES[eventKind] ?? 'Event',
        message,
        resultMessage,
        payload,
      }
      pushSpan(span)
      continue
    }

    const span: AssistantSpan = {
      id: `span-${message.id}`,
      index: spans.length,
      kind: 'assistant',
      startedAt: message.timestamp,
      endedAt: message.timestamp,
      messageIds: [message.id],
      message,
      isThinking: message.originalMessage.metadata?.isThinking === true,
    }
    pushSpan(span)
  }

  flushRun()

  return { spans, summary: buildSummary(messages.length, spans) }
}
