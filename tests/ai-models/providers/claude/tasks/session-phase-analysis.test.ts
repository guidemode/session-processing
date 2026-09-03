import { beforeEach, describe, expect, it } from 'vitest'
import { SessionPhaseAnalysisTask } from '../../../../../src/ai-models/providers/claude/tasks/session-phase-analysis.js'
import {
  EMPTY_SESSION,
  MOCK_CONTEXT,
  MOCK_PHASE_CONTEXT,
} from '../../../fixtures/mock-sessions.js'

const VALID_OUTPUT = {
  phases: [
    {
      phaseType: 'initial_specification',
      startStep: 1,
      endStep: 2,
      stepCount: 2,
      summary: 'Testy described the REST API they wanted.',
      durationMs: 5000,
      timestamp: '2025-01-01T00:00:00Z',
    },
    {
      phaseType: 'execution',
      startStep: 8,
      endStep: 12,
      stepCount: 5,
      summary: 'The model wrote and tested the Post model.',
      durationMs: 30000,
    },
  ],
  totalPhases: 2,
  totalSteps: 19,
  sessionDurationMs: 620000,
  pattern: 'initial_specification -> execution',
}

describe('SessionPhaseAnalysisTask', () => {
  let task: SessionPhaseAnalysisTask

  beforeEach(() => {
    task = new SessionPhaseAnalysisTask()
  })

  describe('Task Definition', () => {
    it('should have correct task type', () => {
      expect(task.taskType).toBe('session-phase-analysis')
    })

    it('should have name and description', () => {
      expect(task.name).toBe('Session Phase Analysis')
      expect(task.description).toBeTruthy()
    })

    it('should return complete definition', () => {
      const definition = task.getDefinition()

      expect(definition.taskType).toBe('session-phase-analysis')
      expect(definition.config).toBeDefined()
    })
  })

  describe('Task Configuration', () => {
    it('should return JSON response format', () => {
      expect(task.getConfig().responseFormat.type).toBe('json')
    })

    it('should record the analysis on the session', () => {
      expect(task.getConfig().recordingStrategy.updateAgentSession).toContain(
        'aiModelPhaseAnalysis'
      )
    })

    it('should include the phase pattern and transcript placeholders', () => {
      const prompt = task.getConfig().prompt

      expect(prompt).toContain('{{phasePattern}}')
      expect(prompt).toContain('{{transcript}}')
      expect(prompt).toContain('{{maxStep}}')
    })

    it('should warn the model that step numbers are sparse', () => {
      // Indices are original message indices with gaps; renumbering them would misalign
      // every phase boundary the UI resolves against the real message list.
      const prompt = task.getConfig().prompt

      expect(prompt).toContain('SPARSE')
      expect(prompt).toContain('Do NOT')
    })

    it('should explain the collapsed tool markers', () => {
      expect(task.getConfig().prompt).toContain('tool calls')
    })

    it('should declare the phases schema', () => {
      expect(task.getConfig().responseFormat.schema?.properties).toHaveProperty('phases')
    })
  })

  describe('Input Preparation', () => {
    it('should build a transcript with original step numbers', () => {
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      expect(input.transcript).toContain('Step 1 ')
      expect(input.transcript).toContain('REST API')
    })

    it('should report the highest valid step number', () => {
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      expect(input.maxStep).toBe(MOCK_PHASE_CONTEXT.session.messages.length)
    })

    it('should attach tool usage, which the old toolInfo branch never produced', () => {
      // The previous implementation only added tool names for `msg.type === 'assistant'`,
      // but canonical tool uses arrive as their own `tool_use` messages, so the branch
      // was dead on every real session.
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      expect(input.toolsUsed).not.toBe('None')
      expect(input.toolsUsed).toContain('Write')
    })

    it('should include the session boundaries', () => {
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      expect(input.sessionStart).toContain('2025-01-01')
      expect(input.sessionDurationMs).toBeGreaterThan(0)
    })

    it('should include interruptions in the transcript', () => {
      expect(task.prepareInput(MOCK_PHASE_CONTEXT).transcript).toContain('(interruption)')
    })

    it('should extract text from structured content', () => {
      expect(task.prepareInput(MOCK_PHASE_CONTEXT).transcript).toContain(
        'Let me analyze the requirements'
      )
    })

    it('should handle an empty messages array', () => {
      const input = task.prepareInput({ ...MOCK_PHASE_CONTEXT, session: EMPTY_SESSION })

      expect(input.transcript).toBe('No conversation content found')
      expect(input.messageCount).toBe(0)
    })

    it('should throw when session is missing', () => {
      expect(() => task.prepareInput({ ...MOCK_PHASE_CONTEXT, session: undefined })).toThrow(
        'Session data is required'
      )
    })
  })

  describe('canExecute', () => {
    it('should run for a session with enough messages', () => {
      expect(task.canExecute(MOCK_PHASE_CONTEXT)).toBe(true)
    })

    it('should not run for an empty session', () => {
      expect(task.canExecute({ ...MOCK_PHASE_CONTEXT, session: EMPTY_SESSION })).toBe(false)
    })

    it('should reject a context missing required identifiers', () => {
      expect(task.canExecute({ ...MOCK_PHASE_CONTEXT, sessionId: '' })).toBe(false)
      expect(task.canExecute({ ...MOCK_PHASE_CONTEXT, tenantId: '' })).toBe(false)
      expect(task.canExecute({ ...MOCK_PHASE_CONTEXT, userId: '' })).toBe(false)
    })
  })

  describe('Output Processing', () => {
    it('should accept a valid analysis', () => {
      const result = task.processOutput(VALID_OUTPUT, MOCK_PHASE_CONTEXT)

      expect(result.phases).toHaveLength(2)
      expect(result.phases[0].phaseType).toBe('initial_specification')
      expect(result.pattern).toBeTruthy()
    })

    it('should accept an empty phases array', () => {
      const result = task.processOutput(
        { phases: [], totalPhases: 0, totalSteps: 0, sessionDurationMs: 0, pattern: 'none' },
        MOCK_PHASE_CONTEXT
      )

      expect(result.phases).toEqual([])
    })

    it('should derive stepCount when the model omits it', () => {
      const result = task.processOutput(
        {
          ...VALID_OUTPUT,
          phases: [{ ...VALID_OUTPUT.phases[0], stepCount: undefined }],
        },
        MOCK_PHASE_CONTEXT
      )

      expect(result.phases[0].stepCount).toBe(2)
    })

    it('should clamp a step number beyond the end of the session', () => {
      // Sparse indices make an out-of-range step a realistic model error; the phase is
      // still useful, so clamp rather than discard.
      const result = task.processOutput(
        {
          ...VALID_OUTPUT,
          phases: [{ ...VALID_OUTPUT.phases[0], startStep: 1, endStep: 9999 }],
        },
        MOCK_PHASE_CONTEXT
      )

      expect(result.phases[0].endStep).toBe(MOCK_PHASE_CONTEXT.session.messages.length)
    })

    it('should clamp a step number below 1', () => {
      const result = task.processOutput(
        {
          ...VALID_OUTPUT,
          phases: [{ ...VALID_OUTPUT.phases[0], startStep: 0, endStep: 3 }],
        },
        MOCK_PHASE_CONTEXT
      )

      expect(result.phases[0].startStep).toBe(1)
    })

    it('should repair an inverted range', () => {
      const result = task.processOutput(
        {
          ...VALID_OUTPUT,
          phases: [{ ...VALID_OUTPUT.phases[0], startStep: 8, endStep: 3 }],
        },
        MOCK_PHASE_CONTEXT
      )

      expect(result.phases[0].endStep).toBeGreaterThanOrEqual(result.phases[0].startStep)
    })

    it('should coerce an unknown phase type to "other"', () => {
      const result = task.processOutput(
        {
          ...VALID_OUTPUT,
          phases: [{ ...VALID_OUTPUT.phases[0], phaseType: 'bikeshedding' }],
        },
        MOCK_PHASE_CONTEXT
      )

      expect(result.phases[0].phaseType).toBe('other')
    })

    it('should take totals from the session rather than trusting the model', () => {
      const result = task.processOutput(
        { ...VALID_OUTPUT, totalSteps: 3, sessionDurationMs: 1 },
        MOCK_PHASE_CONTEXT
      )

      expect(result.totalSteps).toBe(MOCK_PHASE_CONTEXT.session.messages.length)
      expect(result.sessionDurationMs).toBe(MOCK_PHASE_CONTEXT.session.duration)
    })

    it('should derive a pattern when the model omits one', () => {
      const { pattern, ...rest } = VALID_OUTPUT
      const result = task.processOutput(rest, MOCK_PHASE_CONTEXT)

      expect(result.pattern).toBe('initial_specification -> execution')
    })

    it('should reject output that is not an object', () => {
      expect(() => task.processOutput('invalid json', MOCK_PHASE_CONTEXT)).toThrow(/validation/)
      expect(() => task.processOutput(null, MOCK_PHASE_CONTEXT)).toThrow(/validation/)
    })

    it('should reject output with no phases array', () => {
      const { phases, ...rest } = VALID_OUTPUT

      expect(() => task.processOutput(rest, MOCK_PHASE_CONTEXT)).toThrow(/validation/)
    })

    it('should reject a phase missing its summary', () => {
      const { summary, ...phase } = VALID_OUTPUT.phases[0]

      expect(() =>
        task.processOutput({ ...VALID_OUTPUT, phases: [phase] }, MOCK_PHASE_CONTEXT)
      ).toThrow(/validation/)
    })
  })

  describe('Short sessions', () => {
    it('should still produce a transcript for a small session', () => {
      const input = task.prepareInput(MOCK_CONTEXT)

      expect(input.transcript).toBeTruthy()
      expect(input.maxStep).toBe(MOCK_CONTEXT.session.messages.length)
    })
  })
})
