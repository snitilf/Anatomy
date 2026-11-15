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

    test('a connection between long-named parts keeps its Move end buttons inside the sidebar, with the full name on hover', async ({ page }) => {
      await open(page, WORST)
      await page.locator('.react-flow__node-card[data-id="long-nospace"]').click({ force: true })
      await page.getByTestId('inspector').getByRole('region', { name: 'Flow' }).getByRole('button', { name: /^approvedActionVersio/ }).first().click()
      const from = page.getByTestId('inspector').getByRole('button', { name: 'From', exact: true })
      await expect(from).toBeVisible()
      await expect(from).toHaveAttribute('title', /^From: Authentication_/)
      expect(await pastRight(page, '[data-testid="inspector"]')).toEqual([])
      // On the map the selected label stays within two lines and a capped width.
      const pill = (await page.locator('[data-label][data-selected]').boundingBox())!
      expect(pill.width).toBeLessThanOrEqual(221 * 1.0)
      expect(pill.height).toBeLessThanOrEqual(2 * 16 + 6 + 4)
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

test('a sticky with more words than fit fades at the bottom, and a short one does not', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'src/examples/example.board.json')
  const map = (await page.locator('.react-flow').boundingBox())!
  const make = async (text: string, dy: number) => {
    await page.keyboard.press('s')
    await page.mouse.click(map.x + map.width - 200, map.y + dy)
    await page.keyboard.insertText(text)
    await page.keyboard.press('Escape')
  }
  await make('word '.repeat(200), 120)
  await make('Short', 520)
  await expect(page.locator('[data-clipped]')).toHaveCount(1)
  await expect(page.locator('[data-clipped]')).toHaveText(/^word word/)
})

test('a long note is held to six lines until Show more', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'src/examples/example.board.json')
  await page.locator('.react-flow__node-card').first().click({ force: true })
  const panel = page.getByTestId('inspector')
  await panel.getByRole('textbox', { name: /note/i }).fill(Array.from({ length: 60 }, (_, i) => `Line ${i} of a very long note.`).join('\n'))
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  const text = panel.locator('p[data-clamped]')
  await expect(text).toBeVisible()
  expect((await text.boundingBox())!.height).toBeLessThan(6 * 22)
  await panel.getByRole('button', { name: 'Show more' }).click()
  await expect(panel.locator('p[data-clamped]')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Show less' })).toBeVisible()
})

test('with many problems the error panel keeps its count and Dismiss in view while the list scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByLabel('Board file').setInputFiles('e2e/fixtures/many-errors.board.json')
  const panel = page.getByRole('alert')
  await expect(panel.getByText(/^\d+ problems$/)).toBeVisible()
  await panel.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect(panel.getByRole('button', { name: 'Dismiss' })).toBeInViewport()
  const head = (await panel.getByRole('heading').boundingBox())!
  const box = (await panel.boundingBox())!
  expect(head.y).toBeGreaterThanOrEqual(box.y)
  await panel.getByRole('button', { name: 'Dismiss' }).click()
  await expect(panel).toBeHidden()
})

test('a card is named by its label and group, its summary is the description, and a connection is read once', async ({ page }) => {
  await open(page, 'src/examples/example.board.json')
  const card = page.locator('.react-flow__node-card').first()
  const name = (await card.getAttribute('aria-label'))!
  expect(name.length).toBeLessThan(120)
  expect(name).toMatch(/, in /)
  expect((await card.getAttribute('aria-description'))!.length).toBeGreaterThan(20)
  await expect(page.locator('.react-flow h3')).toHaveCount(0)
  await expect(page.locator('[data-label]').first()).toHaveAttribute('aria-hidden', 'true')
})
