import { beforeEach, describe, expect, it } from 'vitest'
import {
  QUALITY_SCORER_VERSION,
  QualityAssessmentTask,
} from '../../../../../src/ai-models/providers/claude/tasks/quality-assessment.js'
import { EMPTY_SESSION, MOCK_CONTEXT, MOCK_PHASE_CONTEXT } from '../../../fixtures/mock-sessions.js'

/** A well-formed model response, used as the baseline for validation tests. */
const VALID_OUTPUT = {
  score: 72,
  dimensions: {
    contextQuality: 70,
    promptClarity: 80,
    steeringEffectiveness: 65,
    processDiscipline: 73,
  },
  reasoning: 'Clear initial request with concrete file paths.',
  strengths: ['Provided the failing command and its output'],
  improvements: ['State the acceptance criteria up front'],
}

describe('QualityAssessmentTask', () => {
  let task: QualityAssessmentTask

  beforeEach(() => {
    task = new QualityAssessmentTask()
  })

  describe('Task Definition', () => {
    it('should have correct task type', () => {
      expect(task.taskType).toBe('quality-assessment')
    })

    it('should have descriptive name', () => {
      expect(task.name).toBe('Quality Assessment')
    })

    it('should return complete definition', () => {
      const definition = task.getDefinition()

      expect(definition.taskType).toBe('quality-assessment')
      expect(definition.name).toBe('Quality Assessment')
      expect(definition.config).toBeDefined()
    })
  })

  describe('Task Configuration', () => {
    it('should return JSON response format', () => {
      expect(task.getConfig().responseFormat.type).toBe('json')
    })

    it('should declare the score and per-dimension schema', () => {
      const schema = task.getConfig().responseFormat.schema

      expect(schema?.properties).toHaveProperty('score')
      expect(schema?.properties).toHaveProperty('dimensions')
      expect(schema?.properties).toHaveProperty('reasoning')
    })

    it('should constrain the score to 0-100', () => {
      const schema = task.getConfig().responseFormat.schema
      const properties = schema?.properties as Record<string, Record<string, unknown>>

      expect(properties.score.minimum).toBe(0)
      expect(properties.score.maximum).toBe(100)
    })

    it('should record the score and metadata on the session', () => {
      const strategy = task.getConfig().recordingStrategy

      expect(strategy.updateAgentSession).toContain('aiModelQualityScore')
      expect(strategy.updateAgentSession).toContain('aiModelMetadata')
      expect(strategy.createMetrics).toBe(true)
    })

    it('should give the model the transcript, not just aggregate counts', () => {
      // The whole point of v2: a prompt that asks about context quality and prompt
      // clarity is unanswerable without the actual messages.
      expect(task.getConfig().prompt).toContain('{{transcript}}')
    })

    it('should define scoring anchors so the scale is not arbitrary', () => {
      const prompt = task.getConfig().prompt

      expect(prompt).toContain('0-20')
      expect(prompt).toContain('81-100')
    })

    it('should ask for all four dimensions', () => {
      const prompt = task.getConfig().prompt

      expect(prompt).toContain('contextQuality')
      expect(prompt).toContain('promptClarity')
      expect(prompt).toContain('steeringEffectiveness')
      expect(prompt).toContain('processDiscipline')
    })

    it('should tell the model that step numbers are not contiguous', () => {
      expect(task.getConfig().prompt).toContain('not contiguous')
    })
  })

  describe('Input Preparation', () => {
    it('should include a rendered transcript', () => {
      const input = task.prepareInput(MOCK_CONTEXT)

      expect(input.transcript).toContain('user authentication system')
    })

    it('should count tools that the canonical parser puts on tool_use messages', () => {
      // Regression: v1 read `msg.type === 'assistant'`, but the canonical parser emits
      // tool uses as their own `tool_use` messages, so this was always 0.
      const input = task.prepareInput(MOCK_CONTEXT)

      expect(input.toolCount).toBe(2)
      expect(input.toolsUsed).toContain('Write')
      expect(input.toolsUsed).toContain('Edit')
    })

    it('should count interruptions by message type', () => {
      // Regression: v1 counted consecutive `type === 'user'` messages, which never fires
      // because tool messages sit between turns and interruptions have their own type.
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      expect(input.interruptionCount).toBe(1)
    })

    it('should report zero interruptions for a session without any', () => {
      expect(task.prepareInput(MOCK_CONTEXT).interruptionCount).toBe(0)
    })

    it('should count every user-authored turn, including slash commands', () => {
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      // 3 plain user turns + 1 slash command + 1 interruption
      expect(input.userTurnCount).toBe(5)
    })

    it('should derive errors from failed tool results, not the word "error"', () => {
      const input = task.prepareInput(MOCK_PHASE_CONTEXT)

      expect(input.errorCount).toBe(1)
    })

    it('should prefer the precomputed error metric when one is supplied', () => {
      const input = task.prepareInput({
        ...MOCK_PHASE_CONTEXT,
        metrics: [{ metricType: 'error', metrics: { error_count: 7 } }],
      })

      expect(input.errorCount).toBe(7)
    })

    it('should fall back to transcript errors when metrics are absent', () => {
      expect(task.prepareInput({ ...MOCK_PHASE_CONTEXT, metrics: undefined }).errorCount).toBe(1)
    })

    it('should use the display name for the user', () => {
      expect(task.prepareInput(MOCK_CONTEXT).userName).toBe('@testuser')
    })

    it('should fall back to "the user" when no user is supplied', () => {
      const input = task.prepareInput({ ...MOCK_CONTEXT, user: undefined })

      expect(input.userName).toBe('the user')
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

    it('should not run without a session', () => {
      expect(task.canExecute({ ...MOCK_CONTEXT, session: undefined })).toBe(false)
    })
  })

  describe('Output Processing', () => {
    it('should accept a well-formed response', () => {
      const result = task.processOutput(VALID_OUTPUT, MOCK_CONTEXT)

      expect(result.score).toBe(72)
      expect(result.dimensions.promptClarity).toBe(80)
      expect(result.reasoning).toBe('Clear initial request with concrete file paths.')
    })

    it('should stamp the scorer version so runs are comparable', () => {
      const result = task.processOutput(VALID_OUTPUT, MOCK_CONTEXT)

      expect(result.scorerVersion).toBe(QUALITY_SCORER_VERSION)
    })

    it('should preserve a legitimate score of zero', () => {
      const result = task.processOutput(
        { ...VALID_OUTPUT, score: 0 },
        MOCK_CONTEXT
      )

      expect(result.score).toBe(0)
    })

    it('should default missing arrays rather than failing', () => {
      const { strengths, improvements, ...rest } = VALID_OUTPUT
      const result = task.processOutput(rest, MOCK_CONTEXT)

      expect(result.strengths).toEqual([])
      expect(result.improvements).toEqual([])
    })

    it('should reject a score above 100', () => {
      expect(() => task.processOutput({ ...VALID_OUTPUT, score: 150 }, MOCK_CONTEXT)).toThrow(
        /validation/
      )
    })

    it('should reject a negative score', () => {
      expect(() => task.processOutput({ ...VALID_OUTPUT, score: -1 }, MOCK_CONTEXT)).toThrow(
        /validation/
      )
    })

    it('should reject a non-numeric score', () => {
      expect(() => task.processOutput({ ...VALID_OUTPUT, score: 'high' }, MOCK_CONTEXT)).toThrow(
        /validation/
      )
    })

    it('should reject a response missing the dimensions', () => {
      const { dimensions, ...rest } = VALID_OUTPUT

      expect(() => task.processOutput(rest, MOCK_CONTEXT)).toThrow(/validation/)
    })

    it('should reject a non-object response', () => {
      expect(() => task.processOutput('not an object', MOCK_CONTEXT)).toThrow(/validation/)
      expect(() => task.processOutput(null, MOCK_CONTEXT)).toThrow(/validation/)
    })
  })
})
