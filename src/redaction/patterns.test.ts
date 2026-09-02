import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type RedactionPattern, patterns } from './patterns.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('redaction patterns', () => {
  it('matches patterns.json, which the desktop app also reads', async () => {
    // The generated module is only correct until someone edits patterns.json without re-running
    // `pnpm generate:patterns`, and a silent drift here means the CLI and the desktop app redact
    // different things.
    const json = JSON.parse(
      await readFile(join(here, 'patterns.json'), 'utf-8')
    ) as RedactionPattern[]

    expect(patterns).toEqual(json)
  })

  it('compiles every pattern as a regular expression', () => {
    for (const p of patterns) {
      const flags = `${p.caseInsensitive ? 'i' : ''}${p.multiline ? 'm' : ''}`
      expect(() => new RegExp(p.pattern, flags), p.name).not.toThrow()
    }
  })
})
