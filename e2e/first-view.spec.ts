/// <reference lib="dom" />
/**
 * The first view of a board: what a person sees right after it opens, on three laptop windows.
 *
 * Every board and window is checked for up to three things, and each one is its own test (a "cell"):
 * - "in view": every card lies inside the visible map area, not under the sidebar, a toolbar, the hint, or a notice.
 * - "readable" (boards of up to 12 parts): titles and line labels are at least 11 px on screen, and every line and label is shown.
 * - "says what it hides" (boards over 12 parts, and every board at 1024x768): when the view hides lines or labels, the map says so.
 *
 * Text size is the computed font size times the zoom of the map, read from the React Flow viewport transform.
 * It is never measured from rendered pixel heights, so the result is the same on macOS and on the Linux runner.
 * The map carries `data-detail="full|title|far"` and the line that says what is hidden is `[data-testid="hidden-detail"]`.
 *
 * How to remove a cell from the expected failures:
 * a cell named in `EXPECTED_FAILURES` runs with `test.fail()`, so it must fail, and Playwright reports it as an error the
 * moment it passes. When a slice makes a cell pass, delete its line from the list in the same change. Never add a cell
 * to the list to make a run green: the list only shrinks, and it is empty once 18.3 and 21.1 have landed.
 * To see every cell's real result and the reason it fails, run with `FIRST_VIEW_IGNORE_EXPECTED=1`, which turns the list off.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { open, viewport } from './helpers.ts'

/** Smallest text on screen, in CSS pixels. */
const MIN_TEXT = 11
/** A board with more parts than this may show less than every label, as long as it says so. */
const READABLE_PARTS = 12
/** The narrowest docked sidebar, `SIDEBAR.min` in `src/app/ui.ts`. */
const SIDEBAR_MIN = 300
/** Windows where the sidebar stays docked beside the map. At 1024x768 it may slide over the map instead (21.1). */
const DOCKED = new Set(['1440x900', '1280x800'])

interface RawBoard {
  components: { id: string; label: string }[]
  relationships: { id: string; label?: string }[]
}

const BOARDS = [
  { name: 'anatomy', file: 'src/examples/anatomy.board.json' },
  { name: 'claude code harness', file: 'src/examples/claude-code-harness.board.json' },
  { name: 'large language model', file: 'src/examples/how-an-llm-works.board.json' },
  { name: 'refund approval', file: 'e2e/fixtures/refund-approval.board.json' },
  { name: 'url shortener', file: 'e2e/fixtures/url-shortener.board.json' },
  { name: 'sixteen parts', file: 'e2e/fixtures/sixteen-parts.board.json' },
  { name: 'forty parts', file: 'e2e/fixtures/forty-parts.board.json' },
  { name: 'sixty parts', file: 'e2e/fixtures/sixty-parts.board.json' },
].map((b) => ({ ...b, raw: JSON.parse(readFileSync(b.file, 'utf8')) as RawBoard }))

const WINDOWS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1024x768', width: 1024, height: 768 },
] as const

type Check = 'in view' | 'readable' | 'says what it hides'

const cell = (board: string, window: string, check: Check) => `${board} @ ${window}: ${check}`

/**
 * The cells that fail today, each with the slice that makes it pass.
 * Every other cell passes today and must keep passing.
 */
