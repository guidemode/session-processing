/**
 * Transcript Span Types - the condensed transcript model
 *
 * A *span* is a unit of work in a session. Contiguous runs of tool traffic and of
 * metadata records collapse into a single span; human turns, assistant turns and
 * notable events are always spans of exactly one message.
 *
 * This model sits *alongside* `TimelineItem`, deliberately not inside it:
 * `TimelineItem` is a message-level type consumed by token extraction and the desktop
 * app, and widening its union would force every exhaustive switch to handle a case it
 * cannot render.
 *
 * ORDERING INVARIANT: spans are always derived from a chronological message array.
 * Display order is applied by reversing the top-level span list only — never the
 * contents of a span.
 */

import type { TimelineMessage } from '../timelineTypes.js'

/** Which lane a span belongs to. Drives icon, colour and layout. */
export type SpanKind = 'human' | 'assistant' | 'tools' | 'meta' | 'event'

/** Notable events that earn their own visual treatment. */
export type EventKind = 'interruption' | 'plan' | 'question' | 'compact' | 'summary'

/** Outcome of a single tool call. */
export type CallStatus = 'ok' | 'error' | 'pending'

/**
 * One tool invocation and its result, wherever that result appeared in the session.
 */
export interface ToolCall {
  /** Stable id, derived from the originating message. */
  id: string
  /** The provider's tool_use id, when we could find one. */
  toolUseId: string | null
  toolName: string
  /** Deterministic one-line description, e.g. a command or a file path. */
  label: string
  /** Optional AI-generated intent label. Rendered in preference to `label`. */
  aiLabel?: string
  input: Record<string, unknown> | null
  inputChars: number
  result: { content: unknown; chars: number } | null
  outputChars: number
  status: CallStatus
  isError: boolean
  startedAt: string
  endedAt: string | null
  /** Result timestamp minus call timestamp. `null` when unknown or unparseable. */
  durationMs: number | null
  isSidechain: boolean
  /** Task/Agent subagent type, lifted out of `tool_use.input`. */
  subagentType?: string
  useMessage: TimelineMessage | null
  resultMessage: TimelineMessage | null
}

/** Aggregate counters for a tool span, all computed in one pass. */
export interface ToolSpanStats {
  callCount: number
  resultCount: number
  errorCount: number
  pendingCount: number
  /** Tool name counts, sorted by count desc then name asc. */
  histogram: Array<{ toolName: string; count: number }>
  inputChars: number
  outputChars: number
  /** Wall clock across every member of the span, including late results. */
  elapsedMs: number
}

/** One collapsed metadata record. */
export interface MetaRecord {
  id: string
  /** Human-readable kind, e.g. 'file snapshot', 'summary', 'command output'. */
  kind: string
  message: TimelineMessage
}

/** Payload for an ExitPlanMode event. */
export interface PlanPayload {
  plan: string
  outcome: 'approved' | 'rejected' | 'pending'
}

/** One question within an AskUserQuestion event. */
export interface QuestionEntry {
  header: string
  question: string
  multiSelect: boolean
  options: Array<{ label: string; description: string; chosen: boolean }>
}

/** Payload for an AskUserQuestion event. */
export interface QuestionPayload {
  questions: QuestionEntry[]
  /** Raw answer text from the tool result, when present. */
  answerText: string | null
}

interface SpanBase {
  /** Content-derived and stable across re-derivation and order flips. */
  id: string
  /** Chronological ordinal, used for the gutter range column. */
  index: number
  kind: SpanKind
  startedAt: string
  endedAt: string
  /** Every message this span owns. Powers the anchoring index. */
  messageIds: string[]
}

export interface HumanSpan extends SpanBase {
  kind: 'human'
  message: TimelineMessage
}

export interface AssistantSpan extends SpanBase {
  kind: 'assistant'
  message: TimelineMessage
  isThinking: boolean
}

export interface ToolSpan extends SpanBase {
  kind: 'tools'
  calls: ToolCall[]
  stats: ToolSpanStats
  label: string
  aiLabel?: string
}

export interface MetaSpan extends SpanBase {
  kind: 'meta'
  records: MetaRecord[]
  /** Distinct record kinds, in first-seen order. */
  kinds: string[]
}

export interface EventSpan extends SpanBase {
  kind: 'event'
  eventKind: EventKind
  title: string
  message: TimelineMessage
  resultMessage: TimelineMessage | null
  payload: PlanPayload | QuestionPayload | null
}

export type TranscriptSpan = HumanSpan | AssistantSpan | ToolSpan | MetaSpan | EventSpan

/** One segment of the density strip. */
export interface StripSegment {
  spanId: string
  kind: SpanKind
  /** `error` when the span contains failures, so the strip shows trouble at a glance. */
  tone: SpanKind | 'error'
  weight: number
  label: string
}

/** Header counters, computed from the unfiltered model. */
export interface TranscriptSummary {
  records: number
  human: number
  assistant: number
  toolCalls: number
  toolPairs: number
  toolPending: number
  errors: number
  meta: number
  events: number
  strip: StripSegment[]
}

export interface TranscriptModel {
  spans: TranscriptSpan[]
  summary: TranscriptSummary
}

export function isHumanSpan(span: TranscriptSpan): span is HumanSpan {
  return span.kind === 'human'
}

export function isAssistantSpan(span: TranscriptSpan): span is AssistantSpan {
  return span.kind === 'assistant'
}

export function isToolSpan(span: TranscriptSpan): span is ToolSpan {
  return span.kind === 'tools'
}

export function isMetaSpan(span: TranscriptSpan): span is MetaSpan {
  return span.kind === 'meta'
}

export function isEventSpan(span: TranscriptSpan): span is EventSpan {
  return span.kind === 'event'
}

export function isPlanPayload(
  payload: PlanPayload | QuestionPayload | null
): payload is PlanPayload {
  return payload !== null && 'plan' in payload
}

export function isQuestionPayload(
  payload: PlanPayload | QuestionPayload | null
): payload is QuestionPayload {
  return payload !== null && 'questions' in payload
}
