import type { BaseModelTask } from './model-task.js'
import type {
  ModelAdapterConfig,
  ModelHealthCheck,
  ModelTaskConfig,
  ModelTaskContext,
  ModelTaskDefinition,
  ModelTaskResult,
} from './types.js'

/**
 * Base class for AI model adapters (Claude, OpenAI, etc.)
 * Handles communication with external AI APIs
 */
export abstract class BaseModelAdapter {
  abstract readonly name: string
  abstract readonly description: string

  protected config: ModelAdapterConfig

  constructor(config: ModelAdapterConfig) {
    this.config = config
  }

  /**
   * Execute a task with the AI model
   */
  abstract executeTask(task: BaseModelTask, context: ModelTaskContext): Promise<ModelTaskResult>

  /**
   * Get all available tasks for this adapter
   */
  abstract getAvailableTasks(): BaseModelTask[]

  /**
   * Validate adapter configuration
   */
  validateConfig(): boolean {
    if (!this.config.apiKey || this.config.apiKey.trim().length === 0) {
      console.warn(`${this.name}: API key is missing or empty`)
      return false
    }
    return true
  }

  /**
   * Health check to verify the adapter is working
   */
  async healthCheck(): Promise<ModelHealthCheck> {
    const startTime = Date.now()

    try {
      if (!this.validateConfig()) {
        return {
          healthy: false,
          error: 'Invalid configuration',
        }
      }

      // Subclasses should override to perform actual health check
      return {
        healthy: true,
        latency: Date.now() - startTime,
      }
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Get adapter information for debugging
   */
  getInfo() {
    return {
      name: this.name,
      description: this.description,
      model: this.config.model,
      availableTasks: this.getAvailableTasks().map(task => task.getDefinition()),
    }
  }

  /**
   * Format a prompt with context variables
   */
  protected formatPrompt(
    template: string,
    variables: Record<string, string | number | boolean | null | undefined>
  ): string {
    // Single pass with a replacer function. Two reasons this must not be a loop of
    // string replacements:
    //   1. A string replacement interprets $&, $`, $' and $1 in the REPLACEMENT, so any
    //      of those sequences appearing in injected session content would corrupt the
    //      prompt. A replacer function is taken literally.
    //   2. Substituting keys one at a time lets a {{token}} inside already-injected
    //      content be clobbered by a later key.
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      if (!Object.hasOwn(variables, key)) {
        return match
      }
      return String(variables[key] ?? '')
    })
  }

  /**
   * Calculate estimated cost based on tokens
   * Subclasses should override with their pricing model
   */
  protected calculateCost(_tokensUsed: number): number {
    return 0 // Override in subclass
  }
}
