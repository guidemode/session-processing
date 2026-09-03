/**
 * Canonical Message Processor - Universal message processor for canonical JSONL format
 *
 * Handles all providers (Claude Code, Gemini, Codex, Copilot, OpenCode) by processing
 * the standardized canonical format and adapting display based on provider-specific
 * metadata preserved in providerMetadata field.
 *
 * Provider-specific features:
 * - Gemini: Thoughts display with count badge
 * - Copilot: Intentions for tool titles
 * - Codex: Payload type-based icons/badges
 * - Claude: Thinking blocks, images, special content
 */

import {
  CpuChipIcon,
  DocumentIcon,
  DocumentTextIcon,
  LightBulbIcon,
  ListBulletIcon,
  MapIcon,
} from '@heroicons/react/24/outline'
import { getToolCapability } from '../../../processors/canonical/metrics/tool-capabilities.js'
import type { BaseSessionMessage } from '../sessionTypes.js'
import { type ContentBlock, createContentBlock, createDisplayMetadata } from '../timelineTypes.js'
import { BaseMessageProcessor, type ContentPart } from './BaseMessageProcessor.js'

interface GeminiThought {
  subject: string
  description: string
  timestamp: string
}

interface ProviderMetadata {
  // Gemini fields
  gemini_type?: string
  has_thoughts?: boolean
  gemini_thoughts?: GeminiThought[]

  // Copilot fields
  copilot_type?: string
  has_intention?: boolean
  has_tool_title?: boolean
  intention_summary?: string
  tool_title?: string

  // Codex fields
  codex_type?: string
  item_type?: string
  event_type?: string

  // Claude fields (for future migration)
  claude_type?: string
  has_thinking?: boolean
  has_images?: boolean

  // Generic fields
  [key: string]: unknown
}

export class CanonicalMessageProcessor extends BaseMessageProcessor {
  name = 'canonical'

  /**
   * Override to handle provider-specific message types via providerMetadata
   */
  protected normalizeMessage(message: BaseSessionMessage) {
    const metadata = message.metadata?.providerMetadata as ProviderMetadata | undefined

    // Handle Claude-specific types (when Claude is migrated)
    if (
      metadata?.claude_type === 'file-history-snapshot' ||
      message.content?.type === 'file-history-snapshot'
    ) {
      return {
        ...super.normalizeMessage(message),
        type: 'meta' as const,
      }
    }

    if (metadata?.claude_type === 'summary' || message.content?.type === 'summary') {
      return {
        ...super.normalizeMessage(message),
        type: 'meta' as const,
      }
    }

    return super.normalizeMessage(message)
  }

