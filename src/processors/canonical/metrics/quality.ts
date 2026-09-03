/**
 * Unified Quality Metrics Processor
 *
 * Works for all providers using the canonical format.
 * Measures task success rate, iteration count, and process quality.
 */

import type { QualityMetrics, ToolResultContent, ToolUseContent } from '@guidemode/types'
import { isStructuredMessageContent } from '@guidemode/types'
import type { ParsedMessage, ParsedSession } from '../../../parsers/base/types.js'
import { BaseMetricProcessor } from '../../base/metric-processor.js'
import { countByCapability, getToolCapability } from './tool-capabilities.js'

/**
 * Version of the deterministic process-quality scorer.
 *
 * Stamped onto every result. Scores from different versions are not comparable, so
 * anything trending this metric should group by it - notably the composite index, whose
 * `aiLeverage` dimension averages this score over a 30-day window and will therefore mix
 * v1 and v2 during the transition.
 *
 * v1 - literal Claude Code tool names; every other provider scored near zero.
 * v2 - provider-agnostic capability mapping (see `tool-capabilities.ts`).
 */
export const PROCESS_QUALITY_SCORER_VERSION = 'v2'

export class CanonicalQualityProcessor extends BaseMetricProcessor {
  readonly name = 'canonical-quality'
  readonly metricType = 'quality' as const
  readonly description =
    'Measures task success rate, iteration count, and process quality (unified for all providers)'

  async process(session: ParsedSession): Promise<QualityMetrics> {
    const toolUses = this.extractToolUses(session)
    const toolResults = this.extractToolResults(session)
    const userMessages = session.messages.filter(m => m.type === 'user')

    // Calculate task success rate
    const successfulOperations = toolResults.filter(result => !result.is_error).length
    const totalOperations = toolResults.length
    const taskSuccessRate =
      totalOperations > 0 ? Math.round((successfulOperations / totalOperations) * 100) : 0

    // Calculate iteration count
    const iterationCount = this.calculateIterations(userMessages, session)

    // Detect plan mode and todo tracking usage
    const planModeUsage = this.detectPlanModeUsage(toolUses)
    const todoTrackingUsage = this.detectTodoTrackingUsage(toolUses)

    // Detect over-the-top affirmations
    const overTopAffirmations = this.detectOverTopAffirmations(session)

    // Calculate process quality score
    const processQualityScore = this.calculateProcessQuality(
      toolUses,
      session,
      planModeUsage.used,
      todoTrackingUsage.used
    )

    return {
      task_success_rate: taskSuccessRate,
      iteration_count: iterationCount,
      process_quality_score: processQualityScore,
      used_plan_mode: planModeUsage.used,
      used_todo_tracking: todoTrackingUsage.used,
      over_top_affirmations: overTopAffirmations.count,
      metadata: {
        successful_operations: successfulOperations,
        total_operations: totalOperations,
        exit_plan_mode_count: planModeUsage.count,
        todo_write_count: todoTrackingUsage.count,
        over_top_affirmations_phrases: overTopAffirmations.phrases,
        process_quality_scorer_version: PROCESS_QUALITY_SCORER_VERSION,
        improvement_tips: this.generateImprovementTips(
          taskSuccessRate,
          iterationCount,
          processQualityScore,
          planModeUsage.used,
          todoTrackingUsage.used
        ),
      },
    }
  }

  /**
   * Extract tool uses from session
   */
  private extractToolUses(session: ParsedSession): ToolUseContent[] {
    const toolUses: ToolUseContent[] = []

    for (const message of session.messages) {
      if (isStructuredMessageContent(message.content) && message.content.toolUse) {
        toolUses.push(message.content.toolUse)
      }
    }

    return toolUses
  }

  /**
   * Extract tool results from session
   */
  private extractToolResults(session: ParsedSession): ToolResultContent[] {
    const toolResults: ToolResultContent[] = []

    for (const message of session.messages) {
      if (isStructuredMessageContent(message.content) && message.content.toolResult) {
        toolResults.push(message.content.toolResult)
      }
    }

    return toolResults
  }

  /**
   * Calculate iteration count (refinement cycles)
   */
  private calculateIterations(_userMessages: ParsedMessage[], session: ParsedSession): number {
    let iterations = 0

    for (let i = 0; i < session.messages.length; i++) {
      const message = session.messages[i]

      // Only check user messages
      if (message.type !== 'user') continue

      // Check if this user message follows an assistant response
      const prevMessage = i > 0 ? session.messages[i - 1] : null
      if (!prevMessage || prevMessage.type !== 'assistant') continue

      const content = this.extractTextContent(message).toLowerCase()

      // Refinement patterns
      const refinementPatterns = [
        'actually,',
        'instead,',
        'wait,',
        'no,',
        'correction:',
        'change that',
        'modify that',
        'update that',
        'fix that',
        'make it',
        "let's change",
        'can you change',
        'different approach',
        'try a different',
        "let's try",
        "that's not",
        "that won't work",
        "that's wrong",
        'rather than',
        'instead of',
        'better to',
      ]

      if (refinementPatterns.some(pattern => content.includes(pattern))) {
        iterations++
      }
    }

    return iterations
  }

  /**
   * Detect plan mode usage
   */
  private detectPlanModeUsage(toolUses: ToolUseContent[]): { used: boolean; count: number } {
    const planTools = toolUses.filter(tool => getToolCapability(tool.name) === 'plan')
    return {
      used: planTools.length > 0,
      count: planTools.length,
    }
  }

