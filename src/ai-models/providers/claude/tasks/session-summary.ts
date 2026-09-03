import { BaseModelTask } from '../../../base/model-task.js'
import type { ModelTaskConfig, ModelTaskContext } from '../../../base/types.js'
import { buildTaskInput, formatToolUsage } from '../../../condense/index.js'

export interface SessionSummaryInput {
  userName: string
  provider: string
  durationMinutes: number | string
  messageCount: number
  toolsUsed: string
  transcript: string
}

/**
 * Session Summary Task
 * Generates a concise 2-3 sentence summary of an agent session
 */
export class SessionSummaryTask extends BaseModelTask<SessionSummaryInput, string> {
  readonly taskType = 'session-summary'
  readonly name = 'Session Summary'
  readonly description = 'Generate a concise summary of the agent session'

  getConfig(): ModelTaskConfig {
    return {
      taskType: this.taskType,
      prompt: `You are analyzing an AI coding agent session. Generate a concise 2-3 sentence summary focusing on:
1. What was {{userName}}'s goal or intent?
2. What was concretely achieved (files created, bugs fixed, features added, etc.)?
3. Was the work completed or left incomplete?

If the first user message is a pasted plan (e.g. starts with "Implement the following plan"), note the broader goal being implemented.

Do NOT describe what the AI agent did (e.g. "the agent read files and wrote code"). Focus on outcomes from {{userName}}'s perspective.

Session Details:
- Provider: {{provider}}
- Duration: {{durationMinutes}} minutes
- Message Count: {{messageCount}}
- Tools Used: {{toolsUsed}}

The transcript below is condensed: tool inputs and outputs are replaced by counts, but every message {{userName}} wrote is present in full. Step numbers are the original message indices and are therefore not contiguous.

Transcript:
{{transcript}}

Provide a clear, professional summary in 2-3 sentences. Always refer to the person as {{userName}}, not "the user".`,
      responseFormat: {
        type: 'text',
      },
      recordingStrategy: {
        updateAgentSession: ['aiModelSummary'],
      },
    }
  }

  prepareInput(context: ModelTaskContext): SessionSummaryInput {
    const base = buildTaskInput(context)

    return {
      userName: base.userName,
      provider: base.provider,
      durationMinutes: base.durationMinutes,
      messageCount: base.messageCount,
      toolsUsed: formatToolUsage(base.transcript),
      transcript: base.transcript.text || 'No conversation content found',
    }
  }

  canExecute(context: ModelTaskContext): boolean {
    return super.canExecute(context) && !!context.session && context.session.messages.length > 0
  }

  processOutput(output: unknown, _context: ModelTaskContext): string {
    // Ensure output is a string and trim it
    return String(output).trim()
  }
}
