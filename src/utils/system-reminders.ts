/**
 * System reminder helpers.
 *
 * `<system-reminder>` blocks are injected machinery, not something the person wrote.
 * They are stripped before content reaches an LLM prompt and before tool results are
 * displayed. Lives in `utils/` rather than `ui/` so the AI model tasks can use it
 * without importing from the UI layer.
 */

/**
 * Strip system-reminder tags and their contents from text.
 */
export function stripSystemReminders(content: string): string {
  return content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '').trim()
}
