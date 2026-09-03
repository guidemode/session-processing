// Export base classes
export * from './base/index.js'

// Export registry
export { ProcessorRegistry, processorRegistry } from './registry.js'

// Export provider processors
export { ClaudeCodeProcessor } from './providers/claude-code/index.js'
export { CodexProcessor } from './providers/codex/index.js'
export { CursorProcessor } from './providers/cursor/index.js'
export { GitHubCopilotProcessor } from './providers/github-copilot/index.js'
export { OpenCodeProcessor } from './providers/opencode/index.js'
export { GeminiProcessor } from './providers/gemini/index.js'

// Export canonical metrics processors
export {
  CanonicalSessionProcessor,
  CanonicalEngagementProcessor,
  CanonicalUsageProcessor,
  CanonicalQualityProcessor,
  CanonicalPerformanceProcessor,
  CanonicalErrorProcessor,
  CanonicalContextProcessor,
  PROCESS_QUALITY_SCORER_VERSION,
} from './canonical/index.js'
