import { beforeEach, describe, expect, it } from 'vitest'
import { SessionSummaryTask } from '../../../../../src/ai-models/providers/claude/tasks/session-summary.js'
import { EMPTY_SESSION, MOCK_CONTEXT, MOCK_PHASE_CONTEXT } from '../../../fixtures/mock-sessions.js'

describe('SessionSummaryTask', () => {
  let task: SessionSummaryTask

  beforeEach(() => {
    task = new SessionSummaryTask()
  })

  describe('Task Definition', () => {
    it('should have correct task type', () => {
      expect(task.taskType).toBe('session-summary')
    })

    it('should have descriptive name', () => {
      expect(task.name).toBe('Session Summary')
    })

    it('should return complete definition', () => {
      const definition = task.getDefinition()

      expect(definition.taskType).toBe('session-summary')
      expect(definition.config).toBeDefined()
    })
  })

  describe('Task Configuration', () => {
    it('should return a text response format', () => {
      expect(task.getConfig().responseFormat.type).toBe('text')
    })

    it('should record the summary on the session', () => {
      expect(task.getConfig().recordingStrategy.updateAgentSession).toContain('aiModelSummary')
    })

    it('should ask whether the work was completed', () => {
      expect(task.getConfig().prompt).toContain('completed or left incomplete')
    })

    it('should use a single transcript variable', () => {
      const prompt = task.getConfig().prompt

      expect(prompt).toContain('{{transcript}}')
      // Replaced by the shared condenser; three overlapping extractions are gone.
      expect(prompt).not.toContain('{{userMessages}}')
      expect(prompt).not.toContain('{{assistantResponses}}')
    })

    it('should tell the model that step numbers are not contiguous', () => {
      expect(task.getConfig().prompt).toContain('not contiguous')
    })
  })

  describe('Input Preparation', () => {
    it('should include the user turns in the transcript', () => {
      const input = task.prepareInput(MOCK_CONTEXT)

      expect(input.transcript).toContain('user authentication system')
      expect(input.transcript).toContain('password hashing')
    })

    it('should retain the FINAL user turn', () => {
      // Regression: v1 kept only the first 10 user messages, so the end of a long
      // session - where completion is stated - was invisible to the model.
      expect(task.prepareInput(MOCK_CONTEXT).transcript).toContain('Perfect, thank you!')
    })

    it('should retain the closing assistant message', () => {
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      expect(input.transcript).toContain('The REST API is complete')
    })

    it('should include interruptions and slash commands', () => {
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      expect(input.transcript).toContain('interruption')
      expect(input.transcript).toContain('use Zod for validation')
      expect(input.transcript).toContain('command')
    })

    it('should summarise tool usage with counts', () => {
      const input = task.prepareInput(MOCK_CONTEXT)

      expect(input.toolsUsed).toContain('Write')
      expect(input.toolsUsed).toContain('Edit')
    })

    it('should flag failed tool calls in the usage summary', () => {
      expect(task.prepareInput(MOCK_PHASE_CONTEXT).toolsUsed).toContain('failed')
    })

    it('should not leak tool inputs into the transcript', () => {
      // The condenser replaces tool bodies with counts; file contents must not appear.
      const input = task.prepareInput(MOCK_CONTEXT)

      expect(input.transcript).not.toContain('export class User {}')
    })

    it('should report the message count and duration', () => {
      const input = task.prepareInput(MOCK_CONTEXT)

      expect(input.messageCount).toBe(9)
      expect(input.durationMinutes).toBe(10)
    })

    it('should throw when there is no session', () => {
      expect(() => task.prepareInput({ ...MOCK_CONTEXT, session: undefined })).toThrow()
    })
  })

  describe('canExecute', () => {
    it('should run for a session with messages', () => {
      expect(task.canExecute(MOCK_CONTEXT)).toBe(true)
    })

    it('should not run for an empty session', () => {
      expect(task.canExecute({ ...MOCK_CONTEXT, session: EMPTY_SESSION })).toBe(false)
    })
  })

  describe('Output Processing', () => {
    it('should trim the summary text', () => {
      expect(task.processOutput('  A summary.  ', MOCK_CONTEXT)).toBe('A summary.')
    })

    it('should coerce non-string output', () => {
      expect(task.processOutput(42, MOCK_CONTEXT)).toBe('42')
    })
  })
})
