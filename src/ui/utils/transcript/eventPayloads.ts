/**
 * Payload extraction for the events that get their own visual treatment.
 *
 * These read `tool_use.input` directly rather than going through `ToolBlock`, which is
 * why a plan renders as markdown here instead of collapsed raw JSON.
 */

import type { TimelineMessage } from '../timelineTypes.js'
import {
  getToolInput,
  getToolResultContent,
  isErrorResult,
  stringifyResult,
} from './messageAccess.js'
import type { PlanPayload, QuestionEntry, QuestionPayload } from './spanTypes.js'

/** First non-empty line, lowercased — where a tool result states its verdict. */
function firstLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) return trimmed.toLowerCase()
  }
  return ''
}

/** Extract the plan markdown and whether the user approved it. */
export function extractPlanPayload(
  use: TimelineMessage,
  result: TimelineMessage | null
): PlanPayload {
  const input = getToolInput(use.originalMessage)
  const plan = typeof input?.plan === 'string' ? input.plan : ''

  if (!result) return { plan, outcome: 'pending' }
  if (isErrorResult(result.originalMessage)) return { plan, outcome: 'rejected' }

  // The verdict is the FIRST LINE; everything after it echoes the plan back verbatim.
  // Scanning the whole result would let a plan that merely discusses rejection mark
  // itself rejected.
  const verdict = firstLine(stringifyResult(getToolResultContent(result.originalMessage)))
  if (verdict.includes('rejected') || verdict.includes("doesn't want to proceed")) {
    return { plan, outcome: 'rejected' }
  }
  return { plan, outcome: 'approved' }
}

function readOptions(raw: unknown): Array<{ label: string; description: string }> {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(option => {
    if (typeof option !== 'object' || option === null) return []
    const record = option as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label : ''
    if (!label) return []
    return [
      { label, description: typeof record.description === 'string' ? record.description : '' },
    ]
  })
}

/**
 * Extract the questions asked and, where we can tell, which option was chosen.
 *
 * The result text echoes the selections back, so an option is marked chosen when its
 * label appears there. This is a best-effort match — a missing highlight is harmless.
 */
export function extractQuestionPayload(
  use: TimelineMessage,
  result: TimelineMessage | null
): QuestionPayload {
  const input = getToolInput(use.originalMessage)
  const answerText = result
    ? stringifyResult(getToolResultContent(result.originalMessage)) || null
    : null

  const raw = Array.isArray(input?.questions) ? input.questions : []
  const questions: QuestionEntry[] = raw.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    const question = typeof record.question === 'string' ? record.question : ''
    if (!question) return []
    return [
      {
        header: typeof record.header === 'string' ? record.header : '',
        question,
        multiSelect: record.multiSelect === true,
        options: readOptions(record.options).map(option => ({
          ...option,
          chosen: answerText?.includes(option.label) ?? false,
        })),
      },
    ]
  })

  return { questions, answerText }
}
