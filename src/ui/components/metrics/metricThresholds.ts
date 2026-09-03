/**
 * Metric Threshold Configuration
 *
 * Defines color thresholds for each metric type.
 * Makes it easy to adjust what "good" vs "bad" means for each metric.
 */

export type MetricDirection = 'higher-is-better' | 'lower-is-better'

export interface MetricThreshold {
  /** Direction of improvement */
  direction: MetricDirection
  /** Value for excellent/green threshold */
  excellent: number
  /** Value for warning/yellow threshold */
  warning: number
  /** Optional label for the metric (used in tooltips) */
  label?: string
}

/**
 * Metric threshold configuration map
 *
 * For 'higher-is-better' metrics:
 *   - >= excellent: green
 *   - >= warning: yellow
 *   - < warning: red
 *
 * For 'lower-is-better' metrics:
 *   - <= excellent: green
 *   - <= warning: yellow
 *   - > warning: red
 */
export const METRIC_THRESHOLDS: Record<string, MetricThreshold> = {
  // Usage Metrics
  'read-write-ratio': {
    direction: 'lower-is-better',
    excellent: 2,
    warning: 5,
    label: 'Lower is better - AI found files efficiently',
  },
  /**
   * Calibrated against the measured distribution rather than guessed, which is what the
   * two rounds of "lowered from N" before this were. Across 90 real developer sessions
   * scored by the per-message formula: p25 = 4, median = 9, p90 = 22, max = 40.
   *
   * Green therefore sits at roughly the top decile and yellow at about the median. The
   * previous 40/20 pair put green at the single best session in the corpus - a band nobody
   * could reach is not a target, it is a permanent red mark.
   */
  'input-clarity-score': {
    direction: 'higher-is-better',
    excellent: 20,
    warning: 8,
    label: 'Technical detail and specificity in requests',
  },

  // Engagement Metrics
  'interruption-rate': {
    direction: 'lower-is-better',
    excellent: 20, // <= 20% is excellent
    warning: 40, // 20-40% is acceptable
    label: 'Lower is better - fewer course corrections',
  },
  'total-interruptions': {
    direction: 'lower-is-better',
    excellent: 2,
    warning: 5,
    label: 'Total number of interruptions',
  },
  affirmations: {
    direction: 'lower-is-better',
    excellent: 5,
    warning: 10,
    label: 'Excessive affirmations indicate validation issues',
  },
  'session-length': {
    direction: 'lower-is-better',
    excellent: 30, // <= 30 min
    warning: 60, // 30-60 min
    label: 'Efficient session duration',
  },

  // Performance Metrics
  'response-latency': {
    direction: 'lower-is-better',
    excellent: 5000, // <= 5s is excellent (5000ms)
    warning: 15000, // 5-15s is acceptable (15000ms)
    label: 'Average AI response time',
  },
  'task-completion-time': {
    direction: 'lower-is-better',
    excellent: 600000, // <= 10 min (600000ms)
    warning: 1800000, // 10-30 min (1800000ms)
    label: 'Total time to complete task',
  },

  // Quality Metrics
  'task-success-rate': {
    direction: 'higher-is-better',
    excellent: 80,
    warning: 60,
    label: 'Percentage of successful operations',
  },
  /**
   * Deterministic scorer (`session_metrics.process_quality_score`) - a checklist of
   * process practices. Distinct from `ai-model-quality-score` below; the two measure
   * different things and deliberately do not share bands.
   */
  'process-quality-score': {
    direction: 'higher-is-better',
    excellent: 70, // Lowered from 80
    warning: 50, // Lowered from 60
    label: 'Good practices: plan mode, testing, incremental approach',
  },
  /**
   * LLM assessment (`agent_sessions.ai_model_quality_score`) - how well the person set
   * the AI up to succeed. Bands match the rubric anchors in the scoring prompt.
   */
  'ai-model-quality-score': {
    direction: 'higher-is-better',
    excellent: 80,
    warning: 60,
    label: 'How well the session was set up: context, clarity, steering, process',
  },
  'iteration-count': {
    direction: 'lower-is-better',
    excellent: 5,
    warning: 10,
    label: 'Fewer iterations = clearer requirements',
  },

  // Error Metrics
  'error-count': {
    direction: 'lower-is-better',
    excellent: 2,
    warning: 5,
    label: 'Total errors encountered',
  },
  'fatal-errors': {
    direction: 'lower-is-better',
    excellent: 0,
    warning: 1,
    label: 'Critical errors that stopped progress',
  },
  'recovery-attempts': {
    direction: 'lower-is-better',
    excellent: 1,
    warning: 3,
    label: 'Number of error recovery attempts',
  },

  // Context Metrics
  'context-utilization': {
    direction: 'lower-is-better',
    excellent: 60, // <= 60% is good
    warning: 80, // 60-80% is warning
    label: 'Context window usage',
  },
  'compaction-events': {
    direction: 'lower-is-better',
    excellent: 0, // 0 is excellent
    warning: 1, // 1 is acceptable
    label: 'Context compaction events - fewer is better',
  },

  // Git Diff Metrics
  'lines-read-per-changed': {
    direction: 'lower-is-better',
    excellent: 10,
    warning: 30,
    label: 'Navigation efficiency - lower is better',
  },
  'reads-per-file': {
    direction: 'lower-is-better',
    excellent: 3,
    warning: 10,
    label: 'Read operations per file changed',
  },
  'lines-per-minute': {
    direction: 'higher-is-better',
    excellent: 5,
    warning: 2,
    label: 'Code productivity - higher is better',
  },
  'lines-per-tool': {
    direction: 'higher-is-better',
    excellent: 10,
    warning: 5,
    label: 'Tool efficiency - higher is better',
  },

  // Default fallback for percentage-like scores
  'default-percentage': {
    direction: 'higher-is-better',
    excellent: 70, // More realistic than 80
    warning: 50, // More realistic than 60
    label: 'General percentage metric',
  },

  // Default fallback for duration metrics
  'default-duration': {
    direction: 'lower-is-better',
    excellent: 5000, // 5 seconds
    warning: 15000, // 15 seconds
    label: 'General duration metric',
  },
}

/**
 * Get color class for a metric value
 */
export function getMetricColor(
  value: number,
  metricId?: string,
  type?: 'percentage' | 'time' | 'score' | 'number'
): string {
  // Try to get specific threshold for this metric
  let threshold = metricId ? METRIC_THRESHOLDS[metricId] : undefined

  // Fallback to type-based defaults
  if (!threshold && type) {
    if (type === 'percentage' || type === 'score') {
      threshold = METRIC_THRESHOLDS['default-percentage']
    } else if (type === 'time') {
      threshold = METRIC_THRESHOLDS['default-duration']
    }
  }

  // If still no threshold, return neutral
  if (!threshold) {
    return 'text-base-content'
  }

  // Apply threshold logic based on direction
  if (threshold.direction === 'higher-is-better') {
    if (value >= threshold.excellent) return 'text-success'
    if (value >= threshold.warning) return 'text-warning'
    return 'text-error'
  }
  // lower-is-better
  if (value <= threshold.excellent) return 'text-success'
  if (value <= threshold.warning) return 'text-warning'
  return 'text-error'
}

/**
 * Get threshold configuration for a metric
 */
export function getMetricThreshold(metricId: string): MetricThreshold | undefined {
  return METRIC_THRESHOLDS[metricId]
}
