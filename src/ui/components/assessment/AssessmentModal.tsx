import type { AssessmentAnswer, AssessmentResponse, AssessmentVersion } from '@guidemode/types'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSwipe } from '../../hooks/useSwipe'
import { ProgressBar } from './ProgressBar'
import { QuestionCard } from './QuestionCard'
import { VersionSelector } from './VersionSelector'
import type { AssessmentModalProps } from './types'

type SlideDirection = 'left' | 'right' | null
type SlidePhase = 'idle' | 'exit' | 'enter'

export function AssessmentModal({
  sessionId: _sessionId,
  isOpen,
  onClose,
  questions,
  initialResponses = {},
  onSubmit,
  onDraft,
  title = 'Session Assessment',
  showVersionSelector,
  completionMessage = 'Your feedback has been submitted successfully.',
  previewMode = false,
  onComplete,
}: AssessmentModalProps) {
  // Auto-detect if version selector should be shown
  // Show if explicitly enabled, or if any question has a 'version' property
  const hasVersions = questions.some(q => q.version && q.version.length > 0)
  const shouldShowVersionSelector = showVersionSelector ?? hasVersions

  const [selectedVersion, setSelectedVersion] = useState<AssessmentVersion | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [responses, setResponses] = useState<Record<string, AssessmentAnswer>>(initialResponses)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [showCompletion, setShowCompletion] = useState(false)
  const [isTextInputFocused, setIsTextInputFocused] = useState(false)

  // Slide animation state
  const [slideDirection, setSlideDirection] = useState<SlideDirection>(null)
  const [slidePhase, setSlidePhase] = useState<SlidePhase>('idle')
  const slidePhaseRef = useRef<SlidePhase>('idle')
  const pendingIndex = useRef<number | null>(null)

  // Keep ref in sync with state
  slidePhaseRef.current = slidePhase

  // Reset start time when modal opens
  useEffect(() => {
    if (isOpen && !startTime) {
      setStartTime(Date.now())
    }
  }, [isOpen, startTime])

  // Filter questions based on selected version (if version selector is shown)
  const filteredQuestions =
    shouldShowVersionSelector && selectedVersion
      ? questions.filter(q => q.version?.includes(selectedVersion))
      : questions

  const currentQuestion = filteredQuestions[currentIndex]
  const isLastQuestion = currentIndex === filteredQuestions.length - 1
  const canGoNext = previewMode || responses[currentQuestion?.id] !== undefined

  // Auto-save draft every 30 seconds (disabled in preview mode)
  useEffect(() => {
    if (!isOpen || !onDraft || previewMode) return

    const interval = setInterval(() => {
      const responseArray = Object.entries(responses).map(([questionId, answer]) => ({
        questionId,
        answer,
        timestamp: new Date().toISOString(),
      }))

      if (responseArray.length > 0) {
        onDraft(responseArray).catch(console.error)
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [isOpen, responses, onDraft, previewMode])

  // Trigger a slide animation to a new index
  const triggerSlide = useCallback((direction: SlideDirection, newIndex: number) => {
    // Use ref to get current value, avoiding stale closure
    if (slidePhaseRef.current !== 'idle') return
    pendingIndex.current = newIndex
    setSlideDirection(direction)
    setSlidePhase('exit')
  }, [])

  // Keyboard navigation - use handler that reads current state
  useEffect(() => {
    if (!isOpen) return

    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if animation is in progress (check ref for latest value)
      if (slidePhaseRef.current !== 'idle') return

      // Ignore arrow keys if user is typing in a text field
      if (
        e.target instanceof HTMLTextAreaElement &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        return
      }

      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && canGoNext && !isLastQuestion) {
        triggerSlide('left', currentIndex + 1)
      } else if (e.key === 'ArrowRight' && canGoNext && !isLastQuestion) {
        e.preventDefault()
        triggerSlide('left', currentIndex + 1)
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault()
        triggerSlide('right', currentIndex - 1)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isOpen, onClose, triggerSlide, canGoNext, isLastQuestion, currentIndex])

  // Handle the end of exit animation
  const handleExitComplete = useCallback(() => {
    if (pendingIndex.current !== null) {
      setCurrentIndex(pendingIndex.current)
      pendingIndex.current = null
    }
    setSlidePhase('enter')
    // Small delay to ensure the DOM has updated with new question
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSlidePhase('idle')
        setSlideDirection(null)
      })
    })
  }, [])

  const handleAnswer = useCallback(
    (answer: AssessmentAnswer) => {
      setResponses(prev => ({
        ...prev,
        [currentQuestion.id]: answer,
      }))
    },
    [currentQuestion]
  )

  // Use refs for values needed by handleNext/handlePrevious to avoid stale closures
  // when called via setTimeout from QuestionCard auto-advance
  const currentIndexRef = useRef(currentIndex)
  const filteredQuestionsLengthRef = useRef(filteredQuestions.length)
  currentIndexRef.current = currentIndex
  filteredQuestionsLengthRef.current = filteredQuestions.length

  const handleNext = useCallback(() => {
    // Use refs to get latest values (important for setTimeout callbacks)
    if (
      currentIndexRef.current < filteredQuestionsLengthRef.current - 1 &&
      slidePhaseRef.current === 'idle'
    ) {
      triggerSlide('left', currentIndexRef.current + 1)
    }
  }, [triggerSlide])

  const handlePrevious = useCallback(() => {
    if (currentIndexRef.current > 0 && slidePhaseRef.current === 'idle') {
      triggerSlide('right', currentIndexRef.current - 1)
    }
  }, [triggerSlide])

  // Swipe gesture handling for mobile
  const {
    handlers: swipeHandlers,
    dragOffset,
    isDragging,
  } = useSwipe({
    onSwipeLeft: () => {
      if (canGoNext && !isLastQuestion) handleNext()
    },
    onSwipeRight: () => {
      if (currentIndex > 0) handlePrevious()
    },
    threshold: 50,
    disabled: isTextInputFocused || slidePhase !== 'idle',
  })

  const handleSubmit = async () => {
    setIsSubmitting(true)

    try {
      const responseArray: AssessmentResponse[] = Object.entries(responses).map(
        ([questionId, answer]) => ({
          questionId,
          answer,
          timestamp: new Date().toISOString(),
        })
      )

      // Calculate duration in seconds
      const durationSeconds = startTime ? Math.round((Date.now() - startTime) / 1000) : undefined

      await onSubmit(responseArray, durationSeconds)

      // Trigger completion callback (for confetti, etc.)
      onComplete?.()

      setShowCompletion(true)

      // Auto-close after showing completion
      setTimeout(() => {
        setShowCompletion(false)
        onClose()
      }, 2000)
    } catch (error) {
      console.error('Failed to submit assessment:', error)
      alert('Failed to submit assessment. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentIndex(0)
      setShowCompletion(false)
      setSelectedVersion(null)
      setStartTime(null)
      setSlideDirection(null)
      setSlidePhase('idle')
    }
  }, [isOpen])

  const handleVersionSelect = (version: AssessmentVersion) => {
    setSelectedVersion(version)
  }

  // Calculate transform for the question card
  const getTransform = () => {
    // During drag, follow the finger
    if (isDragging) {
      return `translateX(${dragOffset}px)`
    }

    // During exit animation, slide off screen
    if (slidePhase === 'exit') {
      return slideDirection === 'left' ? 'translateX(-100%)' : 'translateX(100%)'
    }

    // During enter animation, start off screen (opposite direction)
    if (slidePhase === 'enter') {
      return slideDirection === 'left' ? 'translateX(100%)' : 'translateX(-100%)'
    }

    // Idle state
    return 'translateX(0)'
  }

  const getTransition = () => {
    if (isDragging) return 'none'
    if (slidePhase === 'exit') return 'transform 0.25s ease-out'
    if (slidePhase === 'enter') return 'none' // Instant snap to start position
    return 'transform 0.2s ease-out' // Snap back if drag cancelled
  }

  if (!isOpen) return null

  // Completion screen
  if (showCompletion) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="w-full h-full sm:w-auto sm:h-auto sm:max-w-md bg-base-100 sm:rounded-2xl flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
              <CheckIcon className="w-10 h-10 text-success" />
            </div>
            <h3 className="text-2xl font-bold">Thank You!</h3>
            <p className="text-base-content/70">{completionMessage}</p>
          </div>
        </div>
      </div>
    )
  }

  // Version selection screen (only if version selector should be shown)
  if (shouldShowVersionSelector && !selectedVersion) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="w-full h-full sm:w-auto sm:h-auto sm:max-w-3xl bg-base-100 sm:rounded-2xl flex flex-col p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="text-lg md:text-xl font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="btn btn-sm btn-circle btn-ghost">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Version Selector */}
          <div className="flex-1">
            <VersionSelector onSelect={handleVersionSelect} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full h-full sm:w-[90vw] sm:max-w-4xl sm:h-auto sm:max-h-[90vh] bg-base-100 sm:rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 flex-shrink-0">
          <h2 className="text-lg md:text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-sm btn-circle btn-ghost">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-4 sm:px-6 flex-shrink-0">
          <ProgressBar
            current={currentIndex + 1}
            total={filteredQuestions.length}
            className="mb-2 sm:mb-4"
          />
        </div>

        {/* Mobile swipe hint */}
        <div className="flex sm:hidden justify-center text-xs text-base-content/40 mb-2 flex-shrink-0">
          Swipe to navigate
        </div>

        {/* Question with swipe handling */}
        <div className="flex-1 overflow-hidden px-4 sm:px-6 pb-6" {...swipeHandlers}>
          <div
            className="h-full"
            style={{
              transform: getTransform(),
              transition: getTransition(),
            }}
            onTransitionEnd={() => {
              if (slidePhase === 'exit') {
                handleExitComplete()
              }
            }}
          >
            {currentQuestion && (
              <QuestionCard
                question={currentQuestion}
                value={responses[currentQuestion.id]}
                onChange={handleAnswer}
                onNext={isLastQuestion ? handleSubmit : handleNext}
                onTextFocus={() => setIsTextInputFocused(true)}
                onTextBlur={() => setIsTextInputFocused(false)}
                autoFocus
              />
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-row items-center justify-between gap-3 p-4 md:p-6 border-t border-base-300 flex-shrink-0">
          {/* Previous button - Icon only on mobile/tablet, with text on desktop */}
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIndex === 0 || slidePhase !== 'idle'}
            className="btn btn-ghost btn-sm md:btn-md"
          >
            <ChevronLeftIcon className="w-5 h-5" />
            <span className="hidden md:inline">Previous</span>
          </button>

          {/* Keyboard hints - Center on desktop, hidden on mobile */}
          <div className="hidden md:block text-center text-xs text-base-content/50 space-y-1">
            <div>
              <kbd className="kbd kbd-xs">←</kbd> Previous • <kbd className="kbd kbd-xs">→</kbd>{' '}
              Next
              {currentQuestion?.type !== 'text' && (
                <span>
                  {' '}
                  • <kbd className="kbd kbd-xs">Esc</kbd> to close
                </span>
              )}
            </div>
            {(currentQuestion?.type === 'likert-5' || currentQuestion?.type === 'likert-7') && (
              <div className="text-base-content/40">Use number keys to select • Auto-advances</div>
            )}
            {currentQuestion?.type === 'choice' && (
              <div className="text-base-content/40">Use number or letter keys • Auto-advances</div>
            )}
          </div>

          {/* Next/Submit/Close button - Icon only on mobile/tablet, with text on desktop */}
          {isLastQuestion ? (
            <button
              type="button"
              onClick={previewMode ? onClose : handleSubmit}
              disabled={!previewMode && (!canGoNext || isSubmitting || slidePhase !== 'idle')}
              className="btn btn-primary btn-sm md:btn-md"
            >
              {previewMode ? (
                <>
                  <span className="hidden md:inline">Close</span>
                  <XMarkIcon className="w-5 h-5" />
                </>
              ) : isSubmitting ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  <span className="hidden md:inline">Submitting...</span>
                </>
              ) : (
                <>
                  <span className="hidden md:inline">Submit</span>
                  <CheckIcon className="w-5 h-5" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext || slidePhase !== 'idle'}
              className="btn btn-primary btn-sm md:btn-md"
            >
              <span className="hidden md:inline">Next</span>
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
