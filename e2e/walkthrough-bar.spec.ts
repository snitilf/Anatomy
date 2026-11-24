import { expect, test } from './test.ts'
import { open } from './helpers.ts'

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const LINE = 'Teaching sequence. Nothing runs.'

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test.describe(`${size.width} wide`, () => {
    test.use({ viewport: size, reducedMotion: 'reduce' })

    test('the walkthrough bar says in one quiet line that nothing runs', async ({ page }) => {
      await open(page, REFUND)
      await page.keyboard.press('ControlOrMeta+k')
      const menu = page.getByRole('dialog', { name: 'Command menu' })
      await menu.getByRole('combobox').fill('Play Approve and pay')
      await page.keyboard.press('Enter')
      const bar = page.getByRole('region', { name: 'Walkthrough: Approve and pay' })
      await expect(bar).toBeVisible()
      // With reduced motion the bar is at rest at once.
      await expect(bar).toHaveCSS('opacity', '1')
      const line = bar.getByText(LINE)
      await expect(line).toBeVisible()
      // Not read out again at every step: it is outside the caption's live region.
      await expect(bar.locator('[aria-live]').getByText(LINE)).toHaveCount(0)
      // Quiet: smaller than the caption, and it stays inside the bar with the buttons in view.
      const sizes = await bar.evaluate((el) => {
        const px = (node: Element | null) => parseFloat(getComputedStyle(node!).fontSize)
        const caption = el.querySelector('[aria-live]')
        const note = [...el.querySelectorAll('p')].find((p) => p.textContent === 'Teaching sequence. Nothing runs.') ?? null
        const box = el.getBoundingClientRect()
        const n = note?.getBoundingClientRect()
        return { caption: px(caption), note: note ? px(note) : 0, inside: !!n && n.left >= box.left && n.right <= box.right, lines: n ? Math.round(n.height / parseFloat(getComputedStyle(note!).lineHeight)) : 0 }
      })
      expect(sizes.note).toBeLessThan(sizes.caption)
      expect(sizes.inside).toBe(true)
      expect(sizes.lines).toBe(1)
      await expect(bar.getByRole('button', { name: 'Next' })).toBeInViewport()
      // It stays through the steps.
      await page.keyboard.press('ArrowRight')
      await expect(bar.getByText('2 / 5')).toBeVisible()
      await expect(line).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(bar).toBeHidden()
      await expect(page.getByText(LINE)).toHaveCount(0)
    })
  })
}
