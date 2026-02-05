import type {
  AssessmentAnswer,
  AssessmentQuestionConfig,
  AssessmentResponse,
  SurveyChoice,
} from '@guidemode/types'

// Base question interface that both AssessmentQuestionConfig and SurveyQuestion can satisfy
export interface BaseQuestionConfig {
  id: string
  text: string
  type: 'likert-5' | 'likert-7' | 'nps' | 'text' | 'choice' | 'number' | 'boolean'
  required: boolean
  labels?: [string, string]
  choices?: SurveyChoice[] // Array of choice objects with id and text
  placeholder?: string
  helpText?: string
  reverseScored?: boolean
  skipLabel?: string
  version?: string[]
  importance?: 'low' | 'medium' | 'high'
  min?: number // For number type
  max?: number // For number type
}

export interface AssessmentModalProps {
  sessionId?: string // Optional for non-session surveys
  isOpen: boolean
  onClose: () => void
  questions: BaseQuestionConfig[] // Accept any compatible question config
  initialResponses?: Record<string, AssessmentAnswer>
  onSubmit: (responses: AssessmentResponse[], durationSeconds?: number) => Promise<void>
  onDraft?: (responses: AssessmentResponse[]) => Promise<void>
  // Config options
  title?: string // Default: "Session Assessment"
  showVersionSelector?: boolean // Default: auto-detect based on questions having 'version' property
  completionMessage?: string // Default: "Your feedback has been submitted successfully."
  previewMode?: boolean // If true, allows browsing questions without saving responses
  onComplete?: () => void // Called after successful submission (for confetti, etc.)
  onEditQuestion?: (questionId: string) => void // Called when edit button is clicked (only shown in previewMode)
}

export interface QuestionCardProps {
  question: BaseQuestionConfig
  value?: AssessmentAnswer
  onChange: (answer: AssessmentAnswer) => void
  onNext?: () => void
  autoFocus?: boolean
  onTextFocus?: () => void
  onTextBlur?: () => void
  previewMode?: boolean
  onEditQuestion?: (questionId: string) => void
}

export interface LikertScaleProps {
  scale: 5 | 7 | 11
  value?: number
  onChange: (value: number) => void
  labels?: [string, string]
  disabled?: boolean
  startValue?: number // For NPS (0-10), defaults to 1 for standard Likert
  reverseScored?: boolean // True if low scores are positive (e.g., "Never" = good)
}

export interface TextResponseProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  onFocus?: () => void
  onBlur?: () => void
}

export interface ProgressBarProps {
  current: number
  total: number
  className?: string
}
