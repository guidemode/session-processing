import { describe, expect, it } from 'vitest'
import type { ParsedMessage, ParsedSession } from '../../../src/parsers/base/types.js'
import { attributeTokens } from '../../../src/processors/canonical/metrics/token-attribution.js'

interface UsageInput {
  input?: number
  output?: number
  cacheCreation?: number
  cacheRead?: number
  /** Portion of `cacheCreation` written with a 1-hour TTL. */
  cacheCreation1h?: number
  reasoning?: number
}

function message(
  id: string,
  opts: { model?: string; requestId?: string; usage?: UsageInput } = {}
): ParsedMessage {
  const { usage } = opts
  return {
    id,
    timestamp: new Date('2026-09-01T00:00:00Z'),
    type: 'assistant',
    content: 'x',
    metadata: {
      model: opts.model,
      requestId: opts.requestId,
      usage: usage
        ? {
            input_tokens: usage.input ?? 0,
            output_tokens: usage.output ?? 0,
            cache_creation_input_tokens: usage.cacheCreation ?? 0,
            ...(usage.cacheCreation1h === undefined
              ? {}
              : {
                  cache_creation: {
                    ephemeral_1h_input_tokens: usage.cacheCreation1h,
                    ephemeral_5m_input_tokens: (usage.cacheCreation ?? 0) - usage.cacheCreation1h,
                  },
                }),
            cache_read_input_tokens: usage.cacheRead ?? 0,
            ...(usage.reasoning === undefined
              ? {}
              : { output_tokens_details: { reasoning_tokens: usage.reasoning } }),
          }
        : undefined,
    },
  } as ParsedMessage
}

function session(messages: ParsedMessage[], providerTotals?: unknown): ParsedSession {
  return {
    sessionId: 's1',
    provider: 'claude-code',
    messages,
    startTime: new Date('2026-09-01T00:00:00Z'),
    endTime: new Date('2026-09-01T01:00:00Z'),
    providerTotals,
  } as ParsedSession
}

/** One entry of the provider's own per-model summary record. */
function providerModel(
  model: string,
  over: { input?: number; output?: number; cacheCreation?: number; cacheRead?: number } = {}
) {
  return {
    model,
    inputTokens: over.input ?? 0,
    outputTokens: over.output ?? 0,
    cacheCreationTokens: over.cacheCreation ?? 0,
    cacheReadTokens: over.cacheRead ?? 0,
  }
}

