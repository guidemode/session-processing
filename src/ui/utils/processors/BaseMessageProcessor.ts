/**
 * Base Message Processor - Abstract class for processing messages into timeline format
 *
 * This class provides default normalization logic that can be overridden by
 * provider-specific processors for custom behavior.
 */

import { isStructuredMessageContent } from '@guidemode/types'
import {
  ArrowsPointingInIcon,
  CheckCircleIcon,
  CommandLineIcon,
  CpuChipIcon,
  InformationCircleIcon,
  LightBulbIcon,
  PhotoIcon,
  StopCircleIcon,
  UserIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import type { BaseSessionMessage } from '../sessionTypes.js'
import {
  type ContentBlock,
  type ProcessedTimeline,
  type TimelineGroup,
  type TimelineItem,
  type TimelineMessage,
  createContentBlock,
  createDisplayMetadata,
} from '../timelineTypes.js'

// Type definitions for content structures
export interface ContentPart {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: unknown
  data?: string // For image data URLs
  source?: {
    data?: string
    media_type?: string
  }
  // Thinking content properties
  thinking?: string // Plain text thinking
  signature?: string // Encrypted thinking signature
}

export type MessageContent =
  | string
  | ContentPart[]
  | { parts?: ContentPart[] }
  | Record<string, unknown>

/**
 * Abstract base class for message processors
 */
export abstract class BaseMessageProcessor {
  abstract name: string

  /**
   * Process an array of messages into timeline items
   */
  process(messages: BaseSessionMessage[]): ProcessedTimeline {
    // Convert messages to timeline messages
    const timelineMessages = messages.map(msg => this.normalizeMessage(msg))

    // Group related messages (e.g., tool use + result)
    const items = this.groupMessages(timelineMessages)

    return {
      items,
      metadata: {
        totalMessages: messages.length,
        groupedPairs: items.filter(item => item.displayType === 'group').length,
        provider: this.name,
      },
    }
  }

  /**
   * Normalize every message without pairing tool calls to their results.
   *
   * The condensed transcript derives its own spans, but still wants the
   * provider-specific display metadata and content blocks that normalization adds.
   */
  normalizeAll(messages: BaseSessionMessage[]): TimelineMessage[] {
    return messages.map(msg => this.normalizeMessage(msg))
  }

  /**
   * Convert a BaseSessionMessage to a TimelineMessage
   * Can be overridden by subclasses for provider-specific logic
   */
  protected normalizeMessage(message: BaseSessionMessage): TimelineMessage {
    const role = this.getMessageRole(message)
    const displayMetadata = this.getDisplayMetadata(message)
    const contentBlocks = this.getContentBlocks(message)

    return {
      id: message.id,
      timestamp: message.timestamp,
      displayType: 'single',
      role,
      displayMetadata,
      contentBlocks,
      originalMessage: message,
    }
  }

  /**
   * Group related messages (e.g., tool use + result)
   * Can be overridden by subclasses for custom grouping logic
   */
  protected groupMessages(messages: TimelineMessage[]): TimelineItem[] {
    const items: TimelineItem[] = []
    const usedIds = new Set<string>()

    for (let i = 0; i < messages.length; i++) {
      const current = messages[i]

      // Skip if already used in a group
      if (usedIds.has(current.id)) continue

      // Check if this is a tool_use that can be paired with a tool_result
      if (current.originalMessage.type === 'tool_use') {
        const toolUseId = this.extractToolUseId(current.originalMessage)
        const resultIndex = messages.findIndex(
          (m, idx) =>
            idx > i &&
            !usedIds.has(m.id) &&
            m.originalMessage.type === 'tool_result' &&
            (m.originalMessage.linkedTo === toolUseId ||
              this.extractToolResultId(m.originalMessage) === toolUseId)
        )

        if (resultIndex !== -1) {
          const result = messages[resultIndex]
          items.push(this.createToolGroup(current, result))
          usedIds.add(current.id)
          usedIds.add(result.id)
          continue
        }
      }

      // Add as standalone message
      items.push(current)
    }

    return items
  }

  /**
   * Create a tool group from tool use and result messages
   */
  protected createToolGroup(toolUse: TimelineMessage, toolResult: TimelineMessage): TimelineGroup {
    return {
      id: `group-${toolUse.id}`,
      displayType: 'group',
      timestamp: toolUse.timestamp,
      messages: [toolUse, toolResult],
      groupType: 'tool_pair',
    }
  }

  /**
   * Get message role from message type
   */
  protected getMessageRole(message: BaseSessionMessage): TimelineMessage['role'] {
    switch (message.type) {
      case 'user':
      case 'command':
      case 'interruption':
        return 'user'
      case 'assistant':
        return 'assistant'
      case 'tool_use':
      case 'tool_result':
        return 'tool'
      default:
        return 'system'
    }
  }

  /**
   * Get display metadata (icon, title, colors) for a message
   * Can be overridden by subclasses for provider-specific icons/titles
   */
  protected getDisplayMetadata(
    message: BaseSessionMessage
  ): ReturnType<typeof createDisplayMetadata> {
    switch (message.type) {
      case 'user':
        return createDisplayMetadata({
          icon: this.hasImageContent(message) ? 'IMG' : 'USR',
          IconComponent: this.hasImageContent(message) ? PhotoIcon : UserIcon,
          iconColor: 'text-info',
          title: this.hasImageContent(message) ? 'User (with image)' : 'User',
          borderColor: 'border-l-info',
        })

      case 'assistant': {
        // Check if this is a thinking message
        const isThinking = message.metadata?.isThinking === true
        const isGemini = message.metadata?.provider?.includes('gemini')

        return createDisplayMetadata({
          icon: isThinking ? 'THINK' : 'AST',
          IconComponent: isThinking ? LightBulbIcon : CpuChipIcon,
          iconColor: isThinking ? 'text-warning' : 'text-primary',
          title: isThinking ? (isGemini ? 'Extended Thinking' : 'Thinking') : 'Assistant',
          borderColor: isThinking ? 'border-l-warning' : 'border-l-primary',
        })
      }

      case 'tool_use': {
        const toolName = this.getToolName(message) || 'Tool'
        const intentionSummary = message.metadata?.intentionSummary
        const title = intentionSummary || toolName
        return createDisplayMetadata({
          icon: 'TOOL',
          IconComponent: WrenchScrewdriverIcon,
          iconColor: 'text-secondary',
          title,
          borderColor: 'border-l-secondary',
        })
      }

      case 'tool_result': {
        const toolName = message.metadata?.toolName
        const title = toolName ? `${toolName} Result` : 'Tool Result'
        return createDisplayMetadata({
          icon: 'RESULT',
          IconComponent: CheckCircleIcon,
          iconColor: 'text-secondary',
          title,
          borderColor: 'border-l-secondary',
        })
      }

      case 'command':
        return createDisplayMetadata({
          icon: 'CMD',
          IconComponent: CommandLineIcon,
          iconColor: 'text-warning',
          title: 'Command',
          borderColor: 'border-l-warning',
        })

      case 'command_output':
        return createDisplayMetadata({
          icon: 'OUT',
          IconComponent: InformationCircleIcon,
          iconColor: 'text-base-content/60',
          title: 'Output',
          borderColor: 'border-l-neutral',
        })

      case 'interruption':
        return createDisplayMetadata({
          icon: 'INT',
          IconComponent: StopCircleIcon,
          iconColor: 'text-error',
          title: 'Interrupted',
          borderColor: 'border-l-error',
        })

      case 'compact':
        return createDisplayMetadata({
          icon: 'CMP',
          IconComponent: ArrowsPointingInIcon,
          iconColor: 'text-warning',
          title: 'Context compacted',
          borderColor: 'border-l-warning',
        })

      case 'meta':
        return createDisplayMetadata({
          icon: 'META',
          IconComponent: InformationCircleIcon,
          iconColor: 'text-accent',
          title: 'Meta',
          borderColor: 'border-l-accent',
        })

      default:
        return createDisplayMetadata({
          icon: 'MSG',
          IconComponent: InformationCircleIcon,
          iconColor: 'text-base-content/60',
          title: 'Message',
          borderColor: 'border-l-neutral',
        })
    }
  }

  /**
   * Extract content blocks from a message
   * This is the main method to override for custom content handling
   */
  protected getContentBlocks(message: BaseSessionMessage): ContentBlock[] {
    switch (message.type) {
      case 'tool_use':
        return this.getToolUseBlocks(message)
      case 'tool_result':
        return this.getToolResultBlocks(message)
      case 'command':
        return this.getCommandBlocks(message)
      case 'command_output':
        return this.getCommandOutputBlocks(message)
      case 'interruption':
        return this.getInterruptionBlocks(message)
      case 'user':
      case 'assistant':
        return this.getConversationBlocks(message)
      default:
        return this.getGenericBlocks(message)
    }
  }

  /**
   * Extract content blocks for tool use messages
   */
  protected getToolUseBlocks(message: BaseSessionMessage): ContentBlock[] {
    const content = message.content

    // Handle StructuredMessageContent from parsers
    if (isStructuredMessageContent(content) && content.toolUse) {
      const toolUse = content.toolUse
      return [
        createContentBlock(
          'tool_use',
          { name: toolUse.name, input: toolUse.input },
          {
            toolName: toolUse.name,
            collapsed: true,
          }
        ),
      ]
    }

    // Fallback to legacy format
    const toolName = this.getToolName(message) || 'unknown'
    const input = content?.input || content

    return [
      createContentBlock(
        'tool_use',
        { name: toolName, input: input as Record<string, unknown> },
        {
          toolName,
          collapsed: true,
        }
      ),
    ]
  }

  /**
   * Extract content blocks for tool result messages
   */
  protected getToolResultBlocks(message: BaseSessionMessage): ContentBlock[] {
    // Handle StructuredMessageContent from parsers
    if (isStructuredMessageContent(message.content) && message.content.toolResult) {
      const toolResult = message.content.toolResult
      const resultContent = toolResult.content as
        | string
        | Array<string | Record<string, unknown>>
        | Record<string, unknown>
      return [
        createContentBlock('tool_result', resultContent, {
          toolUseId: toolResult.tool_use_id,
          collapsed: true,
        }),
      ]
    }

    // Fallback to legacy format
    const content = message.content?.content || message.content
    const toolUseId = message.linkedTo || message.content?.tool_use_id

    return [
      createContentBlock('tool_result', content, {
        toolUseId,
        collapsed: true,
      }),
    ]
  }

  /**
   * Extract content blocks for command messages
   */
  protected getCommandBlocks(message: BaseSessionMessage): ContentBlock[] {
    const text =
      this.extractTextFromParts(message.content) ||
      (typeof message.content === 'string' ? message.content : JSON.stringify(message.content))

    // Try to parse XML-like command structure
    const parsedCommand = this.parseCommandXml(text)

    if (parsedCommand) {
      const blocks: ContentBlock[] = []

      // Show command name prominently
      blocks.push(createContentBlock('text', `**Command:** \`${parsedCommand.name}\``))

      // Show message if present
      if (parsedCommand.message) {
        blocks.push(createContentBlock('text', parsedCommand.message))
      }

      // Show args if present
      if (parsedCommand.args) {
        blocks.push(
          createContentBlock('code', parsedCommand.args, {
            language: 'text',
          })
        )
      }

      return blocks
    }

    // Fallback to showing as code
    return [
      createContentBlock('code', text, {
        language: 'bash',
      }),
    ]
  }

  /**
   * Parse XML-like command structure from Claude Code
   */
  protected parseCommandXml(
    text: string
  ): { name: string; message?: string; args?: string } | null {
    const nameMatch = text.match(/<command-name>([^<]+)<\/command-name>/)
    const messageMatch = text.match(/<command-message>([^<]*)<\/command-message>/)
    const argsMatch = text.match(/<command-args>([^<]*)<\/command-args>/)

    if (!nameMatch) {
      return null
    }

    const result: { name: string; message?: string; args?: string } = {
      name: nameMatch[1].trim(),
    }

    if (messageMatch?.[1].trim()) {
      result.message = messageMatch[1].trim()
    }

    if (argsMatch?.[1].trim()) {
      result.args = argsMatch[1].trim()
    }

    return result
  }

  /**
   * Extract content blocks for command output messages
   */
  protected getCommandOutputBlocks(message: BaseSessionMessage): ContentBlock[] {
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content?.text || JSON.stringify(message.content)

    return [
      createContentBlock('code', text, {
        language: 'text',
      }),
    ]
  }

  /**
   * Extract content blocks for interruption messages
   */
  protected getInterruptionBlocks(message: BaseSessionMessage): ContentBlock[] {
    // Try extracting text from parts structure first
    let text = this.extractTextFromParts(message.content)

    // If no text from parts, check for structured content with text field
    if (
      !text &&
      message.content &&
      typeof message.content === 'object' &&
      'text' in message.content
    ) {
      text = message.content.text as string
    }

    // Fallback to string content or JSON stringify
    if (!text) {
      text = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    }

    return [createContentBlock('text', text)]
  }

  /**
   * Extract content blocks for conversation messages (user input, assistant response)
   */
  protected getConversationBlocks(message: BaseSessionMessage): ContentBlock[] {
    const blocks: ContentBlock[] = []

    // Check for parts structure
    const parts = this.extractParts(message.content)
    if (parts) {
      for (const part of parts) {
        if (part.type === 'text' && part.text) {
          blocks.push(createContentBlock('text', part.text))
        } else if (part.type === 'image') {
          const imageData = this.extractImageFromPart(part)
          if (imageData) {
            blocks.push(
              createContentBlock('image', imageData.data, {
                format: imageData.type,
              })
            )
          }
        }
        // Skip tool_use and tool_result blocks - these should be in separate messages
        // If they appear here, they've already been split by the parser and shouldn't be displayed
        else if (part.type === 'tool_use' || part.type === 'tool_result') {
          // Skip - don't add to blocks
        }
        // Unknown block types - could be thinking, system_reminder, etc.
        else {
          blocks.push(createContentBlock('json', part, { collapsed: true }))
        }
      }
      // Only return early if we found actual content blocks
      // If blocks is empty (only had tool blocks), fall through to other content handling
      if (blocks.length > 0) {
        return blocks
      }
    }

    // Fallback: Try to extract text or JSON
    if (typeof message.content === 'string') {
      blocks.push(createContentBlock('text', message.content))
    } else if (
      message.content &&
      typeof message.content === 'object' &&
      'text' in message.content
    ) {
      // StructuredMessageContent has a text field (even if empty)
      // Only show text if it's not empty
      // Note: text blocks are expanded by default (no collapsed flag)
      // This includes thinking blocks which will be marked via metadata.isThinking
      if (message.content.text) {
        blocks.push(createContentBlock('text', message.content.text))
      }
      // If text is empty but we have structured content, it means the content
      // is in the parts array (which should have been handled above)
      // Don't show as JSON if text is empty string but structured exists
      if (!message.content.text && !message.content.structured) {
        blocks.push(createContentBlock('json', message.content, { collapsed: true }))
      }
    } else {
      blocks.push(createContentBlock('json', message.content, { collapsed: true }))
    }

    return blocks
  }

  /**
   * Extract content blocks for generic/unknown message types
   */
  protected getGenericBlocks(message: BaseSessionMessage): ContentBlock[] {
    return [createContentBlock('json', message.content, { collapsed: true })]
  }

  /**
   * Helper: Extract tool name from message
   */
  protected getToolName(message: BaseSessionMessage): string | null {
    // Handle StructuredMessageContent from parsers
    if (isStructuredMessageContent(message.content) && message.content.toolUse) {
      return message.content.toolUse.name
    }

    // Fallback to legacy format
    return message.content?.name || null
  }

  /**
   * Helper: Extract tool use ID from message
   */
  protected extractToolUseId(message: BaseSessionMessage): string | null {
    // Handle StructuredMessageContent from parsers
    if (isStructuredMessageContent(message.content) && message.content.toolUse) {
      return message.content.toolUse.id
    }

    // Try multiple locations where tool use ID might be (legacy format)
    return (
      message.content?.id || message.metadata?.toolUseId || message.id.split('-tool-')[1] || null
    )
  }

  /**
   * Helper: Extract tool result ID (the tool use ID it refers to)
   */
  protected extractToolResultId(message: BaseSessionMessage): string | null {
    // Handle StructuredMessageContent from parsers
    if (isStructuredMessageContent(message.content) && message.content.toolResult) {
      return message.content.toolResult.tool_use_id
    }

    // Try multiple locations where tool result ID might be (legacy format)
    return message.linkedTo || message.content?.tool_use_id || null
  }

  /**
   * Helper: Check if message has image content
   */
  protected hasImageContent(message: BaseSessionMessage): boolean {
    const parts = this.extractParts(message.content)
    if (parts) {
      return parts.some(part => part.type === 'image')
    }
    return false
  }

  /**
   * Helper: Extract parts array from content
   */
  protected extractParts(content: MessageContent): ContentPart[] | null {
    if (
      content &&
      typeof content === 'object' &&
      'parts' in content &&
      Array.isArray(content.parts)
    ) {
      return content.parts
    }

    // Check for StructuredMessageContent with structured array
    if (
      content &&
      typeof content === 'object' &&
      'structured' in content &&
      Array.isArray(content.structured)
    ) {
      return content.structured
    }

    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content)
        if (parsed?.parts && Array.isArray(parsed.parts)) {
          return parsed.parts
        }
        if (parsed?.structured && Array.isArray(parsed.structured)) {
          return parsed.structured
        }
      } catch {
        // Not JSON
      }
    }

    if (Array.isArray(content)) {
      return content
    }

    return null
  }

  /**
   * Helper: Extract text from parts structure
   */
  protected extractTextFromParts(content: MessageContent): string | null {
    const parts = this.extractParts(content)
    if (!parts) return null

    const textParts = parts
      .filter((part): part is ContentPart & { text: string } => part.type === 'text' && !!part.text)
      .map(part => part.text)
      .join(' ')

    return textParts || null
  }

  /**
   * Helper: Extract image data from an image part
   */
  protected extractImageFromPart(part: ContentPart): { type: string; data: string } | null {
    if (part.source?.data) {
      const mediaType = part.source.media_type || 'image/png'
      const data = part.source.data.startsWith('data:')
        ? part.source.data
        : `data:${mediaType};base64,${part.source.data}`
      return {
        type: mediaType.split('/')[1] || 'png',
        data,
      }
    }

    if (part.data) {
      const match = part.data.match(/data:image\/([^;]+);base64,/)
      if (match) {
        return {
          type: match[1],
          data: part.data,
        }
      }
    }

    return null
  }
}
