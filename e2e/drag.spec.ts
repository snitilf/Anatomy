/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { cardTransform, grabbable, nextFrame, open } from './helpers.ts'

const BOARD_FILE = 'src/examples/example.board.json'

test('Escape during a drag puts the card back and keeps the selection', async ({ page }) => {
  await open(page, BOARD_FILE)
  const inspector = page.getByRole('complementary', { name: 'Sidebar' })
  const spot = await grabbable(page)
  const start = await cardTransform(page, spot.id)

  await page.mouse.move(spot.x, spot.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(spot.x + i * 8, spot.y + i * 5)
    await nextFrame(page)
  }
  expect(await cardTransform(page, spot.id)).not.toBe(start)
  const heading = await inspector.getByRole('heading', { level: 2 }).innerText()

  await page.keyboard.press('Escape')
  await nextFrame(page)
  expect(await cardTransform(page, spot.id)).toBe(start)
  // The pointer is still down: moving on must not bring the card back.
  await page.mouse.move(spot.x + 150, spot.y + 90)
  await nextFrame(page)
  expect(await cardTransform(page, spot.id)).toBe(start)
  await page.mouse.up()

  expect(await cardTransform(page, spot.id)).toBe(start)
  // Escape did not clear the selection.
  await expect(inspector.getByRole('heading', { level: 2 })).toHaveText(heading)
  await page.reload()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  expect(await cardTransform(page, spot.id)).toBe(start)
})

test('dragging a card during a walkthrough keeps the panel and never dims the held card', async ({ page }) => {
  await open(page, BOARD_FILE)
  const inspector = page.getByRole('complementary', { name: 'Sidebar' })
  await inspector.getByRole('button', { name: 'Play Approve and simulate' }).click()
  const player = page.getByRole('region', { name: 'Walkthrough: Approve and simulate' })
  await expect(player.getByText('1 / 5')).toBeVisible()
  await page.waitForTimeout(400)

  const dimmedCard = page.locator('.react-flow__node-card:has([data-dimmed="true"])').first()
  await expect(dimmedCard).toBeVisible()
  const id = (await dimmedCard.getAttribute('data-id')) ?? ''
  const box = (await dimmedCard.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const heading = await inspector.getByRole('heading', { level: 2 }).innerText()

  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x + i * 6, y + i * 4)
    await nextFrame(page)
  }
  await expect(page.locator(`.react-flow__node-card[data-id="${id}"] [data-dimmed="true"]`)).toHaveCount(0)
  await page.mouse.up()

  await expect(inspector.getByRole('heading', { level: 2 })).toHaveText(heading)
  await expect(player).toBeVisible()
})

const EDGE_BOARDS = [
  { name: 'Example example', file: 'src/examples/example.board.json' },
  { name: 'Anatomy example', file: 'src/examples/anatomy.board.json' },
  { name: 'URL shortener', file: 'src/examples/external/url-shortener.board.json' },
]

for (const board of EDGE_BOARDS) {
  test(`no connection disappears for a frame while a card is held: ${board.name}`, async ({ page }) => {
    await open(page, board.file)
    const edges = page.locator('.react-flow__edge')
    const total = await edges.count()
    expect(total).toBeGreaterThan(0)
    const spot = await grabbable(page)

    await page.mouse.move(spot.x, spot.y)
    await page.mouse.down()
    // Sweep the card around so that every one of its lines changes the side it leaves from, more than once.
    const counts: number[] = []
    const path = (i: number) => {
      const t = (i / 90) * Math.PI * 2
      return { x: spot.x + Math.sin(t) * 260, y: spot.y + (1 - Math.cos(t)) * 110 }
    }
    for (let i = 1; i <= 90; i++) {
      const at = path(i)
      await page.mouse.move(at.x, at.y)
      counts.push(await page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(document.querySelectorAll('.react-flow__edge').length)))))
    }
    await page.mouse.up()
    expect(Math.min(...counts)).toBe(total)
    await nextFrame(page)
    await expect(edges).toHaveCount(total)
  })
}

interface Pair {
  from: { id: string; x: number; y: number }
  to: { id: string; x: number; y: number }
}

