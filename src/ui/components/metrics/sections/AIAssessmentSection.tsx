/**
 * AIAssessmentSection - AI-generated quality analysis and session summary
 */

import type { AIModelMetadata } from '@guidemode/types'
import { CpuChipIcon } from '@heroicons/react/24/outline'
import { MetricSection } from '../MetricSection.js'
import { getMetricColor, getMetricThreshold } from '../metricThresholds.js'

interface AIAssessmentSectionProps {
  aiModelSummary?: string | null
  aiModelQualityScore?: number | null
  aiModelMetadata?: AIModelMetadata | null
}

const AI_QUALITY_BANDS = getMetricThreshold('ai-model-quality-score') ?? {
  excellent: 80,
  warning: 60,
}

export function AIAssessmentSection({
  aiModelSummary,
  aiModelQualityScore,
  aiModelMetadata,
}: AIAssessmentSectionProps) {
  // Only render if there's data to display
  if (!aiModelSummary && aiModelQualityScore === null && !aiModelMetadata) {
    return null
  }

  return (
    <MetricSection
      title="AI Assessment"
      subtitle="AI-generated quality analysis and session summary"
      icon={<CpuChipIcon />}
    >
      <div className="space-y-4">
        {/* Top Row: Score + Summary */}
        {(aiModelQualityScore !== null && aiModelQualityScore !== undefined) || aiModelSummary ? (
          <div className="bg-base-100 border border-base-300 rounded-lg p-4">
            <div className="flex flex-col md:flex-row gap-4">
              {aiModelQualityScore !== null && aiModelQualityScore !== undefined && (
                <div className="bg-base-200 rounded-lg p-4 md:w-1/4 flex-shrink-0">
                  <div className="text-xs text-base-content/60 mb-1">Quality Score</div>
                  <div
                    className={`text-3xl font-bold ${getMetricColor(
                      aiModelQualityScore,
                      'ai-model-quality-score'
                    )}`}
                  >
                    {aiModelQualityScore}%
                  </div>
                  <div className="text-xs text-base-content/60 mt-1">
                    {aiModelQualityScore >= AI_QUALITY_BANDS.excellent
                      ? 'Excellent session quality'
                      : aiModelQualityScore >= AI_QUALITY_BANDS.warning
                        ? 'Good session quality'
                        : 'Room for improvement'}
                  </div>
                </div>
              )}
              {aiModelSummary && (
                <div className="bg-base-200 rounded-lg p-4 flex-1">
                  <div className="text-xs font-semibold mb-2 text-base-content/60">Summary</div>
                  <div className="text-sm leading-relaxed">{aiModelSummary}</div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Bottom Row: Improvements + Strengths */}
        {aiModelMetadata?.['quality-assessment'] && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Improvements */}
            {aiModelMetadata['quality-assessment'].improvements &&
              aiModelMetadata['quality-assessment'].improvements.length > 0 && (
                <div className="bg-base-100 border border-base-300 rounded-lg p-4">
                  <div className="text-sm font-semibold mb-3 text-base-content/80">
                    Areas for Improvement
                  </div>
                  <ul className="space-y-2">
                    {aiModelMetadata['quality-assessment'].improvements.map((item: string) => (
                      <li key={item} className="flex items-start gap-2 text-sm">
                        <span className="text-warning mt-1">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Strengths */}
            {aiModelMetadata['quality-assessment'].strengths &&
              aiModelMetadata['quality-assessment'].strengths.length > 0 && (
                <div className="bg-base-100 border border-base-300 rounded-lg p-4">
                  <div className="text-sm font-semibold mb-3 text-base-content/80">Strengths</div>
                  <ul className="space-y-2">
                    {aiModelMetadata['quality-assessment'].strengths.map((item: string) => (
                      <li key={item} className="flex items-start gap-2 text-sm">
                        <span className="text-success mt-1">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        )}

        {/* Additional Metadata (Intent Extraction, etc.) */}
        {aiModelMetadata?.['intent-extraction'] && (
          <div className="card bg-base-100 border border-base-300 p-4">
            <h5 className="font-semibold mb-3">Intent Extraction</h5>
            <div className="space-y-3">
              {aiModelMetadata['intent-extraction'].taskType && (
                <div>
                  <div className="text-xs text-base-content/60 mb-1">Task Type</div>
                  <div className="badge badge-primary">
                    {aiModelMetadata['intent-extraction'].taskType.replace(/_/g, ' ')}
                  </div>
                </div>
              )}
              {aiModelMetadata['intent-extraction'].primaryGoal && (
                <div>
                  <div className="text-xs text-base-content/60 mb-1">Primary Goal</div>
                  <div className="text-sm">{aiModelMetadata['intent-extraction'].primaryGoal}</div>
                </div>
              )}
              {aiModelMetadata['intent-extraction'].technologies &&
                (Array.isArray(aiModelMetadata['intent-extraction'].technologies)
                  ? aiModelMetadata['intent-extraction'].technologies.length > 0
                  : Object.keys(aiModelMetadata['intent-extraction'].technologies).length > 0) && (
                  <div>
                    <div className="text-xs text-base-content/60 mb-1">Technologies</div>
                    <div className="flex flex-wrap gap-2">
                      {Array.isArray(aiModelMetadata['intent-extraction'].technologies)
                        ? aiModelMetadata['intent-extraction'].technologies.map((tech: string) => (
                            <span key={tech} className="badge badge-ghost">
                              {tech}
                            </span>
                          ))
                        : Object.entries(aiModelMetadata['intent-extraction'].technologies).map(
                            ([key, val]: [string, string]) => (
                              <span key={key} className="badge badge-ghost">
                                {val}
                              </span>
                            )
                          )}
                    </div>
                  </div>
                )}
              {aiModelMetadata['intent-extraction'].challenges &&
                aiModelMetadata['intent-extraction'].challenges.length > 0 && (
                  <div>
                    <div className="text-xs text-base-content/60 mb-1">Challenges</div>
                    {Array.isArray(aiModelMetadata['intent-extraction'].challenges) ? (
                      <ul className="space-y-1">
                        {aiModelMetadata['intent-extraction'].challenges.map(
                          (challenge: string) => (
                            <li key={challenge} className="flex items-start gap-2 text-sm">
                              <span className="text-primary mt-1">•</span>
                              <span>{challenge}</span>
                            </li>
                          )
                        )}
                      </ul>
                    ) : (
                      <div className="text-sm">
                        {aiModelMetadata['intent-extraction'].challenges}
                      </div>
                    )}
                  </div>
                )}
              {aiModelMetadata['intent-extraction'].secondaryGoals &&
                aiModelMetadata['intent-extraction'].secondaryGoals.length > 0 && (
                  <div>
                    <div className="text-xs text-base-content/60 mb-1">Secondary Goals</div>
                    {Array.isArray(aiModelMetadata['intent-extraction'].secondaryGoals) ? (
                      <ul className="space-y-1">
                        {aiModelMetadata['intent-extraction'].secondaryGoals.map((goal: string) => (
                          <li key={goal} className="flex items-start gap-2 text-sm">
                            <span className="text-primary mt-1">•</span>
                            <span>{goal}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm">
                        {aiModelMetadata['intent-extraction'].secondaryGoals}
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </MetricSection>
  )
}
