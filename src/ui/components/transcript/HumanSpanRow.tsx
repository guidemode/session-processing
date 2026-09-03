/**
 * A human turn — the signal the whole view is built around, so it stays full width
 * and visually loud.
 */

import type { HumanSpan } from '../../utils/transcript/spanTypes.js'
import { ContentRenderer } from '../timeline/ContentRenderer.js'
import { SpanRow } from './SpanRow.js'
import { SPAN_ICONS, TRANSCRIPT_PROSE } from './spanStyles.js'

interface HumanSpanRowProps {
  span: HumanSpan
  range: string
  timeLabel: string
}

export function HumanSpanRow({ span, range, timeLabel }: HumanSpanRowProps) {
  return (
    <SpanRow
      spanId={span.id}
      kind="human"
      tone="human"
      range={range}
      Icon={SPAN_ICONS.human}
      messageId={span.message.id}
    >
      <div className="text-[11px] uppercase tracking-wide text-base-content/45">
        human · {timeLabel}
      </div>
      <div
        className={`mt-1 rounded bg-primary/5 px-2 py-1.5 text-base-content ${TRANSCRIPT_PROSE}`}
      >
        <ContentRenderer blocks={span.message.contentBlocks} />
      </div>
    </SpanRow>
  )
}
