import { expect, test } from './test.ts'
import { open, pickConnection, pickPart, viewport } from './helpers.ts'

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const SIXTEEN = 'e2e/fixtures/sixteen-parts.board.json'
const WORST = 'e2e/fixtures/worst-text.board.json'

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
  // The refund board is wider than the map beside the sidebar, so its fit is set by width and rises when the sidebar hides.
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page, REFUND)
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
  // Fit with the sidebar open.
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
  await open(page, REFUND)
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: 'Play Approve and pay' }).click()
  const bar = page.getByRole('region', { name: 'Walkthrough: Approve and pay' })
  await expect(bar.getByText('1 / 5')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(bar.getByText('3 / 5')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(bar.getByText('2 / 5')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
})

test('the top bar is 40px high with 28px controls in three zones and three right-side groups', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const bar = page.getByRole('banner')
  const box = async (name: string | RegExp) => (await bar.getByRole('button', { name }).boundingBox())!
  const gap = (a: { x: number; width: number }, b: { x: number }) => Math.round(b.x - (a.x + a.width))
  // On the start screen there is no Send group and no double gap between Search and Settings.
  expect(gap(await box('Search'), await box('Settings'))).toBe(16)

  await open(page, REFUND)
  const barBox = (await bar.boundingBox())!
  expect(barBox.height).toBe(40)
  const crumb = await box('Local file')
  const tabs = (await bar.getByRole('tablist', { name: 'View' }).boundingBox())!
  const search = await box('Search')
  const send = await box(/^Send to agent/)
  const toggle = await box(/sidebar$/)
  const settings = await box('Settings')
  for (const control of [crumb, tabs, search, send, toggle, settings]) expect(control.height).toBe(28)
  expect(toggle.width).toBe(28)
  expect(settings.width).toBe(28)
  // Three zones left to right: crumb trail, centered view switch, right controls.
  expect(crumb.x + crumb.width).toBeLessThan(tabs.x)
  expect(tabs.x + tabs.width).toBeLessThan(search.x)
  expect(gap(search, send)).toBe(16)
  expect(gap(send, toggle)).toBe(16)
  expect(gap(toggle, settings)).toBe(4)
  // The search trigger says what it is.
  await expect(bar.getByRole('button', { name: 'Search' })).toContainText('Search')
})

test('the Map tab left edge stays pixel-identical across selections, views, examples, worst-text, and Send count', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const mapLeft = async () => Math.round((await page.getByRole('tab', { name: 'Map' }).boundingBox())!.x)

  await open(page, REFUND)
  const baseline = await mapLeft()

  // Part selected.
  await pickPart(page, 'policy-check')
  expect(await mapLeft()).toBe(baseline)

  // Connection selected.
  await pickConnection(page, 'proposes a payout')
  expect(await mapLeft()).toBe(baseline)

  // Overview view.
  await page.getByRole('tab', { name: 'Overview' }).click()
  await expect(page.getByTestId('overview')).toBeVisible()
  expect(await mapLeft()).toBe(baseline)

  // With a Send count (add a note on the map).
  await page.getByRole('tab', { name: 'Map' }).click()
  await page.keyboard.press('c')
  const composer = page.locator('[data-composer]')
  await composer.fill('A note for the send count')
  await composer.press('ControlOrMeta+Enter')
  await expect(page.getByRole('banner').getByRole('button', { name: /^Send to agent, 1 new/ })).toBeVisible()
  expect(await mapLeft()).toBe(baseline)

  // worst-text board.
  await open(page, WORST)
  expect(await mapLeft()).toBe(baseline)

  // All three built-in examples, opened through the Open menu.
  for (const name of [/How the Claude Code harness works/, /Anatomy itself/, /How a large language model/]) {
    await page.getByRole('banner').getByTestId('brand-mark').click()
    const menu = page.getByRole('dialog', { name: 'Open' })
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name }).click()
    await expect(menu).toBeHidden()
    await expect(page.getByRole('tab', { name: 'Map' })).toBeVisible()
    expect(await mapLeft()).toBe(baseline)
  }
})

