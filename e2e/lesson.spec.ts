import { expect, test } from './test.ts'
import type { Locator, Page } from '@playwright/test'

/** The approval gate lesson, reached the way a visitor reaches it: the harness example, the Permission check part, the lesson row. */
async function openLesson(page: Page): Promise<Locator> {
  await page.goto('/')
  await page.getByRole('button', { name: /How the Claude Code harness works/ }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill('Permission check')
  await menu.getByRole('option', { name: /^Permission check/ }).first().click()
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: /^Approval gate/ }).click()
  const lesson = page.getByRole('dialog', { name: 'Approval gate' })
  await expect(lesson.getByRole('group', { name: 'Controls' })).toBeVisible()
  return lesson
}

/** Waits until no track is running. The wait is long on purpose: it covers a slow machine, not the length of the motion. */
const settle = (lesson: Locator) => expect(lesson.locator('.ag[data-settled="true"]')).toBeVisible({ timeout: 15_000 })
const part = (lesson: Locator, kind: string, slot: number) => lesson.locator(`[data-part="${kind}"][data-slot="${slot}"]`)

test('an approved and sent version lifts its finger, drops its pin, and leaves pin 8 alone', async ({ page }) => {
  const lesson = await openLesson(page)
  await lesson.getByRole('button', { name: /^Approve/ }).click()
  await lesson.getByRole('button', { name: /^Send/ }).click()
  await settle(lesson)
  await expect(part(lesson, 'finger', 1)).toHaveAttribute('data-pose', 'up')
  await expect(part(lesson, 'pin', 1)).toHaveAttribute('data-pose', 'down')
  await expect(part(lesson, 'pin', 8)).toHaveAttribute('data-pose', 'up')
})

test('the card body is drawn once, under every arch, and the tab is layered between them', async ({ page }) => {
  const lesson = await openLesson(page)
  await expect(lesson.locator('[data-part="card"]')).toHaveCount(1)
  // Document order is paint order: the body and the pusher first, then each arch with the tab layer that sits behind it just before it.
  const order = await page.evaluate(() => {
    const svg = document.querySelector('.ag svg.iso-svg')
    const kids = [...(svg?.children ?? [])]
    return kids.flatMap((kid) => {
      const part = kid.getAttribute('data-part')
      if (part === 'arch') return [`arch:${kid.getAttribute('data-arch')}`]
      if (part === 'tab') return [`tab:${kid.getAttribute('data-layer')}`]
      return part ? [part] : []
    })
  })
  expect(order).toEqual(['card', 'pusher', 'tab:3', 'arch:ledger', 'tab:2', 'arch:gate', 'tab:1', 'arch:lock', 'tab:0'])
})

test('the stamp stays in front when the card stops at the ledger', async ({ page }) => {
  const lesson = await openLesson(page)
  await lesson.getByRole('button', { name: /^Approve/ }).click()
  await lesson.getByRole('button', { name: /^Send/ }).click()
  await settle(lesson)
  await lesson.getByRole('button', { name: /^Send/ }).click()
  await expect(lesson.locator('[data-part="card"][data-stop="ledger"]:not([display="none"])')).toHaveCount(1)
  // The middle of the stamp, laid on the card's top face. The gate's near post hides the outer corners of the stamp from this
  // camera, which is a real cover, so only the middle is held to the card.
  const inside = await page.evaluate(() => {
    const stamp = [...document.querySelectorAll<SVGTextElement>('[data-part="card"] text')].find((t) => /^v\d$/.test(t.textContent ?? ''))
    const svg = stamp?.ownerSVGElement
    const matrix = stamp?.getScreenCTM()
    if (!stamp || !svg || !matrix) return false
    const box = stamp.getBBox()
    const point = svg.createSVGPoint()
    point.x = box.x + box.width / 2
    point.y = box.y + box.height / 2
    const screen = point.matrixTransform(matrix)
    return Boolean(document.elementFromPoint(screen.x, screen.y)?.closest('[data-part="card"]'))
  })
  expect(inside).toBe(true)
})
