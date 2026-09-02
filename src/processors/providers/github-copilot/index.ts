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

export class GitHubCopilotProcessor extends BaseProviderProcessor {
  readonly providerName = 'github-copilot'
  readonly description = 'Processes github-copilot session logs (uses canonical metrics)'

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
    const session = this.parser.parseSession(jsonlContent)
    session.provider = this.providerName // Override to keep real provider
    return session
  }

  getMetricProcessors(): BaseMetricProcessor[] {
    return this.metricProcessors
  }
}
