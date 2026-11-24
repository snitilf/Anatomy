/// <reference lib="dom" />
import { expect, test } from './test.ts'
import type { Page } from '@playwright/test'

const EXAMPLES = [
  { id: 'claude-code', name: /How the Claude Code harness works/, title: 'How the Claude Code harness works' },
  { id: 'anatomy', name: /Anatomy itself/, title: 'Anatomy: how a board becomes a map' },
  { id: 'llm', name: /How a large language model like Opus 5.5 works/, title: 'How a large language model like Opus 5.5 works' },
]

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Sidebar' })

test.describe('the empty screen', () => {
  test('shows live map previews for every example, three steps, and the open actions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Open a repository to see its anatomy.' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open folder' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open file' })).toBeVisible()

    for (const example of EXAMPLES) {
      const preview = page.getByTestId(`example-preview-${example.id}`)
      await expect(preview).toBeVisible()
      const svg = preview.locator('svg')
      await expect(svg).toBeVisible()
      const box = await svg.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThan(120)
      expect(box!.height).toBeGreaterThan(70)
      expect(await svg.locator('[data-outline-card]').count()).toBeGreaterThan(0)
      expect(await svg.locator('[data-outline-line]').count()).toBeGreaterThan(0)
    }

    const steps = page.getByTestId('start-steps').getByRole('listitem')
    await expect(steps).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      await expect(steps.nth(i)).toBeVisible()
    }
  })

  test('the prompt step points at the place where the prompt is', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    await expect(page.getByTestId('start-steps').getByRole('listitem').first()).toContainText('How to make a board')
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('menuitem', { name: 'How to make a board' }).click()
    await expect(page.getByRole('dialog', { name: 'How to make a board' }).getByRole('button', { name: 'Copy prompt' })).toBeVisible()
  })

  test('opens an example using only the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const target = page.getByRole('button', { name: EXAMPLES[0]!.name })
    await expect(target).toBeVisible()

    let reached = false
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      if (await target.evaluate((el) => el === document.activeElement)) {
        reached = true
        break
      }
    }
    expect(reached, 'Tab reaches the first example button').toBe(true)

    await page.keyboard.press('Enter')
    await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
    await expect(sidebar(page).getByRole('heading', { level: 2, name: EXAMPLES[0]!.title })).toBeVisible()
  })

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('renders previews settled with no transition and opens an example', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')

      const card = page.getByRole('button', { name: EXAMPLES[0]!.name })
      await expect(card).toBeVisible()
      const preview = page.getByTestId(`example-preview-${EXAMPLES[0]!.id}`)
      await expect(preview).toBeVisible()

      const settled = await card.evaluate((el) => {
        const s = getComputedStyle(el)
        return {
          opacity: s.opacity,
          transitionProperty: s.transitionProperty,
          animationName: s.animationName,
          transform: s.transform,
        }
      })
      expect(settled.opacity).toBe('1')
      expect(settled.transitionProperty).toBe('opacity')
      expect(settled.animationName).toBe('none')
      expect(settled.transform).toBe('none')

      await card.hover()
      const hoveredTransform = await card.evaluate((el) => getComputedStyle(el).transform)
      expect(hoveredTransform).toBe('none')

      await card.click()
      await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
    })
  })

  test.describe('on a phone (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

    test('keeps previews, steps, and buttons inside the viewport without horizontal scroll', async ({ page }) => {
      await page.goto('/')

      await expect(page.getByRole('heading', { name: 'Open a repository to see its anatomy.' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Open file' })).toBeVisible()

      for (const example of EXAMPLES) {
        const preview = page.getByTestId(`example-preview-${example.id}`)
        await expect(preview).toBeVisible()
        const box = await preview.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.width).toBeGreaterThan(200)
        expect(box!.x + box!.width).toBeLessThanOrEqual(390)
      }

      const steps = page.getByTestId('start-steps').getByRole('listitem')
      await expect(steps).toHaveCount(3)

      const overflow = await page.evaluate(() => {
        const docOverflows = document.documentElement.scrollWidth > window.innerWidth
        const main = document.querySelector<HTMLElement>('main')
        const mainOverflows = main ? main.scrollWidth > main.clientWidth : true
        const edge = main ? main.getBoundingClientRect().right + 1 : window.innerWidth + 1
        const past: string[] = []
        if (main) {
          for (const el of main.querySelectorAll<HTMLElement>('*')) {
            if (el.closest('[hidden]')) continue
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.right > edge) past.push(`${el.tagName}.${el.className}`)
          }
        }
        return { docOverflows, mainOverflows, past }
      })

      expect(overflow.docOverflows, 'document does not scroll sideways').toBe(false)
      expect(overflow.mainOverflows, 'main does not scroll sideways').toBe(false)
      expect(overflow.past, 'no element runs past the right edge').toEqual([])
    })
  })
})
