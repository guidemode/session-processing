/**
 * An assistant turn.
 *
 * Thinking is dimmed so it reads as background reasoning rather than a statement to the user, and
 * collapsed to its first couple of lines: a long session is mostly reasoning, and at full height
 * it pushes the turns that answer the user off the screen.
 */

import { useState } from 'react'
import type { AssistantSpan } from '../../utils/transcript/spanTypes.js'
import { ContentRenderer } from '../timeline/ContentRenderer.js'
import { SpanRow } from './SpanRow.js'
import { SPAN_ICONS, THINKING_ICON, THINKING_PROSE, TRANSCRIPT_PROSE } from './spanStyles.js'

interface AssistantSpanRowProps {
  span: AssistantSpan
  range: string
  timeLabel: string
}

export function AssistantSpanRow({ span, range, timeLabel }: AssistantSpanRowProps) {
  const [open, setOpen] = useState(false)

  if (!span.isThinking) {
    return (
      <SpanRow
        spanId={span.id}
        kind="assistant"
        tone="assistant"
        range={range}
        Icon={SPAN_ICONS.assistant}
        messageId={span.message.id}
      >
        <div className="text-[11px] uppercase tracking-wide text-base-content/45">
          assistant · {timeLabel}
        </div>
        <div className={`mt-0.5 ${TRANSCRIPT_PROSE}`}>
          <ContentRenderer blocks={span.message.contentBlocks} />
        </div>
      </SpanRow>
    )
  }

  return (
    <SpanRow
      spanId={span.id}
      kind="assistant"
      tone="assistant"
      range={range}
      Icon={THINKING_ICON}
      messageId={span.message.id}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-baseline gap-2 text-[11px] uppercase tracking-wide text-base-content/45 hover:text-base-content/80"
      >
        <span>thinking · {timeLabel}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {/* Clamped rather than unmounted, so the row keeps its shape and browser find still works. */}
      <div className={`mt-0.5 ${TRANSCRIPT_PROSE} ${THINKING_PROSE} ${open ? '' : 'line-clamp-2'}`}>
        <ContentRenderer blocks={span.message.contentBlocks} />
      </div>
    </SpanRow>
  )
}
