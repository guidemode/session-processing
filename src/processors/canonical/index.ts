/**
 * Unified Canonical Session Processor
 *
 * Single processor that works for all providers using the canonical format.
 * Consolidates 5+ provider-specific processors into one.
 */

import { extractProviderSessionTotals } from '../../extractors/index.js'
import { CanonicalParser } from '../../parsers/index.js'
import { type BaseMetricProcessor, BaseProviderProcessor } from '../base/index.js'
import { CanonicalContextProcessor } from './metrics/context.js'
import { CanonicalCostProcessor } from './metrics/cost.js'
import { CanonicalEngagementProcessor } from './metrics/engagement.js'
import { CanonicalErrorProcessor } from './metrics/error.js'
import { CanonicalPerformanceProcessor } from './metrics/performance.js'
import { CanonicalQualityProcessor } from './metrics/quality.js'
import { CanonicalUsageProcessor } from './metrics/usage.js'

export class CanonicalSessionProcessor extends BaseProviderProcessor {
  readonly providerName = 'canonical'
  readonly description = 'Unified session processor for all providers using canonical format'

  private parser = new CanonicalParser()
  private metricProcessors: BaseMetricProcessor[]

  constructor() {
    super()

    // Initialize all unified metric processors
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

  parseSession(jsonlContent: string, provider: string) {
    this.validateJsonlContent(jsonlContent)
    const session = this.parser.parseSession(jsonlContent)

    // The only seam holding both the raw transcript and the provider name. Provider
    // summary records (Claude's cost-state, Codex's cumulative usage) carry no uuid or
    // timestamp, so the message parser skips them - they can only be read from here.
    session.providerTotals = extractProviderSessionTotals(jsonlContent, provider) ?? undefined

    return session
  }

  getMetricProcessors(): BaseMetricProcessor[] {
    return this.metricProcessors
  }
}

// Export metric processors for testing
export {
  CanonicalEngagementProcessor,
  CanonicalUsageProcessor,
  CanonicalQualityProcessor,
  CanonicalPerformanceProcessor,
  CanonicalErrorProcessor,
  CanonicalContextProcessor,
  CanonicalCostProcessor,
}
