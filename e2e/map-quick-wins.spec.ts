/// <reference lib="dom" />
/**
 * Map quick wins (18.6a): where a toast sits, how a link looks while it is dragged, and what a card with a note keeps.
 */
import { readFile, writeFile } from 'node:fs/promises'
import type { Page, TestInfo } from '@playwright/test'
import { expect, test } from './test.ts'
import { linkPair, nextFrame, open, pickPart, viewport } from './helpers.ts'

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const SIXTEEN = 'e2e/fixtures/sixteen-parts.board.json'

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const WINDOWS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]

/** Loads a second revision of the open board, which makes the revision toast: the widest toast the app shows. */
async function revise(page: Page, testInfo: TestInfo, file: string) {
  const board = JSON.parse(await readFile(file, 'utf8')) as { revision: number; components: { summary: string }[] }
  board.revision += 1
  board.components[0]!.summary = `Changed in revision ${board.revision}`
  const path = testInfo.outputPath(`revision-${board.revision}.board.json`)
  await writeFile(path, JSON.stringify(board))
  await page.getByLabel('Board file').setInputFiles(path)
}

for (const size of WINDOWS) {
  for (const bar of [false, true]) {
    for (const hint of [true, false]) {
      const name = `${size.width}x${size.height}, ${bar ? 'with' : 'without'} a walkthrough bar, ${hint ? 'with' : 'without'} the map hint`
      test.describe(`a toast sits clear of the map: ${name}`, () => {
        test.use({ viewport: size, reducedMotion: 'reduce' })

        test('inside the room the fit keeps free, above the bottom controls, centered on the map', async ({ page }, testInfo) => {
          if (!hint) await page.addInitScript(() => window.localStorage.setItem('anatomy:map-hint-seen', '1'))
          await open(page, REFUND)
          if (bar) {
            await page.keyboard.press('ControlOrMeta+k')
            const menu = page.getByRole('dialog', { name: 'Command menu' })
            await menu.getByRole('combobox').fill('Play Approve and pay')
            await page.keyboard.press('Enter')
            await expect(page.getByRole('region', { name: 'Walkthrough: Approve and pay' })).toBeVisible()
            // The bar tells the toaster how much of the bottom it holds.
            await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--toast-floor') !== '')
          }
          await revise(page, testInfo, REFUND)
          const toast = page.locator('[data-sonner-toast]')
          await expect(toast).toBeVisible()
          // With reduced motion the toast is at rest once it is mounted.
          await expect(toast).toHaveAttribute('data-mounted', 'true')

          const read = await page.evaluate(() => {
            const box = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
            const map = box(document.querySelector('.react-flow')!.getBoundingClientRect())
            const t = box(document.querySelector('[data-sonner-toast]')!.getBoundingClientRect())
            const shown = (el: Element) => {
              const r = el.getBoundingClientRect()
              return r.width > 0 && r.height > 0
            }
            const cards = [...document.querySelectorAll('.react-flow__node-card')].filter(shown).map((el) => ({ id: (el as HTMLElement).dataset.id ?? '', ...box(el.getBoundingClientRect()) }))
            const controls = [...document.querySelectorAll('.react-flow [role="toolbar"]')].filter(shown).map((el) => box(el.getBoundingClientRect()))
            const walkthrough = document.querySelector('section[aria-label^="Walkthrough:"]')
            const bar = walkthrough ? box(walkthrough.getBoundingClientRect()) : undefined
            return { map, toast: t, cards, controls, bar }
          })
          const overlap = (a: Box, b: Box) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5
          const t = read.toast

          // On the map, whole.
          expect(t.left, 'inside the map on the left').toBeGreaterThanOrEqual(read.map.left)
          expect(t.right, 'inside the map on the right').toBeLessThanOrEqual(read.map.right)
          expect(t.top, 'inside the map at the top').toBeGreaterThanOrEqual(read.map.top)
          expect(t.bottom, 'inside the map at the bottom').toBeLessThanOrEqual(read.map.bottom)
          // Centered on the map, not on the window: the sidebar takes one side of it.
          expect((t.left + t.right) / 2, 'centered on the map').toBeCloseTo((read.map.left + read.map.right) / 2, 0)
          // Above every control at the bottom of the map and above the bar, never on them.
          for (const control of read.controls) expect(overlap(t, control), 'not over a toolbar').toBe(false)
          if (read.bar) expect(t.bottom, 'above the walkthrough bar').toBeLessThanOrEqual(read.bar.top)
          // The room the fit keeps free at the bottom: no card is in it. A walkthrough bar takes the bottom of the map
          // over the cards, and the bar keeping clear of the lit parts is step 20.1, so the cards are checked without it.
          if (!bar) for (const card of read.cards) expect(overlap(t, card), `not over the card ${card.id}`).toBe(false)
          if (!bar) {
            const lowest = Math.max(...read.cards.map((c) => c.bottom))
            expect(t.top, 'below the last row of cards').toBeGreaterThanOrEqual(lowest)
          }
          // The first-run hint shows in the same place, so it steps aside while the toast shows and comes back after.
          if (hint && size.width > 760) {
            const note = page.getByRole('note')
            await expect(note).toBeHidden()
            await expect(toast).toBeHidden({ timeout: 8000 })
            await expect(note).toBeVisible()
          }
        })
      })
    }
  }
}

