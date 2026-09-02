import { patternsData } from './patterns.generated.js'

export interface RedactionPattern {
  name: string
  pattern: string
  caseInsensitive: boolean
  multiline: boolean
  captureGroup: number | null
  replacement: string | null
}

/**
 * Sourced from patterns.json via a generated module rather than a direct JSON import: Node's ESM
 * loader needs an import attribute that the CommonJS build refuses to compile. Run
 * `pnpm generate:patterns` after editing patterns.json.
 */
export const patterns: RedactionPattern[] = patternsData
