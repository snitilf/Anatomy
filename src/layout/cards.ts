import type { Board } from '../board/schema'
import { overlaps, type Point, type Rect, type Size } from './geometry'

/** The size of a card the user has not resized. */
export const CARD_SIZE: Readonly<Size> = { width: 260, height: 150 }
export const COLUMN_WIDTH = 440
export const ROW_HEIGHT = 240
const CARD_GAP = 20

/** What the user changed about where cards sit and how big they are. Both are keyed by component ID. */
export interface CardPlacement {
  positions: Readonly<Record<string, Point>>
  sizes: Readonly<Record<string, Size>>
}

const own = <T,>(record: Readonly<Record<string, T>>, id: string): T | undefined => (Object.hasOwn(record, id) ? record[id] : undefined)

function cardSize(placement: Pick<CardPlacement, 'sizes'>, id: string): Size {
  const size = own(placement.sizes, id)
  return size ? { width: size.width, height: size.height } : { ...CARD_SIZE }
}

/** Column index per component: groups with members in file order, then ungrouped. */
function columnsOf(board: Board): { columnOf: Map<string, number>; rows: Map<string, number> } {
  const groupIds = board.groups.map((g) => g.id)
  const known = new Set(groupIds)
  const keyOf = (groupId: string | undefined) => (groupId !== undefined && known.has(groupId) ? groupId : '')
  const order = [...groupIds, '']
  const members = new Map<string, string[]>(order.map((k) => [k, []]))
  for (const c of board.components) members.get(keyOf(c.group))?.push(c.id)

  const columnOf = new Map<string, number>()
  const rows = new Map<string, number>()
  let column = 0
  for (const key of order) {
    const ids = members.get(key) ?? []
    if (ids.length === 0) continue
    ids.forEach((id, row) => {
      columnOf.set(id, column)
      rows.set(id, row)
    })
    column++
  }
  return { columnOf, rows }
}

/** Deterministic grid layout. Ignores every stored position. */
export function defaultLayout(board: Board): Record<string, Point> {
  const { columnOf, rows } = columnsOf(board)
  const out: Record<string, Point> = {}
  for (const c of board.components) {
    out[c.id] = { x: (columnOf.get(c.id) ?? 0) * COLUMN_WIDTH, y: (rows.get(c.id) ?? 0) * ROW_HEIGHT }
  }
  return out
}

const spaced = (r: Rect): Rect => ({ x: r.x, y: r.y, width: r.width + CARD_GAP, height: r.height + CARD_GAP })

/**
 * Where every card sits and how big it is. A position the user set wins, then the board's position, then a slot of the
 * default layout. A card with no fixed position takes its slot, or the first free spot below it when a card the board
 * placed is there. Cards the user moved never push other cards: moving one card moves nothing else.
 * Nothing is stored: the auto-placed cards follow the layout every time.
 */
export function placeCards(board: Board, placement: CardPlacement): Record<string, Rect> {
  const out: Record<string, Rect> = {}
  const placed: Rect[] = []
  const pending: string[] = []
  for (const c of board.components) {
    const moved = own(placement.positions, c.id)
    const fixed = moved ?? c.position
    if (!fixed) {
      pending.push(c.id)
      continue
    }
    const rect = { x: fixed.x, y: fixed.y, ...cardSize(placement, c.id) }
    out[c.id] = rect
    if (!moved) placed.push(rect)
  }
  if (pending.length === 0) return out

  const defaults = defaultLayout(board)
  const free = (r: Rect) => !placed.some((q) => overlaps(spaced(r), spaced(q)))

  for (const id of pending) {
    const slot = defaults[id] ?? { x: 0, y: 0 }
    const size = cardSize(placement, id)
    let spot: Rect = { ...slot, ...size }
    if (!free(spot)) {
      const inColumn = placed.filter((q) => Math.abs(q.x - slot.x) < COLUMN_WIDTH / 2)
      let y = inColumn.length > 0 ? Math.max(...inColumn.map((q) => q.y)) + ROW_HEIGHT : slot.y
      spot = { x: slot.x, y, ...size }
      while (!free(spot)) {
        y += ROW_HEIGHT
        spot = { x: slot.x, y, ...size }
      }
    }
    out[id] = spot
    placed.push(spot)
  }
  return out
}
