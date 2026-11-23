import type { Board } from '../board/schema'
import type { Rect } from './geometry'

/**
 * A board of more parts than this is read in the far view when fitted. Its layout keeps more room, so the bundles
 * between the blocks run straight and apart (see `autoLayout`).
 */
export const FAR_PARTS = 24

/** Room inside a group area around its cards. The name sits in the top band, the same on every board. */
export const GROUP_PADDING = { side: 16, top: 46, bottom: 16 } as const
const FAR_GROUP_PADDING = { side: 24, top: 46, bottom: 24 } as const

/** The room inside the group areas of this board. */
export function groupPadding(board: Pick<Board, 'components'>): { side: number; top: number; bottom: number } {
  return board.components.length > FAR_PARTS ? FAR_GROUP_PADDING : GROUP_PADDING
}

/** The area of each group around the given card rects, keyed by group ID. */
export function groupAreas(board: Board, rects: Readonly<Record<string, Rect>>): Record<string, Rect> {
  const out: Record<string, Rect> = {}
  const pad = groupPadding(board)
  for (const g of board.groups) {
    const members = board.components.filter((c) => c.group === g.id && rects[c.id]).map((c) => rects[c.id] as Rect)
    if (members.length === 0) continue
    const minX = Math.min(...members.map((r) => r.x))
    const minY = Math.min(...members.map((r) => r.y))
    const maxX = Math.max(...members.map((r) => r.x + r.width))
    const maxY = Math.max(...members.map((r) => r.y + r.height))
    out[g.id] = {
      x: minX - pad.side,
      y: minY - pad.top,
      width: maxX - minX + pad.side * 2,
      height: maxY - minY + pad.top + pad.bottom,
    }
  }
  return out
}
