import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { open, pickPart, viewport } from './helpers.ts'

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const CLAUDE = 'src/examples/claude-code-harness.board.json'
const LLM = 'src/examples/how-an-llm-works.board.json'
const SIXTY_WALK = 'e2e/fixtures/sixty-parts-walkthrough.board.json'
const WORST = 'e2e/fixtures/worst-text.board.json'

interface RawBoard {
  components: { id: string }[]
  relationships: { id: string; from: string; to: string }[]
  scenarios: { id: string; title: string; steps: { highlight: string[] }[] }[]
}
const raw = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as RawBoard

/** The parts a step is about: what it names, and both ends of every line it follows. */
function focusOf(board: RawBoard, highlight: readonly string[]): string[] {
  const ids = new Set<string>()
  for (const id of highlight) {
    ids.add(id)
    const r = board.relationships.find((x) => x.id === id)
    if (r) {
      ids.add(r.from)
      ids.add(r.to)
    }
  }
  return [...ids].filter((id) => board.components.some((c) => c.id === id))
}

/** Records every value the map's camera state attribute takes from here on. */
async function watchCamera(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __camera?: string[] }
    const el = document.querySelector('.react-flow')
    if (!el) return
    w.__camera = [el.getAttribute('data-camera') ?? '']
    new MutationObserver(() => {
      const now = el.getAttribute('data-camera') ?? ''
      const seen = w.__camera
      if (seen && seen[seen.length - 1] !== now) seen.push(now)
    }).observe(el, { attributes: true, attributeFilter: ['data-camera'] })
  })
}

const cameraStates = (page: Page) => page.evaluate(() => (window as unknown as { __camera?: string[] }).__camera ?? [])

/** Waits on the map's settled state attribute, never on a clock. */
const settled = (page: Page) => expect(page.locator('.react-flow')).toHaveAttribute('data-camera', 'settled')

/** Which of these parts are fully inside the map now. */
const inside = (page: Page, ids: readonly string[]) =>
  page.evaluate(
    (ids: readonly string[]) => {
      const map = document.querySelector('.react-flow')!.getBoundingClientRect()
      return Object.fromEntries(
        ids.map((id) => {
          const r = document.querySelector(`.react-flow__node-card[data-id="${id}"]`)?.getBoundingClientRect()
          return [id, !!r && r.left >= map.left - 1 && r.right <= map.right + 1 && r.top >= map.top - 1 && r.bottom <= map.bottom + 1]
        }),
      )
    },
    ids,
  )

/** Zooms the map in around its middle with the wheel, the way a reader does. */
async function zoomIn(page: Page, times: number) {
  const map = (await page.locator('.react-flow').boundingBox())!
  for (let i = 0; i < times; i++) {
    await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2)
    await page.mouse.wheel(0, -120)
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(300)
}

/** What every tile a walkthrough step lights says in the far view: its own name, a tag above it, or both. */
const litTiles = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.react-flow__node')]
      .filter((n) => n.querySelector('[data-card][data-highlighted]'))
      .map((n) => ({
        id: n.getAttribute('data-id') ?? '',
        named: n.querySelector('[data-card]')!.hasAttribute('data-tile-name'),
        tag: !!n.querySelector('[data-name-tag]') && getComputedStyle(n.querySelector('[data-name-tag]')!).display !== 'none',
      })),
  )

const allInside = async (page: Page, board: RawBoard, highlight: readonly string[], where: string) => {
  const found = await inside(page, focusOf(board, highlight))
  for (const [id, ok] of Object.entries(found)) expect(ok, `${id} in view ${where}`).toBe(true)
}

