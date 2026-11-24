/// <reference lib="dom" />
import { expect, test } from './test.ts'
import { open, viewport } from './helpers.ts'

const FORTY = 'e2e/fixtures/forty-parts.board.json'
const CLAUDE = 'src/examples/claude-code-harness.board.json'

test.describe('detail levels with keyboard and reduced motion', () => {
  test('keyboard zoom steps across full, title, and far levels and updates hidden-detail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, FORTY)
    const map = page.locator('[data-detail]')
    const hidden = page.getByTestId('hidden-detail')

    // Opens fitted in the far view and says what is hidden.
    await expect(map).toHaveAttribute('data-detail', 'far')
    await expect(hidden).toBeVisible()

    // Shift+0 resets to 100% (full cards, nothing hidden).
    await page.keyboard.press('Shift+Digit0')
    await expect(map).toHaveAttribute('data-detail', 'full')
    await expect(hidden).toBeHidden()

    // Stepping down with keyboard zoom crosses into the title level (0.67).
    await page.keyboard.press('ControlOrMeta+Minus') // 0.8
    await page.keyboard.press('ControlOrMeta+Minus') // 0.67
    await expect(map).toHaveAttribute('data-detail', 'title')

    // Shift+1 fits the whole board again, back into the far view.
    await page.keyboard.press('Shift+1')
    await expect(map).toHaveAttribute('data-detail', 'far')
    await expect(hidden).toBeVisible()
  })

  test('under reduced motion, switching detail levels settles immediately at the end state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, FORTY)
    const map = page.locator('[data-detail]')
    const hidden = page.getByTestId('hidden-detail')

    await expect(map).toHaveAttribute('data-detail', 'far')
    await expect(hidden).toBeVisible()

    await page.keyboard.press('Shift+Digit0')
    const after = await viewport(page)
    await expect(map).toHaveAttribute('data-detail', 'full')
    await expect(hidden).toBeHidden()
    // No glide in flight: viewport stays at the same transform.
    await page.waitForTimeout(80)
    expect(await viewport(page)).toBe(after)

    await page.keyboard.press('Shift+1')
    await expect(map).toHaveAttribute('data-detail', 'far')
    await expect(hidden).toBeVisible()
  })

  test('a small window resize does not flip the detail level back and forth', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, CLAUDE)
    const map = page.locator('[data-detail]')
    const initial = await map.getAttribute('data-detail')
    expect(['full', 'title']).toContain(initial)
    for (const width of [1436, 1444, 1438, 1442]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(200)
      expect(await map.getAttribute('data-detail')).toBe(initial)
    }
  })
})
