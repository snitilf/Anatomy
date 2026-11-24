import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { type Page } from '@playwright/test'
import { expect, test } from './test.ts'

// The release zip is one folder: the build, `serve.mjs`, and `README-run.txt`.
// This spec stages that folder the way the release workflow does, starts the server the way the instructions say, and opens an example.
// The same build is served under /Anatomy/ by `e2e/pages.spec.ts`, so one build serves both.
const VERSION = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version
const BUILD = 'dist-release'
const OUT = 'release-test'
const FOLDER = join(OUT, `anatomy-${VERSION}`)

let server: ChildProcess
let origin: string

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rmSync(OUT, { recursive: true, force: true })
  execFileSync('npm', ['run', 'build', '--', '--outDir', BUILD, '--emptyOutDir'], { stdio: 'pipe', timeout: 150_000 })
  execFileSync(process.execPath, ['scripts/package-release.ts', '--dist', BUILD, '--out', OUT], { stdio: 'pipe' })
  // Port 0 lets the system pick a free port. The instructions use the default, 4173.
  server = spawn(process.execPath, ['serve.mjs', '0'], { cwd: FOLDER })
  let out = ''
  origin = await new Promise<string>((resolve, reject) => {
    server.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      const found = /http:\/\/127\.0\.0\.1:\d+/.exec(out)
      if (found) resolve(found[0])
    })
    server.once('exit', () => reject(new Error(`the server stopped: ${out}`)))
  })
})

test.afterAll(() => {
  server?.kill()
  rmSync(OUT, { recursive: true, force: true })
  rmSync(BUILD, { recursive: true, force: true })
})

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

test('the folder holds the build, the server, and the instructions, and nothing else', () => {
  const listing = readdirSync(FOLDER).sort()
  expect(listing).toEqual(['README-run.txt', 'dist', 'serve.mjs'])
})

test('the page loads from the folder server, with its own files only', async ({ page }) => {
  const seen = watch(page)
  await page.goto(origin)
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/)
  await expect(page.getByText('Open a repository to see its anatomy.')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("connect-src 'none'")
  expect(seen.errors).toEqual([])
  expect(seen.failed).toEqual([])
  expect(seen.requests.filter((u) => !u.startsWith('data:') && !u.startsWith(`${origin}/`))).toEqual([])
})

test('a built-in example opens from the folder server with no error, no violation, and no outside request', async ({ page }) => {
  const seen = watch(page)
  await page.goto(origin)
  await page.getByRole('button', { name: /Anatomy itself/ }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('heading', { level: 2, name: 'Anatomy: how a board becomes a map' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(seen.errors).toEqual([])
  expect(seen.failed).toEqual([])
  // The map and the board load as scripts of their own, relative to the page.
  expect(seen.requests.some((u) => /\/Canvas-[^/]*\.js$/.test(u))).toBe(true)
  expect(seen.requests.some((u) => /\.woff2$/.test(u))).toBe(true)
  expect(seen.requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith(`${origin}/`))).toEqual([])
})

test('the icon and the theme script come from the folder, not from a site root that the zip does not have', async ({ page, request }) => {
  await page.goto(origin)
  const html = await (await request.get(origin)).text()
  expect(html).toContain('href="./favicon.svg"')
  expect(html).toContain('src="./theme.js"')
  expect((await request.get(`${origin}/theme.js`)).status()).toBe(200)
})
