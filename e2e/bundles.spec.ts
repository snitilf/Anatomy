/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import { open, viewport } from './helpers.ts'

const SIXTY = 'e2e/fixtures/sixty-parts.board.json'
const FORTY = 'e2e/fixtures/forty-parts.board.json'

const zoomOf = async (page: Page) => Number.parseFloat(/scale\(([\d.]+)\)/.exec(await viewport(page))?.[1] ?? '0')
const farOn = (page: Page) => page.locator('[data-hover-scope][data-far]')
const units = (page: Page) => page.locator('[data-unit]')
const tag = (page: Page) => page.locator('[data-bundle-tip][data-show]')

/** A point on the line of a bundle where the pointer reaches that bundle and nothing else. */
async function onLine(unit: Locator): Promise<{ x: number; y: number }> {
  const at = await unit.locator('path[data-hit]').evaluate((path: SVGPathElement) => {
    const total = path.getTotalLength()
    const m = path.getScreenCTM()!
    const unit = path.closest('[data-unit]')!
    for (const t of [0.25, 0.75, 0.4, 0.6, 0.1, 0.9, 0.5]) {
      const p = path.getPointAtLength(total * t)
      const x = p.x * m.a + m.e
      const y = p.y * m.d + m.f
      if (unit.contains(document.elementFromPoint(x, y))) return { x, y }
    }
    return undefined
  })
  if (!at) throw new Error('no point of this bundle can be reached')
  return at
}

/** The bundles that hold more than one connection, in the order of the page. */
const many = (page: Page) => page.locator('[data-unit]:has(button[aria-label$="Show them."])')
const single = (page: Page) => page.locator('[data-unit]:has(button[aria-label$="Open it."])')

async function pickMany(page: Page) {
  const unit = many(page).first()
  const at = await onLine(unit)
  return { unit, at, label: (await unit.locator('button').getAttribute('aria-label')) ?? '' }
}

test.describe('bundles in the far view', () => {
  test('the pointer on a line lifts it and names it with its direction and count', async ({ page }) => {
    await open(page, SIXTY)
    await expect(farOn(page)).toHaveCount(1)
    expect(await zoomOf(page)).toBeLessThan(0.69)
    const { unit, at } = await pickMany(page)
    const before = await unit.locator('path[data-bundle]').evaluate((p) => Number.parseFloat(getComputedStyle(p).strokeWidth))
    await page.mouse.move(at.x, at.y)
    await expect(tag(page)).toBeVisible()
    await expect(tag(page)).toHaveText(/^.+ (→|←|↔) .+, \d+ connections$/)
    const after = await unit.locator('path[data-bundle]').evaluate((p) => Number.parseFloat(getComputedStyle(p).strokeWidth))
    expect(after).toBeGreaterThan(before)
    // The tag stays inside the map.
    const map = (await page.locator('.react-flow').boundingBox())!
    const box = (await tag(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(map.x)
    expect(box.x + box.width).toBeLessThanOrEqual(map.x + map.width)
    expect(box.y).toBeGreaterThanOrEqual(map.y)
    await page.mouse.move(2, 400)
    await expect(tag(page)).toHaveCount(0)
  })

  test('a click selects the bundle, and the sidebar lists its connections', async ({ page }) => {
    await open(page, SIXTY)
    const { unit, at } = await pickMany(page)
    await page.mouse.click(at.x, at.y)
    await expect(unit).toHaveAttribute('data-on', 'true')
    const panel = page.getByTestId('inspector')
    const heading = panel.getByRole('heading', { level: 2 })
    await expect(heading).toHaveText(/ (→|←|↔) /)
    const count = Number.parseInt((await panel.getByText(/^\d+ connections$/).textContent()) ?? '0', 10)
    expect(count).toBeGreaterThan(1)
    await expect(panel.locator('[data-row^="conn:"]')).toHaveCount(count)
    // The crumb names the pair, and the map stays in the far view with the rest stepped back.
    await expect(page.getByRole('button', { name: await heading.innerText() })).toBeVisible()
    await expect(farOn(page)).toHaveCount(1)
    expect(await page.locator('g[data-active]').count()).toBeGreaterThanOrEqual(count)
    const other = units(page).nth(5)
    expect(await other.locator('path[data-bundle]').evaluate((p) => Number.parseFloat(getComputedStyle(p).opacity))).toBeLessThan(0.3)
  })

  test('a row opens its connection and leaves the far view', async ({ page }) => {
    await open(page, SIXTY)
    const { at } = await pickMany(page)
    await page.mouse.click(at.x, at.y)
    const panel = page.getByTestId('inspector')
    const row = panel.locator('[data-row^="conn:"]').first()
    const label = await row.locator('span').nth(1).innerText()
    await row.click()
    await page.waitForTimeout(700)
    expect(await zoomOf(page)).toBeGreaterThanOrEqual(0.75)
    await expect(farOn(page)).toHaveCount(0)
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText(label)
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1)
  })

  test('hovering a row lights its connection on the map', async ({ page }) => {
    await open(page, SIXTY)
    const { at } = await pickMany(page)
    await page.mouse.click(at.x, at.y)
    const row = page.getByTestId('inspector').locator('[data-row^="conn:"]').nth(1)
    await row.hover()
    const id = (await row.getAttribute('data-row'))!.slice(5)
    await expect(page.locator(`g[data-edge="${id}"]`)).toHaveCSS('opacity', '1')
  })

  test('Escape and a click on the empty map clear the selection', async ({ page }) => {
    await open(page, SIXTY)
    const { unit, at } = await pickMany(page)
    await page.mouse.click(at.x, at.y)
    await expect(unit).toHaveAttribute('data-on', 'true')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(0)
    await page.mouse.click(at.x, at.y)
    await expect(unit).toHaveAttribute('data-on', 'true')
    await page.locator('.react-flow__pane').click({ position: { x: 4, y: 300 } })
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(0)
  })

  test('a drag that starts on a line pans the map and does not pick the bundle', async ({ page }) => {
    await open(page, SIXTY)
    const { at } = await pickMany(page)
    const before = await viewport(page)
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x - 60, at.y + 30, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    expect(await viewport(page)).not.toBe(before)
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(0)
  })

  test('Tab reaches every bundle, after the group names', async ({ page }) => {
    await open(page, SIXTY)
    const total = await units(page).count()
    expect(total).toBeGreaterThan(10)
    await page.getByRole('button', { name: /^Frontend, 15 parts/ }).focus()
    const seen: string[] = []
    let sawBundleBeforeName = false
    let names = 1
    for (let i = 0; i < total + 40 && seen.length < total; i++) {
      await page.keyboard.press('Tab')
      const at = await page.evaluate(() => {
        const el = document.activeElement
        return { label: el?.getAttribute('aria-label') ?? '', inUnit: el?.closest('[data-unit]') !== null }
      })
      if (at.inUnit) seen.push(at.label)
      else if (/Zoom to this group\.$/.test(at.label)) {
        names++
        if (seen.length > 0) sawBundleBeforeName = true
      }
    }
    expect(new Set(seen).size).toBe(total)
    expect(names).toBe(3)
    expect(sawBundleBeforeName).toBe(false)
  })

  test('a focused bundle shows its tag and Enter selects it', async ({ page }) => {
    await open(page, SIXTY)
    await many(page).first().locator('button').focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(tag(page)).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(1)
    await expect(page.getByTestId('inspector').getByRole('heading', { level: 2 })).toHaveText(/ (→|←|↔) /)
  })

  test('a bundle of one connection opens that connection and zooms to it', async ({ page }) => {
    await open(page, SIXTY)
    const unit = single(page).first()
    await expect(unit).toBeAttached()
    const at = await onLine(unit)
    await page.mouse.click(at.x, at.y)
    await page.waitForTimeout(700)
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(0)
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1)
    expect(await zoomOf(page)).toBeGreaterThanOrEqual(0.75)
  })

  test('the command menu zooms to the selected bundle first', async ({ page }) => {
    await open(page, SIXTY)
    const { at } = await pickMany(page)
    await page.mouse.click(at.x, at.y)
    await page.keyboard.press('ControlOrMeta+k')
    const menu = page.getByRole('dialog', { name: 'Command menu' })
    await expect(menu.getByRole('option').first()).toHaveText(/^Zoom to bundle/)
    await menu.getByRole('option').first().click()
    await expect(menu).toBeHidden()
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(1)
  })

  test('works on a second board', async ({ page }) => {
    await open(page, FORTY)
    await expect(farOn(page)).toHaveCount(1)
    const { unit, at } = await pickMany(page)
    await page.mouse.move(at.x, at.y)
    await expect(tag(page)).toBeVisible()
    await page.mouse.click(at.x, at.y)
    await expect(unit).toHaveAttribute('data-on', 'true')
  })
})

