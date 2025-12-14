import { useEffect, useState } from 'react'
import type { LikertScaleProps } from './types'

export function LikertScale({
  scale,
  value,
  onChange,
  labels,
  disabled = false,
  startValue = 1,
  reverseScored = false,
}: LikertScaleProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const numbers = Array.from({ length: scale }, (_, i) => i + startValue)

  // Reset hover state when the selected value changes (indicates new question or reset)
  // biome-ignore lint/correctness/useExhaustiveDependencies: value prop change is intentional trigger
  useEffect(() => {
    setHoverValue(null)
  }, [value])

  // Determine label colors based on scoring direction
  // reverseScored = true means low scores are positive (e.g., "Never" checking = good)
  const leftLabelColor = reverseScored ? 'text-success' : 'text-error'
  const rightLabelColor = reverseScored ? 'text-error' : 'text-success'

  // For NPS (scale === 11), split into two rows on mobile: 0-5 and 6-10
  const isNPS = scale === 11 && startValue === 0

  return (
    <div className="space-y-4">
      {/* Scale buttons with labels underneath */}
      <div className="space-y-3">
        {/* Desktop: single row for all scales */}
        <div className="hidden md:flex justify-center gap-2">
          {numbers.map(num => {
            const isSelected = value === num
            const isHovered = hoverValue === num

            return (
              <button
                key={num}
                type="button"
                onClick={() => !disabled && onChange(num)}
                onMouseEnter={() => setHoverValue(num)}
                onMouseLeave={() => setHoverValue(null)}
                disabled={disabled}
                className={`
                  w-12 h-12 rounded-full font-semibold text-lg
                  transition-all duration-200 relative
                  ${
                    isSelected
                      ? 'bg-primary text-primary-content scale-110 shadow-lg'
                      : isHovered
                        ? 'bg-primary/20 scale-105'
                        : 'bg-base-200 hover:bg-base-300'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {num}
              </button>
            )
          })}
        </div>

        {/* Mobile: two rows for NPS (0-5, 6-10), single row for other scales */}
        {isNPS ? (
          <>
            {/* First row: 0-5 */}
            <div className="flex md:hidden justify-center gap-2">
              {numbers.slice(0, 6).map(num => {
                const isSelected = value === num
                const isHovered = hoverValue === num

                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => !disabled && onChange(num)}
                    onMouseEnter={() => setHoverValue(num)}
                    onMouseLeave={() => setHoverValue(null)}
                    disabled={disabled}
                    className={`
                      w-12 h-12 rounded-full font-semibold text-lg
                      transition-all duration-200 relative
                      ${
                        isSelected
                          ? 'bg-primary text-primary-content scale-110 shadow-lg'
                          : isHovered
                            ? 'bg-primary/20 scale-105'
                            : 'bg-base-200 hover:bg-base-300'
                      }
                      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {num}
                  </button>
                )
              })}
            </div>

            {/* Second row: 6-10 */}
            <div className="flex md:hidden justify-center gap-2">
              {numbers.slice(6).map(num => {
                const isSelected = value === num
                const isHovered = hoverValue === num

                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => !disabled && onChange(num)}
                    onMouseEnter={() => setHoverValue(num)}
                    onMouseLeave={() => setHoverValue(null)}
                    disabled={disabled}
                    className={`
                      w-12 h-12 rounded-full font-semibold text-lg
                      transition-all duration-200 relative
                      ${
                        isSelected
                          ? 'bg-primary text-primary-content scale-110 shadow-lg'
                          : isHovered
                            ? 'bg-primary/20 scale-105'
                            : 'bg-base-200 hover:bg-base-300'
                      }
                      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {num}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          /* Mobile: single row for non-NPS scales */
          <div className="flex md:hidden justify-center gap-2">
            {numbers.map(num => {
              const isSelected = value === num
              const isHovered = hoverValue === num

              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => !disabled && onChange(num)}
                  onMouseEnter={() => setHoverValue(num)}
                  onMouseLeave={() => setHoverValue(null)}
                  disabled={disabled}
                  className={`
                    w-12 h-12 rounded-full font-semibold text-lg
                    transition-all duration-200 relative
                    ${
                      isSelected
                        ? 'bg-primary text-primary-content scale-110 shadow-lg'
                        : isHovered
                          ? 'bg-primary/20 scale-105'
                          : 'bg-base-200 hover:bg-base-300'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {num}
                </button>
              )
            })}
          </div>
        )}

        {/* Labels directly under first and last buttons */}
        {labels && (
          <div className="flex justify-between px-6">
            <span className={`text-sm font-bold ${leftLabelColor}`}>{labels[0]}</span>
            <span className={`text-sm font-bold ${rightLabelColor}`}>{labels[1]}</span>
          </div>
        )}
      </div>

      {/* Keyboard hint - only show for scales that support it (not NPS), hidden on mobile */}
      {scale <= 7 && (
        <div className="hidden md:block text-center text-xs text-base-content/50">
          Press <kbd className="kbd kbd-xs">{startValue}</kbd> -{' '}
          <kbd className="kbd kbd-xs">{startValue + scale - 1}</kbd> to select
        </div>
      )}

      {/* Current selection display */}
      {value && (
        <div className="text-center text-sm text-primary font-medium">Selected: {value}</div>
      )}
    </div>
  )
}
