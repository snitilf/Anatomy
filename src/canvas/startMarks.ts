import type { Rect } from '../layout/geometry'

/** The mark where a walkthrough starts: a circle this wide on screen, this far in from its corner, in screen pixels (D143: nothing is drawn under its size on screen). */
export const MARK_PX = 14
export const MARK_INSET = 4
/** In the far view a tile is low, so the mark is inset less and may shrink to this many pixels. */
const FAR_INSET = 3
const FAR_SIZES = [14, 13, 12, 11]

export type Corner = 'tr' | 'tl' | 'br' | 'bl'

/** The corners to try on a card, in order. The bottom left is the row of the lesson and note badges, so the mark never takes it. */
export const CARD_CORNERS: readonly Corner[] = ['tr', 'tl', 'br']
/** The corners to try on a tile: the top ones belong to the names of the groups and to the note dot. */
export const TILE_CORNERS: readonly Corner[] = ['br', 'bl']

const touches = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** The box of a mark inside a card, on one of its corners, `inset` from both edges. */
export function markBox(card: Rect, corner: Corner, side: number, inset: number): Rect {
  const x = corner === 'tl' || corner === 'bl' ? card.x + inset : card.x + card.width - inset - side
  const y = corner === 'tl' || corner === 'tr' ? card.y + inset : card.y + card.height - inset - side
  return { x, y, width: side, height: side }
}

/**
 * The first corner of `order` where the mark is clear of everything in `avoid` at every one of `scales`. Labels and marks both grow
 * with the label scale, from different points, so a corner is free only when it is free at each scale the map may draw them at.
 */
export function freeCorner(card: Rect, order: readonly Corner[], scales: readonly number[], avoid: (scale: number) => readonly Rect[]): Corner | undefined {
  const lists = scales.map((scale) => ({ scale, list: avoid(scale) }))
  return order.find((corner) => lists.every(({ scale, list }) => !list.some((r) => touches(markBox(card, corner, MARK_PX * scale, MARK_INSET * scale), r))))
}

/**
 * The mark of a tile in the far view, in board units at this label scale: the largest size that fits inside the tile at the bottom
 * right, or the bottom left, clear of `avoid` (the group names that sit over tiles). `undefined` when no size fits.
 */
export function farMark(tile: Rect, scale: number, avoid: readonly Rect[]): { corner: Corner; box: Rect } | undefined {
  for (const px of FAR_SIZES) {
    const side = px * scale
    for (const corner of TILE_CORNERS) {
      const box = markBox(tile, corner, side, FAR_INSET * scale)
      if (box.x < tile.x || box.y < tile.y || box.x + side > tile.x + tile.width || box.y + side > tile.y + tile.height) continue
      if (!avoid.some((r) => touches(box, r))) return { corner, box }
    }
  }
  return undefined
}
