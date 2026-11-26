import { readFile, writeFile } from 'node:fs/promises'
import { expect, test } from './test.ts'
import { open, viewport } from './helpers.ts'
import { everyState, seedFolder } from './states.ts'

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const WORST = 'e2e/fixtures/worst-text.board.json'
const EXAMPLES = [
  { name: 'Claude Code', file: 'src/examples/claude-code-harness.board.json' },
  { name: 'Anatomy', file: 'src/examples/anatomy.board.json' },
  { name: 'How an LLM works', file: 'src/examples/how-an-llm-works.board.json' },
] as const

async function openStates(page: import('@playwright/test').Page) {
  const { text, layer } = await everyState()
  await seedFolder(page, text, layer)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('[data-detail]')).toBeAttached()
}

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
  const total = Number.parseInt((await overview.locator('header').getByRole('button', { name: /^\d+ connections?$/ }).textContent()) ?? '0', 10)
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
  await page.getByLabel('Board file').setInputFiles('e2e/fixtures/refund-approval.board.json')
  await expect(page.getByRole('heading', { name: /Refund approval/, level: 2 })).toBeVisible()
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

test('a walkthrough step in the far view names the tiles it highlights', async ({ page }, testInfo) => {
  const board = JSON.parse(await readFile('e2e/fixtures/sixty-parts.board.json', 'utf8')) as { components: { id: string }[]; scenarios: unknown[] }
  const ids = board.components.slice(0, 4).map((c) => c.id)
  board.scenarios = [{ id: 'far-tour', title: 'A tour', steps: [{ caption: 'These four.', highlight: ids }] }]
  const path = testInfo.outputPath('sixty-with-tour.board.json')
  await writeFile(path, JSON.stringify(board))
  await open(page, path)
  await page.getByRole('tab', { name: 'Overview' }).click()
  await page.getByRole('button', { name: 'Play A tour' }).click()
  await expect(page.getByRole('region', { name: 'Walkthrough: A tour' })).toBeVisible()
  await expect(page.locator('[data-far]')).toBeVisible()
  const tip = page.locator(`.react-flow__node[data-id="${ids[0]}"] [class*="tip"]`)
  await expect(tip).toBeVisible()
  await expect(page.locator(`.react-flow__node[data-id="${board.components[10]!.id}"] [class*="tip"]`)).toBeHidden()
  // Every name stays inside the map, including the tile at its left edge.
  await page.waitForTimeout(900)
  const map = (await page.locator('.react-flow').boundingBox())!
  for (const id of ids) {
    const box = (await page.locator(`.react-flow__node[data-id="${id}"] [class*="tip"]`).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(map.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(map.x + map.width + 1)
    expect(box.y).toBeGreaterThanOrEqual(map.y - 1)
  }
})

test('a part opened from the Overview is spotlit: the lines that do not touch it step back', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  await page.getByTestId('overview').locator('[data-row="part:redirect-handler"]').click()
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('.react-flow__edge g[data-faded]').length)).toBeGreaterThan(0)
})

