import { expect, test } from '@playwright/test'
import { open, viewport } from './helpers.ts'

const NORDET = 'src/examples/nordet.board.json'
const SHORTENER = 'src/examples/external/url-shortener.board.json'
const SIXTEEN = 'e2e/fixtures/sixteen-parts.board.json'

test('the command menu finds a part by name and opens it', async ({ page }) => {
  await open(page, SHORTENER)
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill('redirect handler')
  await menu.getByRole('option', { name: /^Redirect handler/ }).click()
  await expect(menu).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('heading', { name: 'Redirect handler', level: 2 })).toBeVisible()
})

test('] hides the sidebar, the map takes the room and keeps its middle, and ] brings it back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, SIXTEEN)
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
  const before = (await page.locator('.react-flow').boundingBox())!
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press(']')
  await expect(sidebar).toBeHidden()
  await expect.poll(async () => (await page.locator('.react-flow').boundingBox())!.width).toBeGreaterThan(before.width + 300)
  // The zoom stays: the view does not fit the board again.
  const zoom = /scale\(([\d.]+)\)/.exec(await viewport(page))?.[1]
  await page.waitForTimeout(400)
  expect(Number(/scale\(([\d.]+)\)/.exec(await viewport(page))?.[1])).toBeCloseTo(Number(zoom), 3)
  await page.keyboard.press(']')
  await expect(sidebar).toBeVisible()
})

test('the walkthrough bar steps with the arrow keys and closes with Escape', async ({ page }) => {
  await open(page, NORDET)
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: 'Play Approve and simulate' }).click()
  const bar = page.getByRole('region', { name: 'Walkthrough: Approve and simulate' })
  await expect(bar.getByText('1 / 5')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(bar.getByText('3 / 5')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(bar.getByText('2 / 5')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('the sidebar is a sheet: a slow drag settles on the nearest stop, a flick goes on to the next', async ({ page }) => {
    await open(page, NORDET)
    const sheet = page.getByRole('region', { name: 'Sidebar' })
    await expect(sheet).toHaveAttribute('data-stop', '0')
    const header = sheet.getByRole('button').first()
    const box = (await header.boundingBox())!
    const x = box.x + box.width / 2
    await page.mouse.move(x, box.y + 20)
    await page.mouse.down()
    for (let i = 1; i <= 20; i++) await page.mouse.move(x, box.y + 20 - i * 18)
    await page.waitForTimeout(200)
    await page.mouse.up()
    await expect(sheet).toHaveAttribute('data-stop', '1')

    const top = (await header.boundingBox())!
    await page.mouse.move(x, top.y + 20)
    await page.mouse.down()
    for (let i = 1; i <= 3; i++) await page.mouse.move(x, top.y + 20 - i * 20)
    await page.mouse.up()
    await expect(sheet).toHaveAttribute('data-stop', '2')

    // A part picked on the map raises the sheet to half, so its details show.
    await header.click()
    await expect(sheet).toHaveAttribute('data-stop', '0')
    await page.locator('.react-flow__node-card').first().click()
    await expect(sheet).toHaveAttribute('data-stop', '1')
  })
})
