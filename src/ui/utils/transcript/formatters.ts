/**
 * Display formatters for the condensed transcript.
 *
 * Pure and locale-independent — these are exercised directly by unit tests, so they
 * must not depend on the host's locale or clock.
 */

/**
 * `1.2s`, `143s`, `4m 12s`. Sub-second durations round to `<1s`, unknown to an em dash.
 *
 * Distinct from `formatDuration` in `todos/todoUtils` — that one assumes a real number
 * and never renders a placeholder.
 */
export function formatSpanDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return '<1s'
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`
}

/** `341`, `2.4k`, `837.7k`, `1.2m` — character or token counts at a glance. */
export function formatChars(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0'
  if (count < 1000) return String(Math.round(count))
  if (count < 1_000_000) {
    const thousands = count / 1000
    return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`
  }
  const millions = count / 1_000_000
  return `${millions < 10 ? millions.toFixed(1) : Math.round(millions)}m`
}

/** Thousands separators without pulling in a locale. */
export function formatCount(count: number): string {
  if (!Number.isFinite(count)) return '0'
  return String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** `12 pairs`, `1 pair` — small helper so callers stop hand-rolling plurals. */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${formatCount(count)} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}
