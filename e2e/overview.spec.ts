import { readFile, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { open, viewport } from './helpers.ts'

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
  await overview.locator('[data-head="frontend"]').click()
  await expect(overview.getByRole('button', { name: /^Web form/ })).toHaveCount(0)
  await overview.getByRole('button', { name: 'Play Create a short link' }).click()
  await expect(overview).toHaveCount(0)
  await expect(page.getByRole('button', { name: /close/i }).first()).toBeVisible()
})

test('Between groups lists each pair, opens to its connections, and a connection opens on the map', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  const overview = page.getByTestId('overview')
  const pair = overview.getByRole('button', { name: /^Frontend and Backend/ })
  await expect(pair).toHaveAttribute('aria-expanded', 'false')
  await pair.click()
  await expect(pair).toHaveAttribute('aria-expanded', 'true')
  const connection = overview.locator('[data-row^="conn:"]').first()
  const label = (await connection.locator('span').first().textContent())!
  await connection.click()
  await expect(overview).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('heading', { name: label, level: 2 })).toBeVisible()
})

test('undo and redo are the first controls of the zoom surface, not the top bar', async ({ page }) => {
  await open(page, SHORTENER)
  await expect(page.getByRole('banner').getByRole('button', { name: 'Undo' })).toHaveCount(0)
  const zoom = page.getByRole('toolbar', { name: 'Zoom' })
  const undo = zoom.getByRole('button', { name: 'Undo' })
  const redo = zoom.getByRole('button', { name: 'Redo' })
  const out = zoom.getByRole('button', { name: 'Zoom out' })
  const [u, r, o] = await Promise.all([undo.boundingBox(), redo.boundingBox(), out.boundingBox()])
  expect(u!.x).toBeLessThan(r!.x)
  expect(r!.x).toBeLessThan(o!.x)
  await expect(undo).toBeDisabled()
  await expect(redo).toBeDisabled()
  await page.locator('.react-flow__node-card').first().click()
  const composer = page.locator('[data-composer]')
  await composer.fill('A note to undo')
  await composer.press('ControlOrMeta+Enter')
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()
  await redo.click()
  await expect(redo).toBeDisabled()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('the tabs take the top bar and undo and redo stay in the zoom surface', async ({ page }) => {
    await open(page, SHORTENER)
    await expect(tab(page, 'Map')).toBeVisible()
    const zoom = page.getByRole('toolbar', { name: 'Zoom' })
    await expect(zoom.getByRole('button', { name: 'Undo' })).toBeVisible()
    await expect(zoom.getByRole('button', { name: 'Redo' })).toBeVisible()
    await tab(page, 'Overview').tap()
    await expect(page.getByTestId('overview')).toBeVisible()
    await expect(page.getByTestId('overview').getByRole('button', { name: /^Redirect handler/ })).toBeVisible()
  })
})

test('the Parts count is the number of rows, with the new parts the user proposed', async ({ page }) => {
  await open(page, SHORTENER)
  await page.keyboard.press('n')
  const map = (await page.locator('.react-flow').boundingBox())!
  await page.mouse.click(map.x + map.width - 200, map.y + map.height - 120)
  await page.keyboard.type('Rate limiter')
  await page.keyboard.press('Escape')
  await expect(page.locator('.react-flow__node-proposal')).toContainText('Rate limiter')
  await tab(page, 'Overview').click()
  const overview = page.getByTestId('overview')
  await expect(overview.locator('[data-row^="part:"]')).toHaveCount(9)
  await expect(overview.getByRole('heading', { name: /^Parts 9$/ })).toBeVisible()
  await overview.getByRole('searchbox', { name: 'Filter parts' }).fill('cache')
  await expect(overview.getByRole('heading', { name: /^Parts 1 of 9$/ })).toBeVisible()
})

test('Connections lists the pairs and the inside of each group, and the rows add up to the property', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  const overview = page.getByTestId('overview')
  const total = Number(await overview.getByRole('button', { name: /^\d+$/ }).first().textContent())
  const counts = await overview.locator('[data-row^="between:"] [class*="count"]').allTextContents()
  expect(counts.reduce((n, c) => n + Number(c), 0)).toBe(total)
  await expect(overview.getByRole('button', { name: /^Inside Backend/ })).toBeVisible()
  await overview.getByRole('button', { name: /^Inside Backend/ }).click()
  await expect(overview.locator('[data-row^="conn:"]').first()).toBeVisible()
}) 

