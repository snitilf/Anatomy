/// <reference lib="dom" />
import { readFile } from 'node:fs/promises'
import { expect, test } from './test.ts'
import type { Page } from '@playwright/test'

// The key src/workspace/testFolder.ts reads: a stand-in repository folder kept in localStorage.
const KEY = 'anatomy:test-folder'

interface StoredLayer {
  marks: { kind: string; text?: string; from?: { type: string }; to?: { type: string } }[]
  proposals: { id: string; label: string }[]
  links: { from: string; to: string }[]
  reconnects: unknown[]
}

const storedLayer = (page: Page) =>
  page.evaluate((key) => {
    const files = (JSON.parse(localStorage.getItem(key) ?? '{}') as { files: Record<string, { text: string }> }).files
    return files['layer.json'] ? (JSON.parse(files['layer.json'].text) as StoredLayer) : undefined
  }, KEY)

async function openFolder(page: Page, file: string) {
  const board = await readFile(file, 'utf8')
  await page.addInitScript(
    ([key, text]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ name: 'repo', files: { 'board.json': { text, lastModified: 1 } }, remembered: false }))
    },
    [KEY, board] as const,
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await page.waitForTimeout(400)
}

const boxOf = async (page: Page, selector: string) => {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`nothing at ${selector}`)
  return box
}

const cards = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')].map((n) => {
      const r = n.getBoundingClientRect()
      return { id: n.dataset.id ?? '', x: r.x, y: r.y, width: r.width, height: r.height }
    }),
  )

/** A point in the middle of a connection's drawn line, on screen, for a connection that does not touch `away`. */
const onConnection = (page: Page, away: string) =>
  page.evaluate((card) => {
    const map = document.querySelector('.react-flow')?.getBoundingClientRect()
    const path = [...document.querySelectorAll<SVGPathElement>('.react-flow__edge-relationship path.react-flow__edge-path')].find((p) => {
      if (p.closest('[data-ends]')?.getAttribute('data-ends')?.split(' ').includes(card)) return false
      const at = p.getPointAtLength(p.getTotalLength() / 2)
      const m = p.getScreenCTM()
      const x = m ? at.x * m.a + m.e : -1
      return map !== undefined && x > map.left + 20 && x < map.right - 20
    })
    if (!path) throw new Error('no connection')
    const at = path.getPointAtLength(path.getTotalLength() / 2)
    const m = path.getScreenCTM()
    if (!m) throw new Error('no transform')
    return { x: at.x * m.a + m.e, y: at.y * m.d + m.f, id: path.closest<SVGElement>('.react-flow__edge')?.dataset.id ?? '' }
  }, away)

async function dragLine(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
}

