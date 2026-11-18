/// <reference lib="dom" />
import { expect, type Page } from '@playwright/test'

const STEPS = 60

export interface Spot {
  id: string
  x: number
  y: number
}

export async function open(page: Page, file: string) {
  await page.goto('/')
  await page.getByLabel('Board file').setInputFiles(file)
  // A crowded board opens on the Overview on a phone. These tests are about the map, so they go there.
  const overview = page.getByTestId('overview')
  const card = page.locator('.react-flow__node-card').first()
  await expect(page.getByRole('tab', { name: 'Map' }).or(page.getByRole('region', { name: 'Sidebar' })).first()).toBeVisible()
  await page.waitForTimeout(300)
  if (await overview.isVisible()) await page.getByRole('tab', { name: 'Map' }).click()
  await expect(card).toBeVisible()
  // Let the first fit and the first save settle.
  await page.waitForTimeout(400)
}

/**
 * A card whose middle is not covered by a label or another card, so a press there grabs it.
 * With `move`, also a card that has clear room at the place it is about to be dragged to, so the drop is not pushed aside.
 */
export async function grabbable(page: Page, move?: { dx: number; dy: number }): Promise<Spot> {
  const spot = await page.evaluate((move) => {
    const map = document.querySelector('.react-flow')?.getBoundingClientRect()
    const all = [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')]
    for (const node of all) {
      const r = node.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      if (!map || x < map.left + 20 || x > map.right - 120 || y < map.top + 20 || y > map.bottom - 120) continue
      if (move) {
        const room = 14
        const to = { left: r.left + move.dx - room, right: r.right + move.dx + room, top: r.top + move.dy - room, bottom: r.bottom + move.dy + room }
        const crowded = all.some((other) => {
          if (other === node) return false
          const o = other.getBoundingClientRect()
          return o.left < to.right && o.right > to.left && o.top < to.bottom && o.bottom > to.top
        })
        if (crowded || x + move.dx > map.right - 120 || y + move.dy > map.bottom - 120) continue
      }
      const hit = document.elementFromPoint(x, y)
      if (hit && node.contains(hit)) return { id: node.dataset.id ?? '', x, y }
    }
    return undefined
  }, move)
  if (!spot) throw new Error('no card can be grabbed on this board')
  return spot
}

export async function nextFrame(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
}

export async function startFrameLog(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean }
    w.__frames = []
    w.__stop = false
    let last = performance.now()
    const tick = (now: number) => {
      w.__frames.push(now - last)
      last = now
      if (!w.__stop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export async function stopFrameLog(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean }
    w.__stop = true
    return w.__frames.slice(1)
  })
}

export async function drag(page: Page, from: Spot, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(from.x + (dx * i) / STEPS, from.y + (dy * i) / STEPS)
    await nextFrame(page)
  }
  await page.mouse.up()
}

export const cardCenter = (page: Page, id: string) =>
  page.evaluate((cardId) => {
    const r = document.querySelector(`.react-flow__node-card[data-id="${cardId}"]`)?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined
  }, id)

export const cardTransform = (page: Page, id: string) =>
  page.evaluate((cardId) => (document.querySelector<HTMLElement>(`.react-flow__node-card[data-id="${cardId}"]`)?.style.transform ?? ''), id)

export const viewport = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '')

/**
 * Opens a part the way a person does now that the sidebar has no list: the Overview tab, then the part's row.
 * The map comes back with the part selected and the sidebar on it.
 */
export async function pickPart(page: Page, id: string) {
  const overview = page.getByTestId('overview')
  if ((await overview.count()) === 0) await page.getByRole('tab', { name: 'Overview' }).click()
  await overview.locator(`[data-row="part:${id}"]`).click()
  await expect(overview).toHaveCount(0)
}

/** Opens a connection from the command menu, where it is listed as "label: from to to". */
export async function pickConnection(page: Page, label: string) {
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill(label)
  await menu.getByRole('option', { name: new RegExp(`^${label}`) }).first().click()
  await expect(menu).toBeHidden()
}
