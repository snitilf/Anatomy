import { inflate, type Point, type Rect } from '../layout/geometry'
import { FAR_ENTER, labelScale } from './far'
import { charWidth, textWidth } from './textMeasure'

export interface LabelSpot {
  x: number
  y: number
  /** Width of the pill. The text wraps inside it, at spaces only. */
  width: number
  lines: number
  /**
   * The label has no free place beside its line: it is held back and shows in full when the line is hovered or selected.
   * Its x and y are the middle of the longest run, and its width is zero, so the pill takes the width of its text.
   */
  hidden?: true
}

/** The pill pads its text by this much on each side: its own padding and the cutout's. */
const PAD_X = 10
const LINE_HEIGHT = 16
const PAD_Y = 3
/** A label is one line when its text takes at most this much, else two. */
const SINGLE = 150
/** The widest a pill gets. A label that needs more is held back until hover or selection rather than cut. */
export const MAX_WIDTH = 220
/** A label shows at most this many lines. */
export const MAX_LINES = 2
/** A label sits on its line, or beside it with its nearest edge this far from the line. */
export const LABEL_GAP = 6
/** The longest a label may be from its own line, edge to line. */
export const LABEL_REACH = 8

export function pillHeight(lines: number): number {
  return lines * LINE_HEIGHT + PAD_Y * 2
}

/**
 * The room a pill keeps from other labels. A label is drawn larger as the map zooms out, so its words hold 11px on screen
 * (`labelScale` in `far.ts`), and placement does not know the zoom, so each label holds back room to grow into.
 * Every label keeps at least this much.
 */
export const LABEL_GROWTH = 1.3
/**
 * The room a pill keeps from other labels when the map has it: as large as a label grows just above the far view, at
 * the low end of the title level. A label that finds no place this far from the others takes `LABEL_GROWTH`.
 */
export const LABEL_ROOM = labelScale(FAR_ENTER, false)

/** The box of a pill centered on a spot, grown by `room`. */
export function pillRect(spot: { x: number; y: number; width: number; lines: number }, room = 1): Rect {
  const height = pillHeight(spot.lines) * room
  const width = spot.width * room
  return { x: spot.x - width / 2, y: spot.y - height / 2, width, height }
}

/** A label never sits on a card: cards are sized to their text, so the whole card and a thin margin count as covered. */
export function textArea(card: Rect): Rect {
  return { x: card.x - 4, y: card.y - 4, width: card.width + 8, height: card.height + 8 }
}

/** The narrowest pill that holds the words in two lines, broken at a space. `undefined` for a single word. */
function twoLines(words: readonly string[]): number | undefined {
  if (words.length < 2) return undefined
  const space = charWidth(' ', 'label')
  const widths = words.map((w) => textWidth(w, 'label'))
  let best = Infinity
  let acc = 0
  for (let k = 1; k < words.length; k++) {
    acc += (widths[k - 1] as number) + (k > 1 ? space : 0)
    const rest = widths.slice(k).reduce((sum, w) => sum + w, 0) + space * (words.length - k - 1)
    best = Math.min(best, Math.max(acc, rest))
  }
  return Math.ceil(best) + PAD_X * 2 + 2
}

/**
 * How a label wraps. Text breaks at spaces only, never inside a word, in at most two lines. The pill is as narrow as
 * the text allows, so two lines come out about even. `undefined` when it does not fit in the widest pill: a word is too
 * long, or the text needs a third line.
 */
export function wrap(text: string): { lines: number; width: number } | undefined {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return { lines: 1, width: PAD_X * 2 + 2 }
  const whole = textWidth(words.join(' '), 'label')
  if (whole <= SINGLE) return { lines: 1, width: Math.ceil(whole) + PAD_X * 2 + 2 }
  const width = twoLines(words)
  if (width !== undefined && width <= MAX_WIDTH) return { lines: 2, width }
  // A single word, or words no two lines hold, can still be one line when the widest pill takes it.
  const one = Math.ceil(whole) + PAD_X * 2 + 2
  return one <= MAX_WIDTH ? { lines: 1, width: one } : undefined
}

/** A one-line label of more words than this is wrapped to two lines where the room is too short for one. */
const NARROW_SAVES = 24

/**
 * The ways a label can wrap, in the order they are tried: the usual wrap, then, for a one-line label of several words,
 * two lines about even, when that is clearly narrower. Empty when no pill holds the text.
 */
export function wraps(text: string): { lines: number; width: number }[] {
  const usual = wrap(text)
  if (!usual) return []
  if (usual.lines === 2) return [usual]
  const narrow = twoLines(text.split(/\s+/).filter(Boolean))
  return narrow !== undefined && narrow <= usual.width - NARROW_SAVES ? [usual, { lines: 2, width: narrow }] : [usual]
}

/** The narrowest pill a label can take, which is the room a gap between cards keeps for it. `undefined` when none holds it. */
export function narrowest(text: string): number | undefined {
  const all = wraps(text)
  return all.length === 0 ? undefined : Math.min(...all.map((w) => w.width))
}

type Run = readonly [Point, Point]

