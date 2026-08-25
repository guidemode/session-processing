import { BaseModelAdapter } from '../../base/model-adapter.js'
import type { BaseModelTask } from '../../base/model-task.js'
import type {
  ModelAdapterConfig,
  ModelHealthCheck,
  ModelTaskContext,
  ModelTaskResult,
} from '../../base/types.js'
import { GeminiAPIClient } from './client.js'

/**
 * Gemini Model Adapter
 * Integrates Google's Gemini API for AI processing tasks
 */
export class GeminiModelAdapter extends BaseModelAdapter {
  readonly name = 'gemini'
  readonly description = 'Google Gemini API adapter for AI model tasks'

  private client: GeminiAPIClient
  private tasks: BaseModelTask[] = []

  constructor(config: ModelAdapterConfig) {
    super(config)

    this.client = new GeminiAPIClient({
      apiKey: config.apiKey,
      model: config.model || 'gemini-3.7-flash',
      maxOutputTokens: config.maxTokens || 8192,
      temperature: config.temperature ?? 1.0,
      timeout: config.timeout,
      fetch: config.fetch,
    })
  }

  /**
   * Register a task with this adapter
   */
  registerTask(task: BaseModelTask): void {
    this.tasks.push(task)
  }

  /**
   * Get all available tasks
   */
  getAvailableTasks(): BaseModelTask[] {
    return this.tasks
  }

  /**
   * Execute a task using Gemini
   */
  async executeTask(task: BaseModelTask, context: ModelTaskContext): Promise<ModelTaskResult> {
    const startTime = Date.now()

    try {
      // Check if task can be executed
      if (!task.canExecute(context)) {
        throw new Error(`Task ${task.taskType} cannot be executed with provided context`)
      }

      // Get task configuration
      const config = task.getConfig()

      // Prepare input from context
      const input = task.prepareInput(context)

      // Format prompt with input variables
      const prompt = this.formatPrompt(
        config.prompt,
        input as Record<string, string | number | boolean | null | undefined>
      )

      // Execute based on response format
      let rawOutput: unknown
      let tokensUsed = 0

      if (config.responseFormat.type === 'json') {
        const result = await this.client.promptJSON(prompt, {
          model: this.config.model,
          maxOutputTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        })
        rawOutput = result.data
        tokensUsed = result.usage.input_tokens + result.usage.output_tokens
      } else {
        const result = await this.client.prompt(prompt, {
          model: this.config.model,
          maxOutputTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        })
        rawOutput = result.text
        tokensUsed = result.usage.input_tokens + result.usage.output_tokens
      }

      // Process output through task
      const output = task.processOutput(rawOutput, context)

      const processingTime = Date.now() - startTime
      const cost = this.calculateCost(tokensUsed)

      return {
        taskType: task.taskType,
        success: true,
        output,
        metadata: {
          modelUsed: this.config.model || 'gemini-3.7-flash',
          tokensUsed,
          processingTime,
          cost,
        },
      }
    } catch (error) {
      const processingTime = Date.now() - startTime

      console.error(`Failed to execute task ${task.taskType}:`, error)

      return {
        taskType: task.taskType,
        success: false,
        output: null,
        metadata: {
          modelUsed: this.config.model || 'gemini-3.7-flash',
          processingTime,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }
    }
  }

  /**
   * Health check using Gemini API
   */
  async healthCheck(): Promise<ModelHealthCheck> {
    // First check config
    if (!this.validateConfig()) {
      return {
        healthy: false,
        error: 'Invalid configuration',
      }
    }

    // Then test actual API
    try {
      const result = await this.client.healthCheck()
      return result
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Calculate cost for Gemini API usage
   * Based on Gemini 3.7 Flash intro pricing (through 2026-12-31)
   * Input: $0.75 per million tokens
   * Output: $3.75 per million tokens
   */
  protected calculateCost(tokensUsed: number): number {
    // Rough estimate: assume 50/50 split between input and output
    const inputTokens = Math.floor(tokensUsed * 0.5)
    const outputTokens = Math.ceil(tokensUsed * 0.5)

    const inputCost = (inputTokens / 1_000_000) * 0.75
    const outputCost = (outputTokens / 1_000_000) * 3.75

    return inputCost + outputCost
  }
}
