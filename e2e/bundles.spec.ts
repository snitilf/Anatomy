/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { open, pickPart, viewport } from './helpers.ts'

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
    for (const t of [0.25, 0.75, 0.4, 0.6, 0.1, 0.9, 0.5, 0.05, 0.15, 0.2, 0.3, 0.35, 0.45, 0.55, 0.65, 0.7, 0.8, 0.85, 0.95]) {
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

/**
 * A point on the line of a bundle that is also at least `apart` screen pixels from every other bundle. On a phone the
 * browser moves a tap to the nearest target within reach, so a spot beside a neighbouring track picks the neighbour.
 */
async function onLineApart(unit: Locator, apart: number): Promise<{ x: number; y: number }> {
  const at = await unit.evaluate((el, gap) => {
    const screen = (path: SVGPathElement, length: number) => {
      const m = path.getScreenCTM()!
      const p = path.getPointAtLength(length)
      return { x: p.x * m.a + m.e, y: p.y * m.d + m.f }
    }
    const own = el.querySelector<SVGPathElement>('path[data-hit]')!
    const others = [...document.querySelectorAll<SVGPathElement>('[data-unit] path[data-hit]')].filter((p) => p !== own)
    const near: { x: number; y: number }[] = []
    for (const path of others) {
      const total = path.getTotalLength()
      const step = Math.max(2, total * Math.abs(path.getScreenCTM()!.a) > 0 ? 2 / Math.abs(path.getScreenCTM()!.a) : total)
      for (let l = 0; l <= total; l += step) near.push(screen(path, l))
    }
    const total = own.getTotalLength()
    let best: { x: number; y: number; room: number } | undefined
    for (let t = 0.05; t < 0.96; t += 0.01) {
      const p = screen(own, total * t)
      if (!el.contains(document.elementFromPoint(p.x, p.y))) continue
      const room = Math.min(...near.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))
      if (!best || room > best.room) best = { ...p, room }
    }
    return best && best.room >= gap ? { x: best.x, y: best.y } : { room: best?.room ?? -1 }
  }, apart)
  if (at.x === undefined) throw new Error(`no point of this bundle is ${apart}px from the others (best ${Math.round(at.room ?? -1)}px)`)
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

  test('a line is as wide on screen as it is meant to be, at any zoom', async ({ page }) => {
    await open(page, SIXTY)
    const zoom = await zoomOf(page)
    const { unit, at } = await pickMany(page)
    const hit = await unit.locator('path[data-hit]').evaluate((p) => Number.parseFloat(getComputedStyle(p).strokeWidth))
    expect(hit * zoom).toBeGreaterThan(11)
    await page.mouse.click(at.x, at.y)
    const widths = await page.locator('g[data-active] .react-flow__edge-path').evaluateAll((all) => all.map((p) => Number.parseFloat(getComputedStyle(p).strokeWidth)))
    expect(widths.length).toBeGreaterThan(0)
    for (const w of widths) expect(w * zoom).toBeGreaterThan(1.8)
    const bundle = await unit.locator('path[data-bundle]').evaluate((p) => Number.parseFloat(getComputedStyle(p).strokeWidth))
    expect(bundle * zoom).toBeGreaterThan(2)
  })

  test('a row opens its connection and leaves the far view', async ({ page }) => {
    await open(page, SIXTY)
    const { at } = await pickMany(page)
    await page.mouse.click(at.x, at.y)
    const panel = page.getByTestId('inspector')
    const row = panel.locator('[data-row^="conn:"]').first()
    const label = await row.locator('span').nth(1).innerText()
    await row.click()
    await expect.poll(() => zoomOf(page)).toBeGreaterThanOrEqual(0.75)
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
    const board = JSON.parse(await readFile(SIXTY, 'utf8')) as { groups: { id: string; label: string }[]; components: { group?: string }[] }
    const names = board.groups.map((g) => `${g.label}, ${board.components.filter((c) => c.group === g.id).length} parts`)
    await open(page, SIXTY)
    const total = await units(page).count()
    expect(total).toBeGreaterThan(10)
    await page.getByRole('button', { name: new RegExp(`^${names[0]}`) }).focus()
    const seen: string[] = []
    const namesSeen = new Set([names[0]])
    let sawBundleBeforeName = false
    for (let i = 0; i < total + 40 && seen.length < total; i++) {
      await page.keyboard.press('Tab')
      const at = await page.evaluate(() => {
        const el = document.activeElement
        return { label: el?.getAttribute('aria-label') ?? '', inUnit: el?.closest('[data-unit]') !== null }
      })
      if (at.inUnit) seen.push(at.label)
      else if (/Zoom to this group\.$/.test(at.label)) {
        namesSeen.add(at.label.replace(/\. Zoom to this group\.$/, ''))
        if (seen.length > 0) sawBundleBeforeName = true
      }
    }
    expect(new Set(seen).size).toBe(total)
    expect([...namesSeen].sort()).toEqual([...names].sort())
    expect(sawBundleBeforeName).toBe(false)
  })

  test('a selected bundle survives zooming in past the far view', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await open(page, SIXTY)
    const { at } = await pickMany(page)
    await page.mouse.click(at.x, at.y)
    const panel = page.getByTestId('inspector')
    const title = await panel.getByRole('heading', { level: 2 }).innerText()
    const rows = await panel.locator('[data-row^="conn:"]').count()
    await page.keyboard.press('Shift+0')
    await expect.poll(() => zoomOf(page)).toBeGreaterThanOrEqual(0.75)
    await expect(farOn(page)).toHaveCount(0)
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText(title)
    // The lines of the bundle stay lit, and the rest of the map stays stepped back.
    expect(await page.locator('g[data-active]').count()).toBe(rows)
    // Back out, the bundle is still the selection.
    await page.keyboard.press('Shift+1')
    await expect(farOn(page)).toHaveCount(1)
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(1)
    expect(errors).toEqual([])
  })

  test('focus on a count is not dropped to the page when the map zooms in', async ({ page }) => {
    await open(page, SIXTY)
    await many(page).first().locator('button').focus()
    await page.keyboard.press('Shift+0')
    await expect.poll(() => zoomOf(page)).toBeGreaterThanOrEqual(0.75)
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
  })

  test('a bundle made of links is cleared when undo takes its last link away', async ({ page }, testInfo) => {
    const board = JSON.parse(await readFile(SIXTY, 'utf8')) as { components: { id: string; label: string; group?: string }[]; relationships: { from: string; to: string }[] }
    const [x, y] = board.components.filter((c) => c.group === undefined)
    if (!x || !y) throw new Error('the fixture has no two parts without a group')
    // Two parts with no connection, so the only thing between them is what the test draws.
    board.relationships = board.relationships.filter((r) => ![x.id, y.id].includes(r.from) && ![x.id, y.id].includes(r.to))
    const file = testInfo.outputPath('linked.board.json')
    await writeFile(file, JSON.stringify(board))
    await open(page, file)
    const link = async (from: typeof x, to: typeof x, label: string) => {
      await pickPart(page, from.id)
      await page.keyboard.press('l')
      await page.getByRole('combobox', { name: /Search parts/ }).or(page.getByPlaceholder('Search parts')).fill(to.label)
      await page.keyboard.press('Enter')
      await page.getByLabel('Label', { exact: true }).fill(label)
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('inspector').getByRole('heading', { level: 2 })).toHaveText(label)
    }
    await link(x, y, 'first link')
    await link(y, x, 'second link')
    await page.locator('.react-flow__pane').click({ position: { x: 4, y: 300 } })
    await page.keyboard.press('Shift+1')
    await expect(farOn(page)).toHaveCount(1)
    const [a, b] = [x.id, y.id].sort()
    const unit = page.locator(`[data-unit="${a}|${b}"]`)
    await expect(unit).toBeAttached()
    await page.mouse.click((await onLine(unit)).x, (await onLine(unit)).y)
    await expect(unit).toHaveAttribute('data-on', 'true')
    const panel = page.getByTestId('inspector')
    await expect(panel.locator('[data-row^="conn:"]')).toHaveCount(2)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(panel.locator('[data-row^="conn:"]')).toHaveCount(1)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(0)
    await expect(unit).toHaveCount(0)
    // Redo brings the link back, selected as a link. The bundle is not selected again.
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('first link')
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(0)
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
    await expect.poll(() => zoomOf(page)).toBeGreaterThanOrEqual(0.75)
    await expect(page.locator('[data-unit][data-on]')).toHaveCount(0)
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1)
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

  test('a tap on a crowded line picks the line the finger is nearest to', async ({ page }) => {
    test.setTimeout(120_000)
    const crowded = async (): Promise<{ x: number; y: number; id: string }[]> => {
    await open(page, SIXTY)
    await expect(farOn(page)).toBeAttached()
    await page.waitForTimeout(600)
    // Points on lines that lie within 8px of another line, and the line that is nearest each, found by distance on screen.
    return page.evaluate(() => {
      const paths = [...document.querySelectorAll<SVGPathElement>('[data-unit] path[data-hit]')]
      const sample = (path: SVGPathElement, step: number) => {
        const m = path.getScreenCTM()!
        const total = path.getTotalLength()
        const out: { x: number; y: number }[] = []
        const scale = Math.abs(m.a) || 1
        for (let l = 0; l <= total; l += Math.max(0.5, step / scale)) {
          const p = path.getPointAtLength(l)
          out.push({ x: p.x * m.a + m.e, y: p.y * m.d + m.f })
        }
        return out
      }
      const lines = paths.map((path) => ({ id: path.closest('[data-unit]')!.getAttribute('data-unit')!, points: sample(path, 2) }))
      // Points of every line in cells of 10px, so the nearest other line is found without comparing every pair.
      const cells = new Map<string, { id: string; x: number; y: number }[]>()
      for (const l of lines)
        for (const q of l.points) {
          const key = `${Math.floor(q.x / 10)},${Math.floor(q.y / 10)}`
          const list = cells.get(key) ?? []
          list.push({ id: l.id, ...q })
          cells.set(key, list)
        }
      const nearest = (at: { x: number; y: number }, skip: string) => {
        let best = Infinity
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++)
            for (const q of cells.get(`${Math.floor(at.x / 10) + i},${Math.floor(at.y / 10) + j}`) ?? []) if (q.id !== skip) best = Math.min(best, Math.hypot(q.x - at.x, q.y - at.y))
        return best
      }
      const found: { x: number; y: number; id: string }[] = []
      for (const l of lines) {
        // A bundle that holds one connection opens that connection, which this check cannot read back.
        if (!document.querySelector(`[data-unit="${l.id}"] button[aria-label$="Show them."]`)) continue
        // The map is 390px wide, and a point under the sheet or the controls is not reachable.
        for (const at of l.points) {
          if (at.x < 8 || at.x > 382 || at.y < 60 || at.y > 520) continue
          const d = nearest(at, l.id)
          if (d < 1 || d > 8) continue
          // A count is a button of its own, and a tap on it stays with its bundle.
          const top = document.elementFromPoint(at.x, at.y)
          if (!top?.closest('[data-unit]') || top.closest('button')) continue
          found.push({ ...at, id: l.id })
          break
        }
      }
      return found
    })
    }
    const spots = await crowded()
    expect(spots.length).toBeGreaterThan(2)
    let wrong = 0
    for (const spot of spots.slice(0, 6)) {
      // The map opens the same every time, so the spots hold on a fresh page.
      await open(page, SIXTY)
      await expect(farOn(page)).toBeAttached()
      await page.waitForTimeout(600)
      await page.touchscreen.tap(spot.x, spot.y)
      await expect(page.getByTestId('inspector')).toHaveAttribute('data-stop', '1')
      if ((await page.evaluate(() => document.querySelector('[data-unit][data-on]')?.getAttribute('data-unit') ?? null)) !== spot.id) wrong++
    }
    expect(wrong).toBe(0)
  })

  test('a bundle whose head was dropped still shows its direction', async ({ page }) => {
    await open(page, SIXTY)
    const all = page.locator('[data-unit]:has(div[data-dropped])')
    await expect(all.first()).toBeAttached()
    // Crowded lines overlap on a phone: take the first one a pointer can reach.
    let dropped = all.first()
    let at: { x: number; y: number } | undefined
    for (const candidate of await all.all()) {
      try {
        at = await onLine(candidate)
        dropped = candidate
        break
      } catch {
        // Covered by a neighbor.
      }
    }
    if (!at) throw new Error('no dropped head can be reached')
    expect(await dropped.locator('div[data-dropped]').evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
    await page.mouse.move(at.x, at.y)
    await expect(tag(page)).toHaveText(/(→|←)/)
    await expect(dropped.locator('div[data-dropped]')).toHaveCSS('opacity', '1')
  })


  test('a tap on a bundle raises the sheet to half, with the pair as its title', async ({ page }) => {
    await open(page, FORTY)
    const sheet = page.getByTestId('inspector')
    await expect(sheet).toHaveAttribute('data-stop', '0')
    await page.waitForTimeout(600)
    // A finger reaches 12px either side of a line, so the first bundle with a stretch 25px clear of its neighbours is the one that must turn on.
    let unit = many(page).first()
    let at: { x: number; y: number } | undefined
    for (let i = 0; i < (await many(page).count()) && !at; i++) {
      unit = many(page).nth(i)
      at = await onLineApart(unit, 25).catch(() => undefined)
    }
    if (!at) throw new Error('no bundle has a stretch clear of the others')
    await page.touchscreen.tap(at.x, at.y)
    await expect(sheet).toHaveAttribute('data-stop', '1')
    await expect(unit).toHaveAttribute('data-on', 'true')
    await expect(sheet.getByRole('button', { name: / (→|←|↔) .*Lower the sheet$/ })).toBeVisible()
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(/ (→|←|↔) /)
  })
})
