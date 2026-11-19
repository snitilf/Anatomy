// Small helpers that turn a problem into a concrete fix: the nearest known name, a free ID, a valid ID.
// They only compare strings. Nothing from a board is ever run.

/** Edit distance between two strings: inserts, deletes, and replaces each count one. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const replace = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, replace))
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/** Shorter values get no suggestion: "api" and "app" are one edit apart, but that is rarely a typo. */
const MIN_LENGTH = 4
/** Longer values and candidates are skipped, so a huge ID cannot make the comparison slow. */
const MAX_LENGTH = 200
/** With more candidates than this, no suggestion is made, so the work stays small. */
const MAX_CANDIDATES = 5000

/**
 * The candidate closest to `value`, when it is close enough to be a likely typo: at most a third of the longer string
 * differs, with a floor of one edit. A tie between two candidates gives no suggestion, because a guess could mislead.
 */
export function nearest(value: string, candidates: Iterable<string>): string | undefined {
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) return undefined
  const lower = value.toLowerCase()
  let best: string | undefined
  let bestDistance = Infinity
  let tie = false
  let seen = 0
  for (const candidate of candidates) {
    if (++seen > MAX_CANDIDATES) return undefined
    if (candidate === value || candidate.length > MAX_LENGTH) continue
    const allowed = Math.max(1, Math.floor(Math.max(value.length, candidate.length) / 3))
    if (Math.abs(candidate.length - value.length) > allowed) continue
    const distance = editDistance(lower, candidate.toLowerCase())
    if (distance > allowed) continue
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
      tie = false
    } else if (distance === bestDistance) {
      tie = true
    }
  }
  return tie ? undefined : best
}

/** `id-2`, `id-3`, and so on: the first one that is not taken and fits in `maxLength`. */
export function freeId(id: string, taken: ReadonlySet<string>, maxLength = Infinity): string {
  const stem = id.replace(/-\d+$/, '')
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const candidate = `${stem.slice(0, maxLength - suffix.length).replace(/-+$/, '')}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

/** A valid ID made from any text: lowercase letters and digits joined by single hyphens. Empty when nothing is left. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
