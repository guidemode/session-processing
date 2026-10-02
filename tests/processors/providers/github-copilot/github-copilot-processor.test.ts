/**
 * Copilot CLI sessions, as the CLI uploads them: canonical JSONL with provider
 * `github-copilot` and Copilot's own tool names passed through.
 *
 * The fixture is hand-built to the converter's contract rather than captured, so that every
 * shape that matters is present in a file small enough to reason about: reads (`view`, `rg`),
 * a subagent (`task`) whose activity is interleaved as sidechain messages, a raw-patch
 * `apply_patch`, a verifying `bash`, and the per-model usage meta messages Copilot only
 * produces at `session.shutdown`.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ContextManagementMetrics,
  QualityMetrics,
  TokenCostMetrics,
  UsageMetrics,
} from '@guidemode/types'
import { describe, expect, it } from 'vitest'
import { GitHubCopilotProcessor } from '../../../../src/processors/providers/github-copilot/index.js'
import { processorRegistry } from '../../../../src/processors/registry.js'

const SESSION = readFileSync(join(__dirname, 'fixtures/canonical-copilot-session.jsonl'), 'utf-8')

const context = {
  sessionId: '7c1e2f4a-9b3d-4e8a-a1f2-3c4d5e6f7a8b',
  tenantId: 'tenant',
  userId: 'user',
  provider: 'github-copilot',
}

async function metricsOf<T>(type: string): Promise<T> {
  const results = await new GitHubCopilotProcessor().processMetrics(SESSION, context)
  const result = results.find(r => r.metricType === type)
  expect(result, `${type} metrics`).toBeDefined()
  return result?.metrics as T
}

describe('GitHubCopilotProcessor on canonical input', () => {
  it('is what the registry hands out for github-copilot', () => {
    expect(processorRegistry.getProcessor('github-copilot')).toBeInstanceOf(GitHubCopilotProcessor)
  })

  it('parses the session and keeps the real provider', () => {
    const processor = new GitHubCopilotProcessor()
    expect(processor.canProcess(SESSION)).toBe(true)

    const session = processor.parseSession(SESSION, 'github-copilot')
    expect(session.provider).toBe('github-copilot')
    expect(session.messages.length).toBeGreaterThan(0)
  })

  it('marks subagent activity as sidechain', () => {
    const session = new GitHubCopilotProcessor().parseSession(SESSION, 'github-copilot')
    const sidechain = session.messages.filter(m => m.metadata?.isSidechain === true)

    // The subagent's prompt, its glob call, the glob's result and its answer.
    expect(sidechain).toHaveLength(4)
  })

  it('counts reads and writes by capability, not by Claude Code tool name', async () => {
    const usage = await metricsOf<UsageMetrics>('usage')

    // view + rg + the subagent's glob, against one apply_patch.
    expect(usage.metadata?.read_operations).toBe(3)
    expect(usage.metadata?.write_operations).toBe(1)
    expect(usage.read_write_ratio).toBe(3)
    // view (6 lines) + rg (2) + glob (1).
    expect(usage.metadata?.total_lines_read).toBe(9)
  })

  it('credits read-before-write and verification', async () => {
    const quality = await metricsOf<QualityMetrics>('quality')

    // Read before the write (25) and a bash after it (15): 40 of the 100 applicable, less
    // the 10-point penalty for reading three times as often as writing. Before `view` and
    // `rg` were known, this session earned neither the read nor its penalty.
    expect(quality.process_quality_score).toBe(30)
    expect(quality.task_success_rate).toBe(100)
  })

  it('attributes shutdown usage to each model exactly once', async () => {
    const cost = await metricsOf<TokenCostMetrics>('token-cost')

    expect(cost.token_attribution_source).toBe('message_usage')
    expect(cost.duplicate_request_count).toBe(0)
    expect(cost.model_usage.map(m => [m.model, m.input_tokens, m.output_tokens])).toEqual([
      ['claude-sonnet-4.5', 4200, 1850],
      ['claude-haiku-4.5', 900, 210],
    ])
    expect(cost.primary_model).toBe('claude-sonnet-4.5')
  })

  it('totals the usage, and takes the context window from the newest stated reading', async () => {
    const ctx = await metricsOf<ContextManagementMetrics>('context-management')

    expect(ctx.total_input_tokens).toBe(5100)
    expect(ctx.total_output_tokens).toBe(2060)
    expect(ctx.total_cache_read).toBe(64000)
    // The shutdown's own reading, which supersedes the turn's checkpoint (38,400). The usage
    // messages after it are session aggregates and no reading at all: taken as one, the
    // last would claim 65,200 tokens in context at once.
    expect(ctx.context_length).toBe(41250)
    expect(ctx.context_utilization_percent).toBeCloseTo(20.625)
    // Copilot states no per-request usage, so there are no turns to average.
    expect(ctx.avg_tokens_per_message).toBe(0)
  })

  it('reads a session with context readings but no usage yet, as one mid-session is', async () => {
    const withoutUsage = SESSION.split('\n')
      .filter(line => !line.includes('"usage"'))
      .join('\n')
    const results = await new GitHubCopilotProcessor().processMetrics(withoutUsage, context)
    const ctx = results.find(r => r.metricType === 'context-management')
      ?.metrics as ContextManagementMetrics

    expect(ctx.context_length).toBe(41250)
    expect(ctx.total_input_tokens).toBe(0)
  })
})