  /**
   * Detect todo tracking usage
   */
  private detectTodoTrackingUsage(toolUses: ToolUseContent[]): { used: boolean; count: number } {
    const todoTools = toolUses.filter(tool => getToolCapability(tool.name) === 'todo')
    return {
      used: todoTools.length > 0,
      count: todoTools.length,
    }
  }

  /**
   * Calculate process quality score
   */
  private calculateProcessQuality(
    toolUses: ToolUseContent[],
    _session: ParsedSession,
    usedPlanMode: boolean,
    usedTodoTracking: boolean
  ): number {
    let score = 0
    const maxScore = 100

    // Plan mode usage (highest priority)
    if (usedPlanMode) {
      score += 30
    }

    // Todo tracking usage
    if (usedTodoTracking) {
      score += 20
    }

    // Capability-based, so the same behaviour scores the same on every provider.
    const counts = countByCapability(toolUses.map(tool => tool.name))

    // Read before write pattern
    if (counts.read > 0 && counts.write > 0) {
      score += 25
    }

    // Testing/checking patterns
    if (counts.execute > 0 && counts.write > 0) {
      score += 15
    }

    // Incremental approach
    if (counts.write > 1 && counts.write <= 5) {
      score += 10
    }

    // Penalize excessive searching
    const searchRatio = counts.read / (counts.write || 1)
    if (searchRatio > 2) {
      score -= 10
    }

    return Math.max(0, Math.min(score, maxScore))
  }

  /**
   * Detect over-the-top affirmations
   */
  private detectOverTopAffirmations(session: ParsedSession): { count: number; phrases: string[] } {
    const affirmationPatterns = [
      /\byou'?re\s+right\b/i,
      /\byou'?re\s+absolutely\s+right\b/i,
      /\byou'?re\s+completely\s+right\b/i,
      /\byou'?re\s+totally\s+right\b/i,
      /\byou'?re\s+100%\s+right\b/i,
      /\byou'?re\s+spot\s+on\b/i,
      /\byou'?re\s+exactly\s+right\b/i,
      /\bexactly!?\s*$/i,
      /\babsolutely!?\s*$/i,
      /\bperfect!?\s*$/i,
      /\bbrilliant!?\s*$/i,
      /\bexcellent!?\s*$/i,
      /\bthat'?s\s+absolutely\s+right\b/i,
      /\bthat'?s\s+completely\s+correct\b/i,
      /\bthat'?s\s+exactly\s+right\b/i,
      /\bthat'?s\s+spot\s+on\b/i,
      /\bthat'?s\s+perfect\b/i,
      /\byes!+\s*$/i,
      /\bawesome!+\s*$/i,
      /\bfantastic!+\s*$/i,
      /\bwonderful!+\s*$/i,
    ]

    let totalCount = 0
    const foundPhrases: string[] = []

    const assistantMessages = session.messages.filter(m => m.type === 'assistant')

    for (const message of assistantMessages) {
      const content = this.extractTextContent(message).toLowerCase()

      for (const pattern of affirmationPatterns) {
        const matches = content.match(pattern)
        if (matches) {
          totalCount++
          foundPhrases.push(matches[0])
        }
      }
    }

    return {
      count: totalCount,
      phrases: Array.from(new Set(foundPhrases)),
    }
  }

  /**
   * Extract text content from message
   */
  private extractTextContent(message: ParsedMessage): string {
    if (typeof message.content === 'string') {
      return message.content
    }

    if (message.content.text) {
      return message.content.text
    }

    return ''
  }

  /**
   * Generate improvement tips
   */
  private generateImprovementTips(
    taskSuccessRate: number,
    iterationCount: number,
    processQuality: number,
    usedPlanMode: boolean,
    usedTodoTracking: boolean
  ): string[] {
    const tips: string[] = []

    const hasQualityIssues = taskSuccessRate < 70 || iterationCount > 10 || processQuality < 50

    // Plan mode and todo tracking tips
    if (hasQualityIssues || processQuality < 60) {
      if (!usedPlanMode && !usedTodoTracking) {
        tips.push('For complex tasks, use plan mode to organize your approach upfront')
        tips.push('Consider using TodoWrite to track progress on multi-step tasks')
      } else if (!usedPlanMode) {
        tips.push('Try using plan mode to outline your approach before starting complex tasks')
      } else if (!usedTodoTracking) {
        tips.push('Consider using TodoWrite to track progress and ensure all steps are completed')
      }
    }

    // Task success and iteration tips
    if (taskSuccessRate < 70) {
      tips.push(
        'Low success rate - ensure comprehensive upfront context (file paths, specs, code examples)'
      )
      tips.push('Consider improving documentation to reduce AI exploration')
    }

    if (iterationCount > 10) {
      tips.push(
        'Many iterations - consider whether initial prompt provided enough technical detail and context'
      )
    }

    // Excellence recognition
    if (
      usedPlanMode &&
      usedTodoTracking &&
      taskSuccessRate > 80 &&
      iterationCount <= 5 &&
      processQuality > 80
    ) {
      tips.push(
        'Outstanding! Excellent process discipline with plan mode, todo tracking, and clear context'
      )
    } else if ((usedPlanMode || usedTodoTracking) && taskSuccessRate > 75 && processQuality > 70) {
      tips.push(
        'Great collaboration! Your use of planning tools shows excellent AI process discipline'
      )
    } else if (taskSuccessRate > 80 && iterationCount <= 5 && processQuality > 70) {
      tips.push('Excellent! Effective context and steering led to efficient execution')
    }

    return tips
  }
}
