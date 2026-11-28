/// <reference lib="dom" />
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { open, pickConnection, pickPart } from './helpers.ts'
import { everyState, seedFolder } from './states.ts'

const WORST = 'e2e/fixtures/worst-text.board.json'
const REFUND = 'e2e/fixtures/refund-approval.board.json'

const EXAMPLES = [
  'How the Claude Code harness works',
  'Anatomy itself',
  'How a large language model like Opus 5.5 works',
] as const

async function openExample(page: Page, title: string) {
  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(title) }).click()
  await expect(page.locator('[data-detail]')).toBeAttached()
  const overview = page.getByTestId('overview')
  if (await overview.isVisible()) await page.getByRole('tab', { name: 'Map' }).click()
  await expect(page.getByTestId('inspector')).toBeVisible()
}

async function openStates(page: Page) {
  const { text, layer } = await everyState()
  await seedFolder(page, text, layer)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('[data-detail]')).toBeAttached()
  const overview = page.getByTestId('overview')
  if (await overview.isVisible()) await page.getByRole('tab', { name: 'Map' }).click()
}

/**
 * Distinct left edges (relative to the sidebar panel) of every visual line in the scroll area.
 * For a line that starts with a bordered button, its visual left edge is the button's own box;
 * for all other text (headings, paragraphs, rows, status lines, notes), it is the text's left edge.
 * Values within 2 px are grouped into one edge.
 */
async function textLeftEdges(sidebar: Locator): Promise<number[]> {
  return sidebar.evaluate((panel) => {
    const scroller = panel.querySelector('[data-scroll]')
    if (!scroller) return []
    const panelLeft = panel.getBoundingClientRect().left
    const lines: { top: number; bottom: number; left: number }[] = []
    const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? ''
      if (text.trim() === '') continue
      const el = node.parentElement
      if (!el) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
      if (el.closest('.sr-only')) continue
      // A boxed button (with a visible border or fill) aligns by its box, not its inner padding.
      const btn = el.closest('button')
      let boxLeft: number | undefined
      if (btn && !btn.hasAttribute('data-lesson-opener')) {
        const bs = getComputedStyle(btn)
        const hasBox =
          (bs.borderLeftWidth !== '0px' && bs.borderLeftColor !== 'rgba(0, 0, 0, 0)') ||
          (bs.backgroundColor !== 'rgba(0, 0, 0, 0)' && !btn.matches('[class*="row"]'))
        if (hasBox) boxLeft = btn.getBoundingClientRect().left
      }
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue
        const left = Math.round((boxLeft !== undefined ? Math.min(boxLeft, rect.left) : rect.left) - panelLeft)
        const existing = lines.find((line) => rect.top < line.bottom && rect.bottom > line.top)
        if (existing) {
          existing.left = Math.min(existing.left, left)
          existing.top = Math.min(existing.top, rect.top)
          existing.bottom = Math.max(existing.bottom, rect.bottom)
        } else {
          lines.push({ top: rect.top, bottom: rect.bottom, left })
        }
      }
    }
    const clusters: number[] = []
    for (const { left } of lines.sort((a, b) => a.left - b.left)) {
      if (!clusters.some((c) => Math.abs(c - left) <= 2)) clusters.push(left)
    }
    return clusters
  })
}