test('the whiteboard: draw, write, propose, re-point, undo, and everything comes back after a reload', async ({ page }) => {
  // Wide enough that the refund board opens fitted whole, with every card in the open.
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFolder(page, 'e2e/fixtures/refund-approval.board.json')
  const map = await boxOf(page, '.react-flow')
  const toolbar = page.getByRole('toolbar', { name: 'Whiteboard tools' })
  await expect(toolbar).toBeVisible()

  // A pen stroke. The pen stays in hand afterwards.
  await page.keyboard.press('p')
  await expect(toolbar.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true')
  const start = { x: map.x + 80, y: map.y + map.height - 120 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (let i = 1; i <= 30; i++) await page.mouse.move(start.x + i * 5, start.y + Math.sin(i / 4) * 20)
  await page.mouse.up()
  await expect(page.locator('[data-mark]')).toHaveCount(1)
  await expect(toolbar.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true')

  // A rectangle around two cards. The tool goes back to Select after one use.
  await toolbar.getByRole('button', { name: 'Rectangle' }).click()
  const shown = (await cards(page)).filter((x) => x.x > map.x && x.x + x.width < map.x + map.width - 20)
  const [a, b, c] = shown
  if (!a || !b || !c) throw new Error('the board needs three cards in view')
  const left = Math.min(a.x, b.x) - 16
  const top = Math.min(a.y, b.y) - 16
  await dragLine(page, { x: left, y: top }, { x: Math.max(a.x + a.width, b.x + b.width) + 16, y: Math.max(a.y + a.height, b.y + b.height) + 16 })
  await expect(page.locator('[data-mark]')).toHaveCount(2)
  await expect(toolbar.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('complementary').getByText('Around')).toBeVisible()

  // An arrow from a card to a connection.
  await page.keyboard.press('a')
  const line = await onConnection(page, c.id)
  await dragLine(page, { x: c.x + c.width / 2, y: c.y + c.height / 2 }, line)
  await expect(page.locator('[data-mark]')).toHaveCount(3)
  await expect(page.getByRole('complementary').getByText(/^From/)).toBeVisible()

  // The arrow follows nothing while its card is in hand, and is back when the drag is cancelled.
  const grab = { x: c.x + c.width / 2, y: c.y + c.height / 2 }
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 40, grab.y + 30, { steps: 4 })
  await expect(page.locator('[data-mark]')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-mark]')).toHaveCount(3)
  await page.mouse.up()
  await expect(page.locator('[data-mark]')).toHaveCount(3)

  // A sticky note with words on it.
  await page.keyboard.press('s')
  await page.mouse.click(map.x + map.width - 160, map.y + 120)
  await page.keyboard.type('Who owns the clock?')
  await page.keyboard.press('Escape')
  await expect(page.locator('.react-flow__node-mark-sticky')).toHaveText('Who owns the clock?')

  // A new part, then a link from it to a part.
  await page.keyboard.press('n')
  await page.mouse.click(map.x + map.width - 200, map.y + map.height - 120)
  await page.keyboard.type('Rate limiter')
  await page.keyboard.press('Escape')
  const proposal = page.locator('.react-flow__node-proposal')
  await expect(proposal).toContainText('Rate limiter')
  await proposal.hover()
  const handle = await boxOf(page, '.react-flow__node-proposal .react-flow__handle-left')
  await dragLine(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: a.x + a.width / 2, y: a.y + a.height / 2 }, 16)
  await expect(page.locator('.react-flow__edge-manual-link')).toHaveCount(1)

  // Re-point a connection end onto another part, then undo it.
  await page.locator(`[data-label][data-edge="${line.id}"]`).click()
  const to = await boxOf(page, '[data-end="to"] circle')
  const ends = (await page.locator(`[data-label][data-edge="${line.id}"]`).getAttribute('data-ends'))?.split(' ') ?? []
  const other = (await cards(page)).find((x) => !ends.includes(x.id) && x.x + x.width < map.x + map.width - 20)
  if (!other) throw new Error('no free card')
  await dragLine(page, { x: to.x + to.width / 2, y: to.y + to.height / 2 }, { x: other.x + other.width / 2, y: other.y + other.height / 2 }, 16)
  await expect(page.locator(`[data-label][data-edge="${line.id}"][data-edited]`)).toBeVisible()
  await expect.poll(async () => (await storedLayer(page))?.reconnects.length).toBe(1)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator(`[data-label][data-edge="${line.id}"][data-edited]`)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.locator(`[data-label][data-edge="${line.id}"][data-edited]`)).toBeVisible()

  // Everything is saved to the folder and comes back after a reload.
  await expect
    .poll(async () => {
      const layer = await storedLayer(page)
      return layer && [layer.marks.map((m) => m.kind).sort().join(','), layer.proposals.length, layer.links.length, layer.reconnects.length]
    })
    .toEqual(['arrow,rect,sticky,stroke', 1, 1, 1])
  const layer = await storedLayer(page)
  const arrow = layer?.marks.find((m) => m.kind === 'arrow')
  expect(arrow?.from?.type).toBe('part')
  expect(arrow?.to?.type).toBe('relationship')
  await expect(page.locator('[data-save-state="saved"]')).toBeAttached()
  await page.reload()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await expect(page.locator('[data-mark]')).toHaveCount(3)
  await expect(page.locator('.react-flow__node-mark-sticky')).toHaveText('Who owns the clock?')
  await expect(page.locator('.react-flow__node-proposal')).toContainText('Rate limiter')
  await expect(page.locator('.react-flow__edge-manual-link')).toHaveCount(1)
  // The moved connection is drawn where the user put it, over its dimmed original.
  await expect(page.locator(`[data-label][data-edge="${line.id}"][data-edited]`)).toHaveCount(1)
  await expect(page.locator(`.react-flow__edge[data-id="${line.id}"] path[class*="ghost"]`)).toHaveCount(1)
})

test('a mark is selected, moved, and deleted, and undo brings it back', async ({ page }) => {
  await openFolder(page, 'e2e/fixtures/url-shortener.board.json')
  const map = await boxOf(page, '.react-flow')
  await page.keyboard.press('o')
  await dragLine(page, { x: map.x + 60, y: map.y + map.height - 200 }, { x: map.x + 220, y: map.y + map.height - 100 })
  const mark = page.locator('[data-mark]')
  await expect(mark).toHaveAttribute('data-selected', 'true')
  const before = await mark.boundingBox()
  // The ellipse's line, on its left edge.
  await dragLine(page, { x: map.x + 60, y: map.y + map.height - 150 }, { x: map.x + 140, y: map.y + map.height - 190 }, 8)
  const after = await mark.boundingBox()
  expect(Math.round((after?.x ?? 0) - (before?.x ?? 0))).toBe(80)
  await page.keyboard.press('Backspace')
  await expect(mark).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(mark).toHaveCount(1)
})