  /**
   * Override display metadata to handle provider-specific features
   */
  protected getDisplayMetadata(message: BaseSessionMessage) {
    const metadata = message.metadata?.providerMetadata as ProviderMetadata | undefined

    // Handle special Claude tools with custom icons/titles
    if (message.type === 'tool_use') {
      const toolName = this.getToolName(message)

      if (toolName === 'ExitPlanMode') {
        return createDisplayMetadata({
          icon: 'PLN',
          IconComponent: MapIcon,
          iconColor: 'text-accent',
          title: 'Exit Plan Mode',
          borderColor: 'border-l-accent',
          badge: {
            text: 'PLANNING',
            color: 'badge-accent',
          },
        })
      }

      // Capability-based rather than a literal name: the task-list tool has been
      // `TodoWrite`, then `TaskCreate`/`TaskUpdate`, and matching one spelling meant the
      // transcript silently stopped rendering these blocks when the name changed.
      if (toolName && getToolCapability(toolName) === 'todo') {
        return createDisplayMetadata({
          icon: 'TODO',
          IconComponent: ListBulletIcon,
          iconColor: 'text-accent',
          title: 'Todo Tracking',
          borderColor: 'border-l-accent',
          badge: {
            text: 'TRACKING',
            color: 'badge-accent',
          },
        })
      }

      // Copilot: Use intention as tool title if available
      if (metadata?.has_intention && metadata.intention_summary) {
        return createDisplayMetadata({
          icon: 'TOOL',
          title: metadata.intention_summary as string,
          borderColor: 'border-l-info',
          badge: {
            text: 'INTENTION',
            color: 'badge-info',
          },
        })
      }

      // Other tool uses get standard treatment from base class
      return super.getDisplayMetadata(message)
    }

    // Handle Claude file-history-snapshot
    if (
      metadata?.claude_type === 'file-history-snapshot' ||
      message.content?.type === 'file-history-snapshot'
    ) {
      return createDisplayMetadata({
        icon: 'FILE',
        IconComponent: DocumentIcon,
        iconColor: 'text-base-content/60',
        title: 'File History',
        borderColor: 'border-l-neutral',
        badge: {
          text: 'SNAPSHOT',
          color: 'badge-neutral',
        },
      })
    }

    // Handle Claude summary
    if (metadata?.claude_type === 'summary' || message.content?.type === 'summary') {
      return createDisplayMetadata({
        icon: 'SUM',
        IconComponent: DocumentTextIcon,
        iconColor: 'text-accent',
        title: 'Session Summary',
        borderColor: 'border-l-accent',
        badge: {
          text: 'SUMMARY',
          color: 'badge-accent',
        },
      })
    }

    // Note: Gemini thoughts are now split into separate messages by the parser,
    // so they'll be handled by the base assistant case with isThinking: true

    // Handle thinking in assistant responses (Claude or Codex)
    if (message.type === 'assistant' && this.hasThinkingContent(message)) {
      return createDisplayMetadata({
        icon: 'THK',
        IconComponent: LightBulbIcon,
        iconColor: 'text-secondary',
        title: 'Assistant (with reasoning)',
        borderColor: 'border-l-primary',
        badge: {
          text: 'THINKING',
          color: 'badge-secondary',
        },
      })
    }

    // Handle Codex-specific meta messages
    if (metadata?.codex_type === 'event_msg' && metadata.event_type === 'token_count') {
      return createDisplayMetadata({
        icon: 'TOK',
        title: 'Token Usage',
        borderColor: 'border-l-info',
        badge: {
          text: 'TOKENS',
          color: 'badge-info',
        },
      })
    }

    // Handle Gemini tool results with tool name
    if (message.type === 'tool_result' && message.metadata?.toolName) {
      return createDisplayMetadata({
        icon: 'RES',
        title: `${message.metadata.toolName} result`,
        borderColor: 'border-l-success',
      })
    }

    // Delegate to base class for non-special messages
    return super.getDisplayMetadata(message)
  }

  /**
   * Override content block extraction for provider-specific content types
   */
  protected getContentBlocks(message: BaseSessionMessage): ContentBlock[] {
    const metadata = message.metadata?.providerMetadata as ProviderMetadata | undefined

    // Handle Claude file-history-snapshot
    if (
      metadata?.claude_type === 'file-history-snapshot' ||
      message.content?.type === 'file-history-snapshot'
    ) {
      return this.getFileHistoryBlocks(message)
    }

    // Handle Claude summary
    if (metadata?.claude_type === 'summary' || message.content?.type === 'summary') {
      return this.getSummaryBlocks(message)
    }

    // Handle conversation blocks with provider-specific features
    if (message.type === 'user' || message.type === 'assistant') {
      return this.getCanonicalConversationBlocks(message)
    }

    // Handle Gemini tool results with sections
    if (message.type === 'tool_result' && message.metadata?.resultSections) {
      return this.getGeminiToolResultBlocks(message)
    }

    // Default to base implementation
    return super.getContentBlocks(message)
  }

