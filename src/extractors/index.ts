/**
 * Session totals extraction
 *
 * Pulls provider summary records out of a raw transcript. These records are not
 * messages, so the message parser drops them; this is the only place they are read.
 */

import { ClaudeCostStateExtractor } from './claude-cost-state.js'
import { CodexTokenUsageExtractor } from './codex-token-usage.js'
import type { ProviderSessionTotals, SessionTotalsExtractor } from './types.js'

export { ClaudeCostStateExtractor } from './claude-cost-state.js'
export { CodexTokenUsageExtractor } from './codex-token-usage.js'
export type {
  ProviderModelUsage,
  ProviderSessionTotals,
  SessionTotalsExtractor,
} from './types.js'

const EXTRACTORS: SessionTotalsExtractor[] = [
  new ClaudeCostStateExtractor(),
  new CodexTokenUsageExtractor(),
]

const BY_PROVIDER = new Map<string, SessionTotalsExtractor>()
for (const extractor of EXTRACTORS) {
  for (const provider of extractor.providers) {
    BY_PROVIDER.set(provider, extractor)
  }
}

/**
 * Extract provider-reported session totals from raw JSONL.
 *
 * Returns null for providers that report nothing usable (Gemini gives tokens per message
 * but no summary record; Copilot and Cursor give neither), and for transcripts where the
 * record is absent — sessions killed before the summary is written, or produced by an
 * older client.
 */
export function extractProviderSessionTotals(
  jsonlContent: string,
  provider: string
): ProviderSessionTotals | null {
  const extractor = BY_PROVIDER.get(provider)
  if (!extractor) return null

  try {
    const lines = jsonlContent.split('\n')
    return extractor.extract(lines)
  } catch {
    // Extraction is strictly additive to metrics; never let it fail a session.
    return null
  }
}
