import type { Board } from '../board/schema'
import { autoLayout } from './autoLayout'
import { placeBeside } from './beside'
import { overlaps, type Point, type Rect, type Size } from './geometry'
import { groupAreas } from './groupArea'
import { pushApart } from './push'

export { GROUP_PADDING, groupAreas } from './groupArea'

/** Card sizes, all on the 8 px grid. A card the user has not resized is as tall as its text needs, within these. */
export const CARD_WIDTH = 240
export const CARD_MIN: Readonly<Size> = { width: 224, height: 112 }
export const CARD_MAX: Readonly<Size> = { width: 480, height: 320 }
/** The size of a card with a one-line title and a two-line summary. */
export const CARD_SIZE: Readonly<Size> = { width: CARD_WIDTH, height: CARD_MIN.height }
export const GRID = 8

/** What a card shows, in pixels. The card styles use the same numbers. */
export const CARD_TEXT = {
  padX: 14,
  padY: 12,
  gap: 4,
  titleLine: 20,
  titleChar: 7.1,
  summaryLine: 18,
  summaryChar: 6.3,
  titleLines: 2,
  /** At most this many summary lines on a card that was not resized. */
  summaryLines: 3,
  foot: 16,
} as const

/** What the user changed about where cards sit and how big they are, and where the map last held them. All keyed by component ID. */
export interface CardPlacement {
  positions: Readonly<Record<string, Point>>
  sizes: Readonly<Record<string, Size>>
  /** Where each card was drawn when the map last had to hold still (`placed` in the layer). A card with a place here keeps it. */
  placed?: Readonly<Record<string, Rect>> | undefined
}

const own = <T,>(record: Readonly<Record<string, T>>, id: string): T | undefined => (Object.hasOwn(record, id) ? record[id] : undefined)

/** Rough count of lines a text wraps to in a width, at an average character width. Long words break anywhere. */
export function lineCount(text: string, width: number, charWidth: number): number {
  const perLine = Math.max(1, Math.floor(width / charWidth))
  let lines = 1
  let used = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const length = [...word].length
    if (used === 0) {
      lines += Math.ceil(length / perLine) - 1
      used = length % perLine || perLine
    } else if (used + 1 + length <= perLine) {
      used += 1 + length
    } else {
      lines += Math.ceil(length / perLine)
      used = length % perLine || perLine
    }
  }
  return lines
}

export const snap = (value: number, grid = GRID) => Math.round(value / grid) * grid
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** Keeps a size inside the card limits, on the grid. */
export function clampSize(size: Size): Size {
  return {
    width: clamp(snap(size.width), CARD_MIN.width, CARD_MAX.width),
    height: clamp(snap(size.height), CARD_MIN.height, CARD_MAX.height),
  }
}

/** The height of the text block of a card: title, summary, and the footer row. */
function contentHeight(c: { label: string; summary: string; lesson?: string | undefined }, width: number, summaryLines: number): number {
  const inner = width - CARD_TEXT.padX * 2
  const title = Math.min(CARD_TEXT.titleLines, lineCount(c.label, inner, CARD_TEXT.titleChar))
  const summary = Math.min(summaryLines, lineCount(c.summary, inner, CARD_TEXT.summaryChar))
  const foot = c.lesson !== undefined ? CARD_TEXT.gap + CARD_TEXT.foot : 0
  return CARD_TEXT.padY * 2 + title * CARD_TEXT.titleLine + CARD_TEXT.gap + summary * CARD_TEXT.summaryLine + foot
}

/** The size of a card the user has not resized: the standard width, and as tall as its text, on the grid. */
export function contentSize(c: { label: string; summary: string; lesson?: string | undefined }): Size {
  const height = contentHeight(c, CARD_WIDTH, CARD_TEXT.summaryLines)
  return { width: CARD_WIDTH, height: clamp(Math.ceil(height / GRID) * GRID, CARD_MIN.height, CARD_MAX.height) }
}

/** The width from the card's right edge that the title leaves for the note count, with the card's own padding and room for two digits. Matches `CardNode.module.css`. */
export const NOTE_BADGE_ROOM = 48

/**
 * How many summary lines fit on a card of this size. The card clamps its summary to this.
 * The user's notes take no row: the count sits in the top right corner beside the title, so a note never costs a summary
 * line. A card with a lesson keeps the footer row for the lesson mark, and the count joins it there. Beside the corner,
 * a title that no longer fits one line wraps to two, and takes its line from the summary.
 */
export function summaryLinesFor(c: { label: string; lesson?: string | undefined }, size: Size, notes = 0): number {
  const corner = notes > 0 && c.lesson === undefined
  // The room already counts the card's right padding, which `inner` has taken off.
  const inner = size.width - CARD_TEXT.padX * 2 - (corner ? NOTE_BADGE_ROOM - CARD_TEXT.padX : 0)
  const title = Math.min(CARD_TEXT.titleLines, lineCount(c.label, inner, CARD_TEXT.titleChar))
  const foot = c.lesson !== undefined ? CARD_TEXT.gap + CARD_TEXT.foot : 0
  const room = size.height - CARD_TEXT.padY * 2 - title * CARD_TEXT.titleLine - CARD_TEXT.gap - foot
  return Math.max(1, Math.floor(room / CARD_TEXT.summaryLine))
}

/** The last layered layout. It depends only on the board and the natural sizes, and a resize or a drop leaves both alone. */
let lastLayout: { board: Board; key: string; auto: Record<string, Point> } | undefined

function layered(board: Board, natural: ReadonlyMap<string, Size>, unplaced: ReadonlySet<string>): Record<string, Point> {
  const key = board.components.map((c) => `${c.id}:${natural.get(c.id)?.width}x${natural.get(c.id)?.height}`).join('|')
  if (lastLayout && lastLayout.board === board && lastLayout.key === key) return lastLayout.auto
  const auto = autoLayout(board, (id) => natural.get(id) ?? { ...CARD_SIZE }, unplaced)
  lastLayout = { board, key, auto }
  return auto
}

