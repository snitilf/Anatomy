/// <reference lib="dom" />
import { expect, test } from './test.ts'
import type { Page } from '@playwright/test'
import { open, viewport } from './helpers.ts'

const SIXTY = 'e2e/fixtures/sixty-parts.board.json'
const FORTY = 'e2e/fixtures/forty-parts.board.json'

const zoomOf = async (page: Page) => Number.parseFloat(/scale\(([\d.]+)\)/.exec(await viewport(page))?.[1] ?? '0')
const opacityOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity))
const farOn = (page: Page) => page.locator('[data-hover-scope][data-far]')

test.describe('the far view of a crowded board', () => {
  test('opens far, and names every group with its part count at a size that reads', async ({ page }) => {
    await open(page, SIXTY)
    expect(await zoomOf(page)).toBeLessThan(0.69)
    await expect(farOn(page)).toHaveCount(1)
    for (const name of ['Frontend', 'Backend', 'Data']) {
      const button = page.getByRole('button', { name: new RegExp(`^${name}, 15 parts`) })
      await expect(button).toBeVisible()
      await expect(button).toContainText(name)
      await expect(button).toContainText('15')
      // The text is drawn larger on the board so it stays about 13px on screen.
      const box = (await button.locator('span').first().boundingBox())!
      expect(box.height).toBeGreaterThan(14)
    }
  })

  test('draws cards as quiet tiles and the lines between groups as bundles, with real lines out of the picture', async ({ page }) => {
    await open(page, SIXTY)
    expect(await opacityOf(page, '.react-flow__node-card p')).toBe(0)
    const bundles = await page.locator('path[data-bundle]').count()
    expect(bundles).toBeGreaterThan(3)
    // One line for each pair of blocks: far fewer than the 78 connections.
    expect(bundles).toBeLessThan(40)
    const lines = await page.locator('g[data-ends]').evaluateAll((all) => all.map((g) => Number.parseFloat(getComputedStyle(g).opacity)))
    expect(lines.length).toBeGreaterThan(70)
    expect(lines.every((o) => o === 0)).toBe(true)
    await expect(page.locator('div[data-bundle]').first()).toBeAttached()
  })

  test('keeps every part and line in the page for a screen reader', async ({ page }) => {
    await open(page, SIXTY)
    expect(await page.getByRole('group', { name: /^Component number 1 label, in Frontend/ }).count()).toBe(1)
    await expect(page.locator('.react-flow__edge').first()).toHaveAttribute('aria-label', /.+/)
  })

  test('the first Tab into the map reaches a group, not one of the 138 hidden parts and lines', async ({ page }) => {
    await open(page, SIXTY)
    await page.locator('.react-flow__pane').click({ position: { x: 4, y: 300 } })
    await page.keyboard.press('Tab')
    const first = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)
    expect(first).toMatch(/parts?\. Zoom to this group\.$/)
  })

  test('clicking a group zooms in until the cards show their text', async ({ page }) => {
    await open(page, SIXTY)
    await page.getByRole('button', { name: /^Backend, 15 parts/ }).click()
    await page.waitForTimeout(700)
    expect(await zoomOf(page)).toBeGreaterThanOrEqual(0.75)
    await expect(farOn(page)).toHaveCount(0)
    expect(await opacityOf(page, '.react-flow__node-card p')).toBe(1)
    await expect(page.getByText('Summary for part 2.', { exact: true })).toBeVisible()
    // Back in the full view, the parts can be reached with the keyboard again.
    await expect(page.locator('.react-flow__node-card').first()).toHaveAttribute('tabindex', '0')
  })

  test('a group is reached with the keyboard', async ({ page }) => {
    await open(page, SIXTY)
    await page.getByRole('button', { name: /^Data, 15 parts/ }).focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(700)
    expect(await zoomOf(page)).toBeGreaterThanOrEqual(0.75)
  })

  test('clicking the area of a group frames it, and dragging the map across it does not', async ({ page }) => {
    await open(page, SIXTY)
    const area = page.locator('.react-flow__node-group-area').nth(1)
    const box = (await area.boundingBox())!
    const at = { x: box.x + box.width - 6, y: box.y + box.height - 6 }
    const before = await viewport(page)
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x - 40, at.y - 20, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    expect(await zoomOf(page)).toBeLessThan(0.69)
    expect(await viewport(page)).not.toBe(before)
    const moved = (await area.boundingBox())!
    await page.mouse.click(moved.x + moved.width - 6, moved.y + moved.height - 6)
    await page.waitForTimeout(700)
    expect(await zoomOf(page)).toBeGreaterThanOrEqual(0.75)
  })

  test('the fit key returns to the far view', async ({ page }) => {
    await open(page, SIXTY)
    await page.getByRole('button', { name: /^Frontend, 15 parts/ }).click()
    await page.waitForTimeout(700)
    await expect(farOn(page)).toHaveCount(0)
    await page.keyboard.press('Shift+1')
    await page.waitForTimeout(700)
    await expect(farOn(page)).toHaveCount(1)
    await expect(page.locator('path[data-bundle]').first()).toBeAttached()
  })

  test('a part picked in the far view draws its own lines solid over faded bundles', async ({ page }) => {
    await open(page, SIXTY)
    await page.locator('.react-flow__node-card').nth(20).click({ force: true })
    await page.waitForTimeout(400)
    expect(await page.locator('g[data-active]').count()).toBeGreaterThanOrEqual(2)
    expect(await opacityOf(page, 'g[data-active]')).toBe(1)
    expect(await opacityOf(page, 'path[data-bundle]')).toBeLessThan(0.3)
    const dashes = await page.locator('g[data-active] .react-flow__edge-path').evaluateAll((all) => all.map((p) => getComputedStyle(p).strokeDasharray))
    expect(dashes.every((d) => d === 'none')).toBe(true)
    await expect(page.locator('.react-flow__node.selected').getByText(/^Component number \d+ label$/).first()).toBeVisible()
  })

  test('the pointer on a tile shows its name and its own lines, solid, and nothing else', async ({ page }) => {
    await open(page, SIXTY)
    const card = page.locator('.react-flow__node-card').nth(20)
    await card.hover({ force: true })
    await page.waitForTimeout(300)
    await expect(card.locator('div').last()).toBeVisible()
    const id = await card.getAttribute('data-id')
    const own = await page.locator(`g[data-ends~="${id}"]`).evaluateAll((all) => all.map((g) => ({ o: getComputedStyle(g).opacity, d: getComputedStyle(g.querySelector('.react-flow__edge-path')!).strokeDasharray })))
    expect(own.length).toBeGreaterThan(0)
    expect(own.every((l) => l.o === '1' && l.d === 'none')).toBe(true)
    const others = await page.locator('g[data-ends]').evaluateAll((all, key) => all.filter((g) => !(g.getAttribute('data-ends') ?? '').split(' ').includes(key as string) && getComputedStyle(g).opacity !== '0').length, id)
    expect(others).toBe(0)
    await page.mouse.move(2, 400)
    await page.waitForTimeout(300)
    expect(await page.locator('g[data-ends]').evaluateAll((all) => all.filter((g) => getComputedStyle(g).opacity !== '0').length)).toBe(0)
  })

  test('a part with a note from the user carries an amber dot on its tile', async ({ page }) => {
    await open(page, SIXTY)
    await page.locator('.react-flow__node-card').nth(20).click({ force: true })
    const panel = page.getByRole('complementary', { name: 'Sidebar' })
    await panel.getByRole('textbox', { name: /^Add a (note|question)$/ }).fill('Check this one')
    await panel.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(panel.getByText('Check this one').first()).toBeVisible()
    const dots = page.locator('.react-flow__node-card [class*="dot"]')
    await expect(dots).toHaveCount(1)
    await expect(dots.first()).toBeVisible()
    const color = await dots.first().evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(color).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('a tile wide enough on screen names its part inside it, at about 11px, on one or two lines, and a narrower one does not', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 768 })
    await open(page, 'e2e/fixtures/sixteen-parts.board.json')
    await expect(farOn(page)).toHaveCount(1)
    const names = page.locator('.react-flow__node-card [class*="tileName"]')
    expect(await names.count()).toBe(16)
    const found = await names.evaluateAll((all) =>
      all.map((el) => {
        const card = el.closest('.react-flow__node-card')!.getBoundingClientRect()
        const r = el.getBoundingClientRect()
        const scale = r.height / (el as HTMLElement).offsetHeight
        return { inside: r.left >= card.left && r.right <= card.right && r.top >= card.top && r.bottom <= card.bottom, px: Number.parseFloat(getComputedStyle(el).fontSize) * scale, lines: Math.round(r.height / (Number.parseFloat(getComputedStyle(el).lineHeight) * scale)), width: card.width }
      }),
    )
    for (const n of found) {
      expect(n.inside).toBe(true)
      expect(n.px).toBeGreaterThan(9.5)
      expect(n.px).toBeLessThan(13)
      expect(n.lines).toBeLessThanOrEqual(2)
      expect(n.width).toBeGreaterThanOrEqual(88)
    }
    // Nothing sits outside a tile.
    await expect(page.locator('[data-far-label]:not(button)').filter({ hasText: /Component/ })).toHaveCount(0)
    // Sixty (43px tiles) and forty (70px tiles) are too narrow to hold eight letters, so they carry no names.
    for (const file of [SIXTY, FORTY]) {
      await open(page, file)
      await expect(farOn(page)).toHaveCount(1)
      await expect(page.locator('.react-flow__node-card [class*="tileName"]')).toHaveCount(0)
    }
  })

  test('the name on a tile and the hover name exist only in the far view', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 768 })
    await open(page, 'e2e/fixtures/sixteen-parts.board.json')
    await expect(page.locator('.react-flow__node-card [class*="tileName"]')).toHaveCount(16)
    await expect(page.locator('.react-flow__node [class*="tip"]')).toHaveCount(16)
    await page.keyboard.press('Shift+Digit0')
    await expect(farOn(page)).toHaveCount(0)
    await expect(page.locator('.react-flow__node-card [class*="tileName"]')).toHaveCount(0)
    await expect(page.locator('.react-flow__node [class*="tip"]')).toHaveCount(0)
  })

  test('after a group is picked, focus is on its first card', async ({ page }) => {
    await open(page, SIXTY)
    await page.getByRole('button', { name: /^Data, 15 parts/ }).focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)
    expect(label).toMatch(/, in Data$/)
  })

  test('a hover on a tile does not leave its lines behind when the view changes', async ({ page }) => {
    await open(page, SIXTY)
    await page.locator('.react-flow__node-card').nth(20).hover({ force: true })
    await page.keyboard.press('Shift+Digit0')
    await expect(farOn(page)).toHaveCount(0)
    expect(await page.locator('[data-hover-scope] style').first().evaluate((el) => el.textContent)).not.toContain('data-far')
  })
})

