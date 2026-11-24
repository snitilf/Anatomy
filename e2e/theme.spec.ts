import { expect, test } from './test.ts'

function parseRgb(raw: string): [number, number, number] {
  const m = raw.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/)
  if (!m) throw new Error(`Expected rgb() string, got: ${raw}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function rgbToOklch(r: number, g: number, b: number): { L: number; C: number; H: number } {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b2 = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(a, b2)
  let H = (Math.atan2(b2, a) * 180) / Math.PI
  if (H < 0) H += 360
  return { L, C, H }
}

test.describe('light theme values and keyboard theme switch', () => {
  test('renders crisp white cards on a cool low-chroma ground and switches themes by keyboard', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await page.getByRole('button', { name: /Anatomy itself/ }).click()
    const card = page.locator('[data-card]').first()
    await expect(card).toBeVisible()

    const lightColors = await page.evaluate(() => {
      const cardEl = document.querySelector('[data-card]') as HTMLElement | null
      const bgEl = document.querySelector('.react-flow') as HTMLElement | null
      const probe = document.createElement('div')
      probe.style.color = 'var(--yours)'
      probe.style.backgroundColor = 'var(--bg)'
      document.body.appendChild(probe)
      const styles = getComputedStyle(probe)
      const cardBg = cardEl ? getComputedStyle(cardEl).backgroundColor : ''
      const mapBg = bgEl ? getComputedStyle(bgEl).backgroundColor : styles.backgroundColor
      const yours = styles.color
      probe.remove()
      return {
        theme: document.documentElement.dataset.theme,
        cardBg,
        mapBg: mapBg === 'rgba(0, 0, 0, 0)' ? styles.backgroundColor : mapBg,
        yours,
      }
    })

    expect(lightColors.theme).toBe('light')
    const cardOklch = rgbToOklch(...parseRgb(lightColors.cardBg))
    const bgOklch = rgbToOklch(...parseRgb(lightColors.mapBg))
    const yoursOklch = rgbToOklch(...parseRgb(lightColors.yours))

    expect(cardOklch.L).toBeGreaterThanOrEqual(0.995)
    expect(cardOklch.L - bgOklch.L).toBeGreaterThanOrEqual(0.065)
    expect(bgOklch.C).toBeLessThanOrEqual(0.006)
    expect(yoursOklch.H).toBeGreaterThanOrEqual(68)
    expect(yoursOklch.H).toBeLessThanOrEqual(78)

    // Keyboard path: open Settings via keyboard and switch to Dark, then back to Light.
    const settingsButton = page.getByRole('button', { name: 'Settings' })
    await settingsButton.focus()
    await page.keyboard.press('Enter')
    const darkItem = page.getByRole('menuitemradio', { name: 'Dark' })
    await expect(darkItem).toBeVisible()
    await darkItem.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await settingsButton.focus()
    await page.keyboard.press('Enter')
    const lightItem = page.getByRole('menuitemradio', { name: 'Light' })
    await expect(lightItem).toBeVisible()
    await lightItem.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('applies the light theme end state cleanly under reduced motion', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('button', { name: /Anatomy itself/ }).click()
    const card = page.locator('[data-card]').first()
    await expect(card).toBeVisible()

    const cardBg = await card.evaluate((el) => getComputedStyle(el).backgroundColor)
    const cardOklch = rgbToOklch(...parseRgb(cardBg))
    expect(cardOklch.L).toBeGreaterThanOrEqual(0.995)
  })
})
