/**
 * Unified Parser Types
 *
 * Domain types for session parsing that work across all providers.
 * These types bridge the gap between raw JSONL logs and both UI display and backend metrics.
 */

import type {
  ContentBlock,
  ProviderSessionTotals,
  StructuredMessageContent,
  TextContent,
  ToolResultContent,
  ToolUseContent,
} from '@guidemode/types'

/**
 * Raw message from JSONL log - provider-agnostic representation
 * Each provider parser transforms their specific format into this
 */
export interface RawLogMessage {
  timestamp: string
  [key: string]: unknown
}

/**
 * Content part that can appear in structured messages
 */
export interface ContentPart {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: unknown
  data?: string
  source?: {
    data?: string
    media_type?: string
  }
  thinking?: string
  signature?: string
}

/**
 * Structured content with parts array
 */
export interface PartsContent {
  parts: ContentPart[]
  text?: string
}

/**
 * All possible message content types
 */
export type MessageContent = string | ContentPart[] | PartsContent | Record<string, unknown>

/**
 * Message types supported across all providers
 * Aligned with canonical format: user/assistant instead of user_input/assistant_response
 */
export type UnifiedMessageType =
  | 'user'
  | 'assistant'
  | 'tool_use'
  | 'tool_result'
  | 'command'
  | 'command_output'
  | 'interruption'
  | 'compact' // Context compaction event
  | 'meta'

/**
 * Parsed message - unified format that works for both UI and backend
 * This is the output format from all provider parsers
 */
export interface ParsedMessage {
  id: string
  timestamp: Date
  type: UnifiedMessageType
  content: string | StructuredMessageContent
  metadata: {
    role?: string
    parentUuid?: string
    requestId?: string
    userType?: string
    hasToolUses?: boolean
    hasToolResults?: boolean
    toolCount?: number
    resultCount?: number
    providerMetadata?: Record<string, unknown> // Provider-specific metadata (e.g., Gemini thinking flags, Copilot intentions)
    [key: string]: unknown
  }
  parentId?: string
  linkedTo?: string
}

/**
 * Parsed session - complete session with all messages
 */
export interface ParsedSession {
  sessionId: string
  provider: string
  messages: ParsedMessage[]
  startTime: Date
  endTime: Date
  duration: number
  metadata: {
    messageCount: number
    lineCount: number
    [key: string]: unknown
  }
  /**
   * Summary record the provider wrote into the transcript (Claude's cost-state, Codex's
   * cumulative token usage). Not a message, so it is attached here rather than parsed
   * into `messages`. Undefined for providers that write none.
   */
  providerTotals?: ProviderSessionTotals
}

/**
 * Parser interface that all provider parsers must implement
 */
export interface SessionParser {
  readonly name: string
  readonly providerName: string

  /**
   * Check if this parser can handle the given JSONL content
   */
  canParse(jsonlContent: string): boolean

  /**
   * Parse JSONL content into a structured session
   */
  parseSession(jsonlContent: string): ParsedSession

  /**
   * Parse a single raw message into one or more parsed messages
   * Some providers may split single log entries into multiple messages
   * (e.g., separating tool_use and tool_result from a single entry)
   */
  parseMessage(rawMessage: RawLogMessage): ParsedMessage[]
}