test('a pair on the Overview opens its bundle on the map', async ({ page }) => {
  await open(page, SIXTY)
  await page.getByRole('tab', { name: 'Overview' }).click()
  const pair = page.getByTestId('overview').locator('[data-row^="between:"]').first()
  const pairName = await pair.getAttribute('aria-label')
  await pair.locator('xpath=following-sibling::*[1]').click()
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await expect(page.locator('[data-unit][data-on]')).toHaveCount(1)
  const heading = page.getByTestId('inspector').getByRole('heading', { level: 2 })
  await expect(heading).toHaveText(/ (→|←|↔) /)
  expect(pairName).toBeTruthy()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('a bundle whose head was dropped still shows its direction', async ({ page }) => {
    await open(page, SIXTY)
    const dropped = page.locator('[data-unit]:has(div[data-dropped])').first()
    await expect(dropped).toBeAttached()
    const opacity = await dropped.locator('div[data-dropped]').evaluate((el) => getComputedStyle(el).opacity)
    expect(opacity).toBe('0')
    const at = await onLine(dropped)
    await page.mouse.move(at.x, at.y)
    await expect(tag(page)).toHaveText(/(→|←)/)
    await expect(dropped.locator('div[data-dropped]')).toHaveCSS('opacity', '1')
  })


  test('a tap on a bundle raises the sheet to half, with the pair as its title', async ({ page }) => {
    await open(page, SIXTY)
    const sheet = page.getByTestId('inspector')
    await expect(sheet).toHaveAttribute('data-stop', '0')
    await page.waitForTimeout(600)
    const unit = many(page).first()
    const at = await onLine(unit)
    await page.touchscreen.tap(at.x, at.y)
    await expect(sheet).toHaveAttribute('data-stop', '1')
    await expect(unit).toHaveAttribute('data-on', 'true')
    await expect(sheet.getByRole('button', { name: / (→|←|↔) .*Lower the sheet$/ })).toBeVisible()
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(/ (→|←|↔) /)
  })
})
