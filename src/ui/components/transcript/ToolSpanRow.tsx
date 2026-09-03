/**
 * A collapsed run of tool work: label, counters, histogram and a density bar.
 * Expanding reveals one row per call.
 */

import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { formatChars, formatSpanDuration, pluralize } from '../../utils/transcript/formatters.js'
import type { ToolSpan } from '../../utils/transcript/spanTypes.js'
import { SpanRow } from './SpanRow.js'
import { ToolCallRow } from './ToolCallRow.js'
import { ToolSpanDensityBar } from './ToolSpanDensityBar.js'
import { SPAN_ICONS } from './spanStyles.js'

interface ToolSpanRowProps {
  span: ToolSpan
  range: string
  /** Filtering or search has already decided this span should open. */
  autoExpand: boolean
  /** When set, only these calls are shown until the reader asks for the rest. */
  visibleCallIds: string[] | null
  highlightedMessageIds: Set<string>
  /** A call to reveal because something deep-linked to it. */
  revealCallId?: string
}

/** Top few tools, then a remainder — a full histogram is noise at a glance. */
function histogramLine(span: ToolSpan): string {
  const shown = span.stats.histogram.slice(0, 4)
  const rest = span.stats.histogram.slice(4).reduce((sum, entry) => sum + entry.count, 0)
  const parts = shown.map(entry => `${entry.count} ${entry.toolName}`)
  if (rest > 0) parts.push(`+${rest} more`)
  return parts.join(' · ')
}

export function ToolSpanRow({
  span,
  range,
  autoExpand,
  visibleCallIds,
  highlightedMessageIds,
  revealCallId,
}: ToolSpanRowProps) {
  // Failures open by default — a collapsed error is an error nobody sees.
  const [open, setOpen] = useState(autoExpand || span.stats.errorCount > 0)
  const [showAll, setShowAll] = useState(false)
  const [openCallId, setOpenCallId] = useState<string | null>(revealCallId ?? null)

  const hasError = span.stats.errorCount > 0
  const tone = hasError ? 'error' : 'tools'
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon

  const filtered = visibleCallIds !== null && !showAll
  const calls = filtered ? span.calls.filter(call => visibleCallIds.includes(call.id)) : span.calls

  const revealCall = (callId: string) => {
    setOpen(true)
    setOpenCallId(current => (current === callId ? null : callId))
  }

  return (
    <SpanRow spanId={span.id} kind="tools" tone={tone} range={range} Icon={SPAN_ICONS.tools}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left"
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 self-center text-base-content/40" />
        <span className="text-sm font-medium text-base-content">{span.aiLabel ?? span.label}</span>
        {span.aiLabel && <span className="badge badge-accent badge-xs">AI</span>}
        <span className="badge badge-ghost badge-xs">
          {pluralize(span.stats.callCount, 'call')}
        </span>
        {span.stats.errorCount > 0 && (
          <span className="badge badge-error badge-xs">
            {pluralize(span.stats.errorCount, 'error')}
          </span>
        )}
        {span.stats.pendingCount > 0 && (
          <span className="badge badge-warning badge-xs">{span.stats.pendingCount} running</span>
        )}
        {span.stats.elapsedMs > 0 && (
          <span className="badge badge-ghost badge-xs">
            {formatSpanDuration(span.stats.elapsedMs)}
          </span>
        )}
      </button>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-base-content/50">
        <span>{histogramLine(span)}</span>
        <span>· out {formatChars(span.stats.outputChars)}</span>
      </div>

      <div className="mt-1">
        <ToolSpanDensityBar calls={span.calls} onSelect={revealCall} />
      </div>

      {open && (
        <div className="mt-1 grid gap-0.5">
          {calls.map(call => (
            <ToolCallRow
              key={call.id}
              call={call}
              index={span.calls.indexOf(call)}
              open={openCallId === call.id}
              highlighted={
                (call.useMessage !== null && highlightedMessageIds.has(call.useMessage.id)) ||
                (call.resultMessage !== null && highlightedMessageIds.has(call.resultMessage.id))
              }
              onToggle={revealCall}
            />
          ))}

          {filtered && calls.length < span.calls.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-0.5 text-left text-[11px] text-base-content/50 hover:text-primary"
            >
              showing {calls.length} of {span.calls.length} calls · show all
            </button>
          )}
        </div>
      )}
    </SpanRow>
  )
}
