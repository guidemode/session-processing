import { CanonicalParser } from '../../../parsers/index.js'
import { type BaseMetricProcessor, BaseProviderProcessor } from '../../base/index.js'
import {
  CanonicalContextProcessor,
  CanonicalCostProcessor,
  CanonicalEngagementProcessor,
  CanonicalErrorProcessor,
  CanonicalPerformanceProcessor,
  CanonicalQualityProcessor,
  CanonicalUsageProcessor,
} from '../../canonical/index.js'

export class CursorProcessor extends BaseProviderProcessor {
  readonly providerName = 'cursor'
  readonly description = 'Processes Cursor session logs (uses canonical metrics)'

  private parser = new CanonicalParser()
  private metricProcessors: BaseMetricProcessor[]

  constructor() {
    super()

    // Use canonical metrics processors - no provider-specific logic needed
    this.metricProcessors = [
      new CanonicalPerformanceProcessor(),
      new CanonicalEngagementProcessor(),
      new CanonicalQualityProcessor(),
      new CanonicalUsageProcessor(),
      new CanonicalErrorProcessor(),
      new CanonicalContextProcessor(),
      new CanonicalCostProcessor(),
    ]
  }

  parseSession(jsonlContent: string, _provider: string) {
    this.validateJsonlContent(jsonlContent)
    // Parser returns canonical format, preserve real provider name
    const session = this.parser.parseSession(jsonlContent)
    session.provider = this.providerName // Override to keep 'cursor'
    return session
  }

  getMetricProcessors(): BaseMetricProcessor[] {
    return this.metricProcessors
  }

  canProcess(content: string): boolean {
    try {
      const lines = content.split('\n').filter(line => line.trim())
      if (lines.length === 0) return false

      // Check for Cursor-specific markers in canonical format
      for (const line of lines) {
        try {
          const data = JSON.parse(line)

          // Look for Cursor provider identifier
          if (data.provider === 'cursor') {
            return true
          }

          // Also check providerMetadata for Cursor-specific fields
          if (data.providerMetadata?.source === 'cursor') {
            return true
          }
        } catch {
          // Skip lines that fail to parse
        }
      }

      return false
    } catch (_error) {
      return false
    }
  }

  /**
   * Validate Cursor-specific format
   */
  protected validateJsonlContent(content: string): void {
    if (!content || content.trim().length === 0) {
      throw new Error('Content is empty')
    }

    const lines = content.split('\n').filter(line => line.trim())
    if (lines.length === 0) {
      throw new Error('No valid JSONL lines found')
    }

    let hasValidMessage = false

    // Validate a few lines
    const targetValidLines = Math.min(3, lines.length)
    let validatedLines = 0

    for (let i = 0; i < lines.length && validatedLines < targetValidLines; i++) {
      try {
        const data = JSON.parse(lines[i])

        // Check for canonical message structure
        if (data.uuid && data.timestamp && data.type && data.message) {
          hasValidMessage = true
          validatedLines++
        }
      } catch (_error) {
        // Skip lines that fail to parse
      }
    }

    if (!hasValidMessage) {
      throw new Error('No valid canonical messages found')
    }
  }
}
