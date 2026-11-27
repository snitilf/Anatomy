import { expect, test } from './test.ts'
import type { Page } from '@playwright/test'
import { open, pickPart } from './helpers.ts'

const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const SIXTY = 'e2e/fixtures/sixty-parts.board.json'

/** The ring a card on the map shows, or '' when it has none. */
const ring = (page: Page, id: string) =>
  page.evaluate((id) => {
    const card = document.querySelector(`.react-flow__node[data-id="${id}"] [data-card]`)
    return card ? getComputedStyle(card).boxShadow : ''
  }, id)

async function firstRow(page: Page) {
  const panel = page.getByTestId('inspector')
  const section = panel.getByRole('region', { name: 'Connections' })
  return (await section.count()) > 0 ? section.locator('li').first() : undefined
}

for (const [name, file] of [['url shortener', SHORTENER], ['sixty parts', SIXTY]] as const) {
  test(`hovering a flow row outlines the part and the line on the map, on ${name}`, async ({ page }) => {
    await open(page, file)
    // The part with the most lines on the board, so it has both kinds of row.
    const id = await page.evaluate(() => {
      const counts = new Map<string, number>()
      for (const g of document.querySelectorAll('g[data-ends]')) for (const end of (g.getAttribute('data-ends') ?? '').split(' ')) counts.set(end, (counts.get(end) ?? 0) + 1)
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    })
    expect(id).not.toBe('')
    await pickPart(page, id)
    const row = await firstRow(page)
    expect(row).toBeDefined()
    const target = await row!.evaluate((li) => li.querySelector('button')?.textContent ?? '')
    expect(target).not.toBe('')
    // Mark a card so a render of the map would show as a new element.
    await page.evaluate(() => {
      const card = document.querySelector('.react-flow__node [data-card]') as (HTMLElement & { __same?: boolean }) | null
      if (card) card.__same = true
    })
    await row!.hover()
    const lit = await page.evaluate(() => [...document.querySelectorAll('style')].some((s) => s.textContent?.includes('--accent-line') && s.textContent.includes('data-edge')))
    expect(lit).toBe(true)
    // Moving off the row clears it.
    await page.mouse.move(5, 5)
    const cleared = await page.evaluate(() => [...document.querySelectorAll('style')].some((s) => s.textContent?.includes('data-edge')))
    expect(cleared).toBe(false)
    const same = await page.evaluate(() => (document.querySelector('.react-flow__node [data-card]') as (HTMLElement & { __same?: boolean }) | null)?.__same === true)
    expect(same).toBe(true)
  })
}

test('keyboard focus on a row spotlights the other part, and blur clears it', async ({ page }) => {
  await open(page, SHORTENER)
  const first = await page.evaluate(() => document.querySelector('.react-flow__node-card')?.getAttribute('data-id') ?? '')
  await pickPart(page, first)
  const row = await firstRow(page)
  const button = row!.locator('button').first()
  await button.focus()
  const other = await page.evaluate(() => {
    const rule = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').find((t) => t.includes('[data-card]'))
    return /data-id="([^"]+)"/.exec(rule ?? '')?.[1] ?? ''
  })
  expect(other).not.toBe('')
  expect(await ring(page, other)).toContain('0px 0px 0px 2px')
  await button.blur()
  expect(await ring(page, other)).not.toContain('0px 0px 0px 2px')
})

test('a spotlight does not move the camera, even for a part out of view', async ({ page }) => {
  await open(page, SIXTY)
  const first = await page.evaluate(() => document.querySelector('.react-flow__node-card')?.getAttribute('data-id') ?? '')
  await pickPart(page, first)
  const before = await page.evaluate(() => document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '')
  const row = await firstRow(page)
  await row!.hover()
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '')
  expect(after).toBe(before)
})