/** Room between cards the board placed and the block of cards the layout adds next to them. */
const BESIDE_GAP = 160

/**
 * Where every card sits and how big it is. A position the user set wins, then the board's position, then the place the
 * map last held the card at (`placed`), then the layered layout. When no card has a held place, the layout places every
 * card: when no card has a board position either it places them all, and when some do, the rest are laid out as a block
 * to the right of them. A card the layout placed never stays under a card with a fixed position: it is pushed aside.
 * When cards have held places, the layout does not run: those cards stay, and a card without one is placed beside a
 * neighbor (`placeBeside`), so a new revision never reshuffles the map.
 */
export function placeCards(board: Board, placement: CardPlacement): Record<string, Rect> {
  const sizes = new Map<string, Size>()
  for (const c of board.components) {
    const size = own(placement.sizes, c.id)
    sizes.set(c.id, size ? { width: size.width, height: size.height } : contentSize(c))
  }
  const sizeOf = (id: string) => sizes.get(id) ?? { ...CARD_SIZE }
  const held = placement.placed
  if (held && board.components.some((c) => !c.position && !own(placement.positions, c.id) && own(held, c.id))) return placeHeld(board, placement, held, sizeOf)

  const out: Record<string, Rect> = {}
  const fixed = new Set<string>()
  const boardPlaced: Rect[] = []
  const pending = new Set<string>()
  for (const c of board.components) {
    if (c.position) boardPlaced.push({ ...c.position, ...sizeOf(c.id) })
    if (!c.position && !own(placement.positions, c.id)) pending.add(c.id)
  }

  let auto: Record<string, Point> = {}
  if (pending.size > 0) {
    // Every card without a board position takes part in the layout, so a card the user moved keeps its neighbors in flow.
    // It uses the size each card has before the user resizes it, so a resize never moves the other cards around.
    const unplaced = new Set(board.components.filter((c) => !c.position).map((c) => c.id))
    const natural = new Map(board.components.map((c) => [c.id, contentSize(c)]))
    auto = layered(board, natural, unplaced)
    if (boardPlaced.length > 0) {
      const right = Math.max(...boardPlaced.map((r) => r.x + r.width))
      const top = Math.min(...boardPlaced.map((r) => r.y))
      auto = Object.fromEntries(Object.entries(auto).map(([id, p]) => [id, { x: p.x + right + BESIDE_GAP, y: p.y + top }]))
    }
  }

  for (const c of board.components) {
    const at = own(placement.positions, c.id) ?? c.position ?? auto[c.id] ?? { x: 0, y: 0 }
    out[c.id] = { x: at.x, y: at.y, ...sizeOf(c.id) }
    if (!pending.has(c.id)) fixed.add(c.id)
  }
  if (pending.size === 0 || fixed.size === 0) return out

  // Only the auto-placed cards move, so the fixed ones are the obstacles.
  const groupOf = new Map(board.components.map((c) => [c.id, c.group]))
  const pushed = pushApart(out, fixed, { groupOf: (id) => groupOf.get(id), areas: groupAreas(board, out) })
  for (const [id, p] of Object.entries(pushed)) {
    const r = out[id]
    if (r && pending.has(id)) out[id] = { ...r, x: p.x, y: p.y }
  }
  return out
}

/**
 * The cards of a map that holds still. Every card keeps the place the user, the board, or the map gave it. A card that its
 * new text made larger than its held place pushes aside the held cards it now covers, so cards never overlap. The cards
 * with no place yet, which a revision added, go beside a neighbor, clear of every card and of the places the removed parts
 * had (their ghosts).
 */
function placeHeld(board: Board, placement: CardPlacement, held: Readonly<Record<string, Rect>>, sizeOf: (id: string) => Size): Record<string, Rect> {
  const out: Record<string, Rect> = {}
  const pending: string[] = []
  const free = new Set<string>()
  for (const c of board.components) {
    const kept = own(held, c.id)
    const at = own(placement.positions, c.id) ?? c.position ?? kept
    if (!at) {
      pending.push(c.id)
      continue
    }
    out[c.id] = { x: at.x, y: at.y, ...sizeOf(c.id) }
    if (!own(placement.positions, c.id) && !c.position) free.add(c.id)
  }
  const grown = [...free].filter((id) => {
    const was = own(held, id) as Rect
    const now = out[id] as Rect
    return now.width > was.width || now.height > was.height
  })
  if (grown.length > 0) {
    const covered = new Set([...free].filter((id) => !grown.includes(id) && grown.some((g) => overlaps(out[g] as Rect, out[id] as Rect))))
    if (covered.size > 0) {
      const groupOf = new Map(board.components.map((c) => [c.id, c.group]))
      const pinned = new Set(Object.keys(out).filter((id) => !covered.has(id)))
      const pushed = pushApart(out, pinned, { groupOf: (id) => groupOf.get(id), areas: groupAreas(board, out) })
      for (const [id, p] of Object.entries(pushed)) {
        const r = out[id]
        if (r && covered.has(id)) out[id] = { ...r, x: p.x, y: p.y }
      }
    }
  }
  if (pending.length === 0) return out
  const ids = new Set(board.components.map((c) => c.id))
  const ghosts = Object.entries(held)
    .filter(([id]) => !ids.has(id))
    .map(([, r]) => r)
  for (const [id, p] of Object.entries(placeBeside(board, out, pending, sizeOf, ghosts))) out[id] = { x: p.x, y: p.y, ...sizeOf(id) }
  return out
}
