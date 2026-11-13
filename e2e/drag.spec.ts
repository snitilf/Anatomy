/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { cardTransform, grabbable, nextFrame, open } from './helpers.ts'

const BOARD_FILE = 'src/examples/nordet.board.json'

test('Escape during a drag puts the card back and keeps the selection', async ({ page }) => {
  await open(page, BOARD_FILE)
  const inspector = page.getByRole('complementary', { name: 'Details' })
  const spot = await grabbable(page)
  const start = await cardTransform(page, spot.id)

  await page.mouse.move(spot.x, spot.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(spot.x + i * 8, spot.y + i * 5)
    await nextFrame(page)
  }
  expect(await cardTransform(page, spot.id)).not.toBe(start)
  const heading = await inspector.getByRole('heading', { level: 2 }).innerText()

  await page.keyboard.press('Escape')
  await nextFrame(page)
  expect(await cardTransform(page, spot.id)).toBe(start)
  // The pointer is still down: moving on must not bring the card back.
  await page.mouse.move(spot.x + 150, spot.y + 90)
  await nextFrame(page)
  expect(await cardTransform(page, spot.id)).toBe(start)
  await page.mouse.up()

  expect(await cardTransform(page, spot.id)).toBe(start)
  // Escape did not clear the selection.
  await expect(inspector.getByRole('heading', { level: 2 })).toHaveText(heading)
  await page.reload()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  expect(await cardTransform(page, spot.id)).toBe(start)
})

test('dragging a card during a walkthrough keeps the panel and never dims the held card', async ({ page }) => {
  await open(page, BOARD_FILE)
  const inspector = page.getByRole('complementary', { name: 'Details' })
  await inspector.getByRole('button', { name: 'Play Approve and simulate' }).click()
  const player = page.getByRole('region', { name: 'Walkthrough: Approve and simulate' })
  await expect(player.getByText('Step 1 of 5')).toBeVisible()
  await page.waitForTimeout(400)

  const dimmedCard = page.locator('.react-flow__node-card:has([data-dimmed="true"])').first()
  await expect(dimmedCard).toBeVisible()
  const id = (await dimmedCard.getAttribute('data-id')) ?? ''
  const box = (await dimmedCard.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const heading = await inspector.getByRole('heading', { level: 2 }).innerText()

  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x + i * 6, y + i * 4)
    await nextFrame(page)
  }
  await expect(page.locator(`.react-flow__node-card[data-id="${id}"] [data-dimmed="true"]`)).toHaveCount(0)
  await page.mouse.up()

  await expect(inspector.getByRole('heading', { level: 2 })).toHaveText(heading)
  await expect(player).toBeVisible()
})