const EXPECTED_FAILURES: Record<string, string> = {
  // 18.3 "Open fitted, three detail levels, say what is hidden": the board opens fitted, so every card is in view.
  [cell('anatomy', '1440x900', 'in view')]: '18.3',
  [cell('anatomy', '1280x800', 'in view')]: '18.3',
  [cell('anatomy', '1024x768', 'in view')]: '18.3',
  [cell('claude code harness', '1440x900', 'in view')]: '18.3',
  [cell('claude code harness', '1280x800', 'in view')]: '18.3',
  [cell('claude code harness', '1024x768', 'in view')]: '18.3',
  [cell('large language model', '1440x900', 'in view')]: '18.3',
  [cell('large language model', '1280x800', 'in view')]: '18.3',
  [cell('large language model', '1024x768', 'in view')]: '18.3',
  [cell('refund approval', '1280x800', 'in view')]: '18.3',
  [cell('refund approval', '1024x768', 'in view')]: '18.3',
  [cell('url shortener', '1440x900', 'in view')]: '18.3',
  [cell('url shortener', '1280x800', 'in view')]: '18.3',
  [cell('url shortener', '1024x768', 'in view')]: '18.3',
  [cell('sixteen parts', '1440x900', 'in view')]: '18.3',
  [cell('sixteen parts', '1280x800', 'in view')]: '18.3',
  [cell('sixteen parts', '1024x768', 'in view')]: '18.3',

  // 18.3: titles and labels never under 11 px, the title level keeps every line and label, and the map carries `data-detail`.
  [cell('claude code harness', '1440x900', 'readable')]: '18.3',
  [cell('claude code harness', '1280x800', 'readable')]: '18.3',
  [cell('large language model', '1440x900', 'readable')]: '18.3',
  [cell('large language model', '1280x800', 'readable')]: '18.3',
  [cell('refund approval', '1440x900', 'readable')]: '18.3',
  [cell('refund approval', '1280x800', 'readable')]: '18.3',
  [cell('url shortener', '1440x900', 'readable')]: '18.3',
  [cell('url shortener', '1280x800', 'readable')]: '18.3',

  // 18.3: the map carries `data-detail`, and `hidden-detail` says what the view hides.
  [cell('anatomy', '1440x900', 'says what it hides')]: '18.3',
  [cell('anatomy', '1280x800', 'says what it hides')]: '18.3',
  [cell('anatomy', '1024x768', 'says what it hides')]: '18.3',
  [cell('claude code harness', '1024x768', 'says what it hides')]: '18.3',
  [cell('large language model', '1024x768', 'says what it hides')]: '18.3',
  [cell('refund approval', '1024x768', 'says what it hides')]: '18.3',
  [cell('url shortener', '1024x768', 'says what it hides')]: '18.3',
  [cell('sixteen parts', '1440x900', 'says what it hides')]: '18.3',
  [cell('sixteen parts', '1280x800', 'says what it hides')]: '18.3',
  [cell('sixteen parts', '1024x768', 'says what it hides')]: '18.3',
  [cell('forty parts', '1440x900', 'says what it hides')]: '18.3',
  [cell('forty parts', '1280x800', 'says what it hides')]: '18.3',
  [cell('forty parts', '1024x768', 'says what it hides')]: '18.3',
  [cell('sixty parts', '1440x900', 'says what it hides')]: '18.3',
  [cell('sixty parts', '1280x800', 'says what it hides')]: '18.3',
  [cell('sixty parts', '1024x768', 'says what it hides')]: '18.3',

  // 21.1 "Mid width": the sidebar slides over the map at 1024 px, so a small board fits at a zoom where it reads.
  [cell('claude code harness', '1024x768', 'readable')]: '21.1',
  [cell('large language model', '1024x768', 'readable')]: '21.1',
  [cell('refund approval', '1024x768', 'readable')]: '21.1',
  [cell('url shortener', '1024x768', 'readable')]: '21.1',
}

/** The checks that apply to a board on a window. At 1024x768 a small board is held to "readable" too, which waits for 21.1. */
function checksFor(parts: number, window: string): Check[] {
  const checks: Check[] = ['in view']
  if (parts <= READABLE_PARTS) checks.push('readable')
  if (parts > READABLE_PARTS || window === '1024x768') checks.push('says what it hides')
  return checks
}

const ALL_CELLS = BOARDS.flatMap((b) => WINDOWS.flatMap((w) => checksFor(b.raw.components.length, w.name).map((c) => cell(b.name, w.name, c))))

/** Waits until the map has stopped moving: the same viewport transform over a few frames. */
async function settled(page: Page) {
  let last = ''
  let same = 0
  for (let i = 0; i < 60 && same < 4; i++) {
    await page.waitForTimeout(50)
    const now = await viewport(page)
    same = now === last ? same + 1 : 0
    last = now
  }
}

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

interface FirstView {
  zoom: number
  detail: string | null
  map: Box
  /** Cards outside the map area or under something drawn over it, as "card id: what covers it". */
  covered: string[]
  /** The smallest title font of each card, in board pixels, or null when the card shows no title. */
  titles: Record<string, number | null>
  /** Connections whose line is not drawn. */
  hiddenLines: string[]
  /** Labelled connections whose label is not shown. */
  hiddenLabels: string[]
  /** The smallest font of each shown label, in board pixels. */
  labelFonts: Record<string, number>
  hiddenDetail: { visible: boolean; text: string }
  /** The width of the visible sidebar, or 0 when it is not shown. */
  sidebar: number
  /** How many toolbars are visible. */
  toolbars: number
}

