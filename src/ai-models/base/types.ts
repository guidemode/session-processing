import type { ProcessorResult } from '@guidemode/types'
import type { ParsedSession } from '../../processors/base/types.js'

/**
 * Configuration for an AI model task
 */
export interface ModelTaskConfig {
  taskType: string
  prompt: string
  inputSchema?: Record<string, unknown>
  responseFormat: {
    type: 'json' | 'text'
    schema?: Record<string, unknown>
  }
  recordingStrategy: {
    updateAgentSession?: string[] // Field names to update in agent_sessions
    createMetrics?: boolean // Store as session_metrics entry
    metricType?: string // Which metric type to use if createMetrics is true
  }
}

/**
 * Result from executing an AI model task
 * Generic type parameter TOutput represents the task's output type
 */
export interface ModelTaskResult<TOutput = unknown> {
  taskType: string
  success: boolean
  output: TOutput
  metadata: {
    modelUsed: string
    tokensUsed?: number
    processingTime: number
    cost?: number
    error?: string
  }
}

/**
 * Definition of an available AI model task
 */
export interface ModelTaskDefinition {
  taskType: string
  name: string
  description: string
  config: ModelTaskConfig
}

/**
 * Context for AI model task execution
 */
export interface ModelTaskContext {
  sessionId: string
  tenantId: string
  userId: string
  provider: string
  session?: ParsedSession
  user?: {
    name?: string | null
    username?: string | null
    email?: string | null
  }
  /**
   * Metrics already computed for this session, passed through so tasks can reuse real
   * numbers instead of re-deriving them badly.
   *
   * `prepareInput` is synchronous while the metric processors are async, so a task cannot
   * compute these itself. Both callers already run the processors before the AI stage
   * (server: `processMetrics` precedes the AI block; desktop: `processMetrics` runs in
   * the same handler), making this a pass-through rather than extra work. Optional:
   * tasks fall back to signals derived from the transcript when it is absent.
   */
  metrics?: ProcessorResult[]
}

/**
 * Configuration for an AI model adapter
 */
export interface ModelAdapterConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
  timeout?: number
  fetch?: typeof fetch
}

/**
 * Health check result
 */
export interface ModelHealthCheck {
  healthy: boolean
  latency?: number
  error?: string
}
