/**
 * Session counters and the density strip.
 *
 * Always describes the WHOLE session — a filtered list reports its own narrowing
 * separately, so the header never silently changes meaning under a filter.
 */

import { formatChars, formatCount } from '../../utils/transcript/formatters.js'
import type { TranscriptSummary } from '../../utils/transcript/spanTypes.js'
import { DensityStrip } from './DensityStrip.js'

interface TranscriptHeaderProps {
  summary: TranscriptSummary
  /** Peak cached context in tokens, or null when the session reports none. */
  peakContextTokens: number | null
  contextWindow: number
  /** Present only when a filter or search is narrowing the list. */
  narrowing?: { shown: number; total: number }
  onSelectSpan: (spanId: string) => void
}

interface StatProps {
  label: string
  value: string
  hint: string
  tone?: string
}

function Stat({ label, value, hint, tone }: StatProps) {
  return (
    <div className="rounded border border-base-300 bg-base-100 px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-base-content/45">{label}</div>
      <div className={`text-lg font-semibold leading-tight ${tone ?? 'text-base-content'}`}>
        {value}
      </div>
      <div className="truncate text-[11px] text-base-content/45">{hint}</div>
    </div>
  )
}

/** Same thresholds the token chart's gauge used, so the warning point is unchanged. */
function contextTone(tokens: number): string {
  if (tokens < 100_000) return 'text-success'
  if (tokens < 150_000) return 'text-warning'
  return 'text-error'
}

export function TranscriptHeader({
  summary,
  peakContextTokens,
  contextWindow,
  narrowing,
  onSelectSpan,
}: TranscriptHeaderProps) {
  return (
    <div className="mb-3 grid gap-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Records" value={formatCount(summary.records)} hint="jsonl lines" />
        <Stat label="Human" value={formatCount(summary.human)} hint="typed prompts" />
        <Stat label="Assistant" value={formatCount(summary.assistant)} hint="text messages" />
        <Stat
          label="Tools"
          value={formatCount(summary.toolCalls)}
          hint={
            summary.toolPending > 0
              ? `${summary.toolPairs} paired · ${summary.toolPending} running`
              : `${summary.toolPairs} paired`
          }
        />
        <Stat
          label="Errors"
          value={formatCount(summary.errors)}
          hint="failed calls"
          tone={summary.errors > 0 ? 'text-error' : undefined}
        />
        <Stat label="Events" value={formatCount(summary.events)} hint="plans, steers" />
        <Stat
          label="Context"
          value={peakContextTokens === null ? '—' : formatChars(peakContextTokens)}
          hint={`peak of ${formatChars(contextWindow)}`}
          tone={peakContextTokens === null ? undefined : contextTone(peakContextTokens)}
        />
      </div>

      <DensityStrip strip={summary.strip} onSelect={onSelectSpan} />

      {narrowing && narrowing.shown !== narrowing.total && (
        <div className="text-[11px] text-base-content/50">
          showing {formatCount(narrowing.shown)} of {formatCount(narrowing.total)} spans
        </div>
      )}
    </div>
  )
}
