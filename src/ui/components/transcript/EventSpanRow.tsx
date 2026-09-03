/**
 * Interruptions, plans, questions and compaction — the moments in a session that
 * change its direction, and so earn a louder row than ordinary traffic.
 */

import { isPlanPayload, isQuestionPayload } from '../../utils/transcript/spanTypes.js'
import type { EventSpan } from '../../utils/transcript/spanTypes.js'
import { ContentRenderer } from '../timeline/ContentRenderer.js'
import { SpanRow } from './SpanRow.js'
import { PlanEvent } from './events/PlanEvent.js'
import { QuestionEvent } from './events/QuestionEvent.js'
import { ERROR_EVENTS, EVENT_ICONS, TRANSCRIPT_PROSE } from './spanStyles.js'

interface EventSpanRowProps {
  span: EventSpan
  range: string
  timeLabel: string
  /** The turn that followed an interruption, previewed inline as the steer. */
  steeredTo?: string
}

export function EventSpanRow({ span, range, timeLabel, steeredTo }: EventSpanRowProps) {
  const tone = ERROR_EVENTS.has(span.eventKind) ? 'error' : 'event'

  return (
    <SpanRow
      spanId={span.id}
      kind="event"
      tone={tone}
      range={range}
      Icon={EVENT_ICONS[span.eventKind]}
      messageId={span.message.id}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold text-base-content">{span.title}</span>
        <span className="text-[11px] text-base-content/45">{timeLabel}</span>
      </div>

      {isPlanPayload(span.payload) && <PlanEvent payload={span.payload} />}
      {isQuestionPayload(span.payload) && <QuestionEvent payload={span.payload} />}

      {span.payload === null && (
        <div className={`mt-0.5 text-base-content/70 ${TRANSCRIPT_PROSE}`}>
          <ContentRenderer blocks={span.message.contentBlocks} />
        </div>
      )}

      {steeredTo && (
        <div className="mt-1 truncate rounded bg-base-200 px-2 py-1 text-xs text-base-content/70">
          steered to → {steeredTo}
        </div>
      )}
    </SpanRow>
  )
}
