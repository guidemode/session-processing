/**
 * SessionDetailHeader - Shared session detail header component
 *
 * Displays session metadata, stats, and action buttons for session detail pages.
 * Used by both desktop and server apps for consistent UI.
 */

import { buildGitHubDiffUrl } from '../../utils/git-url.js'
import type { SessionRating } from '../../utils/rating.js'
import { RatingBadge } from './RatingBadge.js'

export interface SessionDetailHeaderProps {
  // Session data
  session: {
    provider: string
    repositoryName: string
    sessionStartTime: string | null
    durationMs: number | null
    fileSize?: number
    username?: string
    userAvatarUrl?: string
    repository?: {
      name: string
      gitRemoteUrl?: string
      cwd?: string
    }
    cwd?: string // For desktop (direct cwd field)
    aiModelSummary?: string
    gitBranch?: string
    firstCommitHash?: string
    latestCommitHash?: string
  }

  // Optional stats
  messageCount?: number

  // Rating
  rating?: SessionRating | null
  onRate?: (rating: SessionRating) => void | Promise<void>

  // Action handlers
  onProcessSession?: () => void
  onAssessSession?: () => void
  onDeleteSession?: () => void
  onCwdClick?: (path: string) => void | Promise<void> // Desktop only
  onViewDiff?: () => void | Promise<void> // Desktop only - opens Session Changes tab
  onRepositoryClick?: () => void | Promise<void> // Optional click handler for repository name

  // Status states
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed'
  isProcessing?: boolean
  assessmentStatus?: 'not_started' | 'rating_only' | 'in_progress' | 'completed'

  // Processing progress (optional - for detailed step tracking)
  processingProgress?: {
    stepName: string
    percentage: number
  } | null

  // Desktop-specific sync status
  syncStatus?: {
    synced: boolean
    failed: boolean
    reason?: string
    onSync?: () => void
    onShowError?: (error: string) => void
  }

  // Required component injection
  ProviderIcon: React.ComponentType<{ providerId: string; size: number }>
}

