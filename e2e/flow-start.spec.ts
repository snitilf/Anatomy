/// <reference lib="dom" />
import { readFile, writeFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { open, viewport } from './helpers.ts'
import { expect, test } from './test.ts'

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const FORTY = 'e2e/fixtures/forty-parts.board.json'

interface Marker {
  part: string
  name: string
  box: { left: number; top: number; width: number; height: number }
  card: { left: number; top: number; width: number; height: number }
  /** The contrast between the disc and the card surface, and between the glyph and the disc (WCAG ratio, from the computed colors). */
  discOnCard: number
  glyphOnDisc: number
  hasShape: boolean
}

/** Every flow-start marker on the map, with where it is on screen and how it reads. */
function markers(page: Page): Promise<Marker[]> {
  return page.evaluate(() => {
    const rgb = (value: string): [number, number, number] => {
      const c = document.createElement('canvas').getContext('2d')!
      c.fillStyle = '#000'
      c.fillStyle = value
      c.fillRect(0, 0, 1, 1)
      const d = c.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!]
    }
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
    }
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x)
      return (hi! + 0.05) / (lo! + 0.05)
    }
    return [...document.querySelectorAll<HTMLElement>('[data-flow-start]')].map((el) => {
      const node = el.closest<HTMLElement>('.react-flow__node')!
      const box = el.getBoundingClientRect()
      const card = node.querySelector('[data-card]')!.getBoundingClientRect()
      const glyph = el.querySelector('svg')
      return {
        part: node.dataset.id ?? '',
        name: node.getAttribute('aria-description') ?? '',
        box: { left: box.left, top: box.top, width: box.width, height: box.height },
        card: { left: card.left, top: card.top, width: card.width, height: card.height },
        discOnCard: ratio(getComputedStyle(el).backgroundColor, getComputedStyle(node.querySelector('[data-card]')!).backgroundColor),
        glyphOnDisc: glyph ? ratio(getComputedStyle(glyph).fill, getComputedStyle(el).backgroundColor) : 0,
        hasShape: !!glyph?.querySelector('path, polygon'),
      }
    })
  })
}

const byPart = (list: Marker[]) => Object.fromEntries(list.map((m) => [m.part, m]))
const zoomOf = async (page: Page) => Number.parseFloat(/scale\(([\d.]+)\)/.exec(await viewport(page))?.[1] ?? 'NaN')

/** A marker that is big enough to read as a shape, and that sits on the top left corner of its card. */
function expectReadableMarker(m: Marker, level: string) {
  expect(Math.min(m.box.width, m.box.height), `size of the marker of ${m.part} at ${level}`).toBeGreaterThanOrEqual(14)
  expect(Math.max(m.box.width, m.box.height), `size of the marker of ${m.part} at ${level}`).toBeLessThanOrEqual(30)
  // It overlaps the corner of its card: it is part of the card, not a label floating near it.
  const cx = m.box.left + m.box.width / 2
  const cy = m.box.top + m.box.height / 2
  expect(Math.abs(cx - m.card.left), `corner of ${m.part} at ${level}`).toBeLessThanOrEqual(m.box.width)
  expect(Math.abs(cy - m.card.top), `corner of ${m.part} at ${level}`).toBeLessThanOrEqual(m.box.height)
  // Readable without color: a shape, in a luminance that stands apart from the card and from its own disc.
  expect(m.hasShape, `a shape in the marker of ${m.part}`).toBe(true)
  expect(m.discOnCard, `disc on card, ${m.part} at ${level}`).toBeGreaterThanOrEqual(3)
  expect(m.glyphOnDisc, `glyph on disc, ${m.part} at ${level}`).toBeGreaterThanOrEqual(3)
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`where a walkthrough starts, in the ${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    test('marks the first part of each walkthrough, at 100 percent', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await open(page, REFUND)
      await page.keyboard.press('Shift+Digit0')
      await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'full')
      const found = await markers(page)
      expect(found.map((m) => m.part).sort()).toEqual(['manager-approval', 'payout-ledger', 'payout-preview', 'refund-request'])
      const named = byPart(found)
      expect(named['refund-request']!.name).toContain('Starts the walkthrough Approve and pay.')
      expect(named['payout-ledger']!.name).toContain('Starts the walkthrough A repeated payout is blocked.')
      for (const m of found) expectReadableMarker(m, '100%')
      // The title is the name of the walkthrough, for the pointer.
      await expect(page.locator('.react-flow__node[data-id="refund-request"] [data-flow-start]')).toHaveAttribute('title', 'Starts the walkthrough Approve and pay')
      // A part that no walkthrough starts at carries none.
      await expect(page.locator('.react-flow__node[data-id="policy-check"] [data-flow-start]')).toHaveCount(0)
    })

    test('names every walkthrough that starts at the same part', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await open(page, SHORTENER)
      await page.keyboard.press('Shift+Digit0')
      const found = byPart(await markers(page))
      expect(Object.keys(found).sort()).toEqual(['visitor-browser', 'web-form'])
      expect(found['visitor-browser']!.name).toContain('Starts the walkthroughs Open an existing short link and Open a short code that does not exist.')
      await expect(page.locator('.react-flow__node[data-id="visitor-browser"] [data-flow-start]')).toHaveCount(1)
    })

    test('stays readable at the title level', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 })
      await open(page, REFUND)
      await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'title')
      const zoom = await zoomOf(page)
      expect(zoom).toBeGreaterThanOrEqual(0.45)
      expect(zoom).toBeLessThan(0.75)
      const found = await markers(page)
      expect(found).toHaveLength(4)
      for (const m of found) expectReadableMarker(m, `the title level (${zoom.toFixed(2)})`)
    })

    test('stays on the tile in the far view', async ({ page }, testInfo) => {
      const board = JSON.parse(await readFile(FORTY, 'utf8')) as { components: { id: string }[]; scenarios?: unknown[] }
      const start = board.components[3]!.id
      board.scenarios = [{ id: 'walk', title: 'Walk the board', steps: [{ caption: 'It starts here.', highlight: [start] }] }]
      const path = testInfo.outputPath('forty-with-walk.board.json')
      await writeFile(path, JSON.stringify(board))
      await page.setViewportSize({ width: 1440, height: 900 })
      await open(page, path)
      await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'far')
      const found = await markers(page)
      expect(found.map((m) => m.part)).toEqual([start])
      expectReadableMarker(found[0]!, 'the far view')
    })
  })
}

test('is reached from the keyboard, and is in its end state at once under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, REFUND)
  await page.keyboard.press('Shift+Digit0')
  // Tab walks the parts: the screen reader hears the start in the description of the part.
  let description = ''
  for (let i = 0; i < 60 && !description.includes('Starts the walkthrough'); i++) {
    await page.keyboard.press('Tab')
    description = await page.evaluate(() => document.activeElement?.getAttribute('aria-description') ?? '')
  }
  expect(description).toContain('Starts the walkthrough')
  // The marker has no motion to wait for: nothing runs on it, and it is fully drawn.
  const state = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-flow-start]')!
    return { running: el.getAnimations({ subtree: true }).length, opacity: getComputedStyle(el).opacity, transition: getComputedStyle(el).transitionProperty }
  })
  expect(state.running).toBe(0)
  expect(state.opacity).toBe('1')
  // The app's reduced-motion rule leaves fades of opacity only: nothing on the marker moves or scales.
  expect(state.transition).toBe('opacity')
})
