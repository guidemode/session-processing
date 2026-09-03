/**
 * Fixture builders for transcript span tests.
 *
 * These produce `BaseSessionMessage`s in the shape the canonical parser emits, then run
 * them through the real `CanonicalMessageProcessor` so tests exercise the same
 * normalization the app does rather than a hand-faked `TimelineMessage`.
 */

import type { BaseSessionMessage } from '@guidemode/types'
import { processorRegistry } from '../../../../src/ui/utils/processors/ProcessorRegistry.js'
import type { TimelineMessage } from '../../../../src/ui/utils/timelineTypes.js'

let counter = 0

/** Deterministic, monotonically increasing timestamps one second apart. */
export function at(secondsFromStart: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, secondsFromStart)).toISOString()
}

function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

/** Reset id numbering so snapshots stay stable across test files. */
export function resetIds(): void {
  counter = 0
}

export function human(text: string, timestamp = at(0)): BaseSessionMessage {
  return {
    id: nextId('human'),
    timestamp,
    type: 'user',
    content: { type: 'structured', text },
    metadata: { role: 'user' },
  }
}

export function assistant(text: string, timestamp = at(0)): BaseSessionMessage {
  return {
    id: nextId('assistant'),
    timestamp,
    type: 'assistant',
    content: { type: 'structured', text },
    metadata: { role: 'assistant' },
  }
}

export function thinking(text: string, timestamp = at(0)): BaseSessionMessage {
  return {
    ...assistant(text, timestamp),
    metadata: { role: 'assistant', isThinking: true },
  }
}

export function toolUse(
  name: string,
  input: Record<string, unknown>,
  toolUseId: string,
  timestamp = at(0)
): BaseSessionMessage {
  return {
    id: nextId('use'),
    timestamp,
    type: 'tool_use',
    content: { type: 'structured', toolUse: { type: 'tool_use', id: toolUseId, name, input } },
    metadata: { role: 'assistant', toolUseId },
  }
}

export function toolResult(
  toolUseId: string,
  content: unknown,
  timestamp = at(0),
  isError = false
): BaseSessionMessage {
  return {
    id: nextId('result'),
    timestamp,
    type: 'tool_result',
    content: {
      type: 'structured',
      toolResult: { type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError },
    },
    metadata: { role: 'user' },
    linkedTo: toolUseId,
  }
}

/** A matched call/result pair, the common case. */
export function toolPair(
  name: string,
  input: Record<string, unknown>,
  toolUseId: string,
  options: { at?: number; result?: unknown; isError?: boolean } = {}
): BaseSessionMessage[] {
  const start = options.at ?? 0
  return [
    toolUse(name, input, toolUseId, at(start)),
    toolResult(toolUseId, options.result ?? 'ok', at(start + 1), options.isError ?? false),
  ]
}

export function meta(claudeType: string, timestamp = at(0)): BaseSessionMessage {
  return {
    id: nextId('meta'),
    timestamp,
    type: 'meta',
    content: { type: 'structured', text: '' },
    metadata: { role: 'system', isMeta: true, providerMetadata: { claude_type: claudeType } },
  }
}

export function interruption(timestamp = at(0)): BaseSessionMessage {
  return {
    id: nextId('interrupt'),
    timestamp,
    type: 'interruption',
    content: { type: 'structured', text: '[Request interrupted by user]' },
    metadata: { role: 'user' },
  }
}

export function compact(timestamp = at(0)): BaseSessionMessage {
  return {
    id: nextId('compact'),
    timestamp,
    type: 'compact',
    content: { type: 'structured', text: 'Context compacted' },
    metadata: { role: 'user' },
  }
}

/** Normalize through the real processor, exactly as the app does. */
export function normalize(messages: BaseSessionMessage[]): TimelineMessage[] {
  return processorRegistry.getProcessor('claude-code').normalizeAll(messages)
}
