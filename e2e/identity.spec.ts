/// <reference lib="dom" />
import type { Locator, Page } from '@playwright/test'
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
    test(`paints only the ink of the ${scheme} theme when the browser is in that scheme`, async ({ page, request }) => {
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
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
        const root = getComputedStyle(document.documentElement)
        const rgb = (v: string) => {
          const c = document.createElement('canvas').getContext('2d')!
          c.fillStyle = v.trim()
          c.fillRect(0, 0, 1, 1)
          return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(',')
        }
        return { seen: [...seen], corners: [0, 63 * 4, 63 * 64 * 4, (64 * 64 - 1) * 4].map((i) => data[i + 3]), accent: rgb(root.getPropertyValue('--accent')), ink: rgb(root.getPropertyValue('--fg')) }
      }, svg)
      // One flat ink, the text color of the theme, on no tile: every solid pixel is the ink, and there is no accent.
      expect(result.seen).toEqual([result.ink])
      expect(result.ink).not.toBe(result.accent)
      expect(result.corners).toEqual([0, 0, 0, 0])
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

/** The colors the mark is drawn in, as hex, beside the text color and the accent of the theme. */
const markColors = (mark: Locator) =>
  mark.evaluate((el) => {
    const c = document.createElement('canvas').getContext('2d')!
    const hex = (v: string) => {
      c.fillStyle = v
      return c.fillStyle
    }
    const root = getComputedStyle(document.documentElement)
    const shapes = [...el.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon')]
    return {
      shapes: shapes.map((s) => ({ tag: s.tagName, fill: hex(getComputedStyle(s).fill), stroke: getComputedStyle(s).stroke })),
      fg: hex(root.getPropertyValue('--fg')),
      accent: hex(root.getPropertyValue('--accent')),
    }
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
      // 16 px on whole pixels: at 18 or 20 px the flat top and the baseline of the drawing fall between pixels.
      expect(m.width).toBe(16)
      expect(m.height).toBe(16)
      expect(m.x).toBe(Math.round(m.x))
      expect(m.y).toBe(Math.round(m.y))
      // Left of the word, 4 px from it (the drawing keeps 2 px of air, so the stem ends 6 px from the word), centred on the line.
      expect(w.x - (m.x + m.width)).toBeCloseTo(4, 0)
      expect(Math.abs(m.y + m.height / 2 - (w.y + w.height / 2))).toBeLessThanOrEqual(1)
      // One flat ink, the text color of the theme: never the accent, never a second part.
      const colors = await markColors(mark)
      expect(colors.shapes).toEqual([{ tag: 'path', fill: colors.fg, stroke: 'none' }])
      expect(colors.fg).not.toBe(colors.accent)
      // A picture beside a word: the screen reader says "Anatomy" once.
      await expect(mark).toHaveAttribute('aria-hidden', 'true')
    })
  }

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`is 16 px in the ink of the theme inside the Open menu trigger at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await page.getByRole('button', { name: /Anatomy itself/ }).click()
      // A phone opens a board on its overview, so wait for the breadcrumb rather than the map.
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
      const mark = page.getByRole('banner').getByTestId('brand-mark')
      await expect(mark).toBeVisible()
      const m = (await mark.boundingBox())!
      expect(m.width).toBe(16)
      expect(m.height).toBe(16)
      const colors = await markColors(mark)
      expect(colors.shapes).toEqual([{ tag: 'path', fill: colors.fg, stroke: 'none' }])
    })
  }

  test('stays visible inside the Open menu trigger once a board is open', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Anatomy itself/ }).click()
    await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
    await expect(page.getByRole('banner').getByTestId('brand-mark')).toBeVisible()
  })
})
