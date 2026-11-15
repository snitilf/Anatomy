/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers.ts'

const WORST = 'e2e/fixtures/worst-text.board.json'

/** Elements inside `root` whose visible box runs past the right edge of `root`, and whether `root` scrolls sideways. */
const pastRight = (page: Page, rootSelector: string) =>
  page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector)
    if (!root) return ['missing root']
    const edge = root.getBoundingClientRect().right + 1
    const bad: string[] = []
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('[hidden]')) continue
      let right = el.getBoundingClientRect().right
      // Whatever an ancestor clips does not count.
      for (let up = el.parentElement; up && up !== root; up = up.parentElement) {
        if (getComputedStyle(up).overflowX !== 'visible') right = Math.min(right, up.getBoundingClientRect().right)
      }
      if (el.getBoundingClientRect().width > 0 && right > edge) bad.push(`${el.tagName}.${el.className}`)
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

    test('rows of the overview end in an ellipsis instead of running past the sidebar', async ({ page }) => {
      await open(page, WORST)
      if (width > 800) await expect(page.getByTestId('inspector').getByRole('button', { name: /^approvedActionVersio/ }).first()).toBeVisible()
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
  await open(page, 'src/examples/nordet.board.json')
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
  await open(page, 'src/examples/nordet.board.json')
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
  await open(page, 'src/examples/nordet.board.json')
  const card = page.locator('.react-flow__node-card').first()
  const name = (await card.getAttribute('aria-label'))!
  expect(name.length).toBeLessThan(120)
  expect(name).toMatch(/, in /)
  expect((await card.getAttribute('aria-description'))!.length).toBeGreaterThan(20)
  await expect(page.locator('.react-flow h3')).toHaveCount(0)
  await expect(page.locator('[data-label]').first()).toHaveAttribute('aria-hidden', 'true')
})

test('a board with many parts opens fitted: every card is inside the map', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'e2e/fixtures/forty-parts.board.json')
  const outside = await page.evaluate(() => {
    const map = document.querySelector('.react-flow')!.getBoundingClientRect()
    return [...document.querySelectorAll('.react-flow__node-card')].filter((n) => {
      const r = n.getBoundingClientRect()
      return r.left < map.left - 1 || r.right > map.right + 1 || r.top < map.top - 1 || r.bottom > map.bottom + 1
    }).length
  })
  expect(outside).toBe(0)
})

/** Whether a point `gap` pixels outside the left edge of the button, at its middle height, still presses it. */
const pressesButton = (page: Page, name: string, gap: number) =>
  page.evaluate(
    ([label, away]) => {
      const button = document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!
      const r = button.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left - (away as number), r.top + r.height / 2)
      return hit === button || button.contains(hit)
    },
    [name, gap] as const,
  )

test('small controls answer the pointer in a larger area than they look', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'src/examples/nordet.board.json')
  expect(await pressesButton(page, 'Settings', 1)).toBe(true)
  expect(await pressesButton(page, 'Settings', 8)).toBe(false)
})

test.describe('on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the hit area of a control is at least 44 pixels', async ({ page }) => {
    await open(page, 'src/examples/nordet.board.json')
    const size = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hit').trim())
    expect(size).toBe('44px')
    const box = await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>('button[aria-label="Settings"]')!
      const r = button.getBoundingClientRect()
      const after = getComputedStyle(button, '::after')
      return { width: r.width + Math.abs(parseFloat(after.left)) * 2, height: r.height + Math.abs(parseFloat(after.top)) * 2 }
    })
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  })
})

test('every form field has a name or an id', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'src/examples/nordet.board.json')
  await page.locator('.react-flow__node-card').first().click({ force: true })
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Command menu' })).toBeVisible()
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('input, textarea, select')].filter((el) => !el.getAttribute('name') && !el.id).map((el) => el.outerHTML.slice(0, 80)))
  expect(unnamed).toEqual([])
})

test('the Send to agent tooltip does not come back when the popover closes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'src/examples/nordet.board.json')
  const trigger = page.getByRole('button', { name: /^Send to agent/ })
  await trigger.click()
  await expect(page.getByRole('dialog', { name: 'Send to agent' })).toBeVisible()
  await page.mouse.click(600, 500)
  await expect(page.getByRole('dialog', { name: 'Send to agent' })).toBeHidden()
  await page.waitForTimeout(700)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  // Escape returns focus to the button too.
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.waitForTimeout(700)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  // Opened and closed from the keyboard.
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('dialog', { name: 'Send to agent' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Send to agent' })).toBeHidden()
  await page.waitForTimeout(700)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test('a whiteboard tool shows its name and key on hover and on keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'src/examples/nordet.board.json')
  const pen = page.getByRole('button', { name: 'Pen', exact: true })
  await pen.hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('Pen')
  await expect(tip.locator('kbd')).toHaveText('P')
  await page.mouse.move(700, 300)
  await expect(tip).toHaveCount(0)
  await page.keyboard.press('Shift')
  await page.getByRole('button', { name: 'Hand', exact: true }).focus()
  await expect(page.getByRole('tooltip').filter({ hasText: 'Hand' })).toBeVisible()
})
