/**
 * Regression tests for five session metrics that were wrong by construction.
 *
 * Each case here corresponds to a defect measured against 913 real Claude Code session
 * files, not to a hypothetical. The numbers in the comments are what those sessions
 * actually produced.
 */

import type { ContextManagementMetrics, EngagementMetrics, QualityMetrics, UsageMetrics } from '@guidemode/types'
import { describe, expect, it } from 'vitest'
import { CanonicalParser } from '../../../src/parsers/canonical/parser.js'
import { CanonicalContextProcessor } from '../../../src/processors/canonical/metrics/context.js'
import { CanonicalEngagementProcessor } from '../../../src/processors/canonical/metrics/engagement.js'
import { CanonicalQualityProcessor } from '../../../src/processors/canonical/metrics/quality.js'
import { getToolCapability } from '../../../src/processors/canonical/metrics/tool-capabilities.js'
import { CanonicalUsageProcessor } from '../../../src/processors/canonical/metrics/usage.js'

const parser = new CanonicalParser()

let seq = 0
function line(entry: Record<string, unknown>): string {
  seq += 1
  return JSON.stringify({
    uuid: `u${seq}`,
    timestamp: `2025-01-01T00:00:${String(seq % 60).padStart(2, '0')}Z`,
    sessionId: 's',
    provider: 'test',
    ...entry,
  })
}

const userText = (text: string, extra: Record<string, unknown> = {}) =>
  line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, ...extra })

const assistantText = (text: string) =>
  line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })

const assistantTool = (name: string, input: Record<string, unknown> = {}) =>
  line({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: `t${seq}`, name, input }] },
  })

const toolResult = (content: string) =>
  line({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: `t${seq}`, content, is_error: false }],
    },
  })

const parse = (lines: string[]) => parser.parseSession(lines.join('\n'), 'test')

describe('avg tokens per message', () => {
  const usageLine = (
    requestId: string,
    usage: Record<string, number>,
    uuid = `m${Math.random()}`
  ) =>
    JSON.stringify({
      uuid,
      timestamp: '2025-01-01T00:00:01Z',
      sessionId: 's',
      provider: 'test',
      type: 'assistant',
      requestId,
      message: {
        role: 'assistant',
        model: 'claude-opus-5',
        content: [{ type: 'text', text: 'hi' }],
        usage,
      },
    })

  it('does not collapse to the uncached delta', async () => {
    // The defect: with prompt caching `input_tokens` is a handful of tokens once the
    // conversation is warm. Averaging it alone returned the constant 2 on every one of
    // twelve real sessions.
    const session = parse([
      usageLine('r1', {
        input_tokens: 2,
        cache_creation_input_tokens: 3000,
        cache_read_input_tokens: 150000,
        output_tokens: 500,
      }),
    ])

    const result = (await new CanonicalContextProcessor().process(
      session
    )) as ContextManagementMetrics

    // input + cache_creation + output = the material this turn added.
    expect(result.avg_tokens_per_message).toBe(3502)
  })

  it('excludes cache reads, which are the whole conversation re-sent', async () => {
    const withHugeCacheRead = parse([
      usageLine('r1', { input_tokens: 10, cache_read_input_tokens: 900000, output_tokens: 90 }),
    ])

    const result = (await new CanonicalContextProcessor().process(
      withHugeCacheRead
    )) as ContextManagementMetrics

    // Counting cache reads would report ~900k - average window occupancy, not per-message.
    expect(result.avg_tokens_per_message).toBe(100)
  })

  it('counts one API request once even when its usage repeats across lines', async () => {
    // Claude Code writes several JSONL lines per response, each repeating the same usage.
    const session = parse([
      usageLine('same-request', { input_tokens: 100, output_tokens: 100 }, 'a'),
      usageLine('same-request', { input_tokens: 100, output_tokens: 100 }, 'b'),
      usageLine('same-request', { input_tokens: 100, output_tokens: 100 }, 'c'),
    ])

    const result = (await new CanonicalContextProcessor().process(
      session
    )) as ContextManagementMetrics

    expect(result.avg_tokens_per_message).toBe(200)
  })
})

