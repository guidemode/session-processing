// Export base classes and types
export * from './base/index.js'

// Export providers
export {
  ClaudeModelAdapter,
  GeminiModelAdapter,
  OpenAIModelAdapter,
} from './providers/index.js'

// Export API clients
export { ClaudeAPIClient } from './providers/claude/client.js'
export { GeminiAPIClient } from './providers/gemini/client.js'
export { OpenAIAPIClient } from './providers/openai/client.js'

// Export client types
export type { GeminiModel, GeminiModelsResponse, GeminiThinkingLevel } from './providers/gemini/client.js'
export type { OpenAIModel, OpenAIModelsResponse } from './providers/openai/client.js'

// Export tasks
export {
  SessionSummaryTask,
  QualityAssessmentTask,
  IntentExtractionTask,
  SessionPhaseAnalysisTask,
} from './providers/index.js'
