import { expect, test } from '@playwright/test'
import { open, pickConnection, pickPart } from './helpers.ts'

const REFUND = 'src/examples/refund-approval.board.json'
const SIXTY = 'e2e/fixtures/sixty-parts.board.json'

const menu = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Command menu' })

test('with a part selected the menu opens with its actions, under its name', async ({ page }) => {
  await open(page, REFUND)
  await pickPart(page, 'policy-check')
  await page.keyboard.press('ControlOrMeta+k')
  const first = menu(page).locator('[cmdk-group]').first()
  await expect(first.locator('[cmdk-group-heading]')).toHaveText('Policy check')
  const names = await first.getByRole('option').allTextContents()
  const order = [/^Add note/, /^Add link/, /^Zoom to/, /^Show on Overview/, /^Copy name/]
  order.forEach((pattern, i) => expect(names[i]).toMatch(pattern))
  await expect(first.getByRole('option', { name: /^Go to target/ })).toBeVisible()
  // The first row is the one Enter runs.
  await expect(menu(page).getByRole('option').first()).toHaveAttribute('data-selected', 'true')
  // A command is listed once: not again under Selection or View.
  await expect(menu(page).getByRole('option', { name: /^Add note/ })).toHaveCount(1)
  await expect(menu(page).getByRole('option', { name: /^Zoom to selection/ })).toHaveCount(0)
})

test('with nothing selected the menu has no group named for a selection', async ({ page }) => {
  await open(page, REFUND)
  await page.keyboard.press('ControlOrMeta+k')
  await expect(menu(page).locator('[cmdk-group-heading]').first()).toHaveText('Board')
  await expect(menu(page).locator('[data-selection]')).toHaveCount(0)
})

test('a line has no Add link, and its name heads the group', async ({ page }) => {
  await open(page, REFUND)
  await pickConnection(page, 'proposes an action')
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="location"]')).toHaveText('proposes an action')
  await page.keyboard.press('ControlOrMeta+k')
  const first = menu(page).locator('[cmdk-group]').first()
  await expect(first.locator('[cmdk-group-heading]')).toHaveText('proposes an action')
  await expect(first.getByRole('option', { name: /^Add note/ })).toBeVisible()
  await expect(first.getByRole('option', { name: /^Add link/ })).toHaveCount(0)
})

test('Add note from the menu puts the cursor in the note field of the part', async ({ page }) => {
  await open(page, REFUND)
  await pickPart(page, 'policy-check')
  await page.keyboard.press('ControlOrMeta+k')
  await menu(page).getByRole('option', { name: /^Add note/ }).click()
  await expect(page.getByTestId('inspector').getByRole('textbox').first()).toBeFocused()
})

test('Zoom to frames the selection', async ({ page }) => {
  await open(page, SIXTY)
  await pickPart(page, 'c-2')
  await page.keyboard.press('Shift+1')
  await page.waitForTimeout(400)
  const before = await page.evaluate(() => document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform)
  await page.keyboard.press('ControlOrMeta+k')
  await menu(page).getByRole('option', { name: /^Zoom to/ }).first().click()
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform)).not.toBe(before)
})

test('Show on Overview opens the page at the part', async ({ page }) => {
  await open(page, SIXTY)
  await pickPart(page, 'c-2')
  await page.keyboard.press('ControlOrMeta+k')
  await menu(page).getByRole('option', { name: /^Show on Overview/ }).click()
  await expect(page.getByTestId('overview')).toBeVisible()
  await expect(page.getByTestId('overview').locator('[data-row="part:c-2"]')).toBeFocused()
  // And it sits in the middle of the page, not at its edge.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const row = document.querySelector('[data-testid="overview"] [data-row="part:c-2"]')!.getBoundingClientRect()
        const page = document.querySelector('[data-testid="overview"]')!.getBoundingClientRect()
        return Math.abs(row.top + row.height / 2 - (page.top + page.height / 2))
      }),
    )
    .toBeLessThan(80)
})

test('Copy name says it copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await open(page, REFUND)
  await pickPart(page, 'policy-check')
  await page.keyboard.press('ControlOrMeta+k')
  await menu(page).getByRole('option', { name: /^Copy name/ }).click()
  await expect(page.getByText('Name copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Policy check')
})

test('a walk command from the menu moves the selection', async ({ page }) => {
  await open(page, REFUND)
  await pickPart(page, 'policy-check')
  await page.keyboard.press('ControlOrMeta+k')
  await menu(page).getByRole('option', { name: /^Go to target/ }).click()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="location"]')).toHaveText('Payout preview')
})
