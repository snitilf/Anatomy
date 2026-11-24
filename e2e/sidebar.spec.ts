import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { open } from './helpers.ts'
import { everyState, seedFolder } from './states.ts'

const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const REFUND = 'e2e/fixtures/refund-approval.board.json'
const STATES = ['Not sent', 'Sent', 'Answered', 'Adopted', 'Declined', 'Possibly outdated', 'Needs relinking']

async function openStates(page: Page) {
  const { text, layer } = await everyState()
  await seedFolder(page, text, layer)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await page.waitForTimeout(400)
}

test.describe('the Overview page order', () => {
  test('goal, then scope, then Start here, then the numbers and the parts, and the first three fit the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SHORTENER)
    await page.getByRole('tab', { name: 'Overview' }).click()
    const overview = page.getByTestId('overview')
    const top = async (locator: import('@playwright/test').Locator) => (await locator.boundingBox())!.y
    const goal = await top(overview.locator('p').first())
    const scope = await top(overview.getByRole('heading', { name: 'Scope' }))
    const start = await top(overview.getByRole('heading', { name: 'Start here' }))
    const revision = await top(overview.getByText('Revision', { exact: true }))
    const parts = await top(overview.getByRole('heading', { name: /^Parts/ }))
    expect(goal).toBeLessThan(scope)
    expect(scope).toBeLessThan(start)
    expect(start).toBeLessThan(revision)
    expect(revision).toBeLessThan(parts)
    // Scope and the first walkthrough are on the screen the page opens on, with no scrolling.
    await expect(overview.getByRole('heading', { name: 'Scope' })).toBeInViewport()
    await expect(overview.getByRole('button', { name: /^Play / }).first()).toBeInViewport()
  })
})

test.describe('the Source row', () => {
  for (const [label, words] of [
    ['request and policy', 'Agent explanation'],
    ['decision and version', 'Proposal, not decided'],
  ] as const) {
    test(`a connection whose source says "${words}" shows its Source row`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await open(page, REFUND)
      await page.keyboard.press('ControlOrMeta+k')
      await page.getByRole('combobox').fill(label)
      await page.getByRole('option', { name: new RegExp(`^${label}`) }).click()
      const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
      await expect(sidebar.getByRole('heading', { name: label })).toBeVisible()
      const row = sidebar.locator('dl > div').filter({ has: page.getByText('Source', { exact: true }) })
      await expect(row).toHaveCount(1)
      await expect(row).toContainText(words)
    })
  }
})

test.describe('the line key button', () => {
  test('shows a key, not a question mark that reads as Help', async ({ page }) => {
    await open(page, SHORTENER)
    const button = page.getByRole('button', { name: 'Line key' })
    await expect(button.locator('svg.lucide-key-round')).toHaveCount(1)
    await expect(button.locator('svg.lucide-circle-help, svg.lucide-circle-question-mark')).toHaveCount(0)
  })
})

test.describe('the status key', () => {
  test('lists the seven states with their glyphs, words, and meanings, and a key press opens and closes it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openStates(page)
    const trigger = page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: 'Status key' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const key = page.getByRole('dialog', { name: 'Status key' })
    await expect(key).toBeVisible()
    const rows = key.getByRole('listitem')
    await expect(rows).toHaveCount(STATES.length)
    for (const [i, word] of STATES.entries()) {
      await expect(rows.nth(i)).toContainText(word)
      await expect(rows.nth(i).locator('svg[data-state]')).toHaveCount(1)
    }
    const shapes = await rows.evaluateAll((all) => all.map((r) => r.querySelector('svg')?.innerHTML.replace(/id="[^"]*"|url\(#[^)]*\)/g, '')))
    expect(new Set(shapes).size).toBe(STATES.length)
    await page.keyboard.press('Escape')
    await expect(key).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('with reduced motion the key is fully shown at once and stays inside the window on a phone', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await openStates(page)
    // On a phone the sidebar is a sheet, and the board opens on the Overview or the map.
    const sheet = page.getByRole('region', { name: 'Sidebar' })
    await sheet.getByRole('button', { name: 'Status key' }).click()
    const key = page.getByRole('dialog', { name: 'Status key' })
    await expect(key).toBeVisible()
    expect(await key.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    const box = (await key.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
  })
})
