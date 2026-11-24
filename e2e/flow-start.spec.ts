/// <reference lib="dom" />
import { readFile, writeFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { open, viewport } from './helpers.ts'
import { expect, test } from './test.ts'

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const FORTY = 'e2e/fixtures/forty-parts.board.json'
const CLAUDE = 'src/examples/claude-code-harness.board.json'

interface Marker {
  part: string
  name: string
  box: { left: number; top: number; width: number; height: number }
  card: { left: number; top: number; width: number; height: number }
  /** The mark is a child of the card, so it dims, lifts, and hovers with it. */
  inCard: boolean
  /** The contrast of the glyph and of the border against the surface of the card (WCAG ratio, from the computed colors). */
  glyphOnCard: number
  borderOnCard: number
  /** A filled disc is loud: the mark has no background of its own. */
  filled: boolean
  borderWidth: number
  hasShape: boolean
  /** What the box of the mark overlaps on the map: line labels, group names, counts, the note dot, and the words on the card. */
  overlaps: string[]
}

/** Every flow-start marker on the map, with where it is on screen, how it reads, and what it overlaps. */
function markers(page: Page): Promise<Marker[]> {
  return page.evaluate(() => {
    const rgb = (value: string): [number, number, number, number] => {
      const c = document.createElement('canvas').getContext('2d')!
      c.fillStyle = '#000'
      c.fillStyle = value
      c.fillRect(0, 0, 1, 1)
      const d = c.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!, d[3]!]
    }
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
    }
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x)
      return (hi! + 0.05) / (lo! + 0.05)
    }
    type Box = { left: number; top: number; right: number; bottom: number }
    const hit = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).opacity !== '0' && getComputedStyle(el).visibility !== 'hidden'
    }
    const words = (el: Element): Box[] => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
    }
    return [...document.querySelectorAll<HTMLElement>('[data-flow-start]')].map((el) => {
      const node = el.closest<HTMLElement>('.react-flow__node')!
      const cardEl = node.querySelector<HTMLElement>('[data-card]')!
      const box = el.getBoundingClientRect()
      const card = cardEl.getBoundingClientRect()
      const glyph = el.querySelector('svg')
      const surface = getComputedStyle(cardEl).backgroundColor
      const overlaps: string[] = []
      const check = (what: string, boxes: Box[]) => {
        if (boxes.some((b) => hit(box, b))) overlaps.push(what)
      }
      check('a line label', [...document.querySelectorAll('[data-label]:not([data-hidden])')].filter(seen).map((e) => e.getBoundingClientRect()))
      check('a group name', [...document.querySelectorAll('[data-far-label]')].filter(seen).map((e) => e.getBoundingClientRect()))
      check('a count', [...document.querySelectorAll('button[data-bundle]')].filter(seen).map((e) => e.getBoundingClientRect()))
      check('the note dot', [...cardEl.querySelectorAll('[class*="_dot_"]')].filter(seen).map((e) => e.getBoundingClientRect()))
      check('the title', [...cardEl.querySelectorAll('[class*="_label_"], [class*="_tileName_"]')].filter(seen).flatMap(words))
      const style = getComputedStyle(el)
      return {
        part: node.dataset.id ?? '',
        name: node.getAttribute('aria-description') ?? '',
        box: { left: box.left, top: box.top, width: box.width, height: box.height },
        card: { left: card.left, top: card.top, width: card.width, height: card.height },
        inCard: cardEl.contains(el),
        glyphOnCard: glyph ? ratio(getComputedStyle(glyph).fill, surface) : 0,
        borderOnCard: ratio(style.borderTopColor, surface),
        filled: rgb(style.backgroundColor)[3] > 0,
        borderWidth: Number.parseFloat(style.borderTopWidth),
        hasShape: !!glyph?.querySelector('path, polygon'),
        overlaps,
      }
    })
  })
}