  /**
   * Extract conversation blocks with provider-specific content types
   */
  protected getCanonicalConversationBlocks(message: BaseSessionMessage): ContentBlock[] {
    const blocks: ContentBlock[] = []
    const _metadata = message.metadata?.providerMetadata as ProviderMetadata | undefined

    // Note: Gemini thoughts are now split into separate messages by the parser
    // (with metadata.isThinking = true), so we don't process them here from metadata

    // Try to get content array from message (canonical format)
    const contentArray = this.extractContentArray(message)

    if (contentArray && Array.isArray(contentArray)) {
      for (const item of contentArray) {
        // Text content
        if (item.type === 'text' && item.text) {
          blocks.push(createContentBlock('text', item.text))
        }

        // Thinking content (encrypted or plain)
        else if (item.type === 'thinking') {
          if (item.thinking) {
            // Plain thinking text
            blocks.push(createContentBlock('text', `_Reasoning: ${item.thinking}_`))
          } else if (item.signature) {
            // Encrypted thinking - just show indicator
            blocks.push(createContentBlock('text', '_[Encrypted reasoning - not displayed]_'))
          }
        }

        // Image content
        else if (item.type === 'image' && item.source) {
          const imageData = this.extractImageFromPart(item)
          if (imageData) {
            blocks.push(
              createContentBlock('image', imageData.data, {
                format: imageData.type,
              })
            )
          }
        }

        // Skip tool_use and tool_result blocks - parser should have split these into separate messages
        else if (item.type === 'tool_use' || item.type === 'tool_result') {
          // Don't display - these should be in their own tool_use/tool_result messages
        }

        // Unknown type - show as JSON for debugging
        else if (item.type && item.type !== 'text') {
          blocks.push(createContentBlock('json', item, { collapsed: true }))
        }
      }
    }

    // Fallback: if no blocks extracted from structured content, try base conversation blocks
    if (blocks.length === 0) {
      return super.getConversationBlocks(message)
    }

    return blocks
  }

  /**
   * Extract content array from canonical StructuredMessageContent or legacy formats
   */
  private extractContentArray(message: BaseSessionMessage): ContentPart[] | null {
    // Direct content array (legacy)
    if (Array.isArray(message.content)) {
      return message.content
    }

    // StructuredMessageContent has a structured array (canonical format)
    if (
      message.content?.type === 'structured' &&
      message.content?.structured &&
      Array.isArray(message.content.structured)
    ) {
      return message.content.structured
    }

    // Legacy: StructuredMessageContent without type field
    if (message.content?.structured && Array.isArray(message.content.structured)) {
      return message.content.structured
    }

    // Nested in message.content
    if (message.content?.content && Array.isArray(message.content.content)) {
      return message.content.content
    }

    // Nested in message.message.content
    if (message.content?.message?.content && Array.isArray(message.content.message.content)) {
      return message.content.message.content
    }

    return null
  }

  /**
   * Check if message has thinking content
   */
  private hasThinkingContent(message: BaseSessionMessage): boolean {
    const contentArray = this.extractContentArray(message)
    if (!contentArray) return false

    return contentArray.some(item => item.type === 'thinking')
  }

  /**
   * Extract file history snapshot blocks (Claude)
   */
  private getFileHistoryBlocks(message: BaseSessionMessage): ContentBlock[] {
    const blocks: ContentBlock[] = []

    // Try to extract file history data
    const fileHistory = message.content?.fileHistory || message.content

    if (Array.isArray(fileHistory)) {
      for (const file of fileHistory.slice(0, 10)) {
        // Limit to first 10 files
        const fileName = file.path || file.name || 'unknown'
        const action = file.action || file.type || 'modified'
        blocks.push(createContentBlock('text', `${action}: ${fileName}`))
      }

      if (fileHistory.length > 10) {
        blocks.push(createContentBlock('text', `... and ${fileHistory.length - 10} more files`))
      }
    } else {
      // Show as JSON if structure is unexpected
      blocks.push(createContentBlock('json', fileHistory, { collapsed: true }))
    }

    return blocks
  }

