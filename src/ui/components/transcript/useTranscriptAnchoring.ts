/**
 * Deep-linking into a condensed transcript.
 *
 * A message inside a collapsed span has no DOM node, so scrolling to it means first
 * asking the span to reveal it. The reveal target is state; the scroll happens on the
 * next frame, once the row has rendered.
 */

import { useCallback, useMemo, useState } from 'react'
import type { TranscriptSpan } from '../../utils/transcript/spanTypes.js'

const FLASH_CLASSES = ['ring-2', 'ring-primary', 'ring-offset-2', 'bg-primary/10']
const FLASH_MS = 1600

function flash(element: Element): void {
  element.classList.add(...FLASH_CLASSES)
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => element.classList.remove(...FLASH_CLASSES), FLASH_MS)
}

export interface TranscriptAnchoring {
  /** Message id a span should reveal, so the row exists before we scroll to it. */
  revealMessageId: string | null
  scrollToSpan: (spanId: string) => void
  scrollToMessage: (messageId: string) => void
}

export function useTranscriptAnchoring(spans: TranscriptSpan[]): TranscriptAnchoring {
  const [revealMessageId, setRevealMessageId] = useState<string | null>(null)

  const spanIdByMessageId = useMemo(() => {
    const index = new Map<string, string>()
    for (const span of spans) {
      for (const messageId of span.messageIds) index.set(messageId, span.id)
    }
    return index
  }, [spans])

  const scrollToSpan = useCallback((spanId: string) => {
    const element = document.querySelector(`[data-span-id="${spanId}"]`)
    if (element) flash(element)
  }, [])

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const spanId = spanIdByMessageId.get(messageId)
      setRevealMessageId(messageId)

      // Wait a frame so a span opened by the reveal has rendered its rows.
      requestAnimationFrame(() => {
        const target =
          document.querySelector(`[data-message-id="${messageId}"]`) ??
          (spanId ? document.querySelector(`[data-span-id="${spanId}"]`) : null)
        if (target) flash(target)
      })
    },
    [spanIdByMessageId]
  )

  return { revealMessageId, scrollToSpan, scrollToMessage }
}
