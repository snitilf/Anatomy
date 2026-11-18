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

/** A tile at least this wide on screen is named under it in the far view. Narrower ones rely on the pointer. */
export const NAMED_TILE_PX = 48
