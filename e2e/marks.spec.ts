/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { everyState, seedFolder } from './states.ts'

const AT = '2026-11-14T00:00:00.000Z'

/** The URL shortener with a part the user proposed, a link to it, and a link between two parts of the agent's. */
async function openWithMarks(page: Page) {
  const { text, layer } = await everyState()
  const own = layer as unknown as Record<string, unknown>
  own.notes = []
  own.answers = []
  own.proposals = [{ id: 'part-ratelimit1', label: 'Rate limiter', summary: 'Caps how many links one visitor can create.', x: 1400, y: 0, width: 240, height: 112, createdAt: AT }]
  own.links = [
    { id: 'link-mine00001', from: 'web-form', to: 'link-cache', label: 'Warms the cache', createdAt: AT },
    { id: 'link-mine00002', from: 'create-endpoint', to: 'part-ratelimit1', label: 'Asks first', createdAt: AT },
  ]
  await seedFolder(page, text, own)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await expect(page.locator('.react-flow__node[data-id="part-ratelimit1"] svg rect')).toBeAttached()
}

/** The dash of an SVG element as drawn, in screen pixels: each length times the zoom of the map. */
const dashOnScreen = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const el = document.querySelector<SVGGraphicsElement>(selector)
    if (!el) return undefined
    const zoom = Number(/scale\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '')?.[1] ?? 1)
    const dash = getComputedStyle(el).strokeDasharray
    return dash === 'none' ? [] : dash.split(/[\s,]+/).map((d) => Math.round(parseFloat(d) * zoom * 10) / 10)
  }, selector)

const hexToRgb = (hex: string) => {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** A system color, as the page computes it. */
const systemColor = (page: Page, name: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('span')
    probe.style.color = name
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, name)

const accent = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()).then(hexToRgb)

const proposalEdge = '.react-flow__node[data-id="part-ratelimit1"] svg rect'
const userLink = '.react-flow__edge g[data-mine] path.react-flow__edge-path'

test("the user's link and the user's part share one dash and dot, which no agent line or card has", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openWithMarks(page)
  await page.getByRole('button', { name: /reset to 100%/ }).click()
  await expect(page.getByRole('button', { name: /^Zoom 100%/ })).toBeVisible()

  // Near: the part the user proposed has no border of its own, only the dash and dot. A proposal of the agent's has plain dashes.
  await expect.poll(() => dashOnScreen(page, proposalEdge)).toEqual([7, 3, 1.5, 3])
  await expect.poll(() => dashOnScreen(page, userLink)).toEqual([7, 3, 1.5, 3])
  const userCard = page.locator('.react-flow__node[data-id="part-ratelimit1"] [data-yours]')
  await expect(userCard).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('.react-flow__node[data-id="link-store"] [data-card]')).toHaveCSS('border-top-style', 'dashed')
  const agentDashes = await page.evaluate(() =>
    [...document.querySelectorAll<SVGPathElement>('.react-flow__edge g:not([data-mine]) path.react-flow__edge-path')].map((p) => getComputedStyle(p).strokeDasharray),
  )
  expect(agentDashes.length).toBeGreaterThan(0)
  for (const dash of agentDashes) expect(dash.replace(/px|,/g, '')).not.toBe('7 3 1.5 3')

  // Selected, the part keeps its dash and dot, in the accent.
  await page.getByRole('complementary').getByRole('button', { name: /^Rate limiter/ }).first().click()
  await expect(page.locator('.react-flow__node[data-id="part-ratelimit1"]')).toHaveClass(/selected/)
  await expect(page.locator(proposalEdge)).toHaveCSS('stroke', await accent(page))
  expect((await dashOnScreen(page, proposalEdge))?.length).toBe(4)
})