describe('attributeTokens', () => {
  it('counts each request once when a response spans several messages', () => {
    // Claude Code writes a text line, a tool_use line and a thinking line for one
    // response, each repeating the same usage block. Summing per message triples it.
    const usage = { input: 100, output: 50, cacheRead: 1000, cacheCreation: 10 }
    const result = attributeTokens(
      session([
        message('m1', { model: 'claude-opus-5', requestId: 'req_a', usage }),
        message('m2', { model: 'claude-opus-5', requestId: 'req_a', usage }),
        message('m3', { model: 'claude-opus-5', requestId: 'req_a', usage }),
      ])
    )

    expect(result.totals.inputTokens).toBe(100)
    expect(result.totals.outputTokens).toBe(50)
    expect(result.totals.cacheReadTokens).toBe(1000)
    expect(result.totals.cacheCreationTokens).toBe(10)
    expect(result.duplicateRequestCount).toBe(2)
  })

  it('sums distinct requests', () => {
    const result = attributeTokens(
      session([
        message('m1', { model: 'claude-opus-5', requestId: 'req_a', usage: { output: 50 } }),
        message('m2', { model: 'claude-opus-5', requestId: 'req_b', usage: { output: 70 } }),
      ])
    )

    expect(result.totals.outputTokens).toBe(120)
    expect(result.duplicateRequestCount).toBe(0)
  })

  it('splits tokens per model and keeps the model id verbatim', () => {
    const result = attributeTokens(
      session([
        message('m1', { model: 'claude-opus-5[1m]', requestId: 'r1', usage: { output: 900 } }),
        message('m2', { model: 'claude-haiku-4-5', requestId: 'r2', usage: { output: 100 } }),
      ])
    )

    expect(result.distinctModelCount).toBe(2)
    // Sorted by output desc, so the heaviest model leads.
    expect(result.models[0].model).toBe('claude-opus-5[1m]')
    expect(result.primaryModel).toBe('claude-opus-5[1m]')
    expect(result.models[1].outputTokens).toBe(100)
  })

  it('keeps per-model figures consistent with the totals', () => {
    const result = attributeTokens(
      session([
        message('m1', { model: 'a', requestId: 'r1', usage: { input: 10, output: 1 } }),
        message('m2', { model: 'b', requestId: 'r2', usage: { input: 20, output: 2 } }),
        message('m3', { model: 'b', requestId: 'r2', usage: { input: 20, output: 2 } }),
      ])
    )

    const summed = result.models.reduce((n, m) => n + m.inputTokens, 0)
    expect(summed).toBe(result.totals.inputTokens)
    expect(result.totals.inputTokens).toBe(30)
  })

  it('falls back to message id when the provider gives no requestId', () => {
    // Without a requestId there is nothing to group on, so each message counts once
    // rather than collapsing unrelated messages together.
    const result = attributeTokens(
      session([
        message('m1', { model: 'a', usage: { output: 5 } }),
        message('m2', { model: 'a', usage: { output: 5 } }),
      ])
    )

    expect(result.totals.outputTokens).toBe(10)
  })

  it('buckets messages with no model under "unknown" rather than dropping the tokens', () => {
    const result = attributeTokens(
      session([message('m1', { requestId: 'r1', usage: { output: 42 } })])
    )

    expect(result.models[0].model).toBe('unknown')
    expect(result.totals.outputTokens).toBe(42)
  })

  it('ignores messages with no usage block', () => {
    const result = attributeTokens(
      session([message('m1', { model: 'a' }), message('m2', { model: 'a', requestId: 'r1' })])
    )

    expect(result.totals.outputTokens).toBe(0)
    expect(result.models).toHaveLength(0)
    expect(result.primaryModel).toBeNull()
  })

  it('collects reasoning tokens', () => {
    const result = attributeTokens(
      session([message('m1', { model: 'a', requestId: 'r1', usage: { output: 10, reasoning: 4 } })])
    )

    expect(result.totals.reasoningTokens).toBe(4)
  })
})

/**
 * The cache TTL split.
 *
 * Anthropic bills a 1-hour cache write above the 5-minute default, and only the
 * per-message `usage.cache_creation` object carries the breakdown - the provider's
 * summary record, which is otherwise authoritative, does not. So the split always comes
 * from the messages even when the totals do not, and the two do not always describe the
 * same requests.
 *
 * The rule that follows: CAP, never extrapolate. Measured across 15 real sessions, the
 * message-visible cache-creation tokens ranged from 7% to 485% of the summary's figure.
 * Scaling the observed ratio up to the summary looked better on average but over-stated
 * 8 of those 15 by up to 8%, with nothing stored to say which. Capping is exact wherever
 * the two reconcile and one-sided everywhere else, which is what a cost floor requires.
 */
