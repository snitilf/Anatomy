import { expect, test, type Page } from '@playwright/test'
import { everyState, NOTE_STATES, RELINK_TEXT, seedFolder } from './states.ts'

async function openStates(page: Page) {
  const { text, layer } = await everyState()
  await seedFolder(page, text, layer)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await page.waitForTimeout(400)
}

const glyphOf = (scope: import('@playwright/test').Locator) => scope.locator('svg[data-state]').first()

test('an item shows the same glyph on the map, in the sidebar, in Send, and on the Overview', async ({ page }) => {
  await openStates(page)
  const sidebar = page.getByRole('complementary')
  const showAll = sidebar.getByRole('button', { name: /^Show all/ })
  if (await showAll.count()) await showAll.click()

  // Not sent: the part's badge on the map, the Yours row, and a row in Send.
  const badge = page.locator('.react-flow__node-card[data-id="web-form"]').getByRole('img', { name: /from you/ })
  await expect(glyphOf(badge)).toHaveAttribute('data-state', 'unsent')
  await expect(glyphOf(sidebar.getByRole('button', { name: /Note that has not been sent/ }))).toHaveAttribute('data-state', 'unsent')
  await page.getByRole('banner').getByRole('button', { name: /^Send to agent/ }).click()
  const popover = page.getByRole('dialog', { name: 'Send to agent' })
  await expect(glyphOf(popover.getByRole('listitem').filter({ hasText: /^Notes/ }))).toHaveAttribute('data-state', 'unsent')
  await page.keyboard.press('Escape')

  // The Overview: the line in Needs you and the part's row.
  await page.getByRole('tab', { name: 'Overview' }).click()
  const overview = page.getByTestId('overview')
  await expect(glyphOf(overview.getByRole('button', { name: /^Web form/ }))).toHaveAttribute('data-state', 'unsent')
  await expect(glyphOf(overview.getByRole('listitem').filter({ hasText: /not sent/ }))).toHaveAttribute('data-state', 'unsent')
})

for (const { part, state, text } of NOTE_STATES) {
  test(`a note that is ${state} has one glyph on its part's badge, its sidebar row, and its Overview row`, async ({ page }) => {
    await openStates(page)
    const sidebar = page.getByRole('complementary')
    const showAll = sidebar.getByRole('button', { name: /^Show all/ })
    if (await showAll.count()) await showAll.click()
    const badge = page.locator(`.react-flow__node-card[data-id="${part}"]`).getByRole('img', { name: /from you/ })
    await expect(glyphOf(badge)).toHaveAttribute('data-state', state)
    await expect(glyphOf(sidebar.getByRole('button', { name: new RegExp(text) }))).toHaveAttribute('data-state', state)
    await page.getByRole('tab', { name: 'Overview' }).click()
    const label = page.getByTestId('overview').locator(`[data-row="part:${part}"]`)
    await expect(glyphOf(label)).toHaveAttribute('data-state', state)
  })
}

test('a note whose part was removed, and a broken link, show the relink glyph in the sidebar and on the Overview', async ({ page }) => {
  await openStates(page)
  const sidebar = page.getByRole('complementary')
  const showAll = sidebar.getByRole('button', { name: /^Show all/ })
  if (await showAll.count()) await showAll.click()
  await expect(glyphOf(sidebar.getByRole('button', { name: new RegExp(RELINK_TEXT) }))).toHaveAttribute('data-state', 'relinking')
  await expect(glyphOf(sidebar.getByRole('button', { name: /Broken link/ }))).toHaveAttribute('data-state', 'relinking')
  await page.getByRole('tab', { name: 'Overview' }).click()
  const needs = page.getByTestId('overview').getByRole('region', { name: 'Needs you' }).or(page.getByTestId('overview').locator('[data-section="needs"]'))
  await expect(needs.locator('svg[data-state="relinking"]')).toHaveCount(1)
  await expect(needs.locator('svg[data-state="outdated"]')).toHaveCount(1)
  await expect(needs.locator('svg[data-state="answered"]')).toHaveCount(1)
})
