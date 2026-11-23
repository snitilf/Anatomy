import { BOARD_FORMAT, LIMITS } from '../board/schema.ts'
import { freeId, slugify } from '../board/suggest.ts'

// Making IDs and reading what a board already uses, for `anatomy id` and for `apply`, which gives an ID to an added
// item that has none. Everything here works on data and runs nothing from it.

type Obj = Record<string, unknown>

const isObj = (value: unknown): value is Obj => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The lists whose items have an `id`. */
const ID_LISTS = ['groups', 'components', 'relationships', 'items', 'scenarios'] as const

/** Every ID in use on a board: the board itself and every item of every list. They share one set of IDs. */
export function idsOn(doc: Obj): Set<string> {
  const ids = new Set<string>()
  if (typeof doc.id === 'string') ids.add(doc.id)
  for (const name of ID_LISTS) {
    const list = doc[name]
    if (Array.isArray(list)) for (const entry of list) if (isObj(entry) && typeof entry.id === 'string') ids.add(entry.id)
  }
  return ids
}

/**
 * A valid ID that is not in `taken`, made from `text`: `payment-step`, then `payment-step-2`. Undefined when the text
 * has no letter or digit that an ID can keep.
 */
export function makeId(text: string, taken: ReadonlySet<string>): string | undefined {
  const slug = slugify(text).slice(0, LIMITS.id).replace(/-+$/, '')
  if (slug === '') return undefined
  return taken.has(slug) ? freeId(slug, taken, LIMITS.id) : slug
}

/** The board file name without `.json`, plus `.prev.json`: `board.json` keeps its last version as `board.prev.json`. */
export function previousName(board: string): string {
  const name = board.slice(Math.max(board.lastIndexOf('/'), board.lastIndexOf('\\')) + 1)
  return `${name.replace(/\.json$/i, '')}.prev.json`
}

/**
 * The revision in the text of a board, or undefined when the text is not a board of the same `id`, or has no revision
 * that is a safe whole number of 1 or more. A file that belongs to another board says nothing about this one.
 */
export function revisionIn(text: string, boardId: string): number | undefined {
  try {
    const doc: unknown = JSON.parse(text.replace(/^\uFEFF/, ''))
    if (!isObj(doc) || doc.format !== BOARD_FORMAT || doc.id !== boardId) return undefined
    const revision = doc.revision
    return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1 ? revision : undefined
  } catch {
    return undefined
  }
}
