/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers.ts'

const BOARDS = [
  'e2e/fixtures/refund-approval.board.json',
  'src/examples/anatomy.board.json',
  'src/examples/claude-code-harness.board.json',
  'src/examples/how-an-llm-works.board.json',
]

/** Every label that shows: the group areas painted under it, against the group areas on the map. */
async function cutouts(page: Page) {
  return page.evaluate(() => {
    const areas = [...document.querySelectorAll('.react-flow__node-group-area')].map((n) => n.firstElementChild!.getBoundingClientRect())
    const near = (a: number, b: number) => Math.abs(a - b) < 1.5
    return [...document.querySelectorAll<HTMLElement>('[data-label]')]
      .filter((l) => getComputedStyle(l).opacity !== '0' && l.getBoundingClientRect().width > 0)
      .map((l) => {
        const box = l.firstElementChild!.getBoundingClientRect()
        const tints = [...l.firstElementChild!.children].map((t) => t.getBoundingClientRect())
        const under = areas.filter((a) => a.left < box.right && a.right > box.left && a.top < box.bottom && a.bottom > box.top)
        const matched = tints.every((t) => areas.some((a) => near(t.left, a.left) && near(t.top, a.top) && near(t.width, a.width) && near(t.height, a.height)))
        return { text: l.textContent, tints: tints.length, under: under.length, matched }
      })
  })
}

test.describe('the cutout under a label', () => {
  for (const file of BOARDS) {
    test(`matches the group areas under it, at every zoom (${file})`, async ({ page }) => {
      await open(page, file)
      for (const step of ['start', 'in', 'in', 'out', 'out', 'out']) {
        if (step !== 'start') {
          await page.getByRole('button', { name: step === 'in' ? /zoom in/i : /zoom out/i }).click()
          await page.waitForTimeout(350)
        }
        for (const c of await cutouts(page)) {
          expect(c.matched, `${c.text} after ${step}`).toBe(true)
          // Every area that reaches the label's box is painted under it.
          expect(c.tints, `${c.text} after ${step}`).toBeGreaterThanOrEqual(c.under)
        }
      }
    })
  }

  test('a label across the edge of a group paints the area on its own side only', async ({ page }) => {
    await open(page, BOARDS[0] as string)
    const straddling = (await cutouts(page)).filter((c) => c.tints > 0)
    expect(straddling.map((c) => c.text)).toContain('payout result')
    const side = await page.evaluate(() => {
      const label = [...document.querySelectorAll<HTMLElement>('[data-label]')].find((l) => l.textContent === 'payout result')!
      const box = label.firstElementChild!.getBoundingClientRect()
      const tint = label.firstElementChild!.firstElementChild!.getBoundingClientRect()
      return { left: tint.left, right: tint.right, boxLeft: box.left, boxRight: box.right }
    })
    // The area ends or begins inside the label, so the label's cutout is not one flat tint.
    const insideBox = (x: number) => x > side.boxLeft + 1 && x < side.boxRight - 1
    expect(insideBox(side.left) || insideBox(side.right)).toBe(true)
  })
})
