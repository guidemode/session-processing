/**
 * Unified Context Metrics Processor
 *
 * Works for providers with token data (Claude Code, Codex, Copilot CLI).
 * Tracks token usage, cache efficiency, and context compaction events.
 * Returns null for providers without token data.
 */

import type { ContextManagementMetrics } from '@guidemode/types'
import type { ParsedMessage, ParsedSession } from '../../../parsers/base/types.js'
import { BaseMetricProcessor } from '../../base/metric-processor.js'
import { attributeTokens, isSessionAggregateUsage, requestKey } from './token-attribution.js'

/**
 * A context size the provider stated outright, as `providerMetadata.context_tokens`.
 *
 * Copilot CLI states no per-request usage, so there is no request to read a window from; it
 * does record the whole prompt of each turn's last request, and its context as the session
 * closed, and the CLI converter writes those as readings carrying no usage at all.
 */
function statedContextTokens(message: ParsedMessage): number | null {
  const providerMetadata = message.metadata?.providerMetadata as Record<string, unknown> | undefined
  const tokens = providerMetadata?.context_tokens
  return typeof tokens === 'number' && tokens > 0 ? tokens : null
}

/**
 * How full the window was at this message, or null if it does not say.
 *
 * A stated reading is taken as given. Otherwise one request's usage is: its uncached input
 * plus what it read from and wrote to the cache is the whole prompt. A session aggregate is
 * not a reading at all — it is a session's spend, and presented as one window it reported
 * utilisation in the thousands of percent.
 */
function contextReadingOf(message: ParsedMessage): number | null {
  const stated = statedContextTokens(message)
  if (stated !== null) return stated

  const usage = message.metadata?.usage as
    | {
        input_tokens?: number
        cache_creation_input_tokens?: number
        cache_read_input_tokens?: number
      }
    | undefined
  if (!usage || isSessionAggregateUsage(message)) return null
  return (
    (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  )
}

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
   * The window the provider itself stated, if it did.
   *
   * Codex writes `model_context_window` on every token_count record. It outranks the default
   * above and is not overridden downstream, because a figure the provider published for the
   * model that actually ran beats one looked up by name — and it is the only window available
   * at all for a model the price table does not carry.
   */
  private declaredWindow(session: ParsedSession): number | null {
    for (const message of session.messages) {
      const declared = (message.metadata?.providerMetadata as Record<string, unknown> | undefined)
        ?.model_context_window
      if (typeof declared === 'number' && declared > 0) return declared
    }
    return null
  }

  /**
   * Check if session has token data (required for context metrics)
   */
  canProcess(session: ParsedSession): boolean {
    return session.messages.some(m => m.metadata?.usage || statedContextTokens(m) !== null)
  }

  async process(session: ParsedSession): Promise<ContextManagementMetrics> {
    // Calculate totals
    const totals = this.calculateTotals(session)

    // Detect compact events
    const compactEvents = this.detectCompactEvents(session)

    // Calculate average tokens per message
    const avgTokensPerMessage = this.calculateAvgTokensPerMessage(session)

    // Calculate context utilization
    const windowSize = this.declaredWindow(session) ?? this.CONTEXT_WINDOW_SIZE
    const contextUtilization = (totals.contextLength / windowSize) * 100

    // Generate improvement tips
    const improvementTips = this.generateImprovementTips(compactEvents, totals, contextUtilization)

    return {
      total_input_tokens: totals.totalInputTokens,
      total_output_tokens: totals.totalOutputTokens,
      total_cache_created: totals.totalCacheCreated,
      total_cache_read: totals.totalCacheRead,
      context_length: totals.contextLength,
      context_window_size: windowSize,
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

    for (const message of session.messages) {
      // Track the most recent main chain reading for context_length. This deliberately
      // stays per-message: context length is a point-in-time reading of the newest
      // message's window, not a sum, so request de-duplication does not apply.
      if (message.metadata?.isSidechain === true || !message.timestamp) continue
      if (mostRecentTimestamp && message.timestamp <= mostRecentTimestamp) continue

      const reading = contextReadingOf(message)
      if (reading === null) continue
      mostRecentTimestamp = message.timestamp
      contextLength = reading
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

      // Not one request, so not one turn: averaging it in would report a session's spend
      // as a turn's.
      if (!usage || isSessionAggregateUsage(message)) continue

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