/** Every label the far view draws, as boxes on screen, with the cards. */
async function farBoxes(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    const labels = [...document.querySelectorAll('[data-far-label]')].map((el) => ({ text: (el.textContent ?? '').slice(0, 24), box: box(el) }))
    const cards = [...document.querySelectorAll('.react-flow__node-card')].map((el) => ({ id: (el as HTMLElement).dataset.id ?? '', box: box(el) }))
    return { labels, cards }
  })
}

const over = (a: { left: number; top: number; right: number; bottom: number }, b: typeof a) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  for (const board of [
    { name: 'sixty', file: SIXTY },
    { name: 'forty', file: FORTY },
  ]) {
    test(`far view labels cover no other label and no card at 0.33 zoom and at fit: ${board.name}, ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size)
      await open(page, board.file)
      const check = async (what: string) => {
        await page.waitForTimeout(500)
        await expect(farOn(page)).toHaveCount(1)
        const found = await farBoxes(page)
        expect(found.labels.length, `${what}: labels`).toBeGreaterThan(2)
        for (let i = 0; i < found.labels.length; i++) {
          for (let j = i + 1; j < found.labels.length; j++) expect(over(found.labels[i]!.box, found.labels[j]!.box), `${what}: "${found.labels[i]!.text}" covers "${found.labels[j]!.text}"`).toBe(false)
        }
        for (const label of found.labels) {
          // A name sits off every tile. A count sits on a line, in a gap between tiles.
          for (const card of found.cards) expect(over(label.box, card.box), `${what}: "${label.text}" covers ${card.id}`).toBe(false)
        }
      }
      await check('fit')
      await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })
      await page.keyboard.press('Shift+Digit0')
      for (let i = 0; i < 4; i++) await page.keyboard.press('ControlOrMeta+Minus')
      await expect.poll(async () => zoomOf(page)).toBeLessThan(0.45)
      expect(await zoomOf(page)).toBeGreaterThan(0.28)
      await check('0.33')
    })
  }
}

test.describe('the spotlight on a selection', () => {
  test('a selected part keeps its own lines and steps every other line and card far back', async ({ page }) => {
    await open(page, SIXTY)
    await page.getByRole('button', { name: /^Frontend, 15 parts/ }).click()
    await page.waitForTimeout(700)
    const card = page.locator('.react-flow__node-card', { hasText: 'Component number 1 label' })
    await card.click()
    await page.waitForTimeout(400)
    const fade = await page.locator('g[data-ends]').evaluateAll((all) => all.map((g) => ({ faded: g.hasAttribute('data-faded'), opacity: Number.parseFloat(getComputedStyle(g).opacity) })))
    const strong = fade.filter((l) => !l.faded)
    const back = fade.filter((l) => l.faded)
    expect(strong.length).toBeGreaterThan(0)
    expect(back.length).toBeGreaterThan(40)
    expect(strong.every((l) => l.opacity === 1)).toBe(true)
    expect(back.every((l) => l.opacity <= 0.25)).toBe(true)
    const cards = await page.locator('.react-flow__node-card > div').evaluateAll((all) => all.map((c) => Number.parseFloat(getComputedStyle(c).opacity)))
    expect(cards.filter((o) => o < 0.6).length).toBeGreaterThan(30)
    expect(cards.filter((o) => o === 1).length).toBeGreaterThanOrEqual(2)
  })

  test('a selected line keeps its ends and steps the rest back', async ({ page }) => {
    await open(page, 'e2e/fixtures/refund-approval.board.json')
    await page.locator('.react-flow__edge').first().click({ force: true })
    await page.waitForTimeout(400)
    const fade = await page.locator('g[data-ends]').evaluateAll((all) => all.map((g) => Number.parseFloat(getComputedStyle(g).opacity)))
    expect(fade.filter((o) => o === 1).length).toBe(1)
    expect(fade.filter((o) => o <= 0.25).length).toBe(fade.length - 1)
  })

  test('the examples open fitted, and never in the far view', async ({ page }) => {
    for (const file of ['src/examples/claude-code-harness.board.json', 'src/examples/how-an-llm-works.board.json', 'e2e/fixtures/refund-approval.board.json', 'e2e/fixtures/url-shortener.board.json', 'src/examples/anatomy.board.json']) {
      await open(page, file)
      await expect(farOn(page)).toHaveCount(0)
      expect(await zoomOf(page)).toBeGreaterThanOrEqual(0.45)
    }
  })
})

const WALK = 'e2e/fixtures/sixty-parts-walkthrough.board.json'
const STEPS: { text: string; parts: string[] }[] = [
  { text: '2 / 4', parts: ['c-1', 'c-7', 'c-10', 'c-13', 'c-19', 'c-22', 'c-25', 'c-31', 'c-34', 'c-37', 'c-41', 'c-45', 'c-49', 'c-53', 'c-57'] },
  { text: '3 / 4', parts: ['c-1', 'c-60'] },
  { text: '4 / 4', parts: ['c-4'] },
]

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`every part a walkthrough step names is fully in view after the step: ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size)
    await open(page, WALK)
    const inside = () =>
      page.evaluate((ids) => {
        const map = document.querySelector('.react-flow')!.getBoundingClientRect()
        return ids.map((id) => {
          const r = document.querySelector(`.react-flow__node-card[data-id="${id}"]`)!.getBoundingClientRect()
          return { id, ok: r.left >= map.left - 1 && r.right <= map.right + 1 && r.top >= map.top - 1 && r.bottom <= map.bottom + 1 }
        })
      }, STEPS.flatMap((s) => s.parts))
    const play = page.getByRole('button', { name: 'Play Whole board walk' })
    // On a phone the list is in the sheet, which a tap on its header raises.
    if (size.width < 500) await page.getByRole('region', { name: 'Sidebar' }).getByRole('button').first().click()
    await play.click()
    const player = page.getByRole('region', { name: 'Walkthrough: Whole board walk' })
    await expect(player.getByText('1 / 4')).toBeVisible()
    for (const step of STEPS) {
      await player.getByRole('button', { name: 'Next' }).click()
      await expect(player.getByText(step.text)).toBeVisible()
      await page.waitForTimeout(700)
      const found = await inside()
      for (const part of step.parts) expect(found.find((f) => f.id === part)?.ok, `${part} in view at step ${step.text}`).toBe(true)
    }
  })
}
