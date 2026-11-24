/// <reference lib="dom" />
import type { Page } from '@playwright/test'
import { open, pickConnection, viewport } from './helpers.ts'
import { expect, test } from './test.ts'

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const CLAUDE = 'src/examples/claude-code-harness.board.json'
const ANATOMY = 'src/examples/anatomy.board.json'

/** The smallest arrowhead a person can read as a direction, in CSS pixels on screen (slice 18.5b). */
const MIN_HEAD_PX = 7

interface Head {
  edge: string
  /** The length of the head along its line, and its width across, on screen. */
  length: number
  width: number
  overflow: string
}

/**
 * Every arrowhead of the map as it is drawn: the marker's own size, the scale that the map's style gives its shape, and the zoom of the map.
 * A marker is measured from the page and not from a constant, so a head that the style shrinks or clips fails here.
 */
function heads(page: Page): Promise<Head[]> {
  return page.evaluate(() => {
    const zoom = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')!).transform).a
    const out: Head[] = []
    for (const path of document.querySelectorAll<SVGPathElement>('.react-flow__edge-path')) {
      const ref = path.getAttribute('marker-end')
      // The id of a marker holds its color and size, with parentheses and an ampersand in it, so it is cut out of url('#...') by its two ends.
      const id = ref?.startsWith("url('#") && ref.endsWith("')") ? ref.slice(6, -2) : undefined
      const marker = id ? document.getElementById(id) : null
      const shape = marker?.querySelector('polyline')
      if (!marker || !shape) continue
      const box = marker.getAttribute('viewBox')!.split(/\s+/).map(Number)
      const board = Number.parseFloat(marker.getAttribute('markerWidth')!) / box[2]!
      const unit = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : Number.parseFloat(getComputedStyle(path).strokeWidth)
      const m = new DOMMatrixReadOnly(getComputedStyle(shape).transform === 'none' ? undefined : getComputedStyle(shape).transform)
      // The head is the triangle (-5,-4) (0,0) (-5,4) of the marker's box: 5 long and 8 wide.
      out.push({
        edge: path.closest('[data-edge]')?.getAttribute('data-edge') ?? '',
        length: 5 * board * unit * m.a * zoom,
        width: 8 * board * unit * m.d * zoom,
        overflow: getComputedStyle(marker).overflow,
      })
    }
    return out
  })
}

const zoomOf = async (page: Page) => Number.parseFloat(/scale\(([\d.]+)\)/.exec(await viewport(page))?.[1] ?? 'NaN')

function expectReadable(list: Head[], level: string) {
  expect(list.length, `arrowheads at ${level}`).toBeGreaterThanOrEqual(8)
  for (const h of list) {
    expect(h.length, `length of ${h.edge} at ${level}`).toBeGreaterThanOrEqual(MIN_HEAD_PX)
    expect(h.width, `width of ${h.edge} at ${level}`).toBeGreaterThanOrEqual(MIN_HEAD_PX - 1)
    // The marker's box would cut a head that is larger than the box.
    expect(h.overflow, `overflow of the marker of ${h.edge}`).toBe('visible')
  }
  // D119: the kind of a line is its dash and width only, so every head is the same size, solid or dashed.
  const lengths = list.map((h) => h.length)
  expect(Math.max(...lengths) - Math.min(...lengths), `head sizes at ${level}`).toBeLessThanOrEqual(0.5)
}

test.describe('arrowheads', () => {
  test('are at least 7 px on screen at 100 percent', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, REFUND)
    await page.keyboard.press('Shift+Digit0')
    await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'full')
    await expect.poll(() => zoomOf(page)).toBeCloseTo(1, 2)
    expectReadable(await heads(page), '100%')
  })

  test('stay readable at the title level, where a board opens fitted and where the keys fit it again', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await open(page, REFUND)
    await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'title')
    expectReadable(await heads(page), `title level (${(await zoomOf(page)).toFixed(2)})`)
    // From 100 percent and back to the fit, by keyboard.
    await page.keyboard.press('Shift+Digit0')
    await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'full')
    await page.keyboard.press('Shift+1')
    await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'title')
    await expect.poll(() => zoomOf(page)).toBeLessThan(0.55)
    expectReadable(await heads(page), `title level (${(await zoomOf(page)).toFixed(2)})`)
  })

  test('stay readable on boards that fit higher and lower in the title level', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const file of [CLAUDE, ANATOMY]) {
      await open(page, file)
      await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'title')
      const zoom = await zoomOf(page)
      expect(zoom).toBeGreaterThanOrEqual(0.45)
      expect(zoom).toBeLessThan(0.75)
      expectReadable(await heads(page), `${file} at ${zoom.toFixed(2)}`)
    }
  })

  test('keep their size when a line is selected, and end the same under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, REFUND)
    await page.keyboard.press('Shift+Digit0')
    await pickConnection(page, 'request and policy')
    // Under reduced motion the camera has no glide, so the end state is there at once.
    await expect.poll(() => page.locator('g[data-active]').count()).toBeGreaterThan(0)
    // The emphasized line is drawn wider and in the accent, and its head does not grow with it: every head is still one size.
    expectReadable(await heads(page), 'a selected line')
  })
})
