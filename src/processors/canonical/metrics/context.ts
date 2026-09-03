/**
 * Unified Context Metrics Processor
 *
 * Works for providers with token data (Claude Code, Codex).
 * Tracks token usage, cache efficiency, and context compaction events.
 * Returns null for providers without token data.
 */

import type { ContextManagementMetrics } from '@guidemode/types'
import type { ParsedSession } from '../../../parsers/base/types.js'
import { BaseMetricProcessor } from '../../base/metric-processor.js'
import { attributeTokens, requestKey } from './token-attribution.js'

export class CanonicalContextProcessor extends BaseMetricProcessor {
  readonly name = 'canonical-context'
  readonly metricType = 'context-management' as const
  readonly description =
    'Tracks token usage, cache efficiency, and context management (unified for all providers)'

  /**
   * PROVISIONAL default, corrected downstream. Not the authoritative window.
   *
   * The real window is a per-model fact, and this package has no way to look one
   * up: it runs identically in the desktop app and in a Worker, with no database
   * and no price table. So it assumes the common 200k case, and the server's
   * pricing pass overwrites `context_window_size` and
   * `context_utilization_percent` with the model's actual `max_input_tokens`
   * from `token_prices` (see `services/token-pricing/price-session.ts`).
   *
   * That correction matters: a 1m-context session measured against 200k reports
   * utilisation up to five times too high, which is precisely the session where
   * anyone would be looking at the number.
   */
  private readonly CONTEXT_WINDOW_SIZE = 200000

  /**
   * Check if session has token data (required for context metrics)
   */
  canProcess(session: ParsedSession): boolean {
    return session.messages.some(m => m.metadata?.usage)
  }

  async process(session: ParsedSession): Promise<ContextManagementMetrics> {
    // Calculate totals
    const totals = this.calculateTotals(session)

    // Detect compact events
    const compactEvents = this.detectCompactEvents(session)

    // Calculate average tokens per message
    const avgTokensPerMessage = this.calculateAvgTokensPerMessage(session)

    // Calculate context utilization
    const contextUtilization = (totals.contextLength / this.CONTEXT_WINDOW_SIZE) * 100

    // Generate improvement tips
    const improvementTips = this.generateImprovementTips(compactEvents, totals, contextUtilization)

    return {
      total_input_tokens: totals.totalInputTokens,
      total_output_tokens: totals.totalOutputTokens,
      total_cache_created: totals.totalCacheCreated,
      total_cache_read: totals.totalCacheRead,
      context_length: totals.contextLength,
      context_window_size: this.CONTEXT_WINDOW_SIZE,
      context_utilization_percent: contextUtilization,
      compact_event_count: compactEvents.count,
      compact_event_steps: JSON.stringify(compactEvents.steps),
      avg_tokens_per_message: avgTokensPerMessage,
      messages_until_first_compact: compactEvents.firstCompactStep,
      context_improvement_tips: JSON.stringify(improvementTips),
    }
  }

  /**
   * Calculate token totals from the session
   */
  private calculateTotals(session: ParsedSession) {
    // Token sums come from the shared attribution pass, which counts each API request
    // once. Summing per message double-counts heavily: Claude Code repeats the same
    // usage block on every line of a response (measured at 64.8% inflation).
    const attribution = attributeTokens(session)

    let contextLength = 0
    let mostRecentTimestamp: Date | null = null
    let mostRecentUsage: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    } | null = null

    for (const message of session.messages) {
      const usage = message.metadata?.usage as
        | {
            input_tokens?: number
            output_tokens?: number
            cache_creation_input_tokens?: number
            cache_read_input_tokens?: number
          }
        | undefined

      if (usage) {
        // Track most recent main chain message for context_length. This deliberately
        // stays per-message: context length is a point-in-time reading of the newest
        // message's window, not a sum, so request de-duplication does not apply.
        const isSidechain = message.metadata?.isSidechain === true
        if (
          !isSidechain &&
          message.timestamp &&
          (!mostRecentTimestamp || message.timestamp > mostRecentTimestamp)
        ) {
          mostRecentTimestamp = message.timestamp
          mostRecentUsage = usage
        }
      }
    }

