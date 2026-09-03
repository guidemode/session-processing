/**
 * An assistant turn. Thinking is dimmed so it reads as background reasoning rather
 * than a statement to the user.
 */

import type { AssistantSpan } from '../../utils/transcript/spanTypes.js'
import { ContentRenderer } from '../timeline/ContentRenderer.js'
import { SpanRow } from './SpanRow.js'
import { SPAN_ICONS, TRANSCRIPT_PROSE } from './spanStyles.js'

interface AssistantSpanRowProps {
  span: AssistantSpan
  range: string
  timeLabel: string
}

export function AssistantSpanRow({ span, range, timeLabel }: AssistantSpanRowProps) {
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
        {span.isThinking ? 'thinking' : 'assistant'} · {timeLabel}
      </div>
      <div
        className={`mt-0.5 ${TRANSCRIPT_PROSE} ${
          span.isThinking ? 'text-base-content/55 italic' : ''
        }`}
      >
        <ContentRenderer blocks={span.message.contentBlocks} />
      </div>
    </SpanRow>
  )
}
