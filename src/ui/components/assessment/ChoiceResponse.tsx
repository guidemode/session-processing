interface ChoiceResponseProps {
  choices: string[]
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function ChoiceResponse({
  choices,
  value,
  onChange,
  disabled = false,
}: ChoiceResponseProps) {
  const getKeyboardHint = (index: number) => {
    if (index < 9) {
      // Support up to 9 options (1-9)
      const letter = String.fromCharCode(65 + index) // A, B, C, D, E, F, G, H, I...
      return `${index + 1} / ${letter}`
    }
    return null
  }

  return (
    <div className="space-y-2">
      {choices.map((choice, index) => {
        const isSelected = value === choice
        const keyHint = getKeyboardHint(index)

        return (
          <button
            key={choice}
            type="button"
            onClick={() => !disabled && onChange(choice)}
            disabled={disabled}
            className={`
              w-full text-left px-4 py-3 rounded-lg
              transition-all duration-200
              ${
                isSelected
                  ? 'bg-primary text-primary-content shadow-md'
                  : 'bg-base-200 hover:bg-base-300'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="flex items-center gap-3">
              <div
                className={`
                w-5 h-5 rounded-full border-2 flex items-center justify-center
                ${isSelected ? 'border-primary-content' : 'border-base-content/30'}
              `}
              >
                {isSelected && <div className="w-3 h-3 rounded-full bg-primary-content" />}
              </div>
              <span className="flex-1">{choice}</span>
              {keyHint && (
                <kbd
                  className={`hidden md:inline kbd kbd-sm ${isSelected ? 'opacity-70' : 'opacity-50'}`}
                >
                  {keyHint}
                </kbd>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
