import { z } from 'zod'
import { BaseModelTask } from '../../../base/model-task.js'
import type { ModelTaskConfig, ModelTaskContext } from '../../../base/types.js'
import { buildTaskInput, formatToolUsage } from '../../../condense/index.js'

/**
 * Session Phase Types
 * Represents the different phases a coding session can go through
 */
export type SessionPhaseType =
  | 'initial_specification'
  | 'analysis_planning'
  | 'plan_modification'
  | 'plan_agreement'
  | 'execution'
  | 'interruption'
  | 'task_assignment'
  | 'completion'
  | 'correction'
  | 'final_completion'
  | 'other'

/**
 * Phase in the session timeline
 */
export interface SessionPhase {
  phaseType: SessionPhaseType
  startStep: number
  endStep: number
  stepCount: number
  summary: string
  durationMs: number
  timestamp?: string
}

/**
 * Complete session phase analysis result
 */
export interface SessionPhaseAnalysis {
  phases: SessionPhase[]
  totalPhases: number
  totalSteps: number
  sessionDurationMs: number
  pattern: string
}

/**
 * Input prepared for the phase analysis AI model
 */
export interface PhaseAnalysisInput {
  userName: string
  provider: string
  durationMinutes: number | string
  messageCount: number
  sessionStart: string
  sessionEnd: string
  sessionDurationMs: number
  phasePattern: string
  transcript: string
  toolsUsed: string
  /** Highest original message index, so the model knows the valid range for step numbers. */
  maxStep: number
}

const PHASE_TYPES = [
  'initial_specification',
  'analysis_planning',
  'plan_modification',
  'plan_agreement',
  'execution',
  'interruption',
  'task_assignment',
  'completion',
  'correction',
  'final_completion',
  'other',
] as const

const phaseSchema = z.object({
  // Unknown phase types are coerced to 'other' rather than failing the whole analysis.
  phaseType: z
    .string()
    .transform(v =>
      PHASE_TYPES.includes(v as SessionPhaseType) ? (v as SessionPhaseType) : 'other'
    ),
  startStep: z.number(),
  endStep: z.number(),
  stepCount: z.number().optional(),
  summary: z.string(),
  durationMs: z.number(),
  timestamp: z.string().optional(),
})

const phaseAnalysisSchema = z.object({
  phases: z.array(phaseSchema),
  totalPhases: z.number().optional(),
  totalSteps: z.number().optional(),
  sessionDurationMs: z.number().optional(),
  pattern: z.string().optional(),
})

/**
 * Session Phase Analysis Task
 * Analyzes the entire chat transcript and breaks it into meaningful broader steps/phases
 * based on configurable patterns
 */
export class SessionPhaseAnalysisTask extends BaseModelTask<
  PhaseAnalysisInput,
  SessionPhaseAnalysis
