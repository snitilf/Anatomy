/// <reference lib="dom" />
import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const STEPS = 60

/** The stand-in repository folder, as the e2e build writes it (see src/workspace/testFolder.ts). */
const FOLDER_KEY = 'anatomy:test-folder'

export interface FolderFile {
  revision: number
  components: { id: string; label: string; summary: string; position?: unknown; lesson?: unknown }[]
  relationships: { id: string; from: string; to: string; label: string }[]
  responses?: unknown
  [key: string]: unknown
}

/** Opens the stand-in repository folder with `board.json` set to the given board file, the way Open folder does. */
export async function openStandInFolder(page: Page, file: string): Promise<FolderFile> {
  const text = await readFile(file, 'utf8')
  await page.addInitScript(
    ([key, body]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ name: 'project', files: { 'board.json': { text: body, lastModified: 1 } }, remembered: false }))
    },
    [FOLDER_KEY, text] as const,
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await page.waitForTimeout(400)
  return JSON.parse(text) as FolderFile
}

/** The text of a file in the stand-in folder, as the agent left it. */
export const standInFileText = (page: Page, name: string) =>
  page.evaluate(([key, file]) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { files: Record<string, { text: string }> }).files[file]?.text, [FOLDER_KEY, name] as const)

/** Writes a file into the stand-in folder, as the agent would. */
export const writeStandInFile = (page: Page, name: string, text: string) =>
  page.evaluate(
    ([key, file, body]) => {
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { files: Record<string, { text: string; lastModified: number }> }
      stored.files[file] = { text: body, lastModified: Date.now() }
      localStorage.setItem(key, JSON.stringify(stored))
    },
    [FOLDER_KEY, name, text] as const,
  )

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
  // Let the first fit and the first save settle. Until the reader first touches it, the opening view follows the layout
  // as the fonts load and the map is built again with its labels measured in them, so wait for the fonts and then for the
  // view to stand still.
  await page.waitForTimeout(400)
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  let last = ''
  for (let i = 0, same = 0; i < 40 && same < 3; i++) {
    await page.waitForTimeout(50)
    const now = await viewport(page)
    same = now === last ? same + 1 : 0
    last = now
  }
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
        if (crowded || x + move.dx > map.right - 120 || y + move.dy > map.bottom - 120 || x + move.dx < map.left + 20 || y + move.dy < map.top + 20) continue
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

export interface Pair {
  from: { id: string; x: number; y: number }
  to: { id: string; x: number; y: number }
}

/** A card with a reachable handle, and a different card whose middle is not covered by anything else. */
export async function linkPair(page: Page): Promise<Pair> {
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
