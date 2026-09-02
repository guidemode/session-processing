/**
 * Token attribution
 *
 * Single source of truth for turning a parsed session into token counts, both
 * per-model and in total. Both figures come from one pass so they can never drift.
 *
 * The important correctness rule lives here: Claude Code writes SEVERAL JSONL lines
 * for one assistant response — a text line, tool_use lines, thinking lines — and every
 * one of them repeats the SAME `usage` block for the request that produced them. Summing
 * per message therefore counts the same tokens many times over. Measured on a real
 * session: 622 usage-bearing messages but only 257 distinct requests, inflating
 * output_tokens by 64.8% (487,244 vs 171,655).
 *
 * Deduplicating on `requestId` is what makes these numbers real.
 */

import type { ParsedMessage, ParsedSession } from '../../../parsers/base/types.js'

/** Raw usage block as it appears on a message, across providers. */
interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  output_tokens_details?: { reasoning_tokens?: number }
  reasoning_output_tokens?: number
}

export interface ModelTokenUsage {
  /** Model id exactly as the provider wrote it, e.g. 'claude-opus-5[1m]'. Never normalised here. */
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  reasoningTokens: number
}

export interface TokenTotals {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  reasoningTokens: number
}

export interface TokenAttribution {
  /**
   * Where the numbers came from.
   * - `provider_totals`: the provider's own per-model record (authoritative)
   * - `mixed`: provider totals, with the per-model split derived from messages
   * - `message_usage`: everything derived from per-message usage
   */
  source: 'provider_totals' | 'mixed' | 'message_usage'
  /** Per-model breakdown, highest output first. */
  models: ModelTokenUsage[]
  totals: TokenTotals
  /** Model that produced the most output tokens — the session's representative model. */
  primaryModel: string | null
  distinctModelCount: number
  /** Requests whose usage was seen more than once and counted only once. Diagnostic. */
  duplicateRequestCount: number
}

const UNKNOWN_MODEL = 'unknown'

function emptyTotals(): TokenTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
  }
}

function readUsage(message: ParsedMessage): RawUsage | undefined {
  return message.metadata?.usage as RawUsage | undefined
}

/**
 * Identity of the API request a message belongs to.
 *
 * Falls back to the message id when the provider gives no requestId, which degrades to
 * the old per-message behaviour rather than collapsing unrelated messages together.
 */
function requestKey(message: ParsedMessage): string {
  const requestId = message.metadata?.requestId
  return typeof requestId === 'string' && requestId.length > 0 ? requestId : message.id
}

function reasoningTokensOf(usage: RawUsage): number {
  return usage.output_tokens_details?.reasoning_tokens ?? usage.reasoning_output_tokens ?? 0
}

function totalsOf(models: ModelTokenUsage[]): TokenTotals {
  return models.reduce((acc, m) => {
    acc.inputTokens += m.inputTokens
    acc.outputTokens += m.outputTokens
    acc.cacheCreationTokens += m.cacheCreationTokens
    acc.cacheReadTokens += m.cacheReadTokens
    acc.reasoningTokens += m.reasoningTokens
    return acc
  }, emptyTotals())
}

function summarise(
  source: TokenAttribution['source'],
  models: ModelTokenUsage[],
  totals: TokenTotals,
  duplicateRequestCount: number
): TokenAttribution {
  const sorted = [...models].sort((a, b) => b.outputTokens - a.outputTokens)
  return {
    source,
    models: sorted,
    totals,
    primaryModel: sorted[0]?.model ?? null,
    distinctModelCount: sorted.length,
    duplicateRequestCount,
  }
}

/**
 * Attribute a session's tokens to models, counting each API request exactly once.
 *
 * Prefers the provider's own summary record when it carries a per-model split, since
 * that is what the provider itself billed against. Falls back to deriving both the split
 * and the totals from per-message usage.
 */
export function attributeTokens(session: ParsedSession): TokenAttribution {
  const providerModels = session.providerTotals?.modelUsage
  if (providerModels && providerModels.length > 0) {
    const models: ModelTokenUsage[] = providerModels.map(m => ({
      model: m.model,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheCreationTokens: m.cacheCreationTokens,
      cacheReadTokens: m.cacheReadTokens,
      reasoningTokens: 0,
    }))
    return summarise('provider_totals', models, totalsOf(models), 0)
  }

  const derived = attributeFromMessages(session)

  // Provider gave session totals but no split (Codex). Trust its totals - they are
  // cumulative and authoritative - while keeping the message-derived per-model split.
  const providerTotals = session.providerTotals?.totals
  if (providerTotals) {
    return summarise(
      'mixed',
      derived.models,
      {
        inputTokens: providerTotals.inputTokens,
        outputTokens: providerTotals.outputTokens,
        cacheCreationTokens: providerTotals.cacheCreationTokens,
        cacheReadTokens: providerTotals.cacheReadTokens,
        reasoningTokens: providerTotals.reasoningTokens ?? 0,
      },
      derived.duplicateRequestCount
    )
  }

  return derived
}

/**
 * Derive attribution purely from per-message usage blocks.
 */
function attributeFromMessages(session: ParsedSession): TokenAttribution {
  const byModel = new Map<string, ModelTokenUsage>()
  const totals = emptyTotals()
  const seenRequests = new Set<string>()
  let duplicateRequestCount = 0

  for (const message of session.messages) {
    const usage = readUsage(message)
    if (!usage) continue

    const key = requestKey(message)
    if (seenRequests.has(key)) {
      duplicateRequestCount++
      continue
    }
    seenRequests.add(key)

    const model =
      typeof message.metadata?.model === 'string' && message.metadata.model.length > 0
        ? message.metadata.model
        : UNKNOWN_MODEL

    let entry = byModel.get(model)
    if (!entry) {
      entry = {
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        reasoningTokens: 0,
      }
      byModel.set(model, entry)
    }

    const input = usage.input_tokens || 0
    const output = usage.output_tokens || 0
    const cacheCreation = usage.cache_creation_input_tokens || 0
    const cacheRead = usage.cache_read_input_tokens || 0
    const reasoning = reasoningTokensOf(usage)

    entry.inputTokens += input
    entry.outputTokens += output
    entry.cacheCreationTokens += cacheCreation
    entry.cacheReadTokens += cacheRead
    entry.reasoningTokens += reasoning

    totals.inputTokens += input
    totals.outputTokens += output
    totals.cacheCreationTokens += cacheCreation
    totals.cacheReadTokens += cacheRead
    totals.reasoningTokens += reasoning
  }

  return summarise('message_usage', Array.from(byModel.values()), totals, duplicateRequestCount)
}
