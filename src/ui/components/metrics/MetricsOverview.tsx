/**
 * MetricsOverview - Main metrics display component
 *
 * CONVERTED TO PROPS-BASED: This component now accepts metrics data as props
 * instead of fetching via hooks. The parent component should handle data fetching.
 */

import type { AIModelMetadata } from '@guidemode/types'
import { AIAssessmentSection } from './sections/AIAssessmentSection.js'
import { ContextMetricsSection } from './sections/ContextMetricsSection.js'
import { EngagementMetricsSection } from './sections/EngagementMetricsSection.js'
import { ErrorMetricsSection } from './sections/ErrorMetricsSection.js'
import { GitDiffMetricsSection } from './sections/GitDiffMetricsSection.js'
import { PerformanceMetricsSection } from './sections/PerformanceMetricsSection.js'
import { QualityMetricsSection } from './sections/QualityMetricsSection.js'
import { UsageMetricsSection } from './sections/UsageMetricsSection.js'

// Type definition for session metrics UI data
export interface SessionMetricsUI {
  createdAt?: string | null
  usage?: {
    readWriteRatio?: string | null
    inputClarityScore?: string | null
    improvementTips?: string[] | null
  }
  error?: {
    errorCount?: number | null
    fatalErrors?: number | null
    recoveryAttempts?: number | null
    errorTypes?: string[] | null
    lastErrorMessage?: string | null
    improvementTips?: string[] | null
  }
  engagement?: {
    interruptionRate?: string | null
    totalInterruptions?: number | null
    sessionLengthMinutes?: string | null
    improvementTips?: string[] | null
  }
  quality?: {
    taskSuccessRate?: string | null
    iterationCount?: number | null
    processQualityScore?: string | null
    usedPlanMode?: boolean | null
    exitPlanModeCount?: number | null
    usedTodoTracking?: boolean | null
    todoWriteCount?: number | null
    overTopAffirmations?: number | null
    overTopAffirmationsPhrases?: string[] | null
    improvementTips?: string[] | null
  }
  performance?: {
    responseLatencyMs?: string | null
    taskCompletionTimeMs?: string | null
    improvementTips?: string[] | null
  }
  gitDiff?: {
    totalFiles?: number | null
    linesAdded?: number | null
    linesRemoved?: number | null
    linesModified?: number | null
    netLines?: number | null
    linesReadPerChanged?: string | null
    readsPerFile?: string | null
    linesPerMinute?: string | null
    linesPerTool?: string | null
    improvementTips?: string[] | null
  }
  context?: {
    totalInputTokens?: number | null
    totalOutputTokens?: number | null
    totalCacheCreated?: number | null
    totalCacheRead?: number | null
    contextLength?: number | null
    contextWindowSize?: number | null
    contextUtilizationPercent?: number | null
    compactEventCount?: number | null
    compactEventSteps?: number[] | null
    avgTokensPerMessage?: number | null
    messagesUntilFirstCompact?: number | null
    /**
     * API-equivalent cost: the list-price value of the tokens consumed, derived
     * server-side. NOT what anyone was billed — a Max or Pro subscriber pays a flat
     * subscription and none of this.
     *
     * A `numeric` column, so it arrives as a STRING; parse before formatting.
     *
     * ABSENT ON DESKTOP, permanently and by design: pricing needs a price table and
     * a database the desktop app does not have. Every consumer must treat undefined
     * as "not priced here" rather than as zero — the tiles below render nothing at
     * all in that case, which is why desktop shows no cost rather than "$0.00".
     */
    apiEquivalentCostUsd?: string | null
    /** `derived` | `derived_partial` | `unavailable` | `pending`. */
    costSource?: string | null
    costHasUnpricedModels?: boolean | null
    costUnpricedModels?: string[] | null
    /** The provider's own figure. A cross-check, never the headline. */
    providerReportedCostUsd?: string | null
    primaryModel?: string | null
    distinctModelCount?: number | null
    improvementTips?: string[] | null
  }
}

interface MetricsOverviewProps {
  sessionId: string
  metrics?: SessionMetricsUI | null
  isLoading?: boolean
  error?: Error | null
  onProcessSession?: () => void
  onCancelProcessing?: () => void
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed' | null
  isProcessing?: boolean
  isCancelling?: boolean
  aiModelSummary?: string | null
  aiModelQualityScore?: number | null
  aiModelMetadata?: AIModelMetadata | null
}

export function MetricsOverview({
  sessionId: _sessionId,
  metrics,
  isLoading = false,
  error = null,
  onProcessSession,
  onCancelProcessing,
  processingStatus,
  isProcessing = false,
  isCancelling = false,
  aiModelSummary,
  aiModelQualityScore,
  aiModelMetadata,
}: MetricsOverviewProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg" />
          <p className="mt-4 text-base-content/70">Loading metrics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Failed to load metrics: {error.message}</span>
      </div>
    )
  }

  if (!metrics) {
    // If no processing handlers provided, this is a metrics-only session
    const isMetricsOnly = !onProcessSession && !onCancelProcessing

    return (
      <div className="text-center py-12">
        <div className="mb-6">
          <svg
            className="w-16 h-16 mx-auto text-base-content/30"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">No Metrics Available</h3>
        <p className="text-base-content/70 mb-6">
          {isMetricsOnly
            ? 'This session does not have a transcript file. Metrics cannot be generated for metrics-only sessions.'
            : "This session hasn't been processed yet. Process it to generate comprehensive metrics."}
        </p>
        {(onProcessSession || onCancelProcessing) && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isProcessing || processingStatus === 'processing' ? (
              <>
                {onCancelProcessing && (
                  <button
                    onClick={onCancelProcessing}
                    className="btn btn-error"
                    disabled={isCancelling}
                  >
                    {isCancelling ? (
                      <>
                        <span className="loading loading-spinner loading-sm" />
                        Cancelling...
                      </>
                    ) : (
                      'Cancel Processing'
                    )}
                  </button>
                )}
                <button className="btn btn-primary" disabled>
                  <span className="loading loading-spinner loading-sm" />
                  Processing...
                </button>
              </>
            ) : (
              onProcessSession && (
                <button onClick={onProcessSession} className="btn btn-primary">
                  Process Session
                </button>
              )
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* AI Assessment Section */}
      <AIAssessmentSection
        aiModelSummary={aiModelSummary}
        aiModelQualityScore={aiModelQualityScore}
        aiModelMetadata={aiModelMetadata}
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold">Session Metrics</h2>
          <p className="text-xs md:text-sm text-base-content/70">
            Last updated: {new Date(metrics.createdAt || '').toLocaleString()}
          </p>
        </div>
      </div>

      {/* Usage Metrics Section */}
      <UsageMetricsSection usage={metrics.usage} />

      {/* Context Management Section */}
      <ContextMetricsSection context={metrics.context} />

      {/* Error Metrics Section */}
      <ErrorMetricsSection error={metrics.error} />

      {/* Engagement Metrics Section */}
      <EngagementMetricsSection engagement={metrics.engagement} />

      {/* Quality Metrics Section */}
      <QualityMetricsSection quality={metrics.quality} />

      {/* Performance Metrics Section */}
      <PerformanceMetricsSection performance={metrics.performance} />

      {/* Git Diff Metrics Section */}
      <GitDiffMetricsSection gitDiff={metrics.gitDiff} />
    </div>
  )
}
