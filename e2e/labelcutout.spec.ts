/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { open, viewport } from './helpers.ts'

const BOARDS = [
  'e2e/fixtures/refund-approval.board.json',
  'src/examples/anatomy.board.json',
  'src/examples/claude-code-harness.board.json',
  'src/examples/how-an-llm-works.board.json',
]

/**
 * Every label that shows: the group areas painted under each line of its words, against the group areas on the map.
 * `straddles` is true when an edge of a group lies inside the label, so one cutout covers two different backgrounds.
 */
async function cutouts(page: Page) {
  return page.evaluate(() => {
    const areas = [...document.querySelectorAll('.react-flow__node-group-area')].map((n) => n.firstElementChild!.getBoundingClientRect())
    const near = (a: number, b: number) => Math.abs(a - b) < 1.5
    return [...document.querySelectorAll<HTMLElement>('[data-label]')]
      // A label that is still fading in or out is not on show yet.
      .filter((l) => getComputedStyle(l).opacity === '1' && l.getBoundingClientRect().width > 0)
      .map((l) => {
        const lines = [...l.querySelectorAll('[data-cutout]')].map((c) => c.getBoundingClientRect())
        let matched = true
        let straddles = false
        let missing = 0
        for (const [i, line] of lines.entries()) {
          const tints = [...l.querySelectorAll('[data-cutout]')[i]!.querySelectorAll('[data-tint]')].map((t) => t.getBoundingClientRect())
          if (!tints.every((t) => areas.some((a) => near(t.left, a.left) && near(t.top, a.top) && near(t.width, a.width) && near(t.height, a.height)))) matched = false
          const under = areas.filter((a) => a.left < line.right && a.right > line.left && a.top < line.bottom && a.bottom > line.top)
          missing += Math.max(0, under.length - tints.length)
          if (under.some((a) => [a.left, a.right].some((x) => x > line.left + 1 && x < line.right - 1) || [a.top, a.bottom].some((y) => y > line.top + 1 && y < line.bottom - 1))) straddles = true
        }
        return { text: l.textContent, lines: lines.length, matched, missing, straddles }
      })
  })
}

/** The camera has stopped and no transition is running, so the map and the labels are at rest. */
async function settle(page: Page) {
  let last = ''
  await expect
    .poll(async () => {
      const now = await viewport(page)
      const idle = await page.evaluate(() => document.getAnimations().length === 0)
      const still = now === last
      last = now
      return idle && still
    })
    .toBe(true)
}

test.describe.serial('the cutout under a label', () => {
  let straddling = 0

  for (const file of BOARDS) {
    test(`matches the group areas under it, at every zoom (${file})`, async ({ page }) => {
      await open(page, file)
      await settle(page)
      for (const step of ['start', 'in', 'in', 'out', 'out', 'out', 'out']) {
        if (step !== 'start') {
          const button = page.getByRole('button', { name: step === 'in' ? /zoom in/i : /zoom out/i })
          // At the end of the zoom range the button is off: there is no step to take.
          if (!(await button.isEnabled())) continue
          await button.click()
          await settle(page)
        }
        for (const c of await cutouts(page)) {
          const where = `${c.text} after ${step}`
          expect(c.lines, where).toBeGreaterThan(0)
          expect(c.matched, where).toBe(true)
          // Every area that reaches a line of the words is painted under it.
          expect(c.missing, where).toBe(0)
          if (c.straddles && step === 'start') straddling++
        }
      }
    })
  }

  test('a label across the edge of a group shows up on some board', () => {
    expect(straddling).toBeGreaterThan(0)
  })

  test('a label of two lines has a cutout for each line', async ({ page }) => {
    await open(page, BOARDS[2] as string)
    const counts = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-label]')].map((l) => l.querySelectorAll('[data-cutout]').length))
    expect(Math.max(...counts)).toBeGreaterThan(1)
  })
})
