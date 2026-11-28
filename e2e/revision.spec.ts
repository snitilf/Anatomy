/// <reference lib="dom" />
/**
 * A new revision keeps the map still (M19a): surviving cards hold their places, a new part lands beside a neighbor, what
 * changed carries a marker in words, a removed part leaves a ghost, and "Tidy layout" lays the board out again with undo.
 */
import { readFile, writeFile } from 'node:fs/promises'
import type { Page, TestInfo } from '@playwright/test'
import { expect, test } from './test.ts'
import { open } from './helpers.ts'

const BOARDS = ['e2e/fixtures/refund-approval.board.json', 'e2e/fixtures/url-shortener.board.json', 'src/examples/claude-code-harness.board.json']

interface Part {
  id: string
  label: string
  summary: string
  group?: string
  position?: unknown
  lesson?: unknown
}
interface Line {
  id: string
  from: string
  to: string
  label: string
}
interface BoardFile {
  revision: number
  components: Part[]
  relationships: Line[]
  items?: unknown[]
  scenarios?: unknown[]
}

/** Takes the gone IDs out of a list of steps or items: a string that names one, and an entry that is about one. */
function scrub(value: unknown, gone: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((v) => !(typeof v === 'string' && gone.has(v)) && !(v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).some((x) => typeof x === 'string' && gone.has(x))))
      .map((v) => scrub(v, gone))
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, gone)]))
  return value
}

/**
 * Writes the next revision: a part added next to a neighbor, a part removed with everything that names it, a surviving connection
 * with a new label, and a surviving part with a new summary.
 */
async function revise(file: string, testInfo: TestInfo, extra = 0) {
  const board = JSON.parse(await readFile(file, 'utf8')) as BoardFile
  const next = structuredClone(board)
  next.revision += 1
  const removed = next.components[next.components.length - 1]!
  const gone = new Set([removed.id, ...next.relationships.filter((r) => r.from === removed.id || r.to === removed.id).map((r) => r.id)])
  next.components = next.components.filter((c) => c !== removed)
  next.relationships = next.relationships.filter((r) => !gone.has(r.id))
  next.items = scrub(next.items ?? [], gone) as unknown[]
  next.scenarios = scrub(next.scenarios ?? [], gone) as unknown[]
  const anchor = next.components.find((c) => next.relationships.some((r) => r.from === c.id))!
  const line = next.relationships.find((r) => r.from !== anchor.id && r.to !== anchor.id) ?? next.relationships[0]!
  line.label = `${line.label} again`
  const summarized = next.components.find((c) => c !== anchor && c.id !== line.from && c.id !== line.to)!
  summarized.summary = `${summarized.summary} Now with a second step.`
  const { position: _p, lesson: _l, ...base } = anchor
  next.components.push({ ...base, id: 'added-in-revision', label: 'Added in revision', summary: 'A part the next revision adds.' })
  next.relationships.push({ ...structuredClone(next.relationships[0]!), id: 'added-line', from: anchor.id, to: 'added-in-revision', label: 'hands over to' })
  for (let i = 0; i < extra; i++) {
    next.components.push({ ...base, id: `extra-${i}`, label: `Extra part ${i}`, summary: 'Another part the next revision adds.' })
    next.relationships.push({ ...structuredClone(next.relationships[0]!), id: `extra-line-${i}`, from: anchor.id, to: `extra-${i}`, label: 'also hands over to' })
  }
  const path = testInfo.outputPath(`revision-${next.revision}.board.json`)
  await writeFile(path, JSON.stringify(next))
  return { path, board, removed, line, summarized, anchor }
}

/** Where every card sits on the board, from its transform, which is in board units and does not change with the camera. */
const places = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')].map((n) => {
        const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(n.style.transform)
        return [n.dataset.id ?? '', { x: Number(m?.[1]), y: Number(m?.[2]) }]
      }),
    ),
  )

async function openRevision(page: Page, path: string, revision: number) {
  await page.getByLabel('Board file').setInputFiles(path)
  await expect(page.getByRole('status', { name: 'Revision update' })).toContainText(`Revision ${revision}:`)
}

