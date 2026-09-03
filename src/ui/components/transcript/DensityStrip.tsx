/**
 * The shape of the session in one bar. Segments are weighted by how much each span
 * contains, so a long tool run reads as long — click one to jump there.
 */

import type { StripSegment } from '../../utils/transcript/spanTypes.js'
import { LEGEND_TONES, SPAN_STYLES } from './spanStyles.js'

interface DensityStripProps {
  strip: StripSegment[]
  onSelect: (spanId: string) => void
}

export function DensityStrip({ strip, onSelect }: DensityStripProps) {
  if (strip.length === 0) return null
  const total = strip.reduce((sum, segment) => sum + segment.weight, 0) || 1

  return (
    <div className="grid gap-1.5">
      <div className="flex h-3 gap-0.5" aria-label="Session density">
        {strip.map(segment => (
          <button
            key={segment.spanId}
            type="button"
            title={segment.label}
            aria-label={segment.label}
            onClick={() => onSelect(segment.spanId)}
            style={{ flexGrow: segment.weight, flexBasis: `${(segment.weight / total) * 100}%` }}
            className={`min-w-1 rounded-full transition-opacity hover:opacity-70
              ${SPAN_STYLES[segment.tone].swatch}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-base-content/50">
        {LEGEND_TONES.map(tone => (
          <span key={tone} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-4 rounded-full ${SPAN_STYLES[tone].swatch}`} />
            {SPAN_STYLES[tone].label}
          </span>
        ))}
      </div>
    </div>
  )
}
