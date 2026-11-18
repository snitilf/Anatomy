import { expect, test } from '@playwright/test'
import { open } from './helpers.ts'

const SHORTENER = 'src/examples/external/url-shortener.board.json'

const tab = (page: import('@playwright/test').Page, name: 'Map' | 'Overview') => page.getByRole('tab', { name })

test('a board opens on the map, and the tabs switch the view and the address', async ({ page }) => {
  await open(page, SHORTENER)
  await expect(tab(page, 'Map')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await tab(page, 'Overview').click()
  await expect(page.getByTestId('overview')).toBeVisible()
  expect(new URL(page.url()).hash).toBe('#overview')
  // The sidebar toggle is gone on the Overview.
  await expect(page.getByRole('button', { name: /sidebar/i })).toHaveCount(0)
  await tab(page, 'Map').click()
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hide sidebar' })).toBeVisible()
})

test('G then O and G then M switch the view', async ({ page }) => {
  await open(page, SHORTENER)
  await page.keyboard.press('g')
  await page.keyboard.press('o')
  await expect(page.getByTestId('overview')).toBeVisible()
  // O alone is not the Ellipse tool on this page, and the map did not change tool.
  await page.keyboard.press('g')
  await page.keyboard.press('m')
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
})

test('the browser back button returns to the map and forward to the Overview', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  await expect(page.getByTestId('overview')).toBeVisible()
  await page.goBack()
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await page.goForward()
  await expect(page.getByTestId('overview')).toBeVisible()
})

test('the command menu goes to the Overview and back to the map', async ({ page }) => {
  await open(page, SHORTENER)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('option', { name: /^Go to Overview/ }).click()
  await expect(page.getByTestId('overview')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('option', { name: /^Go to Map/ }).click()
  await expect(page.getByTestId('overview')).toHaveCount(0)
})

test('the last view is remembered per board', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  await page.reload()
  await page.getByLabel('Board file').setInputFiles(SHORTENER)
  await expect(page.getByTestId('overview')).toBeVisible()
})

test('a part row opens the map with that part selected and the sidebar on it', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  const overview = page.getByTestId('overview')
  await overview.getByRole('button', { name: /^Redirect handler/ }).click()
  await expect(overview).toHaveCount(0)
  await expect(tab(page, 'Map')).toHaveAttribute('aria-selected', 'true')
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
  await expect(sidebar.getByRole('heading', { name: 'Redirect handler', level: 2 })).toBeVisible()
  await expect(page.locator('.react-flow__node-card[data-id="redirect-handler"]')).toHaveClass(/selected/)
  // The map is framed on the part: its card is on screen.
  const box = await page.locator('.react-flow__node-card[data-id="redirect-handler"]').boundingBox()
  const map = (await page.locator('.react-flow').boundingBox())!
  expect(box!.x).toBeGreaterThan(map.x)
  expect(box!.x + box!.width).toBeLessThan(map.x + map.width)
})

test('back at the Overview, the scroll position returns and the row you left from has focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 })
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  const overview = page.getByTestId('overview')
  const row = overview.getByRole('button', { name: /^Domain and routing/ })
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(overview).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.keyboard.press('g')
  await page.keyboard.press('o')
  await expect(overview).toBeVisible()
  await expect(overview.getByRole('button', { name: /^Domain and routing/ })).toBeFocused()
  expect(await overview.evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
  // The browser back button restores it too.
  await overview.getByRole('button', { name: /^Web form/ }).click()
  await page.goBack()
  await expect(overview).toBeVisible()
  await expect(overview.getByRole('button', { name: /^Web form/ })).toBeFocused()
})

test('the filter narrows the parts, / focuses it, and J and K move between rows', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  const overview = page.getByTestId('overview')
  const filter = overview.getByRole('searchbox', { name: 'Filter parts' })
  await page.keyboard.press('/')
  await expect(filter).toBeFocused()
  await filter.fill('cache')
  await expect(overview.getByRole('button', { name: /^Cache/ })).toBeVisible()
  await expect(overview.getByRole('button', { name: /^Web form/ })).toHaveCount(0)
  await filter.fill('nothing like this')
  await expect(overview.getByText('No parts match')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(filter).toHaveValue('')
  await page.keyboard.press('Escape')
  const first = overview.getByRole('button', { name: /^Web form/ })
  await first.focus()
  await page.keyboard.press('j')
  await expect(overview.getByRole('button', { name: /^Visitor browser/ })).toBeFocused()
  await page.keyboard.press('k')
  await expect(first).toBeFocused()
})

test('C on a focused row opens the note field for that part on the map', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  await page.getByTestId('overview').getByRole('button', { name: /^Link store/ }).focus()
  await page.keyboard.press('c')
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('heading', { name: 'Link store', level: 2 })).toBeVisible()
  await expect(page.locator('[data-composer]')).toBeFocused()
})

test('a group header collapses its rows, and a walkthrough row starts it on the map', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  const overview = page.getByTestId('overview')
  await overview.getByRole('button', { name: /^Frontend/ }).click()
  await expect(overview.getByRole('button', { name: /^Web form/ })).toHaveCount(0)
  await overview.getByRole('button', { name: 'Play Create a short link' }).click()
  await expect(overview).toHaveCount(0)
  await expect(page.getByRole('button', { name: /close/i }).first()).toBeVisible()
})
