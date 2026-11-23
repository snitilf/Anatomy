import { readFile } from 'node:fs/promises'
import { expect, test } from './test.ts'
import { cardTransform, drag, grabbable } from './helpers.ts'

// The key src/workspace/testFolder.ts reads. The e2e build stands in a folder kept in localStorage for the folder picker.
const KEY = 'anatomy:test-folder'

const storedLayer = (page: import('@playwright/test').Page) =>
  page.evaluate((key) => {
    const files = (JSON.parse(localStorage.getItem(key) ?? '{}') as { files: Record<string, { text: string }> }).files
    return files['layer.json'] ? (JSON.parse(files['layer.json'].text) as { positions: Record<string, unknown> }) : undefined
  }, KEY)

test('folder mode: open the repository, move a card, reload, the place is kept, and undo works', async ({ page }) => {
  const board = await readFile('e2e/fixtures/url-shortener.board.json', 'utf8')
  await page.addInitScript(
    ([key, text]) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify({ name: 'shortener', files: { 'board.json': { text, lastModified: 1 } }, remembered: false }))
      }
    },
    [KEY, board] as const,
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await page.waitForTimeout(400)
  expect(await storedLayer(page)).toBeUndefined()

  const spot = await grabbable(page)
  const start = await cardTransform(page, spot.id)
  await drag(page, spot, 120, 60)
  const moved = await cardTransform(page, spot.id)
  expect(moved).not.toBe(start)
  await expect(page.locator('[data-save-state="saved"]')).toBeAttached()
  // The crumb names the folder the board came from.
  await expect(page.getByRole('banner').getByRole('button', { name: 'shortener', exact: true })).toBeVisible()
  // A card the drop covered steps aside and is saved with it.
  await expect.poll(async () => Object.keys((await storedLayer(page))?.positions ?? {})).toContain(spot.id)

  await page.reload()
  await expect(page.locator(`.react-flow__node-card[data-id="${spot.id}"]`)).toBeVisible()
  expect(await cardTransform(page, spot.id)).toBe(moved)

  // Undo after the reload starts with the next change.
  await page.waitForTimeout(400)
  const next = await grabbable(page)
  const before = await cardTransform(page, next.id)
  await drag(page, next, -80, 40)
  const after = await cardTransform(page, next.id)
  expect(after).not.toBe(before)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => cardTransform(page, next.id)).toBe(before)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(() => cardTransform(page, next.id)).toBe(after)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => cardTransform(page, next.id)).toBe(before)
  await expect.poll(async () => (await storedLayer(page))?.positions[spot.id]).toBeDefined()
})
