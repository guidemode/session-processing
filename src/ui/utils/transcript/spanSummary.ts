/**
 * Header counters and the density strip.
 *
 * Computed from the UNFILTERED model, so the header always describes the whole
 * session; a filtered list reports its own narrowing separately.
 */

import { deriveToolSpanLabel } from './spanLabels.js'
import type { StripSegment, TranscriptSpan, TranscriptSummary } from './spanTypes.js'

/**
 * Strip weight: how much horizontal room a span earns.
 *
 * Tool and meta spans weigh by how much they contain, so the bar shows the *shape* of
 * the session rather than merely how many spans there were.
 */
function stripWeight(span: TranscriptSpan): number {
  if (span.kind === 'tools') return Math.max(1, span.calls.length)
  if (span.kind === 'meta') return Math.max(1, span.records.length)
  return 1
}

function stripLabel(span: TranscriptSpan): string {
  switch (span.kind) {
    case 'tools':
      return span.aiLabel ?? span.label
    case 'meta':
      return `${span.records.length} metadata records`
    case 'event':
      return span.title
    case 'human':
      return 'Human prompt'
    default:
      return span.isThinking ? 'Thinking' : 'Assistant'
  }
}

export function buildStrip(spans: TranscriptSpan[]): StripSegment[] {
  return spans.map(span => ({
    spanId: span.id,
    kind: span.kind,
    // A span containing failures shows red, so trouble is visible without scrolling.
    tone:
      span.kind === 'tools' && span.stats.errorCount > 0
        ? ('error' as const)
        : span.kind === 'event' && span.eventKind === 'interruption'
          ? ('error' as const)
          : span.kind,
    weight: stripWeight(span),
    label: stripLabel(span),
  }))
}

export function buildSummary(recordCount: number, spans: TranscriptSpan[]): TranscriptSummary {
  let human = 0
  let assistant = 0
  let meta = 0
  let events = 0
  let toolCalls = 0
  let toolPairs = 0
  let toolPending = 0
  let errors = 0

  for (const span of spans) {
    switch (span.kind) {
      case 'human':
        human += 1
        break
      case 'assistant':
        assistant += 1
        break
      case 'event':
        events += 1
        break
      case 'meta':
        meta += span.records.length
        break
      case 'tools':
        toolCalls += span.stats.callCount
        toolPairs += span.stats.resultCount
        toolPending += span.stats.pendingCount
        errors += span.stats.errorCount
        break
    }
  }

  return {
    records: recordCount,
    human,
    assistant,
    toolCalls,
    toolPairs,
    toolPending,
    errors,
    meta,
    events,
    strip: buildStrip(spans),
  }
}

/** Re-exported so callers can relabel a span without importing the labels module. */
export { deriveToolSpanLabel }
