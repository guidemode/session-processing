import { describe, expect, it } from 'vitest'
import { CanonicalParser } from '../../../src/parsers/canonical/parser.js'
import {
  CanonicalQualityProcessor,
  PROCESS_QUALITY_SCORER_VERSION,
} from '../../../src/processors/canonical/metrics/quality.js'
import {
  countByCapability,
  getToolCapability,
  normalizeToolName,
} from '../../../src/processors/canonical/metrics/tool-capabilities.js'
import type { QualityMetrics } from '@guidemode/types'

/** Build a canonical session whose assistant makes exactly the given tool calls. */
function sessionWithTools(toolNames: string[], errorIndices: number[] = []) {
  const lines: string[] = [
    JSON.stringify({
      uuid: 'u0',
      timestamp: '2025-01-01T00:00:00Z',
      type: 'user',
      sessionId: 's',
      provider: 'test',
      message: { role: 'user', content: 'Please do the thing' },
    }),
  ]

  toolNames.forEach((name, i) => {
    lines.push(
      JSON.stringify({
        uuid: `a${i}`,
        timestamp: '2025-01-01T00:00:01Z',
        type: 'assistant',
        sessionId: 's',
        provider: 'test',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: `t${i}`, name, input: {} }],
        },
      })
    )
    lines.push(
      JSON.stringify({
        uuid: `r${i}`,
        timestamp: '2025-01-01T00:00:02Z',
        type: 'user',
        sessionId: 's',
        provider: 'test',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: `t${i}`,
              content: 'ok',
              is_error: errorIndices.includes(i),
            },
          ],
        },
      })
    )
  })

  return new CanonicalParser().parseSession(lines.join('\n'), 'test')
}

async function score(toolNames: string[], errorIndices: number[] = []): Promise<QualityMetrics> {
  return (await new CanonicalQualityProcessor().process(
    sessionWithTools(toolNames, errorIndices) as never
  )) as QualityMetrics
}

describe('tool capability mapping', () => {
  describe('normalizeToolName', () => {
    it.each([
      ['TodoWrite', 'todowrite'],
      ['todo_write', 'todowrite'],
      ['todowrite', 'todowrite'],
      ['run_shell_command', 'runshellcommand'],
    ])('normalises %s to %s', (input, expected) => {
      expect(normalizeToolName(input)).toBe(expected)
    })
  })

  describe('getToolCapability', () => {
    it.each([
      ['Read', 'read'],
      ['Grep', 'read'],
      ['Glob', 'read'],
      ['Write', 'write'],
      ['Edit', 'write'],
      ['Bash', 'execute'],
      ['ExitPlanMode', 'plan'],
      ['TodoWrite', 'todo'],
    ])('maps the Claude Code tool %s to %s', (name, capability) => {
      expect(getToolCapability(name)).toBe(capability)
    })

    it.each([
      ['read', 'read'],
      ['glob', 'read'],
      ['write', 'write'],
      ['edit', 'write'],
      ['bash', 'execute'],
      ['todowrite', 'todo'],
      ['todoread', 'todo'],
    ])('maps the OpenCode tool %s to %s', (name, capability) => {
      expect(getToolCapability(name)).toBe(capability)
    })

    it.each([
      ['read_file', 'read'],
      ['read_many_files', 'read'],
      ['list_directory', 'read'],
      ['search_file_content', 'read'],
      ['write_file', 'write'],
      ['replace', 'write'],
      ['run_shell_command', 'execute'],
    ])('maps the Gemini tool %s to %s', (name, capability) => {
      expect(getToolCapability(name)).toBe(capability)
    })

    it.each(['apply_patch', 'shell', 'local_shell'])('maps the Codex tool %s', name => {
      expect(getToolCapability(name)).not.toBeNull()
    })

    it('returns null for tools with no process-quality meaning', () => {
      expect(getToolCapability('WebFetch')).toBeNull()
      expect(getToolCapability('take_screenshot')).toBeNull()
      expect(getToolCapability('')).toBeNull()
    })
  })

  describe('countByCapability', () => {
    it('counts each capability', () => {
      const counts = countByCapability(['Read', 'read', 'Write', 'bash', 'TodoWrite', 'WebFetch'])

      expect(counts).toEqual({ read: 2, write: 1, execute: 1, plan: 0, todo: 1 })
    })
  })
})