> {
  readonly taskType = 'session-phase-analysis'
  readonly name = 'Session Phase Analysis'
  readonly description =
    'Analyze chat transcript and identify meaningful phases in the session flow'

  /**
   * Configuration for phase pattern
   * Can be modified to support different analysis patterns over time
   */
  private readonly defaultPattern = `
[Initial Specification] - The user describes what they want to accomplish
[Analysis & Planning] - The AI analyzes the requirements and creates a plan
[Plan Modification by User] - The user requests changes or clarifications to the plan
[Plan Agreement] - Both parties agree on the approach
[Execution] - The AI executes the plan, making changes
[Interruption] - The user interrupts or redirects the AI
[Task Assignment (parallel)] - Multiple tasks are being worked on simultaneously (optional phase)
[Completion] - The initial task is completed
[Correction] - Issues are found and need to be fixed (e.g., not working, not right)
[Final Completion] - All issues resolved and task is done
`.trim()

  getConfig(): ModelTaskConfig {
    return {
      taskType: this.taskType,
      prompt: `You are analyzing an AI coding agent session with {{userName}}. Your task is to break down the entire session into meaningful phases based on the flow of the conversation.

Session Details:
- Provider: {{provider}}
- Duration: {{durationMinutes}} minutes
- Message Count: {{messageCount}}
- Session Start: {{sessionStart}}
- Session End: {{sessionEnd}}

Expected Phase Pattern (use this as a guide, but adapt to what actually happened):
{{phasePattern}}

Tools Used: {{toolsUsed}}

Session Transcript (condensed):
{{transcript}}

HOW TO READ THE TRANSCRIPT:
- Tool inputs and outputs have been removed and replaced by summary markers such as
  "[4 tool calls: Read x2, Glob x2]". Treat those markers as execution activity.
- Every message {{userName}} wrote is present in full, including interruptions
  (labelled "(interruption)") and slash commands (labelled "(command)").
- "Step N" is the ORIGINAL message index in the session. Steps are SPARSE: numbers are
  skipped where messages were condensed away, and "[... N message(s) omitted ...]" marks
  larger gaps. Step numbers run from 1 to {{maxStep}}.
- Use the ORIGINAL step numbers shown in the transcript for startStep and endStep. Do NOT
  renumber them, and do not assume consecutive steps are adjacent in time.

CRITICAL INSTRUCTIONS:
1. Analyze the ENTIRE transcript above
2. Identify distinct phases that actually occurred (not all phases may be present)
3. For each phase, determine:
   - The phase type (from the pattern or "other" if it doesn't fit)
   - Which message/step numbers (1-based index) belong to this phase
   - A brief summary (1-2 sentences) of what happened in this phase
   - Approximate duration of this phase in milliseconds
4. Phases should be sequential and non-overlapping
5. A phase can span multiple messages/steps
6. Return your analysis as a structured JSON object

Respond with a JSON object in this EXACT format:
{
  "phases": [
    {
      "phaseType": "initial_specification",
      "startStep": 1,
      "endStep": 3,
      "stepCount": 3,
      "summary": "User described wanting to add a new feature...",
      "durationMs": 120000,
      "timestamp": "2024-01-01T10:00:00Z"
    }
  ],
  "totalPhases": 5,
  "totalSteps": {{messageCount}},
  "sessionDurationMs": {{sessionDurationMs}},
  "pattern": "initial_specification -> analysis_planning -> execution -> completion"
}

Phase types must be one of:
- initial_specification
- analysis_planning
- plan_modification
- plan_agreement
- execution
- interruption
- task_assignment
- completion
- correction
- final_completion
- other

Always refer to the person as {{userName}} in your summaries.`,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            phases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  phaseType: { type: 'string' },
                  startStep: { type: 'number' },
                  endStep: { type: 'number' },
                  stepCount: { type: 'number' },
                  summary: { type: 'string' },
                  durationMs: { type: 'number' },
                  timestamp: { type: 'string' },
                },
                required: [
                  'phaseType',
                  'startStep',
                  'endStep',
                  'stepCount',
                  'summary',
                  'durationMs',
                ],
              },
            },
            totalPhases: { type: 'number' },
            totalSteps: { type: 'number' },
            sessionDurationMs: { type: 'number' },
            pattern: { type: 'string' },
          },
          required: ['phases', 'totalPhases', 'totalSteps', 'sessionDurationMs', 'pattern'],
        },
      },
      recordingStrategy: {
        updateAgentSession: ['aiModelPhaseAnalysis'],
      },
    }
  }

  prepareInput(context: ModelTaskContext): PhaseAnalysisInput {
    const base = buildTaskInput(context)
    const session = context.session
    if (!session) {
      throw new Error('Session data is required for phase analysis')
    }

    return {
      userName: base.userName,
      provider: base.provider,
      durationMinutes: base.durationMinutes,
      messageCount: base.messageCount,
      sessionStart: session.startTime ? new Date(session.startTime).toISOString() : 'Unknown',
      sessionEnd: session.endTime ? new Date(session.endTime).toISOString() : 'Unknown',
      sessionDurationMs: session.duration || 0,
      phasePattern: this.defaultPattern,
      transcript: base.transcript.text || 'No conversation content found',
      toolsUsed: formatToolUsage(base.transcript),
      maxStep: base.messageCount,
    }
  }

  canExecute(context: ModelTaskContext): boolean {
    // Need at least a few messages to perform meaningful phase analysis
    return super.canExecute(context) && !!context.session && context.session.messages.length >= 3
  }

  processOutput(output: unknown, context: ModelTaskContext): SessionPhaseAnalysis {
    const parsed = phaseAnalysisSchema.safeParse(output)

    if (!parsed.success) {
      throw new Error(`Phase analysis output failed validation: ${parsed.error.message}`)
    }

    const totalSteps = context.session?.messages.length ?? 0

    // The transcript uses sparse ORIGINAL message indices, so the model can return a step
    // that does not exist or an inverted range. Clamp rather than discard: the phase
    // summaries are still useful even when a boundary drifts, and the UI resolves these
    // indices against the real message list.
    const clamp = (step: number): number =>
      totalSteps > 0
        ? Math.min(Math.max(Math.round(step), 1), totalSteps)
        : Math.max(1, Math.round(step))

    const phases: SessionPhase[] = parsed.data.phases.map(phase => {
      const startStep = clamp(phase.startStep)
      const endStep = Math.max(startStep, clamp(phase.endStep))
      return {
        phaseType: phase.phaseType,
        startStep,
        endStep,
        stepCount: phase.stepCount ?? endStep - startStep + 1,
        summary: phase.summary,
        durationMs: phase.durationMs,
        timestamp: phase.timestamp,
      }
    })

    return {
      phases,
      totalPhases: phases.length,
      totalSteps: totalSteps || parsed.data.totalSteps || 0,
      sessionDurationMs: context.session?.duration || parsed.data.sessionDurationMs || 0,
      pattern: parsed.data.pattern || phases.map(p => p.phaseType).join(' -> ') || 'unknown',
    }
  }
}
