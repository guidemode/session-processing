/**
 * Types for the shared session condenser.
 *
 * The condenser turns a `ParsedSession` into a compact, conversation-only transcript
 * suitable for an LLM prompt. Tool inputs and outputs are the overwhelming majority of
 * a session's bytes (measured at 99.6%+ on real Claude Code transcripts) and carry
 * almost no signal about what the person was trying to do, so they are collapsed into
 * counts rather than reproduced.
 */

/**
 * Tools whose payloads ARE the conversation rather than machinery.
 *
 * Plans live in `ExitPlanMode`'s input and question/answer exchanges live in
 * `AskUserQuestion`'s input and result, so stripping "all tool calls" literally would
 * delete exactly the content that best explains a session. These are kept and rendered
 * as conversation turns.
 */
export const DEFAULT_CONVERSATIONAL_TOOLS = ['ExitPlanMode', 'AskUserQuestion', 'TodoWrite']

/**
 * Character budget for the rendered transcript, EXCLUDING verbatim plan text.
 * ~15k tokens at 4 chars/token. Plans ride on top - see `CondensedTranscript.planChars`.
 */
export const DEFAULT_MAX_CHARS = 60_000

/** Per-message caps. Long messages keep their opening and their ending. */
export const DEFAULT_HEAD_CHARS = 2_000
export const DEFAULT_TAIL_CHARS = 500

export interface CondenseOptions {
  /** Display name used to label the person's turns. */
  userName: string
  /**
   * Budget for `text` EXCLUDING plan payloads. Defaults to {@link DEFAULT_MAX_CHARS}.
   * Plans are never truncated and never counted against this.
   */
  maxChars?: number
  /** Chars kept from the start of an over-long message. Defaults to {@link DEFAULT_HEAD_CHARS}. */
  headChars?: number
  /** Chars kept from the end of an over-long message. Defaults to {@link DEFAULT_TAIL_CHARS}. */
  tailChars?: number
  /** Render collapsed `[N tool calls: ...]` markers. Defaults to true. */
  includeToolSummary?: boolean
  /** Tools whose payloads are kept. Defaults to {@link DEFAULT_CONVERSATIONAL_TOOLS}. */
  keepToolPayloadsFor?: string[]
}

/** Aggregate usage for a single tool across the session. */
export interface ToolUsageSummary {
  name: string
  count: number
  /** Results for this tool flagged `is_error`. */
  errorCount: number
}

export interface CondensedTranscript {
  /** The rendered transcript, one labelled line per retained message. */
  text: string
  /**
   * Original 1-based message indices retained, in order.
   *
   * Load-bearing: `SessionPhase.startStep`/`endStep` are the indices the UI uses to link
   * a phase back to a range of messages. Because condensing removes messages, the
   * rendered step numbers are sparse and must never be renumbered.
   */
  includedIndices: number[]
  /** Count of user-authored turns retained (user, interruption, command, compact). */
  userTurnCount: number
  /** Count of messages the person typed that were interruptions. */
  interruptionCount: number
  /** Total messages in the source session. */
  totalMessages: number
  /** Messages not rendered as their own line (collapsed tool calls plus elided middle). */
  droppedMessages: number
  /** Per-tool usage across the whole session, regardless of what was rendered. */
  toolUsage: ToolUsageSummary[]
  /** Distinct tool names used. */
  uniqueToolCount: number
  /** Total tool results flagged `is_error`. */
  toolErrorCount: number
  /** `text.length`. */
  estimatedChars: number
  /**
   * Characters occupied by verbatim plan text.
   *
   * Plans are exempt from `maxChars`, so the effective ceiling is `maxChars + planChars`.
   */
  planChars: number
  /** True when the middle of the session was elided to fit the budget. */
  truncated: boolean
}