describe('process_quality_score', () => {
  describe('scoring components', () => {
    // Pins the actual weights. Before this, the only assertion was that the property
    // existed, so every weight could change silently.
    //
    // Since v3 the score is a PERCENTAGE OF WHAT WAS APPLICABLE, not a flat sum. A session
    // that never wrote anything cannot demonstrate read-before-write, verification or
    // incremental work, so those 50 points leave the denominator instead of counting as
    // failures - which is why the two no-write cases below score higher than their raw
    // weights.
    it('awards plan mode 30 of the 50 points a no-write session can earn', async () => {
      expect((await score(['ExitPlanMode'])).process_quality_score).toBe(60)
    })

    it('awards todo tracking 20 of the 50 points a no-write session can earn', async () => {
      expect((await score(['TodoWrite'])).process_quality_score).toBe(40)
    })

    it('awards 25 for reading before writing', async () => {
      expect((await score(['Read', 'Write'])).process_quality_score).toBe(25)
    })

    it('awards a further 15 for verifying a write by executing something', async () => {
      // read + write (25) + execute + write (15)
      expect((await score(['Read', 'Write', 'Bash'])).process_quality_score).toBe(40)
    })

    it('awards 10 for an incremental number of writes', async () => {
      // read+write 25, execute+write 15, 2 writes in [2,5] 10
      expect((await score(['Read', 'Write', 'Edit', 'Bash'])).process_quality_score).toBe(50)
    })

    it('does not award the incremental bonus for a single write', async () => {
      expect((await score(['Read', 'Write', 'Bash'])).process_quality_score).toBe(40)
    })

    it('does not award the incremental bonus beyond five writes', async () => {
      const tools = ['Read', 'Bash', ...Array(6).fill('Write')]

      // read+write 25, execute+write 15, no incremental, read/write ratio is low
      expect((await score(tools)).process_quality_score).toBe(40)
    })

    it('penalises 10 for reading far more than writing', async () => {
      // 3 reads to 1 write is a ratio above 2: 25 + 15 - 10
      const tools = ['Read', 'Read', 'Read', 'Write', 'Bash']

      expect((await score(tools)).process_quality_score).toBe(30)
    })

    it('reaches 100 when every component is satisfied', async () => {
      const tools = ['ExitPlanMode', 'TodoWrite', 'Read', 'Write', 'Edit', 'Bash']

      expect((await score(tools)).process_quality_score).toBe(100)
    })

    it('never goes below zero', async () => {
      const tools = ['Read', 'Read', 'Read', 'Read']

      expect((await score(tools)).process_quality_score).toBe(0)
    })

    it('scores zero for a session with no meaningful tools', async () => {
      expect((await score(['WebFetch'])).process_quality_score).toBe(0)
    })
  })

  describe('provider independence', () => {
    // The behaviour is identical; only the vendor's naming convention differs. Before the
    // capability mapping, only the Claude Code column scored anything at all.
    const claude = ['Read', 'Glob', 'Write', 'Edit', 'Bash', 'TodoWrite']
    const opencode = ['read', 'glob', 'write', 'edit', 'bash', 'todowrite']
    const gemini = [
      'read_file',
      'list_directory',
      'write_file',
      'replace',
      'run_shell_command',
      'todo_write',
    ]

    it('scores equivalent sessions equally across providers', async () => {
      const [a, b, c] = await Promise.all([score(claude), score(opencode), score(gemini)])

      expect(b.process_quality_score).toBe(a.process_quality_score)
      expect(c.process_quality_score).toBe(a.process_quality_score)
    })

    it('detects todo tracking regardless of naming convention', async () => {
      expect((await score(['TodoWrite'])).used_todo_tracking).toBe(true)
      expect((await score(['todowrite'])).used_todo_tracking).toBe(true)
      expect((await score(['todo_write'])).used_todo_tracking).toBe(true)
    })

    it('detects plan mode regardless of naming convention', async () => {
      expect((await score(['ExitPlanMode'])).used_plan_mode).toBe(true)
      expect((await score(['exit_plan_mode'])).used_plan_mode).toBe(true)
      expect((await score(['update_plan'])).used_plan_mode).toBe(true)
    })
  })

  describe('versioning', () => {
    it('stamps the scorer version on every result', async () => {
      const result = await score(['Read', 'Write'])

      expect(result.metadata?.process_quality_scorer_version).toBe(
        PROCESS_QUALITY_SCORER_VERSION
      )
    })
  })

  describe('task_success_rate', () => {
    it('is the percentage of tool results without an error flag', async () => {
      expect((await score(['Read', 'Write', 'Bash', 'Edit'], [0])).task_success_rate).toBe(75)
    })

    it('is 100 when nothing failed', async () => {
      expect((await score(['Read', 'Write'])).task_success_rate).toBe(100)
    })
  })
})
