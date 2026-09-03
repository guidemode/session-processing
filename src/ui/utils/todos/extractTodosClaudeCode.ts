/**
 * Claude Code Todo Extractor.
 *
 * Handles both generations of the task-list tool, because sessions of both kinds are
 * stored and neither is going to be re-recorded:
 *
 *   `TodoWrite`               - one SNAPSHOT of the whole list per call.
 *   `TaskCreate`/`TaskUpdate` - INCREMENTAL: create appends a task, update sets one task's
 *                               status by `taskId`, which is the task's 1-based position
 *                               in creation order.
 *
 * The incremental form is accumulated into snapshots so both produce the same
 * `TodoUpdate[]` shape and the UI does not have to know which era a session came from.
 */

import type { TodoExtractor, TodoItem, TodoUpdate } from './types.js'

function isTodoStatus(value: unknown): value is TodoItem['status'] {
  return value === 'pending' || value === 'in_progress' || value === 'completed'
}

export class ClaudeCodeTodoExtractor implements TodoExtractor {
  readonly providerName = 'claude-code'

  extractTodos(fileContent: string): TodoUpdate[] {
    if (!fileContent) return []

    const updates: TodoUpdate[] = []
    // Accumulated state for the incremental TaskCreate/TaskUpdate form.
    const running: TodoItem[] = []
    const lines = fileContent.split('\n').filter(l => l.trim())

    let messageIndex = 0
    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        messageIndex++

        if (entry.type === 'assistant' && entry.message?.content) {
          for (const block of entry.message.content) {
            if (block.type !== 'tool_use') continue

            if (block.name === 'TodoWrite' && block.input?.todos) {
              updates.push({
                id: block.id,
                timestamp: entry.timestamp,
                todos: block.input.todos as TodoItem[],
                messageIndex,
              })
              continue
            }

            if (block.name === 'TaskCreate' && typeof block.input?.subject === 'string') {
              running.push({
                content: block.input.subject,
                status: 'pending',
                activeForm:
                  typeof block.input.activeForm === 'string'
                    ? block.input.activeForm
                    : block.input.subject,
              })
            } else if (block.name === 'TaskUpdate' && block.input?.taskId != null) {
              // 1-based position in creation order.
              const index = Number(block.input.taskId) - 1
              const status = block.input.status
              if (running[index] && isTodoStatus(status)) {
                running[index] = { ...running[index], status }
              }
            } else {
              continue
            }

            // Emit the accumulated list so incremental events read like snapshots.
            updates.push({
              id: block.id,
              timestamp: entry.timestamp,
              todos: running.map(todo => ({ ...todo })),
              messageIndex,
            })
          }
        }
      } catch {
        // Skip invalid lines
      }
    }

    return updates
  }
}
