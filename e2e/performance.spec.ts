/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { cardCenter, cardTransform, drag, grabbable, nextFrame, open, startFrameLog, stopFrameLog, viewport } from './helpers.ts'

const BOARDS = [
  { name: 'seven parts', file: 'src/examples/example.board.json' },
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
    const first = await grabbable(page)
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
    console.log(`[drag] ${board.name}: frames=${frames.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms slow=${slow}`)
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
  const spot = await grabbable(page)
  const view = await viewport(page)
  await drag(page, spot, 40, 30)
  await page.waitForTimeout(300)
  expect(await viewport(page)).toBe(view)
  const after = await cardCenter(page, spot.id)
  expect(Math.abs((after?.x ?? 0) - (spot.x + 40))).toBeLessThanOrEqual(LAND_PX)
  expect(Math.abs((after?.y ?? 0) - (spot.y + 30))).toBeLessThanOrEqual(LAND_PX)
})
