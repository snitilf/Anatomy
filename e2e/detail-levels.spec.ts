/// <reference lib="dom" />
import { expect, test } from './test.ts'
import type { Page } from '@playwright/test'
import { open, viewport } from './helpers.ts'

const FORTY = 'e2e/fixtures/forty-parts.board.json'
const SIXTEEN = 'e2e/fixtures/sixteen-parts.board.json'
const CLAUDE = 'src/examples/claude-code-harness.board.json'
const REFUND = 'e2e/fixtures/refund-approval.board.json'

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

const zoomOf = async (page: Page) => Number.parseFloat(/scale\(([\d.]+)\)/.exec(await viewport(page))?.[1] ?? 'NaN')

/**
 * The room around the board in the part of the map that nothing covers: from the map's edges, and from 8 px above the
 * top of the hint, the tool bars, and the line that says what is hidden, whichever is highest.
 */
function room(page: Page) {
  return page.evaluate(() => {
    const flow = document.querySelector('.react-flow')!
    const map = flow.getBoundingClientRect()
    const boxes = [...document.querySelectorAll('.react-flow__node-card, [class*="react-flow__node-group"]')].map((n) => n.getBoundingClientRect())
    const left = Math.min(...boxes.map((r) => r.left))
    const right = Math.max(...boxes.map((r) => r.right))
    const top = Math.min(...boxes.map((r) => r.top))
    const bottom = Math.max(...boxes.map((r) => r.bottom))
    let floor = map.bottom
    for (const el of flow.querySelectorAll('[role="toolbar"], [role="note"], [data-testid="hidden-detail"]')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) floor = Math.min(floor, r.top - 8)
    }
    return { left: left - map.left, right: map.right - right, top: top - map.top, bottom: floor - bottom }
  })
}