    // Calculate context_length from most recent main chain message
    if (mostRecentUsage) {
      contextLength =
        (mostRecentUsage.input_tokens || 0) +
        (mostRecentUsage.cache_read_input_tokens || 0) +
        (mostRecentUsage.cache_creation_input_tokens || 0)
    }

    return {
      totalInputTokens: attribution.totals.inputTokens,
      totalOutputTokens: attribution.totals.outputTokens,
      totalCacheCreated: attribution.totals.cacheCreationTokens,
      totalCacheRead: attribution.totals.cacheReadTokens,
      contextLength,
    }
  }

  /**
   * Detect compact events in the session
   */
  private detectCompactEvents(session: ParsedSession): {
    count: number
    steps: number[]
    firstCompactStep: number | null
  } {
    const compactSteps: number[] = []

    session.messages.forEach((message, index) => {
      if (message.type === 'compact') {
        compactSteps.push(index + 1) // 1-based indexing
      }
    })

    return {
      count: compactSteps.length,
      steps: compactSteps,
      firstCompactStep: compactSteps.length > 0 ? compactSteps[0] : null,
    }
  }

  /**
   * Average NEW tokens a turn adds to the context, per API request.
   *
   * Two traps here, both measured on real sessions.
   *
   * `input_tokens` ALONE IS NOT THE ANSWER. Under prompt caching it is only the uncached
   * delta - a handful of tokens once the conversation is warm. The previous version of
   * this function averaged exactly that and returned the constant `2` on every one of the
   * twelve sessions it was checked against. A metric that cannot vary carries no
   * information.
   *
   * NEITHER IS THE FULL CONTEXT. Adding `cache_read_input_tokens` gives what the model
   * SAW, but every request re-sends the whole conversation, so that figure (measured
   * 121k-313k) is really average window occupancy: it tracks session length, duplicates
   * `context_length` and `context_utilization_percent`, and answers nothing "per message".
   *
   * So: input + cache_creation + output, which is the material this turn actually ADDED,
   * whether it was written into the cache or generated. Measured 1,587-3,805 - a number
   * that moves with how verbose turns and tool outputs are.
   *
   * Deduplicated on request for the reason `token-attribution.ts` documents at length:
   * Claude Code repeats one response's usage block across every JSONL line it wrote.
   */
  private calculateAvgTokensPerMessage(session: ParsedSession): number {
    const seenRequests = new Set<string>()
    let totalNewTokens = 0
    let requestCount = 0

    for (const message of session.messages) {
      const usage = message.metadata?.usage as
        | {
            input_tokens?: number
            output_tokens?: number
            cache_creation_input_tokens?: number
          }
        | undefined

      if (!usage) continue

      const key = requestKey(message)
      if (seenRequests.has(key)) continue
      seenRequests.add(key)

      totalNewTokens +=
        (usage.input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) +
        (usage.output_tokens || 0)
      requestCount++
    }

    return requestCount > 0 ? Math.round(totalNewTokens / requestCount) : 0
  }

  /**
   * Generate improvement tips
   */
  private generateImprovementTips(
    compactEvents: { count: number; firstCompactStep: number | null },
    totals: { contextLength: number; totalCacheRead: number; totalCacheCreated: number },
    contextUtilization: number
  ): string[] {
    const tips: string[] = []

    // Context utilization tips
    if (contextUtilization > 80) {
      tips.push(
        'High context utilization - consider compacting context or breaking into smaller sessions'
      )
    }

    if (contextUtilization > 90) {
      tips.push('Very high context utilization - approaching limit, compact soon to avoid issues')
    }

    // Cache efficiency tips
    const cacheHitRate =
      totals.totalCacheCreated > 0 ? totals.totalCacheRead / totals.totalCacheCreated : 0

    if (cacheHitRate > 0.5) {
      tips.push('Good cache efficiency - prompt caching is working well')
    } else if (cacheHitRate > 0 && cacheHitRate <= 0.5) {
      tips.push('Moderate cache efficiency - consider more consistent context patterns')
    }

    // Compact event tips
    if (compactEvents.count === 0 && contextUtilization > 60) {
      tips.push('Consider using /compact command to manage context size proactively')
    }

    if (compactEvents.count > 3) {
      tips.push('Frequent compaction - consider breaking this into multiple shorter sessions')
    }

    return tips
  }
}
