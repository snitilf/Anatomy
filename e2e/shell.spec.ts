import { expect, test } from '@playwright/test'
import { open, pickConnection, viewport } from './helpers.ts'

const NORDET = 'src/examples/nordet.board.json'
const SHORTENER = 'src/examples/external/url-shortener.board.json'
const SIXTEEN = 'e2e/fixtures/sixteen-parts.board.json'

test('the command menu finds a part by name and opens it', async ({ page }) => {
  await open(page, SHORTENER)
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill('redirect handler')
  await menu.getByRole('option', { name: /^Redirect handler/ }).click()
  await expect(menu).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('heading', { name: 'Redirect handler', level: 2 })).toBeVisible()
})

test('] hides the sidebar, the map takes the room and keeps its middle, and ] brings it back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, SIXTEEN)
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
  // Stay above the fit-based minimum at either map width.
  await page.getByRole('button', { name: 'Zoom in' }).click({ clickCount: 3, delay: 300 })
  // A view that reads the same twice in a row has finished gliding.
  let viewBefore = ''
  await expect
    .poll(async () => {
      const now = await viewport(page)
      const same = now === viewBefore
      viewBefore = now
      return same
    }, { intervals: [100] })
    .toBe(true)
  const before = (await page.locator('.react-flow').boundingBox())!
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press(']')
  await expect(sidebar).toBeHidden()
  await expect.poll(async () => (await page.locator('.react-flow').boundingBox())!.width).toBeGreaterThan(before.width + 300)
  const parseView = (value: string) => {
    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(value)!
    return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) }
  }
  const initial = parseView(viewBefore)
  const checkView = async () => {
    const box = (await page.locator('.react-flow').boundingBox())!
    const view = parseView(await viewport(page))
    expect(view.zoom).toBeCloseTo(initial.zoom, 3)
    expect((box.width / 2 - view.x) / view.zoom).toBeCloseTo((before.width / 2 - initial.x) / initial.zoom, 0)
    expect((box.height / 2 - view.y) / view.zoom).toBeCloseTo((before.height / 2 - initial.y) / initial.zoom, 0)
  }
  await expect.poll(async () => {
    try { await checkView(); return true } catch { return false }
  }).toBe(true)
  await page.keyboard.press(']')
  await expect(sidebar).toBeVisible()
  await expect.poll(async () => {
    try { await checkView(); return true } catch { return false }
  }).toBe(true)
})

test('widening the map clamps zoom to its new fit minimum', async ({ page }) => {
  // Nordet is wider than the map beside the sidebar, so its fit is set by width and rises when the sidebar hides.
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page, NORDET)
  const zoom = async () => Number(/scale\(([\d.]+)\)/.exec(await viewport(page))?.[1])
  // A zoom that reads the same twice in a row has finished gliding.
  const settled = async () => {
    let last = Number.NaN
    let value = Number.NaN
    await expect
      .poll(async () => {
        value = await zoom()
        const same = value === last
        last = value
        return same
      }, { intervals: [100] })
      .toBe(true)
    return value
  }
  // Fit with the sidebar open. The board opens at the start of the flow when the whole of it is too small to read.
  await page.keyboard.press('Shift+Digit1')
  const previous = await settled()
  const before = (await page.locator('.react-flow').boundingBox())!
  await page.keyboard.press(']')
  await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeHidden()
  await expect.poll(async () => (await page.locator('.react-flow').boundingBox())!.width).toBeGreaterThan(before.width + 300)
  const afterResize = await settled()
  // Fit measures the minimum for the wider map on its own.
  await page.keyboard.press('Shift+Digit1')
  const fit = await settled()
  expect(fit).toBeGreaterThan(previous + 0.01)
  expect(afterResize).toBeCloseTo(fit, 3)
})

