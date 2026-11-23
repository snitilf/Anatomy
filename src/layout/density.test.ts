import { describe, expect, it } from 'vitest'
import { SIDEBAR } from '../app/ui'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { fitZoomFor } from '../canvas/camera'
import { textWidth } from '../canvas/textMeasure'
import { boardSources, fileName, GENERATED_BOARDS, generatedBoard } from '../test/boards'
import { backward, clearGap, coverage, lay, lines, overlapsOf } from '../test/layoutMeasure'
import { autoLayout } from './autoLayout'
import { contentSize } from './cards'

/**
 * The free map area of the reference windows, with the sidebar docked at its default width.
 * Measured in the app: the map is the window less the sidebar and 18 px of frame across, and less the 50 px top bar.
 * Fit then keeps 48 px at the bottom for the zoom bar (`CORNER_ROOM` in `camera.ts`), and `fitZoomFor` keeps 32 px on
 * every side.
 */
const WINDOWS = {
  '1440x900': { width: 1440, height: 900 },
  '1280x800': { width: 1280, height: 800 },
  '1024x768': { width: 1024, height: 768 },
} as const
type Window = keyof typeof WINDOWS
const mapArea = (w: Window) => ({ width: WINDOWS[w].width - SIDEBAR.width - 18, height: WINDOWS[w].height - 50 - 48 })

/**
 * The zooms a fitted board must reach.
 *
 * FULL: a card title is 13 px, so it is at least 11 px on screen from 11 / 13 = 0.846. At 0.85 a full card reads whole.
 *
 * MIDDLE: the title-only level (D143). Titles there are drawn so they are 11 px on screen, so what limits the level is
 * the width of the card: at 0.5 a 240 px card is 120 px wide on screen, which holds two lines of about 16 characters of
 * an 11 px title inside its padding. Below about 0.45 a usual title no longer fits in two lines.
 *
 * Up to 8 parts must fit as full cards on a 1440 px laptop window. Up to 12 parts must fit at the middle level or better
 * on 1440 and 1280 px windows. At 1024 px with the sidebar docked the map is too narrow for either (the mid width
 * layout of slice 21.1 frees it), so 1024 px is held by the ratchet below.
 */
const FULL = 0.85
const MIDDLE = 0.5
const THRESHOLDS: { window: Window; parts: number; zoom: number; level: string }[] = [
  { window: '1440x900', parts: 8, zoom: FULL, level: 'full cards' },
  { window: '1440x900', parts: 12, zoom: MIDDLE, level: 'the middle level' },
  { window: '1280x800', parts: 12, zoom: MIDDLE, level: 'the middle level' },
]

/**
 * What each board measured on the layout before this ratchet: the share of the fitted box that cards cover, the fit zoom
 * at the three windows, connections that run right to left, and lines that cross. A board may only get better.
 * The three examples must cover at least 1.3 times what they did.
 */