describe('interruption rate', () => {
  const engagement = (lines: string[]) =>
    new CanonicalEngagementProcessor().process(parse(lines)) as Promise<EngagementMetrics>

  it('detects the plain marker in a user text block', async () => {
    const result = await engagement([
      userText('do the thing'),
      assistantText('working'),
      userText('[Request interrupted by user]'),
    ])

    expect(result.total_interruptions).toBe(1)
  })

  it('detects the marker inside a tool_result, which the parser types tool_result', async () => {
    // This form was previously invisible: `determineMessageType` returns 'tool_result'
    // before it ever reaches the interruption check.
    const result = await engagement([
      userText('do the thing'),
      assistantTool('Bash'),
      toolResult('[Request interrupted by user for tool use]'),
    ])

    expect(result.total_interruptions).toBe(1)
  })

  it('counts one ESC once when it emits both markers', async () => {
    const result = await engagement([
      userText('do the thing'),
      assistantTool('Bash'),
      toolResult('[Request interrupted by user for tool use]'),
      userText('[Request interrupted by user]'),
    ])

    expect(result.total_interruptions).toBe(1)
  })

  it('ignores prose that merely contains the old keywords', async () => {
    // These four substrings produced 74 false positives across 36 real sessions.
    const result = await engagement([
      userText('do the thing'),
      assistantText('ok'),
      userText("I'll wait for the agents to finish"),
      assistantText('ok'),
      userText('check the stop_reason field'),
      assistantText('ok'),
      userText('actually that worked nicely'),
      assistantText('ok'),
      userText('cancel culture is not the topic here'),
    ])

    expect(result.total_interruptions).toBe(0)
    expect(result.interruption_rate).toBe(0)
  })

  it('does not fire on tool output that merely quotes the marker', async () => {
    // The trap this metric fell into: a session that greps for the marker, or reads the
    // file defining it, fills its own tool results with the phrase. One real session
    // contained it 21 times and was interrupted twice.
    const result = await engagement([
      userText('search for interruption handling'),
      assistantTool('Bash'),
      toolResult(
        "BaseParser.ts:188: text.includes('[Request interrupted by user]') || text.includes(...)"
      ),
      assistantTool('Bash'),
      toolResult('grep found: [Request interrupted by user] appears 184 times'),
    ])

    expect(result.total_interruptions).toBe(0)
  })

  it('does not treat consecutive user messages as interruptions', async () => {
    // This rule alone produced 105 false positives across 36 real sessions.
    const result = await engagement([userText('first'), userText('second'), userText('third')])

    expect(result.total_interruptions).toBe(0)
  })

  it('never exceeds 100% when interruptions outnumber prompts', async () => {
    // A real session had 4 interruptions against 3 prompts and reported 133%.
    const result = await engagement([
      userText('one'),
      userText('[Request interrupted by user]'),
      userText('[Request interrupted by user]'),
    ])

    // 2 interruptions among 3 real inputs. Not collapsed: they are separate ESC presses,
    // not the tool_result/text double-emission.
    expect(result.interruption_rate).toBeLessThanOrEqual(100)
    expect(result.interruption_rate).toBe(67)
  })
})

describe('input clarity', () => {
  const clarity = async (texts: string[]) => {
    const lines = texts.flatMap(t => [userText(t), assistantText('ok')])
    const result = (await new CanonicalUsageProcessor().process(parse(lines))) as UsageMetrics
    return result.input_clarity_score
  }

  it('does not let one long vague message drown a short precise one', async () => {
    const precise = 'fix `parseSession()` in src/parsers/canonical/parser.ts:446'
    const vague = `${'just make the thing a bit better than it currently is '.repeat(20)}`

    const together = await clarity([precise, vague])
    const vagueAlone = await clarity([vague])

    // Pooled, the vague message's word count swamped the precise one's markers.
    expect(together).toBeGreaterThan(vagueAlone * 2)
  })

  it('does not penalise a thorough prompt for being long', async () => {
    const short = 'fix src/a.ts'
    const detailed = `fix src/a.ts and src/b.ts, specifically parseThing() and renderThing(),
      following the pattern in src/c.ts:120 - see @docs/guide.md for the interface`

    expect(await clarity([detailed])).toBeGreaterThan(await clarity([short]) / 2)
  })

  it('ignores harness-injected blocks, which are not the developer writing', async () => {
    // A task notification is dense with paths and ids; counting it inflated two real
    // sessions from 9 and 12 up to 47 and 42.
    const injected =
      '<task-notification><task-id>abc</task-id><output-file>/tmp/x/y.output</output-file></task-notification>'

    const lines = [userText(`${injected} just make it nicer please`), assistantText('ok')]
    const result = (await new CanonicalUsageProcessor().process(parse(lines))) as UsageMetrics

    const withoutInjection = (await new CanonicalUsageProcessor().process(
      parse([userText('just make it nicer please'), assistantText('ok')])
    )) as UsageMetrics

    expect(result.input_clarity_score).toBe(withoutInjection.input_clarity_score)
  })

  it('scores zero when there are no user messages', async () => {
    const result = (await new CanonicalUsageProcessor().process(
      parse([assistantText('hello')])
    )) as UsageMetrics

    expect(result.input_clarity_score).toBe(0)
  })
})

