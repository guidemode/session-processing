/**
 * Timeline Types - Normalized message structure for provider-agnostic rendering
 *
 * This module defines the normalized message types used for rendering session timelines.
 * These types provide a consistent interface regardless of the underlying provider (Claude, OpenCode, Codex, etc.)
 */

import type React from 'react'
import type { BaseSessionMessage } from './sessionTypes.js'

/**
 * Content block types that can appear in a timeline message
 */
export type ContentBlockType =
  | 'text'
  | 'code'
  | 'image'
  | 'json'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'

/**
 * Display type for timeline messages
 * - single: Standalone message
 * - group: Grouped messages (e.g., tool use + result)
 */
export type TimelineDisplayType = 'single' | 'group'

/**
 * Message role in the conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/**
 * UI-specific metadata for rendering hints
 * Explicitly define all fields to avoid index signature
 */
export interface UIContentMetadata {
  // Code block metadata
  language?: string

  // Image block metadata
  format?: string

  // Collapsible block metadata
  collapsed?: boolean

  // Tool block metadata
  toolName?: string
  toolUseId?: string

  // Thinking block metadata
  thoughtCount?: number

  // Provider-specific fields can be added explicitly as needed
}

/**
 * A single content block within a timeline message
 * UI-specific version for rendering with discriminated union for type safety
 */
export type ContentBlock =
  | {
      type: 'text'
      content: string
      metadata?: UIContentMetadata
    }
  | {
      type: 'code'
      content: string
      metadata?: UIContentMetadata & { language?: string }
    }
  | {
      type: 'image'
      content: string // Base64 or URL
      metadata?: UIContentMetadata & { format?: string }
    }
  | {
      type: 'json'
      content: string | unknown // JSON string or parsed object
      metadata?: UIContentMetadata & { collapsed?: boolean }
    }
  | {
      type: 'tool_use'
      content: { name: string; input: Record<string, unknown> }
      metadata?: UIContentMetadata & { collapsed?: boolean; toolName?: string; toolUseId?: string }
    }
  | {
      type: 'tool_result'
      content: string | Array<string | Record<string, unknown>> | Record<string, unknown>
      metadata?: UIContentMetadata & { collapsed?: boolean; toolName?: string }
    }
  | {
      type: 'thinking'
      content: Array<{ subject: string; description: string; timestamp: string }>
      metadata?: UIContentMetadata & { collapsed?: boolean; thoughtCount?: number }
    }

/**
 * Display metadata for rendering hints
 */
export interface DisplayMetadata {
  icon: string // Short text icon (e.g., "USR", "AST", "TOOL")
  IconComponent?: React.ComponentType<{ className?: string }> // HeroIcon component
  iconColor?: string // Tailwind color class for icon (e.g., "text-info")
  title: string // Human-readable title
  borderColor: string // Tailwind color class (e.g., "border-l-info")
  badge?: {
    text: string
    color: string // Tailwind color class
  }
}

/**
 * Normalized timeline message for rendering
 */
export interface TimelineMessage {
  id: string
  timestamp: string
  displayType: TimelineDisplayType
  role: MessageRole
  displayMetadata: DisplayMetadata
  contentBlocks: ContentBlock[]
  originalMessage: BaseSessionMessage // Keep reference to original for debugging
}

/**
 * Grouped timeline messages (e.g., tool use + result displayed side-by-side)
 *
 * @deprecated The condensed transcript derives its own spans (see `utils/transcript`)
 * and never produces groups. Still used by the desktop ActiveSessionCard; scheduled for
 * removal once that migrates.
 */
export interface TimelineGroup {
  id: string
  displayType: 'group'
  timestamp: string
  messages: [TimelineMessage, TimelineMessage] // Always exactly 2 messages in a group
  groupType: 'tool_pair' // Can be extended for other group types
}

/**
 * Union type for timeline items (can be single message or group)
 */
export type TimelineItem = TimelineMessage | TimelineGroup

/**
 * Result of message processing pipeline
 */
export interface ProcessedTimeline {
  items: TimelineItem[]
  metadata: {
    totalMessages: number
    groupedPairs: number
    provider: string
  }
}

/**
 * Type guards
 */
/** @deprecated See `TimelineGroup`. */
export function isTimelineGroup(item: TimelineItem): item is TimelineGroup {
  return item.displayType === 'group'
}

export function isTimelineMessage(item: TimelineItem): item is TimelineMessage {
  return item.displayType === 'single'
}

/**
 * Helper function to create display metadata with defaults
 */
export function createDisplayMetadata(partial: Partial<DisplayMetadata>): DisplayMetadata {
  return {
    icon: partial.icon || 'MSG',
    IconComponent: partial.IconComponent,
    iconColor: partial.iconColor,
    title: partial.title || 'Message',
    borderColor: partial.borderColor || 'border-l-neutral',
    badge: partial.badge,
  }
}

/**
 * Helper function to create a content block
 * Type-safe overloads for each content block type
 */
export function createContentBlock(
  type: 'text',
  content: string,
  metadata?: UIContentMetadata
): Extract<ContentBlock, { type: 'text' }>
export function createContentBlock(
  type: 'code',
  content: string,
  metadata?: UIContentMetadata & { language?: string }
): Extract<ContentBlock, { type: 'code' }>
export function createContentBlock(
  type: 'image',
  content: string,
  metadata?: UIContentMetadata & { format?: string }
): Extract<ContentBlock, { type: 'image' }>
export function createContentBlock(
  type: 'json',
  content: string | unknown,
  metadata?: UIContentMetadata & { collapsed?: boolean }
): Extract<ContentBlock, { type: 'json' }>
export function createContentBlock(
  type: 'tool_use',
  content: { name: string; input: Record<string, unknown> },
  metadata?: UIContentMetadata & { collapsed?: boolean; toolName?: string; toolUseId?: string }
): Extract<ContentBlock, { type: 'tool_use' }>
export function createContentBlock(
  type: 'tool_result',
  content: string | Array<string | Record<string, unknown>> | Record<string, unknown>,
  metadata?: UIContentMetadata & { collapsed?: boolean; toolUseId?: string }
): Extract<ContentBlock, { type: 'tool_result' }>
export function createContentBlock(
  type: 'thinking',
  content: Array<{ subject: string; description: string; timestamp: string }>,
  metadata?: UIContentMetadata & { collapsed?: boolean; thoughtCount?: number }
): Extract<ContentBlock, { type: 'thinking' }>
export function createContentBlock(
  type: ContentBlockType,
  content:
    | string
    | { name: string; input: Record<string, unknown> }
    | Array<{ subject: string; description: string; timestamp: string }>
    | unknown,
  metadata?: UIContentMetadata
): ContentBlock {
  // The implementation needs to handle all possible combinations
  // TypeScript will use the overloads for type checking at call sites
  return {
    type,
    content,
    metadata,
  } as ContentBlock
}
