import type { ProcessorResult } from '@guidemode/types'
import { getUserDisplayName } from '../../utils/user.js'
import type { ModelTaskContext } from '../base/types.js'
import { condenseSession } from './condenser.js'
import type { CondenseOptions, CondensedTranscript } from './types.js'

/**
 * Read a single numeric metric out of the precomputed processor results.
 *
 * Returns `undefined` (not 0) when the metric is absent, so callers can distinguish
 * "no metrics supplied" from "genuinely zero".
 */
export function readNumericMetric(
  metrics: ProcessorResult[] | undefined,
  metricType: string,
  key: string
): number | undefined {
  const result = metrics?.find(m => m.metricType === metricType)
  const value = result?.metrics?.[key as keyof typeof result.metrics]
  return typeof value === 'number' ? value : undefined
}

/**
 * Read a boolean metric out of the precomputed processor results.
 */
export function readBooleanMetric(
  metrics: ProcessorResult[] | undefined,
  metricType: string,
  key: string
): boolean | undefined {
  const result = metrics?.find(m => m.metricType === metricType)
  const value = result?.metrics?.[key as keyof typeof result.metrics]
  return typeof value === 'boolean' ? value : undefined
}

/** Everything the four tasks share when turning a session into prompt variables. */
export interface TaskInputBase {
  userName: string
  provider: string
  durationMinutes: number | string
  messageCount: number
  transcript: CondensedTranscript
}

/**
 * Build the shared prompt inputs for a model task.
 *
 * Every task condenses the same way so that a change to what the model sees happens in
 * one place rather than four subtly different message walks.
 */
export function buildTaskInput(
  context: ModelTaskContext,
  options?: Partial<Omit<CondenseOptions, 'userName'>>
): TaskInputBase {
  const session = context.session
  if (!session) {
    throw new Error('Session data is required')
  }

  const userName = context.user ? getUserDisplayName(context.user) : 'the user'
  const transcript = condenseSession(session, { userName, ...options })

  return {
    userName,
    provider: context.provider,
    durationMinutes: session.duration ? Math.round(session.duration / 60000) : 'Unknown',
    messageCount: session.messages.length,
    transcript,
  }
}

/**
 * Render the tool usage summary as a single prompt line.
 */
export function formatToolUsage(transcript: CondensedTranscript): string {
  if (transcript.toolUsage.length === 0) {
    return 'None'
  }
  return transcript.toolUsage
    .map(t => `${t.name} x${t.count}${t.errorCount > 0 ? ` (${t.errorCount} failed)` : ''}`)
    .join(', ')
}