test.describe('a toast away from the map', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })

  test('on the Overview tab it is centered on the window, not on the map under it', async ({ page }) => {
    await open(page, SHORTENER)
    await page.getByRole('tab', { name: 'Overview' }).click()
    await expect(page.getByTestId('overview')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+k')
    const menu = page.getByRole('dialog', { name: 'Command menu' })
    await menu.getByRole('combobox').fill('Download a copy')
    const download = page.waitForEvent('download')
    await page.keyboard.press('Enter')
    await download
    const toast = page.locator('[data-sonner-toast]')
    await expect(toast).toBeVisible()
    await expect(toast).toHaveAttribute('data-mounted', 'true')
    const box = await toast.boundingBox()
    expect(box!.x + box!.width / 2, 'centered on the window').toBeCloseTo(720, 0)
    // The map keeps its own place for its toasts after the tab changes back.
    await page.getByRole('tab', { name: 'Map' }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--toast-x'))).not.toBe('')
  })

  test('in the how-to dialog it is centered on the window', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('menuitem', { name: 'How to make a board' }).click()
    const dialog = page.getByRole('dialog', { name: 'How to make a board' })
    await dialog.getByRole('button', { name: 'Copy prompt' }).click()
    const toast = page.locator('[data-sonner-toast]', { hasText: 'Copied' })
    await expect(toast).toBeVisible()
    await expect(toast).toHaveAttribute('data-mounted', 'true')
    const box = await toast.boundingBox()
    expect(box!.x + box!.width / 2, 'centered on the window').toBeCloseTo(720, 0)
  })
})

test.describe('the room the fit keeps', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('is the same with the first-run hint and without it', async ({ browser }) => {
    const views: string[] = []
    for (const seen of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await context.newPage()
      if (seen) await page.addInitScript(() => window.localStorage.setItem('anatomy:map-hint-seen', '1'))
      // A board that fits by its height, so the room at the bottom decides its zoom.
      await open(page, SIXTEEN)
      await expect(page.getByRole('note')).toHaveCount(seen ? 0 : 1)
      views.push(await viewport(page))
      await context.close()
    }
    expect(views[1]).toBe(views[0])
  })
})

test.describe('a toast with a button', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })

  test('Alt+T moves to the toasts, Tab reaches Review, and Enter opens the review', async ({ page }, testInfo) => {
    await open(page, SHORTENER)
    await revise(page, testInfo, SHORTENER)
    const toast = page.locator('[data-sonner-toast]')
    await expect(toast).toBeVisible()
    await page.keyboard.press('Alt+KeyT')
    // The toast takes a stop of its own, and its button is the next.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    const review = toast.getByRole('button', { name: 'Review' })
    await expect(review).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'true')
    await expect(toast).toBeHidden()
  })
})

test.describe('a link being dragged', () => {
  test('is drawn in the dash and dot of the user, like the link it becomes', async ({ page }) => {
    await open(page, SHORTENER)
    const pair = await linkPair(page)
    await page.mouse.move(pair.from.x, pair.from.y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(pair.from.x + ((pair.to.x - pair.from.x) * i) / 10, pair.from.y + ((pair.to.y - pair.from.y) * i) / 10)
      await nextFrame(page)
    }
    const drawn = page.locator('.react-flow__connection-path')
    await expect(drawn).toHaveCount(1)
    const look = (selector: string) =>
      page.evaluate((s) => {
        const style = getComputedStyle(document.querySelector(s)!)
        return { dash: style.strokeDasharray, width: style.strokeWidth, stroke: style.stroke, cap: style.strokeLinecap }
      }, selector)
    const dragging = await look('.react-flow__connection-path')
    // The user's pattern, `7 3 1.5 3`, and not a solid line.
    expect(dragging.dash.replaceAll('px', '').replaceAll(',', '').split(/\s+/)).toEqual(['7', '3', '1.5', '3'])
    await page.mouse.up()
    await expect(page.locator('.react-flow__edge[data-id^="manual:"]')).toHaveCount(1)
    await expect(drawn).toHaveCount(0)
    // The new link is selected, which draws it in the accent. Once it is not, it rests in the pattern of the line that was dragged.
    await page.keyboard.press('Escape')
    await expect(page.locator('.react-flow__edge[data-id^="manual:"] [data-active]')).toHaveCount(0)
    // It already looks as the link it becomes: same pattern, width, color, and ends.
    expect(await look('.react-flow__edge[data-id^="manual:"] .react-flow__edge-path')).toEqual(dragging)
  })
})