test('undo does nothing on the Overview, and the sidebar no longer holds the scope', async ({ page }) => {
  await open(page, SHORTENER)
  await page.locator('.react-flow__node-card').first().click()
  const composer = page.locator('[data-composer]')
  await composer.fill('Stays after a hidden undo')
  await composer.press('ControlOrMeta+Enter')
  await tab(page, 'Overview').click()
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('option', { name: /^Undo/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('overview').getByRole('heading', { name: 'Scope' })).toBeVisible()
  await tab(page, 'Map').click()
  await expect(page.getByRole('toolbar', { name: 'Zoom' }).getByRole('button', { name: 'Undo' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByText('Covers')).toHaveCount(0)
})

test('after G the next key is taken: G then R keeps Select, G G O still goes to the Overview, and G then M on the map does nothing', async ({ page }) => {
  await open(page, SHORTENER)
  await page.keyboard.press('g')
  await page.keyboard.press('r')
  await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('g')
  await page.keyboard.press('m')
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await page.keyboard.press('o')
  await expect(page.getByTestId('overview')).toBeVisible()
})

test('the map shows the same view when the Overview is left, even after the window changed size', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, SHORTENER)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  let before = ''
  await expect
    .poll(async () => {
      const now = await viewport(page)
      const same = now === before
      before = now
      return same
    }, { intervals: [150] })
    .toBe(true)
  await tab(page, 'Overview').click()
  await tab(page, 'Map').click()
  await expect.poll(() => viewport(page)).toBe(before)
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
})

test('Back and Forward never carry the view of one board onto another', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  await tab(page, 'Map').click()
  await page.getByLabel('Board file').setInputFiles('src/examples/nordet.board.json')
  await expect(page.getByRole('heading', { name: /Nordet/, level: 2 })).toBeVisible()
  await page.goBack()
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await expect(tab(page, 'Map')).toHaveAttribute('aria-selected', 'true')
  expect(new URL(page.url()).hash).toBe('')
})

test('after J moves down the list, Shift+Tab leaves from the row that has focus', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  const overview = page.getByTestId('overview')
  await overview.locator('[data-row="part:web-form"]').focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('j')
  const here = await page.evaluate(() => document.activeElement?.getAttribute('data-row'))
  expect(here).not.toBe('part:web-form')
  await expect(overview.locator(`[data-row="${here}"]`)).toHaveAttribute('tabindex', '0')
  await expect(overview.locator('[data-row="part:web-form"]')).toHaveAttribute('tabindex', '-1')
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('[data-head]').first()).not.toBeFocused()
  const after = await page.evaluate(() => document.activeElement?.getAttribute('data-row') ?? document.activeElement?.getAttribute('data-head'))
  expect(after).not.toBe('part:web-form')
})

test('the revision toast shows on the map, goes when the Overview opens, and stays away while it is in front', async ({ page }, testInfo) => {
  const board = JSON.parse(await readFile(SHORTENER, 'utf8')) as { revision: number; components: { summary: string }[] }
  const revise = async (revision: number) => {
    const next = structuredClone(board)
    next.revision = revision
    next.components[0]!.summary = `Changed in revision ${revision}`
    const path = testInfo.outputPath(`revision-${revision}.board.json`)
    await writeFile(path, JSON.stringify(next))
    await page.getByLabel('Board file').setInputFiles(path)
  }
  await open(page, SHORTENER)
  await revise(2)
  const toast = page.getByText('Revision 2 is open')
  await expect(toast).toBeVisible()
  await tab(page, 'Overview').click()
  await expect(toast).toBeHidden()
  await expect(page.getByTestId('overview').getByRole('button', { name: /changed in revision 2/ })).toBeVisible()
  await revise(3)
  await page.waitForTimeout(500)
  await expect(page.getByText('Revision 3 is open')).toHaveCount(0)
})
