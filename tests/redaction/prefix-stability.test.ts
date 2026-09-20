/**
 * Redaction is line-local, and incremental upload depends on it.
 *
 * The CLI builds the whole canonical transcript each turn, then sends only the
 * bytes after the offset the server has acknowledged. That works only while
 * redacting a file that has GROWN leaves the earlier bytes byte-for-byte as
 * they were. If it did not, every turn would find its recorded prefix hash
 * stale and fall back to a full upload — silently undoing the whole thing.
 *
 * So: `redact(prefix) + redact(tail) === redact(whole)`, on a line boundary.
 */

import { describe, expect, it } from 'vitest'
import { redactJsonlContent } from '../../src/redaction/redactor.js'

const HOME = '/Users/example'

function line(index: number, content: string): string {
  return `${JSON.stringify({
    type: 'message',
    uuid: `uuid-${index}`,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    cwd: `${HOME}/work/project`,
    message: { role: 'user', content },
  })}\n`
}

const CASES: Array<{ name: string; lines: string[] }> = [
  {
    name: 'plain content',
    lines: [line(0, 'hello'), line(1, 'world'), line(2, 'goodbye')],
  },
  {
    name: 'content carrying secrets',
    lines: [
      line(0, 'my key is sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      line(1, 'and a token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
      line(2, 'and an address someone@example.com'),
    ],
  },
  {
    name: 'a malformed line passed through verbatim',
    lines: [line(0, 'fine'), 'not json at all\n', line(2, 'also fine')],
  },
  {
    name: 'a blank line',
    lines: [line(0, 'fine'), '\n', line(2, 'fine')],
  },
]

describe('redaction is prefix-stable', () => {
  for (const { name, lines } of CASES) {
    it(`splits anywhere on a line boundary: ${name}`, () => {
      const whole = redactJsonlContent(lines.join(''), HOME).content

      for (let cut = 1; cut < lines.length; cut++) {
        const prefix = redactJsonlContent(lines.slice(0, cut).join(''), HOME).content
        const tail = redactJsonlContent(lines.slice(cut).join(''), HOME).content
        expect(prefix + tail, `cut after line ${cut}`).toBe(whole)
      }
    })

    it(`leaves an already-redacted prefix untouched when the file grows: ${name}`, () => {
      // What the client actually does: redact the whole file again, every turn.
      // The bytes it already sent must still be there, unchanged, or its
      // recorded prefix hash stops matching.
      for (let known = 1; known < lines.length; known++) {
        const earlier = redactJsonlContent(lines.slice(0, known).join(''), HOME).content
        const later = redactJsonlContent(lines.join(''), HOME).content
        expect(later.slice(0, earlier.length)).toBe(earlier)
      }
    })
  }
})
