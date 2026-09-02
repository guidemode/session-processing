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

export class GeminiProcessor extends BaseProviderProcessor {
  readonly providerName = 'gemini-code'
  readonly description = 'Processes Gemini Code session logs (uses canonical metrics)'

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

  parseSession(jsonContent: string, _provider: string) {
    this.validateJsonlContent(jsonContent)
    // Parser returns canonical format with provider='canonical'
    // We preserve the real provider name for data storage
    const session = this.parser.parseSession(jsonContent)
    session.provider = this.providerName // Override to keep real provider
    return session
  }

  getMetricProcessors(): BaseMetricProcessor[] {
    return this.metricProcessors
  }

  canProcess(content: string): boolean {
    try {
      // Gemini sessions are JSONL format in canonical format (camelCase)
      if (!content.includes('\n')) {
        return false
      }

      const lines = content.split('\n').filter(line => line.trim())
      if (lines.length === 0) {
        return false
      }

      // Check for Gemini-specific markers in canonical format (camelCase)
      for (const line of lines) {
        try {
          const data = JSON.parse(line)

          // Look for canonical format with Gemini provider
          if (
            data.provider === 'gemini-code' ||
            data.providerMetadata?.gemini_type ||
            data.providerMetadata?.has_thoughts === true ||
            data.providerMetadata?.has_tool_calls === true
          ) {
            return true
          }
        } catch {}
      }

      return false
    } catch (_error) {
      return false
    }
  }

  /**
   * Validate Gemini JSONL format (canonical format)
   */
  protected validateJsonlContent(content: string): void {
    if (!content || content.trim().length === 0) {
      throw new Error('Content is empty')
    }

    // Gemini uses canonical JSONL format (camelCase)
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length === 0) {
      throw new Error('No valid JSONL lines found')
    }

    let hasValidMessage = false
    let hasGeminiFields = false

    // Validate a few lines to ensure proper format
    const targetValidLines = Math.min(3, lines.length)
    let validatedLines = 0

    for (let i = 0; i < lines.length && validatedLines < targetValidLines; i++) {
      try {
        const data = JSON.parse(lines[i])

        // Check for valid canonical message structure (camelCase fields)
        if (data.uuid && data.timestamp && data.type && data.message) {
          hasValidMessage = true
          validatedLines++
        }

        // Check for Gemini-specific fields in canonical format (camelCase)
        if (
          data.provider === 'gemini-code' ||
          data.providerMetadata?.gemini_type ||
          data.providerMetadata?.has_thoughts === true ||
          data.providerMetadata?.has_tool_calls === true
        ) {
          hasGeminiFields = true
        }
      } catch (_error) {
        // Skip lines that fail to parse
      }
    }

    if (!hasValidMessage) {
      throw new Error(
        'No valid canonical messages found with required fields (uuid, timestamp, type, message)'
      )
    }

    if (!hasGeminiFields) {
      throw new Error(
        'No Gemini-specific fields found in messages (provider=gemini-code or providerMetadata)'
      )
    }
  }
}

// GeminiProcessor uses canonical metrics but preserves gemini-code provider identity
