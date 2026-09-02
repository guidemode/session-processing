/**
 * Every REGISTERED provider processor must produce token-cost metrics.
 *
 * This exists because the cost pipeline shipped without ever running in production.
 * `CanonicalSessionProcessor` — the only processor that held `CanonicalCostProcessor`
 * and attached `providerTotals` — is exported but registered nowhere. The registry
 * hands out six provider-specific processors, each carrying a metric list hand-copied
 * before the cost work existed, so every real upload ran the context processor (tokens
 * landed) and skipped cost entirely: `model_usage` empty, every cost column NULL, and
 * pricing correctly reporting `unavailable` for the whole corpus.
 *
 * Phase 2 was "verified end to end" against `CanonicalSessionProcessor` directly, which
 * is precisely the path production never takes. So the assertion here is deliberately
 * made through `ProcessorRegistry` rather than by constructing a processor: a test that
 * names the class it wants cannot catch a class nobody reaches.
 */

import { describe, expect, it } from 'vitest'
import { ProcessorRegistry } from '../../src/processors/registry.js'

const usageLine = (uuid: string, model: string, requestId: string) =>
  JSON.stringify({
    type: 'assistant',
    uuid,
    requestId,
    sessionId: 'sess-cost-coverage',
    timestamp: '2026-09-01T00:00:00Z',
    provider: 'claude-code',
    message: {
      role: 'assistant',
      model,
      content: 'ok',
      usage: {
        input_tokens: 120,
        output_tokens: 340,
        cache_creation_input_tokens: 900,
        cache_read_input_tokens: 5000,
      },
    },
  })

const COST_STATE = JSON.stringify({
  type: 'cost-state',
  sessionId: 'sess-cost-coverage',
  totalCostUSD: 1.5,
  modelUsage: {
    'claude-opus-5[1m]': {
      inputTokens: 120,
      outputTokens: 340,
      cacheReadInputTokens: 5000,
      cacheCreationInputTokens: 900,
      costUSD: 1.5,
    },
  },
  hasUnknownModelCost: false,
})

const TRANSCRIPT = [
  usageLine('u1', 'claude-opus-5[1m]', 'req-1'),
  usageLine('u2', 'claude-opus-5[1m]', 'req-2'),
].join('\n')

const registry = new ProcessorRegistry()

/*
 * Composition, asserted for every provider, and behaviour, asserted for one.
 *
 * The cross-provider claim has to be about the processor LIST rather than a run,
 * because each provider parses its own native format and a Claude transcript is not
 * a Gemini one. Composition is exactly where the bug lived: six hand-copied lists,
 * each missing the same entry.
 */
describe('every registered provider processor includes the cost processor', () => {
  for (const provider of registry.getRegisteredProviders()) {
    it(`${provider} lists a token-cost processor`, () => {
      const processor = registry.getProcessor(provider)
      expect(processor).not.toBeNull()

      const types = processor!.getMetricProcessors().map(p => p.metricType)
      expect(
        types,
        `${provider} runs no cost processor — model_usage stays empty and every session prices to 'unavailable'`
      ).toContain('token-cost')
    })
  }
})

describe('the registered claude-code path produces a priceable breakdown', () => {
  const run = async (content: string) => {
    const processor = registry.getProcessor('claude-code')
    const results = await processor!.processMetrics(content, {
      sessionId: 'sess-cost-coverage',
      provider: 'claude-code',
    } as never)
    return results.find(r => r.metricType === 'token-cost')?.metrics as
      | { model_usage?: unknown[]; primary_model?: string | null; provider_reported_cost_usd?: number }
      | undefined
  }

  it('attributes tokens per model', async () => {
    const metrics = await run(TRANSCRIPT)
    expect(metrics).toBeDefined()
    expect(metrics?.model_usage?.length ?? 0).toBeGreaterThan(0)
    expect(metrics?.primary_model).toBe('claude-opus-5[1m]')
  })

  it('reads the provider summary record, which only the extractor hook can reach', async () => {
    // `cost-state` carries no uuid or timestamp, so the message parser skips it. This
    // asserts the hook fires on the path the QUEUE uses, not just on the processor the
    // seed script and the Phase 2 verification happened to construct by hand.
    const metrics = await run(`${TRANSCRIPT}\n${COST_STATE}`)
    expect(metrics?.provider_reported_cost_usd).toBeCloseTo(1.5)
  })
})
