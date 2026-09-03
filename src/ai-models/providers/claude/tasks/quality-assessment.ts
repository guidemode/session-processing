import { z } from 'zod'
import { BaseModelTask } from '../../../base/model-task.js'
import type { ModelTaskConfig, ModelTaskContext } from '../../../base/types.js'
import { buildTaskInput, formatToolUsage, readNumericMetric } from '../../../condense/index.js'

/**
 * Version of the scoring prompt and rubric.
 *
 * Stamped onto every result. Scores produced by different versions are not comparable, so
 * anything that aggregates or trends this score must group by it. Bump on any change to
 * the rubric, the bands, or the inputs the model sees.
 *
 * v1 - six aggregate scalars, no transcript, no rubric anchors.
 * v2 - condensed transcript, anchored bands, per-dimension sub-scores.
 */
export const QUALITY_SCORER_VERSION = 'v2'

export interface QualityAssessmentInput {
  userName: string
  provider: string
  durationMinutes: number | string
  messageCount: number
  userTurnCount: number
  interruptionCount: number
  toolCount: number
  toolsUsed: string
  errorCount: number
  transcript: string
}

export interface QualityDimensionScores {
  contextQuality: number
  promptClarity: number
  steeringEffectiveness: number
  processDiscipline: number
}

export interface QualityAssessmentOutput {
  score: number
  dimensions: QualityDimensionScores
  reasoning: string
  strengths: string[]
  improvements: string[]
  scorerVersion: string
}

const dimensionsSchema = z.object({
  contextQuality: z.number().min(0).max(100),
  promptClarity: z.number().min(0).max(100),
  steeringEffectiveness: z.number().min(0).max(100),
  processDiscipline: z.number().min(0).max(100),
})

const outputSchema = z.object({
  score: z.number().min(0).max(100),
  dimensions: dimensionsSchema,
  reasoning: z.string().default(''),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
})

/**
 * Quality Assessment Task
 *
 * Evaluates how well the person set the AI up to succeed. Deliberately scores the
 * person's inputs (context, clarity, steering, process), not the AI's output quality.
 */
export class QualityAssessmentTask extends BaseModelTask<
  QualityAssessmentInput,
  QualityAssessmentOutput
