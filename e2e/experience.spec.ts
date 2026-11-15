import { expect, test, type Page } from '@playwright/test'
import { grabbable, open, viewport } from './helpers.ts'

const EXAMPLE = 'src/examples/example.board.json'
const SHORTENER = 'src/examples/external/url-shortener.board.json'
const FORTY = 'e2e/fixtures/forty-parts.board.json'

const zoomOf = async (page: Page) => {
  const match = /scale\(([\d.]+)\)/.exec(await viewport(page))
  return match ? Number(match[1]) : 0
}

test('the map opens at a readable zoom, and Fit still shows the whole board', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await open(page, FORTY)
  // The whole board would need far less than a readable zoom, so the first view is the start of the flow.
  expect(await zoomOf(page)).toBeGreaterThanOrEqual(0.79)
  const first = await page.locator('.react-flow__node-card').first().boundingBox()
  expect(first?.x).toBeGreaterThanOrEqual(0)
  expect(first?.y).toBeGreaterThanOrEqual(0)

  await page.getByRole('button', { name: 'Fit board' }).click()
  await expect.poll(() => zoomOf(page)).toBeLessThan(0.5)
})

test('a small board is framed larger than before, and cards hold a title, three summary lines, and the badge row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, EXAMPLE)
  expect(await zoomOf(page)).toBeGreaterThan(0.6)
  const fits = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.react-flow__node-card > div')].every((card) => card.scrollHeight <= card.clientHeight + 1),
  )
  expect(fits).toBe(true)
})

test('the map hint shows once, until the first click, and stays gone after a reload', async ({ page }) => {
  await open(page, EXAMPLE)
  const hint = page.getByRole('note').filter({ hasText: 'Drag a card to move it' })
  await expect(hint).toBeVisible()
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })
  await expect(hint).toBeHidden()
  await page.reload()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await expect(hint).toBeHidden()
})

test('the map hint is not shown on a narrow screen and is not used up there', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 })
  await open(page, EXAMPLE)
  await expect(page.getByRole('note')).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(page.getByRole('note').filter({ hasText: 'Drag a card to move it' })).toBeVisible()
})

test('Ctrl and wheel changes the zoom by at most about 20 per cent per event', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  // A board that does not fit at its start zoom, so there is room to zoom out.
  await open(page, SHORTENER)
  const before = await zoomOf(page)
  const box = (await page.locator('.react-flow__pane').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 400)
  await page.keyboard.up('Control')
  await expect.poll(() => zoomOf(page)).toBeLessThan(before)
  const after = await zoomOf(page)
  expect(after / before).toBeGreaterThanOrEqual(1 / 1.21)
})

test('a card dropped under the inspector is brought back into view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await open(page, EXAMPLE)
  const spot = await grabbable(page)
  const map = (await page.locator('.react-flow__pane').boundingBox())!
  await page.mouse.move(spot.x, spot.y)
  await page.mouse.down()
  // Out past the right edge of the map, over the inspector.
  await page.mouse.move(map.x + map.width + 120, spot.y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const card = (await page.locator(`.react-flow__node-card[data-id="${spot.id}"]`).boundingBox())!
  expect(card.x).toBeGreaterThanOrEqual(map.x)
  expect(card.x + card.width).toBeLessThanOrEqual(map.x + map.width + 1)
})

test('an example chosen from the start screen moves focus to the sidebar heading', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Example check-in/ }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('heading', { level: 2 }).first()).toBeFocused()
})

test('the map hint can be closed with its button', async ({ page }) => {
  await open(page, EXAMPLE)
  await page.getByRole('button', { name: 'Dismiss hint' }).click()
  await expect(page.getByRole('note')).toHaveCount(0)
})

test('selecting a part softens the other lines, and a selected connection is drawn at 1.5px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, EXAMPLE)
  const inspector = page.getByRole('complementary', { name: 'Sidebar' })
  const opacities = () =>
    page.evaluate(() => [...document.querySelectorAll<SVGElement>('.react-flow__edge g[data-faded]')].length)
  expect(await opacities()).toBe(0)

  await inspector.getByRole('button', { name: /^Approval (?!to )/ }).click()
  expect(await opacities()).toBeGreaterThan(0)

  await inspector.getByRole('region', { name: 'Flow' }).getByRole('button', { name: 'approved action version' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const path = document.querySelector<SVGPathElement>('.react-flow__edge.selected .react-flow__edge-path')
        return path ? getComputedStyle(path).strokeWidth : ''
      }),
    )
    .toBe('1.5px')
})

test('the panel starts at the top for every new selection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 })
  await open(page, EXAMPLE)
  const inspector = page.getByRole('complementary', { name: 'Sidebar' })
  const scroller = inspector.locator('[data-scroll]')
  await scroller.evaluate((el) => el.scrollTo({ top: 400 }))
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await inspector.getByRole('button', { name: /^Approval (?!to )/ }).click()
  await expect(inspector.getByRole('heading', { name: 'Approval', level: 2 })).toBeVisible()
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0)
})

test('a part opens on its summary and flow, with the citations closed', async ({ page }) => {
  await open(page, EXAMPLE)
  const inspector = page.getByRole('complementary', { name: 'Sidebar' })
  await inspector.getByRole('button', { name: /^Approval (?!to )/ }).click()
  await expect(inspector.getByRole('region', { name: 'Flow' })).toBeVisible()
  await expect(inspector.locator('details')).not.toHaveCount(0)
  await expect(inspector.locator('details[open]')).toHaveCount(0)
})