/** Starts a walkthrough with the keyboard: the command menu, then Enter. */
async function play(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill(`Play ${title}`)
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  const bar = page.getByRole('region', { name: `Walkthrough: ${title}` })
  await expect(bar).toBeVisible()
  return bar
}

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' })

  for (const [name, file, scenarioId] of [
    ['url shortener', SHORTENER, 's-create-link'],
    ['refund approval', REFUND, 'approve-and-pay'],
    ['claude code harness', CLAUDE, 'fix-a-failing-test'],
    ['large language model', LLM, 'prompt-to-first-token'],
  ] as const) {
    test(`a step whose targets are in view leaves the camera still: ${name}`, async ({ page }) => {
      const board = raw(file)
      const scenario = board.scenarios.find((s) => s.id === scenarioId)!
      await open(page, file)
      await watchCamera(page)
      // The board opens fitted, so every step of the walkthrough is already in view.
      const before = await viewport(page)
      const bar = await play(page, scenario.title)
      await settled(page)
      expect(await viewport(page)).toBe(before)
      for (const [index, step] of scenario.steps.entries()) {
        if (index > 0) {
          await page.keyboard.press('ArrowRight')
          await expect(bar.getByText(`${index + 1} / ${scenario.steps.length}`)).toBeVisible()
          await settled(page)
          // The camera never moved.
          expect(await viewport(page)).toBe(before)
        }
        await allInside(page, board, step.highlight, `at step ${index + 1} of ${name}`)
      }
      // No step asked for a glide at any point.
      expect(await cameraStates(page)).toEqual(['settled'])
    })
  }

  test('a step whose targets are out of view glides to them', async ({ page }) => {
    const board = raw(REFUND)
    const scenario = board.scenarios.find((s) => s.id === 'approve-and-pay')!
    await open(page, REFUND)
    // A reader zooms in on one part, so the first step's parts are out of view.
    await pickPart(page, 'payout-ledger')
    const out = await inside(page, focusOf(board, scenario.steps[0]!.highlight))
    expect(Object.values(out).some((ok) => !ok)).toBe(true)
    await watchCamera(page)
    await play(page, scenario.title)
    const started = Date.now()
    await settled(page)
    // The camera glided, and the glide took about 300 ms, not no time at all.
    expect(await cameraStates(page)).toEqual(['settled', 'gliding', 'settled'])
    expect(Date.now() - started).toBeGreaterThanOrEqual(120)
    await allInside(page, board, scenario.steps[0]!.highlight, 'after the glide')
  })

  test('a second step mid-glide retargets the glide, it does not queue a second move', async ({ page }) => {
    const board = raw(SIXTY_WALK)
    const scenario = board.scenarios[0]!
    await open(page, SIXTY_WALK)
    const bar = await play(page, scenario.title)
    await settled(page)
    // A reader zooms in around the middle, so the steps' parts are out of view.
    await zoomIn(page, 12)
    const out = await inside(page, focusOf(board, scenario.steps[2]!.highlight))
    expect(Object.values(out).some((ok) => !ok)).toBe(true)
    await watchCamera(page)
    const seen = (await cameraStates(page)).length
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(bar.getByText('3 / 4')).toBeVisible()
    await settled(page)
    // One glide served both presses: the second retargeted it, or found its targets in the frame it was already
    // heading for. Either way the camera never finished one move and then ran another.
    const states = await cameraStates(page)
    expect(states.slice(seen)).toEqual(['gliding', 'settled'])
    await allInside(page, board, scenario.steps[2]!.highlight, 'after the retarget')
  })

  test('the followed line draws once and then rests', async ({ page }) => {
    const board = raw(REFUND)
    const scenario = board.scenarios.find((s) => s.id === 'approve-and-pay')!
    await open(page, REFUND)
    const bar = await play(page, scenario.title)
    // Step 2 follows two lines. Their ink and dash before the draw, to compare with after it.
    const before = await page.evaluate(() =>
      Object.fromEntries(
        ['request-to-policy-check', 'limit-to-policy-check'].map((id) => {
          const path = document.querySelector<SVGPathElement>(`.react-flow__edge[data-id="${id}"] path.react-flow__edge-path`)
          return [id, path ? getComputedStyle(path).strokeDasharray : '']
        }),
      ),
    )
    await page.keyboard.press('ArrowRight')
    await expect(bar.getByText('2 / 5')).toBeVisible()
    await settled(page)
    for (const id of ['request-to-policy-check', 'limit-to-policy-check']) {
      const path = page.locator(`.react-flow__edge[data-id="${id}"] path.react-flow__edge-path`)
      // The end state of the draw, by attribute: the line is whole.
      await expect(path).toHaveAttribute('data-drawn', 'done')
      // It rests: nothing on it keeps animating, and it keeps the ink and dash it had.
      expect(await path.evaluate((el) => el.getAnimations().length)).toBe(0)
      expect(await path.evaluate((el) => getComputedStyle(el).strokeDasharray)).toBe(before[id])
      expect(await path.evaluate((el) => getComputedStyle(el).strokeDashoffset)).toBe('0px')
    }
  })

  for (const [name, file, scenarioId, stepIndex, litParts, dimmedPart, lines] of [
    ['claude code harness', CLAUDE, 'fix-a-failing-test', 1, ['agent-loop', 'model', 'context-window'], 'permission-check', ['loop-to-context', 'loop-calls-model']],
    ['large language model', LLM, 'prompt-to-first-token', 0, ['tokenizer', 'context-window'], 'feed-forward', ['tokenizer-to-context']],
  ] as const) {
    test(`a step lights both ends of the lines it follows, with their labels: ${name}`, async ({ page }) => {
      const board = raw(file)
      const scenario = board.scenarios.find((s) => s.id === scenarioId)!
      await open(page, file)
      const bar = await play(page, scenario.title)
      for (let i = 0; i < stepIndex; i++) {
        await page.keyboard.press('ArrowRight')
        await expect(bar.getByText(`${i + 2} / ${scenario.steps.length}`)).toBeVisible()
      }
      await settled(page)
      // Every part the step lights, named or only the end of a followed line.
      for (const id of litParts) await expect(page.locator(`.react-flow__node-card[data-id="${id}"] [data-card]`)).toHaveAttribute('data-highlighted', 'true')
      // A part the step is not about stays dimmed.
      await expect(page.locator(`.react-flow__node-card[data-id="${dimmedPart}"] [data-card]`)).toHaveAttribute('data-dimmed', 'true')
      // The followed lines are lit, and their labels show whole.
      for (const id of lines) {
        await expect(page.locator(`.react-flow__edge[data-id="${id}"] g[data-edge]`)).toHaveAttribute('data-highlighted', 'true')
        const label = page.locator(`[data-label][data-edge="${id}"]`)
        await expect(label).toBeVisible()
        expect(await label.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
      }
    })
  }

  for (const [name, width, height, namedBranch] of [
    ['wide tiles name themselves', 1024, 768, true],
    ['narrow tiles keep the tag', 900, 700, false],
  ] as const) {
    test(`a lit tile never carries both its own name and a tag above it: ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      // The worst-text board: every card is wide, so just above the far view's small end its lit tiles name
      // themselves, and just below that size they are too narrow, and take the tag instead. Both windows open
      // in the far view.
      const board = raw(WORST)
      const scenario = board.scenarios[0]!
      await open(page, WORST)
      await expect(page.locator('[data-far]')).toHaveCount(1)
      await play(page, scenario.title)
      await settled(page)
      const lit = await litTiles(page)
      expect(lit.length).toBeGreaterThan(0)
      for (const tile of lit) {
        // A tile never says its name twice.
        expect(tile.named && tile.tag, `${tile.id} carries both its name and a tag`).toBe(false)
        expect(tile.named || tile.tag, `${tile.id} says its name some way`).toBe(true)
      }
      if (namedBranch) for (const tile of lit) expect(tile.named, `${tile.id} is wide enough to name itself`).toBe(true)
      else for (const tile of lit) expect(tile.tag, `${tile.id} carries the tag`).toBe(true)
    })
  }

  test('a lit tile of a sixty-part board keeps its tag in the far view', async ({ page }) => {
    const board = raw(SIXTY_WALK)
    const scenario = board.scenarios[0]!
    await open(page, SIXTY_WALK)
    const bar = await play(page, scenario.title)
    await page.keyboard.press('ArrowRight')
    await expect(bar.getByText('2 / 4')).toBeVisible()
    await settled(page)
    const lit = await litTiles(page)
    expect(lit.length).toBeGreaterThan(0)
    for (const tile of lit) {
      expect(tile.named, `${tile.id} is too small to name itself`).toBe(false)
      expect(tile.tag, `${tile.id} carries the tag`).toBe(true)
    }
  })
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a step out of view moves the camera at once, and the followed line never draws', async ({ page }) => {
    const board = raw(REFUND)
    const scenario = board.scenarios.find((s) => s.id === 'approve-and-pay')!
    await open(page, REFUND)
    await pickPart(page, 'payout-ledger')
    const out = await inside(page, focusOf(board, scenario.steps[0]!.highlight))
    expect(Object.values(out).some((ok) => !ok)).toBe(true)
    await watchCamera(page)
    const bar = await play(page, scenario.title)
    await settled(page)
    // The move was instant: no glide was ever in flight.
    expect(await cameraStates(page)).toEqual(['settled'])
    await allInside(page, board, scenario.steps[0]!.highlight, 'after the instant move')
    // The line of the next step rests whole from the start.
    await page.keyboard.press('ArrowRight')
    await expect(bar.getByText('2 / 5')).toBeVisible()
    await settled(page)
    const path = page.locator('.react-flow__edge[data-id="request-to-policy-check"] path.react-flow__edge-path')
    await expect(path).toHaveAttribute('data-drawn', 'still')
    expect(await path.evaluate((el) => el.getAnimations().length)).toBe(0)
  })
})
