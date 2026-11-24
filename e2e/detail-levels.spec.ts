/// <reference lib="dom" />
import { expect, test } from './test.ts'
import type { Page } from '@playwright/test'
import { open, pickPart, viewport } from './helpers.ts'

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
      await settled(page)
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

test.describe('a title-only card with badges', () => {
  /** Every card whose badges overlap a line of its title, or stick out of the card. */
  const clashes = (page: Page) =>
    page.evaluate(() => {
      const out: string[] = []
      for (const node of document.querySelectorAll<HTMLElement>('.react-flow__node-card')) {
        const card = node.querySelector('[data-card]')
        const foot = card?.querySelector('[class*="foot"]')
        const title = card?.querySelector('[class*="label"]')
        if (!card || !foot || !title) continue
        const c = card.getBoundingClientRect()
        const f = foot.getBoundingClientRect()
        const words = document.createRange()
        words.selectNodeContents(title)
        const lines = [...words.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
        if (lines.some((l) => Math.min(l.right, f.right) - Math.max(l.left, f.left) > 0.5 && Math.min(l.bottom, f.bottom) - Math.max(l.top, f.top) > 0.5)) out.push(`${node.dataset.id}: badges over the title`)
        if (f.left < c.left || f.right > c.right || f.top < c.top || f.bottom > c.bottom) out.push(`${node.dataset.id}: badges out of the card`)
        for (const l of lines) if (l.top < c.top - 0.5 || l.bottom > c.bottom + 0.5) out.push(`${node.dataset.id}: title out of the card`)
      }
      return out
    })

  test('keeps its badges clear of a two-line title, down to the far view', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, CLAUDE)
    const inspector = page.getByRole('complementary', { name: 'Sidebar' })
    // A two-line title with a note, and a two-line title with a note and a lesson.
    for (const id of ['your-files', 'permission-check']) {
      await pickPart(page, id)
      await inspector.getByRole('textbox', { name: 'Add a note' }).fill(`A note on ${id}`)
      await inspector.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(inspector.getByRole('region', { name: 'Notes' }).getByText(`A note on ${id}`)).toBeVisible()
    }
    await page.keyboard.press('Escape')
    const map = page.locator('[data-detail]')
    for (const size of [
      { width: 1280, height: 800 },
      { width: 1120, height: 700 },
      { width: 1060, height: 660 },
    ]) {
      await page.setViewportSize(size)
      await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })
      await page.keyboard.press('Shift+Digit1')
      await settled(page)
      await expect(map).toHaveAttribute('data-detail', 'title')
      await expect(page.locator('.react-flow__node-card [class*="foot"]')).toHaveCount(2)
      expect(await clashes(page), `at ${size.width}x${size.height}, zoom ${await zoomOf(page)}`).toEqual([])
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
      test(`no label's words cover another's, grown to 11 px on screen: ${name} at ${width}x${height}`, async ({ page }) => {
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
            .map((el) => {
              // The words of the label, line by line, not the padding of its pill, which may touch a neighbour's.
              const words = document.createRange()
              words.selectNodeContents(el)
              return { id: el.dataset.edge, lines: [...words.getClientRects()].filter((r) => r.width > 0 && r.height > 0) }
            })
          const out: string[] = []
          for (let i = 0; i < labels.length; i++) {
            for (let j = i + 1; j < labels.length; j++) {
              const clash = labels[i]!.lines.some((a) => labels[j]!.lines.some((b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2))
              if (clash) out.push(`${labels[i]!.id} and ${labels[j]!.id}`)
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

  test('after the hint is dismissed, Fit is as far out as the zoom goes, by button and by wheel', async ({ page }) => {
    // A board that fits by its height, so the room the hint took decides its zoom.
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SIXTEEN)
    await settled(page)
    await page.getByRole('note').getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByRole('note')).toHaveCount(0)
    await page.keyboard.press('Shift+Digit1')
    await settled(page)
    const fit = await zoomOf(page)
    const out = page.getByRole('toolbar', { name: 'Zoom' }).getByRole('button', { name: 'Zoom out' })
    await expect(out).toBeDisabled()
    // The wheel neither goes below Fit nor bounces back to it.
    const box = (await page.locator('.react-flow__pane').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const seen: number[] = []
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 200)
      for (let j = 0; j < 6; j++) {
        await page.waitForTimeout(40)
        seen.push(await zoomOf(page))
      }
    }
    expect(Math.min(...seen)).toBeCloseTo(fit, 4)
    expect(Math.max(...seen)).toBeCloseTo(fit, 4)
  })

  test('after the hint and the sidebar go, zooming out stops at Fit and stays there', async ({ page }) => {
    // On a narrow map the hint stacks over the tool bar and takes the most room.
    await page.setViewportSize({ width: 1024, height: 768 })
    await open(page, 'src/examples/how-an-llm-works.board.json')
    await settled(page)
    await page.getByRole('note').getByRole('button', { name: 'Dismiss' }).click()
    await page.keyboard.press(']')
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeHidden()
    await settled(page)
    await page.keyboard.press('Shift+Digit1')
    await settled(page)
    const fit = await zoomOf(page)
    const out = page.getByRole('toolbar', { name: 'Zoom' }).getByRole('button', { name: 'Zoom out' })
    await expect(out).toBeDisabled()
    await page.keyboard.press('ControlOrMeta+Equal')
    await settled(page)
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ControlOrMeta+Minus')
      await settled(page)
      expect(await zoomOf(page)).toBeGreaterThanOrEqual(fit - 1e-4)
    }
    expect(await zoomOf(page)).toBeCloseTo(fit, 4)
    await expect(out).toBeDisabled()
  })

  test('stays where it is when the hint is dismissed', async ({ page }) => {
    // A board that fits by its height, so the room the hint took decides its zoom.
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SIXTEEN)
    await settled(page)
    const before = await viewport(page)
    await page.getByRole('note').getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByRole('note')).toHaveCount(0)
    await settled(page)
    expect(await viewport(page)).toBe(before)
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
