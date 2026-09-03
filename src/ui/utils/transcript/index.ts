/**
 * Condensed transcript model — public surface.
 */

export * from './spanTypes.js'
export {
  type MessagePrefilterOptions,
  type ProjectedSpan,
  type SpanProjectionOptions,
  prefilterMessages,
  projectSpans,
} from './filterSpans.js'
export { deriveSpans, type DeriveSpansOptions } from './deriveSpans.js'
export { buildSummary, buildStrip } from './spanSummary.js'
export {
  type SpanLabelProvider,
  LABEL_MAX_CHARS,
  basename,
  buildHistogram,
  describeToolCall,
  deriveToolSpanLabel,
  dirname,
  hashSpan,
  splitMcpToolName,
  truncateLabel,
} from './spanLabels.js'
export { formatChars, formatCount, formatSpanDuration, pluralize } from './formatters.js'
export { type Lane, CONVERSATIONAL_TOOLS, eventKindOf, laneOf, metaRecordKind } from './lanes.js'
export { buildToolCall, buildToolStats, elapsedAcross } from './toolCalls.js'
export { extractPlanPayload, extractQuestionPayload } from './eventPayloads.js'
export {
  getToolInput,
  getToolName,
  getToolResultContent,
  getToolResultId,
  getToolUseId,
  isErrorResult,
  parseTimestamp,
  stringifyResult,
} from './messageAccess.js'
