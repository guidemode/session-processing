// Condensed transcript (spans)
export * from './transcript/index.js'

/**
 * UI Components - Session Processing Components
 *
 * This package provides UI components for displaying and interacting with AI session data.
 * Components are designed to be framework-agnostic and accept data via props.
 */

// Timeline Components - For rendering session messages and content
export {
  TimelineMessage,
  TimelineGroup,
  MessageHeader,
  ContentRenderer,
  TextBlock,
  CodeBlock,
  ImageBlock,
  JsonBlock,
  ToolBlock,
  ToolResultBlock,
} from './timeline/index.js'

// Phase Timeline Components - For rendering session phase analysis
export {
  PhaseTimeline,
  PhaseBlock,
  PhaseHeader,
  PhaseStats,
  PhaseSummary,
  getPhaseIcon,
  getPhaseColor,
  getPhaseBorderColor,
  formatPhaseType,
  type SessionPhaseType,
  type SessionPhase,
  type SessionPhaseAnalysis,
} from './phase/index.js'

// Metrics Components - For displaying session analytics
export { MetricCard } from './metrics/MetricCard.js'
export { MetricSection } from './metrics/MetricSection.js'
export { AssessmentSection } from './metrics/AssessmentSection.js'
export { MetricsOverview, type SessionMetricsUI } from './metrics/MetricsOverview.js'

// Utility Components - Filters and UI elements
export { default as DateFilter } from './DateFilter.js'
export type { DateFilterOption, DateRange, DateFilterValue } from './DateFilter.js'

// Rating Components - For quick session ratings
export { RatingBadge, type RatingBadgeProps } from './RatingBadge.js'
export { QuickRatingPopover, type QuickRatingPopoverProps } from './QuickRatingPopover.js'
export type { SessionRating } from '../../utils/rating.js'

// Session Components - For displaying session cards
export { default as SessionCard } from './SessionCard.js'
export { SessionDetailHeader, type SessionDetailHeaderProps } from './SessionDetailHeader.js'
export { SessionTodosTab } from './SessionTodosTab.js'

// Token Usage Chart - For visualizing token usage in sessions
export { TokenUsageChart, type TokenUsageChartProps } from './TokenUsageChart.js'

// Scroll to Top Button - Floating button for scrolling to top
export { ScrollToTopButton, type ScrollToTopButtonProps } from './ScrollToTopButton.js'

// Assessment Components - For session assessment and feedback
export {
  AssessmentModal,
  QuestionCard,
  LikertScale,
  TextResponse,
  ChoiceResponse,
  ProgressBar,
  VersionSelector,
} from './assessment/index.js'
export type {
  AssessmentModalProps,
  QuestionCardProps,
  LikertScaleProps,
  TextResponseProps,
  ProgressBarProps,
} from './assessment/index.js'

/**
 * Note about SessionList:
 *
 * The SessionList component was not included because it has heavy dependencies on:
 * - Server-specific API hooks (useAgentSessions, useAuth, etc.)
 * - WebSocket stores for real-time updates
 * - React Router for URL-based state management
 * - Complex server-specific UI components
 *
 * Instead, use the SessionCard component and build your own list component
 * that integrates with your data fetching and state management solution.
 *
 * See SESSION_LIST_NOTE.md for more details.
 */