/** A card with a reachable handle, and a different card whose middle is not covered by anything else. */
async function linkPair(page: import('@playwright/test').Page): Promise<Pair> {
  const pair = await page.evaluate(() => {
    const map = document.querySelector('.react-flow')?.getBoundingClientRect()
    if (!map) return undefined
    const inside = (x: number, y: number) => x > map.left + 20 && x < map.right - 120 && y > map.top + 20 && y < map.bottom - 120
    const cards = [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')]
    const middles = cards.flatMap((node) => {
      const r = node.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const hit = document.elementFromPoint(x, y)
      return inside(x, y) && hit && node.contains(hit) ? [{ node, id: node.dataset.id ?? '', x, y }] : []
    })
    for (const from of middles) {
      // A dot sits half outside its card, so only part of it takes the press. Find a point that does.
      for (const handle of from.node.querySelectorAll<HTMLElement>('.react-flow__handle.source')) {
        const h = handle.getBoundingClientRect()
        for (const fx of [0.15, 0.5, 0.85]) {
          for (const fy of [0.15, 0.5, 0.85]) {
            const hx = h.left + h.width * fx
            const hy = h.top + h.height * fy
            const top = document.elementFromPoint(hx, hy)
            const to = middles.find((m) => m.id !== from.id)
            if (to && inside(hx, hy) && top && handle.contains(top)) {
              return { from: { id: from.id, x: hx, y: hy }, to: { id: to.id, x: to.x, y: to.y } }
            }
          }
        }
      }
    }
    return undefined
  })
  if (!pair) throw new Error('no pair of cards can be linked on this board')
  return pair
}

const BOARDS_FOR_LINKS = [
  { name: 'sixteen parts', file: 'e2e/fixtures/sixteen-parts.board.json' },
  { name: 'Anatomy example', file: 'src/examples/anatomy.board.json' },
]

for (const board of BOARDS_FOR_LINKS) {
  test(`a link dropped on the middle of another card joins them: ${board.name}`, async ({ page }) => {
    await open(page, board.file)
    const inspector = page.getByRole('complementary', { name: 'Sidebar' })
    const pair = await linkPair(page)
    const mine = page.locator('.react-flow__edge[data-id^="manual:"]')
    const before = await mine.count()

    await page.mouse.move(pair.from.x, pair.from.y)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(pair.from.x + ((pair.to.x - pair.from.x) * i) / 12, pair.from.y + ((pair.to.y - pair.from.y) * i) / 12)
      await nextFrame(page)
    }
    await page.mouse.up()

    await expect(inspector.getByRole('heading', { name: 'Link', level: 2 })).toBeVisible()
    await expect(mine).toHaveCount(before + 1)
    await expect(page.getByText('Link added')).toBeVisible()
  })

  test(`a link dropped on empty space does nothing and keeps the selection: ${board.name}`, async ({ page }) => {
    await open(page, board.file)
    const inspector = page.getByRole('complementary', { name: 'Sidebar' })
    const pair = await linkPair(page)
    const mine = page.locator('.react-flow__edge[data-id^="manual:"]')
    const before = await mine.count()
    // Pick a part first, so a stray reselect of the board would show.
    await page.mouse.click(pair.to.x, pair.to.y)
    const heading = await inspector.getByRole('heading', { level: 2 }).innerText()

    const empty = await page.evaluate(() => {
      const map = document.querySelector('.react-flow')!.getBoundingClientRect()
      for (let y = map.top + 40; y < map.bottom - 120; y += 20) {
        for (let x = map.left + 40; x < map.right - 120; x += 20) {
          const hit = document.elementFromPoint(x, y)
          if (hit?.classList.contains('react-flow__pane') || hit?.closest('.react-flow__pane') === hit) return { x, y }
        }
      }
      return undefined
    })
    expect(empty).toBeDefined()
    await page.mouse.move(pair.from.x, pair.from.y)
    await page.mouse.down()
    await page.mouse.move(empty!.x, empty!.y, { steps: 8 })
    await page.mouse.up()
    await nextFrame(page)
    await expect(inspector.getByRole('heading', { level: 2 })).toHaveText(heading)
    await expect(mine).toHaveCount(before)
  })
}
