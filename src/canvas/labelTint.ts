import { pillHeight } from './labelPlacement'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A held-back label takes its own width on hover, up to this much. */
const HELD_BACK_WIDTH = 260
/** The label grows a little when selected: a margin so a group at its edge is still counted. */
const MARGIN = 8

/**
 * The group areas under a label, as text, each one placed from the middle of the label: `dx,dy,width,height` in map units, areas joined with `;`.
 * A text keeps the edge data equal from one build to the next when nothing moved.
 * The label paints these areas again under its words, so the cutout matches the map under it on every side of a group edge.
 */
export function labelTint(groups: readonly Box[], x: number, y: number, width: number, lines: number, heldBack: boolean): string {
  const halfW = (heldBack ? HELD_BACK_WIDTH : width) / 2 + MARGIN
  const halfH = pillHeight(heldBack ? 2 : lines) / 2 + MARGIN
  const under: string[] = []
  for (const g of groups) {
    if (g.x >= x + halfW || g.x + g.width <= x - halfW || g.y >= y + halfH || g.y + g.height <= y - halfH) continue
    under.push([g.x - x, g.y - y, g.width, g.height].map((n) => Math.round(n * 10) / 10).join(','))
  }
  return under.join(';')
}

export interface TintBox {
  left: number
  top: number
  width: number
  height: number
}

/** The areas of {@link labelTint}, read back. */
export function readTint(tint: string): TintBox[] {
  if (tint === '') return []
  return tint.split(';').map((part) => {
    const [left = 0, top = 0, width = 0, height = 0] = part.split(',').map(Number)
    return { left, top, width, height }
  })
}