test.describe('sidebar header and Review switch', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const title of EXAMPLES) {
    test(`"${title}" has no disabled control and no Review tab in the sidebar`, async ({ page }) => {
      await openExample(page, title)
      const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
      await expect(sidebar.getByRole('tab', { name: /^Review/ })).toHaveCount(0)
      const disabled = await sidebar.locator('button:visible, [role="tab"]:visible').evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true')
          .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()),
      )
      expect(disabled).toEqual([])
    })
  }

  test('every-state fixture shows the Segmented switch and Review 6 works', async ({ page }) => {
    await openStates(page)
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
    const tablist = sidebar.getByRole('tablist', { name: 'Sidebar' })
    await expect(tablist).toBeVisible()
    const reviewTab = tablist.getByRole('tab', { name: 'Review 6' })
    await expect(reviewTab).toBeVisible()
    await expect(reviewTab).toBeEnabled()
    await reviewTab.click()
    await expect(reviewTab).toHaveAttribute('aria-selected', 'true')
    await expect(sidebar.getByRole('region', { name: 'Answers' })).toBeVisible()
  })

  test('with a part selected at 1440 px, a Board button clears the selection', async ({ page }) => {
    await openExample(page, EXAMPLES[0])
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
    await pickPart(page, 'permission-check')
    await expect(sidebar.getByRole('heading', { level: 2, name: 'Permission check' })).toBeVisible()
    const back = sidebar.getByRole('button', { name: 'Board', exact: true })
    await expect(back).toBeVisible()
    await back.click()
    await expect(sidebar.getByRole('heading', { level: 2, name: EXAMPLES[0] })).toBeVisible()
    await expect(back).toHaveCount(0)
  })

  test('the sidebar board view has Start here section with walkthroughs and lessons on Claude Code example', async ({ page }) => {
    await openExample(page, EXAMPLES[0])
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
    const startHere = sidebar.getByRole('region', { name: 'Start here' })
    await expect(startHere).toBeVisible()
    const lessonRow = startHere.locator('[data-lesson-opener="permission-check"]')
    await expect(lessonRow).toBeVisible()
    await expect(lessonRow).toContainText('on Permission check')
  })
})

