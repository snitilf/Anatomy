/// <reference lib="dom" />
import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'

/** The color of the top bar and its hex, so the theme color of the page is held to what the page looks like. */
const frame = (page: Page) =>
  page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d')!
    c.fillStyle = getComputedStyle(document.querySelector('header')!).backgroundColor
    return c.fillStyle
  })

/** The theme colors the page offers a browser right now, and the one the browser would pick for the color scheme it has. */
const themeColors = (page: Page) =>
  page.evaluate(() => {
    const metas = [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
    return { all: metas.map((m) => m.content.toLowerCase()), picked: metas.find((m) => !m.media || matchMedia(m.media).matches)?.content.toLowerCase() }
  })

test.describe('the icon of the page', () => {
  test('is an SVG file that loads, with a color scheme of its own', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="icon"]').getAttribute('href')
    expect(href).toBeTruthy()
    expect(href).not.toMatch(/^data:/)
    const type = await page.locator('link[rel="icon"]').getAttribute('type')
    expect(type).toBe('image/svg+xml')
    const response = await request.get(new URL(href!, page.url()).href)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/svg+xml')
    const svg = await response.text()
    expect(svg).toContain('prefers-color-scheme: dark')
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`paints the accent and the ink of the ${scheme} theme when the browser is in that scheme`, async ({ page, request }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/')
      const href = await page.locator('link[rel="icon"]').getAttribute('href')
      const svg = await (await request.get(new URL(href!, page.url()).href)).text()
      // Draw the file itself, as a tab does, and read the colors it paints.
      const result = await page.evaluate(async (svg) => {
        const img = new Image()
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 64
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, 64, 64)
        const seen = new Set<string>()
        const data = ctx.getImageData(0, 0, 64, 64).data
        for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 250) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
        const root = getComputedStyle(document.documentElement)
        const rgb = (v: string) => {
          const c = document.createElement('canvas').getContext('2d')!
          c.fillStyle = v.trim()
          c.fillRect(0, 0, 1, 1)
          return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(',')
        }
        return { seen: [...seen], accent: rgb(root.getPropertyValue('--accent')), ink: rgb(root.getPropertyValue('--fg')) }
      }, svg)
      expect(result.seen).toContain(result.accent)
      expect(result.seen).toContain(result.ink)
    })
  }
})

test.describe('the theme color of the page', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`is the color of the top bar in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      const colors = await themeColors(page)
      expect(colors.picked).toBe(await frame(page))
    })
  }

  for (const [system, stored] of [['light', 'dark'], ['dark', 'light']] as const) {
    test(`follows a stored ${stored} theme over the ${system} system theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: system })
      await page.addInitScript((value) => localStorage.setItem('anatomy:theme', value), stored)
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', stored)
      const colors = await themeColors(page)
      expect(colors.picked).toBe(await frame(page))
      expect(new Set(colors.all).size).toBe(1)
    })
  }

  test('follows the theme chosen in the settings menu', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const light = (await themeColors(page)).picked
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const dark = (await themeColors(page)).picked
    expect(dark).not.toBe(light)
    expect(dark).toBe(await frame(page))
  })
})

test.describe('the mark beside the word Anatomy', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`sits on the line of the word, left of it, in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')
      const mark = page.getByTestId('brand-mark')
      const word = page.getByRole('banner').getByText('Anatomy', { exact: true })
      await expect(mark).toBeVisible()
      const m = (await mark.boundingBox())!
      const w = (await word.boundingBox())!
      expect(m.width).toBeGreaterThanOrEqual(16)
      expect(m.width).toBeLessThanOrEqual(24)
      expect(Math.abs(m.width - m.height)).toBeLessThanOrEqual(1)
      // Left of the word, 4 to 10 px from it, and centred on the line of the text.
      expect(m.x + m.width).toBeLessThan(w.x + 1)
      expect(w.x - (m.x + m.width)).toBeLessThanOrEqual(10)
      expect(Math.abs(m.y + m.height / 2 - (w.y + w.height / 2))).toBeLessThanOrEqual(2)
      // The mark is drawn in the tokens: its accent part is the accent of the theme, and its ink is the text color.
      const colors = await mark.evaluate((el) => {
        const fills = [...el.querySelectorAll('[data-part]')].map((p) => [p.getAttribute('data-part'), getComputedStyle(p).fill, getComputedStyle(p).stroke])
        const root = getComputedStyle(document.documentElement)
        const c = document.createElement('canvas').getContext('2d')!
        const hex = (v: string) => {
          c.fillStyle = v
          return c.fillStyle
        }
        return { fills: fills.map(([k, f, s]) => [k, hex(f!), hex(s!)]), accent: hex(root.getPropertyValue('--accent')), fg: hex(root.getPropertyValue('--fg')) }
      })
      const part = (name: string) => colors.fills.find(([k]) => k === name)
      expect(part('accent')?.[1]).toBe(colors.accent)
      expect(part('ink')?.[2]).toBe(colors.fg)
      // A picture beside a word: the screen reader says "Anatomy" once.
      await expect(mark).toHaveAttribute('aria-hidden', 'true')
    })
  }

  test('stays visible inside the Open menu trigger once a board is open', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Anatomy itself/ }).click()
    await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
    await expect(page.getByRole('banner').getByTestId('brand-mark')).toBeVisible()
  })
})
