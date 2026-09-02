import { describe, expect, it } from 'vitest'
import { extractProviderSessionTotals } from '../../src/extractors/index.js'

/**
 * Shape taken from a real Claude Code transcript. Values are real; ids are synthetic.
 * Note `claude-opus-5[1m]` — the context-tier suffix must survive verbatim, because it
 * changes the rate and normalising it here would silently mis-price the session.
 */
const COST_STATE = JSON.stringify({
  type: 'cost-state',
  sessionId: 'sess-1',
  totalCostUSD: 5.599027,
  totalAPIDuration: 733434,
  totalAPIDurationWithoutRetries: 733072,
  totalToolDuration: 207982,
  totalLinesAdded: 1733,
  totalLinesRemoved: 121,
  totalDuration: 2361174,
  startTime: 1787817807272,
  modelUsage: {
    'claude-haiku-4-5-20251001': {
      inputTokens: 1075,
      outputTokens: 17,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      webSearchRequests: 0,
      costUSD: 0.00116,
    },
    'claude-opus-5[1m]': {
      inputTokens: 220,
      outputTokens: 54745,
      cacheReadInputTokens: 5668844,
      cacheCreationInputTokens: 139372,
      webSearchRequests: 2,
      costUSD: 5.597867,
    },
  },
  hasUnknownModelCost: false,
})

const ASSISTANT_LINE = JSON.stringify({
  type: 'assistant',
  uuid: 'u1',
  sessionId: 'sess-1',
  timestamp: '2026-09-01T00:00:00Z',
  message: { role: 'assistant', model: 'claude-opus-5[1m]', content: 'hi' },
})

describe('extractProviderSessionTotals — Claude cost-state', () => {
  it('extracts per-model usage, cost and durations', () => {
    const result = extractProviderSessionTotals(`${ASSISTANT_LINE}\n${COST_STATE}`, 'claude-code')

    expect(result).not.toBeNull()
    expect(result?.source).toBe('claude-cost-state')
    expect(result?.reportedCostUsd).toBeCloseTo(5.599027)
    expect(result?.hasUnknownModelCost).toBe(false)
    expect(result?.durations?.apiMs).toBe(733434)
    expect(result?.durations?.toolMs).toBe(207982)
    expect(result?.agentLines).toEqual({ added: 1733, removed: 121 })

    const opus = result?.modelUsage?.find(m => m.model === 'claude-opus-5[1m]')
    expect(opus).toBeDefined()
    expect(opus?.cacheReadTokens).toBe(5668844)
    expect(opus?.cacheCreationTokens).toBe(139372)
    expect(opus?.reportedCostUsd).toBeCloseTo(5.597867)
    expect(opus?.webSearchRequests).toBe(2)
  })

  it('keeps the context-tier suffix verbatim', () => {
    const result = extractProviderSessionTotals(COST_STATE, 'claude-code')
    expect(result?.modelUsage?.map(m => m.model)).toContain('claude-opus-5[1m]')
  })

  it('finds the record even when it is not the very last line', () => {
    // Observed position is always last, but a trailing newline or a future trailing
    // record must not lose the data.
    const content = `${ASSISTANT_LINE}\n${COST_STATE}\n${ASSISTANT_LINE}\n\n`
    expect(extractProviderSessionTotals(content, 'claude-code')).not.toBeNull()
  })

  it('returns null when the transcript has no cost-state', () => {
    expect(extractProviderSessionTotals(ASSISTANT_LINE, 'claude-code')).toBeNull()
  })

  it('returns null rather than throwing on a malformed record', () => {
    const broken = '{"type":"cost-state","totalCostUSD":'
    expect(() => extractProviderSessionTotals(broken, 'claude-code')).not.toThrow()
    expect(extractProviderSessionTotals(broken, 'claude-code')).toBeNull()
  })

  it('returns null for providers that report nothing', () => {
    expect(extractProviderSessionTotals(COST_STATE, 'github-copilot')).toBeNull()
    expect(extractProviderSessionTotals(COST_STATE, 'cursor')).toBeNull()
    expect(extractProviderSessionTotals(COST_STATE, 'gemini-code')).toBeNull()
  })
})

describe('extractProviderSessionTotals — Codex', () => {
  const turn = (input: number, output: number) =>
    JSON.stringify({
      payload: {
        info: {
          total_token_usage: {
            input_tokens: input,
            cached_input_tokens: 10624,
            output_tokens: output,
            reasoning_output_tokens: 36,
            total_tokens: input + output,
          },
          last_token_usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    })

  it('takes the last cumulative block rather than summing turns', () => {
    // total_token_usage is cumulative; summing occurrences multiplies the session.
    const result = extractProviderSessionTotals(
      `${turn(100, 10)}\n${turn(500, 60)}\n${turn(15871, 237)}`,
      'codex'
    )

    expect(result?.source).toBe('codex-token-usage')
    expect(result?.totals?.inputTokens).toBe(15871)
    expect(result?.totals?.outputTokens).toBe(237)
    expect(result?.totals?.reasoningTokens).toBe(36)
  })

  it('reports no cost, because Codex does not provide one', () => {
    const result = extractProviderSessionTotals(turn(100, 10), 'codex')
    expect(result?.reportedCostUsd).toBeUndefined()
    expect(result?.modelUsage).toBeUndefined()
  })
})