test.describe('part reading order and above-the-fold visibility', () => {
  test('part sections appear in order: Lesson, Explanation, Connections, Open items, Cited, Notes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openExample(page, EXAMPLES[0])
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
    await pickPart(page, 'permission-check')
    // Add a note so Notes is present alongside the other five sections.
    await sidebar.getByRole('textbox', { name: 'Add a note' }).fill('Check this gate')
    await sidebar.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(sidebar.getByRole('region', { name: 'Notes' })).toBeVisible()

    const names = await sidebar.locator('[data-scroll] section[aria-label]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label')),
    )
    expect(names).toEqual(['Lesson', 'Explanation', 'Connections', 'Open items', 'Cited, not checked', 'Notes'])
  })

  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
  ] as const) {
    test(`Permission check shows lesson row and first 3 lines of explanation without scrolling at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openExample(page, EXAMPLES[0])
      const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
      await pickPart(page, 'permission-check')
      await expect(sidebar.getByRole('heading', { level: 2, name: 'Permission check' })).toBeVisible()

      const scroller = sidebar.locator('[data-scroll]')
      const scrollBox = (await scroller.boundingBox())!
      const composerBox = (await sidebar.locator('form').boundingBox())!
      const visibleBottom = Math.min(scrollBox.y + scrollBox.height, composerBox.y)

      // The lesson button is fully inside the visible scroll area.
      const lessonBtn = sidebar.getByRole('region', { name: 'Lesson' }).getByRole('button')
      const lessonBox = (await lessonBtn.boundingBox())!
      expect(lessonBox.y).toBeGreaterThanOrEqual(scrollBox.y)
      expect(lessonBox.y + lessonBox.height).toBeLessThanOrEqual(visibleBottom)

      // At least 3 lines of explanation fit inside the visible scroll area without scrolling.
      const firstPara = sidebar.getByRole('region', { name: 'Explanation' }).locator('p').first()
      const lineRects = await firstPara.evaluate((p) => {
        const range = document.createRange()
        range.selectNodeContents(p)
        const ys: number[] = []
        for (const r of range.getClientRects()) {
          if (r.width < 1 || r.height < 1) continue
          if (!ys.some((y) => Math.abs(y - r.bottom) <= 3)) ys.push(r.bottom)
        }
        return ys.sort((a, b) => a - b)
      })
      expect(lineRects.length).toBeGreaterThanOrEqual(3)
      expect(lineRects[2]!).toBeLessThanOrEqual(visibleBottom)
    })
  }
})

test.describe('new note visibility and reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('after Add by pointer and by Mod+Enter, the new note is fully inside the visible scroll area even with a long explanation', async ({ page }) => {
    await openExample(page, EXAMPLES[0])
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
    await pickPart(page, 'permission-check')
    const scroller = sidebar.locator('[data-scroll]')

    // 1. Add by pointer click.
    const pointerText = 'Pointer note on permission check'
    await sidebar.getByRole('textbox', { name: 'Add a note' }).fill(pointerText)
    await sidebar.getByRole('button', { name: 'Add', exact: true }).click()
    const pointerNote = sidebar.getByRole('region', { name: 'Notes' }).getByRole('listitem').filter({ hasText: pointerText })
    await expect(pointerNote).toBeVisible()
    await expect
      .poll(async () => {
        const sb = (await scroller.boundingBox())!
        const cb = (await sidebar.locator('form').boundingBox())!
        const nb = (await pointerNote.boundingBox())!
        return nb.y >= sb.y && nb.y + nb.height <= Math.min(sb.y + sb.height, cb.y)
      })
      .toBe(true)

    // Scroll back to top so the next Add must scroll again. The smooth scroll to the note may still be running once the note
    // is in view, and it would carry on past an instant scroll to the top, so wait for it to stand still first.
    await expect
      .poll(() =>
        scroller.evaluate(
          (el) =>
            new Promise<boolean>((resolve) => {
              const at = el.scrollTop
              requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(el.scrollTop === at))))
            }),
        ),
      )
      .toBe(true)
    await scroller.evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }))
    await expect.poll(async () => scroller.evaluate((el) => el.scrollTop)).toBe(0)

    // 2. Add by Mod+Enter (composer stays expanded over the foot of the list).
    const keyText = 'Keyboard note on permission check'
    const field = sidebar.getByRole('textbox', { name: 'Add a note' })
    await field.click()
    await field.fill(keyText)
    await page.keyboard.press('ControlOrMeta+Enter')
    const keyNote = sidebar.getByRole('region', { name: 'Notes' }).getByRole('listitem').filter({ hasText: keyText })
    await expect(keyNote).toBeVisible()
    await expect
      .poll(async () => {
        const sb = (await scroller.boundingBox())!
        const cb = (await sidebar.locator('form').boundingBox())!
        const nb = (await keyNote.boundingBox())!
        return nb.y >= sb.y && nb.y + nb.height <= Math.min(sb.y + sb.height, cb.y)
      })
      .toBe(true)
  })

  test('with reduced motion the new note does not flash and the panel does not scroll smoothly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openExample(page, EXAMPLES[0])
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
    await pickPart(page, 'permission-check')

    // Intercept scrollTo calls on the scroller to record the behavior used.
    await sidebar.locator('[data-scroll]').evaluate((el) => {
      const orig = el.scrollTo.bind(el)
      ;(window as unknown as { __scrollBehaviors: string[] }).__scrollBehaviors = []
      el.scrollTo = ((...args: unknown[]) => {
        const first = args[0] as ScrollToOptions | number | undefined
        if (first && typeof first === 'object' && first.behavior) {
          ;(window as unknown as { __scrollBehaviors: string[] }).__scrollBehaviors.push(first.behavior)
        }
        return (orig as (...a: unknown[]) => void)(...args)
      }) as typeof el.scrollTo
    })

    const noteText = 'Reduced motion note'
    await sidebar.getByRole('textbox', { name: 'Add a note' }).fill(noteText)
    await sidebar.getByRole('button', { name: 'Add', exact: true }).click()
    const note = sidebar.getByRole('region', { name: 'Notes' }).getByRole('listitem').filter({ hasText: noteText })
    await expect(note).toBeVisible()

    // No flash attribute and no running animation.
    await expect(note).not.toHaveAttribute('data-flash', /.*/)
    const animations = await note.evaluate((el) => el.getAnimations({ subtree: true }).length)
    expect(animations).toBe(0)

    // Scroll behavior never used 'smooth'.
    const behaviors = await page.evaluate(() => (window as unknown as { __scrollBehaviors: string[] }).__scrollBehaviors)
    expect(behaviors).not.toContain('smooth')
  })
})

test.describe('two left edges across sidebar views', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('part, board, connection, and Review each use at most two distinct text left edges', async ({ page }) => {
    await openExample(page, EXAMPLES[0])
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' })

    // Board view
    expect((await textLeftEdges(sidebar)).length).toBeLessThanOrEqual(2)

    // Part view (with lesson, explanation, connections, open items, notes)
    await pickPart(page, 'permission-check')
    await sidebar.getByRole('textbox', { name: 'Add a note' }).fill('Alignment check')
    await sidebar.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(sidebar.getByRole('region', { name: 'Notes' })).toBeVisible()
    expect((await textLeftEdges(sidebar)).length).toBeLessThanOrEqual(2)

    // Connection view
    await open(page, REFUND)
    await pickConnection(page, 'proposes a payout')
    await expect(sidebar.getByRole('heading', { level: 2, name: 'proposes a payout' })).toBeVisible()
    expect((await textLeftEdges(sidebar)).length).toBeLessThanOrEqual(2)
    // All four property values (From, Kind, To, Source) share one left edge.
    const ddLefts = await sidebar.locator('dl dd').evaluateAll((els) =>
      els.map((dd) => {
        const range = document.createRange()
        const walker = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT)
        let n: Node | null
        while ((n = walker.nextNode())) {
          if (n.textContent?.trim()) {
            range.selectNodeContents(n)
            const r = range.getClientRects()[0]
            if (r) return Math.round(r.left)
          }
        }
        return -1
      }),
    )
    const uniqueDd = ddLefts.filter((x) => x >= 0).reduce<number[]>((acc, x) => (acc.some((c) => Math.abs(c - x) <= 2) ? acc : [...acc, x]), [])
    expect(uniqueDd.length).toBe(1)
  })

  test('Review on every-state uses at most two distinct text left edges', async ({ page }) => {
    await openStates(page)
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
    await sidebar.getByRole('tab', { name: 'Review 6' }).click()
    await expect(sidebar.getByRole('region', { name: 'Answers' })).toBeVisible()
    expect((await textLeftEdges(sidebar)).length).toBeLessThanOrEqual(2)
  })
})

test.describe('phone sheet half stop and worst-text', () => {
  test('on phone half stop, the lesson row or first line of explanation is visible for a part with a 2-line summary', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    await openExample(page, EXAMPLES[0])
    await pickPart(page, 'permission-check')
    const sheet = page.getByRole('region', { name: 'Sidebar' })
    await expect(sheet).toHaveAttribute('data-stop', '1')
    await page.waitForTimeout(300)

    const scroller = sheet.locator('[data-scroll]')
    const scrollBox = (await scroller.boundingBox())!
    const composerBox = (await sheet.locator('form').boundingBox())!
    const visibleBottom = Math.min(844, scrollBox.y + scrollBox.height, composerBox.y)

    const lessonBtn = sheet.getByRole('region', { name: 'Lesson' }).getByRole('button')
    const lessonBox = (await lessonBtn.boundingBox())!
    expect(lessonBox.y).toBeGreaterThanOrEqual(scrollBox.y)
    expect(lessonBox.y + lessonBox.height).toBeLessThanOrEqual(visibleBottom)

    // Also check a part with no lesson: the first line of its explanation is visible at the half stop.
    await pickPart(page, 'agent-loop')
    await expect(sheet.getByRole('heading', { level: 2, name: 'Agent loop' })).toBeVisible()
    const firstPara = sheet.getByRole('region', { name: 'Explanation' }).locator('p').first()
    const firstLineBottom = await firstPara.evaluate((p) => {
      const range = document.createRange()
      range.selectNodeContents(p)
      return range.getClientRects()[0]?.bottom ?? Infinity
    })
    expect(firstLineBottom).toBeLessThanOrEqual(visibleBottom)
    await context.close()
  })

  test('worst-text has no horizontal overflow in the sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, WORST)
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' })
    const scroller = sidebar.locator('[data-scroll]')
    const overflow = () => scroller.evaluate((el) => el.scrollWidth - el.clientWidth)

    // Board view
    expect(await overflow()).toBeLessThanOrEqual(1)

    // Part view
    const firstId = await page.evaluate(() => document.querySelector('.react-flow__node-card')?.getAttribute('data-id') ?? '')
    expect(firstId).not.toBe('')
    await pickPart(page, firstId)
    expect(await overflow()).toBeLessThanOrEqual(1)
  })
})
