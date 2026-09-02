/**
 * Codex `total_token_usage` extractor
 *
 * Codex writes a `payload.info` block carrying both a cumulative `total_token_usage` and
 * a per-turn `last_token_usage`, repeated on every turn:
 *
 *   {"payload":{"info":{"total_token_usage":{"input_tokens":15871,
 *      "cached_input_tokens":10624,"output_tokens":237,
 *      "reasoning_output_tokens":36,"total_tokens":16108}, ...}}}
 *
 * Two things matter. `total_token_usage` is CUMULATIVE, so the last occurrence is the
 * session total and summing occurrences would multiply it. And `cached_input_tokens` is a
 * SUBSET of `input_tokens` here (OpenAI semantics), unlike Anthropic where cache reads are
 * counted separately — so it is recorded as the cache-read figure but must be subtracted
 * from, not added to, input when pricing.
 *
 * Codex reports no cost, so this extractor never produces one.
 */

import type { ProviderSessionTotals, SessionTotalsExtractor } from './types.js'

function numOr0(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export class CodexTokenUsageExtractor implements SessionTotalsExtractor {
  readonly providers = ['codex'] as const

  extract(lines: string[]): ProviderSessionTotals | null {
    // Walk backwards for the newest cumulative block rather than reading every line.
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]?.trim()
      if (!line || !line.includes('total_token_usage')) continue

      let record: Record<string, unknown>
      try {
        record = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }

      const payload = record.payload as Record<string, unknown> | undefined
      const info = payload?.info as Record<string, unknown> | undefined
      const usage = info?.total_token_usage as Record<string, unknown> | undefined
      if (!usage) continue

      return {
        source: 'codex-token-usage',
        totals: {
          inputTokens: numOr0(usage.input_tokens),
          outputTokens: numOr0(usage.output_tokens),
          // Codex exposes no cache-creation concept.
          cacheCreationTokens: 0,
          cacheReadTokens: numOr0(usage.cached_input_tokens),
          reasoningTokens: numOr0(usage.reasoning_output_tokens),
        },
      }
    }

    return null
  }
}