interface Recorded {
  coverage: number
  fit: Record<Window, number>
  backward: number
  crossings: number
}
const RECORDED: Record<string, Recorded> = {
  'anatomy.board.json': { coverage: 0.144, fit: { '1440x900': 0.518, '1280x800': 0.435, '1024x768': 0.302 }, backward: 4, crossings: 15 },
  'claude-code-harness.board.json': { coverage: 0.129, fit: { '1440x900': 0.562, '1280x800': 0.486, '1024x768': 0.367 }, backward: 4, crossings: 12 },
  'how-an-llm-works.board.json': { coverage: 0.16, fit: { '1440x900': 0.625, '1280x800': 0.524, '1024x768': 0.364 }, backward: 1, crossings: 0 },
  'forty-parts.board.json': { coverage: 0.138, fit: { '1440x900': 0.295, '1280x800': 0.255, '1024x768': 0.186 }, backward: 15, crossings: 352 },
  'refund-approval.board.json': { coverage: 0.175, fit: { '1440x900': 0.815, '1280x800': 0.685, '1024x768': 0.475 }, backward: 2, crossings: 6 },
  'sixteen-parts.board.json': { coverage: 0.155, fit: { '1440x900': 0.453, '1280x800': 0.391, '1024x768': 0.342 }, backward: 5, crossings: 45 },
  'sixty-parts-walkthrough.board.json': { coverage: 0.077, fit: { '1440x900': 0.181, '1280x800': 0.152, '1024x768': 0.106 }, backward: 22, crossings: 840 },
  'sixty-parts.board.json': { coverage: 0.077, fit: { '1440x900': 0.181, '1280x800': 0.152, '1024x768': 0.106 }, backward: 22, crossings: 840 },
  'url-shortener.board.json': { coverage: 0.166, fit: { '1440x900': 0.689, '1280x800': 0.596, '1024x768': 0.482 }, backward: 1, crossings: 9 },
  'worst-text.board.json': { coverage: 0.219, fit: { '1440x900': 0.584, '1280x800': 0.49, '1024x768': 0.34 }, backward: 1, crossings: 0 },
  'rp-group-loop.board.json': { coverage: 0.437, fit: { '1440x900': 0.985, '1280x800': 0.827, '1024x768': 0.575 }, backward: 1, crossings: 1 },
  'rp-loop.board.json': { coverage: 0.376, fit: { '1440x900': 1.105, '1280x800': 0.955, '1024x768': 0.907 }, backward: 3, crossings: 0 },
  'rp-ring3.board.json': { coverage: 0.359, fit: { '1440x900': 1.641, '1280x800': 1.378, '1024x768': 0.957 }, backward: 1, crossings: 0 },
  'rp-two-groups.board.json': { coverage: 0.251, fit: { '1440x900': 1.418, '1280x800': 1.19, '1024x768': 0.827 }, backward: 1, crossings: 0 },
}
const EXAMPLES = ['anatomy.board.json', 'claude-code-harness.board.json', 'how-an-llm-works.board.json']
/** Rounding in the recorded values. */
const SLACK = 0.002

/** The clear room between two cards: one track of lines and the margin that keeps it off each card. */
const MIN_GAP = 48

const boards: [string, Board][] = Object.entries(boardSources).flatMap(([path, text]) => {
  const parsed = parseBoard(text)
  return parsed.ok ? [[fileName(path), parsed.board] as [string, Board]] : []
})

/** Routing every line is the slow part, so each board's lines are solved once. */
const solved = new WeakMap<Board, ReturnType<typeof lines>>()
const linesOf = (board: Board) => {
  const known = solved.get(board)
  if (known) return known
  const out = lines(board, lay(board))
  solved.set(board, out)
  return out
}

describe('a fitted board is readable on a laptop window', () => {
  it('finds every recorded board', () => {
    expect(boards.map(([name]) => name).sort()).toEqual(Object.keys(RECORDED).sort())
  })

  for (const [name, board] of boards) {
    const parts = board.components.length
    for (const t of THRESHOLDS) {
      if (parts > t.parts) continue
      it(`${name} (${parts} parts) fits ${t.window} at ${t.level}, ${t.zoom} or more`, () => {
        expect(fitZoomFor(lay(board).bounds, mapArea(t.window))).toBeGreaterThanOrEqual(t.zoom)
      })
    }
  }
})

describe('the layout only gets tighter', () => {
  for (const [name, board] of boards) {
    const was = RECORDED[name] as Recorded
    it(`${name} covers ${EXAMPLES.includes(name) ? 'at least 1.3 times' : 'no less than'} what it did`, () => {
      const factor = EXAMPLES.includes(name) ? 1.3 : 1
      expect(coverage(lay(board))).toBeGreaterThanOrEqual(was.coverage * factor - SLACK)
    })
    it(`${name} fits each window at no smaller a zoom than it did`, () => {
      const { bounds } = lay(board)
      for (const w of Object.keys(WINDOWS) as Window[]) expect(fitZoomFor(bounds, mapArea(w)), w).toBeGreaterThanOrEqual(was.fit[w] - SLACK)
    })
  }
})

