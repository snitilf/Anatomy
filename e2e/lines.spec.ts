/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { open } from './helpers.ts'

const BOARDS = [
  { name: 'anatomy', file: 'src/examples/anatomy.board.json' },
  { name: 'refund approval', file: 'src/examples/refund-approval.board.json' },
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

for (const board of BOARDS) {
  test(`labels grown to stay readable at low zoom cover no card and no other label: ${board.name}`, async ({ page }) => {
    // A small window, so that every board can zoom out to about 0.8.
    await page.setViewportSize({ width: 1100, height: 640 })
    await open(page, board.file)
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Shift+Digit0')
    await page.keyboard.press('ControlOrMeta+Minus')
    const zoom = () => page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '')?.[1]))
    // Between 0.69, where the far view starts, and 0.85, where labels are not grown, so they are grown and still shown.
    await expect.poll(async () => { const z = await zoom(); return z > 0.7 && z < 0.85 }).toBe(true)
    await page.waitForTimeout(300)
    const found = await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      }
      const labels = [...document.querySelectorAll<HTMLElement>('[data-label]')]
        .filter((el) => getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0')
        .map((el) => ({ id: el.dataset.edge ?? '', box: box(el.querySelector('span') ?? el), scale: Number.parseFloat(getComputedStyle(el).getPropertyValue('--label-scale')) || 1, size: Number.parseFloat(getComputedStyle(el).fontSize) }))
      const cards = [...document.querySelectorAll('.react-flow__node-card')].map((el) => ({ id: (el as HTMLElement).dataset.id ?? '', box: box(el) }))
      return { labels, cards }
    })
    const over = (a: { left: number; top: number; right: number; bottom: number }, b: typeof a) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
    for (const label of found.labels) {
      expect(label.scale, `${label.id} scale`).toBeLessThanOrEqual(1.3)
      for (const card of found.cards) expect(over(label.box, card.box), `${label.id} covers ${card.id}`).toBe(false)
    }
    for (let i = 0; i < found.labels.length; i++)
      for (let j = i + 1; j < found.labels.length; j++) expect(over(found.labels[i]!.box, found.labels[j]!.box), `${found.labels[i]!.id} covers ${found.labels[j]!.id}`).toBe(false)
    // The crowded boards keep their labels quiet at this zoom, so only the others have any to check.
    if (board.name !== 'forty parts') expect(found.labels.length).toBeGreaterThan(0)
  })
}
