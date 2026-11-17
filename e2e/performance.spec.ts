/// <reference lib="dom" />
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { cardCenter, cardTransform, drag, grabbable, nextFrame, open, startFrameLog, stopFrameLog, viewport } from './helpers.ts'

const BOARDS = [
  { name: 'seven parts', file: 'src/examples/nordet.board.json' },
  { name: 'url shortener', file: 'src/examples/external/url-shortener.board.json' },
  { name: 'sixteen parts', file: 'e2e/fixtures/sixteen-parts.board.json' },
  { name: 'forty parts', file: 'e2e/fixtures/forty-parts.board.json' },
]

const P95_MS = 25
const MAX_MS = 60
const LAND_PX = 8

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0
}

// One frame can stall for reasons outside the page, such as the machine doing other work.
// A drag may have at most one frame over the hard limit. A real slowdown stalls many frames.
const SLOW_MS = 50
const SLOW_FRAMES_ALLOWED = 1

for (const board of BOARDS) {
  test(`dragging a card stays smooth and lands under the pointer: ${board.name}`, async ({ page }) => {
    await open(page, board.file)
    const first = await grabbable(page, { dx: 90, dy: 60 })
    const before = await cardTransform(page, first.id)

    await startFrameLog(page)
    await drag(page, first, 90, 60)
    await nextFrame(page)
    const frames = await stopFrameLog(page)
    await page.waitForTimeout(300)

    const p50 = percentile(frames, 0.5)
    const p95 = percentile(frames, 0.95)
    const max = Math.max(...frames)
    const slow = frames.filter((f) => f > SLOW_MS).length
    console.log(`[drag] ${board.name}: frames=${frames.length} p50=${p50.toFixed(1)}ms p95=${p95}ms max=${max}ms slow=${slow}`)
    expect(p95, `p95 frame on ${board.name}`).toBeLessThanOrEqual(P95_MS)
    expect(slow, `frames over ${SLOW_MS} ms on ${board.name} (max ${max.toFixed(1)} ms)`).toBeLessThanOrEqual(SLOW_FRAMES_ALLOWED)
    expect(max, `worst frame on ${board.name}`).toBeLessThanOrEqual(MAX_MS * 3)

    // The card ends where the pointer let go.
    const after = await cardCenter(page, first.id)
    expect(after).toBeDefined()
    expect(Math.abs((after?.x ?? 0) - (first.x + 90))).toBeLessThanOrEqual(LAND_PX)
    expect(Math.abs((after?.y ?? 0) - (first.y + 60))).toBeLessThanOrEqual(LAND_PX)

    // The new place is saved and comes back after a reload.
    const moved = await cardTransform(page, first.id)
    expect(moved).not.toBe(before)
    await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()
    await page.reload()
    await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
    expect(await cardTransform(page, first.id)).toBe(moved)
  })
}

test('dragging an unselected card on a narrow screen does not move the view', async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 800 })
  await open(page, BOARDS[0]!.file)
  const spot = await grabbable(page, { dx: 40, dy: 30 })
  const view = await viewport(page)
  await drag(page, spot, 40, 30)
  await page.waitForTimeout(300)
  expect(await viewport(page)).toBe(view)
  const after = await cardCenter(page, spot.id)
  expect(Math.abs((after?.x ?? 0) - (spot.x + 40))).toBeLessThanOrEqual(LAND_PX)
  expect(Math.abs((after?.y ?? 0) - (spot.y + 30))).toBeLessThanOrEqual(LAND_PX)
})

/** Runs a gesture with the frame log on and checks the frame budget. Returns the frames. */
async function budget(page: import('@playwright/test').Page, name: string, gesture: () => Promise<void>) {
  await startFrameLog(page)
  await gesture()
  await nextFrame(page)
  const frames = await stopFrameLog(page)
  const p95 = percentile(frames, 0.95)
  const max = Math.max(...frames)
  const slow = frames.filter((f) => f > SLOW_MS).length
  console.log(`[${name}] frames=${frames.length} p50=${percentile(frames, 0.5).toFixed(1)}ms p95=${p95}ms max=${max}ms slow=${slow}`)
  expect(p95, `p95 frame: ${name}`).toBeLessThanOrEqual(P95_MS)
  expect(slow, `frames over ${SLOW_MS} ms: ${name} (max ${max.toFixed(1)} ms)`).toBeLessThanOrEqual(SLOW_FRAMES_ALLOWED)
  return frames
}

test('dragging a card along a row of forty parts, with the guides snapping, stays smooth', async ({ page }) => {
  await open(page, BOARDS[3]!.file)
  const spot = await grabbable(page)
  let guided = 0
  await budget(page, 'drag with guides, forty parts', async () => {
    await page.mouse.move(spot.x, spot.y)
    await page.mouse.down()
    // Sideways along the row, so the top and the middle line up with neighbors on the way.
    for (let i = 1; i <= 60; i++) {
      await page.mouse.move(spot.x + i * 6, spot.y + Math.sin(i / 6) * 8)
      await nextFrame(page)
      if (await page.evaluate(() => [...document.querySelectorAll<SVGLineElement>('.react-flow__viewport-portal line')].some((l) => l.style.visibility === 'visible'))) guided++
    }
    await page.mouse.up()
  })
  expect(guided, 'frames with a guide shown').toBeGreaterThan(0)
})

