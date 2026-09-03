/**
 * Runs the real metric processors over local Claude Code sessions and prints the values
 * the five corrected metrics now produce.
 *
 * This exists because the defects it guards against were only visible on real transcripts:
 * `avg_tokens_per_message` was the constant 2 on every session, interruption rate
 * over-counted 4.9x, and input clarity collapsed into a 3-12% band. Fixtures can pin the
 * mechanics; only real sessions show the distribution.
 *
 *   pnpm tsx scripts/compare-metric-fixes.ts [limit]
 *
 * Reads ~/.claude/projects. Read-only.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CanonicalParser } from '../src/parsers/canonical/parser.js'
import { CanonicalContextProcessor } from '../src/processors/canonical/metrics/context.js'
import { CanonicalEngagementProcessor } from '../src/processors/canonical/metrics/engagement.js'
import { CanonicalQualityProcessor } from '../src/processors/canonical/metrics/quality.js'
import { CanonicalUsageProcessor } from '../src/processors/canonical/metrics/usage.js'

const limit = Number(process.argv[2] ?? 30)
/** Optional substring filter on the session path, e.g. a single project directory. */
const filter = process.argv[3] ?? ''
const root = join(homedir(), '.claude', 'projects')

function findSessions(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...findSessions(path))
    else if (entry.name.endsWith('.jsonl')) out.push(path)
  }
  return out
}

/**
 * Claude Code's own JSONL is the canonical format minus `provider`, plus line types the
 * canonical parser does not model (`system`, `summary`). Add the one and drop the others.
 */
function toCanonical(raw: string): string {
  const lines: string[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry.type !== 'user' && entry.type !== 'assistant') continue
      if (!entry.message?.role) continue
      lines.push(JSON.stringify({ ...entry, provider: 'claude-code' }))
    } catch {
      // Truncated trailing line; ignore.
    }
  }
  return lines.join('\n')
}

const parser = new CanonicalParser()
const context = new CanonicalContextProcessor()
const engagement = new CanonicalEngagementProcessor()
const quality = new CanonicalQualityProcessor()
const usage = new CanonicalUsageProcessor()

const files = findSessions(root)
  .filter(f => f.includes(filter))
  .map(f => ({ f, mtime: statSync(f).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)
  .slice(0, limit)

console.log(
  ['session'.padEnd(10), 'tok/msg'.padStart(8), 'clarity'.padStart(8), 'intr'.padStart(5),
   'rate%'.padStart(6), 'iter'.padStart(5), 'quality'.padStart(8), 'todo'.padStart(5)].join(' ')
)

const tokens: number[] = []
const clarities: number[] = []
let totalInterruptions = 0
let totalIterations = 0

for (const { f } of files) {
  const content = toCanonical(readFileSync(f, 'utf8'))
  if (!content) continue

  const session = parser.parseSession(content, 'claude-code')
  if (session.messages.length === 0) continue

  const ctx = context.canProcess(session) ? await context.process(session) : null
  const eng = await engagement.process(session)
  const qua = await quality.process(session)
  const usg = await usage.process(session)

  const avgTokens = (ctx?.avg_tokens_per_message as number) ?? 0
  if (avgTokens > 0) tokens.push(avgTokens)
  clarities.push(usg.input_clarity_score as number)
  totalInterruptions += eng.total_interruptions as number
  totalIterations += qua.iteration_count as number

  console.log(
    [
      f.split('/').pop()!.slice(0, 8).padEnd(10),
      String(avgTokens).padStart(8),
      String(usg.input_clarity_score).padStart(8),
      String(eng.total_interruptions).padStart(5),
      String(eng.interruption_rate).padStart(6),
      String(qua.iteration_count).padStart(5),
      String(qua.process_quality_score).padStart(8),
      String(qua.used_todo_tracking).padStart(5),
    ].join(' ')
  )
}

const range = (xs: number[]) =>
  xs.length ? `${Math.min(...xs)}-${Math.max(...xs)}` : 'n/a'

console.log(`\nsessions: ${files.length}`)
console.log(`avg tokens/message range: ${range(tokens)}   (was the constant 2)`)
console.log(`input clarity range:      ${range(clarities)}   (was 3-12)`)
console.log(`total interruptions:      ${totalInterruptions}`)
console.log(`total iterations:         ${totalIterations}`)