describe('task tracking', () => {
  const quality = (lines: string[]) =>
    new CanonicalQualityProcessor().process(parse(lines)) as Promise<QualityMetrics>

  it('recognises TaskCreate and TaskUpdate as progress tracking', () => {
    expect(getToolCapability('TaskCreate')).toBe('todo')
    expect(getToolCapability('TaskUpdate')).toBe('todo')
  })

  it('no longer miscounts TaskCreate as a write', () => {
    // `taskcreate` contains "create", so it used to fall through to the write rule and
    // inflate read/write ratio across 584 sessions.
    expect(getToolCapability('TaskCreate')).not.toBe('write')
  })

  it('leaves background-subagent control tools unclassified', () => {
    expect(getToolCapability('TaskStop')).toBeNull()
    expect(getToolCapability('TaskOutput')).toBeNull()
  })

  it('marks a TaskCreate session as tracking progress', async () => {
    const result = await quality([userText('go'), assistantTool('TaskCreate'), toolResult('ok')])

    expect(result.used_todo_tracking).toBe(true)
  })

  it('accepts a written plan file, since current clients ship no task tool', async () => {
    const result = await quality([
      userText('go'),
      assistantTool('Write', { file_path: '/Users/me/.claude/plans/some-plan.md' }),
      toolResult('ok'),
    ])

    expect(result.used_todo_tracking).toBe(true)
  })

  it('does not count an ordinary file write as progress tracking', async () => {
    const result = await quality([
      userText('go'),
      assistantTool('Write', { file_path: '/Users/me/work/src/index.ts' }),
      toolResult('ok'),
    ])

    expect(result.used_todo_tracking).toBe(false)
  })
})

describe('iteration count', () => {
  const iterations = async (lines: string[]) => {
    const result = (await new CanonicalQualityProcessor().process(parse(lines))) as QualityMetrics
    return result.iteration_count
  }

  it('does not fire on "rather than" or "instead of", which are specifications', async () => {
    // These two phrases produced 28 of 42 pattern hits across 36 real sessions, almost
    // all of them specifications rather than corrections.
    expect(
      await iterations([userText('use Drizzle rather than Prisma, and pnpm instead of npm')])
    ).toBe(0)
  })

  it('does not count the opening prompt of a session', async () => {
    expect(await iterations([userText('build me a thing'), assistantText('ok')])).toBe(0)
  })

  it('counts a prompt sent after the AI has produced work', async () => {
    expect(
      await iterations([userText('go'), assistantText('done'), userText('now do the next bit')])
    ).toBe(1)
  })

  it('counts a follow-up that arrives after a tool-using reply', async () => {
    // The adjacency test used to require type 'assistant', which the parser re-types to
    // 'tool_use' whenever the reply contained a tool call - and a follow-up typed during
    // tool use arrives after the tool_result, not after the assistant message.
    expect(
      await iterations([
        userText('go'),
        assistantTool('Read'),
        toolResult('ok'),
        userText('use the other file'),
      ])
    ).toBe(1)
  })

  it('does not count consecutive prompts sent before the AI replies', async () => {
    // Two thoughts typed in a row are one round, not two.
    expect(
      await iterations([
        userText('go'),
        assistantText('done'),
        userText('now this'),
        userText('and also this'),
      ])
    ).toBe(1)
  })

  it('does not count interruptions, which are reported separately', async () => {
    expect(
      await iterations([
        userText('go'),
        assistantText('working'),
        userText('[Request interrupted by user]'),
      ])
    ).toBe(0)
  })
})
