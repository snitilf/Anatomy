export interface OutlineRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * A small precomputed geometry snapshot of an example board, so the start screen
 * can draw a real miniature map without bundling the example board JSON files.
 */
export interface BoardOutline {
  readonly width: number
  readonly height: number
  readonly groups: readonly OutlineRect[]
  readonly cards: readonly OutlineRect[]
  readonly lines: readonly string[]
  readonly parts: number
  readonly connections: number
  readonly walkthroughs: number
}

/**
 * Compact tuple emitted by `npm run outlines`:
 * [width, height, parts, connections, walkthroughs, groupsFlat, cardW, cardH, cardXYFlat, linesJoined].
 * If cardW === 0, cardXYFlat holds 4-tuples [x, y, w, h] instead of 2-tuples [x, y].
 */
export type PackedOutline = readonly [
  width: number,
  height: number,
  parts: number,
  connections: number,
  walkthroughs: number,
  groups: readonly number[],
  cardW: number,
  cardH: number,
  cards: readonly number[],
  lines: string,
]

export function unpackOutline(p: PackedOutline | undefined): BoardOutline | undefined {
  if (!p) return undefined
  const rects = (flat: readonly number[], cw = 0, ch = 0) => {
    const out: OutlineRect[] = []
    for (let i = 0, s = cw > 0 ? 2 : 4; i < flat.length; i += s) {
      out.push({ x: flat[i]!, y: flat[i + 1]!, w: cw || flat[i + 2]!, h: ch || flat[i + 3]! })
    }
    return out
  }
  return {
    width: p[0],
    height: p[1],
    parts: p[2],
    connections: p[3],
    walkthroughs: p[4],
    groups: rects(p[5]),
    cards: rects(p[8], p[6], p[7]),
    lines: p[9] ? p[9].split(';') : [],
  }
}
