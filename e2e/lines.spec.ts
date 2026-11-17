/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { open } from './helpers.ts'

const BOARDS = [
  { name: 'anatomy', file: 'src/examples/anatomy.board.json' },
  { name: 'example', file: 'src/examples/example.board.json' },
  { name: 'url shortener', file: 'src/examples/external/url-shortener.board.json' },
  { name: 'sixteen parts', file: 'e2e/fixtures/sixteen-parts.board.json' },
  { name: 'forty parts', file: 'e2e/fixtures/forty-parts.board.json' },
]

for (const board of BOARDS) {
  test(`labels keep every word whole and show in full: ${board.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, board.file)
    const pills = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-label]:not([data-hidden])')].map((el) => {
        // Walk the words of the label and measure which line each sits on, to see where the text wraps.
        const text = el.querySelector('span') ?? el
        const range = document.createRange()
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
        const lines = new Set<number>()
        let brokenWord = false
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const value = node.textContent ?? ''
          for (const word of value.matchAll(/\S+/g)) {
            range.setStart(node, word.index ?? 0)
            range.setEnd(node, (word.index ?? 0) + word[0].length)
            const rects = [...range.getClientRects()]
            // A word on two lines has two rectangles at different heights.
            if (new Set(rects.map((r) => Math.round(r.top))).size > 1) brokenWord = true
            for (const r of rects) lines.add(Math.round(r.top))
          }
        }
        return { id: el.dataset.edge, lines: lines.size, brokenWord, overflow: el.scrollWidth - el.clientWidth, height: el.offsetHeight, scale: Number.parseFloat(getComputedStyle(el).getPropertyValue('--label-scale')) || 1 }
      }),
    )
    expect(pills.length).toBeGreaterThan(0)
    for (const pill of pills) {
      expect(pill.brokenWord, `${pill.id} breaks a word`).toBe(false)
      expect(pill.lines, `${pill.id} lines`).toBeLessThanOrEqual(2)
      expect(pill.overflow, `${pill.id} overflows its pill`).toBeLessThanOrEqual(1)
      expect(pill.height, `${pill.id} height`).toBeLessThanOrEqual(16 * pill.scale * 2 + 6 + 2)
    }
  })
}

test('a label with no free place shows in full when its line is hovered, and not before', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, BOARDS[0]!.file)
  const hidden = page.locator('[data-label][data-hidden]').first()
  await expect(hidden).toHaveCount(1)
  await expect(hidden).toHaveCSS('opacity', '0')
  const id = await hidden.getAttribute('data-edge')
  await page.locator(`g[data-edge="${id}"] .react-flow__edge-interaction`).hover({ force: true })
  await expect(hidden).toHaveCSS('opacity', '1')
})