> {
  readonly taskType = 'quality-assessment'
  readonly name = 'Quality Assessment'
  readonly description = 'Evaluate session quality and provide a score'

  getConfig(): ModelTaskConfig {
    return {
      taskType: this.taskType,
      prompt: `You are evaluating how effectively {{userName}} collaborated with an AI coding agent. Score what {{userName}} controlled - the context and direction they gave - NOT how well the AI performed or whether the task was inherently hard.

Session Details:
- Provider: {{provider}}
- Duration: {{durationMinutes}} minutes
- Total Messages: {{messageCount}}
- Messages written by {{userName}}: {{userTurnCount}}
- Interruptions/corrections by {{userName}}: {{interruptionCount}}
- Distinct tools used: {{toolCount}}
- Tool usage: {{toolsUsed}}
- Failed operations: {{errorCount}}

The transcript below is condensed: tool inputs and outputs are replaced by summary markers, but every message {{userName}} wrote is present in full. Step numbers are the original message indices and are therefore not contiguous.

Transcript:
{{transcript}}

Score these four dimensions from 0-100, judging ONLY from evidence visible in the transcript:

1. Context Quality - Did {{userName}} provide file paths, error text, technical detail, constraints and relevant code up front, or did the AI have to discover everything?
2. Prompt Clarity - Were the instructions specific and actionable, or vague and open to interpretation?
3. Steering Effectiveness - When {{userName}} intervened, did the correction sharpen direction? Zero interruptions in a session that went well scores high; zero interruptions in a session that drifted scores low.
4. Process Discipline - Did {{userName}} use plan mode, todo tracking, staged verification, and iterate deliberately rather than in scattershot?

Use these anchors for every dimension and for the overall score:
- 0-20: Almost no usable signal. One-line vague request, no context, no correction when the work went wrong.
- 21-40: Minimal. Some intent stated but the AI had to infer most requirements; corrections were vague ("no, fix it").
- 41-60: Adequate. Clear enough to act on, but missing context that cost avoidable exploration or rework.
- 61-80: Strong. Specific request with real context (paths, errors, constraints); corrections were targeted and timely.
- 81-100: Exemplary. Comprehensive up-front context, unambiguous success criteria, deliberate process, precise steering.

Rules:
- Do not reward or penalise session length, message count or duration on their own.
- Failed operations are normal AI exploration. Only count them against {{userName}} where the transcript shows the failure was caused by missing or wrong context they supplied.
- If the transcript is too sparse to judge a dimension, score it 50 and say so in the reasoning.
- The overall score should be roughly the average of the four dimensions, adjusted for what mattered most in this particular session.

Respond with a JSON object containing:
{
  "score": <number 0-100>,
  "dimensions": {
    "contextQuality": <number 0-100>,
    "promptClarity": <number 0-100>,
    "steeringEffectiveness": <number 0-100>,
    "processDiscipline": <number 0-100>
  },
  "reasoning": "<2-3 sentences citing specific evidence from the transcript>",
  "strengths": ["<what {{userName}} did that enabled the AI>", "<another strength>"],
  "improvements": ["<a concrete change to context or prompting>", "<another improvement>"]
}`,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            score: { type: 'number', minimum: 0, maximum: 100 },
            dimensions: {
              type: 'object',
              properties: {
                contextQuality: { type: 'number', minimum: 0, maximum: 100 },
                promptClarity: { type: 'number', minimum: 0, maximum: 100 },
                steeringEffectiveness: { type: 'number', minimum: 0, maximum: 100 },
                processDiscipline: { type: 'number', minimum: 0, maximum: 100 },
              },
              required: [
                'contextQuality',
                'promptClarity',
                'steeringEffectiveness',
                'processDiscipline',
              ],
            },
            reasoning: { type: 'string' },
            strengths: { type: 'array', items: { type: 'string' } },
            improvements: { type: 'array', items: { type: 'string' } },
          },
          required: ['score', 'dimensions', 'reasoning'],
        },
      },
      recordingStrategy: {
        updateAgentSession: ['aiModelQualityScore', 'aiModelMetadata'],
        createMetrics: true,
        metricType: 'ai_model',
      },
    }
  }

  prepareInput(context: ModelTaskContext): QualityAssessmentInput {
    const base = buildTaskInput(context)
    const { transcript } = base

    // Prefer the real error count from the metric processors; fall back to tool results
    // flagged is_error. The previous implementation counted any message containing the
    // substring "error", which matched every message that merely discussed error handling.
    const errorCount =
      readNumericMetric(context.metrics, 'error', 'error_count') ?? transcript.toolErrorCount

    return {
      userName: base.userName,
      provider: base.provider,
      durationMinutes: base.durationMinutes,
      messageCount: base.messageCount,
      userTurnCount: transcript.userTurnCount,
      interruptionCount: transcript.interruptionCount,
      toolCount: transcript.uniqueToolCount,
      toolsUsed: formatToolUsage(transcript),
      errorCount,
      transcript: transcript.text || 'No conversation content found',
    }
  }

  canExecute(context: ModelTaskContext): boolean {
    return super.canExecute(context) && !!context.session && context.session.messages.length > 0
  }

  processOutput(output: unknown, _context: ModelTaskContext): QualityAssessmentOutput {
    const parsed = outputSchema.safeParse(output)

    if (!parsed.success) {
      throw new Error(`Quality assessment output failed validation: ${parsed.error.message}`)
    }

    // Built field by field rather than spread. The CJS build resolves modules with
    // `moduleResolution: "node"`, under which zod's inferred output type degrades to all
    // properties optional; an explicit construction is identical under both resolutions.
    const { score, dimensions, reasoning, strengths, improvements } = parsed.data

    return {
      score,
      dimensions: {
        contextQuality: dimensions.contextQuality,
        promptClarity: dimensions.promptClarity,
        steeringEffectiveness: dimensions.steeringEffectiveness,
        processDiscipline: dimensions.processDiscipline,
      },
      reasoning: reasoning ?? '',
      strengths: strengths ?? [],
      improvements: improvements ?? [],
      scorerVersion: QUALITY_SCORER_VERSION,
    }
  }
}