async function command(page: Page, name: string) {
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill(name)
  await expect(menu.getByRole('option', { name: new RegExp(`^${name}`) }).first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
}

const part = (page: Page, label: string) => page.getByRole('group', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(,|$)`) })

test.use({ viewport: { width: 1440, height: 900 } })

for (const file of BOARDS) {
  test(`a new revision of ${file.split('/').pop()} keeps every card still and marks what changed`, async ({ page }, testInfo) => {
    await open(page, file)
    const before = await places(page)
    const { path, board, removed, line, summarized } = await revise(file, testInfo)
    await openRevision(page, path, board.revision + 1)
    const revision = board.revision + 1

    // No card that survives moves on the board.
    const after = await places(page)
    for (const [id, at] of Object.entries(before)) if (id !== removed.id) expect(after[id], id).toEqual(at)

    // The new part is marked in words, on the card and for a screen reader.
    const added = part(page, 'Added in revision')
    await expect(added).toBeVisible()
    await expect(added.getByText('New', { exact: true })).toBeVisible()
    await expect(added).toHaveAttribute('aria-description', new RegExp(`^New in revision ${revision}\\.`))
    const changed = part(page, summarized.label)
    await expect(changed.getByText('Changed', { exact: true })).toBeVisible()
    await expect(changed).toHaveAttribute('aria-description', new RegExp(`^Changed in revision ${revision}: summary\\.`))

    // So are the connections.
    await expect(page.getByTestId('rf__edge-added-line')).toHaveAttribute('aria-label', new RegExp(`New in revision ${revision}\\.$`))
    await expect(page.locator('[data-edge-revision][data-edge="added-line"]').getByText('New', { exact: true })).toBeVisible()
    await expect(page.getByTestId(`rf__edge-${line.id}`)).toHaveAttribute('aria-label', new RegExp(`Changed in revision ${revision}: label\\.$`))
    await expect(page.locator(`[data-edge-revision][data-edge="${line.id}"]`).getByText('Changed', { exact: true })).toBeVisible()
    // A connection's tab never sits on a card.
    const onCards = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.react-flow__node-card, .react-flow__node-ghost')].map((n) => n.getBoundingClientRect())
      return [...document.querySelectorAll<HTMLElement>('[data-edge-revision]')].flatMap((tab) => {
        const t = tab.getBoundingClientRect()
        return cards.some((c) => t.left < c.right && t.right > c.left && t.top < c.bottom && t.bottom > c.top) ? [tab.dataset.edge] : []
      })
    })
    expect(onCards).toEqual([])

    // The removed part is a faint ghost where it was.
    const ghost = page.getByRole('img', { name: `${removed.label}, removed in revision ${revision}` })
    await expect(ghost).toBeVisible()
    await expect(ghost.getByText('Removed', { exact: true })).toBeVisible()
    const look = await ghost.evaluate((n) => ({ opacity: Number(getComputedStyle(n.querySelector('[data-ghost]')!).opacity), at: (n as HTMLElement).style.transform }))
    expect(look.opacity).toBeLessThan(0.7)
    expect(look.at).toBe(`translate(${before[removed.id]!.x}px, ${before[removed.id]!.y}px)`)

    // Mark reviewed clears every marker and the ghost, and moves nothing.
    await command(page, 'Mark reviewed')
    await expect(page.locator('[data-revision], [data-edge-revision]')).toHaveCount(0)
    await expect(ghost).toHaveCount(0)
    await expect(added).not.toHaveAttribute('aria-description', /^New in revision/)
    expect(await places(page)).toEqual(after)
  })
}

test('Tidy layout lays the board out again from the keyboard, and undo puts every card back', async ({ page }, testInfo) => {
  const file = BOARDS[2]!
  await open(page, file)
  const { path, board } = await revise(file, testInfo, 3)
  await openRevision(page, path, board.revision + 1)
  const kept = await places(page)
  await command(page, 'Tidy layout')
  await expect(page.getByText('Layout tidied')).toBeVisible()
  await expect.poll(async () => JSON.stringify(await places(page))).not.toBe(JSON.stringify(kept))
  const tidy = await places(page)
  // A second tidy has nothing to do.
  await command(page, 'Tidy layout')
  await expect(page.getByText('The layout is already tidy')).toBeVisible()
  expect(await places(page)).toEqual(tidy)
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => JSON.stringify(await places(page))).toBe(JSON.stringify(kept))
  // The undo closes the toast, so its Undo cannot reach a step before the tidy, and the board is framed whole again.
  await expect(page.getByText('Layout tidied')).toBeHidden()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = document.querySelector('.react-flow')!.getBoundingClientRect()
        return [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')]
          .filter((n) => {
            const r = n.getBoundingClientRect()
            return r.left < map.left || r.top < map.top || r.right > map.right || r.bottom > map.bottom
          })
          .map((n) => n.dataset.id)
      }),
    )
    .toEqual([])
})

test('a new part with no room in its group tidies the layout, says so, and Undo puts every card back', async ({ page }, testInfo) => {
  const file = 'src/examples/how-an-llm-works.board.json'
  await open(page, file)
  const before = await places(page)
  const board = JSON.parse(await readFile(file, 'utf8')) as BoardFile
  const next = structuredClone(board)
  next.revision += 1
  const { position: _p, lesson: _l, ...base } = next.components.find((c) => c.id === 'sampling')!
  next.components.push({ ...base, id: 'stop-check', label: 'Stop check', summary: 'Decides when the answer is done.' })
  next.relationships.push({ ...structuredClone(next.relationships[0]!), id: 'sampling-to-stop', from: 'sampling', to: 'stop-check', label: 'each token' })
  const path = testInfo.outputPath('no-room.board.json')
  await writeFile(path, JSON.stringify(next))
  await page.getByLabel('Board file').setInputFiles(path)
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Layout tidied to make room for new parts' })
  await expect(toast).toBeVisible()
  await expect(part(page, 'Stop check')).toBeVisible()
  // The banner and the toast say different things in different places: one toast, and the two never overlap.
  const banner = page.getByRole('status', { name: 'Revision update' })
  await expect(banner).toContainText('Revision 2: 1 new part, 1 new connection.')
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)
  const [a, b] = await Promise.all([banner.boundingBox(), toast.boundingBox()])
  expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y)
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => {
    const now = await places(page)
    return Object.keys(before).every((id) => now[id]?.x === before[id]!.x && now[id]?.y === before[id]!.y)
  }).toBe(true)
  await expect(part(page, 'Stop check')).toBeVisible()
})

test('a sticky note on a card stays on it through a new revision and Tidy layout', async ({ page }, testInfo) => {
  const file = BOARDS[0]!
  await open(page, file)
  const { path, board, removed } = await revise(file, testInfo)
  const target = (await page.evaluate(
    (skip) =>
      [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')]
        .filter((n) => n.dataset.id !== skip)
        .map((n) => ({ id: n.dataset.id ?? '', box: n.getBoundingClientRect().toJSON() as DOMRect }))
        .find(({ box }) => box.left > 40 && box.top > 120 && box.right < 1000),
    removed.id,
  ))!
  await page.keyboard.press('s')
  await page.mouse.click(target.box.left + 20, target.box.top + 12)
  await page.keyboard.type('Who owns this?')
  await page.keyboard.press('Escape')
  const sticky = page.locator('.react-flow__node-mark-sticky')
  await expect(sticky).toHaveText('Who owns this?')
  const offset = () =>
    page.evaluate((id) => {
      const at = (el: Element | null) => {
        const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec((el as HTMLElement | null)?.style.transform ?? '')
        return { x: Number(m?.[1]), y: Number(m?.[2]) }
      }
      const s = at(document.querySelector('.react-flow__node-mark-sticky'))
      const c = at(document.querySelector(`.react-flow__node-card[data-id="${id}"]`))
      return { x: s.x - c.x, y: s.y - c.y }
    }, target.id)
  const on = await offset()
  await openRevision(page, path, board.revision + 1)
  expect(await offset()).toEqual(on)
  await command(page, 'Tidy layout')
  await expect(page.getByText('Layout tidied')).toBeVisible()
  await expect.poll(offset).toEqual(on)
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a revision shows its markers and ghost at rest, with nothing animating', async ({ page }, testInfo) => {
    const file = BOARDS[0]!
    await open(page, file)
    const { path, board, removed } = await revise(file, testInfo)
    await page.getByLabel('Board file').setInputFiles(path)
    const added = part(page, 'Added in revision')
    await expect(added.getByText('New', { exact: true })).toBeVisible()
    const state = await page.evaluate(() => ({
      running: document.getAnimations().filter((a) => a.playState === 'running' && a instanceof CSSAnimation).length,
      card: Number(getComputedStyle(document.querySelector('.react-flow__node-card[data-id="added-in-revision"] [data-card]')!).opacity),
      transform: getComputedStyle(document.querySelector('.react-flow__node-card[data-id="added-in-revision"] [data-card]')!).transform,
    }))
    expect(state).toEqual({ running: 0, card: 1, transform: 'none' })
    await expect(page.getByRole('img', { name: `${removed.label}, removed in revision ${board.revision + 1}` })).toBeVisible()
  })
})
