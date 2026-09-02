/**
 * Session totals extraction contract.
 *
 * The data shapes themselves live in `@guidemode/types` so that both `ParsedSession`
 * definitions can reference them without this package and the types package depending
 * on each other.
 */

import type { ProviderSessionTotals } from '@guidemode/types'

export type { ProviderModelUsage, ProviderSessionTotals } from '@guidemode/types'

export interface SessionTotalsExtractor {
  /** Provider names this extractor handles, as they appear on the session record. */
  readonly providers: readonly string[]
  /**
   * Pull totals out of raw transcript lines. Must never throw: a malformed or
   * unrecognised record returns null so that metrics extraction degrades rather than
   * failing the whole session.
   */
  extract(lines: string[]): ProviderSessionTotals | null
}