export function SessionDetailHeader({
  session,
  messageCount,
  rating,
  onRate,
  onProcessSession,
  onAssessSession,
  onDeleteSession,
  onCwdClick,
  onViewDiff,
  onRepositoryClick,
  processingStatus = 'pending',
  isProcessing = false,
  assessmentStatus = 'not_started',
  processingProgress,
  syncStatus,
  ProviderIcon,
}: SessionDetailHeaderProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const formatDuration = (durationMs: number | null) => {
    if (!durationMs) return 'N/A'
    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }

  const actuallyProcessing = isProcessing || processingStatus === 'processing'
  const workingDirectory = session.repository?.cwd || session.cwd

  // Build GitHub diff URL if we have the required information
  const gitHubDiffUrl = buildGitHubDiffUrl(
    session.repository?.gitRemoteUrl,
    session.firstCommitHash,
    session.latestCommitHash
  )

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body p-4">
        {/* Header with user info, project, time, stats, and actions */}
        <div>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
            {/* Left: Provider Icon + User/Project Info + Inline Stats */}
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              {/* Provider Icon */}
              <ProviderIcon providerId={session.provider} size={20} />

              {session.username && session.userAvatarUrl && (
                <>
                  <a
                    href={`https://github.com/${session.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    title={`View @${session.username} on GitHub`}
                  >
                    <img
                      src={session.userAvatarUrl}
                      alt={session.username}
                      className="w-8 h-8 rounded-full flex-shrink-0"
                    />
                    <span className="font-semibold text-lg md:text-xl hover:underline">
                      @{session.username}
                    </span>
                  </a>
                  <span className="text-base-content/50 text-sm">•</span>
                </>
              )}
              {onRepositoryClick ? (
                <button
                  type="button"
                  onClick={onRepositoryClick}
                  className="font-medium text-base md:text-lg hover:text-primary hover:underline transition-colors cursor-pointer"
                >
                  {session.repositoryName}
                </button>
              ) : (
                <span className="font-medium text-base md:text-lg">{session.repositoryName}</span>
              )}
              <span className="text-base-content/50 text-sm">•</span>
              <span className="text-sm text-base-content/70">
                {formatDate(session.sessionStartTime)}
              </span>

              {/* Inline Stats */}
              <span className="text-base-content/50 text-sm">•</span>
              <span className="text-sm font-medium">{session.provider}</span>
              <span className="text-base-content/50 text-sm">•</span>
              <span className="text-sm">{formatDuration(session.durationMs)}</span>
              {messageCount !== undefined && (
                <>
                  <span className="text-base-content/50 text-sm">•</span>
                  <span className="text-sm">{messageCount} msg</span>
                </>
              )}
              <span className="text-base-content/50 text-sm">•</span>
              <span className="text-sm">
                {session.fileSize !== undefined && session.fileSize !== null ? (
                  formatFileSize(session.fileSize)
                ) : (
                  <span className="badge badge-ghost badge-sm">Metrics Only</span>
                )}
              </span>

              {/* Sync Status Icon (desktop only) */}
              {syncStatus && (
                <>
                  <span className="text-base-content/50 text-sm">•</span>
                  {syncStatus.failed ? (
                    <div
                      className="tooltip tooltip-bottom cursor-pointer hover:scale-110 transition-transform"
                      data-tip="Sync failed - Click to view error"
                      onClick={() => syncStatus.onShowError?.(syncStatus.reason || 'Unknown error')}
                    >
                      <svg
                        className="w-4 h-4 text-error"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </div>
                  ) : syncStatus.synced ? (
                    <div className="tooltip tooltip-bottom" data-tip="Synced to server">
                      <svg
                        className="w-4 h-4 text-success"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  ) : (
                    <div
                      className="tooltip tooltip-bottom cursor-pointer hover:scale-110 transition-transform"
                      data-tip="Click to sync to server"
                      onClick={syncStatus.onSync}
                    >
                      <svg
                        className="w-4 h-4 text-base-content/30"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right: Action Buttons (desktop only) */}
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
              {onProcessSession && (
                <button
                  onClick={onProcessSession}
                  disabled={actuallyProcessing}
                  className={`btn btn-xs gap-1.5 ${
                    processingStatus === 'completed' ? 'btn-secondary' : 'btn-warning'
                  }`}
                  title={
                    actuallyProcessing
                      ? 'Processing...'
                      : processingStatus === 'completed'
                        ? 'Metrics already processed'
                        : 'Process session with AI'
                  }
                >
                  {actuallyProcessing ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  )}
                  <span className="hidden lg:inline text-xs">
                    {actuallyProcessing && processingProgress
                      ? `${processingProgress.stepName} (${processingProgress.percentage}%)`
                      : actuallyProcessing
                        ? 'Processing...'
                        : processingStatus === 'completed'
                          ? 'AI Processed ✓'
                          : 'Process Session'}
                  </span>
                </button>
              )}
              {onAssessSession && (
                <button
                  onClick={onAssessSession}
                  className={`btn btn-xs gap-1.5 ${
                    assessmentStatus === 'completed' ? 'btn-secondary' : 'btn-accent'
                  }`}
                  title={
                    assessmentStatus === 'completed'
                      ? 'Assessment complete'
                      : assessmentStatus === 'in_progress'
                        ? 'Continue assessment'
                        : 'Start session assessment'
                  }
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="hidden lg:inline text-xs">
                    {assessmentStatus === 'completed'
                      ? 'Assessed ✓'
                      : assessmentStatus === 'in_progress'
                        ? 'Assessment In Progress'
                        : 'Assess Session'}
                  </span>
                </button>
              )}
              {onDeleteSession && (
                <button
                  onClick={onDeleteSession}
                  className="btn btn-xs btn-error gap-1.5"
                  title="Delete this session"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  <span className="hidden lg:inline text-xs">Delete</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile: Action Buttons */}
          {(onProcessSession || onAssessSession || onDeleteSession) && (
            <div className="md:hidden mb-2 flex gap-1.5">
              {onProcessSession && (
                <button
                  onClick={onProcessSession}
                  disabled={actuallyProcessing}
                  className={`btn btn-xs gap-1.5 ${
                    processingStatus === 'completed' ? 'btn-secondary' : 'btn-warning'
                  }`}
                >
                  {actuallyProcessing ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  )}
                  <span className="text-xs">
                    {actuallyProcessing && processingProgress
                      ? `${processingProgress.stepName} (${processingProgress.percentage}%)`
                      : actuallyProcessing
                        ? 'Processing...'
                        : processingStatus === 'completed'
                          ? 'Processed ✓'
                          : 'Process'}
                  </span>
                </button>
              )}
              {onAssessSession && (
                <button
                  onClick={onAssessSession}
                  className={`btn btn-xs gap-1.5 ${
                    assessmentStatus === 'completed' ? 'btn-secondary' : 'btn-accent'
                  }`}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="text-xs">
                    {assessmentStatus === 'completed'
                      ? 'Assessed ✓'
                      : assessmentStatus === 'in_progress'
                        ? 'In Progress'
                        : 'Assess'}
                  </span>
                </button>
              )}
              {onDeleteSession && (
                <button onClick={onDeleteSession} className="btn btn-xs btn-error gap-1.5">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  <span className="text-xs">Delete</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Repository, Git Info, Working Directory, and Rating */}
        {(session.repository ||
          workingDirectory ||
          session.gitBranch ||
          session.firstCommitHash ||
          session.latestCommitHash ||
          onRate) && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
            {/* Repository Info */}
            {session.repository?.gitRemoteUrl && (
              <div className="stat bg-base-200 rounded-lg p-2.5">
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-base-content/60">Repository:</div>
                  <a
                    href={session.repository.gitRemoteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-base-content hover:text-primary transition-colors"
                    title={session.repository.gitRemoteUrl}
                  >
                    <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path
                        fillRule="evenodd"
                        d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="truncate">
                      {session.repository.gitRemoteUrl.replace(/^https?:\/\/(www\.)?/, '')}
                    </span>
                  </a>
                </div>
              </div>
            )}

            {/* Git Information */}
            {(session.gitBranch ||
              session.firstCommitHash ||
              session.latestCommitHash ||
              workingDirectory) && (
              <div className="stat bg-base-200 rounded-lg p-2.5">
                <div className="space-y-1 text-xs">
                  {/* Branch */}
                  {session.gitBranch && (
                    <div>
                      <span className="text-base-content/60">Branch:</span>
                      <span className="ml-1.5 font-mono text-base-content">
                        {session.gitBranch}
                      </span>
                    </div>
                  )}

                  {/* Commits - compact format with optional link/button */}
                  {session.firstCommitHash ? (
                    <div>
                      <span className="text-base-content/60">Commits:</span>
                      {session.latestCommitHash &&
                      session.latestCommitHash !== session.firstCommitHash ? (
                        // Different commits - show commit range
                        <>
                          {onViewDiff ? (
                            // Desktop: clickable button that opens Session Changes tab
                            <button
                              onClick={onViewDiff}
                              className="ml-1.5 font-mono text-primary hover:text-primary-focus transition-colors hover:underline"
                              title={`View changes: ${session.firstCommitHash} → ${session.latestCommitHash}`}
                            >
                              {session.firstCommitHash.substring(0, 7)} →{' '}
                              {session.latestCommitHash.substring(0, 7)}
                            </button>
                          ) : gitHubDiffUrl ? (
                            // Server: link to GitHub diff
                            <a
                              href={gitHubDiffUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1.5 font-mono text-primary hover:text-primary-focus transition-colors hover:underline"
                              title={`View diff: ${session.firstCommitHash} → ${session.latestCommitHash}`}
                            >
                              {session.firstCommitHash.substring(0, 7)} →{' '}
                              {session.latestCommitHash.substring(0, 7)}
                            </a>
                          ) : (
                            // No action available: plain text
                            <span
                              className="ml-1.5 font-mono text-base-content"
                              title={`${session.firstCommitHash} → ${session.latestCommitHash}`}
                            >
                              {session.firstCommitHash.substring(0, 7)} →{' '}
                              {session.latestCommitHash.substring(0, 7)}
                            </span>
                          )}
                        </>
                      ) : (
                        // Same commit or no latest commit - show unstaged changes
                        <>
                          {onViewDiff ? (
                            // Desktop: clickable button for unstaged changes
                            <button
                              onClick={onViewDiff}
                              className="ml-1.5 font-mono text-primary hover:text-primary-focus transition-colors hover:underline"
                              title={`View unstaged changes from ${session.firstCommitHash}`}
                            >
                              {session.firstCommitHash.substring(0, 7)} →{' '}
                              <span className="text-base-content/60">UNSTAGED</span>
                            </button>
                          ) : (
                            // Plain text (server or no action)
                            <span
                              className="ml-1.5 font-mono text-base-content"
                              title={`Unstaged changes from ${session.firstCommitHash}`}
                            >
                              {session.firstCommitHash.substring(0, 7)} →{' '}
                              <span className="text-base-content/60">UNSTAGED</span>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    workingDirectory && (
                      // Historical session - no git commit data available
                      <div className="flex items-center h-full text-base-content/60 italic">
                        Git info unavailable (historical session)
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Working Directory */}
            {workingDirectory && (
              <div className="stat bg-base-200 rounded-lg p-2.5">
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-base-content/60">Working directory:</div>
                  <div className="stat-value text-sm">
                    {onCwdClick ? (
                      <button
                        onClick={() => onCwdClick(workingDirectory)}
                        className="text-left hover:text-primary transition-colors font-mono break-all text-xs"
                        title="Click to open in OS"
                      >
                        {workingDirectory}
                      </button>
                    ) : (
                      <span className="font-mono break-all text-xs">{workingDirectory}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Rating Badge */}
            {onRate && (
              <div className="stat bg-base-200 rounded-lg p-2.5">
                <div className="flex items-center justify-center h-full">
                  <RatingBadge rating={rating || null} onRate={onRate} size="md" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Summary */}
        {session.aiModelSummary && (
          <div className="mt-2 bg-base-200/50 border border-base-300 rounded-lg p-3">
            <p className="text-sm text-base-content">{session.aiModelSummary}</p>
          </div>
        )}
      </div>
    </div>
  )
}
