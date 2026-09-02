#!/usr/bin/env node
/**
 * Generate `src/redaction/patterns.generated.ts` from `patterns.json`.
 *
 * `patterns.json` stays the single source of truth because the Rust desktop app reads the same
 * file. It cannot be imported directly from TypeScript, though: Node's ESM loader requires an
 * `with { type: 'json' }` attribute, and that attribute is rejected by the CommonJS build. Emitting
 * a plain TypeScript module sidesteps both.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, '..', 'src', 'redaction', 'patterns.json')
const target = join(here, '..', 'src', 'redaction', 'patterns.generated.ts')

const patterns = JSON.parse(await readFile(source, 'utf-8'))

const contents = `// Generated from patterns.json by scripts/generate-patterns.mjs — do not edit by hand.
import type { RedactionPattern } from './patterns.js'

export const patternsData: RedactionPattern[] = ${JSON.stringify(patterns, null, 2)}
`

await writeFile(target, contents)
console.log(`Generated ${target} (${patterns.length} patterns)`)