/** Reads the first view from the page in one pass. */
function readFirstView(page: Page, raw: RawBoard): Promise<FirstView> {
  const parts = raw.components.map((c) => ({ id: c.id, label: c.label }))
  const lines = raw.relationships.map((r) => ({ id: r.id, labelled: (r.label ?? '').trim() !== '' }))
  return page.evaluate(
    ({ parts, lines }) => {
      const flow = document.querySelector<HTMLElement>('.react-flow')
      if (!flow) throw new Error('no map on the page')
      const transform = document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? ''
      const zoom = Number.parseFloat(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? 'NaN')
      const box = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
      const map = box(flow.getBoundingClientRect())

      /** How visible an element is: its opacity times every ancestor's, up to the map; zero when not displayed. */
      const shown = (el: Element) => {
        let o = 1
        for (let e: Element | null = el; e && e !== flow.parentElement; e = e.parentElement) {
          const s = getComputedStyle(e)
          // `inset(50%)` is the visually hidden pattern: still in the page for a screen reader, gone from the picture.
          if (s.display === 'none' || s.visibility === 'hidden' || s.clipPath === 'inset(50%)') return 0
          o *= Number.parseFloat(s.opacity)
        }
        const r = el.getBoundingClientRect()
        // A straight line has no height or no width, so either one is enough.
        return r.width > 0 || r.height > 0 ? o : 0
      }
      /**
       * How much CSS transforms scale an element on the board, from the element up to (not including) the viewport,
       * whose scale is the zoom. A scale that differs by axis counts by its smaller one.
       */
      const transformScale = (el: Element) => {
        let scale = 1
        for (let e: Element | null = el; e && !e.classList.contains('react-flow__viewport'); e = e.parentElement) {
          const t = getComputedStyle(e).transform
          if (t === 'none' || t === '') continue
          const m = new DOMMatrix(t)
          scale *= Math.min(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d))
        }
        return scale
      }
      /** The smallest font among the elements that hold the text itself, in board pixels: computed size times their own scale. */
      const textFont = (el: Element) => {
        let min = Infinity
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const holder = node.parentElement
          if (!holder || (node.textContent ?? '').trim() === '' || shown(holder) === 0) continue
          min = Math.min(min, Number.parseFloat(getComputedStyle(holder).fontSize) * transformScale(holder))
        }
        return min
      }

      // What can be drawn over the map: the sidebar, the top bar, every toolbar, the hint, notices, toasts, and the line
      // that says what is hidden.
      const covers = [...document.querySelectorAll<HTMLElement>('[data-testid="inspector"], [role="banner"], header, [role="toolbar"], [role="note"], [data-notices] > *, [data-sonner-toast], [data-testid="hidden-detail"]')]
        .filter((el) => !el.closest('.react-flow__viewport') && !el.contains(flow) && shown(el) > 0)
        .map((el) => ({ what: el.getAttribute('aria-label') ?? el.getAttribute('data-testid') ?? el.getAttribute('role') ?? el.tagName, r: box(el.getBoundingClientRect()) }))
      const overlap = (a: Box, b: Box) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5

      const covered: string[] = []
      const titles: Record<string, number | null> = {}
      for (const part of parts) {
        const card = document.querySelector<HTMLElement>(`.react-flow__node-card[data-id="${CSS.escape(part.id)}"]`)
        if (!card) {
          covered.push(`${part.id}: not on the map`)
          titles[part.id] = null
          continue
        }
        const r = box(card.getBoundingClientRect())
        if (shown(card) === 0) covered.push(`${part.id}: hidden`)
        if (r.left < map.left - 0.5 || r.top < map.top - 0.5 || r.right > map.right + 0.5 || r.bottom > map.bottom + 0.5) covered.push(`${part.id}: outside the map`)
        for (const c of covers) if (overlap(r, c.r)) covered.push(`${part.id}: under ${c.what}`)
        // The title is the element in the card whose text is the part's name.
        const named = [...card.querySelectorAll('*')].filter((el) => (el.textContent ?? '').trim() === part.label.trim() && shown(el) > 0)
        const fonts = named.map(textFont).filter((f) => Number.isFinite(f))
        titles[part.id] = fonts.length > 0 ? Math.min(...fonts) : null
      }

      const hiddenLines: string[] = []
      const hiddenLabels: string[] = []
      const labelFonts: Record<string, number> = {}
      for (const line of lines) {
        const id = CSS.escape(line.id)
        const g = document.querySelector(`g[data-edge="${id}"]`)
        if (!g || shown(g) === 0) hiddenLines.push(line.id)
        if (!line.labelled) continue
        const label = document.querySelector<HTMLElement>(`[data-label][data-edge="${id}"]`)
        const r = label?.getBoundingClientRect()
        const middle = r && { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const inMap = middle && middle.x >= map.left && middle.x <= map.right && middle.y >= map.top && middle.y <= map.bottom
        if (!label || label.hasAttribute('data-hidden') || shown(label) === 0 || !inMap) hiddenLabels.push(line.id)
        else labelFonts[line.id] = textFont(label)
      }

      const hidden = document.querySelector('[data-testid="hidden-detail"]')
      const sidebar = [...document.querySelectorAll('[data-testid="inspector"]')].find((el) => shown(el) > 0)
      const toolbars = [...document.querySelectorAll('[role="toolbar"]')].filter((el) => shown(el) > 0).length
      return {
        zoom,
        detail: flow.closest('[data-detail]')?.getAttribute('data-detail') ?? flow.querySelector('[data-detail]')?.getAttribute('data-detail') ?? null,
        map,
        covered,
        titles,
        hiddenLines,
        hiddenLabels,
        labelFonts,
        hiddenDetail: { visible: !!hidden && shown(hidden) > 0, text: (hidden?.textContent ?? '').trim() },
        sidebar: sidebar ? sidebar.getBoundingClientRect().width : 0,
        toolbars,
      }
    },
    { parts, lines },
  )
}

