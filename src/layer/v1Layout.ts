import type { Board } from '../board/schema'
import { overlaps, type Point, type Rect } from '../layout/geometry'

/*
 * The layout of version 1, kept only to read version 1 overlays. Version 1 stored the position of every card, including
 * the ones the layout placed, so an upgrade compares each stored position with this layout to tell moved cards apart.
 */

const SIZE = { width: 260, height: 150 }
const COLUMN_WIDTH = 440
const ROW_HEIGHT = 240
const CARD_GAP = 20

function gridLayout(board: Board): Record<string, Point> {
  const groupIds = board.groups.map((g) => g.id)
  const known = new Set(groupIds)
  const keyOf = (groupId: string | undefined) => (groupId !== undefined && known.has(groupId) ? groupId : '')
  const order = [...groupIds, '']
  const members = new Map<string, string[]>(order.map((k) => [k, []]))
  for (const c of board.components) members.get(keyOf(c.group))?.push(c.id)
  const out: Record<string, Point> = {}
  let column = 0
  for (const key of order) {
    const ids = members.get(key) ?? []
    if (ids.length === 0) continue
    ids.forEach((id, row) => {
      out[id] = { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT }
    })
    column++
  }
  return out
}

const spaced = (r: Rect): Rect => ({ x: r.x, y: r.y, width: r.width + CARD_GAP, height: r.height + CARD_GAP })

/** Where version 1 put every card that had no stored position: the board position, else a free slot of its grid. */
export function v1Placement(board: Board): Record<string, Point> {
  const out: Record<string, Point> = {}
  const placed: Rect[] = []
  const pending: string[] = []
  for (const c of board.components) {
    if (!c.position) {
      pending.push(c.id)
      continue
    }
    out[c.id] = { x: c.position.x, y: c.position.y }
    placed.push({ ...c.position, ...SIZE })
  }
  const defaults = gridLayout(board)
  const free = (r: Rect) => !placed.some((q) => overlaps(spaced(r), spaced(q)))
  for (const id of pending) {
    const slot = defaults[id] ?? { x: 0, y: 0 }
    let spot: Rect = { ...slot, ...SIZE }
    if (!free(spot)) {
      const inColumn = placed.filter((q) => Math.abs(q.x - slot.x) < COLUMN_WIDTH / 2)
      let y = inColumn.length > 0 ? Math.max(...inColumn.map((q) => q.y)) + ROW_HEIGHT : slot.y
      spot = { ...slot, y, ...SIZE }
      while (!free(spot)) {
        y += ROW_HEIGHT
        spot = { ...slot, y, ...SIZE }
      }
    }
    out[id] = { x: spot.x, y: spot.y }
    placed.push(spot)
  }
  return out
}
