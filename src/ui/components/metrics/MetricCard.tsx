/**
 * MetricCard - Displays a single metric with formatting
 *
 * Uses per-metric threshold configuration for color coding.
 * See metricThresholds.ts for configuration.
 */

import { getMetricColor as getColorFromThresholds } from './metricThresholds.js'

// Utility functions
function formatDuration(value: number): string {
  if (value < 1000) return `${value}ms`
  if (value < 60000) return `${(value / 1000).toFixed(1)}s`
  if (value < 3600000) return `${(value / 60000).toFixed(1)}m`
  return `${(value / 3600000).toFixed(1)}h`
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}

interface MetricCardProps {
  label: string
  value: string | number | boolean | null | undefined | unknown[] | Record<string, unknown>
  unit?: string
  suffix?: string
  type?: 'number' | 'percentage' | 'duration' | 'array' | 'object' | 'string' | 'currency'
  tooltip?: string
  size?: 'sm' | 'md' | 'lg'
  /** Metric identifier for threshold lookup (e.g., 'read-write-ratio', 'response-latency') */
  metricId?: string
}

export function MetricCard({
  label,
  value,
  unit,
  suffix,
  type = 'number',
  tooltip,
  size = 'md',
  metricId,
}: MetricCardProps) {
  const formatValue = () => {
    if (value === null || value === undefined) return 'N/A'

    switch (type) {
      case 'duration':
        return typeof value === 'number' ? formatDuration(value) : 'N/A'
      case 'percentage':
        return typeof value === 'number' ? formatPercentage(value) : 'N/A'
      case 'array':
        if (Array.isArray(value)) {
          return value.length === 0 ? 'None' : value.join(', ')
        }
        return 'N/A'
      case 'object':
        if (typeof value === 'object' && value !== null) {
          return Object.keys(value).length === 0 ? 'None' : JSON.stringify(value, null, 1)
        }
        return 'N/A'
      case 'string':
        return value.toString()
      case 'currency':
        // Four decimals, not two: an API-equivalent cost is routinely a fraction of a
        // cent per session, and rounding to $0.00 would report a real cost as no cost.
        return typeof value === 'number'
          ? value.toLocaleString(undefined, {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })
          : 'N/A'
      default:
        return typeof value === 'number' ? value.toLocaleString() : value.toString()
    }
  }

  const getValueColor = () => {
    if (typeof value !== 'number') {
      return 'text-base-content'
    }

    // Only apply threshold types when a metricId is provided
    // This ensures metrics without explicit configuration remain neutral
    let thresholdType: 'percentage' | 'time' | 'score' | 'number' | undefined
    if (metricId) {
      if (type === 'percentage' || type === 'duration') {
        thresholdType = type === 'duration' ? 'time' : 'percentage'
      } else if (type === 'number' && value >= 0 && value <= 100) {
        thresholdType = 'score'
      }
    }

    // Use the new threshold system with metric ID
    return getColorFromThresholds(value, metricId, thresholdType)
  }

  const cardSizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  }

  const textSizeClasses = {
    sm: { value: 'text-lg', label: 'text-xs' },
    md: { value: 'text-xl', label: 'text-sm' },
    lg: { value: 'text-2xl', label: 'text-base' },
  }

  return (
    <div
      className={`card bg-base-100 shadow-sm border border-base-200 ${cardSizeClasses[size]}`}
      title={tooltip}
    >
      <div className="space-y-1">
        <div className={`font-semibold ${getValueColor()} ${textSizeClasses[size].value}`}>
          {formatValue()}
          {(suffix || unit) && <span className="text-base-content/60 ml-1">{suffix || unit}</span>}
        </div>
        <div className={`text-base-content/70 font-medium ${textSizeClasses[size].label}`}>
          {label}
        </div>
      </div>
    </div>
  )
}
