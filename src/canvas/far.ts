import { charWidth } from './textMeasure'

/**
 * The far view: below the zoom where a card title (13px) would draw under 9px on screen, the map shows its groups as
 * named blocks and its lines as one bundle per pair of groups.
 */

/** A title of 13px is under 9px on screen below 9 / 13 = 0.692, so the far view starts just under 0.7. */
export const FAR_ENTER = 0.69
/**
 * The far view ends at the zoom where a card shows its summary again (`SUMMARY_ZOOM`). The band between the two keeps a
 * zoom that rests near the threshold from flipping the map back and forth.
 */
export const FAR_EXIT = 0.75

/** Whether the map is in the far view at this zoom, given whether it was before. */
export function nextFar(was: boolean, zoom: number): boolean {
  return was ? zoom < FAR_EXIT : zoom < FAR_ENTER
}

/** Quarter steps of growth, so the labels hold a size of 11 to 13px on screen and a zoom writes a few times. */
const FAR_STEP = 4

/** How much line and group labels are drawn larger on the board, so their text stays at its base size on screen. */
export function farLabelScale(zoom: number): number {
  return Math.ceil((1 / Math.max(zoom, 0.01)) * FAR_STEP - 1e-6) / FAR_STEP
}

/** The zoom a group is framed at, at least, when it is picked in the far view: cards show their text there. */
export const GROUP_FRAME_ZOOM = 0.8

/** The name on a tile is 11px medium, 6px in from each edge, and cut with an ellipsis. */
const NAME_PADDING = 12
const NAME_ELLIPSIS = 10
/** A name always shows at least this many characters before the ellipsis. */
const NAME_CHARS = 8

/** The width of eight typical letters of a name at 11px medium, from the interface font's own table. */
const NAME_SAMPLE = [...'Componen'].reduce((sum, c) => sum + charWidth(c, 'label'), 0) * 1.06

/** A tile at least this wide on screen carries its part's name in the far view. Narrower ones rely on the pointer. */
export const NAMED_TILE_PX = Math.ceil(NAME_PADDING + NAME_ELLIPSIS + (NAME_SAMPLE * NAME_CHARS) / 8)

/** A tile at least this tall and with at least this much room inside wraps its name to two lines. */
export const WRAP_TILE_HEIGHT_PX = 30
export const WRAP_TILE_INNER_PX = 80

/** How many lines the name of a tile of this size takes on screen at this zoom: none, one, or two. */
export function nameLines(zoom: number, width: number, height: number): 0 | 1 | 2 {
  if (zoom * width < NAMED_TILE_PX) return 0
  return zoom * height >= WRAP_TILE_HEIGHT_PX && zoom * width - NAME_PADDING >= WRAP_TILE_INNER_PX ? 2 : 1
}
