import type { GitDiff, GitDiffMetrics } from '@guidemode/types'
import { BaseMetricProcessor } from './metric-processor.js'
import type { ParsedSession } from './types.js'

/**
 * Universal git diff metric processor - works with ALL providers
 * Runs LAST to leverage previously calculated metrics
 *
 * Calculates:
 * - Core diff metrics (files, lines added/removed)
 * - Efficiency ratios (lines read per changed, reads per file, etc.)
 *
 * Legacy desktop uploads only: returns null if no git diff data available
 */
export class GitDiffMetricProcessor extends BaseMetricProcessor {
  readonly name = 'git-diff'
  readonly metricType = 'git-diff' as const
  readonly description = 'Universal git diff analysis with navigation efficiency (all providers)'

  /**
   * Process git diff metrics
   * Standard process() method for base class compatibility
   */
  async process(session: ParsedSession): Promise<GitDiffMetrics> {
    return this.processWithExistingMetrics(session, {})
  }

  /**
   * Process git diff metrics with access to existing metrics
   * @param session - Parsed session with optional git diff data
   * @param existingMetrics - Previously calculated metrics (for ratios)
   */
  async processWithExistingMetrics(
    session: ParsedSession,
    existingMetrics?: Record<string, unknown>
  ): Promise<GitDiffMetrics> {
    // Check if git diff data is available (legacy desktop uploads only)
    const gitDiff = session.metadata?.gitDiff as GitDiff | undefined
    if (!gitDiff || !gitDiff.files) {
      // Return empty metrics if no git data (server sessions)
      return {
        git_total_files_changed: 0,
        git_lines_added: 0,
        git_lines_removed: 0,
        git_lines_modified: 0,
        git_net_lines_changed: 0,
        metadata: {
          calculation_type: 'unstaged',
          improvement_tips: [],
        },
      }
    }

    // Calculate core diff metrics (provider-agnostic)
    const totalFiles = gitDiff.files.length
    const linesAdded = gitDiff.files.reduce((sum, file) => sum + (file.stats?.additions || 0), 0)
    const linesRemoved = gitDiff.files.reduce((sum, file) => sum + (file.stats?.deletions || 0), 0)
    const linesModified = linesAdded + linesRemoved
    const netLines = linesAdded - linesRemoved

    // Extract total lines read from EXISTING usage metrics (already calculated)
    const usage = existingMetrics?.usage as Record<string, unknown> | undefined
    const usageMetadata = usage?.metadata as Record<string, unknown> | undefined
    const totalLinesRead = (usageMetadata?.total_lines_read as number) || 0
    const readOperations = (usageMetadata?.read_operations as number) || 0

    // Calculate tool count (provider-agnostic)
    const toolCount = this.getTotalToolCount(session)

    // Calculate efficiency ratios
    const linesReadPerChanged =
      linesModified > 0 ? Number.parseFloat((totalLinesRead / linesModified).toFixed(2)) : 0

    const readsPerFile =
      totalFiles > 0 ? Number.parseFloat((readOperations / totalFiles).toFixed(2)) : 0

    const linesPerMinute =
      session.duration > 0
        ? Number.parseFloat((linesModified / (session.duration / 60000)).toFixed(2))
        : 0

    const linesPerTool =
      toolCount > 0 ? Number.parseFloat((linesModified / toolCount).toFixed(2)) : 0

    return {
      git_total_files_changed: totalFiles,
      git_lines_added: linesAdded,
      git_lines_removed: linesRemoved,
      git_lines_modified: linesModified,
      git_net_lines_changed: netLines,
      git_lines_read_per_line_changed: linesReadPerChanged > 0 ? linesReadPerChanged : undefined,
      git_reads_per_file_changed: readsPerFile > 0 ? readsPerFile : undefined,
      git_lines_changed_per_minute: linesPerMinute,
      git_lines_changed_per_tool_use: linesPerTool,
      total_lines_read: totalLinesRead > 0 ? totalLinesRead : undefined,
      metadata: {
        calculation_type: gitDiff.isUnstaged ? 'unstaged' : 'committed',
        first_commit: session.metadata?.firstCommitHash,
        latest_commit: session.metadata?.latestCommitHash,
        improvement_tips: this.generateTips(linesReadPerChanged, readsPerFile, linesPerTool),
      },
    }
  }

  /**
   * Count total tool uses across any provider (provider-agnostic)
   */
  private getTotalToolCount(session: ParsedSession): number {
    return session.messages
      .filter(m => {
        const toolCount = m.metadata?.toolCount as number | undefined
        return m.metadata?.hasToolUses || (toolCount && toolCount > 0)
      })
      .reduce((sum, m) => {
        const toolCount = (m.metadata?.toolCount as number | undefined) || 0
        return sum + toolCount
      }, 0)
  }

  /**
   * Generate improvement tips based on efficiency ratios
   */
  private generateTips(
    linesReadPerChanged: number,
    readsPerFile: number,
    linesPerTool: number
  ): string[] {
    const tips: string[] = []

    // Lines read per changed analysis
    if (linesReadPerChanged > 10) {
      tips.push(
        'High read-to-change ratio - AI read lots of code for few changes. Be more specific about file locations.'
      )
    } else if (linesReadPerChanged > 0 && linesReadPerChanged < 5) {
      tips.push('Excellent navigation efficiency! AI found and modified code quickly.')
    }

    // Reads per file analysis
    if (readsPerFile > 3) {
      tips.push(
        'Multiple reads per file - AI struggled to find right code. Include function/class names.'
      )
    }

    // Lines per tool analysis
    if (linesPerTool > 0 && linesPerTool < 1) {
      tips.push(
        'Low lines per tool - many tools for small changes. Consider consolidating requests.'
      )
    } else if (linesPerTool > 5) {
      tips.push('Great tool efficiency - significant changes with minimal tool use.')
    }

    return tips
  }
}
