import type { Board } from '../board/schema'
import { groupBand, groupTitle } from '../canvas/bands'
import { computeGeometry, type EdgeShape, type Geometry } from '../canvas/buildGraph'
import { pillHeight, textArea } from '../canvas/labelPlacement'
import { placeCards } from '../layout/cards'
import type { Point, Rect } from '../layout/geometry'

type Run = readonly [Point, Point]

export interface Measured {
  geometry: Geometry
  rects: Record<string, Rect>
  edges: EdgeShape[]
}

/** The auto layout of a board with no saved positions, and every line and label drawn on it. */
export function measureBoard(board: Board): Measured {
  const rects = placeCards(board, { positions: {}, sizes: {} })
  const geometry = computeGeometry(board, rects)
  return { geometry, rects, edges: [...geometry.edges.values()] }
}

const runsOf = (e: EdgeShape): readonly Run[] => e.runs ?? []

export function pillRect(e: Pick<EdgeShape, 'labelX' | 'labelY' | 'labelWidth' | 'labelLines'>): Rect {
  const height = pillHeight(e.labelLines)
  return { x: e.labelX - e.labelWidth / 2, y: e.labelY - height / 2, width: e.labelWidth, height }
}

/** Labels that are drawn on the line, not held back for hover. */
export const shown = (edges: readonly EdgeShape[]) => edges.filter((e) => e.labelWidth > 0 && !e.labelHidden)

/** The least distance between two parallel runs of different lines that run alongside each other, and the pair that does. */
export function minParallel(edges: readonly EdgeShape[]): { distance: number; where: string } {
  let min = Infinity
  let where = ''
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      for (const [a, b] of runsOf(edges[i] as EdgeShape)) {
        for (const [c, d] of runsOf(edges[j] as EdgeShape)) {
          let dist: number | undefined
          if (a.y === b.y && c.y === d.y && Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))) dist = Math.abs(a.y - c.y)
          if (a.x === b.x && c.x === d.x && Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))) dist = Math.abs(a.x - c.x)
          if (dist !== undefined && dist < min) {
            min = dist
            where = `${(edges[i] as EdgeShape).id} / ${(edges[j] as EdgeShape).id}`
          }
        }
      }
    }
  }
  return { distance: min, where }
}

/** Runs that are neither horizontal nor vertical. */
export function slopedRuns(edges: readonly EdgeShape[]): number {
  let n = 0
  for (const e of edges) for (const [a, b] of runsOf(e)) if (a.x !== b.x && a.y !== b.y) n++
  return n
}

/** The gap between a box and a straight run: zero when they touch. */
export function boxToRun(box: Rect, [a, b]: Run): number {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  const dx = Math.max(box.x - x1, x0 - (box.x + box.width), 0)
  const dy = Math.max(box.y - y1, y0 - (box.y + box.height), 0)
  return Math.hypot(dx, dy)
}

/** The largest gap between a shown label and its own line. */
export function maxLabelGap(edges: readonly EdgeShape[]): { gap: number; where: string } {
  let max = 0
  let where = ''
  for (const e of shown(edges)) {
    const box = pillRect(e)
    const gap = Math.min(...runsOf(e).map((r) => boxToRun(box, r)))
    if (gap > max) {
      max = gap
      where = e.id
    }
  }
  return { gap: max, where }
}

const hits = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** Shown labels that overlap the name band of a group, or the text of a card. */
export function labelCollisions(m: Measured): { band: string[]; card: string[]; label: string[]; line: string[] } {
  const out = { band: [] as string[], card: [] as string[], label: [] as string[], line: [] as string[] }
  const list = shown(m.edges)
  for (const e of list) {
    const box = pillRect(e)
    if (m.geometry.groups.some((g) => hits(box, groupBand(g)))) out.band.push(e.id)
    if (Object.values(m.rects).some((r) => hits(box, textArea(r)))) out.card.push(e.id)
    if (list.some((o) => o.id < e.id && hits(box, pillRect(o)))) out.label.push(e.id)
    // Another line under the pill, which the pill would cut.
    if (m.edges.some((o) => o.id !== e.id && runsOf(o).some((r) => boxToRun(box, r) === 0))) out.line.push(e.id)
  }
  return out
}

/** Lines that run through the name of a group, or along its band. */
export function lineBandHits(m: Measured): string[] {
  const out: string[] = []
  for (const e of m.edges) {
    for (const [a, b] of runsOf(e)) {
      const run = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
      for (const g of m.geometry.groups) {
        const title = groupTitle(g)
        const inTitle = run.x < title.x + title.width && run.x + run.width > title.x && run.y < title.y + title.height && run.y + run.height > title.y
        const band = groupBand(g)
        const along = a.y === b.y && a.y > band.y && a.y < band.y + band.height && run.x < band.x + band.width && run.x + run.width > band.x
        if (inTitle || along) out.push(e.id)
      }
    }
  }
  return [...new Set(out)]
}

/** Width over height of the cards and group areas. */
export function layoutAspect(m: Measured): number {
  const boxes = [...Object.values(m.rects), ...m.geometry.groups]
  const minX = Math.min(...boxes.map((r) => r.x))
  const minY = Math.min(...boxes.map((r) => r.y))
  const w = Math.max(...boxes.map((r) => r.x + r.width)) - minX
  const h = Math.max(...boxes.map((r) => r.y + r.height)) - minY
  return w / h
}
