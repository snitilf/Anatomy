import { mkdirSync } from 'node:fs'
import { open } from './helpers.ts'
import { expect, test } from './test.ts'
import type { Page } from '@playwright/test'

const SIXTY = 'e2e/fixtures/sixty-parts.board.json'
const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const SHOTS = process.env.CSP_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const policy = async (page: Page) => page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')

test('the built page carries the policy, and it names no frame-ancestors', async ({ page }) => {
  await page.goto('/')
  const content = await policy(page)
  expect(content).toBe(
    "default-src 'self'; script-src 'self'; connect-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
  )
  expect(content).not.toContain('frame-ancestors')
})

test('a request to another origin from the page is blocked', async ({ page, violations }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    try {
      await fetch('http://127.0.0.1:9/ping', { mode: 'no-cors' })
      return 'sent'
    } catch {
      return 'blocked'
    }
  })
  expect(result).toBe('blocked')
  await expect.poll(() => violations.list.length).toBeGreaterThan(0)
  expect(violations.take().map((v) => v.directive)).toContain('connect-src')
  // A request to the page's own origin is blocked too: nothing in the app needs `fetch`.
  const same = await page.evaluate(() => fetch('/').then(() => 'sent', () => 'blocked'))
  expect(same).toBe('blocked')
  await expect.poll(() => violations.list.length).toBeGreaterThan(0)
  expect(violations.take().map((v) => v.directive)).toContain('connect-src')
})

test('an inline script is blocked', async ({ page, violations }) => {
  await page.goto('/')
  const ran = await page.evaluate(() => {
    const s = document.createElement('script')
    s.textContent = 'window.__inline = true'
    document.head.append(s)
    return (window as unknown as { __inline?: boolean }).__inline === true
  })
  expect(ran).toBe(false)
  await expect.poll(() => violations.list.length).toBeGreaterThan(0)
  expect(violations.take().map((v) => v.directive)).toContain('script-src-elem')
})

test('the icon of the page loads under the policy, as an image of the origin of the page', async ({ page }) => {
  await page.goto('/')
  const loaded = await page.evaluate(async () => {
    const img = new Image()
    img.src = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href
    await img.decode()
    return img.naturalWidth > 0
  })
  expect(loaded).toBe(true)
  // The recorder of the suite fails this test at its end if loading the icon was a violation.
})

test('the violation recorder sees a violation', async ({ page, violations }) => {
  await page.goto('/')
  await page.evaluate(() => fetch('http://127.0.0.1:9/', { mode: 'no-cors' }).catch(() => undefined))
  await expect.poll(() => violations.list.length).toBeGreaterThan(0)
  violations.take()
})

/** Records every write to `data-theme` of the root element, with the time of it, from before the page's own scripts run. */
const watchTheme = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __themeWrites: { value: string | null; at: number }[] }
    w.__themeWrites = []
    // The root element does not exist yet when this runs, so watch the whole document.
    new MutationObserver((batch) => {
      // Only the root element counts: another element may carry a `data-theme` of its own.
      const records = batch.filter((record) => record.target === document.documentElement)
      records.forEach((record, i) => {
        const next = records[i + 1]
        const value = next ? next.oldValue : (record.target as HTMLElement).getAttribute('data-theme')
        w.__themeWrites.push({ value, at: performance.now() })
      })
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'], attributeOldValue: true })
  })

/** The theme was written before the first paint, the first write was the right one, and no other value was ever written. */
async function expectThemeBeforePaint(page: Page, expected: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', expected)
  await page.waitForFunction(() => performance.getEntriesByName('first-paint').length > 0)
  const { writes, paint } = await page.evaluate(() => ({
    writes: (window as unknown as { __themeWrites: { value: string | null; at: number }[] }).__themeWrites,
    paint: performance.getEntriesByName('first-paint')[0]!.startTime,
  }))
  expect(writes.length).toBeGreaterThan(0)
  expect(writes[0]!.value).toBe(expected)
  expect(writes[0]!.at).toBeLessThan(paint)
  expect(writes.filter((w) => w.value !== expected)).toEqual([])
}

