/// <reference lib="dom" />
import type { Page } from '@playwright/test'
import { open, viewport } from './helpers.ts'
import { expect, test } from './test.ts'

const EXAMPLES = [
  { name: 'anatomy', file: 'src/examples/anatomy.board.json' },
  { name: 'claude-code-harness', file: 'src/examples/claude-code-harness.board.json' },
  { name: 'how-an-llm-works', file: 'src/examples/how-an-llm-works.board.json' },
]

const FIXTURES = ['url-shortener', 'refund-approval', 'sixteen-parts', 'forty-parts', 'sixty-parts', 'sixty-parts-walkthrough', 'worst-text'].map((name) => ({
  name,
  file: `e2e/fixtures/${name}.board.json`,
}))

const SIZES = [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]

interface FarNameCheck {
  detail: string | null
  shown: number
  hidden: string[]
  overlaps: string[]
  /** For each name that reaches onto its block: the color under its foot inside the block, and the block's wash. */
  feet: { label: string; x: number; y: number; wash: [number, number, number] }[]
}

/** Measures every far-view group name on the map against the part tiles, the name tags that stay up, the counts, the other names, and the bundled lines. */
function inspectFarNames(page: Page): Promise<FarNameCheck> {
  return page.evaluate(() => {
    type Box = { left: number; top: number; right: number; bottom: number }
    const hit = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    const detail = document.querySelector('[data-detail]')?.getAttribute('data-detail') ?? null

    const all = [...document.querySelectorAll<HTMLElement>('button[data-far-label]')].map((el) => ({
      el,
      label: el.getAttribute('title') ?? '',
      box: el.getBoundingClientRect(),
      // A name left off the map takes no room on it.
      hidden: getComputedStyle(el).opacity === '0',
    }))
    const names = all.filter((n) => !n.hidden)
    const tiles = [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')].map((node) => ({
      id: node.dataset.id ?? '',
      box: (node.querySelector<HTMLElement>('[data-card]') ?? node).getBoundingClientRect(),
    }))
    // The name tags of the tiles that are lit by a walkthrough step or selected, which stay up over the map.
    const tags = [...document.querySelectorAll<HTMLElement>('.react-flow__node [class*="tip"]')]
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => ({ label: el.textContent ?? '', box: el.getBoundingClientRect() }))
    const counts = [...document.querySelectorAll<HTMLElement>('button[data-bundle]')].map((el) => ({ label: el.getAttribute('aria-label') ?? '', box: el.getBoundingClientRect() }))
    const bundles = [...document.querySelectorAll<SVGPathElement>('[data-unit] path[data-bundle]')].map((path) => {
      const unit = path.closest<HTMLElement>('[data-unit]')?.dataset.unit ?? ''
      const m = path.getScreenCTM()
      const total = path.getTotalLength()
      const half = Math.max(1, Number.parseFloat(getComputedStyle(path).strokeWidth) * (m ? Math.abs(m.a) : 1)) / 2
      const samples: Box[] = []
      if (m && total > 0) {
        const steps = Math.max(8, Math.ceil((total * Math.abs(m.a)) / 2))
        for (let i = 0; i <= steps; i++) {
          const p = path.getPointAtLength((total * i) / steps)
          const x = p.x * m.a + m.e
          const y = p.y * m.d + m.f
          samples.push({ left: x - half, right: x + half, top: y - half, bottom: y + half })
        }
      }
      return { unit, samples }
    })

    const overlaps: string[] = []
    for (const [i, name] of names.entries()) {
      for (const tile of tiles) if (hit(name.box, tile.box)) overlaps.push(`${name.label} covers tile ${tile.id}`)
      for (const tag of tags) if (hit(name.box, tag.box)) overlaps.push(`the tag of ${tag.label} covers ${name.label}`)
      for (const count of counts) if (hit(name.box, count.box)) overlaps.push(`${name.label} covers count "${count.label}"`)
      for (const other of names.slice(i + 1)) if (hit(name.box, other.box)) overlaps.push(`${name.label} covers name ${other.label}`)
      for (const b of bundles) if (b.samples.some((s) => hit(name.box, s))) overlaps.push(`${name.label} covers bundle ${b.unit}`)
    }

    // The wash of a block is drawn over the map's ground. Mix the two the way the screen does.
    const rgb = (fg: string, bg: string): [number, number, number] => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 1, 1)
      ctx.fillStyle = fg
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!]
    }
    const ground = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    const areas = [...document.querySelectorAll<HTMLElement>('.react-flow__node-group-area > div')].map((el) => ({ box: el.getBoundingClientRect(), wash: rgb(getComputedStyle(el).backgroundColor, ground) }))
    // The foot of a name: its bottom row of pixels, in the leading under its letters, where it lies over a block.
    const feet: FarNameCheck['feet'] = []
    for (const name of names) {
      const y = Math.floor(name.box.bottom) - 1
      const area = areas.find((a) => y > a.box.top + 1 && y < a.box.bottom - 1 && name.box.left < a.box.right - 4 && name.box.right > a.box.left + 4)
      if (area) feet.push({ label: name.label, x: Math.round((Math.max(name.box.left, area.box.left) + Math.min(name.box.right, area.box.right)) / 2), y, wash: area.wash })
    }

    return { detail, shown: names.length, hidden: all.filter((n) => n.hidden).map((n) => n.label), overlaps, feet }
  })
}