  /**
   * Extract summary blocks (Claude)
   */
  private getSummaryBlocks(message: BaseSessionMessage): ContentBlock[] {
    const summary = message.content?.summary || message.content?.text || message.content

    if (typeof summary === 'string') {
      return [createContentBlock('text', summary)]
    }

    if (summary?.text) {
      return [createContentBlock('text', summary.text)]
    }

    return [createContentBlock('json', summary, { collapsed: true })]
  }

  /**
   * Extract Gemini tool result blocks with file sections
   */
  private getGeminiToolResultBlocks(message: BaseSessionMessage): ContentBlock[] {
    const toolName = message.metadata?.toolName

    // If we have structured sections (from inline parsing), create blocks for each
    if (message.metadata?.resultSections && Array.isArray(message.metadata.resultSections)) {
      const sections = message.metadata.resultSections

      if (sections.length > 0) {
        const blocks: ContentBlock[] = []

        // Add a summary block
        blocks.push(
          createContentBlock('text', `Tool: ${toolName || 'unknown'} - ${sections.length} file(s)`)
        )

        // Add each file section
        for (const section of sections) {
          blocks.push(
            createContentBlock('code', section.content, {
              language: this.inferLanguageFromPath(section.path),
              collapsed: true,
            })
          )
        }

        return blocks
      }
    }

    // Fallback to base implementation
    return super.getToolResultBlocks(message)
  }

  /**
   * Override tool name extraction to handle canonical format
   */
  protected getToolName(message: BaseSessionMessage): string | null {
    // Try canonical StructuredMessageContent
    if (
      message.content?.type === 'structured' &&
      message.content.toolUses &&
      message.content.toolUses.length > 0
    ) {
      return message.content.toolUses[0].name
    }

    // Try legacy locations
    if (message.content?.name) {
      return message.content.name
    }

    // Check content array for tool_use
    const contentArray = this.extractContentArray(message)
    if (contentArray) {
      const toolUse = contentArray.find(item => item.type === 'tool_use')
      if (toolUse?.name) {
        return toolUse.name
      }
    }

    return super.getToolName(message)
  }

  /**
   * Override tool use ID extraction for canonical format
   */
  protected extractToolUseId(message: BaseSessionMessage): string | null {
    // Try canonical StructuredMessageContent
    if (
      message.content?.type === 'structured' &&
      message.content.toolUses &&
      message.content.toolUses.length > 0
    ) {
      return message.content.toolUses[0].id
    }

    // For Gemini, the tool_use message ID IS the tool use ID
    const metadata = message.metadata?.providerMetadata as ProviderMetadata | undefined
    if (metadata?.gemini_type === 'tool_call' && message.type === 'tool_use') {
      return message.id
    }

    // Check content array for tool_use
    const contentArray = this.extractContentArray(message)
    if (contentArray) {
      const toolUse = contentArray.find(item => item.type === 'tool_use')
      if (toolUse?.id) {
        return toolUse.id
      }
    }

    return super.extractToolUseId(message)
  }

  /**
   * Override tool result ID extraction for canonical format
   */
  protected extractToolResultId(message: BaseSessionMessage): string | null {
    // Try canonical StructuredMessageContent
    if (
      message.content?.type === 'structured' &&
      message.content.toolResults &&
      message.content.toolResults.length > 0
    ) {
      return message.content.toolResults[0].tool_use_id
    }

    // Gemini stores the tool use ID in linkedTo field
    if (message.linkedTo) {
      return message.linkedTo
    }

    if (message.metadata?.linkedTo) {
      return message.metadata.linkedTo
    }

    // Check content array for tool_result
    const contentArray = this.extractContentArray(message)
    if (contentArray) {
      const toolResult = contentArray.find(item => item.type === 'tool_result')
      if (toolResult?.tool_use_id) {
        return toolResult.tool_use_id
      }
    }

    return super.extractToolResultId(message)
  }

  /**
   * Helper: Infer language from file path
   */
  private inferLanguageFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()

    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
      sql: 'sql',
      css: 'css',
      scss: 'scss',
      html: 'html',
    }

    return languageMap[ext || ''] || 'text'
  }
}