for (const scheme of ['light', 'dark'] as const) {
  test(`the ${scheme} theme is set before the first paint, by a file that is loaded in the head`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await watchTheme(page)
    await page.goto('/')
    const head = await page.evaluate(() => [...document.head.querySelectorAll('script')].map((s) => ({ src: s.getAttribute('src'), inline: !s.src, async: s.async, defer: s.defer, module: s.type === 'module' })))
    expect(head.filter((s) => s.inline)).toEqual([])
    const theme = head.find((s) => !s.module)
    expect(theme?.src).toBeTruthy()
    expect(theme).toMatchObject({ async: false, defer: false })
    await expectThemeBeforePaint(page, scheme)
  })
}

for (const [system, stored] of [['light', 'dark'], ['dark', 'light']] as const) {
  test(`a stored ${stored} theme wins over the ${system} system theme, before the first paint`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: system })
    await page.addInitScript((value) => localStorage.setItem('anatomy:theme', value), stored)
    await watchTheme(page)
    await page.goto('/')
    await expectThemeBeforePaint(page, stored)
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`toasts, hover, and bundle highlights still render in the ${scheme} theme`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 1440, height: 900 })
    // A toast.
    await open(page, SHORTENER)
    const next = JSON.parse(await (await import('node:fs/promises')).readFile(SHORTENER, 'utf8')) as { revision: number; components: { summary: string }[] }
    next.revision = 2
    next.components[0]!.summary = 'Changed in revision 2'
    const path = testInfo.outputPath('revision-2.board.json')
    await (await import('node:fs/promises')).writeFile(path, JSON.stringify(next))
    await page.getByLabel('Board file').setInputFiles(path)
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Revision 2 is open' })
    await expect(toast).toBeVisible()
    await expect(toast).toHaveAttribute('data-mounted', 'true')
    await toast.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
    // The injected sheet of the toast library is applied: the toast is a positioned, rounded box.
    const look = await toast.evaluate((el) => {
      const s = getComputedStyle(el)
      return { position: s.position, radius: Number.parseFloat(s.borderTopLeftRadius) }
    })
    expect(look.position).toBe('absolute')
    expect(look.radius).toBeGreaterThan(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${scheme}-toast.png` })

    // The hover of a card: the style rule of the canvas steps the other lines back and lifts its own.
    await open(page, SHORTENER)
    const card = page.locator('.react-flow__node-card').first()
    await card.hover()
    const rules = await page.locator('[data-hover-scope] > style').first().evaluate((el) => el.textContent ?? '')
    expect(rules).toContain('[data-ends~=')
    // The step back is a short transition, so wait until the other lines have moved.
    await expect
      .poll(async () => new Set(await page.locator('[data-hover-scope] [data-ends]').evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity))).size)
      .toBeGreaterThan(1)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${scheme}-hover.png` })
  })

  test(`a bundle highlight renders in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, SIXTY)
    const unit = page.locator('[data-unit]:has(button[aria-label$="Show them."])').first()
    const at = await unit.locator('path[data-hit]').evaluate((path: SVGPathElement) => {
      const m = path.getScreenCTM()!
      const owner = path.closest('[data-unit]')!
      const total = path.getTotalLength()
      for (const t of [0.25, 0.75, 0.4, 0.6, 0.1, 0.9, 0.5]) {
        const p = path.getPointAtLength(total * t)
        const x = p.x * m.a + m.e
        const y = p.y * m.d + m.f
        if (owner.contains(document.elementFromPoint(x, y))) return { x, y }
      }
      return undefined
    })
    expect(at).toBeDefined()
    const before = await unit.locator('path[data-bundle]').evaluate((p) => Number.parseFloat(getComputedStyle(p).strokeWidth))
    await page.mouse.move(at!.x, at!.y)
    await expect(page.locator('[data-bundle-tip][data-show]')).toBeVisible()
    const after = await unit.locator('path[data-bundle]').evaluate((p) => Number.parseFloat(getComputedStyle(p).strokeWidth))
    expect(after).toBeGreaterThan(before)
    await page.mouse.click(at!.x, at!.y)
    // The selected bundle is lifted by the style rule of the canvas.
    await expect(page.locator('[data-hover-scope] > style').nth(1)).toBeAttached()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${scheme}-bundle.png` })
  })
}