for (const [width, height] of [
  [1440, 900],
  [1024, 768],
  [390, 844],
] as const) {
  test(`the view switch is centered within 1 px of the bar center at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await open(page, REFUND)
    const checkCentered = async () => {
      const bar = (await page.getByRole('banner').boundingBox())!
      const tabs = (await page.getByRole('tablist', { name: 'View' }).boundingBox())!
      const barCenter = bar.x + bar.width / 2
      const tabsCenter = tabs.x + tabs.width / 2
      expect(Math.abs(tabsCenter - barCenter)).toBeLessThanOrEqual(1)
    }
    await checkCentered()
    // Adding a note puts a count badge on Send; the switch must still stay centered.
    if (width <= 760) {
      await page.locator('.react-flow__node-card').first().click()
      await expect(page.getByRole('region', { name: 'Sidebar' })).toHaveAttribute('data-stop', '1')
    } else {
      await page.keyboard.press('c')
    }
    const composer = page.locator('[data-composer]')
    await composer.fill('Count check')
    await composer.press('ControlOrMeta+Enter')
    await expect(page.getByRole('banner').getByRole('button', { name: /^Send to agent, 1 new/ })).toBeVisible()
    await checkCentered()
  })
}

test('Search, Send, and Settings keep their left edges when a note is added and when the view changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, REFUND)
  const bar = page.getByRole('banner')
  const xs = async () => ({
    search: Math.round((await bar.getByRole('button', { name: 'Search' }).boundingBox())!.x),
    send: Math.round((await bar.getByRole('button', { name: /^Send to agent/ }).boundingBox())!.x),
    settings: Math.round((await bar.getByRole('button', { name: 'Settings' }).boundingBox())!.x),
  })
  const before = await xs()

  // Add a note so the Send count chip appears.
  await page.keyboard.press('c')
  const composer = page.locator('[data-composer]')
  await composer.fill('Keep controls still')
  await composer.press('ControlOrMeta+Enter')
  await expect(bar.getByRole('button', { name: /^Send to agent, 1 new/ })).toBeVisible()
  expect(await xs()).toEqual(before)

  // Switch to Overview (where the sidebar toggle hides) and back to Map.
  await page.getByRole('tab', { name: 'Overview' }).click()
  await expect(page.getByTestId('overview')).toBeVisible()
  expect(await xs()).toEqual(before)
  await page.getByRole('tab', { name: 'Map' }).click()
  await expect(page.getByTestId('overview')).toHaveCount(0)
  expect(await xs()).toEqual(before)
})

test('the mark stays visible with a board open, opens the Open menu, and Start screen returns with focus on Open folder', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, REFUND)
  const bar = page.getByRole('banner')
  const mark = bar.getByTestId('brand-mark')
  await expect(mark).toBeVisible()
  await mark.click()
  const menu = page.getByRole('dialog', { name: 'Open' })
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: 'Start screen' }).click()
  const openFolder = page.getByRole('button', { name: 'Open folder' })
  await expect(openFolder).toBeVisible()
  await expect(openFolder).toBeFocused()

  // Also reachable through the command menu from the keyboard.
  await open(page, REFUND)
  await page.keyboard.press('ControlOrMeta+k')
  const cmd = page.getByRole('dialog', { name: 'Command menu' })
  await cmd.getByRole('combobox').fill('Start screen')
  await page.keyboard.press('Enter')
  await expect(openFolder).toBeVisible()
  await expect(openFolder).toBeFocused()
})

test('heading hierarchy: start screen uses h1, and map uses a visually hidden h1 rather than the 13 px crumb', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('heading')).toHaveCount(0)
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Open a repository to see its anatomy.' })).toBeVisible()

  await open(page, REFUND)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('heading')).toHaveCount(0)
  const h1 = page.getByRole('heading', { level: 1, name: /Refund approval/ })
  await expect(h1).toHaveCount(1)
  // Visually hidden: 1x1 box.
  const box = (await h1.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(1)
  expect(box.height).toBeLessThanOrEqual(1)
})

test('keyboard path on the top bar: arrows switch views and Escape leaves the Open menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, REFUND)
  const mapTab = page.getByRole('tab', { name: 'Map' })
  const overviewTab = page.getByRole('tab', { name: 'Overview' })
  await mapTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(overviewTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('overview')).toBeVisible()
  await overviewTab.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(mapTab).toBeFocused()
  await expect(mapTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('overview')).toHaveCount(0)

  // Open menu via keyboard and close with Escape.
  const crumb = page.getByRole('banner').getByRole('button', { name: 'Local file' })
  await crumb.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('dialog', { name: 'Open' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(crumb).toBeFocused()
})

test.describe('top bar with reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })

  test('pressing the Send trigger does not scale it and switching views settles immediately', async ({ page }) => {
    await open(page, REFUND)
    const send = page.getByRole('banner').getByRole('button', { name: /^Send to agent/ })
    const box = (await send.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    const transform = await send.evaluate((el) => getComputedStyle(el).transform)
    await page.mouse.move(box.x + box.width + 40, box.y + box.height + 40)
    await page.mouse.up()
    expect(transform).toBe('none')
    await page.getByRole('tab', { name: 'Overview' }).click()
    await expect(page.getByTestId('overview')).toBeVisible()
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('the sidebar is a sheet: a slow drag settles on the nearest stop, a flick goes on to the next', async ({ page }) => {
    await open(page, REFUND)
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

    // Wait for the sheet to come to rest, so the press lands where the header is.
    // Two readings at least 100 ms apart must agree, so the first attempt never passes on its own.
    let top = (await header.boundingBox())!
    let lastY = Number.NaN
    await expect(async () => {
      const now = (await header.boundingBox())!
      const still = now.y === lastY
      lastY = now.y
      top = now
      expect(still).toBe(true)
    }).toPass({ intervals: [100] })
    // The flick carries its own event times, 16 ms apart, so a busy machine cannot slow it below a flick.
    const cdp = await page.context().newCDPSession(page)
    const at = Date.now() / 1000
    const send = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', step: number) =>
      cdp.send('Input.dispatchMouseEvent', { type, x, y: top.y + top.height / 2 - Math.min(step, 3) * 20, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, timestamp: at + step * 0.016 })
    await send('mousePressed', 0)
    for (let i = 1; i <= 3; i++) await send('mouseMoved', i)
    await send('mouseReleased', 4)
    await expect(sheet).toHaveAttribute('data-stop', '2')

    // A part picked on the map raises the sheet to half, so its details show.
    await header.click()
    await expect(sheet).toHaveAttribute('data-stop', '0')
    await page.locator('.react-flow__node-card').first().click()
    await expect(sheet).toHaveAttribute('data-stop', '1')
  })

  test('rows of the Overview are 44px, and a part picked from it stays above the sheet', async ({ page }) => {
    await open(page, REFUND)
    const sheet = page.getByRole('region', { name: 'Sidebar' })
    await page.getByRole('tab', { name: 'Overview' }).tap()
    const row = page.getByTestId('overview').locator('[data-row="part:manager-approval"]')
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
    await open(page, REFUND)
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

  test('the tabs take the top bar and undo and redo stay in the zoom surface', async ({ page }) => {
    await open(page, SHORTENER)
    await expect(page.getByRole('tab', { name: 'Map' })).toBeVisible()
    const zoom = page.getByRole('toolbar', { name: 'Zoom' })
    await expect(zoom.getByRole('button', { name: 'Undo' })).toBeVisible()
    await expect(zoom.getByRole('button', { name: 'Redo' })).toBeVisible()
    await page.getByRole('tab', { name: 'Overview' }).tap()
    await expect(page.getByTestId('overview')).toBeVisible()
    await expect(page.getByTestId('overview').getByRole('button', { name: /^Redirect handler/ })).toBeVisible()
  })

  test('the mark opens the Open menu on a phone', async ({ page }) => {
    await open(page, REFUND)
    const bar = page.getByRole('banner')
    const mark = bar.getByTestId('brand-mark')
    await expect(mark).toBeVisible()
    await mark.tap()
    await expect(page.getByRole('dialog', { name: 'Open' })).toBeVisible()
  })

  test('the command menu omits View commands that do nothing on a phone', async ({ page }) => {
    await open(page, REFUND)
    await page.getByRole('banner').getByRole('button', { name: 'Search' }).tap()
    const menu = page.getByRole('dialog', { name: 'Command menu' })
    await expect(menu).toBeVisible()
    for (const label of ['Show or hide sidebar', 'Zoom in', 'Zoom out', 'Zoom to 100%', 'Line key']) {
      await expect(menu.getByRole('option', { name: new RegExp(`^${label}`) })).toHaveCount(0)
    }
    await expect(menu.getByRole('option', { name: /^Fit board/ })).toBeVisible()
  })
})

test.describe('touch controls at the bottom of the map', () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } })

  test('every control owns its edges, so a tap near an edge reaches that control', async ({ page }) => {
    await open(page, REFUND)
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
    await open(page, REFUND)
    const level = page.getByRole('button', { name: /^Zoom \d+%/ })
    const box = (await level.boundingBox())!
    await page.touchscreen.tap(box.x + box.width - 2, box.y + box.height / 2)
    await expect(level).toHaveAccessibleName('Zoom 100%, reset to 100%')
  })
})
