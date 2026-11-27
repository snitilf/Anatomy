import { readFile } from 'node:fs/promises'
import { expect, test } from './test.ts'
import { open, pickConnection, pickPart, viewport } from './helpers.ts'

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const SIXTY = 'e2e/fixtures/sixty-parts.board.json'

const crumb = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Breadcrumb' })

test('the crumb follows the selection: board, group, part', async ({ page }) => {
  await open(page, REFUND)
  await expect(crumb(page).getByText(/Refund approval/)).toBeVisible()
  // The 13 px crumb is not the page h1.
  await expect(crumb(page).getByRole('heading')).toHaveCount(0)
  await expect(crumb(page).locator('[aria-current="location"]')).toHaveCount(0)
  await pickPart(page, 'policy-check')
  const here = crumb(page).locator('[aria-current="location"]')
  await expect(here).toHaveText('Policy check')
  await expect(crumb(page).getByRole('button', { name: 'Refund logic' })).toBeVisible()
  await expect(crumb(page).getByRole('button', { name: /Refund approval/ })).toBeVisible()
  // Both the breadcrumb and the sidebar header offer a way back to the board.
  await expect(page.getByTestId('inspector').getByRole('button', { name: 'Board' })).toBeVisible()
})

test('a connection has no group segment, and a link is named by its label', async ({ page }) => {
  await open(page, REFUND)
  await pickConnection(page, 'proposes a payout')
  await expect(crumb(page).locator('[aria-current="location"]')).toHaveText('proposes a payout')
  await expect(crumb(page).getByRole('button')).toHaveCount(3)
})

test('the board segment clears the selection, and Escape still does', async ({ page }) => {
  await open(page, REFUND)
  await pickPart(page, 'policy-check')
  await crumb(page).getByRole('button', { name: /Refund approval/ }).focus()
  await page.keyboard.press('Enter')
  await expect(crumb(page).locator('[aria-current="location"]')).toHaveCount(0)
  // Focus is not lost with the button: it returns to the card that was selected.
  await expect(page.locator('.react-flow__node-card[data-id="policy-check"]')).toBeFocused()
  await expect(page.getByTestId('inspector').getByRole('heading', { level: 2, name: /Refund approval/ })).toBeVisible()
  await pickPart(page, 'policy-check')
  await page.locator('.react-flow__node-card[data-id="policy-check"]').focus()
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
  await open(page, REFUND)
  await pickPart(page, 'policy-check')
  await crumb(page).getByRole('button', { name: /Refund approval/ }).hover()
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

test('a two-letter folder name leaves no hole before the slash', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const text = await readFile(REFUND, 'utf8')
  const gapFor = async (name: string) => {
    await page.addInitScript(
      ([folderName, boardText]) => {
        localStorage.setItem(
          'anatomy:test-folder',
          JSON.stringify({ name: folderName, files: { 'board.json': { text: boardText, lastModified: 1 } }, remembered: false }),
        )
      },
      [name, text] as const,
    )
    await page.goto('/')
    await page.getByRole('button', { name: 'Open folder' }).click()
    await expect(crumb(page).getByRole('button', { name })).toBeVisible()
    // Measure from the chevron's right edge inside the crumb to the slash's left edge, and also the crumb box to the slash.
    return crumb(page).evaluate((nav) => {
      const btn = nav.querySelector('button')!
      const chevron = btn.querySelector('svg:last-of-type')!
      const slash = nav.querySelector(':scope > [aria-hidden="true"]')!
      const btnBox = btn.getBoundingClientRect()
      const chevBox = chevron.getBoundingClientRect()
      const slashBox = slash.getBoundingClientRect()
      return {
        buttonToSlash: Math.round(slashBox.left - btnBox.right),
        chevronToSlash: Math.round(slashBox.left - chevBox.right),
      }
    })
  }
  const shortGap = await gapFor('ab')
  const longGap = await gapFor('repository-name')
  expect(Math.abs(shortGap.buttonToSlash - longGap.buttonToSlash)).toBeLessThanOrEqual(1)
  expect(Math.abs(shortGap.chevronToSlash - longGap.chevronToSlash)).toBeLessThanOrEqual(1)
})
