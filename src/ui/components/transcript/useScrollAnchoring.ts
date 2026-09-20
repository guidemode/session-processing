/**
 * Preserve the reader's place when a live session appends new content.
 *
 * Lifted verbatim from `VirtualizedMessageList`, generalised from timeline items to a
 * plain count so it works for spans too.
 *
 * ONLY GROWTH OF THE SAME LIST COUNTS. The hook infers "new content arrived" from the row
 * count rising, which is true of a live session and false of a filter being cleared. Clearing
 * one takes the count from a handful back to hundreds, and because a short filtered list fits
 * the viewport — making `wasAtBottom` trivially true — the reader was thrown to the end of the
 * full transcript. `resetKey` names the projection, so a change of filter or search re-baselines
 * without scrolling anything.
 *
 * @param itemCount Number of rows currently rendered.
 * @param reverseOrder Newest-first, meaning new rows land at the top.
 * @param resetKey Identity of the current projection. A change means "different list", not
 *   "more of the same list".
 */

import { useLayoutEffect, useRef } from 'react'

export function useScrollAnchoring(itemCount: number, reverseOrder: boolean, resetKey = ''): void {
  const previousItemCount = useRef(itemCount)
  const previousScrollHeight = useRef(0)
  const previousResetKey = useRef(resetKey)

  useLayoutEffect(() => {
    const scrollContainer = document.querySelector('main')
    if (!scrollContainer) return

    // A different list entirely. Record where it starts and leave the reader alone.
    if (resetKey !== previousResetKey.current) {
      previousResetKey.current = resetKey
      previousScrollHeight.current = scrollContainer.scrollHeight
      previousItemCount.current = itemCount
      return
    }

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
