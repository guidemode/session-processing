import { beforeEach, describe, expect, it } from 'vitest'
import { IntentExtractionTask } from '../../../../../src/ai-models/providers/claude/tasks/intent-extraction.js'
import { EMPTY_SESSION, MOCK_CONTEXT, MOCK_PHASE_CONTEXT } from '../../../fixtures/mock-sessions.js'

const VALID_OUTPUT = {
  primaryGoal: 'Build a user authentication system',
  secondaryGoals: ['Add password hashing'],
  technologies: ['TypeScript', 'bcrypt'],
  challenges: ['Choosing a hashing strategy'],
  taskType: 'feature_development',
}

describe('IntentExtractionTask', () => {
  let task: IntentExtractionTask

  beforeEach(() => {
    task = new IntentExtractionTask()
  })

  describe('Task Definition', () => {
    it('should have correct task type', () => {
      expect(task.taskType).toBe('intent-extraction')
    })

    it('should return complete definition', () => {
      expect(task.getDefinition().taskType).toBe('intent-extraction')
    })
  })

  describe('Task Configuration', () => {
    it('should return JSON response format', () => {
      expect(task.getConfig().responseFormat.type).toBe('json')
    })

    it('should declare the expected fields', () => {
      const properties = task.getConfig().responseFormat.schema?.properties

      expect(properties).toHaveProperty('primaryGoal')
      expect(properties).toHaveProperty('taskType')
    })

    it('should record metadata on the session', () => {
      expect(task.getConfig().recordingStrategy.updateAgentSession).toContain('aiModelMetadata')
    })

    it('should use the shared transcript variable', () => {
      const prompt = task.getConfig().prompt

      expect(prompt).toContain('{{transcript}}')
      expect(prompt).not.toContain('{{userMessages}}')
    })
  })

  describe('Input Preparation', () => {
    it('should include what the user asked for', () => {
      const input = task.prepareInput(MOCK_CONTEXT)

      expect(input.transcript).toContain('user authentication system')
    })

    it('should include later user turns, not only the first', () => {
      const input = task.prepareInput(MOCK_CONTEXT)

      expect(input.transcript).toContain('password hashing')
    })

    it('should include interruptions, which often carry the real intent', () => {
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      expect(input.transcript).toContain('use Zod for validation')
    })

    it('should use the display name', () => {
      expect(task.prepareInput(MOCK_CONTEXT).userName).toBe('@testuser')
    })

    it('should throw when there is no session', () => {
      expect(() => task.prepareInput({ ...MOCK_CONTEXT, session: undefined })).toThrow()
    })
  })

  describe('canExecute', () => {
    it('should run when the user wrote something', () => {
      expect(task.canExecute(MOCK_CONTEXT)).toBe(true)
    })

    it('should run for a session whose only user input is a command or interruption', () => {
      // Filtering on `type === 'user'` alone would refuse to run on these.
      const session = {
        ...MOCK_PHASE_CONTEXT.session,
        messages: MOCK_PHASE_CONTEXT.session.messages.filter(
          m => m.type === 'command' || m.type === 'interruption' || m.type === 'assistant'
        ),
      }

      expect(task.canExecute({ ...MOCK_PHASE_CONTEXT, session })).toBe(true)
    })

    it('should not run for an empty session', () => {
      expect(task.canExecute({ ...MOCK_CONTEXT, session: EMPTY_SESSION })).toBe(false)
    })
  })

  describe('Output Processing', () => {
    it('should accept a well-formed response', () => {
      const result = task.processOutput(VALID_OUTPUT, MOCK_CONTEXT)

      expect(result.primaryGoal).toBe('Build a user authentication system')
      expect(result.taskType).toBe('feature_development')
      expect(result.technologies).toEqual(['TypeScript', 'bcrypt'])
    })

    it('should default missing arrays', () => {
      const result = task.processOutput(
        { primaryGoal: 'Fix a bug', taskType: 'bug_fix' },
        MOCK_CONTEXT
      )

      expect(result.secondaryGoals).toEqual([])
      expect(result.challenges).toEqual([])
    })

    it('should coerce an unrecognised task type to "other"', () => {
      const result = task.processOutput(
        { ...VALID_OUTPUT, taskType: 'archaeology' },
        MOCK_CONTEXT
      )

      expect(result.taskType).toBe('other')
    })

    it('should coerce a missing task type to "other"', () => {
      const { taskType, ...rest } = VALID_OUTPUT
      const result = task.processOutput(rest, MOCK_CONTEXT)

      expect(result.taskType).toBe('other')
    })

    it('should reject a response with no primary goal', () => {
      const { primaryGoal, ...rest } = VALID_OUTPUT

      expect(() => task.processOutput(rest, MOCK_CONTEXT)).toThrow(/validation/)
    })

    it('should reject an empty primary goal', () => {
      expect(() => task.processOutput({ ...VALID_OUTPUT, primaryGoal: '' }, MOCK_CONTEXT)).toThrow(
        /validation/
      )
    })

    it('should reject a non-object response', () => {
      expect(() => task.processOutput(null, MOCK_CONTEXT)).toThrow(/validation/)
      expect(() => task.processOutput('text', MOCK_CONTEXT)).toThrow(/validation/)
    })
  })
})
