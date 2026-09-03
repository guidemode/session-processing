/**
 * Preserve the reader's place when a live session appends new content.
 *
 * Lifted verbatim from `VirtualizedMessageList`, generalised from timeline items to a
 * plain count so it works for spans too.
 *
 * @param itemCount Number of rows currently rendered.
 * @param reverseOrder Newest-first, meaning new rows land at the top.
 */

import { useLayoutEffect, useRef } from 'react'

export function useScrollAnchoring(itemCount: number, reverseOrder: boolean): void {
  const previousItemCount = useRef(itemCount)
  const previousScrollHeight = useRef(0)

  useLayoutEffect(() => {
    const scrollContainer = document.querySelector('main')
    if (!scrollContainer) return

    const itemsAdded = itemCount - previousItemCount.current

    if (itemsAdded > 0) {
      const currentScrollTop = scrollContainer.scrollTop
      const currentClientHeight = scrollContainer.clientHeight
      const newScrollHeight = scrollContainer.scrollHeight
      const oldScrollHeight = previousScrollHeight.current
      const heightAdded = newScrollHeight - oldScrollHeight

      if (reverseOrder) {
        // Rows arrived above the reader; hold their position steady.
        if (currentScrollTop > 10 && heightAdded > 0) {
          scrollContainer.scrollTop = currentScrollTop + heightAdded
        }
      } else {
        // Rows arrived below; follow along only if the reader was already at the end.
        const wasAtBottom = currentScrollTop + currentClientHeight >= oldScrollHeight - 50
        if (wasAtBottom) {
          scrollContainer.scrollTop = newScrollHeight - currentClientHeight
        }
      }
    }

    previousScrollHeight.current = scrollContainer.scrollHeight
    previousItemCount.current = itemCount
  })
}