/** The color of one pixel of the page, read from a screenshot. */
async function pixel(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } })
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0]!, d[1]!, d[2]!] as [number, number, number]
  }, png.toString('base64'))
}

/** Zooms out until the map is in the far view, or as far as the camera goes. Returns whether it got there. */
async function toFar(page: Page): Promise<boolean> {
  const map = page.locator('[data-detail]')
  const out = page.getByRole('button', { name: 'Zoom out' })
  for (let i = 0; i < 10 && (await map.getAttribute('data-detail')) !== 'far'; i++) {
    if (!(await out.isVisible()) || !(await out.isEnabled())) break
    await out.click()
    await page.waitForTimeout(250)
  }
  if ((await map.getAttribute('data-detail')) !== 'far') return false
  // Let the zoom settle and the names find their places at its scale.
  let last = ''
  for (let i = 0, same = 0; i < 40 && same < 3; i++) {
    await page.waitForTimeout(50)
    const now = await viewport(page)
    same = now === last ? same + 1 : 0
    last = now
  }
  return true
}

/** Checks that a name that reaches onto its block shows the block's wash under it, not the map's ground. */
async function expectWash(page: Page, result: FarNameCheck, board: string) {
  for (const foot of result.feet) {
    const got = await pixel(page, foot.x, foot.y)
    const off = Math.max(...got.map((c, i) => Math.abs(c - foot.wash[i]!)))
    expect(off, `${foot.label} on ${board}: rgb(${got.join(',')}) under its foot, block wash rgb(${foot.wash.join(',')})`).toBeLessThanOrEqual(3)
  }
}

/** Checks that no name covers a tile, a count, another name, or a bundle, and that a name on its block shows the block's wash. */
async function expectClearNames(page: Page, board: string) {
  const result = await inspectFarNames(page)
  expect(result.detail).toBe('far')
  expect(result.shown, `names shown on ${board}`).toBeGreaterThan(0)
  expect(result.overlaps, `overlaps on ${board}`).toEqual([])
  await expectWash(page, result, board)
  return result
}

test.describe('far-view group names keep clear of tiles, tags, counts, and bundles', () => {
  for (const size of SIZES) {
    for (const board of [...EXAMPLES, ...FIXTURES]) {
      test(`${size.width}x${size.height}: ${board.name}`, async ({ page }) => {
        await page.setViewportSize(size)
        await open(page, board.file)
        const far = await toFar(page)
        // A phone always opens far. A wider window reaches the far view only when the camera may zoom out that far.
        if (size.width === 390) expect(far).toBe(true)
        test.skip(!far, 'the camera does not reach the far view at this size')
        const result = await expectClearNames(page, board.name)
        // On the built-in examples every group keeps its name on the map.
        if (EXAMPLES.includes(board)) expect(result.hidden, `names left off ${board.name}`).toEqual([])
      })
    }
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`a name on its block shows the block's wash in the ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width: 390, height: 844 })
      await open(page, 'src/examples/how-an-llm-works.board.json')
      const result = await inspectFarNames(page)
      expect(result.detail).toBe('far')
      expect(result.feet.length).toBeGreaterThan(0)
      await expectWash(page, result, 'how-an-llm-works')
    })
  }

  test('during a walkthrough at 1024 px, no name covers a tile, a count, or a bundle, and no tag of a lit tile covers a name', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await open(page, 'src/examples/claude-code-harness.board.json')
    await page.getByRole('button', { name: /Fix a failing test/ }).first().click()
    const map = page.locator('[data-detail]')
    let checked = 0
    for (let step = 1; step <= 6; step++) {
      await expect(page.getByText(new RegExp(`^${step} / 6$`))).toBeVisible()
      await page.waitForTimeout(900)
      if ((await map.getAttribute('data-detail')) === 'far') {
        await expectClearNames(page, `step ${step}`)
        checked++
      }
      if (step < 6) await page.keyboard.press('ArrowRight')
    }
    expect(checked).toBeGreaterThan(0)
  })

  test('keyboard: a name left off the map shows while it has focus, and Enter zooms into its group', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // At this size one group of this board has no free place for its name.
    await open(page, 'e2e/fixtures/worst-text.board.json')
    const map = page.locator('[data-detail]')
    await expect(map).toHaveAttribute('data-detail', 'far')
    const name = page.locator('button[data-far-label]').filter({ has: page.getByText('認証と課金') })
    await expect(name).toHaveCSS('opacity', '0')
    await page.keyboard.press('Tab')
    await name.focus()
    await expect(name).toBeFocused()
    await expect(name).toHaveCSS('opacity', '1')
    await page.keyboard.press('Enter')
    await expect(map).not.toHaveAttribute('data-detail', 'far')
  })

  test('reduced motion: activating a far-view group name settles immediately', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, 'src/examples/claude-code-harness.board.json')
    const map = page.locator('[data-detail]')
    await expect(map).toHaveAttribute('data-detail', 'far')
    await page.locator('button[data-far-label]').first().click()
    await expect(map).not.toHaveAttribute('data-detail', 'far')
    const after = await viewport(page)
    await page.waitForTimeout(80)
    expect(await viewport(page)).toBe(after)
  })
})