/** The board is whole in the free part of the map, with room on every side, and centred in it. */
async function expectWholeAndCentred(page: Page) {
  const r = await room(page)
  for (const side of ['left', 'right', 'top', 'bottom'] as const) expect(r[side], `room on the ${side}: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(24)
  expect(Math.abs(r.left - r.right), `centred across: ${JSON.stringify(r)}`).toBeLessThanOrEqual(2)
  expect(Math.abs(r.top - r.bottom), `centred down: ${JSON.stringify(r)}`).toBeLessThanOrEqual(2)
}

test.describe('detail levels with keyboard and reduced motion', () => {
  test('keyboard zoom steps across full, title, and far levels and updates hidden-detail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, FORTY)
    const map = page.locator('[data-detail]')
    const hidden = page.getByTestId('hidden-detail')

    // Opens fitted in the far view and says what is hidden.
    await expect(map).toHaveAttribute('data-detail', 'far')
    await expect(hidden).toBeVisible()

    // Shift+0 resets to 100% (full cards, nothing hidden).
    await page.keyboard.press('Shift+Digit0')
    await expect(map).toHaveAttribute('data-detail', 'full')
    await expect(hidden).toBeHidden()

    // Stepping down with keyboard zoom crosses into the title level (0.67).
    await page.keyboard.press('ControlOrMeta+Minus') // 0.8
    await page.keyboard.press('ControlOrMeta+Minus') // 0.67
    await expect(map).toHaveAttribute('data-detail', 'title')

    // Shift+1 fits the whole board again, back into the far view.
    await page.keyboard.press('Shift+1')
    await expect(map).toHaveAttribute('data-detail', 'far')
    await expect(hidden).toBeVisible()
  })

  test('under reduced motion, switching detail levels settles immediately at the end state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, FORTY)
    const map = page.locator('[data-detail]')
    const hidden = page.getByTestId('hidden-detail')

    await expect(map).toHaveAttribute('data-detail', 'far')
    await expect(hidden).toBeVisible()

    await page.keyboard.press('Shift+Digit0')
    const after = await viewport(page)
    await expect(map).toHaveAttribute('data-detail', 'full')
    await expect(hidden).toBeHidden()
    // No glide in flight: viewport stays at the same transform.
    await page.waitForTimeout(80)
    expect(await viewport(page)).toBe(after)

    await page.keyboard.press('Shift+1')
    await expect(map).toHaveAttribute('data-detail', 'far')
    await expect(hidden).toBeVisible()
  })

  test('a small window resize does not flip the detail level back and forth', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, CLAUDE)
    const map = page.locator('[data-detail]')
    const initial = await map.getAttribute('data-detail')
    expect(['full', 'title']).toContain(initial)
    for (const width of [1436, 1444, 1438, 1442]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(200)
      expect(await map.getAttribute('data-detail')).toBe(initial)
    }
  })

  test('at a threshold, a window that shrinks and grows by a few pixels changes the level once, not back and forth', async ({ page }) => {
    let width = 1440
    let height = 900
    await page.setViewportSize({ width, height })
    await open(page, REFUND)
    const map = page.locator('[data-detail]')
    await expect(map).toHaveAttribute('data-detail', 'full')
    // Shrink the window a few pixels at a time until the fitted board crosses into the title level.
    let above = 0
    for (let i = 0; i < 60 && (await map.getAttribute('data-detail')) === 'full'; i++) {
      above = await zoomOf(page)
      width -= 8
      height -= 5
      await page.setViewportSize({ width, height })
      await settled(page)
    }
    await expect(map).toHaveAttribute('data-detail', 'title')
    // Back and forth across the threshold: the zoom goes back to where it was full, and the level holds.
    for (let i = 0; i < 3; i++) {
      await page.setViewportSize({ width: width + 8, height: height + 5 })
      await settled(page)
      expect(await zoomOf(page)).toBeCloseTo(above, 3)
      await expect(map).toHaveAttribute('data-detail', 'title')
      await page.setViewportSize({ width, height })
      await settled(page)
      await expect(map).toHaveAttribute('data-detail', 'title')
    }
  })
})

test.describe('the title level', () => {
  test('a card shows its title alone, centred in the card and larger than a line label', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, CLAUDE)
    await expect(page.locator('[data-detail]')).toHaveAttribute('data-detail', 'title')
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')].map((node) => {
        const card = node.querySelector('[data-card]')!.getBoundingClientRect()
        const title = node.querySelector<HTMLElement>('[data-card] > [class*="label"]')!
        const words = document.createRange()
        words.selectNodeContents(title)
        const text = words.getBoundingClientRect()
        const zoom = Number.parseFloat(/scale\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform)![1]!)
        return {
          id: node.dataset.id,
          dx: Math.abs(text.left + text.width / 2 - (card.left + card.width / 2)),
          dy: Math.abs(text.top + text.height / 2 - (card.top + card.height / 2)),
          px: Number.parseFloat(getComputedStyle(title).fontSize) * zoom,
        }
      }),
    )
    expect(cards.length).toBeGreaterThan(0)
    for (const c of cards) {
      expect(c.dx, `${c.id} is centred across`).toBeLessThanOrEqual(2)
      expect(c.dy, `${c.id} is centred down`).toBeLessThanOrEqual(2)
      // A line label holds 11 px on screen; the title of a card stays a step above it.
      expect(c.px, `${c.id} title size on screen`).toBeGreaterThanOrEqual(12)
    }
  })
})

test.describe('labels at the opening view', () => {
  const boards = [
    ['anatomy', 'src/examples/anatomy.board.json'],
    ['claude code harness', CLAUDE],
    ['large language model', 'src/examples/how-an-llm-works.board.json'],
    ['refund approval', REFUND],
    ['url shortener', 'e2e/fixtures/url-shortener.board.json'],
  ] as const
  for (const [name, file] of boards) {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ] as const) {
      test(`no label covers another, grown to 11 px on screen: ${name} at ${width}x${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await open(page, file)
        await settled(page)
        const clashes = await page.evaluate(() => {
          const shown = (el: Element) => {
            const s = getComputedStyle(el)
            return s.display !== 'none' && s.visibility !== 'hidden' && Number.parseFloat(s.opacity) > 0.05
          }
          const labels = [...document.querySelectorAll<HTMLElement>('[data-label][data-edge]')]
            .filter((el) => !el.hasAttribute('data-hidden') && shown(el))
            .map((el) => ({ id: el.dataset.edge, r: el.getBoundingClientRect() }))
          const out: string[] = []
          for (let i = 0; i < labels.length; i++) {
            for (let j = i + 1; j < labels.length; j++) {
              const a = labels[i]!.r
              const b = labels[j]!.r
              if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push(`${labels[i]!.id} and ${labels[j]!.id}`)
            }
          }
          return out
        })
        expect(clashes).toEqual([])
      })
    }
  }
})

test.describe('the opening view', () => {
  test('stays whole and centred once the fonts and the hint are in', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SIXTEEN)
    await settled(page)
    await expectWholeAndCentred(page)
  })

  test('follows a resize while the reader has not moved it, and keeps their zoom once they have', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, CLAUDE)
    await settled(page)
    await expectWholeAndCentred(page)
    await page.setViewportSize({ width: 1180, height: 760 })
    await settled(page)
    await expectWholeAndCentred(page)

    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('ControlOrMeta+Equal')
    await settled(page)
    const zoom = await zoomOf(page)
    await page.setViewportSize({ width: 1300, height: 820 })
    await settled(page)
    expect(await zoomOf(page)).toBeCloseTo(zoom, 4)
  })
})
