/**
 * Shared chrome for every span: the index gutter, the icon node rail and the left
 * accent border. Content is supplied by the kind-specific row.
 */

import type React from 'react'
import type { SpanTone } from './spanStyles.js'
import { SPAN_STYLES } from './spanStyles.js'

interface SpanRowProps {
  spanId: string
  kind: string
  tone: SpanTone
  /** Index range shown in the gutter, e.g. `16-19`. */
  range: string
  Icon: React.ComponentType<{ className?: string }>
  /** Anchor for deep links that target a specific message. */
  messageId?: string
  children: React.ReactNode
}

export function SpanRow({ spanId, kind, tone, range, Icon, messageId, children }: SpanRowProps) {
  const style = SPAN_STYLES[tone]

  return (
    <article
      data-span-id={spanId}
      data-span-kind={kind}
      data-message-id={messageId}
      className={`grid grid-cols-[3rem_auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1
        border-b border-base-200 py-2 pl-1 pr-4 last:border-b-0`}
    >
      <span className="pt-1.5 text-right font-mono text-[11px] text-base-content/35 tabular-nums">
        {range}
      </span>

      <span
        className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded ${style.node}`}
        aria-hidden="true"
      >
        <Icon className={`h-3.5 w-3.5 ${style.icon}`} />
      </span>

      <div className={`min-w-0 border-l-2 pl-2.5 pr-1 ${style.border}`}>{children}</div>
    </article>
  )
}
