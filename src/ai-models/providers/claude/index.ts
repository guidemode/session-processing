import { BaseModelAdapter } from '../../base/model-adapter.js'
import type { BaseModelTask } from '../../base/model-task.js'
import type {
  ModelAdapterConfig,
  ModelHealthCheck,
  ModelTaskContext,
  ModelTaskResult,
} from '../../base/types.js'
import { ClaudeAPIClient } from './client.js'

/**
 * Claude Model Adapter
 * Integrates Anthropic's Claude API for AI processing tasks
 */
export class ClaudeModelAdapter extends BaseModelAdapter {
  readonly name = 'claude'
  readonly description = 'Anthropic Claude API adapter for AI model tasks'

  private client: ClaudeAPIClient
  private tasks: BaseModelTask[] = []

  constructor(config: ModelAdapterConfig) {
    super(config)

    this.client = new ClaudeAPIClient({
      apiKey: config.apiKey,
      model: config.model || 'claude-sonnet-5',
      maxTokens: config.maxTokens || 4096,
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
   * Execute a task using Claude
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
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        })
        rawOutput = result.data
        tokensUsed = result.usage.input_tokens + result.usage.output_tokens
      } else {
        const result = await this.client.prompt(prompt, {
          model: this.config.model,
          maxTokens: this.config.maxTokens,
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
          modelUsed: this.config.model || 'claude-sonnet-5',
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
          modelUsed: this.config.model || 'claude-sonnet-5',
          processingTime,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }
    }
  }

  /**
   * Health check using Claude API
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
   * Calculate cost for Claude API usage
   * Based on Claude 3.5 Sonnet pricing (as of 2024)
   * Input: $3 per million tokens
   * Output: $15 per million tokens
   */
  protected calculateCost(tokensUsed: number): number {
    // Rough estimate: assume 50/50 split between input and output
    const inputTokens = Math.floor(tokensUsed * 0.5)
    const outputTokens = Math.ceil(tokensUsed * 0.5)

    const inputCost = (inputTokens / 1_000_000) * 3.0
    const outputCost = (outputTokens / 1_000_000) * 15.0

    return inputCost + outputCost
  }
}