test.describe.configure({ mode: 'parallel' })

test('every expected failure names a cell of the matrix', () => {
  const unknown = Object.keys(EXPECTED_FAILURES).filter((key) => !ALL_CELLS.includes(key))
  expect(unknown).toEqual([])
})

for (const board of BOARDS) {
  const parts = board.raw.components.length
  for (const window of WINDOWS) {
    for (const check of checksFor(parts, window.name)) {
      const name = cell(board.name, window.name, check)
      test(name, async ({ page }) => {
        const until = process.env.FIRST_VIEW_IGNORE_EXPECTED ? undefined : EXPECTED_FAILURES[name]
        test.fail(until !== undefined, `expected to fail until slice ${until}`)
        await page.setViewportSize({ width: window.width, height: window.height })
        await open(page, board.file)
        await settled(page)
        const view = await readFirstView(page, board.raw)
        expect(view.zoom, 'the zoom is read from the viewport transform').toBeGreaterThan(0)
        // The map keeps its chrome: a view that wins room by dropping the sidebar or the tool bars does not count.
        if (DOCKED.has(window.name)) expect(view.sidebar, `the sidebar is open beside the map, at least ${SIDEBAR_MIN} px wide`).toBeGreaterThanOrEqual(SIDEBAR_MIN)
        expect(view.toolbars, 'a toolbar is shown').toBeGreaterThan(0)

        if (check === 'in view') {
          expect(view.covered, 'cards outside the visible map area').toEqual([])
          return
        }

        // Soft checks, so a failing cell lists every reason at once.
        if (check === 'readable') {
          const smallTitles = Object.entries(view.titles).filter(([, f]) => f === null || f * view.zoom < MIN_TEXT).map(([id, f]) => `${id}: ${f === null ? 'no title' : (f * view.zoom).toFixed(1)}`)
          expect.soft(smallTitles, `card titles under ${MIN_TEXT} px on screen`).toEqual([])
          expect.soft(view.hiddenLines, 'lines not drawn').toEqual([])
          expect.soft(view.hiddenLabels, 'line labels not shown').toEqual([])
          const smallLabels = Object.entries(view.labelFonts).filter(([, f]) => f * view.zoom < MIN_TEXT).map(([id, f]) => `${id}: ${(f * view.zoom).toFixed(1)}`)
          expect.soft(smallLabels, `line labels under ${MIN_TEXT} px on screen`).toEqual([])
          expect.soft(['full', 'title'], 'the map says its level of detail, and a board of up to 12 parts is not in the far view').toContain(view.detail)
          return
        }

        const hides = view.detail === 'far' || view.hiddenLines.length > 0 || view.hiddenLabels.length > 0
        if (hides) {
          expect.soft(view.hiddenDetail.visible, `the view hides ${view.hiddenLines.length} lines and ${view.hiddenLabels.length} labels, and says so`).toBe(true)
          expect.soft(view.hiddenDetail.text, 'what the view hides, in words').not.toBe('')
        } else if (view.detail === 'full') {
          expect.soft(view.hiddenDetail.visible, 'nothing is hidden, so nothing says it is').toBe(false)
        } else if (view.hiddenDetail.visible) {
          // Title cards hide their summaries, so the line may say so.
          expect.soft(view.hiddenDetail.text, 'what the view hides, in words').not.toBe('')
        }
        expect.soft(['full', 'title', 'far'], 'the map says its level of detail').toContain(view.detail)
      })
    }
  }
}
