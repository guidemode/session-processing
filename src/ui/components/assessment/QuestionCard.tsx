import { PencilIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef } from 'react'
import { ChoiceResponse } from './ChoiceResponse'
import { LikertScale } from './LikertScale'
import { TextResponse } from './TextResponse'
import type { QuestionCardProps } from './types'

export function QuestionCard({
  question,
  value,
  onChange,
  onNext,
  autoFocus,
  onTextFocus,
  onTextBlur,
  previewMode,
  onEditQuestion,
}: QuestionCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoFocus && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [autoFocus])

  // Keyboard shortcuts
  useEffect(() => {
    if (!autoFocus) return // Only active when this question is focused

    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in a text field
      if (e.target instanceof HTMLTextAreaElement) return

      const key = e.key.toLowerCase()

      // Number keys for Likert scales (but not NPS - too many options for keyboard)
      if (question.type === 'likert-5' || question.type === 'likert-7') {
        const maxScale = question.type === 'likert-5' ? 5 : 7
        const num = Number.parseInt(key)

        if (!Number.isNaN(num) && num >= 1 && num <= maxScale) {
          e.preventDefault()
          handleLikertChange(num)
        }
      }

      // NPS (0-10) has 11 options - no clean keyboard mapping, so disabled

      // Number keys or letter keys for multiple choice
      if (question.type === 'choice' && question.choices) {
        let choiceIndex = -1

        // Check for number keys (1-9)
        const num = Number.parseInt(key)
        if (!Number.isNaN(num) && num >= 1 && num <= question.choices.length) {
          choiceIndex = num - 1
        }
        // Check for letter keys (a-z)
        else if (key >= 'a' && key <= 'z') {
          const letterIndex = key.charCodeAt(0) - 'a'.charCodeAt(0)
          if (letterIndex < question.choices.length) {
            choiceIndex = letterIndex
          }
        }

        if (choiceIndex >= 0) {
          e.preventDefault()
          handleChoiceChange(question.choices[choiceIndex].id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, question])

  const handleLikertChange = (numValue: number) => {
    // Check if this is actually a change
    const isChanging = !value || value.type !== 'likert' || value.value !== numValue

    onChange({ type: 'likert', value: numValue })

    // Only auto-advance if we're actually changing the answer
    if (isChanging && onNext) {
      setTimeout(onNext, 300)
    }
  }

  const handleTextChange = (textValue: string) => {
    onChange({ type: 'text', value: textValue })
  }

  const handleChoiceChange = (choiceValue: string) => {
    // Check if this is actually a change
    const isChanging = !value || value.type !== 'choice' || value.value !== choiceValue

    onChange({ type: 'choice', value: choiceValue })

    // Only auto-advance if we're actually changing the answer
    if (isChanging && onNext) {
      setTimeout(onNext, 300)
    }
  }

  const handleSkip = () => {
    onChange({ type: 'skipped' })
    if (onNext) {
      onNext()
    }
  }

  const handleNumberChange = (numValue: number) => {
    onChange({ type: 'number', value: numValue })
  }

  const handleBooleanChange = (boolValue: boolean) => {
    // Check if this is actually a change
    const isChanging = !value || value.type !== 'boolean' || value.value !== boolValue

    onChange({ type: 'boolean', value: boolValue })

    // Only auto-advance if we're actually changing the answer
    if (isChanging && onNext) {
      setTimeout(onNext, 300)
    }
  }

  const renderInput = () => {
    switch (question.type) {
      case 'likert-5':
        return (
          <LikertScale
            scale={5}
            value={value?.type === 'likert' ? value.value : undefined}
            onChange={handleLikertChange}
            labels={question.labels}
            reverseScored={question.reverseScored}
          />
        )
      case 'likert-7':
        return (
          <LikertScale
            scale={7}
            value={value?.type === 'likert' ? value.value : undefined}
            onChange={handleLikertChange}
            labels={question.labels}
            reverseScored={question.reverseScored}
          />
        )
      case 'nps':
        return (
          <LikertScale
            scale={11}
            startValue={0}
            value={value?.type === 'likert' ? value.value : undefined}
            onChange={handleLikertChange}
            labels={question.labels}
            reverseScored={question.reverseScored}
          />
        )
      case 'text':
        return (
          <TextResponse
            value={value?.type === 'text' ? value.value : undefined}
            onChange={handleTextChange}
            placeholder={question.placeholder}
            onFocus={onTextFocus}
            onBlur={onTextBlur}
          />
        )
      case 'choice':
        return (
          <ChoiceResponse
            choices={question.choices || []}
            value={value?.type === 'choice' ? value.value : undefined}
            onChange={handleChoiceChange}
          />
        )
      case 'number':
        return (
          <div className="flex flex-col items-center gap-4">
            <input
              type="number"
              className="input input-bordered input-lg w-32 text-center text-2xl"
              value={value?.type === 'number' ? value.value : ''}
              onChange={e => {
                const num = Number.parseFloat(e.target.value)
                if (!Number.isNaN(num)) {
                  handleNumberChange(num)
                }
              }}
              min={question.min}
              max={question.max}
              placeholder="0"
            />
          </div>
        )
      case 'boolean':
        return (
          <div className="flex gap-4 justify-center">
            <button
              type="button"
              className={`btn btn-lg ${value?.type === 'boolean' && value.value === false ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleBooleanChange(false)}
            >
              {question.labels?.[0] || 'No'}
            </button>
            <button
              type="button"
              className={`btn btn-lg ${value?.type === 'boolean' && value.value === true ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleBooleanChange(true)}
            >
              {question.labels?.[1] || 'Yes'}
            </button>
          </div>
        )
      default:
        return <div className="text-error">Unknown question type: {question.type}</div>
    }
  }

  const hasAnswer = value && value.type !== 'skipped'

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Question text */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-2xl font-semibold">{question.text}</h3>
          {previewMode && onEditQuestion && (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle"
              onClick={() => onEditQuestion(question.id)}
              title="Edit this question"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        {question.helpText && <p className="text-sm text-base-content/60">{question.helpText}</p>}
        {!question.required && <p className="text-xs text-base-content/50">(Optional)</p>}
      </div>

      {/* Input */}
      <div className="max-w-2xl mx-auto">{renderInput()}</div>

      {/* Skip button for optional questions */}
      {!question.required && !hasAnswer && (
        <div className="text-center">
          <button type="button" onClick={handleSkip} className="btn btn-ghost btn-sm">
            {question.skipLabel || 'Skip'}
          </button>
        </div>
      )}
    </div>
  )
}
