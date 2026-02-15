import patternsJson from './patterns.json'

export interface RedactionPattern {
  name: string
  pattern: string
  caseInsensitive: boolean
  multiline: boolean
  captureGroup: number | null
  replacement: string | null
}

export const patterns: RedactionPattern[] = patternsJson as RedactionPattern[]
