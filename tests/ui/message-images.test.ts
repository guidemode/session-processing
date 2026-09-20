/**
 * A pasted screenshot has to survive the whole way: the canonical JSONL line,
 * the parser, and the message processor that builds the blocks the transcript
 * renders. It used to be dropped by the parser, so the UI's image support —
 * which has existed all along — was unreachable for every provider.
 */

import { describe, expect, it } from 'vitest'
import { CanonicalParser } from '../../src/parsers/canonical/parser.js'
import { CanonicalMessageProcessor } from '../../src/ui/utils/processors/CanonicalMessageProcessor.js'

const PNG = 'iVBORw0KGgo='

const line = JSON.stringify({
  uuid: 'img-1',
  sessionId: 'session-1',
  type: 'user',
  provider: 'claude-code',
  timestamp: '2025-10-01T00:00:00Z',
  message: {
    role: 'user',
    content: [
      { type: 'text', text: 'One small thing I notice - [Image #12] - the part is stale.' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
    ],
  },
})

describe('pasted images reach the transcript', () => {
  it('renders the text and then the image', () => {
    const { messages } = new CanonicalParser().parseSession(line)
    const [timelineMessage] = new CanonicalMessageProcessor().normalizeAll(
      messages as unknown as Parameters<CanonicalMessageProcessor['normalizeAll']>[0]
    )

    expect(timelineMessage.contentBlocks.map(block => block.type)).toEqual(['text', 'image'])

    const image = timelineMessage.contentBlocks[1]
    expect(image.content).toBe(`data:image/png;base64,${PNG}`)
    expect(image.metadata?.format).toBe('png')
  })
})
