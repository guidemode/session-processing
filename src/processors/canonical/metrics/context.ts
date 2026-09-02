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
import { attributeTokens } from './token-attribution.js'

export class CanonicalContextProcessor extends BaseMetricProcessor {
  readonly name = 'canonical-context'
  readonly metricType = 'context-management' as const
  readonly description =
    'Tracks token usage, cache efficiency, and context management (unified for all providers)'

  // Claude Sonnet 4.5 context window (providers may vary)
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
   * Calculate average input tokens per message
   */
  private calculateAvgTokensPerMessage(session: ParsedSession): number {
    let totalInputTokens = 0
    let messageCount = 0

    for (const message of session.messages) {
      const usage = message.metadata?.usage as
        | {
            input_tokens?: number
          }
        | undefined

      const inputTokens = usage?.input_tokens || 0
      if (inputTokens > 0) {
        totalInputTokens += inputTokens
        messageCount++
      }
    }

    return messageCount > 0 ? Math.round(totalInputTokens / messageCount) : 0
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
