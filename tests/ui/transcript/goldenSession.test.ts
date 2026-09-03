/**
 * End-to-end derivation over a real recorded session.
 *
 * This is the regression net: it runs the same pipeline the app does — parse,
 * normalize, derive — over a genuine Claude Code transcript, and asserts the
 * structural invariants that unit tests can only assert on synthetic input.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parserRegistry } from '../../../src/parsers/registry.js'
import { processorRegistry } from '../../../src/ui/utils/processors/ProcessorRegistry.js'
import { deriveSpans } from '../../../src/ui/utils/transcript/deriveSpans.js'
import { isToolSpan } from '../../../src/ui/utils/transcript/spanTypes.js'

const FIXTURE = join(
  __dirname,
  '../../processors/providers/claude-code/fixtures/sample-claude-session.jsonl'
)

function deriveFixture() {
  const content = readFileSync(FIXTURE, 'utf-8')
  const parser = parserRegistry.getParser('claude-code')
  if (!parser) throw new Error('no claude-code parser registered')

  const messages = parser.parseSession(content).messages.map(msg => ({
    ...msg,
    timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
  }))
  const normalized = processorRegistry.getProcessor('claude-code').normalizeAll(messages)
  return { normalized, model: deriveSpans(normalized) }
}

describe('deriveSpans over a real session', () => {
  it('owns every message exactly once', () => {
    const { normalized, model } = deriveFixture()
    const owned = model.spans.flatMap(span => span.messageIds)

    expect(owned).toHaveLength(normalized.length)
    expect(new Set(owned).size).toBe(normalized.length)
    expect(new Set(owned)).toEqual(new Set(normalized.map(m => m.id)))
  })

  it('condenses the session substantially', () => {
    const { normalized, model } = deriveFixture()
    // The whole point: far fewer rows to scan than there are records.
    expect(model.spans.length).toBeLessThan(normalized.length)
    expect(model.summary.records).toBe(normalized.length)
    expect(model.summary.strip).toHaveLength(model.spans.length)
  })

  it('produces sane, finite aggregates for every tool span', () => {
    const { model } = deriveFixture()
    const toolSpans = model.spans.filter(isToolSpan)
    expect(toolSpans.length).toBeGreaterThan(0)

    for (const span of toolSpans) {
      expect(span.calls.length).toBe(span.stats.callCount)
      expect(span.stats.resultCount + span.stats.pendingCount).toBe(span.stats.callCount)
      expect(Number.isFinite(span.stats.elapsedMs)).toBe(true)
      expect(span.stats.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(span.label.length).toBeGreaterThan(0)
      // The histogram must account for every call.
      const histogramTotal = span.stats.histogram.reduce((sum, entry) => sum + entry.count, 0)
      expect(histogramTotal).toBe(span.stats.callCount)
    }
  })

  it('is stable — the span shape is a snapshot', () => {
    const { model } = deriveFixture()
    const shape = model.spans.map(span =>
      isToolSpan(span) ? `tools:${span.calls.length}` : span.kind
    )
    expect(shape.join(' ')).toMatchSnapshot()
  })
})