const CELL = 64
const cellKey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768)

/** True when the straight run passes through the inside of the box. */
function runHits(run: Run, box: Rect): boolean {
  const [a, b] = run
  return Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height
}

/**
 * The straight runs of every drawn line, bucketed once per build. A label asks which runs pass through its box, and
 * only the buckets under that box are read.
 */
export class RunIndex {
  private readonly cells = new Map<number, { run: Run; owner: number }[]>()

  /** Adds the runs of one line. `owner` lets a label tell its own line from the others. */
  add(owner: number, runs: readonly Run[]): void {
    for (const run of runs) {
      const [a, b] = run
      const entry = { run, owner }
      for (let cx = Math.floor(Math.min(a.x, b.x) / CELL); cx <= Math.floor(Math.max(a.x, b.x) / CELL); cx++) {
        for (let cy = Math.floor(Math.min(a.y, b.y) / CELL); cy <= Math.floor(Math.max(a.y, b.y) / CELL); cy++) {
          const key = cellKey(cx, cy)
          const cell = this.cells.get(key)
          if (cell) cell.push(entry)
          else this.cells.set(key, [entry])
        }
      }
    }
  }

  /** True when a run of any line but `skip` passes through the box. A run of `skip` listed in `allow` is not counted. */
  hits(box: Rect, skip: number, allow?: Run): boolean {
    for (let cx = Math.floor(box.x / CELL); cx <= Math.floor((box.x + box.width) / CELL); cx++) {
      for (let cy = Math.floor(box.y / CELL); cy <= Math.floor((box.y + box.height) / CELL); cy++) {
        for (const { run, owner } of this.cells.get(cellKey(cx, cy)) ?? []) {
          if (owner === skip && (allow === undefined || run === allow)) continue
          if (runHits(run, box)) return true
        }
      }
    }
    return false
  }
}

/** What a label must keep off, besides the lines. */
export interface LabelContext {
  cards: readonly Rect[]
  /** The name band of every group. */
  bands: readonly Rect[]
  /** The pills placed so far, each with the room of `LABEL_GROWTH`. */
  taken: readonly Rect[]
  /** The same pills with the room of `LABEL_ROOM`, tried first when given. */
  roomy?: readonly Rect[]
  /** How much a new pill is grown, about its middle, before it is checked against `taken`. */
  grow?: number
  lines: RunIndex
  /** The number the line was added to `lines` under. */
  own: number
  /** What Fit frames: the cards and the group areas. A label outside it would be cut off a fitted map. */
  frame?: Rect
}

/** A box grown by `k` about its middle. */
const scaled = (box: Rect, k: number): Rect => ({ x: box.x - (box.width * (k - 1)) / 2, y: box.y - (box.height * (k - 1)) / 2, width: box.width * k, height: box.height * k })

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** Counts of the work label placement does, for tests to assert on. Each is one integer increment, and nothing reads them in the app. */
export const labelStats = { placements: 0, candidates: 0 }
export function resetLabelStats(): void {
  labelStats.placements = 0
  labelStats.candidates = 0
}

/**
 * True when a pill box keeps clear of every card, every group name band, every other pill, and every line but its own
 * host run. `host` is the run it sits on or beside, `undefined` to count every run of its own line too.
 */
export function labelFits(box: Rect, ctx: LabelContext, host?: Run): boolean {
  return blocker(box, ctx, host) === undefined
}

/** What keeps a pill box from its place, or `undefined` when it is free. */
export function blocker(box: Rect, ctx: LabelContext, host?: Run): 'frame' | 'card' | 'band' | 'label' | 'line' | undefined {
  const f = ctx.frame
  if (f && (box.x < f.x || box.y < f.y || box.x + box.width > f.x + f.width || box.y + box.height > f.y + f.height)) return 'frame'
  for (const c of ctx.cards) if (overlaps(box, textArea(c))) return 'card'
  for (const b of ctx.bands) if (overlaps(box, b)) return 'band'
  const grown = ctx.grow && ctx.grow !== 1 ? scaled(box, ctx.grow) : box
  for (const t of ctx.taken) if (overlaps(grown, inflate(t, 3))) return 'label'
  return ctx.lines.hits(inflate(box, 2), ctx.own, host) ? 'line' : undefined
}

const ARROW = 14
/** A run's ends keep this much clear for a corner, an arrowhead, or the card. */
const END_CLEAR = 14
/** A label beside a run has at least this much of its middle over the run. */
const OVERLAP = 12

/** How far a pill beside a run reaches past its ends. */
function overhang(t: number, len: number, along: number): number {
  return Math.max(0, along / 2 - t, t + along / 2 - len)
}

/**
 * Picks where a connection's label goes. It sits on a straight run of its own line, with the line cut around it, or
 * beside a run with its nearest edge a few pixels off. Never across a card, a group name, another label, or another
 * line, so no label can sit between two lines, and never outside the frame Fit shows. When nothing is free the label
 * is held back until the line is hovered.
 */
