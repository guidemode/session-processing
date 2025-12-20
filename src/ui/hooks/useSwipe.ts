import { useCallback, useRef, useState } from 'react'

export interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number // minimum swipe distance to trigger (default: 50px)
  disabled?: boolean // disable swipe handling (e.g., when text input focused)
}

export interface UseSwipeReturn {
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: () => void
  }
  dragOffset: number // current X offset during drag (pixels)
  isDragging: boolean // true while user is actively dragging
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  disabled = false,
}: UseSwipeOptions): UseSwipeReturn {
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const isHorizontalSwipe = useRef<boolean | null>(null)

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return

      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      isHorizontalSwipe.current = null
      setIsDragging(true)
    },
    [disabled]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || touchStartX.current === null || touchStartY.current === null) return

      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      const deltaX = currentX - touchStartX.current
      const deltaY = currentY - touchStartY.current

      // Determine if this is a horizontal or vertical swipe (only once per gesture)
      if (isHorizontalSwipe.current === null) {
        const absX = Math.abs(deltaX)
        const absY = Math.abs(deltaY)

        // Wait until we have enough movement to determine direction
        if (absX > 10 || absY > 10) {
          isHorizontalSwipe.current = absX > absY
        }
      }

      // Only track horizontal swipes
      if (isHorizontalSwipe.current) {
        setDragOffset(deltaX)
      }
    },
    [disabled]
  )

  const onTouchEnd = useCallback(() => {
    if (disabled) {
      setIsDragging(false)
      return
    }

    const wasHorizontalSwipe = isHorizontalSwipe.current === true
    const finalOffset = dragOffset

    // Reset touch tracking
    touchStartX.current = null
    touchStartY.current = null
    isHorizontalSwipe.current = null
    setIsDragging(false)
    setDragOffset(0)

    // Only trigger callbacks for horizontal swipes that exceed threshold
    if (!wasHorizontalSwipe) return

    if (finalOffset < -threshold && onSwipeLeft) {
      onSwipeLeft()
    } else if (finalOffset > threshold && onSwipeRight) {
      onSwipeRight()
    }
  }, [disabled, dragOffset, threshold, onSwipeLeft, onSwipeRight])

  return {
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    dragOffset,
    isDragging,
  }
}