test('a part of the user that was just clicked keeps the accent edge while the pointer stays on it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openWithMarks(page)
  // Bring the part into view at a readable zoom, then click it on the map and leave the pointer there.
  await page.getByRole('complementary').getByRole('button', { name: /^Rate limiter/ }).first().click()
  await page.keyboard.press('Escape')
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })
  await page.getByRole('complementary').getByRole('button', { name: /^Rate limiter/ }).first().click()
  await page.keyboard.press('Shift+Digit2')
  const node = page.locator('.react-flow__node[data-id="part-ratelimit1"]')
  await expect.poll(async () => (await node.boundingBox())?.width ?? 0).toBeGreaterThan(150)
  await page.keyboard.press('Escape')
  await expect(node).not.toHaveClass(/selected/)
  // At rest under the pointer the edge deepens; once clicked it is the accent, with the pointer still on it.
  await node.hover()
  await expect(page.locator(proposalEdge)).not.toHaveCSS('stroke', await accent(page))
  await node.click()
  await expect(node).toHaveClass(/selected/)
  await expect(page.locator(proposalEdge)).toHaveCSS('stroke', await accent(page))
})

test('with forced colors the edge of the user part keeps its gaps, in system colors, and a proposal of the agent keeps its dashes', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await openWithMarks(page)
  await page.getByRole('button', { name: /reset to 100%/ }).click()
  const userCard = page.locator('.react-flow__node[data-id="part-ratelimit1"] [data-yours]')
  // No border to show through the gaps; the card keeps its size with the padding.
  await expect(userCard).toHaveCSS('border-top-width', '0px')
  await expect(userCard).toHaveCSS('padding-top', '13px')
  await expect(page.locator(proposalEdge)).toHaveCSS('stroke', await systemColor(page, 'CanvasText'))
  await expect.poll(() => dashOnScreen(page, proposalEdge)).toEqual([7, 3, 1.5, 3])
  await expect(page.locator('.react-flow__node[data-id="link-store"] [data-card]')).toHaveCSS('border-top-style', 'dashed')
  await page.getByRole('complementary').getByRole('button', { name: /^Rate limiter/ }).first().click()
  await expect(page.locator(proposalEdge)).toHaveCSS('stroke', await systemColor(page, 'Highlight'))
})

test("in the far view the user's part, a bundle of their links, and their link on a selected part keep the dash and dot on screen", async ({ page }) => {
  // Narrow enough that the whole board fits only in the far view.
  await page.setViewportSize({ width: 900, height: 640 })
  await openWithMarks(page)
  await page.getByRole('button', { name: 'Fit board' }).click()
  await expect(page.locator('[data-far]').first()).toBeVisible()

  // On screen the lengths stay near their size at 100%, whatever the zoom (the scale is rounded in steps).
  const near = (dash: number[] | undefined) => dash !== undefined && dash.length === 4 && Math.abs(dash[0]! - 7) < 1.5 && Math.abs(dash[2]! - 1.5) < 0.5
  await expect.poll(async () => near(await dashOnScreen(page, proposalEdge))).toBe(true)
  await expect.poll(async () => near(await dashOnScreen(page, 'path[data-bundle][data-mine]'))).toBe(true)
  // A bundle of the agent's lines is solid.
  expect(await dashOnScreen(page, 'path[data-bundle]:not([data-mine])')).toEqual([])
  // A bundle that holds a link of the user's among the agent's lines carries one dash and dot of theirs on its count.
  const mixed = page.getByRole('button', { name: /1 yours/ })
  await expect(mixed).toHaveCount(1)
  await expect(mixed.locator('svg line')).toHaveAttribute('stroke-dasharray', '7 3 1.5 3')

  // Selecting a part brings its own lines in, solid. The user's link keeps its dash and dot.
  await page.locator('.react-flow__node[data-id="web-form"]').click()
  await expect(page.locator('.react-flow__node[data-id="web-form"]')).toHaveClass(/selected/)
  await expect.poll(async () => near(await dashOnScreen(page, '.react-flow__edge g[data-mine][data-ends~="web-form"] path.react-flow__edge-path'))).toBe(true)
  expect(await dashOnScreen(page, '.react-flow__edge g[data-active]:not([data-mine])[data-ends~="web-form"] path.react-flow__edge-path')).toEqual([])
})
