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
  /**
   * The model's real window, or `null` when nobody has established it yet.
   *
   * NULL IS THE NORMAL STATE OF A SESSION THAT IS STILL RUNNING. The window is a
   * per-model fact that only the server's pricing pass can look up
   * (`token_prices.max_input_tokens`), so until a session is processed there is
   * no answer — and Claude Code, unlike Codex, does not declare one in the
   * transcript. Printing the 200k assumption regardless is how a 1m session came
   * to render "382k / peak of 200k" in red.
   */
  contextWindow: number | null
  /** Context occupancy over the session, already downsampled. */
  contextSeries?: number[]
  /** Present only when a filter or search is narrowing the list. */
  narrowing?: { shown: number; total: number }
  onSelectSpan: (spanId: string) => void
  /** The filter in force, so a counter can show that it is the one applying it. */
  messageFilter?: string
  /** Toggling a counter sets its filter, or clears it back to `all` when already set. */
  onFilterChange?: (filter: string) => void
}

interface StatProps {
  label: string
  value: string
  hint: string
  tone?: string
  /** Drawn behind the figure, faintly, when the stat has a shape worth seeing. */
  spark?: number[]
  /** The filter this counter applies. Counters without one are not clickable. */
  filter?: string
  active?: boolean
  onToggle?: (filter: string) => void
}

/**
 * The session's shape, behind its own number.
 *
 * `preserveAspectRatio="none"` so the path stretches to whatever the card is: this is a shape,
 * not a chart, and it carries no axis anyone could misread.
 */
function Sparkline({ values, className }: { values: number[]; className: string }) {
  if (values.length < 2) return null
  const peak = Math.max(...values)
  if (peak <= 0) return null

  const step = 100 / (values.length - 1)
  const points = values.map(
    (v, i) => `${(i * step).toFixed(2)},${(100 - (v / peak) * 100).toFixed(2)}`
  )

  return (
    <svg
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-8 w-full ${className}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={`0,100 ${points.join(' ')} 100,100`} fill="currentColor" opacity="0.12" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        opacity="0.45"
      />
    </svg>
  )
}

function Stat({ label, value, hint, tone, spark, filter, active, onToggle }: StatProps) {
  const body = (
    <>
      {spark && <Sparkline values={spark} className={tone ?? 'text-base-content'} />}
      <div className="relative text-[11px] uppercase tracking-wide text-base-content/45">
        {label}
      </div>
      <div
        className={`relative text-lg font-semibold leading-tight ${tone ?? 'text-base-content'}`}
      >
        {value}
      </div>
      <div className="relative truncate text-[11px] text-base-content/45">{hint}</div>
    </>
  )

  const base = 'relative overflow-hidden rounded border bg-base-100 px-2 py-1.5 text-left'

  // A counter with no filter behind it — Records, Context — is not a control.
  if (!filter || !onToggle) {
    return <div className={`${base} border-base-300`}>{body}</div>
  }

  return (
    <button
      type="button"
      onClick={() => onToggle(filter)}
      aria-pressed={active}
      title={active ? 'Show everything again' : `Show only ${label.toLowerCase()}`}
      className={`${base} w-full cursor-pointer transition-colors ${
        active ? 'border-primary ring-1 ring-primary/40' : 'border-base-300 hover:border-primary/50'
      }`}
    >
      {body}
    </button>
  )
}

/**
 * A fraction of the window in force, not an absolute token count.
 *
 * The thresholds were 100k and 150k, which are half and three quarters of the 200k window every
 * model used to have. Left absolute they paint a 255k peak red on a 1m window — a quarter full.
 */
function contextTone(tokens: number, window: number): string {
  const used = tokens / window
  if (used < 0.5) return 'text-success'
  if (used < 0.75) return 'text-warning'
  return 'text-error'
}

/**
 * What to say under the peak.
 *
 * A window we do not have gets no sentence. Saying "peak of 200k" beside a
 * measured 382k is not a rounding error — it is a claim the data on screen has
 * already disproved, and it drags the red tone along with it.
 */
function contextHint(peakTokens: number | null, window: number | null): string {
  if (window === null) return 'peak context'
  if (peakTokens !== null && peakTokens > window) return 'peak · window unconfirmed'
  return `peak of ${formatChars(window)}`
}

export function TranscriptHeader({
  summary,
  peakContextTokens,
  contextWindow,
  contextSeries,
  narrowing,
  onSelectSpan,
  messageFilter = 'all',
  onFilterChange,
}: TranscriptHeaderProps) {
  // Clicking the counter that is already filtering clears it, so the same target both applies
  // and removes the filter and nothing else has to be hunted for.
  const toggle = onFilterChange
    ? (filter: string) => onFilterChange(messageFilter === filter ? 'all' : filter)
    : undefined
  const filterProps = (filter: string) => ({
    filter,
    active: messageFilter === filter,
    onToggle: toggle,
  })

  return (
    <div className="mb-3 grid gap-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Records" value={formatCount(summary.records)} hint="jsonl lines" />
        <Stat
          label="Human"
          value={formatCount(summary.human)}
          hint="typed prompts"
          {...filterProps('user-only')}
        />
        <Stat
          label="Assistant"
          value={formatCount(summary.assistant)}
          hint="text messages"
          {...filterProps('assistant-only')}
        />
        <Stat
          label="Tools"
          value={formatCount(summary.toolCalls)}
          hint={
            summary.toolPending > 0
              ? `${summary.toolPairs} paired · ${summary.toolPending} running`
              : `${summary.toolPairs} paired`
          }
          {...filterProps('tools-only')}
        />
        <Stat
          label="Errors"
          value={formatCount(summary.errors)}
          hint="failed calls"
          tone={summary.errors > 0 ? 'text-error' : undefined}
          // Nothing to isolate when there are none, and a filter that empties the list is
          // indistinguishable from a broken one.
          {...(summary.errors > 0 ? filterProps('errors-only') : {})}
        />
        <Stat
          label="Events"
          value={formatCount(summary.events)}
          hint="plans, steers"
          {...(summary.events > 0 ? filterProps('events-only') : {})}
        />
        <Stat
          label="Context"
          value={peakContextTokens === null ? '—' : formatChars(peakContextTokens)}
          hint={contextHint(peakContextTokens, contextWindow)}
          tone={
            peakContextTokens === null || contextWindow === null
              ? undefined
              : contextTone(peakContextTokens, contextWindow)
          }
          spark={contextSeries}
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
