import type { Board } from '../board/schema'
import { autoLayout, GROUP_PADDING } from './autoLayout'
import type { Point, Rect, Size } from './geometry'
import { pushApart } from './push'

export { GROUP_PADDING }

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

/** What the user changed about where cards sit and how big they are. Both are keyed by component ID. */
export interface CardPlacement {
  positions: Readonly<Record<string, Point>>
  sizes: Readonly<Record<string, Size>>
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

/** How many summary lines fit on a card of this size. The card clamps its summary to this. */
export function summaryLinesFor(c: { label: string; lesson?: string | undefined }, size: Size): number {
  const inner = size.width - CARD_TEXT.padX * 2
  const title = Math.min(CARD_TEXT.titleLines, lineCount(c.label, inner, CARD_TEXT.titleChar))
  const foot = c.lesson !== undefined ? CARD_TEXT.gap + CARD_TEXT.foot : 0
  const room = size.height - CARD_TEXT.padY * 2 - title * CARD_TEXT.titleLine - CARD_TEXT.gap - foot
  return Math.max(1, Math.floor(room / CARD_TEXT.summaryLine))
}

/** The area of each group around the given card rects, keyed by group ID. */
export function groupAreas(board: Board, rects: Readonly<Record<string, Rect>>): Record<string, Rect> {
  const out: Record<string, Rect> = {}
  for (const g of board.groups) {
    const members = board.components.filter((c) => c.group === g.id && rects[c.id]).map((c) => rects[c.id] as Rect)
    if (members.length === 0) continue
    const minX = Math.min(...members.map((r) => r.x))
    const minY = Math.min(...members.map((r) => r.y))
    const maxX = Math.max(...members.map((r) => r.x + r.width))
    const maxY = Math.max(...members.map((r) => r.y + r.height))
    out[g.id] = {
      x: minX - GROUP_PADDING.side,
      y: minY - GROUP_PADDING.top,
      width: maxX - minX + GROUP_PADDING.side * 2,
      height: maxY - minY + GROUP_PADDING.top + GROUP_PADDING.bottom,
    }
  }
  return out
}

/** Room between cards the board placed and the block of cards the layout adds next to them. */
const BESIDE_GAP = 160

/**
 * Where every card sits and how big it is. A position the user set wins, then the board's position, then the layered
 * layout. When no card has a board position, the layout places every card. When some do, the rest are laid out as a
 * block to the right of them. A card the layout placed never stays under a card with a fixed position: it is pushed
 * aside. Nothing is stored: the auto-placed cards follow the layout every time, so a new revision lays them out again.
 */
export function placeCards(board: Board, placement: CardPlacement): Record<string, Rect> {
  const sizes = new Map<string, Size>()
  for (const c of board.components) {
    const size = own(placement.sizes, c.id)
    sizes.set(c.id, size ? { width: size.width, height: size.height } : contentSize(c))
  }
  const sizeOf = (id: string) => sizes.get(id) ?? { ...CARD_SIZE }

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
    auto = autoLayout(board, (id) => natural.get(id) ?? { ...CARD_SIZE }, unplaced)
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
