/**
 * EngagementMetricsSection - User patience and session duration patterns
 */

import { UserGroupIcon } from '@heroicons/react/24/outline'
import { MetricCard } from '../MetricCard.js'
import { MetricSection } from '../MetricSection.js'
import type { SessionMetricsUI } from '../MetricsOverview.js'

interface EngagementMetricsSectionProps {
  engagement: SessionMetricsUI['engagement']
}

export function EngagementMetricsSection({ engagement }: EngagementMetricsSectionProps) {
  // Presence, not truthiness. Zero is now the COMMON value for interruption rate - most
  // sessions are never interrupted - and a short session rounds to zero minutes, so a
  // falsy test hid the whole section from exactly the sessions that went well.
  if (
    !engagement ||
    (engagement.interruptionRate == null && engagement.sessionLengthMinutes == null)
  ) {
    return null
  }

  return (
    <MetricSection
      title="Engagement"
      subtitle="User patience and session duration patterns"
      icon={<UserGroupIcon />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <MetricCard
            label="Interruption Rate"
            value={
              engagement.interruptionRate != null
                ? Number.parseFloat(engagement.interruptionRate)
                : undefined
            }
            type="percentage"
            tooltip="Percentage of responses interrupted by user"
            metricId="interruption-rate"
          />
          <MetricCard
            label="Total Interruptions"
            value={engagement.totalInterruptions}
            tooltip="Total number of times user interrupted AI"
            metricId="total-interruptions"
          />
          <MetricCard
            label="Session Length"
            value={
              engagement.sessionLengthMinutes != null
                ? Number.parseFloat(engagement.sessionLengthMinutes)
                : undefined
            }
            suffix=" min"
            tooltip="Active interaction time in minutes"
            metricId="session-length"
          />
        </div>
      </div>
    </MetricSection>
  )
}
