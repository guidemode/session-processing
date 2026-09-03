import { z } from 'zod'
import { BaseModelTask } from '../../../base/model-task.js'
import type { ModelTaskConfig, ModelTaskContext } from '../../../base/types.js'
import { buildTaskInput } from '../../../condense/index.js'

export interface IntentExtractionInput {
  userName: string
  transcript: string
}

export interface IntentExtractionOutput {
  primaryGoal: string
  secondaryGoals?: string[]
  technologies?: string[]
  challenges?: string[]
  taskType: 'feature_development' | 'bug_fix' | 'refactoring' | 'learning' | 'debugging' | 'other'
}

const TASK_TYPES = [
  'feature_development',
  'bug_fix',
  'refactoring',
  'learning',
  'debugging',
  'other',
] as const

const outputSchema = z.object({
  primaryGoal: z.string().min(1),
  secondaryGoals: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  challenges: z.array(z.string()).default([]),
  // An unrecognised task type is coerced rather than failing the whole extraction.
  taskType: z
    .string()
    .optional()
    .transform(v =>
      v && TASK_TYPES.includes(v as IntentExtractionOutput['taskType'])
        ? (v as IntentExtractionOutput['taskType'])
        : ('other' as const)
    ),
})

/**
 * Intent Extraction Task
 * Extracts user intents and goals from the session
 */
export class IntentExtractionTask extends BaseModelTask<
  IntentExtractionInput,
  IntentExtractionOutput
> {
  readonly taskType = 'intent-extraction'
  readonly name = 'Intent Extraction'
  readonly description = 'Extract user intents and goals from session messages'

  getConfig(): ModelTaskConfig {
    return {
      taskType: this.taskType,
      prompt: `You are analyzing an AI coding agent session to extract {{userName}}'s intents and goals.

The transcript below is condensed: tool inputs and outputs are replaced by counts, but every message {{userName}} wrote is present in full. Base your answer on what {{userName}} said, using the assistant's replies only as context. Step numbers are the original message indices and are therefore not contiguous.

Transcript:
{{transcript}}

Analyze this session and extract:
1. Primary Goal: What is the main thing {{userName}} wanted to accomplish?
2. Secondary Goals: What other objectives did {{userName}} have?
3. Technical Context: What technologies/frameworks were mentioned?
4. Challenges: What difficulties or blockers did {{userName}} encounter?

Respond with a JSON object:
{
  "primaryGoal": "<main objective>",
  "secondaryGoals": ["<goal 1>", "<goal 2>"],
  "technologies": ["<tech 1>", "<tech 2>"],
  "challenges": ["<challenge 1>", "<challenge 2>"],
  "taskType": "<type of work: feature_development | bug_fix | refactoring | learning | debugging | other>"
}`,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            primaryGoal: { type: 'string' },
            secondaryGoals: { type: 'array', items: { type: 'string' } },
            technologies: { type: 'array', items: { type: 'string' } },
            challenges: { type: 'array', items: { type: 'string' } },
            taskType: {
              type: 'string',
              enum: [
                'feature_development',
                'bug_fix',
                'refactoring',
                'learning',
                'debugging',
                'other',
              ],
            },
          },
          required: ['primaryGoal', 'taskType'],
        },
      },
      recordingStrategy: {
        updateAgentSession: ['aiModelMetadata'],
        createMetrics: true,
        metricType: 'ai_model',
      },
    }
  }

  prepareInput(context: ModelTaskContext): IntentExtractionInput {
    const base = buildTaskInput(context)

    return {
      userName: base.userName,
      transcript: base.transcript.text || 'No conversation content found',
    }
  }

  canExecute(context: ModelTaskContext): boolean {
    if (!super.canExecute(context) || !context.session) {
      return false
    }

    // Must have at least one message the person actually wrote. The canonical parser
    // splits those across four types, so filtering on 'user' alone would refuse to run on
    // sessions that opened with a slash command or consisted only of interruptions.
    return context.session.messages.some(
      msg =>
        msg.type === 'user' ||
        msg.type === 'user_input' ||
        msg.type === 'interruption' ||
        msg.type === 'command' ||
        msg.type === 'compact'
    )
  }

  processOutput(output: unknown, _context: ModelTaskContext): IntentExtractionOutput {
    const parsed = outputSchema.safeParse(output)

    if (!parsed.success) {
      throw new Error(`Intent extraction output failed validation: ${parsed.error.message}`)
    }

    // Built field by field rather than returned directly: the CJS build resolves modules
    // with `moduleResolution: "node"`, under which zod's inferred output type degrades to
    // all properties optional. An explicit construction is identical under both.
    const { primaryGoal, secondaryGoals, technologies, challenges, taskType } = parsed.data

    return {
      primaryGoal,
      secondaryGoals: secondaryGoals ?? [],
      technologies: technologies ?? [],
      challenges: challenges ?? [],
      taskType: taskType ?? 'other',
    }
  }
}
