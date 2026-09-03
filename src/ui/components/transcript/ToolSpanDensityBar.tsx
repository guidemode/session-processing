/**
 * A segment per call, coloured by outcome — the shape of a span at a glance.
 */

import type { ToolCall } from '../../utils/transcript/spanTypes.js'
import { SPAN_STYLES } from './spanStyles.js'

interface ToolSpanDensityBarProps {
  calls: ToolCall[]
  onSelect?: (callId: string) => void
}

const SEGMENT_TONES = {
  ok: SPAN_STYLES.tools.swatch,
  error: SPAN_STYLES.error.swatch,
  pending: SPAN_STYLES.assistant.swatch,
} as const

export function ToolSpanDensityBar({ calls, onSelect }: ToolSpanDensityBarProps) {
  if (calls.length === 0) return null

  return (
    <div className="flex gap-0.5" aria-hidden={onSelect === undefined}>
      {calls.map(call => {
        const className = `h-1.5 min-w-1 flex-1 rounded-full ${SEGMENT_TONES[call.status]}`
        if (!onSelect) return <span key={call.id} className={className} />
        return (
          <button
            key={call.id}
            type="button"
            className={className}
            title={`${call.toolName}${call.label ? ` — ${call.label}` : ''}`}
            onClick={() => onSelect(call.id)}
          />
        )
      })}
    </div>
  )
}