for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
  test(`the walkthrough bar never covers the zoom surface or the tool dock at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await open(page, REFUND)
    await page.keyboard.press('ControlOrMeta+k')
    const menu = page.getByRole('dialog', { name: 'Command menu' })
    await menu.getByRole('combobox').fill('Play')
    await menu.getByRole('option', { name: /^Play/ }).first().click()
    const bar = page.getByRole('region', { name: /^Walkthrough: / })
    await expect(bar).toBeVisible()
    await page.waitForTimeout(400)
    const box = async (locator: import('@playwright/test').Locator) => ((await locator.count()) > 0 && (await locator.first().isVisible()) ? await locator.first().boundingBox() : null)
    const mine = (await bar.boundingBox())!
    const others = [await box(page.getByRole('toolbar', { name: 'Zoom' })), await box(page.getByRole('toolbar', { name: 'Whiteboard tools' }))]
    for (const other of others) {
      if (!other) continue
      const apart = mine.x + mine.width <= other.x || other.x + other.width <= mine.x || mine.y + mine.height <= other.y || other.y + other.height <= mine.y
      expect(apart).toBe(true)
    }
  })
}

test('Connections shows the busiest 8 rows, folds the rest behind Show more, and counts still add up', async ({ page }) => {
  await open(page, 'e2e/fixtures/sixty-parts.board.json')
  await tab(page, 'Overview').click()
  const overview = page.getByTestId('overview')
  const pairs = overview.locator('[data-row^="between:"]:not([data-row="between:more"]):not([data-row^="between:inside:"])')
  await expect(pairs).toHaveCount(8)
  const more = overview.getByRole('button', { name: /^Show \d+ more$/ })
  await more.focus()
  await page.keyboard.press('Enter')
  expect(await pairs.count()).toBeGreaterThan(8)
  await expect(overview.getByRole('button', { name: 'Show fewer' })).toBeFocused()
  const total = Number.parseInt((await overview.locator('header').getByRole('button', { name: /^\d+ connections?$/ }).textContent()) ?? '0', 10)
  const counts = await overview.locator('[data-row^="between:"] [class*="count"]').allTextContents()
  expect(counts.reduce((n, c) => n + Number(c), 0)).toBe(total)
})

test.describe('first open on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('a board whose whole is in the far view opens on the Overview, one that is not opens on the Map', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Board file').setInputFiles('e2e/fixtures/sixty-parts.board.json')
    await expect(page.getByTestId('overview')).toBeVisible()
    await expect(tab(page, 'Overview')).toHaveAttribute('aria-selected', 'true')
    // The Map tab still shows the far view.
    await tab(page, 'Map').click()
    await expect(page.getByTestId('overview')).toHaveCount(0)
    await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  })

  test('a board that reads whole on the map opens on the Map', async ({ page }) => {
    await open(page, REFUND)
    await expect(tab(page, 'Map')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('overview')).toHaveCount(0)
  })
})

test('a pair row shows the way its connections run', async ({ page }) => {
  await open(page, 'e2e/fixtures/sixty-parts.board.json')
  await tab(page, 'Overview').click()
  const pairs = page.getByTestId('overview').locator('[data-row^="between:"]:not([data-row="between:more"]):not([data-row^="between:inside:"])')
  const n = await pairs.count()
  expect(n).toBeGreaterThan(2)
  let one = 0
  for (let i = 0; i < n; i++) {
    const pair = pairs.nth(i)
    const label = (await pair.getAttribute('aria-label')) ?? ''
    const both = (await pair.locator('.lucide-arrow-left-right').count()) === 1
    expect(both).toBe(label.includes(' and '))
    if (!both) {
      one++
      await expect(pair.locator('.lucide-arrow-right, .lucide-arrow-left')).toHaveCount(1)
      expect(label).toMatch(/ to /)
    }
  }
  expect(one).toBeGreaterThan(0)
})

test.describe('the Overview page order', () => {
  test('at 1440x900 the page has two columns with Scope and Details in the rail to the right of main', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SHORTENER)
    await tab(page, 'Overview').click()
    const overview = page.getByTestId('overview')
    await expect(overview.getByRole('heading', { level: 1 })).toBeVisible()
    const main = overview.locator('[data-section="parts"]')
    const scope = overview.locator('[data-section="scope"]')
    const details = overview.locator('[data-section="details"]')
    const [mainBox, scopeBox, detailsBox] = await Promise.all([main.boundingBox(), scope.boundingBox(), details.boundingBox()])
    expect(scopeBox!.x).toBeGreaterThan(mainBox!.x + mainBox!.width)
    expect(detailsBox!.x).toBeGreaterThan(mainBox!.x + mainBox!.width)
    expect(scopeBox!.y).toBeLessThan(detailsBox!.y)
  })

  for (const [width, height] of [
    [1024, 768],
    [390, 844],
  ] as const) {
    test(`at ${width}x${height} the page has one column in 8.5 order`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openStates(page)
      if ((await page.getByTestId('overview').count()) === 0) await tab(page, 'Overview').click()
      const overview = page.getByTestId('overview')
      const top = async (sel: string) => (await overview.locator(sel).boundingBox())!.y
      const head = await top('header')
      const needs = await top('[data-section="needs"]')
      const start = await top('[data-section="start"]')
      const scope = await top('[data-section="scope"]')
      const parts = await top('[data-section="parts"]')
      const between = await top('[data-section="between"]')
      const questions = await top('[data-section="questions"]')
      const details = await top('[data-section="details"]')
      expect(head).toBeLessThan(needs)
      expect(needs).toBeLessThan(start)
      expect(start).toBeLessThan(scope)
      expect(scope).toBeLessThan(parts)
      expect(parts).toBeLessThan(between)
      expect(between).toBeLessThan(questions)
      expect(questions).toBeLessThan(details)
      const [partsBox, scopeBox] = await Promise.all([overview.locator('[data-section="parts"]').boundingBox(), overview.locator('[data-section="scope"]').boundingBox()])
      expect(Math.abs(scopeBox!.x - partsBox!.x)).toBeLessThanOrEqual(2)
    })
  }

  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844],
  ] as const) {
    test(`at ${width}x${height} the first walkthrough row fits in the first screen on all examples`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      for (const ex of EXAMPLES) {
        await open(page, ex.file)
        if ((await page.getByTestId('overview').count()) === 0) await tab(page, 'Overview').click()
        const overview = page.getByTestId('overview')
        const firstPlay = overview.getByRole('button', { name: /^Play / }).first()
        await expect(firstPlay, `${ex.name} at ${width}x${height}`).toBeVisible()
        const box = (await firstPlay.boundingBox())!
        expect(box.y + box.height, `${ex.name} first walkthrough fits in ${height}px`).toBeLessThanOrEqual(height)
      }
    })

    test(`at ${width}x${height} the first walkthrough row fits in the first screen on every-state with Needs you above it`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openStates(page)
      if ((await page.getByTestId('overview').count()) === 0) await tab(page, 'Overview').click()
      const overview = page.getByTestId('overview')
      const needs = (await overview.getByRole('heading', { name: 'Needs you' }).boundingBox())!
      const firstPlay = overview.getByRole('button', { name: /^Play / }).first()
      const playBox = (await firstPlay.boundingBox())!
      expect(needs.y).toBeLessThan(playBox.y)
      expect(playBox.y + playBox.height, `every-state first walkthrough fits in ${height}px`).toBeLessThanOrEqual(height)
    })
  }

  test('on worst-text at 1440x900 Start here starts within the first 900 px and nothing overflows horizontally', async ({ page }) => {
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height })
      await open(page, WORST)
      if ((await page.getByTestId('overview').count()) === 0) await tab(page, 'Overview').click()
      const overview = page.getByTestId('overview')
      if (width === 1440) {
        const startBox = (await overview.getByRole('heading', { name: 'Start here' }).boundingBox())!
        expect(startBox.y).toBeLessThan(900)
      }
      const overflow = await overview.evaluate((el) => el.scrollWidth - el.clientWidth)
      expect(overflow, `worst-text horizontal overflow at ${width}px`).toBeLessThanOrEqual(1)
    }
  })

  test('goal width is at most 72 characters of its font and unclamped on Claude Code', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, EXAMPLES[0].file)
    await tab(page, 'Overview').click()
    const overview = page.getByTestId('overview')
    await expect(overview.locator('header').getByRole('button', { name: 'Show more' })).toHaveCount(0)
    const chars = await overview.locator('header p').evaluate((el) => {
      const style = getComputedStyle(el)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const zeroWidth = ctx.measureText('0').width
      return el.getBoundingClientRect().width / zeroWidth
    })
    expect(chars).toBeLessThanOrEqual(72)
  })

  test('Parts header row aligns Lesson, Open, and Yours within 1 px, Agent loop summary shows >= 60 chars, and part names align with group labels', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, EXAMPLES[0].file)
    await tab(page, 'Overview').click()
    const overview = page.getByTestId('overview')
    const header = overview.locator('[data-parts-header]')
    await expect(header.getByText('Lesson', { exact: true })).toBeVisible()
    await expect(header.getByText('Open', { exact: true })).toBeVisible()
    await expect(header.getByText('Yours', { exact: true })).toBeVisible()

    // Check Lesson right edge alignment on Permission check (which has a lesson).
    const lessonHeader = (await header.getByText('Lesson', { exact: true }).boundingBox())!
    const permRow = overview.locator('[data-row="part:permission-check"]')
    const lessonSlot = (await permRow.locator('[data-slot="lesson"]').boundingBox())!
    expect(Math.abs(lessonHeader.x + lessonHeader.width - (lessonSlot.x + lessonSlot.width))).toBeLessThanOrEqual(1)

    // Check Open right edge alignment on a row with an open item.
    const openHeader = (await header.getByText('Open', { exact: true }).boundingBox())!
    const openSlot = (await overview.locator('[data-row^="part:"] [data-slot="open"]:not(:empty)').first().boundingBox())!
    expect(Math.abs(openHeader.x + openHeader.width - (openSlot.x + openSlot.width))).toBeLessThanOrEqual(1)

    // Check part row name aligns with group label.
    const groupLabel = (await overview.locator('[data-head]').first().locator('span').first().boundingBox())!
    const partTitle = (await overview.locator('[data-row^="part:"]').first().locator('[data-part-title]').boundingBox())!
    expect(Math.abs(partTitle.x - groupLabel.x)).toBeLessThanOrEqual(1)

    // Check Agent loop summary shows at least 60 visible characters at 1440px.
    const visibleChars = await overview.locator('[data-row="part:agent-loop"] [data-part-summary]').evaluate((el) => {
      const text = el.textContent ?? ''
      const style = getComputedStyle(el)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const maxWidth = el.clientWidth
      if (ctx.measureText(text).width <= maxWidth) return text.length
      const ellipsis = ctx.measureText('…').width
      let fit = 0
      for (let i = 1; i <= text.length; i++) {
        if (ctx.measureText(text.slice(0, i)).width + ellipsis <= maxWidth) fit = i
        else break
      }
      return fit
    })
    expect(visibleChars).toBeGreaterThanOrEqual(60)
  })

  test('a clean board has zero raised blocks', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SHORTENER)
    await tab(page, 'Overview').click()
    await expect(page.getByTestId('overview').locator('[data-raised]')).toHaveCount(0)
  })

  test('Yours column aligns with its header on every-state, and Needs you is the one raised block with primary Send to agent', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openStates(page)
    await tab(page, 'Overview').click()
    const overview = page.getByTestId('overview')
    await expect(overview.locator('[data-raised]')).toHaveCount(1)
    await expect(overview.locator('[data-section="needs"] [data-raised]')).toHaveCount(1)

    // Yours header aligns with Yours slot within 1 px.
    const header = overview.locator('[data-parts-header]')
    const yoursHeader = (await header.getByText('Yours', { exact: true }).boundingBox())!
    const yoursSlot = (await overview.locator('[data-row="part:web-form"] [data-slot="notes"]').boundingBox())!
    expect(Math.abs(yoursHeader.x + yoursHeader.width - (yoursSlot.x + yoursSlot.width))).toBeLessThanOrEqual(1)

    // "Send to agent" in Needs you has primary fill (--accent) and opens Send popover.
    const sendBtn = overview.locator('[data-section="needs"]').getByRole('button', { name: 'Send to agent' })
    const [btnBg, accentColor] = await sendBtn.evaluate((el) => {
      const probe = document.createElement('span')
      probe.style.backgroundColor = 'var(--accent)'
      document.body.appendChild(probe)
      const expected = getComputedStyle(probe).backgroundColor
      probe.remove()
      return [getComputedStyle(el).backgroundColor, expected]
    })
    expect(btnBg).toBe(accentColor)
    await sendBtn.click()
    await expect(page.getByRole('dialog', { name: 'Send to agent' })).toBeVisible()
  })

  test('reduced motion skips smooth scrolling when jumping from the meta line', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 600 })
    await open(page, SHORTENER)
    await tab(page, 'Overview').click()
    const overview = page.getByTestId('overview')
    await overview.locator('header').getByRole('button', { name: /^\d+ connections?$/ }).click()
    const scrollTop = await overview.evaluate((el) => el.scrollTop)
    expect(scrollTop).toBeGreaterThan(0)
  })
})
