import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { type Page } from '@playwright/test'
import { serveUnderSubpath, type Served } from '../scripts/lib/subpathServer.ts'
import { expect, test } from './test.ts'

// The hosted copy lives at https://snitilf.github.io/Anatomy/, so every file of it must load from under /Anatomy/ and nothing from the site root.
// This spec builds the app the way the Pages workflow does (`npm run build`, the same build as the release zip) and serves the result under that subpath on loopback.
const SUBPATH = '/Anatomy/'
const EXAMPLES = [
  { name: /How the Claude Code harness works/, title: 'How the Claude Code harness works' },
  { name: /Anatomy itself/, title: 'Anatomy: how a board becomes a map' },
  { name: /How a large language model like Opus 5.5 works/, title: 'How a large language model like Opus 5.5 works' },
]

let server: Served
let origin: string

test.beforeAll(async () => {
  test.setTimeout(180_000)
  execFileSync('npm', ['run', 'build', '--', '--outDir', 'dist-pages', '--emptyOutDir'], { cwd: process.cwd(), stdio: 'pipe', timeout: 150_000 })
  server = await serveUnderSubpath(join(process.cwd(), 'dist-pages'), SUBPATH)
  origin = `http://127.0.0.1:${(server.address as AddressInfo).port}`
})

test.afterAll(async () => {
  await server?.close()
})

/** Everything the page asks for, and everything it complains about, from the first request on. */
function watch(page: Page) {
  const requests: string[] = []
  const failed: string[] = []
  const errors: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
  })
  page.on('requestfailed', (r) => failed.push(`failed ${r.url()}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  return { requests, failed, errors }
}

test('the server serves the subpath only, so a path that assumes the site root is a miss', async ({ request }) => {
  expect((await request.get(`${origin}${SUBPATH}`)).status()).toBe(200)
  expect((await request.get(`${origin}${SUBPATH}theme.js`)).status()).toBe(200)
  expect((await request.get(`${origin}/`)).status()).toBe(404)
  expect((await request.get(`${origin}/theme.js`)).status()).toBe(404)
})

test('the built page points at its own files under the subpath', async ({ page }) => {
  await page.goto(`${origin}${SUBPATH}`)
  // The resolved addresses: the page may add links of its own (for the map and the boards) after it loads.
  const urls = await page.evaluate(() => [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[href]')].map((el) => ('src' in el ? el.src : el.href)))
  const own = urls.filter((u) => !u.startsWith('data:'))
  expect(own.length).toBeGreaterThan(2)
  expect(own.filter((u) => !u.startsWith(`${origin}${SUBPATH}`))).toEqual([])
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("connect-src 'none'")
})

test('the icon of the page loads from under the subpath', async ({ page, request }) => {
  await page.goto(`${origin}${SUBPATH}`)
  const href = await page.locator('link[rel="icon"]').evaluate((el: HTMLLinkElement) => el.href)
  expect(href.startsWith(`${origin}${SUBPATH}`)).toBe(true)
  const response = await request.get(href)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('image/svg+xml')
  // A path from the site root is a miss on the hosted copy, so the page must not ask for one.
  expect((await request.get(`${origin}/favicon.svg`)).status()).toBe(404)
})

for (const example of EXAMPLES) {
  test(`opens ${example.title} under the subpath with no error, no violation, and no request outside it`, async ({ page }) => {
    const seen = watch(page)
    await page.goto(`${origin}${SUBPATH}`)
    // The theme file in the head loaded from the subpath and set the theme.
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/)
    await page.getByRole('button', { name: example.name }).click()
    await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('heading', { level: 2, name: example.title })).toBeVisible()
    // The font file is part of the page, so it has to come from the subpath too.
    await page.evaluate(() => document.fonts.ready)
    await page.waitForLoadState('networkidle')

    expect(seen.errors).toEqual([])
    expect(seen.failed).toEqual([])
    // The lazy chunks (the map and the board) were requested, and each came from the subpath of the same origin.
    expect(seen.requests.some((u) => /\/Canvas-[^/]*\.js$/.test(u))).toBe(true)
    expect(seen.requests.some((u) => /\/[^/]*\.board-[^/]*\.js$/.test(u))).toBe(true)
    expect(seen.requests.some((u) => /\.woff2$/.test(u))).toBe(true)
    const outside = seen.requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith(`${origin}${SUBPATH}`))
    expect(outside).toEqual([])
    // The violation fixture of `test.ts` fails the test at its end if the policy was broken at any point.
  })
}