test('Escape and V return to Select, Space pans with any tool, and the tool bar is gone while a walkthrough plays', async ({ page }) => {
  await openFolder(page, 'src/examples/anatomy.board.json')
  const toolbar = page.getByRole('toolbar', { name: 'Whiteboard tools' })
  await page.keyboard.press('r')
  await expect(page.locator('[data-draw-surface]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-draw-surface]')).toHaveCount(0)
  await page.keyboard.press('p')
  await page.keyboard.down(' ')
  await expect(toolbar.getByRole('button', { name: 'Hand' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-draw-surface]')).toHaveCount(0)
  await page.keyboard.up(' ')
  await expect(toolbar.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('v')
  await expect(toolbar.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: /^Play / }).first().click()
  await expect(toolbar).toHaveCount(0)
})

test('phones only view the map: no tool bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFolder(page, 'e2e/fixtures/refund-approval.board.json')
  await expect(page.getByRole('toolbar', { name: 'Whiteboard tools' })).toBeHidden()
})

test('the command menu on a phone has no drawing tools and no shortcuts, and a drawing key does nothing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFolder(page, 'e2e/fixtures/refund-approval.board.json')
  // The key a phone with a keyboard could press: nothing starts, and the tool bar is still on Select at a wide width.
  await page.keyboard.press('p')
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await expect(menu).toBeVisible()
  await expect(menu.getByText('Tools', { exact: true })).toHaveCount(0)
  await expect(menu.locator('kbd')).toHaveCount(0)
  await menu.getByRole('combobox').fill('pen')
  await expect(menu.getByRole('option', { name: /^Pen/ })).toHaveCount(0)
  await menu.getByRole('combobox').fill('sticky')
  await expect(menu.getByRole('option', { name: /^Sticky note/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('toolbar', { name: 'Whiteboard tools' }).getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
  // The same menu on a wide screen still has them.
  await page.keyboard.press('ControlOrMeta+k')
  await expect(menu.getByText('Tools', { exact: true })).toBeVisible()
  await expect(menu.getByRole('option', { name: /^Pen/ })).toBeVisible()
  await expect(menu.locator('kbd').first()).toBeVisible()
})

test('a tool picked on a wide window is put down when the window shrinks to a phone, and Select is on after it widens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFolder(page, 'e2e/fixtures/refund-approval.board.json')
  const toolbar = page.getByRole('toolbar', { name: 'Whiteboard tools' })
  await toolbar.getByRole('button', { name: 'Pen' }).click()
  await expect(page.locator('[data-draw-surface]')).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  // No tool bar and no Select command on a phone, so nothing may stay on: taps must not draw.
  await expect(page.locator('[data-draw-surface]')).toHaveCount(0)
  await expect(toolbar).toBeHidden()
  await expect(page.locator('[data-tool]').first()).toHaveAttribute('data-tool', 'select')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(toolbar.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
  await expect(toolbar.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'false')
})

test('Hand picked on a wide window is put down on a phone too', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFolder(page, 'e2e/fixtures/refund-approval.board.json')
  const toolbar = page.getByRole('toolbar', { name: 'Whiteboard tools' })
  await toolbar.getByRole('button', { name: 'Hand' }).click()
  await expect(page.locator('[data-tool]').first()).toHaveAttribute('data-tool', 'hand')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('[data-tool]').first()).toHaveAttribute('data-tool', 'select')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(toolbar.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
})

test.describe('coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 1440, height: 900 } })

  test('each toolbar button owns its visible edges', async ({ page }) => {
    await openFolder(page, 'e2e/fixtures/refund-approval.board.json')
    const buttons = page.getByRole('toolbar', { name: 'Whiteboard tools' }).getByRole('button')
    expect(await buttons.count()).toBeGreaterThan(1)
    for (const button of await buttons.all()) {
      expect(await button.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return [r.left + 1, r.right - 1].every((x) => el.contains(document.elementFromPoint(x, r.top + r.height / 2)))
      })).toBe(true)
    }
  })
})

test('a proposal uses its label as name and summary as description', async ({ page }) => {
  const board = await readFile('e2e/fixtures/refund-approval.board.json', 'utf8')
  const boardId = (JSON.parse(board) as { id: string }).id
  const layer = { format: 'anatomy-layer', schemaVersion: 2, boardId, positions: {}, sizes: {}, notes: [], links: [], marks: [], proposals: [{ id: 'part-aaaaaa', label: 'Rate limiter', summary: 'Limits incoming requests', x: 0, y: 0, width: 240, height: 140, createdAt: '2026-11-13T00:00:00.000Z' }], reconnects: [], archive: [] }
  await page.addInitScript(([key, text, layerText]) => {
    localStorage.setItem(key, JSON.stringify({ name: 'repo', files: { 'board.json': { text, lastModified: 1 }, 'layer.json': { text: layerText, lastModified: 1 } }, remembered: false }))
  }, [KEY, board, JSON.stringify(layer)] as const)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  const proposal = page.locator('.react-flow__node-proposal')
  await expect(proposal).toHaveAttribute('aria-label', 'Rate limiter')
  await expect(proposal).toHaveAttribute('aria-description', 'Limits incoming requests')
  await expect(proposal.locator('h3')).toHaveCount(0)
})