describe('attributeTokens — cache TTL split', () => {
  it('sums 1-hour tokens per model from the messages', () => {
    const result = attributeTokens(
      session([
        message('m1', {
          model: 'claude-opus-5',
          requestId: 'r1',
          usage: { cacheCreation: 1000, cacheCreation1h: 900 },
        }),
        message('m2', {
          model: 'claude-opus-5',
          requestId: 'r2',
          usage: { cacheCreation: 500, cacheCreation1h: 100 },
        }),
      ])
    )

    expect(result.models[0].cacheCreationTokens).toBe(1500)
    expect(result.models[0].cacheCreation1hTokens).toBe(1000)
  })

  it('counts a repeated request once, like every other token', () => {
    const usage = { cacheCreation: 1000, cacheCreation1h: 900 }
    const result = attributeTokens(
      session([
        message('m1', { model: 'a', requestId: 'r1', usage }),
        message('m2', { model: 'a', requestId: 'r1', usage }),
      ])
    )

    expect(result.models[0].cacheCreation1hTokens).toBe(900)
  })

  it('reports zero when the provider gives no TTL breakdown', () => {
    // Absent is not zero-is-wrong: it means "price the whole write at the base rate",
    // which is the conservative reading rather than a guess.
    const result = attributeTokens(
      session([message('m1', { model: 'a', requestId: 'r1', usage: { cacheCreation: 1000 } })])
    )

    expect(result.models[0].cacheCreationTokens).toBe(1000)
    expect(result.models[0].cacheCreation1hTokens).toBe(0)
  })

  it('joins the summary to the messages on the BASE model name', () => {
    // The trap: a per-message record says `claude-opus-5`, the summary says
    // `claude-opus-5[1m]` for the very same requests. Joining on the raw string finds
    // nothing and silently drops the split.
    const result = attributeTokens(
      session(
        [
          message('m1', {
            model: 'claude-opus-5',
            requestId: 'r1',
            usage: { cacheCreation: 1000, cacheCreation1h: 800 },
          }),
        ],
        { modelUsage: [providerModel('claude-opus-5[1m]', { cacheCreation: 1000 })] }
      )
    )

    expect(result.source).toBe('provider_totals')
    expect(result.models[0].model).toBe('claude-opus-5[1m]')
    expect(result.models[0].cacheCreation1hTokens).toBe(800)
  })

  it('CAPS the observed count at the summary total, never exceeding it', () => {
    // A compacted session: the transcript holds more requests than the summary bills.
    // A model must never be charged the higher rate on more tokens than it wrote.
    const result = attributeTokens(
      session(
        [
          message('m1', {
            model: 'claude-opus-5',
            requestId: 'r1',
            usage: { cacheCreation: 5000, cacheCreation1h: 5000 },
          }),
        ],
        { modelUsage: [providerModel('claude-opus-5[1m]', { cacheCreation: 1000 })] }
      )
    )

    expect(result.models[0].cacheCreation1hTokens).toBe(1000)
  })

  it('does NOT extrapolate a partial observation up to the summary total', () => {
    // The whole design decision. The transcript covers a fifth of the billed tokens and
    // all of what it covers is 1-hour; the unseen four fifths demonstrably have a
    // different mix, so they stay at the base rate. Scaling to 5000 would over-charge.
    const result = attributeTokens(
      session(
        [
          message('m1', {
            model: 'claude-opus-5',
            requestId: 'r1',
            usage: { cacheCreation: 1000, cacheCreation1h: 1000 },
          }),
        ],
        { modelUsage: [providerModel('claude-opus-5[1m]', { cacheCreation: 5000 })] }
      )
    )

    expect(result.models[0].cacheCreation1hTokens).toBe(1000)
  })

  it('splits the observation between models sharing a base name', () => {
    // `claude-opus-5` and `claude-opus-5[1m]` are separate priced models but one base.
    // Giving each the full observed figure would bill the same tokens twice at the
    // higher rate.
    const result = attributeTokens(
      session(
        [
          message('m1', {
            model: 'claude-opus-5',
            requestId: 'r1',
            usage: { cacheCreation: 1000, cacheCreation1h: 1000 },
          }),
        ],
        {
          modelUsage: [
            providerModel('claude-opus-5', { cacheCreation: 3000, output: 2 }),
            providerModel('claude-opus-5[1m]', { cacheCreation: 1000, output: 1 }),
          ],
        }
      )
    )

    const total = result.models.reduce((n, m) => n + m.cacheCreation1hTokens, 0)
    expect(total).toBe(1000)
    // Allocated in proportion to each model's cache-creation total: 3:1.
    const byModel = new Map(result.models.map(m => [m.model, m.cacheCreation1hTokens]))
    expect(byModel.get('claude-opus-5')).toBe(750)
    expect(byModel.get('claude-opus-5[1m]')).toBe(250)
  })

  it('leaves the split at zero when the messages carry no TTL data at all', () => {
    const result = attributeTokens(
      session([message('m1', { model: 'claude-opus-5', requestId: 'r1', usage: { output: 5 } })], {
        modelUsage: [providerModel('claude-opus-5[1m]', { cacheCreation: 1000 })],
      })
    )

    expect(result.models[0].cacheCreation1hTokens).toBe(0)
  })

  it('clamps a malformed record reporting more 1-hour tokens than it wrote', () => {
    const result = attributeTokens(
      session([
        message('m1', {
          model: 'a',
          requestId: 'r1',
          usage: { cacheCreation: 100, cacheCreation1h: 999 },
        }),
      ])
    )

    expect(result.models[0].cacheCreation1hTokens).toBe(100)
  })
})
