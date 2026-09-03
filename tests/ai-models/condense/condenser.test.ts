import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  condenseSession,
  DEFAULT_MAX_CHARS,
} from '../../../src/ai-models/condense/index.js'
import { CanonicalParser } from '../../../src/parsers/canonical/parser.js'
import { MOCK_SESSION, MOCK_SESSION_WITH_PHASES } from '../fixtures/canonical-fixtures.js'

const FIXTURE_DIR = join(__dirname, '../../fixtures/sessions')

function loadRealSession(name: string) {
  const content = readFileSync(join(FIXTURE_DIR, name), 'utf8')
  return new CanonicalParser().parseSession(content, 'claude-code')
}

describe('condenseSession', () => {
  describe('user-authored content', () => {
    it('keeps every user turn', () => {
      const result = condenseSession(MOCK_SESSION, { userName: 'Testy' })

      expect(result.text).toContain('Can you help me create a user authentication system?')
      expect(result.text).toContain('Great! Can you add password hashing?')
      expect(result.text).toContain('Perfect, thank you!')
      expect(result.userTurnCount).toBe(3)
    })

    it('keeps interruptions, which the canonical parser gives their own type', () => {
      // Filtering on `type === 'user'` - what all four tasks used to do - discards these.
      const result = condenseSession(MOCK_SESSION_WITH_PHASES, { userName: 'Testy' })

      expect(result.interruptionCount).toBe(1)
      expect(result.text).toContain('(interruption)')
    })

    it('keeps slash commands', () => {
      const result = condenseSession(MOCK_SESSION_WITH_PHASES, { userName: 'Testy' })

      expect(result.text).toContain('(command)')
      expect(result.text).toContain('/plan')
    })

    it('labels user turns with the supplied display name', () => {
      const result = condenseSession(MOCK_SESSION, { userName: 'Ada' })

      expect(result.text).toContain('Ada:')
    })
  })

  describe('tool handling', () => {
    it('strips tool inputs and outputs', () => {
      const result = condenseSession(MOCK_SESSION, { userName: 'Testy' })

      expect(result.text).not.toContain('export class User {}')
      expect(result.text).not.toContain('/auth/user.ts')
    })

    it('replaces tool calls with a count marker', () => {
      const result = condenseSession(MOCK_SESSION, { userName: 'Testy' })

      expect(result.text).toContain('[1 tool call: Write]')
      expect(result.text).toContain('[1 tool call: Edit]')
    })

    it('collapses consecutive tool calls into one marker', () => {
      const result = condenseSession(MOCK_SESSION_WITH_PHASES, { userName: 'Testy' })

      expect(result.text).toContain('[2 tool calls: Write, Bash')
    })

    it('reports tool usage counts for the whole session', () => {
      const result = condenseSession(MOCK_SESSION, { userName: 'Testy' })

      expect(result.uniqueToolCount).toBe(2)
      expect(result.toolUsage.map(t => t.name).sort()).toEqual(['Edit', 'Write'])
    })

    it('counts failed tool results', () => {
      const result = condenseSession(MOCK_SESSION_WITH_PHASES, { userName: 'Testy' })

      expect(result.toolErrorCount).toBe(1)
      expect(result.toolUsage.find(t => t.name === 'Bash')?.errorCount).toBe(1)
    })

    it('does not emit a marker for a run with no named tools', () => {
      expect(condenseSession(MOCK_SESSION, { userName: 'Testy' }).text).not.toContain(
        '[0 tool calls'
      )
    })
  })

  describe('conversation-bearing tools', () => {
    it('keeps the plan from ExitPlanMode', () => {
      // "Strip all tool calls" would delete the plan, which is the single most
      // informative thing in a planning session.
      const result = condenseSession(MOCK_SESSION_WITH_PHASES, { userName: 'Testy' })

      expect(result.text).toContain('[Plan presented to the user]')
      expect(result.text).toContain('Define the Post model')
    })

    it('keeps todo list contents', () => {
      const result = condenseSession(MOCK_SESSION_WITH_PHASES, { userName: 'Testy' })

      expect(result.text).toContain('[Todo list]')
      expect(result.text).toContain('Add CRUD routes')
    })

    it('renders an AskUserQuestion and the answer', () => {
      // Built inline so the question/answer pair is unambiguous.
      const parser = new CanonicalParser()
      const jsonl = [
        {
          uuid: 'u1',
          timestamp: '2025-01-01T00:00:00Z',
          type: 'user',
          sessionId: 'q',
          provider: 'claude-code',
          message: { role: 'user', content: 'Set up auth' },
        },
        {
          uuid: 'u2',
          timestamp: '2025-01-01T00:00:10Z',
          type: 'assistant',
          sessionId: 'q',
          provider: 'claude-code',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'q1',
                name: 'AskUserQuestion',
                input: {
                  questions: [
                    { question: 'Which auth method?', options: [{ label: 'OAuth' }, { label: 'JWT' }] },
                  ],
                },
              },
            ],
          },
        },
        {
          uuid: 'u3',
          timestamp: '2025-01-01T00:00:20Z',
          type: 'user',
          sessionId: 'q',
          provider: 'claude-code',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'q1', content: 'User chose OAuth' }],
          },
        },
      ]
        .map(l => JSON.stringify(l))
        .join('\n')

      const result = condenseSession(
        parser.parseSession(jsonl, 'claude-code') as never,
        { userName: 'Testy' }
      )

      expect(result.text).toContain('[Question asked of the user]')
      expect(result.text).toContain('Which auth method?')
      expect(result.text).toContain('OAuth')
      expect(result.text).toContain('Testy (answer)')
    })

    it('does not render TodoWrite acknowledgements as user replies', () => {
      // The result text is boilerplate; presenting it as a user turn fabricates input.
      const result = condenseSession(MOCK_SESSION_WITH_PHASES, { userName: 'Testy' })

      expect(result.text).not.toContain('Testy (answer):\nTodos updated')
    })

    it('respects a custom allowlist', () => {
      const result = condenseSession(MOCK_SESSION_WITH_PHASES, {
        userName: 'Testy',
        keepToolPayloadsFor: [],
      })

      expect(result.text).not.toContain('[Plan presented to the user]')
    })
  })

  describe('step indices', () => {
    it('uses original message indices, not renumbered ones', () => {
      // Phase analysis maps startStep/endStep back onto the real message list, so
      // renumbering would silently misalign every phase boundary in the UI.
      const result = condenseSession(MOCK_SESSION, { userName: 'Testy' })

      expect(result.text).toContain('Step 1 ')
      expect(result.text).toContain('Step 9 ')
      expect(result.includedIndices[0]).toBe(1)
      expect(Math.max(...result.includedIndices)).toBeLessThanOrEqual(
        MOCK_SESSION.messages.length
      )
    })

    it('returns indices in ascending order', () => {
      const { includedIndices } = condenseSession(MOCK_SESSION_WITH_PHASES, { userName: 'T' })
      const sorted = [...includedIndices].sort((a, b) => a - b)

      expect(includedIndices).toEqual(sorted)
    })

    it('marks gaps where messages were removed', () => {
      const result = condenseSession(MOCK_SESSION_WITH_PHASES, { userName: 'Testy' })

      expect(result.text).toContain('message(s) omitted')
    })
  })

  describe('budget', () => {
    /**
     * Generate a session large enough to force eviction. Shaped from real sessions
     * measured on disk: roughly 40% tool calls, long assistant prose, and a plan in the
     * 11k-26k character range that real ExitPlanMode payloads occupy.
     */
    function generateLargeSession(messageCount: number) {
      const lines: string[] = []
      let t = Date.parse('2025-01-01T00:00:00Z')
      const push = (type: string, content: unknown) => {
        t += 5000
        lines.push(
          JSON.stringify({
            uuid: `u${lines.length}`,
            timestamp: new Date(t).toISOString(),
            type,
            sessionId: 'big',
            provider: 'claude-code',
            message: { role: type, content },
          })
        )
      }

      push('user', `Initial request. ${'context '.repeat(200)}`)
      push('assistant', [
        { type: 'tool_use', id: 'plan', name: 'ExitPlanMode', input: { plan: 'P'.repeat(20_000) } },
      ])
      push('user', [{ type: 'tool_result', tool_use_id: 'plan', content: 'approved' }])

      for (let i = 0; i < messageCount; i++) {
        push('assistant', [{ type: 'text', text: `Step ${i}: ${'detail '.repeat(120)}` }])
        push('assistant', [
          { type: 'tool_use', id: `t${i}`, name: 'Bash', input: { command: 'x'.repeat(3000) } },
        ])
        push('user', [
          { type: 'tool_result', tool_use_id: `t${i}`, content: 'output '.repeat(500) },
        ])
        if (i % 20 === 0) push('user', `Follow-up question number ${i}`)
      }

      push('user', 'FINAL_USER_TURN: is it done?')
      push('assistant', [{ type: 'text', text: 'FINAL_ASSISTANT_TURN: yes, complete.' }])

      return new CanonicalParser().parseSession(lines.join('\n'), 'claude-code') as never
    }

    it('stays within the default budget on a very large session', () => {
      const result = condenseSession(generateLargeSession(400), { userName: 'Testy' })

      expect(result.estimatedChars).toBeLessThanOrEqual(DEFAULT_MAX_CHARS + result.planChars)
      expect(result.truncated).toBe(true)
    })

    it('respects a custom budget', () => {
      const result = condenseSession(generateLargeSession(200), {
        userName: 'Testy',
        maxChars: 10_000,
      })

      expect(result.estimatedChars - result.planChars).toBeLessThanOrEqual(10_000)
    })

    it('keeps the END of the session, not just the beginning', () => {
      // The regression this whole change exists to fix: the summary task kept only the
      // first ten messages, so "was the work completed?" was unanswerable.
      const result = condenseSession(generateLargeSession(400), { userName: 'Testy' })

      expect(result.text).toContain('FINAL_USER_TURN')
    })

    it('keeps the first user turn as well', () => {
      const result = condenseSession(generateLargeSession(400), { userName: 'Testy' })

      expect(result.text).toContain('Initial request')
    })

    it('keeps a large plan verbatim, budget notwithstanding', () => {
      // Plans are the agreed statement of intent and scope - the most information-dense
      // artefact in a session - so they are reproduced in full and exempted from the
      // ceiling rather than competing with the rest of the transcript for room.
      const result = condenseSession(generateLargeSession(400), { userName: 'Testy' })

      expect(result.text).toContain('[Plan presented to the user]')
      expect(result.text).toContain('P'.repeat(20_000))
      expect(result.planChars).toBeGreaterThan(20_000)
    })

    it('still bounds non-plan content when a plan is present', () => {
      const result = condenseSession(generateLargeSession(400), { userName: 'Testy' })

      expect(result.estimatedChars - result.planChars).toBeLessThanOrEqual(DEFAULT_MAX_CHARS)
    })

    it('never drops user turns to fit the budget', () => {
      const session = generateLargeSession(400)
      const authored = session.messages.filter(m =>
        ['user', 'user_input', 'interruption', 'command', 'compact'].includes(m.type)
      ).length
      const result = condenseSession(session, { userName: 'Testy' })

      expect(result.userTurnCount).toBe(authored)
    })
  })

  describe('real sessions', () => {
    it.each(['claude-code-sample-1.jsonl', 'claude-code-sample-2.jsonl'])(
      'condenses %s to a small fraction of its raw size',
      name => {
        const raw = readFileSync(join(FIXTURE_DIR, name), 'utf8')
        const result = condenseSession(loadRealSession(name) as never, { userName: 'Clifton' })

        // Measured on real transcripts: conversation text is well under 1% of the bytes.
        expect(result.estimatedChars).toBeLessThan(raw.length / 10)
        expect(result.estimatedChars).toBeGreaterThan(0)
      }
    )

    it('recovers tool usage the old extraction always reported as zero', () => {
      // The task code read `msg.type === 'assistant'`, but the canonical parser emits
      // tool uses as their own `tool_use` messages.
      const result = condenseSession(loadRealSession('claude-code-sample-1.jsonl') as never, {
        userName: 'Clifton',
      })

      expect(result.uniqueToolCount).toBeGreaterThan(0)
      expect(result.toolUsage.some(t => t.name === 'Bash')).toBe(true)
    })

    it('recovers interruptions the old extraction always reported as zero', () => {
      const result = condenseSession(loadRealSession('claude-code-sample-1.jsonl') as never, {
        userName: 'Clifton',
      })

      expect(result.interruptionCount).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('handles a session with no messages', () => {
      const result = condenseSession(
        { ...MOCK_SESSION, messages: [] } as never,
        { userName: 'Testy' }
      )

      expect(result.text).toBe('')
      expect(result.totalMessages).toBe(0)
      expect(result.userTurnCount).toBe(0)
    })

    it('skips meta messages', () => {
      const jsonl = [
        {
          uuid: 'm1',
          timestamp: '2025-01-01T00:00:00Z',
          type: 'meta',
          sessionId: 's',
          provider: 'claude-code',
          message: { role: 'assistant', content: 'Session started' },
          isMeta: true,
        },
        {
          uuid: 'm2',
          timestamp: '2025-01-01T00:00:05Z',
          type: 'user',
          sessionId: 's',
          provider: 'claude-code',
          message: { role: 'user', content: 'Hello' },
        },
      ]
        .map(l => JSON.stringify(l))
        .join('\n')
      const session = new CanonicalParser().parseSession(jsonl, 'claude-code')
      const result = condenseSession(session as never, { userName: 'Testy' })

      expect(result.text).not.toContain('Session started')
      expect(result.text).toContain('Hello')
    })

    it('strips system reminders from user text', () => {
      const jsonl = JSON.stringify({
        uuid: 'r1',
        timestamp: '2025-01-01T00:00:00Z',
        type: 'user',
        sessionId: 's',
        provider: 'claude-code',
        message: {
          role: 'user',
          content: 'Real request<system-reminder>injected machinery</system-reminder>',
        },
      })
      const session = new CanonicalParser().parseSession(jsonl, 'claude-code')
      const result = condenseSession(session as never, { userName: 'Testy' })

      expect(result.text).toContain('Real request')
      expect(result.text).not.toContain('injected machinery')
    })
  })
})
