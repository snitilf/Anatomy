import type { Board } from '../board/schema'
import { computeGeometry } from '../canvas/buildGraph'
import { contentBounds } from '../canvas/camera'
import { pillHeight, wrap } from '../canvas/labelPlacement'
import { groupAreas, placeCards } from '../layout/cards'
import type { Point, Rect } from '../layout/geometry'

/** What a test checks about the layout of a board: the cards, the group areas, and the box Fit frames. */
export interface Laid {
  cards: Record<string, Rect>
  groups: Record<string, Rect>
  bounds: Rect
}

export function lay(board: Board): Laid {
  const cards = placeCards(board, { positions: {}, sizes: {} })
  const groups = groupAreas(board, cards)
  const bounds = contentBounds(Object.values(cards), Object.values(groups)) as Rect
  return { cards, groups, bounds }
}

/** The share of the framed box that cards cover. */
export function coverage({ cards, bounds }: Laid): number {
  const area = Object.values(cards).reduce((sum, r) => sum + r.width * r.height, 0)
  return area / (bounds.width * bounds.height)
}

/** The clear room between two boxes: the larger of the gaps across and down. Negative when they overlap. */
export function clearGap(a: Rect, b: Rect): number {
  const across = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width))
  const down = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height))
  return Math.max(across, down)
}

/** Connections whose source card sits to the right of the card they point to. */
export function backward(board: Board, cards: Readonly<Record<string, Rect>>): number {
  let count = 0
  for (const r of board.relationships) {
    const a = cards[r.from]
    const b = cards[r.to]
    if (a && b && a.x > b.x) count++
  }
  return count
}

type Segment = readonly [Point, Point]

function segmentsOf(points: readonly Point[]): Segment[] {
  const out: Segment[] = []
  for (let i = 1; i < points.length; i++) out.push([points[i - 1] as Point, points[i] as Point])
  return out
}

/** True when two segments cross at a point inside both. Touching at an end, or running along each other, is not a crossing. */
function crosses([p, q]: Segment, [r, s]: Segment): boolean {
  const d = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(r, s, p)
  const d2 = d(r, s, q)
  const d3 = d(p, q, r)
  const d4 = d(p, q, s)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** The distance from a point to a segment. */
function toSegment(p: Point, [a, b]: Segment): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** The distance from a box to a segment: zero when the segment touches or crosses it. */
function boxToSegment(box: Rect, seg: Segment): number {
  const [a, b] = seg
  const inside = (p: Point) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height
  if (inside(a) || inside(b)) return 0
  const corners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ]
  const sides = corners.map((c, i) => [c, corners[(i + 1) % 4] as Point] as const)
  if (sides.some((side) => crosses(side, seg))) return 0
  // The nearest pair is a segment end to a side, or a box corner to the segment.
  return Math.min(...[a, b].flatMap((p) => sides.map((side) => toSegment(p, side))), ...corners.map((c) => toSegment(c, seg)))
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** What the routed lines and their labels look like on a laid-out board. */
export interface Lines {
  /** How many times one line crosses another. */
  crossings: number
  /** Problems with the labels that fit a pill, one line each. Empty when every one is placed well. */
  labelProblems: string[]
}

/** Routes the lines of a laid-out board and checks where each label went. */
export function lines(board: Board, laid: Laid): Lines {
  const geometry = computeGeometry(board, laid.cards)
  const segments = new Map<string, Segment[]>()
  for (const [id, shape] of geometry.edges) segments.set(id, shape.runs ? shape.runs.map(([p, q]) => [p, q] as const) : segmentsOf(shape.points))
  let crossings = 0
  const ids = [...segments.keys()]
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      for (const s of segments.get(ids[i] as string) as Segment[]) for (const t of segments.get(ids[j] as string) as Segment[]) if (crosses(s, t)) crossings++
    }
  }

  const problems: string[] = []
  const pills: { id: string; box: Rect }[] = []
  for (const r of board.relationships) {
    // A label too long for the widest pill is held back by design, until its line is hovered.
    if (r.label.trim() === '' || !wrap(r.kind === 'unknown' ? `?? ${r.label}` : r.label)) continue
    const shape = geometry.edges.get(r.id)
    if (!shape) {
      problems.push(`${r.id}: not drawn`)
      continue
    }
    if (shape.labelHidden || shape.labelWidth === 0) {
      problems.push(`${r.id}: label not placed`)
      continue
    }
    const height = pillHeight(shape.labelLines)
    const box = { x: shape.labelX - shape.labelWidth / 2, y: shape.labelY - height / 2, width: shape.labelWidth, height }
    pills.push({ id: r.id, box })
    for (const [card, rect] of Object.entries(laid.cards)) if (overlaps(box, rect)) problems.push(`${r.id}: label over card ${card}`)
    const near = Math.min(...(segments.get(r.id) ?? []).map((s) => boxToSegment(box, s)))
    if (!(near <= 8)) problems.push(`${r.id}: label ${near.toFixed(1)} px from its line`)
    const b = laid.bounds
    if (box.x < b.x || box.y < b.y || box.x + box.width > b.x + b.width || box.y + box.height > b.y + b.height) problems.push(`${r.id}: label outside the board`)
  }
  for (let i = 0; i < pills.length; i++) {
    for (let j = i + 1; j < pills.length; j++) {
      const p = pills[i] as { id: string; box: Rect }
      const q = pills[j] as { id: string; box: Rect }
      if (overlaps(p.box, q.box)) problems.push(`${p.id}: label over label ${q.id}`)
    }
  }
  return { crossings, labelProblems: problems }
}

/** Pairs of cards, groups, or a group and a card outside it that overlap. */
export function overlapsOf(board: Board, laid: Laid): string[] {
  const out: string[] = []
  const cards = Object.entries(laid.cards)
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const [a, p] = cards[i] as [string, Rect]
      const [b, q] = cards[j] as [string, Rect]
      if (overlaps(p, q)) out.push(`card ${a} over card ${b}`)
    }
  }
  const groups = Object.entries(laid.groups)
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const [a, p] = groups[i] as [string, Rect]
      const [b, q] = groups[j] as [string, Rect]
      if (overlaps(p, q)) out.push(`group ${a} over group ${b}`)
    }
  }
  const groupOf = new Map(board.components.map((c) => [c.id, c.group]))
  for (const [g, area] of groups) {
    for (const [id, rect] of cards) if (groupOf.get(id) !== g && overlaps(area, rect)) out.push(`card ${id} over group ${g}`)
  }
  return out
}
