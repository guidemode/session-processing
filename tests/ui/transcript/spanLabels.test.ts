import { beforeEach, describe, expect, it } from 'vitest'
import { deriveSpans } from '../../../src/ui/utils/transcript/deriveSpans.js'
import {
  describeToolCall,
  deriveToolSpanLabel,
  hashSpan,
  splitMcpToolName,
  truncateLabel,
} from '../../../src/ui/utils/transcript/spanLabels.js'
import type { ToolSpan } from '../../../src/ui/utils/transcript/spanTypes.js'
import { normalize, resetIds, toolPair } from './fixtures/messages.js'

beforeEach(resetIds)

function spanFor(pairs: Array<[string, Record<string, unknown>]>): ToolSpan {
  const messages = pairs.flatMap(([name, input], i) =>
    toolPair(name, input, `t${i}`, { at: i * 2 })
  )
  return deriveSpans(normalize(messages)).spans[0] as ToolSpan
}

describe('describeToolCall', () => {
  it('picks the identifying property per tool', () => {
    expect(describeToolCall('Bash', { command: 'pnpm test' })).toBe('pnpm test')
    expect(describeToolCall('Read', { file_path: '/a/b/c.ts' })).toBe('/a/b/c.ts')
    expect(describeToolCall('Grep', { pattern: 'foo', path: 'src' })).toBe('foo in src')
    expect(describeToolCall('Task', { description: 'Explore', prompt: 'long...' })).toBe('Explore')
    expect(describeToolCall('WebFetch', { url: 'https://x.dev' })).toBe('https://x.dev')
    expect(describeToolCall('NotebookEdit', { notebook_path: '/n.ipynb' })).toBe('/n.ipynb')
  })

  it('summarises TodoWrite by progress', () => {
    expect(
      describeToolCall('TodoWrite', {
        todos: [{ status: 'completed' }, { status: 'pending' }, { status: 'completed' }],
      })
    ).toBe('3 todos · 2 done')
  })

  it('falls back to the first string input, and tolerates no input', () => {
    expect(describeToolCall('Mystery', { count: 3, note: 'hello' })).toBe('hello')
    expect(describeToolCall('Mystery', {})).toBe('')
    expect(describeToolCall('Mystery', null)).toBe('')
  })

  it('strips an mcp__server__tool prefix', () => {
    expect(splitMcpToolName('mcp__chrome-devtools__take_screenshot')).toEqual({
      server: 'chrome-devtools',
      tool: 'take_screenshot',
    })
    expect(splitMcpToolName('Bash')).toEqual({ server: null, tool: 'Bash' })
  })

  it('truncates at the boundary rather than mid-flow', () => {
    expect(truncateLabel('a'.repeat(120))).toHaveLength(120)
    expect(truncateLabel('a'.repeat(121))).toHaveLength(120)
    expect(truncateLabel('a'.repeat(121)).endsWith('…')).toBe(true)
    expect(truncateLabel('  multi\n  line  ')).toBe('multi line')
  })
})

describe('deriveToolSpanLabel', () => {
  it('names a uniform run of commands', () => {
    expect(spanFor([['Bash', { command: 'ls' }], ['Bash', { command: 'pwd' }]]).label).toBe(
      '2 Bash commands'
    )
  })

  it('names a uniform run of file reads by their shared directory', () => {
    expect(
      spanFor([
        ['Read', { file_path: 'src/ui/components/A.tsx' }],
        ['Read', { file_path: 'src/ui/components/B.tsx' }],
      ]).label
    ).toBe('Read 2 files in src/ui/components')
  })

  it('names a dominant tool with a remainder', () => {
    const label = spanFor([
      ['Bash', { command: 'a' }],
      ['Bash', { command: 'b' }],
      ['Bash', { command: 'c' }],
      ['Read', { file_path: '/x.ts' }],
    ]).label
    expect(label).toBe('Bash ×3 and 1 other')
  })

  it('falls back to a verb for a genuinely mixed run', () => {
    expect(
      spanFor([
        ['Read', { file_path: '/a.ts' }],
        ['Grep', { pattern: 'x' }],
        ['Glob', { pattern: '*.ts' }],
      ]).label
    ).toBe('Explored 3 locations')
  })

  it('appends a failure count', () => {
    const messages = [
      ...toolPair('Bash', { command: 'ok' }, 't1', { at: 0 }),
      ...toolPair('Bash', { command: 'bad' }, 't2', { at: 2, isError: true }),
    ]
    const span = deriveSpans(normalize(messages)).spans[0] as ToolSpan
    expect(span.label).toBe('2 Bash commands (1 failed)')
  })

  it('handles the empty case without throwing', () => {
    expect(deriveToolSpanLabel([])).toBe('No tool calls')
  })
})

describe('hashSpan', () => {
  it('is stable for the same calls and differs when they change', () => {
    const a = spanFor([['Bash', { command: 'ls' }]])
    resetIds()
    const b = spanFor([['Bash', { command: 'ls' }]])
    resetIds()
    const c = spanFor([['Read', { file_path: '/a.ts' }]])

    expect(hashSpan(a)).toBe(hashSpan(b))
    expect(hashSpan(a)).not.toBe(hashSpan(c))
  })
})