test('resizing a card on forty parts stays smooth', async ({ page }) => {
  await open(page, BOARDS[3]!.file)
  const spot = await grabbable(page)
  const box = (await page.locator(`.react-flow__node-card[data-id="${spot.id}"]`).boundingBox())!
  await page.mouse.move(spot.x, spot.y)
  const corner = { x: box.x + box.width - 5, y: box.y + box.height - 5 }
  await budget(page, 'resize, forty parts', async () => {
    await page.mouse.move(corner.x, corner.y)
    await page.mouse.down()
    for (let i = 1; i <= 60; i++) {
      await page.mouse.move(corner.x + i * 2.5, corner.y + i * 1.5)
      await nextFrame(page)
    }
    await page.mouse.up()
  })
  expect(Number.parseFloat(await page.locator(`.react-flow__node-card[data-id="${spot.id}"]`).evaluate((n) => (n as HTMLElement).style.width))).toBeGreaterThan(box.width / 2)
})

// The release is where the lines of the resized card and of the cards it pushes aside are solved again.
// The longest frame after the release is checked on its own, because the frame log of a whole gesture hides it among its frames.
const RELEASE_MS = 50
for (const board of [BOARDS[2]!, BOARDS[3]!, { name: 'sixty parts', file: 'e2e/fixtures/sixty-parts.board.json' }]) {
  test(`releasing a resize leaves no long frame: ${board.name}`, async ({ page }) => {
    await open(page, board.file)
    const spot = await grabbable(page)
    const box = (await page.locator(`.react-flow__node-card[data-id="${spot.id}"]`).boundingBox())!
    const corner = { x: box.x + box.width - 5, y: box.y + box.height - 5 }
    await page.mouse.move(corner.x, corner.y)
    await page.mouse.down()
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(corner.x + i * 3, corner.y + i * 2)
      await nextFrame(page)
    }
    await startFrameLog(page)
    await page.mouse.up()
    await page.waitForTimeout(600)
    const frames = await stopFrameLog(page)
    const max = Math.max(...frames)
    console.log(`[resize release] ${board.name}: frames=${frames.length} max=${max.toFixed(1)}ms`)
    expect(max, `longest frame after the release on ${board.name}`).toBeLessThan(RELEASE_MS)
    // The lines of the card come back once they are solved.
    await expect(page.locator('.react-flow__edge').first()).toBeVisible()
  })
}

test('dragging a card on a board with 150 strokes and 20 sticky notes stays smooth', async ({ page }) => {
  const board = await readFile(BOARDS[2]!.file, 'utf8')
  const id = (JSON.parse(board) as { id: string }).id
  const now = '2026-11-14T00:00:00.000Z'
  const strokes = Array.from({ length: 150 }, (_, i) => ({
    id: `mark-stroke${String(i).padStart(3, '0')}`,
    createdAt: now,
    kind: 'stroke',
    points: Array.from({ length: 40 }, (_, k) => ({ x: (i % 15) * 120 + k * 3, y: Math.floor(i / 15) * 90 + Math.sin(k / 4) * 20 })),
  }))
  const stickies = Array.from({ length: 20 }, (_, i) => ({ id: `mark-sticky${String(i).padStart(3, '0')}`, createdAt: now, kind: 'sticky', x: i * 160, y: 1400, width: 160, height: 120, text: `Sticky ${i}` }))
  const layer = { format: 'anatomy-layer', schemaVersion: 2, boardId: id, positions: {}, sizes: {}, notes: [], links: [], marks: [...strokes, ...stickies], proposals: [], reconnects: [], archive: [] }
  await page.addInitScript(
    ([key, files]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ name: 'marks', files, remembered: false }))
    },
    ['anatomy:test-folder', { 'board.json': { text: board, lastModified: 1 }, 'layer.json': { text: JSON.stringify(layer), lastModified: 1 } }] as const,
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await page.waitForTimeout(400)
  const spot = await grabbable(page)
  await budget(page, 'drag, 150 strokes and 20 stickies', () => drag(page, spot, 90, 60))
})

test('a pen stroke of 300 moves on forty parts stays smooth, and is saved as one drawing', async ({ page }) => {
  await open(page, BOARDS[3]!.file)
  const map = (await page.locator('.react-flow').boundingBox())!
  await page.keyboard.press('p')
  const start = { x: map.x + 120, y: map.y + map.height / 2 }
  await budget(page, 'pen, 300 moves, forty parts', async () => {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let i = 1; i <= 300; i++) {
      await page.mouse.move(start.x + i * 2, start.y + Math.sin(i / 12) * 80)
      if (i % 5 === 0) await nextFrame(page)
    }
    await page.mouse.up()
  })
  await expect(page.locator('[data-mark]')).toHaveCount(1)
})
