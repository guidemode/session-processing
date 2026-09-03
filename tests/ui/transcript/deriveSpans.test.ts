import { beforeEach, describe, expect, it } from 'vitest'
import { deriveSpans } from '../../../src/ui/utils/transcript/deriveSpans.js'
import {
  isEventSpan,
  isMetaSpan,
  isToolSpan,
  type ToolSpan,
} from '../../../src/ui/utils/transcript/spanTypes.js'
import {
  assistant,
  at,
  compact,
  human,
  interruption,
  meta,
  normalize,
  resetIds,
  toolPair,
  toolResult,
  toolUse,
} from './fixtures/messages.js'

beforeEach(resetIds)

/** Shorthand: the (kind, size) shape of a derived transcript. */
function shape(spans: ReturnType<typeof deriveSpans>['spans']) {
  return spans.map(span => {
    if (isToolSpan(span)) return `tools:${span.calls.length}`
    if (isMetaSpan(span)) return `meta:${span.records.length}`
    if (isEventSpan(span)) return `event:${span.eventKind}`
    return span.kind
  })
}

describe('deriveSpans', () => {
  it('returns an empty model for no messages', () => {
    const { spans, summary } = deriveSpans([])
    expect(spans).toEqual([])
    expect(summary.records).toBe(0)
    expect(summary.strip).toEqual([])
  })

  it('emits one span for a single human message', () => {
    const { spans } = deriveSpans(normalize([human('do the thing')]))
    expect(shape(spans)).toEqual(['human'])
    expect(spans[0].index).toBe(0)
  })

  it('collapses three contiguous tool pairs into one span', () => {
    const messages = normalize([
      ...toolPair('Bash', { command: 'ls' }, 't1', { at: 0 }),
      ...toolPair('Bash', { command: 'pwd' }, 't2', { at: 2 }),
      ...toolPair('Read', { file_path: '/a/b.ts' }, 't3', { at: 4 }),
    ])
    const { spans } = deriveSpans(messages)
    expect(shape(spans)).toEqual(['tools:3'])

    const span = spans[0] as ToolSpan
    expect(span.stats.callCount).toBe(3)
    expect(span.stats.resultCount).toBe(3)
    expect(span.stats.errorCount).toBe(0)
    // Sorted by count desc, then name asc.
    expect(span.stats.histogram).toEqual([
      { toolName: 'Bash', count: 2 },
      { toolName: 'Read', count: 1 },
    ])
  })

  it('splits a tool run at an assistant message', () => {
    const messages = normalize([
      ...toolPair('Bash', { command: 'ls' }, 't1', { at: 0 }),
      assistant('Now let me read it.', at(2)),
      ...toolPair('Read', { file_path: '/a.ts' }, 't2', { at: 3 }),
    ])
    expect(shape(deriveSpans(messages).spans)).toEqual(['tools:1', 'assistant', 'tools:1'])
  })

  it('splits a tool run at a meta record, and merges it when meta is prefiltered', () => {
    const raw = [
      ...toolPair('Bash', { command: 'ls' }, 't1', { at: 0 }),
      meta('file-history-snapshot', at(2)),
      ...toolPair('Bash', { command: 'pwd' }, 't2', { at: 3 }),
    ]
    expect(shape(deriveSpans(normalize(raw)).spans)).toEqual(['tools:1', 'meta:1', 'tools:1'])

    // This is why filtering must happen BEFORE derivation.
    const withoutMeta = normalize(raw).filter(m => m.originalMessage.type !== 'meta')
    expect(shape(deriveSpans(withoutMeta).spans)).toEqual(['tools:2'])
  })

  it('marks a call with no result as pending', () => {
    const { spans } = deriveSpans(normalize([toolUse('Bash', { command: 'sleep 5' }, 't1', at(0))]))
    const span = spans[0] as ToolSpan
    expect(span.calls[0].status).toBe('pending')
    expect(span.calls[0].durationMs).toBeNull()
    expect(span.stats.pendingCount).toBe(1)
    expect(span.stats.resultCount).toBe(0)
  })

  it('keeps an orphan tool result as a call rather than dropping it', () => {
    const { spans } = deriveSpans(normalize([toolResult('missing', 'stray output', at(0))]))
    const span = spans[0] as ToolSpan
    expect(span.calls).toHaveLength(1)
    expect(span.calls[0].useMessage).toBeNull()
    expect(span.calls[0].resultMessage).not.toBeNull()
  })

  it('absorbs a late subagent result into its originating span, with no phantom span', () => {
    const messages = normalize([
      toolUse('Agent', { description: 'Explore' }, 'agent-1', at(0)),
      assistant('Waiting on the agent.', at(1)),
      ...toolPair('Bash', { command: 'ls' }, 't1', { at: 2 }),
      // The agent's result lands long after its call.
      toolResult('agent-1', 'agent finished', at(60)),
    ])
    const { spans } = deriveSpans(messages)

    // Exactly two tool spans — the late result must not open a third.
    expect(shape(spans)).toEqual(['tools:1', 'assistant', 'tools:1'])

    const agentSpan = spans[0] as ToolSpan
    expect(agentSpan.calls[0].status).toBe('ok')
    expect(agentSpan.calls[0].durationMs).toBe(60_000)
    // Span elapsed covers the wait for the late result.
    expect(agentSpan.stats.elapsedMs).toBe(60_000)
  })

  it('matches two concurrent agents by id and orders calls by tool_use position', () => {
    const messages = normalize([
      toolUse('Agent', { description: 'First' }, 'a1', at(0)),
      toolUse('Agent', { description: 'Second' }, 'a2', at(1)),
      // Results arrive out of order.
      toolResult('a2', 'second done', at(10)),
      toolResult('a1', 'first done', at(20)),
    ])
    const { spans } = deriveSpans(messages)
    expect(shape(spans)).toEqual(['tools:2'])

    const span = spans[0] as ToolSpan
    expect(span.calls.map(call => call.label)).toEqual(['First', 'Second'])
    expect(span.calls[0].durationMs).toBe(20_000)
    expect(span.calls[1].durationMs).toBe(9_000)
  })

  it('counts both explicit is_error and a user rejection as errors', () => {
    const messages = normalize([
      ...toolPair('Bash', { command: 'bad' }, 't1', { at: 0, isError: true }),
      toolUse('Edit', { file_path: '/a.ts' }, 't2', at(2)),
      toolResult('t2', "The user doesn't want to proceed with this tool use", at(3)),
    ])
    const span = deriveSpans(messages).spans[0] as ToolSpan
    expect(span.stats.errorCount).toBe(2)
    expect(span.calls.every(call => call.status === 'error')).toBe(true)
  })

  it('does not treat content that merely quotes an error phrase as a failure', () => {
    // Regression: an approved plan that discusses rejection was counted as an error,
    // which both mislabelled the plan and inflated the session's error count.
    const messages = normalize([
      toolUse('Bash', { command: 'ls' }, 't1', at(0)),
      toolResult('t1', 'Docs say: The user doesn\'t want to proceed with this tool use.', at(1)),
    ])
    const span = deriveSpans(messages).spans[0] as ToolSpan
    expect(span.stats.errorCount).toBe(0)
    expect(span.calls[0].status).toBe('ok')
  })

  it('marks a plan approved even when the plan text itself says "rejected"', () => {
    const messages = normalize([
      toolUse('ExitPlanMode', { plan: 'If rejected, we stop.' }, 'plan-1', at(0)),
      toolResult(
        'plan-1',
        "User has approved your plan.\n\n## Approved Plan:\nIf rejected, we stop. The user doesn't want to proceed with this tool use is an error marker.",
        at(1)
      ),
    ])
    const event = deriveSpans(messages).spans[0]
    if (!isEventSpan(event) || event.payload === null || !('plan' in event.payload)) {
      throw new Error('expected a plan payload')
    }
    expect(event.payload.outcome).toBe('approved')
  })

  it('still recognises a genuine rejection', () => {
    const messages = normalize([
      toolUse('ExitPlanMode', { plan: 'Do it.' }, 'plan-2', at(0)),
      toolResult('plan-2', "The user doesn't want to proceed with this tool use.", at(1)),
    ])
    const event = deriveSpans(messages).spans[0]
    if (!isEventSpan(event) || event.payload === null || !('plan' in event.payload)) {
      throw new Error('expected a plan payload')
    }
    expect(event.payload.outcome).toBe('rejected')
  })

  it('lifts ExitPlanMode out of a tool run and parses the plan', () => {
    const messages = normalize([
      ...toolPair('Bash', { command: 'ls' }, 't1', { at: 0 }),
      toolUse('ExitPlanMode', { plan: '# Plan\n\nDo the thing.' }, 'plan-1', at(2)),
      toolResult('plan-1', 'User has approved your plan.', at(3)),
      ...toolPair('Edit', { file_path: '/a.ts' }, 't2', { at: 4 }),
    ])
    const { spans } = deriveSpans(messages)
    expect(shape(spans)).toEqual(['tools:1', 'event:plan', 'tools:1'])

    const event = spans[1]
    if (!isEventSpan(event)) throw new Error('expected an event span')
    expect(event.payload).toEqual({ plan: '# Plan\n\nDo the thing.', outcome: 'approved' })
    // The plan's result belongs to the event, not to either tool span.
    expect((spans[0] as ToolSpan).stats.callCount).toBe(1)
    expect((spans[2] as ToolSpan).stats.callCount).toBe(1)
  })

  it('parses AskUserQuestion, including a missing questions array', () => {
    const messages = normalize([
      toolUse(
        'AskUserQuestion',
        {
          questions: [
            {
              header: 'Scope',
              question: 'Replace or add?',
              multiSelect: false,
              options: [
                { label: 'Replace it', description: 'swap outright' },
                { label: 'Add alongside', description: 'keep both' },
              ],
            },
          ],
        },
        'q1',
        at(0)
      ),
      toolResult('q1', 'Your questions have been answered: "Replace or add?"="Replace it"', at(1)),
    ])
    const event = deriveSpans(messages).spans[0]
    if (!isEventSpan(event) || event.payload === null || !('questions' in event.payload)) {
      throw new Error('expected a question payload')
    }
    expect(event.payload.questions[0].options.map(o => o.chosen)).toEqual([true, false])

    resetIds()
    const empty = deriveSpans(normalize([toolUse('AskUserQuestion', {}, 'q2', at(0))])).spans[0]
    if (!isEventSpan(empty) || empty.payload === null || !('questions' in empty.payload)) {
      throw new Error('expected a question payload')
    }
    expect(empty.payload.questions).toEqual([])
  })

  it('splits tool runs at an interruption, and treats compact as an event not meta', () => {
    const messages = normalize([
      ...toolPair('Bash', { command: 'ls' }, 't1', { at: 0 }),
      interruption(at(2)),
      ...toolPair('Bash', { command: 'pwd' }, 't2', { at: 3 }),
      compact(at(6)),
    ])
    expect(shape(deriveSpans(messages).spans)).toEqual([
      'tools:1',
      'event:interruption',
      'tools:1',
      'event:compact',
    ])
  })

  it('never produces NaN from malformed or out-of-order timestamps', () => {
    const messages = normalize([
      toolUse('Bash', { command: 'ls' }, 't1', 'not-a-date'),
      toolResult('t1', 'ok', 'also-not-a-date'),
    ])
    const span = deriveSpans(messages).spans[0] as ToolSpan
    expect(span.stats.elapsedMs).toBe(0)
    expect(span.calls[0].durationMs).toBeNull()

    resetIds()
    // Clock skew: the result claims to predate the call.
    const skewed = normalize([
      toolUse('Bash', { command: 'ls' }, 't2', at(10)),
      toolResult('t2', 'ok', at(0)),
    ])
    const skewedSpan = deriveSpans(skewed).spans[0] as ToolSpan
    expect(skewedSpan.calls[0].durationMs).toBe(0)
    expect(skewedSpan.stats.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('is independent of display order, and loses no messages', () => {
    const messages = normalize([
      human('go', at(0)),
      assistant('sure', at(1)),
      ...toolPair('Bash', { command: 'ls' }, 't1', { at: 2 }),
      meta('summary', at(5)),
      ...toolPair('Read', { file_path: '/a.ts' }, 't2', { at: 6 }),
    ])
    const { spans, summary } = deriveSpans(messages)

    // Derivation ignores order entirely; reversing twice is identity.
    expect(JSON.stringify(shape(spans))).toEqual(JSON.stringify(shape(deriveSpans(messages).spans)))
    expect([...spans].reverse().reverse()).toEqual(spans)

    // Every input message is owned by exactly one span.
    const owned = spans.flatMap(span => span.messageIds)
    expect(owned).toHaveLength(messages.length)
    expect(new Set(owned).size).toBe(messages.length)
    expect(new Set(owned)).toEqual(new Set(messages.map(m => m.id)))

    // Summary is consistent with the model.
    expect(summary.records).toBe(messages.length)
    expect(summary.strip).toHaveLength(spans.length)
    expect(summary.human).toBe(1)
    expect(summary.toolCalls).toBe(2)
  })

  it('populates aiLabel from a label provider without touching the deterministic label', () => {
    const messages = normalize(toolPair('Bash', { command: 'ls' }, 't1', { at: 0 }))
    const { spans } = deriveSpans(messages, {
      labelProvider: { labelFor: () => 'Checked the working tree' },
    })
    const span = spans[0] as ToolSpan
    expect(span.aiLabel).toBe('Checked the working tree')
    expect(span.label).toBe('1 Bash command')
  })
})