const byPart = (list: Marker[]) => Object.fromEntries(list.map((m) => [m.part, m]))
const zoomOf = async (page: Page) => Number.parseFloat(/scale\(([\d.]+)\)/.exec(await viewport(page))?.[1] ?? 'NaN')

/**
 * A quiet mark: a small outlined circle with a play shape, in the ink of the other icons, inside its own card, that touches no
 * label, name, count, dot, or word. It reads without color: a shape, and a border and glyph that stand apart from the card.
 */
function expectQuietMark(m: Marker, level: string) {
  // Inside the rect of its card, so no label, group name, or bundle line that keeps off the card can meet it.
  const slack = 0.5
  expect(m.inCard, `${m.part} holds its mark in the card`).toBe(true)
  expect(m.box.left, `left of the mark of ${m.part} at ${level}`).toBeGreaterThanOrEqual(m.card.left - slack)
  expect(m.box.top, `top of the mark of ${m.part} at ${level}`).toBeGreaterThanOrEqual(m.card.top - slack)
  expect(m.box.left + m.box.width, `right of the mark of ${m.part} at ${level}`).toBeLessThanOrEqual(m.card.left + m.card.width + slack)
  expect(m.box.top + m.box.height, `bottom of the mark of ${m.part} at ${level}`).toBeLessThanOrEqual(m.card.top + m.card.height + slack)
  expect(m.overlaps, `what the mark of ${m.part} overlaps at ${level}`).toEqual([])
  const side = Math.min(m.box.width, m.box.height)
  expect(side, `size of the mark of ${m.part} at ${level}`).toBeGreaterThanOrEqual(12.5)
  expect(Math.max(m.box.width, m.box.height), `size of the mark of ${m.part} at ${level}`).toBeLessThanOrEqual(16)
  // Quiet: an outline and a glyph, no filled disc.
  expect(m.filled, `the mark of ${m.part} has no fill`).toBe(false)
  expect(m.borderWidth, `border of the mark of ${m.part} at ${level}`).toBeGreaterThan(0)
  // Readable without color: a shape, and a glyph and a border that stand apart from the surface of the card in luminance.
  expect(m.hasShape, `a shape in the mark of ${m.part}`).toBe(true)
  expect(m.glyphOnCard, `glyph on card, ${m.part} at ${level}`).toBeGreaterThanOrEqual(3)
  expect(m.borderOnCard, `border on card, ${m.part} at ${level}`).toBeGreaterThanOrEqual(3)
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
      for (const m of found) expectQuietMark(m, '100%')
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
      for (const m of found) expectQuietMark(m, `the title level (${zoom.toFixed(2)})`)
    })

    for (const [width, height] of [[390, 844], [1024, 768]] as const) {
      test(`keeps clear of group names and bundle lines in the far view of the harness at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await open(page, CLAUDE)
        await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'far')
        const found = await markers(page)
        expect(found.map((m) => m.part).sort()).toEqual(['hooks', 'model', 'tools', 'you'])
        for (const m of found) expectQuietMark(m, `the far view at ${width}`)
      })
    }

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
      expectQuietMark(found[0]!, 'the far view')
    })
  })
}

test('draws with the colors of the system under forced colors, so the border and the glyph do not disappear', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, REFUND)
  await page.keyboard.press('Shift+Digit0')
  const state = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-flow-start]')!
    const style = getComputedStyle(el)
    const glyph = getComputedStyle(el.querySelector('svg')!)
    const card = getComputedStyle(el.closest('.react-flow__node')!.querySelector('[data-card]')!)
    return { border: style.borderTopColor, color: style.color, fill: glyph.fill, surface: card.backgroundColor, width: style.borderTopWidth }
  })
  expect(Number.parseFloat(state.width)).toBeGreaterThan(0)
  // The border and the glyph take the text color of the system, which is the color that the card's own words get.
  expect(state.border).toBe(state.color)
  expect(state.fill).toBe(state.color)
  expect(state.border).not.toBe(state.surface)
})

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