test.describe('a card with a note', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  const WEB_FORM = '.react-flow__node-card[data-id="web-form"]'

  const read = (page: Page) =>
    page.evaluate((selector) => {
      const card = document.querySelector<HTMLElement>(selector)!
      const summary = card.querySelector<HTMLElement>('p')!
      const cardBox = card.getBoundingClientRect()
      const words = document.createRange()
      words.selectNodeContents(summary)
      const lines = new Set([...words.getClientRects()].map((r) => Math.round(r.top)))
      const title = card.querySelector<HTMLElement>('[class*="label"]')!
      const titleWords = document.createRange()
      titleWords.selectNodeContents(title)
      const badge = card.querySelector<HTMLElement>('[class*="foot"] [role="img"]')
      const hit = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5
      const badgeBox = badge?.getBoundingClientRect()
      return {
        text: summary.textContent ?? '',
        clamp: summary.style.webkitLineClamp,
        shownLines: lines.size,
        clipped: summary.scrollHeight > summary.clientHeight + 1,
        badge: !!badge,
        inside: !!badgeBox && badgeBox.left >= cardBox.left && badgeBox.right <= cardBox.right && badgeBox.top >= cardBox.top && badgeBox.bottom <= cardBox.bottom,
        overTitle: !!badgeBox && [...titleWords.getClientRects()].some((r) => hit(r, badgeBox)),
        overSummary: !!badgeBox && [...words.getClientRects()].some((r) => hit(r, badgeBox)),
      }
    }, WEB_FORM)

  test('keeps every line of its summary, and the count sits clear of the words', async ({ page }) => {
    await open(page, SHORTENER)
    const before = await read(page)
    expect(before.badge).toBe(false)
    expect(before.clipped).toBe(false)

    await pickPart(page, 'web-form')
    const inspector = page.getByRole('complementary', { name: 'Sidebar' })
    await inspector.getByRole('textbox', { name: 'Add a note' }).fill('Where are the short codes kept?')
    await inspector.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(inspector.getByRole('region', { name: 'Notes' }).getByText('Where are the short codes kept?')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator(`${WEB_FORM} [data-selected]`)).toHaveCount(0)
    await expect(page.locator(`${WEB_FORM} [class*="foot"] [role="img"]`)).toBeVisible()

    const after = await read(page)
    expect(after.badge, 'the note count shows on the card').toBe(true)
    expect(after.text).toBe(before.text)
    expect(after.clamp, 'as many lines as without the note').toBe(before.clamp)
    expect(after.shownLines).toBe(before.shownLines)
    expect(after.clipped, 'no line of the summary is cut off').toBe(false)
    expect(after.inside, 'the count is inside the card').toBe(true)
    expect(after.overTitle, 'the count is not over the title').toBe(false)
    expect(after.overSummary, 'the count is not over the summary').toBe(false)
  })
})

test.describe('a card that starts a walkthrough and carries a note', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('shows the start mark and the note count apart, in different corners', async ({ page }) => {
    await open(page, REFUND)
    await pickPart(page, 'refund-request')
    const inspector = page.getByRole('complementary', { name: 'Sidebar' })
    await inspector.getByRole('textbox', { name: 'Add a note' }).fill('Who can start a refund?')
    await inspector.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(inspector.getByRole('region', { name: 'Notes' }).getByText('Who can start a refund?')).toBeVisible()
    await page.keyboard.press('Escape')
    const card = page.locator('.react-flow__node-card[data-id="refund-request"]')
    await expect(card.locator('[data-selected]')).toHaveCount(0)
    const mark = card.locator('[data-flow-start]')
    const count = card.locator('[class*="foot"] [role="img"]')
    await expect(mark).toBeVisible()
    await expect(count).toBeVisible()
    const [m, c, k] = await Promise.all([mark.boundingBox(), count.boundingBox(), card.boundingBox()])
    const apart = m!.x + m!.width <= c!.x || c!.x + c!.width <= m!.x || m!.y + m!.height <= c!.y || c!.y + c!.height <= m!.y
    expect(apart, 'the mark and the count do not touch').toBe(true)
    // The count has the top right of the card, so the mark is not there.
    expect(m!.x + m!.width, 'the mark is not at the right edge').toBeLessThan(k!.x + k!.width - 20)
  })
})

test('the tests pick a part that exists', async () => {
  const board = JSON.parse(await readFile(SHORTENER, 'utf8')) as { components: { id: string }[] }
  expect(board.components.map((c) => c.id)).toContain('web-form')
})
