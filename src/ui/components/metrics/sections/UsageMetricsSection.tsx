/**
 * UsageMetricsSection - AI navigation efficiency and input quality analysis
 */

import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import { MetricCard } from '../MetricCard.js'
import { MetricSection } from '../MetricSection.js'
import type { SessionMetricsUI } from '../MetricsOverview.js'

interface UsageMetricsSectionProps {
  usage: SessionMetricsUI['usage']
}

export function UsageMetricsSection({ usage }: UsageMetricsSectionProps) {
  // Presence, not truthiness: a clarity score of 0 is a real measurement, and a session
  // that read nothing has a read/write ratio of 0. Both are worth showing.
  if (!usage || (usage.readWriteRatio == null && usage.inputClarityScore == null)) {
    return null
  }

  return (
    <MetricSection
      title="Usage Efficiency"
      subtitle="AI navigation efficiency and input quality analysis"
      icon={<WrenchScrewdriverIcon />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          <MetricCard
            label="Read/Write Ratio"
            value={
              usage.readWriteRatio != null ? Number.parseFloat(usage.readWriteRatio) : undefined
            }
            suffix=":1"
            tooltip="Reads per write (lower is better - high means AI is 'lost')"
            metricId="read-write-ratio"
          />
          <MetricCard
            label="Input Clarity Score"
            value={
              usage.inputClarityScore != null
                ? Number.parseFloat(usage.inputClarityScore)
                : undefined
            }
            type="percentage"
            tooltip="Technical terms and code snippets density"
            metricId="input-clarity-score"
          />
        </div>
      </div>
    </MetricSection>
  )
}
