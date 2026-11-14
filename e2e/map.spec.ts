/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { cardTransform, grabbable, nextFrame, open, viewport } from './helpers.ts'

const SHORTENER = 'src/examples/external/url-shortener.board.json'
const SIXTEEN = 'e2e/fixtures/sixteen-parts.board.json'
const FORTY = 'e2e/fixtures/forty-parts.board.json'

const zoomOf = async (page: Page) => {
  const match = /scale\(([\d.]+)\)/.exec(await viewport(page))
  return match ? Number(match[1]) : 0
}
const level = (page: Page) => page.getByRole('toolbar', { name: 'Zoom' }).getByRole('button', { name: /^Zoom \d+%/ })

interface Box {
  id: string
  left: number
  top: number
  right: number
  bottom: number
}

const cardBoxes = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')].map((n) => {
      const r = n.getBoundingClientRect()
      return { id: n.dataset.id ?? '', left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }),
  )

function overlapping(boxes: readonly Box[]): string[] {
  const out: string[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) out.push(`${a.id}+${b.id}`)
    }
  }
  return out
}

async function slowDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 24) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await nextFrame(page)
  }
}

test.describe('zoom bar', () => {
  test('steps, resets to 100%, and fits, from the buttons and the keys', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SHORTENER)
    const bar = page.getByRole('toolbar', { name: 'Zoom' })
    const start = await zoomOf(page)
    await expect(level(page)).toHaveText(`${Math.round(start * 100)}%`)

    await bar.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(start)
    await level(page).click()
    await expect.poll(() => zoomOf(page)).toBeCloseTo(1, 3)
    await expect(level(page)).toHaveText('100%')

    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('ControlOrMeta+Equal')
    await expect.poll(() => zoomOf(page)).toBeCloseTo(1.25, 3)
    await page.keyboard.press('ControlOrMeta+Minus')
    await expect.poll(() => zoomOf(page)).toBeCloseTo(1, 3)
    await page.keyboard.press('ControlOrMeta+Equal')
    await page.keyboard.press('ControlOrMeta+Digit0')
    await expect.poll(() => zoomOf(page)).toBeCloseTo(1, 3)
    await page.keyboard.press('Shift+Digit1')
    await expect.poll(() => zoomOf(page)).toBeCloseTo(start, 2)
  })

  for (const file of [SHORTENER, FORTY]) {
    test(`zooming out stops where the whole board fits: ${file}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await open(page, file)
      const dismiss = page.getByRole('button', { name: 'Dismiss' })
      if (await dismiss.count()) await dismiss.first().click()
      const out = page.getByRole('toolbar', { name: 'Zoom' }).getByRole('button', { name: 'Zoom out' })
      for (let i = 0; i < 12 && (await out.isEnabled()); i++) await out.click()
      await expect(out).toBeDisabled()
      // The last step glides for 160 ms. A wheel past the limit, once it lands, changes nothing.
      await page.waitForTimeout(300)
      const min = await zoomOf(page)
      const pane = (await page.locator('.react-flow__pane').boundingBox())!
      await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2)
      await page.keyboard.down('Control')
      await page.mouse.wheel(0, 600)
      await page.keyboard.up('Control')
      await page.waitForTimeout(300)
      expect(await zoomOf(page)).toBeCloseTo(min, 4)
      // Every card is on screen, and the board fills most of one side of the map.
      const boxes = await cardBoxes(page)
      for (const b of boxes) {
        expect(b.left).toBeGreaterThanOrEqual(pane.x - 1)
        expect(b.right).toBeLessThanOrEqual(pane.x + pane.width + 1)
        expect(b.top).toBeGreaterThanOrEqual(pane.y - 1)
        expect(b.bottom).toBeLessThanOrEqual(pane.y + pane.height + 1)
      }
      const width = Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left))
      const height = Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top))
      expect(Math.max(width / pane.width, height / pane.height)).toBeGreaterThan(0.6)
    })
  }

  test('the line key opens from the button beside the zoom bar', async ({ page }) => {
    await open(page, SHORTENER)
    await page.getByRole('button', { name: 'Line key' }).click()
    await expect(page.getByRole('dialog', { name: 'Line key' })).toContainText('Stores data in')
  })
})

test.describe('moving and resizing cards', () => {
  test('a card dropped on another pushes it aside, and one undo puts both back', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SIXTEEN)
    await page.getByRole('button', { name: 'Dismiss' }).first().click()
    const spot = await grabbable(page)
    const other = (await cardBoxes(page)).find((b) => b.id !== spot.id && b.left > 40 && b.top > 80 && b.bottom < 760)!
    const before = await cardBoxes(page)
    expect(overlapping(before)).toEqual([])
    await slowDrag(page, spot, { x: other.left + 30 + (spot.x - (before.find((b) => b.id === spot.id)!.left)), y: other.top + 20 + (spot.y - before.find((b) => b.id === spot.id)!.top) })
    await page.mouse.up()
    await page.waitForTimeout(400)
    const after = await cardBoxes(page)
    expect(overlapping(after)).toEqual([])
    const moved = after.filter((b) => {
      const was = before.find((x) => x.id === b.id)!
      return Math.abs(was.left - b.left) > 1 || Math.abs(was.top - b.top) > 1
    })
    expect(moved.length).toBeGreaterThanOrEqual(2)

    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForTimeout(400)
    const undone = await cardBoxes(page)
    for (const b of before) {
      const now = undone.find((x) => x.id === b.id)!
      expect(Math.abs(now.left - b.left)).toBeLessThan(1.5)
      expect(Math.abs(now.top - b.top)).toBeLessThan(1.5)
    }
  })

  test('alignment guides show while a card moves near a neighbor, and go when it drops', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SHORTENER)
    const spot = await grabbable(page)
    const boxes = await cardBoxes(page)
    const self = boxes.find((b) => b.id === spot.id)!
    // A neighbor in another column: the held card's top comes within 3 px of its top.
    const target = boxes.find((b) => b.id !== spot.id && Math.abs(b.left - self.left) > 300)!
    const dy = target.top + 3 - self.top
    await slowDrag(page, spot, { x: spot.x + 40, y: spot.y + dy })
    const shown = await page.evaluate(() => [...document.querySelectorAll<SVGLineElement>('.react-flow__viewport-portal line')].filter((l) => l.style.visibility === 'visible').length)
    expect(shown).toBeGreaterThan(0)
    // The card snapped: its top is on the neighbor's top.
    const held = (await cardBoxes(page)).find((b) => b.id === spot.id)!
    expect(Math.abs(held.top - target.top)).toBeLessThan(1)
    await page.mouse.up()
    await nextFrame(page)
    const after = await page.evaluate(() => [...document.querySelectorAll<SVGLineElement>('.react-flow__viewport-portal line')].filter((l) => l.style.visibility === 'visible').length)
    expect(after).toBe(0)
  })

  test('a card resized from its corner snaps to the grid, saves once, and undo restores it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SHORTENER)
    await level(page).click()
    await page.waitForTimeout(300)
    const spot = await grabbable(page)
    const card = page.locator(`.react-flow__node-card[data-id="${spot.id}"]`)
    const box = (await card.boundingBox())!
    const width = () => card.evaluate((n) => (n as HTMLElement).style.width)
    const height = () => card.evaluate((n) => (n as HTMLElement).style.height)
    const before = [await width(), await height()]
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await slowDrag(page, { x: box.x + box.width - 5, y: box.y + box.height - 5 }, { x: box.x + box.width + 77, y: box.y + box.height + 51 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const after = [await width(), await height()]
    expect(after).not.toEqual(before)
    const [w, h] = after.map((v) => Number.parseFloat(v ?? '0'))
    expect(w! % 1).toBe(0)
    expect(h! % 1).toBe(0)
    expect(w).toBeGreaterThan(Number.parseFloat(before[0]!))
    expect(overlapping(await cardBoxes(page))).toEqual([])

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => [await width(), await height()]).toEqual(before)
  })

  test('Escape during a resize puts the card back as it was', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SHORTENER)
    const spot = await grabbable(page)
    const card = page.locator(`.react-flow__node-card[data-id="${spot.id}"]`)
    const box = (await card.boundingBox())!
    const transform = await cardTransform(page, spot.id)
    const size = () => card.evaluate((n) => `${(n as HTMLElement).style.width} ${(n as HTMLElement).style.height}`)
    const before = await size()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await slowDrag(page, { x: box.x + box.width - 5, y: box.y + box.height - 5 }, { x: box.x + box.width + 90, y: box.y + box.height + 60 }, 12)
    expect(await size()).not.toBe(before)
    await page.keyboard.press('Escape')
    await nextFrame(page)
    expect(await size()).toBe(before)
    await page.mouse.up()
    await page.waitForTimeout(300)
    expect(await size()).toBe(before)
    expect(await cardTransform(page, spot.id)).toBe(transform)
  })
})

test('the card under the pointer keeps its lines and the rest step back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, SHORTENER)
  const spot = await grabbable(page)
  await page.mouse.move(spot.x, spot.y)
  await page.waitForTimeout(250)
  const opacities = await page.evaluate((id) => {
    const lines = [...document.querySelectorAll<SVGGElement>('.react-flow__edge g[data-ends]')]
    const own = lines.filter((g) => (g.dataset.ends ?? '').split(' ').includes(id))
    const rest = lines.filter((g) => !(g.dataset.ends ?? '').split(' ').includes(id))
    return { own: own.map((g) => Number(getComputedStyle(g).opacity)), rest: rest.map((g) => Number(getComputedStyle(g).opacity)) }
  }, spot.id)
  expect(opacities.own.length).toBeGreaterThan(0)
  expect(Math.min(...opacities.own)).toBe(1)
  expect(Math.max(...opacities.rest)).toBeLessThan(0.5)
})
