import { charWidth } from './textMeasure'

/**
 * The three detail levels on the map (D143):
 * - `full`: cards show title, summary, and badges; all lines and labels show.
 * - `title`: cards show their title alone and keep every line and label.
 * - `far`: groups show as named blocks and lines bundle per pair of groups.
 */
export type DetailLevel = 'full' | 'title' | 'far'

/** Below this zoom a 12px summary draws under 9px on screen, so cards switch to titles alone. */
export const TITLE_ENTER = 0.75
/** Hysteresis band above `TITLE_ENTER` so a small resize at the threshold does not flip the level. */
export const TITLE_EXIT = 0.79

/** Below this zoom a 240px card is too narrow for an 11px title in two lines, so the map switches to the far view. */
export const FAR_ENTER = 0.45
/** Hysteresis band above `FAR_ENTER` so a small resize at the threshold does not flip the level. */
export const FAR_EXIT = 0.49

/** The detail level for a zoom on its own, used when a board opens (never from an earlier board's state). */
export function detailFor(zoom: number): DetailLevel {
  if (zoom < FAR_ENTER) return 'far'
  if (zoom < TITLE_ENTER) return 'title'
  return 'full'
}

/** The next detail level for a zoom, with hysteresis at both thresholds so small resizes do not flicker. */
export function nextDetail(was: DetailLevel, zoom: number): DetailLevel {
  if (was === 'far') {
    if (zoom < FAR_EXIT) return 'far'
    return zoom < TITLE_ENTER ? 'title' : 'full'
  }
  if (was === 'title') {
    if (zoom < FAR_ENTER) return 'far'
    if (zoom >= TITLE_EXIT) return 'full'
    return 'title'
  }
  if (zoom < FAR_ENTER) return 'far'
  if (zoom < TITLE_ENTER) return 'title'
  return 'full'
}

/** Whether the map is in the far view at this zoom, given whether it was before. */
export function nextFar(was: boolean, zoom: number): boolean {
  return was ? zoom < FAR_EXIT : zoom < FAR_ENTER
}

/** Smallest readable text on screen, in CSS pixels (D143). */
const MIN_TEXT_PX = 11
const TITLE_BASE_PX = 13
const LABEL_BASE_PX = 11

/** Quarter steps of growth in the far view, so group and bundle labels hold 11 to 13px on screen. */
const FAR_STEP = 4
/** Tenth steps in full and title views, so text stays >= 11px on screen with small discrete jumps. */
const NEAR_STEP = 10

/** How much line and group labels are drawn larger on the board in the far view, so their text stays at its base size on screen. */
export function farLabelScale(zoom: number): number {
  return Math.ceil((1 / Math.max(zoom, 0.01)) * FAR_STEP - 1e-6) / FAR_STEP
}

/** How much line and group labels grow on the board so they never draw under 11px on screen. */
export function labelScale(zoom: number, far: boolean): number {
  if (far) return farLabelScale(zoom)
  const needed = MIN_TEXT_PX / (LABEL_BASE_PX * Math.max(zoom, 0.01))
  if (needed <= 1) return 1
  return Math.ceil(needed * NEAR_STEP - 1e-6) / NEAR_STEP
}

/** How much card titles grow on the board so they never draw under 11px on screen. */
export function titleScale(zoom: number): number {
  const needed = MIN_TEXT_PX / (TITLE_BASE_PX * Math.max(zoom, 0.01))
  if (needed <= 1) return 1
  return Math.ceil(needed * NEAR_STEP - 1e-6) / NEAR_STEP
}

/** What the current view hides, in plain words, or undefined when all lines and labels are shown. */
export function hiddenDetailText(detail: DetailLevel, quiet: boolean, heldBackLabels: number): string | undefined {
  if (detail === 'far') return 'Lines and labels hidden'
  if (quiet) return 'Labels hidden'
  if (heldBackLabels > 0) return heldBackLabels === 1 ? '1 label hidden' : `${heldBackLabels} labels hidden`
  return undefined
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
