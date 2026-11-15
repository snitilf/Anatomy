/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers.ts'

const WORST = 'e2e/fixtures/worst-text.board.json'

/** Elements inside `root` whose box runs past the right edge of `root`. */
const pastRight = (page: Page, rootSelector: string) =>
  page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector)
    if (!root) return ['missing root']
    const edge = root.getBoundingClientRect().right + 1
    const bad: string[] = []
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('[hidden]') || getComputedStyle(el).position === 'absolute') continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > edge) bad.push(`${el.tagName}.${el.className}`)
    }
    return [root.scrollWidth > root.clientWidth ? 'root scrolls sideways' : '', ...bad].filter(Boolean)
  }, rootSelector)

for (const width of [1440, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('a part with unbreakable text stays inside the sidebar', async ({ page }) => {
      await open(page, WORST)
      await page.locator('.react-flow__node-card[data-id="long-nospace"]').click({ force: true })
      await expect(page.getByTestId('inspector').getByRole('heading', { level: 2 })).toBeVisible()
      expect(await pastRight(page, '[data-testid="inspector"]')).toEqual([])
    })

    test('the walkthrough bar keeps its buttons in view with a long caption', async ({ page }) => {
      await open(page, WORST)
      await page.keyboard.press('ControlOrMeta+k')
      const menu = page.getByRole('dialog', { name: 'Command menu' })
      await menu.getByRole('combobox').fill('Play')
      await menu.getByRole('option', { name: /^Play/ }).first().click()
      const bar = page.getByRole('region', { name: /^Walkthrough: / })
      await expect(bar).toBeVisible()
      expect(await pastRight(page, '[aria-label^="Walkthrough: "]')).toEqual([])
      await expect(bar.getByRole('button', { name: /next/i })).toBeInViewport()
    })
  })
}