describe('tighter is still clean', () => {
  for (const [name, board] of boards) {
    const was = RECORDED[name] as Recorded
    it(`${name}: every label that fits a pill is placed, on its own line, clear of cards and labels, inside the board`, () => {
      expect(linesOf(board).labelProblems).toEqual([])
    })
    it(`${name}: no more connections run backward, and no more lines cross, than before`, () => {
      expect(backward(board, lay(board).cards)).toBeLessThanOrEqual(was.backward)
      expect(linesOf(board).crossings).toBeLessThanOrEqual(was.crossings)
    })
    it(`${name}: two cards are never closer than ${MIN_GAP} px, and every group has room for its name`, () => {
      const laid = lay(board)
      const rects = Object.entries(laid.cards)
      const close: string[] = []
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const [a, p] = rects[i] as [string, (typeof rects)[number][1]]
          const [b, q] = rects[j] as [string, (typeof rects)[number][1]]
          if (clearGap(p, q) < MIN_GAP) close.push(`${a} and ${b}: ${clearGap(p, q)}`)
        }
      }
      expect(close).toEqual([])
      // The name is drawn 14 px in from the left, and the count after it, with room to the right edge.
      for (const g of board.groups) {
        const area = laid.groups[g.id]
        if (area) expect(textWidth(g.label, 'title') + 48, g.id).toBeLessThanOrEqual(area.width)
      }
    })
  }
})

describe('the layout is a pure function of the board', () => {
  const all: [string, Board, () => Board][] = [
    ...boards.map(([name]) => [name, (boards.find(([n]) => n === name) as [string, Board])[1], () => {
      const text = boardSources[Object.keys(boardSources).find((p) => fileName(p) === name) as string] as string
      const parsed = parseBoard(text)
      if (!parsed.ok) throw new Error(name)
      return parsed.board
    }] as [string, Board, () => Board]),
    ...Array.from({ length: GENERATED_BOARDS }, (_, i) => [`generated ${i + 1}`, generatedBoard(i + 1), () => generatedBoard(i + 1)] as [string, Board, () => Board]),
  ]

  // The boards in batches of 30, each with a generous timeout, so a busy machine slows a batch and never fails it.
  const BATCH = 30
  for (let first = 0; first < all.length; first += BATCH) {
    const batch = all.slice(first, first + BATCH)
    it(`has no overlaps, keeps cards apart, and gives the same output twice: ${batch[0]?.[0]} to ${batch.at(-1)?.[0]}`, { timeout: 120_000 }, () => {
      const problems: string[] = []
      for (const [name, board, again] of batch) {
        const laid = lay(board)
        // A board read again is a new object, so nothing is taken from the last layout.
        const second = lay(again())
        if (JSON.stringify(laid.cards) !== JSON.stringify(second.cards)) problems.push(`${name}: a second layout differs`)
        for (const o of overlapsOf(board, laid)) problems.push(`${name}: ${o}`)
        const rects = Object.values(laid.cards)
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (clearGap(rects[i]!, rects[j]!) < MIN_GAP) problems.push(`${name}: two cards ${clearGap(rects[i]!, rects[j]!)} px apart`)
      }
      expect(problems.slice(0, 10)).toEqual([])
    })
  }

  it('never reads the size of the window', () => {
    const [, board] = boards.find(([n]) => n === 'claude-code-harness.board.json') as [string, Board]
    const sizeOf = (id: string) => contentSize(board.components.find((c) => c.id === id) as Board['components'][number])
    const at = (width: number, height: number) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
      return autoLayout(board, sizeOf)
    }
    expect(at(390, 844)).toEqual(at(1440, 900))
  })
})
