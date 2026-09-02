import { describe, expect, it } from 'vitest'
import type { ParsedMessage, ParsedSession } from '../../../src/parsers/base/types.js'
import { attributeTokens } from '../../../src/processors/canonical/metrics/token-attribution.js'

interface UsageInput {
  input?: number
  output?: number
  cacheCreation?: number
  cacheRead?: number
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
            cache_read_input_tokens: usage.cacheRead ?? 0,
            ...(usage.reasoning === undefined
              ? {}
              : { output_tokens_details: { reasoning_tokens: usage.reasoning } }),
          }
        : undefined,
    },
  } as ParsedMessage
}

function session(messages: ParsedMessage[]): ParsedSession {
  return {
    sessionId: 's1',
    provider: 'claude-code',
    messages,
    startTime: new Date('2026-09-01T00:00:00Z'),
    endTime: new Date('2026-09-01T01:00:00Z'),
  } as ParsedSession
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
