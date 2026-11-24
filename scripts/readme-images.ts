/// <reference lib="dom" />
// Takes the pictures at the top of README.md: one built-in example with a walkthrough step lit, in light and dark.
//
//   npm run readme-images
//
// It builds the app, serves the build on the loopback interface, opens the example in Chrome, plays the walkthrough to the
// chosen step, and writes `docs/images/map-light.png` and `docs/images/map-dark.png`.
// To try another example or step, pass `--example`, `--walkthrough`, `--step`, or `--out`:
//
//   npm run readme-images -- --example claude-code --walkthrough "Fix a failing test" --step 4 --out scratch/shots
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium, type Page } from '@playwright/test'
import { build, preview } from 'vite'

export interface Shot {
  /** The name on the start screen: a part of the example's title. */
  example: RegExp
  /** The walkthrough's title as the command menu lists it. */
  walkthrough: string
  /** The step to stop on, counted from 1. */
  step: number
  /** Close the sidebar first, so the map gets the whole window. */
  hideSidebar?: boolean
  width?: number
  height?: number
}

/**
 * The picture the README shows.
 * The Claude Code harness is the example a reader of a coding-agent tool knows best, and at 1440x900 its whole map fits in view,
 * with its three groups and every line label readable. Step 2 of "Fix a failing test" lights the agent loop, the model, and the
 * lines between them, so the picture shows both a lit path and the dimmed rest of the map. The sidebar stays open: it lists the
 * four walkthroughs.
 */
export const README_SHOT: Shot = { example: /Claude Code harness/, walkthrough: 'Fix a failing test', step: 2 }

export const WIDTH = 1440
export const HEIGHT = 900
export const SCALE = 2
/** The key that the first-run hint on the map sets once it has been seen. */
const HINT_KEY = 'anatomy:map-hint-seen'

const root = resolve(import.meta.dirname, '..')

async function lightUp(page: Page, shot: Shot) {
  await page.goto('/')
  await page.getByRole('button', { name: shot.example }).click()
  await page.locator('.react-flow__node-card').first().waitFor()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  if (shot.hideSidebar) await page.keyboard.press(']')
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill(`Play ${shot.walkthrough}`)
  await page.keyboard.press('Enter')
  const bar = page.getByRole('region', { name: `Walkthrough: ${shot.walkthrough}` })
  await bar.waitFor()
  for (let step = 1; step < shot.step; step++) await page.keyboard.press('ArrowRight')
  await bar.getByText(new RegExp(`^${shot.step} / \\d+$`)).waitFor()
  // Let the camera, the lit lines, and the fonts come to rest. Reduced motion makes this a short wait.
  await page.waitForTimeout(1200)
  // Move the pointer off the map so no hover state or tooltip is in the picture.
  await page.mouse.move((shot.width ?? WIDTH) - 2, (shot.height ?? HEIGHT) - 2)
  // The Next button holds the focus after the keys, and its ring is not part of the picture.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.waitForTimeout(300)
}

export async function takeShots(options: { shot: Shot; outDir: string; schemes?: readonly ('light' | 'dark')[] }) {
  const dist = mkdtempSync(join(tmpdir(), 'anatomy-readme-'))
  mkdirSync(options.outDir, { recursive: true })
  const written: { file: string; bytes: number }[] = []
  let server: Awaited<ReturnType<typeof preview>> | undefined
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    await build({ root, logLevel: 'warn', build: { outDir: dist, emptyOutDir: true } })
    server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0, strictPort: false } })
    const address = server.httpServer.address()
    const port = typeof address === 'object' && address ? address.port : 0
    for (const scheme of options.schemes ?? (['light', 'dark'] as const)) {
      const context = await browser.newContext({
        baseURL: `http://127.0.0.1:${port}`,
        viewport: { width: options.shot.width ?? WIDTH, height: options.shot.height ?? HEIGHT },
        deviceScaleFactor: SCALE,
        colorScheme: scheme,
        reducedMotion: 'reduce',
      })
      await context.addInitScript((key) => window.localStorage.setItem(key, '1'), HINT_KEY)
      const page = await context.newPage()
      await lightUp(page, options.shot)
      const file = join(options.outDir, `map-${scheme}.png`)
      await page.screenshot({ path: file })
      written.push({ file, bytes: statSync(file).size })
      await context.close()
    }
  } finally {
    await browser.close()
    await server?.close()
    rmSync(dist, { recursive: true, force: true })
  }
  return written
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      example: { type: 'string' },
      walkthrough: { type: 'string' },
      step: { type: 'string' },
      out: { type: 'string' },
      'hide-sidebar': { type: 'boolean' },
      width: { type: 'string' },
      height: { type: 'string' },
    },
  })
  const shot: Shot = {
    example: values.example ? new RegExp(values.example, 'i') : README_SHOT.example,
    walkthrough: values.walkthrough ?? README_SHOT.walkthrough,
    step: values.step ? Number(values.step) : README_SHOT.step,
    ...(values['hide-sidebar'] ? { hideSidebar: true } : {}),
    ...(values.width ? { width: Number(values.width) } : {}),
    ...(values.height ? { height: Number(values.height) } : {}),
  }
  const outDir = resolve(root, values.out ?? 'docs/images')
  for (const { file, bytes } of await takeShots({ shot, outDir })) console.log(`${file}  ${(bytes / 1024).toFixed(0)} KB`)
}
