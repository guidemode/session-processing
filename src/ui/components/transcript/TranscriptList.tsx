/**
 * Render root for the condensed transcript.
 *
 * ORDERING: this is the ONLY place display order is applied. Spans arrive
 * chronological and are reversed here as a whole; nothing inside a span is touched.
 */

import { useMemo } from 'react'
import type { ProjectedSpan } from '../../utils/transcript/filterSpans.js'
import type { TranscriptSpan, TranscriptSummary } from '../../utils/transcript/spanTypes.js'
import { AssistantSpanRow } from './AssistantSpanRow.js'
import { EventSpanRow } from './EventSpanRow.js'
import { HumanSpanRow } from './HumanSpanRow.js'
import { MetaSpanRow } from './MetaSpanRow.js'
import { ToolSpanRow } from './ToolSpanRow.js'
import { TranscriptHeader } from './TranscriptHeader.js'
import { useScrollAnchoring } from './useScrollAnchoring.js'
import { useTranscriptAnchoring } from './useTranscriptAnchoring.js'

interface TranscriptListProps {
  projected: ProjectedSpan[]
  summary: TranscriptSummary
  totalSpans: number
  reverseOrder: boolean
  peakContextTokens: number | null
  contextWindow: number
  /** Exposed so the page can deep-link into the transcript from elsewhere. */
  onAnchorReady?: (scrollToMessage: (messageId: string) => void) => void
}

/** Time of day only — the date lives in the session header. */
function timeLabel(timestamp: string): string {
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return 'unknown time'
  return new Date(parsed).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** The gutter range, e.g. `16` or `16-19`. Always chronological indices. */
function rangeLabel(span: TranscriptSpan): string {
  const count = span.messageIds.length
  return count <= 1 ? String(span.index + 1) : `${span.index + 1} ·${count}`
}

/** First line of a human turn, previewed after an interruption. */
function previewOf(span: TranscriptSpan | undefined): string | undefined {
  if (!span || span.kind !== 'human') return undefined
  const block = span.message.contentBlocks.find(b => typeof b.content === 'string')
  if (!block || typeof block.content !== 'string') return undefined
  const line = block.content.trim().split('\n')[0]
  return line.length > 120 ? `${line.slice(0, 119)}…` : line
}

export function TranscriptList({
  projected,
  summary,
  totalSpans,
  reverseOrder,
  peakContextTokens,
  contextWindow,
}: TranscriptListProps) {
  const spans = useMemo(() => projected.map(entry => entry.span), [projected])
  const { revealMessageId, scrollToSpan } = useTranscriptAnchoring(spans)
  useScrollAnchoring(projected.length, reverseOrder)

  // The single point where display order is applied.
  const ordered = reverseOrder ? [...projected].reverse() : projected

  return (
    <div>
      <TranscriptHeader
        summary={summary}
        peakContextTokens={peakContextTokens}
        contextWindow={contextWindow}
        narrowing={{ shown: projected.length, total: totalSpans }}
        onSelectSpan={scrollToSpan}
      />

      <div className="rounded border border-base-300 bg-base-100">
        {ordered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-base-content/50">
            No messages match the current filters.
          </div>
        )}

        {ordered.map((entry, position) => {
          const { span, autoExpand, visibleCallIds, matchedMessageIds } = entry
          const range = rangeLabel(span)
          const highlighted = new Set(matchedMessageIds)

          if (span.kind === 'human') {
            return (
              <HumanSpanRow
                key={span.id}
                span={span}
                range={range}
                timeLabel={timeLabel(span.startedAt)}
              />
            )
          }

          if (span.kind === 'assistant') {
            return (
              <AssistantSpanRow
                key={span.id}
                span={span}
                range={range}
                timeLabel={timeLabel(span.startedAt)}
              />
            )
          }

          if (span.kind === 'meta') {
            return <MetaSpanRow key={span.id} span={span} range={range} />
          }

          if (span.kind === 'event') {
            // The steer is whatever came next chronologically, regardless of display order.
            const next = reverseOrder ? ordered[position - 1]?.span : ordered[position + 1]?.span
            return (
              <EventSpanRow
                key={span.id}
                span={span}
                range={range}
                timeLabel={timeLabel(span.startedAt)}
                steeredTo={span.eventKind === 'interruption' ? previewOf(next) : undefined}
              />
            )
          }

          const revealCallId =
            revealMessageId !== null
              ? span.calls.find(
                  call =>
                    call.useMessage?.id === revealMessageId ||
                    call.resultMessage?.id === revealMessageId
                )?.id
              : undefined

          return (
            <ToolSpanRow
              key={span.id}
              span={span}
              range={range}
              autoExpand={autoExpand || revealCallId !== undefined}
              visibleCallIds={visibleCallIds}
              highlightedMessageIds={highlighted}
              revealCallId={revealCallId}
            />
          )
        })}
      </div>
    </div>
  )
}
