/// <reference lib="dom" />
import { expect, test } from './test.ts'
import type { Page } from '@playwright/test'
import { open, viewport } from './helpers.ts'

const RP_LOOP = 'src/canvas/fixtures/rp-loop.board.json'

test.use({ reducedMotion: 'reduce' })

for (const size of [
  { width: 390, height: 844, far: true },
  { width: 1440, height: 900, far: false },
]) {
  test(`Fit keeps every drawn line and card of the loop board inside the map at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await open(page, RP_LOOP)
    await page.keyboard.press('Shift+1')
    // With reduced motion the end state is immediate: the view stops changing.
    let last = ''
    await expect
      .poll(async () => {
        const now = await viewport(page)
        const same = now === last
        last = now
        return same
      })
      .toBe(true)
    const outside = await insideMap(page)
    expect(outside.far).toBe(size.far)
    expect(outside.drawn).toBeGreaterThan(0)
    expect(outside.bad).toEqual([])
  })
}

async function insideMap(page: Page) {
  return page.evaluate(() => {
      const map = document.querySelector('.react-flow')!.getBoundingClientRect()
      const far = document.querySelector('[data-hover-scope][data-far]') !== null
      const paths = far
        ? [...document.querySelectorAll<SVGPathElement>('[data-unit] path[data-hit]')]
        : [...document.querySelectorAll<SVGPathElement>('.react-flow__edge-path')]
      const cards = [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')]
      const bad: string[] = []
      for (const el of [...paths, ...cards]) {
        const r = el.getBoundingClientRect()
        if (r.left < map.left - 1 || r.right > map.right + 1 || r.top < map.top - 1 || r.bottom > map.bottom + 1) bad.push(`${el.closest('[data-unit]')?.getAttribute('data-unit') ?? el.getAttribute('data-id') ?? el.id}`)
      }
      return { far, drawn: paths.length + cards.length, bad }
  })
}

test('Fit frames the lines of the board that was opened last, not the one before', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, 'e2e/fixtures/forty-parts.board.json')
  await page.getByLabel('Board file').setInputFiles(RP_LOOP)
  await expect(page.getByRole('button', { name: 'Fit board' })).toBeVisible()
  await page.keyboard.press('Shift+1')
  let last = ''
  await expect
    .poll(async () => {
      const now = await viewport(page)
      const same = now === last
      last = now
      return same
    })
    .toBe(true)
  const outside = await insideMap(page)
  expect(outside.drawn).toBeGreaterThan(0)
  expect(outside.bad).toEqual([])
})
