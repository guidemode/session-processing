/**
 * A plan presented for approval.
 *
 * The plan body is markdown, so it renders through `TextBlock` rather than the tool
 * pipeline — which is why it no longer appears as collapsed raw JSON.
 */

import type { PlanPayload } from '../../../utils/transcript/spanTypes.js'
import { TextBlock } from '../../timeline/blocks/TextBlock.js'
import { TRANSCRIPT_PROSE } from '../spanStyles.js'

const OUTCOME_BADGES = {
  approved: 'badge-success',
  rejected: 'badge-error',
  pending: 'badge-warning',
} as const

interface PlanEventProps {
  payload: PlanPayload
}

export function PlanEvent({ payload }: PlanEventProps) {
  return (
    <div className="mt-1">
      <span className={`badge badge-xs ${OUTCOME_BADGES[payload.outcome]}`}>{payload.outcome}</span>
      <div
        className={`mt-1 rounded border border-base-300 bg-base-200/40 px-2 py-1.5 ${TRANSCRIPT_PROSE}`}
      >
        {payload.plan ? (
          <TextBlock content={payload.plan} />
        ) : (
          <span className="italic text-base-content/50">No plan text was recorded.</span>
        )}
      </div>
    </div>
  )
}
