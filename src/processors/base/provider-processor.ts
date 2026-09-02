import { extractProviderSessionTotals } from '../../extractors/index.js'
import type { BaseMetricProcessor } from './metric-processor.js'
import type { ParsedSession, ProcessorContext, ProcessorResult } from './types.js'

export abstract class BaseProviderProcessor {
  abstract readonly providerName: string
  abstract readonly description: string

  /**
   * Parse the raw JSONL content into a structured session object
   * Each provider implements this differently based on their log format
   */
  abstract parseSession(jsonlContent: string, provider: string): ParsedSession

  /**
   * Get all metric processors for this provider
   * Each provider should return the same set of processors for consistency
   */
  abstract getMetricProcessors(): BaseMetricProcessor[]

  /**
   * Check if this processor can handle the given content
   * Default implementation just checks if content is valid JSON lines
   */
  canProcess(content: string): boolean {
    try {
      const lines = content.split('\n').filter(line => line.trim())
      if (lines.length === 0) return false

      // Try to parse first line as JSON to verify format
      JSON.parse(lines[0])
      return true
    } catch {
      return false
    }
  }

  /**
   * Process all metrics for a session
   * This orchestrates running all metric processors sequentially to ensure completion
   * Returns array of ProcessorResults - caller is responsible for storage
   */
  async processMetrics(
    jsonlContent: string,
    context: ProcessorContext
  ): Promise<ProcessorResult[]> {
    const session = this.parseSession(jsonlContent, context.provider)

    // The provider's own summary record - Claude's `cost-state`, Codex's cumulative
    // usage - carries no uuid or timestamp, so the message parser skips it. It can only
    // be read from raw content, and this is the one seam every provider reaches: each
    // subclass overrides `parseSession`, but they all arrive here. Attaching it in a
    // single subclass is how the cost pipeline shipped without ever running.
    if (!session.providerTotals) {
      session.providerTotals =
        extractProviderSessionTotals(jsonlContent, context.provider) ?? undefined
    }

    const processors = this.getMetricProcessors()

    // Run all processors sequentially to ensure each completes before the next
    const successfulResults: ProcessorResult[] = []

    for (const processor of processors) {
      try {
        if (!processor.canProcess(session)) {
          continue
        }

        const result = await processor.processToResult(session)

        if (!result || !result.metrics) {
          continue
        }

        successfulResults.push(result)
      } catch (_error) {
        // Silently continue on processor errors
      }
    }

    if (successfulResults.length === 0) {
      console.error(`⚠ WARNING: NO processors succeeded for session ${context.sessionId}!`)
    }

    return successfulResults
  }

  /**
   * Validate JSONL content format
   */
  protected validateJsonlContent(content: string): void {
    if (!content || content.trim().length === 0) {
      throw new Error('Content is empty')
    }

    const lines = content.split('\n').filter(line => line.trim())
    if (lines.length === 0) {
      throw new Error('No valid lines found in content')
    }

    // Validate first few lines as JSON
    const linesToCheck = Math.min(3, lines.length)
    for (let i = 0; i < linesToCheck; i++) {
      try {
        JSON.parse(lines[i])
      } catch (_error) {
        throw new Error(`Invalid JSON on line ${i + 1}: ${lines[i]}`)
      }
    }
  }

  /**
   * Extract timestamps from raw message data
   * Helper method for providers to implement
   */
  protected parseTimestamp(timestampStr: string | undefined): Date | null {
    if (!timestampStr) return null

    try {
      const date = new Date(timestampStr)
      if (Number.isNaN(date.getTime())) {
        return null
      }
      return date
    } catch (_error) {
      return null
    }
  }

  /**
   * Calculate session duration from start and end times
   */
  protected calculateDuration(startTime: Date | null, endTime: Date | null): number {
    if (!startTime || !endTime) return 0
    return Math.max(0, endTime.getTime() - startTime.getTime())
  }

  /**
   * Generate a unique message ID if not provided
   */
  protected generateMessageId(index: number, timestamp?: Date): string {
    const time = timestamp ? timestamp.getTime() : Date.now()
    return `msg_${time}_${index}`
  }
}
