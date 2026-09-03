/**
 * System Reminder Parser - Extracts and parses <system-reminder> tags from content
 *
 * System reminders can contain important context like CLAUDE.md project instructions
 * that Claude Code reads during sessions. This parser helps surface that context
 * in the UI for better session understanding.
 */

export interface ParsedSystemReminder {
  content: string
  rawContent: string
  hasClaudeMd: boolean
  claudeMdPaths: string[]
  claudeMdContent?: string
  reminderType: 'context' | 'instruction' | 'other'
}

/**
 * Parse system-reminder tags from content
 */
export function parseSystemReminder(content: string): ParsedSystemReminder | null {
  // Match system-reminder tags (may appear in tool results)
  const reminderMatch = content.match(/<system-reminder>([\s\S]*?)<\/system-reminder>/i)
  if (!reminderMatch) return null

  const reminderContent = reminderMatch[1].trim()

  // Check for CLAUDE.md references
  const claudeMdMatches = reminderContent.match(/CLAUDE\.md/gi) || []
  const hasClaudeMd = claudeMdMatches.length > 0

  // Extract paths to CLAUDE.md files
  const pathMatches = reminderContent.match(/Contents of ([^:\n]+CLAUDE\.md[^\n]*)/gi) || []
  const claudeMdPaths = pathMatches.map(m =>
    m
      .replace(/Contents of\s+/i, '')
      .replace(/\s*\(.*?\)/, '')
      .trim()
  )

  // Extract actual CLAUDE.md content if present (starts with "# claudeMd")
  const claudeMdContentMatch = reminderContent.match(
    /# claudeMd[\s\S]*?(?=(\n\n<\/system-reminder>|$))/i
  )
  const claudeMdContent = claudeMdContentMatch?.[0]

  // Determine reminder type
  let reminderType: ParsedSystemReminder['reminderType'] = 'other'
  if (hasClaudeMd || reminderContent.includes('Codebase and user instructions')) {
    reminderType = 'context'
  } else if (reminderContent.includes('should consider') || reminderContent.includes('MUST')) {
    reminderType = 'instruction'
  }

  return {
    content: reminderContent,
    rawContent: reminderMatch[0],
    hasClaudeMd,
    claudeMdPaths,
    claudeMdContent,
    reminderType,
  }
}

/**
 * Extract CLAUDE.md file paths from tool results (Glob/Grep output)
 */
export function extractClaudeMdFromToolResult(toolResult: string): string[] {
  // Match file paths that end with CLAUDE.md
  // Handles various formats:
  // - /Users/path/to/CLAUDE.md
  // - packages/foo/CLAUDE.md
  // - apps/server/CLAUDE.md
  const filePathPattern = /^[\s│├└⎿\-\*]*([^\n\r]+?CLAUDE\.md)/gim
  const matches = [...toolResult.matchAll(filePathPattern)]

  return matches
    .map(m => m[1].trim())
    .filter(path => path.length > 0)
    .filter(path => !path.startsWith('//')) // Filter out comment-like lines
}

/**
 * Check if content contains a system-reminder tag
 */
export function hasSystemReminder(content: string): boolean {
  return /<system-reminder>/i.test(content)
}

/**
 * Extract all system-reminder tags from content (may have multiple)
 */
export function extractAllSystemReminders(content: string): ParsedSystemReminder[] {
  const reminders: ParsedSystemReminder[] = []
  const matches = content.matchAll(/<system-reminder>([\s\S]*?)<\/system-reminder>/gi)

  for (const match of matches) {
    const parsed = parseSystemReminder(match[0])
    if (parsed) {
      reminders.push(parsed)
    }
  }

  return reminders
}

// `stripSystemReminders` now lives in utils/ so the AI model tasks can share it
// without importing from the UI layer. Re-exported here for existing UI consumers.
export { stripSystemReminders } from '../../utils/system-reminders.js'

/**
 * Get a summary of what's in a system reminder
 */
export function getSystemReminderSummary(parsed: ParsedSystemReminder): string {
  if (parsed.hasClaudeMd) {
    const pathCount = parsed.claudeMdPaths.length
    if (pathCount > 0) {
      return `Project instructions from ${pathCount} CLAUDE.md file${pathCount > 1 ? 's' : ''}`
    }
    return 'Project instructions (CLAUDE.md)'
  }

  if (parsed.reminderType === 'instruction') {
    return 'System instruction'
  }

  return 'Context reminder'
}
