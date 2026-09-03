/**
 * A run of metadata records, collapsed to a single quiet line.
 */

import { useState } from 'react'
import { pluralize } from '../../utils/transcript/formatters.js'
import type { MetaSpan } from '../../utils/transcript/spanTypes.js'
import { ContentRenderer } from '../timeline/ContentRenderer.js'
import { SpanRow } from './SpanRow.js'
import { SPAN_ICONS } from './spanStyles.js'

interface MetaSpanRowProps {
  span: MetaSpan
  range: string
}

export function MetaSpanRow({ span, range }: MetaSpanRowProps) {
  const [open, setOpen] = useState(false)

  return (
    <SpanRow spanId={span.id} kind="meta" tone="meta" range={range} Icon={SPAN_ICONS.meta}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline gap-x-2 text-left text-xs text-base-content/50 hover:text-base-content/80"
      >
        <span className="font-medium">Metadata</span>
        <span className="badge badge-ghost badge-xs">
          {pluralize(span.records.length, 'record')}
        </span>
        <span className="truncate">{span.kinds.join(', ')}</span>
      </button>

      {open && (
        <div className="mt-1 grid gap-1 border-l border-base-300 pl-2">
          {span.records.map(record => (
            <div key={record.id} className="text-xs">
              <div className="text-base-content/45">{record.kind}</div>
              <ContentRenderer blocks={record.message.contentBlocks} />
            </div>
          ))}
        </div>
      )}
    </SpanRow>
  )
}
