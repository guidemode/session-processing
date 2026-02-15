// Main exports - re-export everything for convenience
// Note: Some types like ParsedMessage, ParsedSession are exported from multiple modules
// Export parsers first (as the source of truth)
export * from './parsers/index.js'

// Export processors (re-exports some parser types, but parsers take precedence)
export {
  BaseMetricProcessor,
  BaseProviderProcessor,
  GitDiffMetricProcessor,
  ProcessorRegistry,
  processorRegistry,
  ClaudeCodeProcessor,
  CodexProcessor,
  GitHubCopilotProcessor,
  OpenCodeProcessor,
  GeminiProcessor,
  CanonicalSessionProcessor,
  CanonicalEngagementProcessor,
  CanonicalUsageProcessor,
  CanonicalQualityProcessor,
  CanonicalPerformanceProcessor,
  CanonicalErrorProcessor,
  CanonicalContextProcessor,
} from './processors/index.js'

// Export AI models
export * from './ai-models/index.js'

// Export validation
export * from './validation/index.js'

// Export UI (re-exports parserRegistry, but that's okay)
export * from './ui/index.js'

// Export utils
export * from './utils/index.js'

// Export redaction
export * from './redaction/index.js'
