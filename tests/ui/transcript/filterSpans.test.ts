import { beforeEach, describe, expect, it } from 'vitest'
import { deriveSpans } from '../../../src/ui/utils/transcript/deriveSpans.js'
import { prefilterMessages, projectSpans } from '../../../src/ui/utils/transcript/filterSpans.js'
import { isToolSpan } from '../../../src/ui/utils/transcript/spanTypes.js'
import {
  assistant,
  at,
  human,
  interruption,
  meta,
  normalize,
  resetIds,
  thinking,
  toolPair,
} from './fixtures/messages.js'

beforeEach(resetIds)

describe('prefilterMessages', () => {
  it('drops meta and thinking when hidden, and merges the tool run that straddled them', () => {
    const messages = normalize([
      ...toolPair('Bash', { command: 'ls' }, 't1', { at: 0 }),
      meta('file-history-snapshot', at(2)),
      thinking('pondering', at(3)),
      ...toolPair('Bash', { command: 'pwd' }, 't2', { at: 4 }),
    ])

    const shown = prefilterMessages(messages, { showMetaMessages: true, showThinkingBlocks: true })
    expect(deriveSpans(shown).spans.map(s => s.kind)).toEqual(['tools', 'meta', 'assistant', 'tools'])

    const hidden = prefilterMessages(messages, {
      showMetaMessages: false,
      showThinkingBlocks: false,
    })
    const spans = deriveSpans(hidden).spans
    expect(spans.map(s => s.kind)).toEqual(['tools'])
    expect((spans[0] as ReturnType<typeof deriveSpans>['spans'][0] & { calls: unknown[] }).calls)
      .toHaveLength(2)
  })

  it('drops assistant messages with no content', () => {
    const messages = normalize([human('go', at(0)), assistant('', at(1))])
    const kept = prefilterMessages(messages, { showMetaMessages: true, showThinkingBlocks: true })
    expect(kept).toHaveLength(1)
    expect(kept[0].role).toBe('user')
  })
})

describe('projectSpans', () => {
  const build = () =>
    deriveSpans(
      normalize([
        human('go', at(0)),
        assistant('sure', at(1)),
        ...toolPair('Bash', { command: 'ls' }, 't1', { at: 2 }),
        ...toolPair('Read', { file_path: '/a.ts' }, 't2', { at: 4 }),
      ])
    ).spans

  it('keeps everything when unfiltered', () => {
    const projected = projectSpans(build(), { messageFilter: 'all', searchQuery: '' })
    expect(projected).toHaveLength(3)
    expect(projected.every(p => !p.autoExpand)).toBe(true)
  })

  it('narrows to conversation for role filters', () => {
    const spans = build()
    expect(
      projectSpans(spans, { messageFilter: 'user-only', searchQuery: '' }).map(p => p.span.kind)
    ).toEqual(['human'])
    expect(
      projectSpans(spans, { messageFilter: 'user-assistant', searchQuery: '' }).map(p => p.span.kind)
    ).toEqual(['human', 'assistant'])
  })

  it('narrows to matching calls for a tool filter, auto-expanding and preserving the span', () => {
    const projected = projectSpans(build(), { messageFilter: 'Bash', searchQuery: '' })
    expect(projected).toHaveLength(1)

    const { span, autoExpand, visibleCallIds } = projected[0]
    if (!isToolSpan(span)) throw new Error('expected a tool span')
    expect(autoExpand).toBe(true)
    expect(visibleCallIds).toHaveLength(1)
    // The span still reports its true size — narrowing must not rewrite the counters.
    expect(span.stats.callCount).toBe(2)
  })

  it('keeps and auto-expands spans matching a search', () => {
    const projected = projectSpans(build(), { messageFilter: 'all', searchQuery: 'a.ts' })
    expect(projected.length).toBeGreaterThan(0)
    expect(projected.every(p => p.autoExpand)).toBe(true)
    expect(projected.every(p => p.matchedMessageIds.length > 0)).toBe(true)
  })

  it('returns nothing when the search matches nothing', () => {
    expect(projectSpans(build(), { messageFilter: 'all', searchQuery: 'zzzz' })).toEqual([])
  })
})

describe('projectSpans under events-only', () => {
  it('carries in the steer that followed an interruption', () => {
    // An interruption on its own says only that the run was stopped. The prompt that followed
    // is the reason, and it is a human span the filter would otherwise drop.
    const spans = deriveSpans(
      normalize([
        human('go', at(0)),
        assistant('working', at(1)),
        interruption(at(2)),
        human('no, do it the other way', at(3)),
        assistant('understood', at(4)),
      ])
    ).spans

    const projected = projectSpans(spans, { messageFilter: 'events-only', searchQuery: '' })

    expect(projected.map(p => p.span.kind)).toEqual(['event', 'human'])
  })

  it('does not attach a prompt that belongs to a later event', () => {
    // Stopped, then never steered: the next human turn follows the second interruption and is
    // that one's steer, not this one's.
    const spans = deriveSpans(
      normalize([
        human('go', at(0)),
        interruption(at(1)),
        interruption(at(2)),
        human('try again', at(3)),
      ])
    ).spans

    const projected = projectSpans(spans, { messageFilter: 'events-only', searchQuery: '' })
    const humans = projected.filter(p => p.span.kind === 'human')

    expect(humans).toHaveLength(1)
  })

  it('leaves the other kind filters alone', () => {
    const spans = deriveSpans(
      normalize([interruption(at(0)), human('steer', at(1)), assistant('ok', at(2))])
    ).spans

    expect(
      projectSpans(spans, { messageFilter: 'assistant-only', searchQuery: '' }).map(p => p.span.kind)
    ).toEqual(['assistant'])
  })
})