export function placeLabel(runs: readonly Run[], text: string, ctx: LabelContext): LabelSpot {
  labelStats.placements++
  const sizes = wraps(text)
  const longest = [...runs].sort((p, q) => length(q) - length(p))[0]
  const fallback = (): LabelSpot => {
    const mid = longest ? { x: (longest[0].x + longest[1].x) / 2, y: (longest[0].y + longest[1].y) / 2 } : { x: 0, y: 0 }
    return { ...mid, width: 0, lines: 1, hidden: true }
  }
  if (sizes.length === 0 || runs.length === 0) return fallback()
  // Clear of the room other labels grow into at the title level first, then of the room every label keeps.
  // The usual wrap first in each. Two lines only when one finds no place: a narrower pill fits a shorter run.
  const tiers = ctx.roomy ? [{ ...ctx, taken: ctx.roomy, grow: LABEL_ROOM }, ctx] : [ctx]
  for (const tier of tiers) {
    for (const size of sizes) {
      const spot = placeSized(runs, size, tier)
      if (spot) return spot
    }
  }
  return fallback()
}

/** The best place for a pill of this size on or beside the runs, or `undefined` when none is free. */
function placeSized(runs: readonly Run[], size: { lines: number; width: number }, ctx: LabelContext): LabelSpot | undefined {
  const height = pillHeight(size.lines)
  const last = runs[runs.length - 1] as Run
  const end = last[1]
  const arrow: Rect = { x: end.x - ARROW, y: end.y - ARROW, width: ARROW * 2, height: ARROW * 2 }

  // Distance along the line to the middle of it: labels prefer the middle.
  const total = runs.reduce((sum, r) => sum + length(r), 0)
  let walked = 0
  let best: { spot: LabelSpot; cost: number } | undefined
  runs.forEach((run, k) => {
    const [a, b] = run
    const len = length(run)
    const before = walked
    walked += len
    const level = a.y === b.y
    if (!level && a.x !== b.x) return
    const dir = level ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y)
    const along = level ? size.width : height
    const across = level ? height : size.width
    // The pill lies on the run, with the line visible for a few pixels on each side, or beside it. Beside, it may reach
    // past an end of the run, as long as its middle is over the run and nothing is in the way.
    for (const side of [0, 1, -1]) {
      const margin = side === 0 ? along / 2 + 10 + END_CLEAR : OVERLAP
      const lo = side === 0 ? margin : margin
      const hi = side === 0 ? len - margin - ARROW * (k === runs.length - 1 ? 1 : 0) : len - margin
      if (hi < lo) continue
      const steps = Math.min(48, Math.floor((hi - lo) / 4))
      const centre = Math.min(hi, Math.max(lo, len / 2))
      for (let s = 0; s <= steps * 2; s++) {
        // Outward from the middle of the run.
        const t = centre + Math.ceil(s / 2) * 4 * (s % 2 === 1 ? 1 : -1)
        if (t < lo || t > hi) continue
        const px = a.x + (level ? dir * t : 0)
        const py = a.y + (level ? 0 : dir * t)
        const shift = side === 0 ? 0 : side * (across / 2 + LABEL_GAP)
        const cx = px + (level ? 0 : shift)
        const cy = py + (level ? shift : 0)
        const box: Rect = { x: cx - size.width / 2, y: cy - height / 2, width: size.width, height }
        if (overlaps(box, arrow)) continue
        labelStats.candidates++
        // Beside the run, the box and the run bound a strip that no other line may cross either.
        if (!labelFits(side === 0 ? box : reaching(box, px, py), ctx, run)) continue
        const mid = before + t
        const cost = (side === 0 ? 0 : 40) + (level ? 0 : 12) + Math.abs(mid - total / 2) / 12 + (k === runs.length - 1 ? 6 : 0) + (side === 0 ? 0 : overhang(t, len, along) / 4) + crowding(box, ctx)
        if (!best || cost < best.cost) best = { spot: { x: cx, y: cy, width: size.width, lines: size.lines }, cost }
      }
    }
  })
  return best?.spot
}

/**
 * Where a label could only keep the room every label keeps, the cost of how far it grows into the others at the low end
 * of the title level: the shared area of the two grown pills, so the place that clashes least wins.
 */
function crowding(box: Rect, ctx: LabelContext): number {
  if (!ctx.roomy || ctx.grow) return 0
  const grown = scaled(box, LABEL_ROOM)
  let area = 0
  for (const r of ctx.roomy) {
    const w = Math.min(grown.x + grown.width, r.x + r.width) - Math.max(grown.x, r.x)
    const h = Math.min(grown.y + grown.height, r.y + r.height) - Math.max(grown.y, r.y)
    if (w > 0 && h > 0) area += w * h
  }
  return area / 40
}

/** The box and the point on its line that it sits beside: everything between them counts as under the label. */
function reaching(box: Rect, x: number, y: number): Rect {
  const x0 = Math.min(box.x, x)
  const y0 = Math.min(box.y, y)
  return { x: x0, y: y0, width: Math.max(box.x + box.width, x) - x0, height: Math.max(box.y + box.height, y) - y0 }
}

function length(run: Run): number {
  return Math.abs(run[1].x - run[0].x) + Math.abs(run[1].y - run[0].y)
}
