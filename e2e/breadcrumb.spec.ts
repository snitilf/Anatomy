import { expect, test } from '@playwright/test'
import { open, pickConnection, pickPart, viewport } from './helpers.ts'

const EXAMPLE = 'src/examples/example.board.json'
const SIXTY = 'e2e/fixtures/sixty-parts.board.json'

const crumb = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Breadcrumb' })

test('the crumb follows the selection: board, group, part', async ({ page }) => {
  await open(page, EXAMPLE)
  await expect(crumb(page).getByRole('heading', { name: /Example/ })).toBeVisible()
  await expect(crumb(page).locator('[aria-current="location"]')).toHaveCount(0)
  await pickPart(page, 'rule-check')
  const here = crumb(page).locator('[aria-current="location"]')
  await expect(here).toHaveText('Rule check')
  await expect(crumb(page).getByRole('button', { name: 'Check-in logic' })).toBeVisible()
  await expect(crumb(page).getByRole('button', { name: /Example/ })).toBeVisible()
  // The sidebar has no back row of its own: the board segment is the way back.
  await expect(page.getByTestId('inspector').getByRole('button', { name: 'Board' })).toHaveCount(0)
})

test('a connection has no group segment, and a link is named by its label', async ({ page }) => {
  await open(page, EXAMPLE)
  await pickConnection(page, 'proposes an action')
  await expect(crumb(page).locator('[aria-current="location"]')).toHaveText('proposes an action')
  await expect(crumb(page).getByRole('button')).toHaveCount(3)
})

test('the board segment clears the selection, and Escape still does', async ({ page }) => {
  await open(page, EXAMPLE)
  await pickPart(page, 'rule-check')
  await crumb(page).getByRole('button', { name: /Example/ }).focus()
  await page.keyboard.press('Enter')
  await expect(crumb(page).locator('[aria-current="location"]')).toHaveCount(0)
  // Focus is not lost with the button: it returns to the card that was selected.
  await expect(page.locator('.react-flow__node-card[data-id="rule-check"]')).toBeFocused()
  await expect(page.getByTestId('inspector').getByRole('heading', { level: 2, name: /Example/ })).toBeVisible()
  await pickPart(page, 'rule-check')
  await page.locator('.react-flow__node-card[data-id="rule-check"]').focus()
  await page.keyboard.press('Escape')
  await expect(crumb(page).locator('[aria-current="location"]')).toHaveCount(0)
})

test('the group segment frames the group and keeps the selection', async ({ page }) => {
  await open(page, SIXTY)
  await pickPart(page, 'c-2')
  const part = await crumb(page).locator('[aria-current="location"]').textContent()
  expect(part).toBeTruthy()
  await page.keyboard.press('Shift+1')
  await page.waitForTimeout(400)
  const before = await viewport(page)
  const group = crumb(page).getByRole('button', { name: 'Backend' })
  await group.click()
  await expect.poll(() => viewport(page)).not.toBe(before)
  await expect(crumb(page).locator('[aria-current="location"]')).toHaveText(part!)
})

test('long names shrink the middle segments first and the part stays readable', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await open(page, 'e2e/fixtures/worst-text.board.json')
  const id = await page.locator('.react-flow__node-card').first().getAttribute('data-id')
  await pickPart(page, id!)
  const widths = await crumb(page).evaluate((nav) => {
    const box = nav.getBoundingClientRect()
    const last = nav.querySelector('[aria-current="location"]')!.getBoundingClientRect()
    return { navRight: box.right, lastRight: last.right, lastWidth: last.width, scrolls: nav.scrollWidth > nav.clientWidth + 1 }
  })
  expect(widths.lastRight).toBeLessThanOrEqual(widths.navRight + 1)
  expect(widths.lastWidth).toBeGreaterThanOrEqual(72)
  expect(widths.scrolls).toBe(false)
})

test('the board segment says what it does, and how to do it from the keyboard', async ({ page }) => {
  await open(page, EXAMPLE)
  await pickPart(page, 'rule-check')
  await crumb(page).getByRole('button', { name: /Example/ }).hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('Back to board')
  await expect(tip).toContainText('Esc')
})

test('with too little room the board and the group fold into one menu, and the way back stays', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 })
  await open(page, 'e2e/fixtures/worst-text.board.json')
  await pickPart(page, 'long-words')
  const fold = crumb(page).getByRole('button', { name: 'Board and group' })
  await expect(fold).toBeVisible()
  await fold.click()
  const items = page.getByRole('menuitem')
  await expect(items).toHaveCount(2)
  await items.first().click()
  await expect(crumb(page).locator('[aria-current="location"]')).toHaveCount(0)
})

test('a one-letter part is as wide as its letter, not a padded pill', async ({ page }) => {
  await open(page, 'e2e/fixtures/worst-text.board.json')
  await pickPart(page, 'a')
  const width = await crumb(page).locator('[aria-current="location"]').evaluate((el) => el.getBoundingClientRect().width)
  expect(width).toBeLessThan(48)
})
