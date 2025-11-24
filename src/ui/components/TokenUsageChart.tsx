/**
 * TokenUsageChart - Interactive bar chart showing per-message token usage
 *
 * Features:
 * - Stacked bars showing input and output tokens
 * - In cumulative mode, also shows cache reads (already cumulative from API)
 * - Toggle between per-message and cumulative views
 * - Clickable bars that scroll to corresponding messages
 * - Responsive width (bars auto-thin with more messages)
 * - DaisyUI themed colors
 */

import { useCallback, useMemo } from 'react'
import {
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type RechartsTokenData,
  calculateCumulativeTokens,
  calculatePerMessageTokens,
  formatForRecharts,
} from '../utils/extractTokens.js'
import type { TimelineItem } from '../utils/timelineTypes.js'

export interface TokenUsageChartProps {
  /** Timeline items (filtered by current transcript filters) */
  items: TimelineItem[]

  /** Callback to scroll to a specific message */
  onMessageClick?: (messageId: string) => void
}

/**
 * Custom tooltip showing per-message tokens and current cache total
 */
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: RechartsTokenData }[]
}) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const data = payload[0].payload as RechartsTokenData

  return (
    <div className="bg-base-100 border border-base-300 rounded-lg shadow-lg p-3 text-sm">
      <div className="font-semibold mb-2">Message {data.index + 1}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-primary">Input:</span>
          <span className="font-mono">{data.input.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Output:</span>
          <span className="font-mono">{data.output.toLocaleString()}</span>
        </div>
        {data.cacheRead > 0 && (
          <div className="flex justify-between gap-4 border-t border-base-300 pt-1 mt-1">
            <span style={{ color: CHART_COLORS.cacheRead }}>Cached Context:</span>
            <span className="font-mono">{data.cacheRead.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Theme colors that work well in both light and dark modes
const CHART_COLORS = {
  primary: '#0891b2', // Cyan - for input tokens
  secondary: '#a855f7', // Purple - for output tokens
  cacheRead: '#f59e0b', // Amber/orange - for cache reads line
}

export function TokenUsageChart({ items, onMessageClick }: TokenUsageChartProps) {
  // Calculate per-message data with cumulative cache reads for the line
  const chartData = useMemo(() => {
    const perMessage = calculatePerMessageTokens(items)
    const cumulative = calculateCumulativeTokens(items)

    // Combine: per-message bars + cumulative cache line
    return formatForRecharts(perMessage, 'per-message')
      .map((d, i) => ({
        ...d,
        cacheRead: cumulative[i]?.cacheRead || 0, // Add cumulative cache for line
      }))
      .filter(d => d.total > 0 || d.cacheRead > 0) // Keep if has tokens OR cache
  }, [items])

  // Calculate current cached context from the most recent message
  const currentContextLength = useMemo(() => {
    const cumulative = calculateCumulativeTokens(items)
    if (cumulative.length === 0) return 0
    // Get the last message's cached context (cacheRead only)
    return cumulative[cumulative.length - 1].cacheRead
  }, [items])

  // Get color based on context length thresholds
  const getContextColor = (contextLength: number): string => {
    if (contextLength < 100000) return '#22C55E' // Green: < 100k
    if (contextLength < 150000) return '#F59E0B' // Orange: 100k-150k
    return '#EF4444' // Red: > 150k
  }

  // Handle bar click - scroll to message
  const handleBarClick = useCallback(
    (data: RechartsTokenData) => {
      if (onMessageClick) {
        onMessageClick(data.messageId)
      }
    },
    [onMessageClick]
  )

  // If no messages with tokens, don't show the chart
  const hasTokens = chartData.some(d => d.total > 0)
  if (!hasTokens) {
    return null
  }

  // Shared function to calculate Y-axis ticks and domain
  const calculateAxisScale = (maxValue: number) => {
    // Find the appropriate tick interval based on data range
    let tickInterval: number
    if (maxValue <= 1000) {
      tickInterval = 250 // 0, 250, 500, 750, 1000
    } else if (maxValue <= 2500) {
      tickInterval = 500 // 0, 500, 1000, 1500, 2000, 2500
    } else if (maxValue <= 5000) {
      tickInterval = 1000 // 0, 1k, 2k, 3k, 4k, 5k
    } else if (maxValue <= 25000) {
      tickInterval = 5000 // 0, 5k, 10k, 15k, 20k, 25k
    } else {
      tickInterval = 10000 // 0, 10k, 20k, 30k, etc.
    }

    // Calculate how many ticks we need to cover the max value
    const numTicks = Math.ceil(maxValue / tickInterval) + 1
    const ticks = Array.from({ length: numTicks }, (_, i) => i * tickInterval)
    const domain: [number, number] = [0, tickInterval * (numTicks - 1)]

    return { ticks, domain }
  }

  // Calculate max values for dual Y-axes
  const maxBarTokens = Math.max(...chartData.map(d => d.total))
  const maxCacheTokens = Math.max(...chartData.map(d => d.cacheRead))
  const showCacheLine = maxCacheTokens > 0

  // Left Y-axis (bars) - per-message tokens
  const { ticks: barYTicks, domain: barYDomain } = calculateAxisScale(maxBarTokens)

  // Right Y-axis (line) - cumulative cache (uses same formula)
  const { ticks: cacheYTicks, domain: cacheYDomain } = calculateAxisScale(maxCacheTokens)
  const showReferenceLine = maxCacheTokens > 150000

  const contextWindowSize = 200000 // Claude Sonnet 4.5 context window
  const contextPercent = Math.min((currentContextLength / contextWindowSize) * 100, 100)
  const contextColor = getContextColor(currentContextLength)

  return (
    <div className="bg-base-100 border border-base-300 rounded-lg p-4 mb-4">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Token Usage</h3>
        <p className="text-xs text-base-content/60">
          Per-message tokens and cumulative cache context
        </p>
      </div>

      {/* Desktop: Chart and Context Indicator Container */}
      <div className="hidden md:flex items-stretch">
        {/* Chart Section - explicit height for ResponsiveContainer flex fix */}
        <div className="flex-1 min-w-0" style={{ height: '120px' }}>
          <ResponsiveContainer width="99%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
              barCategoryGap="1%"
            >
              <XAxis dataKey="index" hide domain={[0, chartData.length - 1]} />

              {/* Left Y-axis for bars (per-message tokens) */}
              <YAxis
                yAxisId="left"
                domain={barYDomain}
                ticks={barYTicks}
                tick={{ fontSize: 10, fill: 'currentColor' }}
                tickFormatter={(value: number) =>
                  value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toString()
                }
              />

              {/* Right Y-axis for line (cumulative cache) */}
              {showCacheLine && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={cacheYDomain}
                  ticks={cacheYTicks}
                  tick={{ fontSize: 10, fill: CHART_COLORS.cacheRead }}
                  tickFormatter={(value: number) =>
                    value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toString()
                  }
                />
              )}

              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.1)' }} />

              {/* 200k reference line on right axis - only when nearing limit */}
              {showReferenceLine && (
                <ReferenceLine
                  yAxisId="right"
                  y={200000}
                  stroke={CHART_COLORS.cacheRead}
                  strokeDasharray="3 3"
                  strokeOpacity={0.3}
                  label={{
                    value: '200k',
                    position: 'right',
                    fontSize: 10,
                    fill: CHART_COLORS.cacheRead,
                    opacity: 0.5,
                  }}
                />
              )}

              {/* Stacked bars for input/output (left axis) */}
              <Bar
                yAxisId="left"
                dataKey="input"
                stackId="tokens"
                fill={CHART_COLORS.primary}
                onClick={(data: RechartsTokenData) => handleBarClick(data)}
                cursor="pointer"
                isAnimationActive={false}
              />
              <Bar
                yAxisId="left"
                dataKey="output"
                stackId="tokens"
                fill={CHART_COLORS.secondary}
                onClick={(data: RechartsTokenData) => handleBarClick(data)}
                cursor="pointer"
                isAnimationActive={false}
              />

              {/* Line for cumulative cache reads (right axis) */}
              {showCacheLine && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cacheRead"
                  stroke={CHART_COLORS.cacheRead}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex justify-center gap-4 mt-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS.primary }} />
              <span>Input</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: CHART_COLORS.secondary }}
              />
              <span>Output</span>
            </div>
            {showCacheLine && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5" style={{ backgroundColor: CHART_COLORS.cacheRead }} />
                <span>Cached Context</span>
              </div>
            )}
          </div>
        </div>

        {/* Context Length Indicator */}
        {currentContextLength > 0 && (
          <div className="flex flex-col items-center justify-center" style={{ width: '90px' }}>
            {/* Vertical Bar */}
            <div
              className="relative w-8 bg-base-200 border border-base-300 rounded overflow-hidden"
              style={{ height: '120px' }}
            >
              {/* Fill */}
              <div
                className="absolute bottom-0 w-full transition-all duration-300"
                style={{
                  height: `${contextPercent}%`,
                  backgroundColor: contextColor,
                }}
              />
              {/* Threshold markers */}
              <div className="absolute left-0 bottom-1/2 w-full h-px bg-base-content/10" />{' '}
              {/* 100k at 50% */}
              <div
                className="absolute left-0 w-full h-px bg-base-content/10"
                style={{ bottom: '75%' }}
              />{' '}
              {/* 150k at 75% */}
            </div>

            {/* Values Below */}
            <div className="mt-2 text-center">
              <div className="text-xs font-semibold" style={{ color: contextColor }}>
                {(currentContextLength / 1000).toFixed(0)}k
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: Horizontal Context Bar */}
      {currentContextLength > 0 && (
        <div className="block md:hidden">
          {/* Horizontal Bar Container */}
          <div className="space-y-2">
            {/* Label and Stats */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-base-content/60">Cached Context</span>
              <span className="font-semibold" style={{ color: contextColor }}>
                {(currentContextLength / 1000).toFixed(0)}k / 200k ({contextPercent.toFixed(0)}%)
              </span>
            </div>

            {/* Horizontal Progress Bar */}
            <div className="relative w-full h-6 bg-base-200 border border-base-300 rounded overflow-hidden">
              {/* Fill */}
              <div
                className="absolute left-0 h-full transition-all duration-300"
                style={{
                  width: `${contextPercent}%`,
                  backgroundColor: contextColor,
                }}
              />
              {/* Threshold markers */}
              <div className="absolute left-1/2 top-0 w-px h-full bg-base-content/10" />
              <div className="absolute left-3/4 top-0 w-px h-full bg-base-content/10" />
            </div>

            {/* Threshold Labels */}
            <div className="flex justify-between text-xs text-base-content/40">
              <span>0k</span>
              <span>100k</span>
              <span>150k</span>
              <span>200k</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
