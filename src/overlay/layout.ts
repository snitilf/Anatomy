import type { Board } from '../board/schema'
import type { Overlay, Point } from './types'

export const COLUMN_WIDTH = 440
export const ROW_HEIGHT = 240
export const CARD_WIDTH = 260
export const CARD_HEIGHT = 150
export const CARD_GAP = 20

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

function collides(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < CARD_WIDTH + CARD_GAP && Math.abs(a.y - b.y) < CARD_HEIGHT + CARD_GAP
}

/**
 * Overlay position wins, then the board position, then a free slot.
 * A card that already has a position is never moved.
 */
export function resolvePositions(board: Board, overlay: Overlay): Record<string, Point> {
  const out: Record<string, Point> = {}
  const pending: string[] = []
  for (const c of board.components) {
    const own = Object.hasOwn(overlay.positions, c.id) ? overlay.positions[c.id] : undefined
    const fixed = own ?? c.position
    if (fixed) out[c.id] = { x: fixed.x, y: fixed.y }
    else pending.push(c.id)
  }
  if (pending.length === 0) return out

  const defaults = defaultLayout(board)
  const placed: Point[] = Object.values(out)
  const free = (p: Point) => !placed.some((q) => collides(p, q))

  for (const id of pending) {
    const slot = defaults[id] ?? { x: 0, y: 0 }
    let spot = slot
    if (!free(spot)) {
      const inColumn = placed.filter((q) => Math.abs(q.x - slot.x) < COLUMN_WIDTH / 2)
      let y = inColumn.length > 0 ? Math.max(...inColumn.map((q) => q.y)) + ROW_HEIGHT : slot.y
      spot = { x: slot.x, y }
      while (!free(spot)) {
        y += ROW_HEIGHT
        spot = { x: slot.x, y }
      }
    }
    out[id] = spot
    placed.push(spot)
  }
  return out
}
