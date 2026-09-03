/**
 * Claude Code's task-list tool changed shape mid-life: `TodoWrite` wrote a snapshot of the
 * whole list, while `TaskCreate`/`TaskUpdate` emit incremental events. Stored sessions of
 * both kinds exist and neither will be re-recorded, so the extractor has to read both.
 */

import { describe, expect, it } from 'vitest'
import { ClaudeCodeTodoExtractor } from '../../src/ui/utils/todos/extractTodosClaudeCode.js'

const extractor = new ClaudeCodeTodoExtractor()

function assistantToolCall(id: string, name: string, input: unknown): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2025-01-01T00:00:00Z',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  })
}

describe('ClaudeCodeTodoExtractor', () => {
  it('reads a TodoWrite snapshot', () => {
    const updates = extractor.extractTodos(
      assistantToolCall('t1', 'TodoWrite', {
        todos: [{ content: 'Do the thing', status: 'pending', activeForm: 'Doing the thing' }],
      })
    )

    expect(updates).toHaveLength(1)
    expect(updates[0].todos).toEqual([
      { content: 'Do the thing', status: 'pending', activeForm: 'Doing the thing' },
    ])
  })

  it('accumulates TaskCreate events into a list', () => {
    const updates = extractor.extractTodos(
      [
        assistantToolCall('t1', 'TaskCreate', { subject: 'First', activeForm: 'Doing first' }),
        assistantToolCall('t2', 'TaskCreate', { subject: 'Second', activeForm: 'Doing second' }),
      ].join('\n')
    )

    expect(updates).toHaveLength(2)
    expect(updates[1].todos.map(t => t.content)).toEqual(['First', 'Second'])
    expect(updates[1].todos.every(t => t.status === 'pending')).toBe(true)
  })

  it('applies TaskUpdate by 1-based creation order', () => {
    const updates = extractor.extractTodos(
      [
        assistantToolCall('t1', 'TaskCreate', { subject: 'First', activeForm: 'Doing first' }),
        assistantToolCall('t2', 'TaskCreate', { subject: 'Second', activeForm: 'Doing second' }),
        assistantToolCall('t3', 'TaskUpdate', { taskId: '2', status: 'in_progress' }),
      ].join('\n')
    )

    const final = updates[updates.length - 1].todos
    expect(final[0].status).toBe('pending')
    expect(final[1].status).toBe('in_progress')
  })

  it('falls back to the subject when no activeForm is given', () => {
    const updates = extractor.extractTodos(assistantToolCall('t1', 'TaskCreate', { subject: 'Ship' }))

    expect(updates[0].todos[0].activeForm).toBe('Ship')
  })

  it('ignores an update for a task that does not exist', () => {
    const updates = extractor.extractTodos(
      [
        assistantToolCall('t1', 'TaskCreate', { subject: 'Only one' }),
        assistantToolCall('t2', 'TaskUpdate', { taskId: '7', status: 'completed' }),
      ].join('\n')
    )

    expect(updates[updates.length - 1].todos).toHaveLength(1)
    expect(updates[updates.length - 1].todos[0].status).toBe('pending')
  })

  it('does not treat TaskStop as a task-list event', () => {
    // TaskStop controls background subagents, not task lists.
    expect(extractor.extractTodos(assistantToolCall('t1', 'TaskStop', { task_id: 'bluvcpr3d' }))).toEqual([])
  })
})