test('the walkthrough bar steps with the arrow keys and closes with Escape', async ({ page }) => {
  await open(page, NORDET)
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: 'Play Approve and simulate' }).click()
  const bar = page.getByRole('region', { name: 'Walkthrough: Approve and simulate' })
  await expect(bar.getByText('1 / 5')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(bar.getByText('3 / 5')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(bar.getByText('2 / 5')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
})

test('the top bar is 40px high with 28px controls in three groups: 4px inside a group, 16px between', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, NORDET)
  const bar = page.getByRole('banner')
  expect((await bar.boundingBox())!.height).toBe(40)
  const box = async (name: string | RegExp) => (await bar.getByRole('button', { name }).boundingBox())!
  const search = await box('Search')
  const send = await box(/^Send to agent/)
  const toggle = await box(/sidebar$/)
  const settings = await box('Settings')
  for (const control of [search, send, toggle, settings]) expect(control.height).toBe(28)
  expect(toggle.width).toBe(28)
  const gap = (a: { x: number; width: number }, b: { x: number }) => Math.round(b.x - (a.x + a.width))
  expect(gap(search, send)).toBe(16)
  expect(gap(send, toggle)).toBe(16)
  expect(gap(toggle, settings)).toBe(4)
  // The search trigger says what it is.
  await expect(bar.getByRole('button', { name: 'Search' })).toContainText('Search')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('the sidebar is a sheet: a slow drag settles on the nearest stop, a flick goes on to the next', async ({ page }) => {
    await open(page, NORDET)
    const sheet = page.getByRole('region', { name: 'Sidebar' })
    await expect(sheet).toHaveAttribute('data-stop', '0')
    const header = sheet.getByRole('button').first()
    const box = (await header.boundingBox())!
    const x = box.x + box.width / 2
    await page.mouse.move(x, box.y + 20)
    await page.mouse.down()
    for (let i = 1; i <= 20; i++) await page.mouse.move(x, box.y + 20 - i * 18)
    await page.waitForTimeout(200)
    await page.mouse.up()
    await expect(sheet).toHaveAttribute('data-stop', '1')

    const top = (await header.boundingBox())!
    await page.mouse.move(x, top.y + 20)
    await page.mouse.down()
    for (let i = 1; i <= 3; i++) await page.mouse.move(x, top.y + 20 - i * 20)
    await page.mouse.up()
    await expect(sheet).toHaveAttribute('data-stop', '2')

    // A part picked on the map raises the sheet to half, so its details show.
    await header.click()
    await expect(sheet).toHaveAttribute('data-stop', '0')
    await page.locator('.react-flow__node-card').first().click()
    await expect(sheet).toHaveAttribute('data-stop', '1')
  })

  test('rows of the Overview are 44px, and a part picked from it stays above the sheet', async ({ page }) => {
    await open(page, NORDET)
    const sheet = page.getByRole('region', { name: 'Sidebar' })
    await page.getByRole('tab', { name: 'Overview' }).tap()
    const row = page.getByTestId('overview').locator('[data-row="part:approval"]')
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    // A part chosen from the list is shown on the map above the half-height sheet.
    await row.tap()
    await expect(sheet).toHaveAttribute('data-stop', '1')
    // Read until two reads in a row agree, so the settled view is judged and not a frame on the way.
    let last = ''
    let settled = { bottom: 0, top: 0 }
    await expect
      .poll(async () => {
        const card = (await page.locator('.react-flow__node-card.selected').first().boundingBox())!
        const now = { bottom: card.y + card.height, top: (await sheet.boundingBox())!.y }
        const same = JSON.stringify(now) === last
        last = JSON.stringify(now)
        settled = now
        return same
      }, { intervals: [150] })
      .toBe(true)
    expect(settled.bottom).toBeLessThanOrEqual(settled.top + 1)
  })

  test('a connection chosen from the command menu fits both ends above the sheet', async ({ page }) => {
    await open(page, SHORTENER)
    const sheet = page.getByRole('region', { name: 'Sidebar' })
    await pickConnection(page, 'GET short code')
    await expect(sheet).toHaveAttribute('data-stop', '1')
    // Half of the map: the sheet has settled there.
    const top = 40 + (844 - 40) / 2
    await expect
      .poll(async () => {
        const path = (await page.locator('.react-flow__edge.selected .react-flow__edge-path').first().boundingBox())!
        return path.y + path.height <= top + 1 && path.x >= -1 && path.x + path.width <= 391
      })
      .toBe(true)
  })

  test('a drag of the sheet header leaves no focus ring', async ({ page }) => {
    await open(page, NORDET)
    const sheet = page.getByRole('region', { name: 'Sidebar' })
    const header = sheet.getByRole('button').first()
    const box = (await header.boundingBox())!
    const x = box.x + box.width / 2
    await page.mouse.move(x, box.y + 20)
    await page.mouse.down()
    for (let i = 1; i <= 20; i++) await page.mouse.move(x, box.y + 20 - i * 18)
    await page.mouse.up()
    await expect(header).toHaveCSS('box-shadow', 'none')
  })
})

test.describe('touch controls at the bottom of the map', () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } })

  test('every control owns its edges, so a tap near an edge reaches that control', async ({ page }) => {
    await open(page, NORDET)
    await expect(page.getByRole('note')).toBeVisible()
    const groups = [page.getByRole('toolbar', { name: 'Zoom' }), page.getByRole('toolbar', { name: 'Whiteboard tools' }), page.getByRole('note')]
    for (const group of groups) {
      const controls = group.getByRole('button')
      expect(await controls.count()).toBeGreaterThan(0)
      for (const control of await controls.all()) {
        const owned = await control.evaluate((el) => {
          const r = el.getBoundingClientRect()
          const at = (x: number, y: number) => el.contains(document.elementFromPoint(x, y))
          const cx = r.left + r.width / 2
          const cy = r.top + r.height / 2
          return [at(r.left + 1, cy), at(r.right - 1, cy), at(cx, r.top + 1), at(cx, r.bottom - 1)].every(Boolean)
        })
        expect(owned, (await control.getAttribute('aria-label')) ?? 'control').toBe(true)
      }
    }
    // The hint does not touch the tool bar.
    const hint = (await page.getByRole('note').boundingBox())!
    const dock = (await page.getByRole('toolbar', { name: 'Whiteboard tools' }).boundingBox())!
    expect(hint.y + hint.height).toBeLessThanOrEqual(dock.y)
  })

  test('a tap at the edge of the zoom percentage resets the zoom and does not zoom in', async ({ page }) => {
    await open(page, NORDET)
    const level = page.getByRole('button', { name: /^Zoom \d+%/ })
    const box = (await level.boundingBox())!
    await page.touchscreen.tap(box.x + box.width - 2, box.y + box.height / 2)
    await expect(level).toHaveAccessibleName('Zoom 100%, reset to 100%')
  })
})
