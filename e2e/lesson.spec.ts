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

/** The middle of the tab must be the tab, not a bar, a post or a shutter drawn over it. */
const tabInView = (page: Page) =>
  page.evaluate(() => {
    const tab = document.querySelector('[data-part="tab"]:not([display="none"])')
    if (!tab) return false
    const box = tab.getBoundingClientRect()
    return Boolean(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('[data-part="tab"]'))
  })

const atStop = (lesson: Locator, stop: string) => lesson.locator(`[data-part="card"][data-stop="${stop}"]:not([display="none"])`)

test('the tab touches the lit finger in plain view when nobody approved', async ({ page }) => {
  const lesson = await openLesson(page)
  await lesson.getByRole('button', { name: /^Send/ }).click()
  await expect(atStop(lesson, 'gate')).toHaveCount(1)
  expect(await tabInView(page)).toBe(true)
})

test('the tab touches the shutter in plain view after a rejection', async ({ page }) => {
  const lesson = await openLesson(page)
  await lesson.getByRole('button', { name: /^Reject/ }).click()
  await lesson.getByRole('button', { name: /^Send/ }).click()
  await expect(atStop(lesson, 'lockout')).toHaveCount(1)
  expect(await tabInView(page)).toBe(true)
})

test('the tab touches the dropped pin in plain view on a second send', async ({ page }) => {
  const lesson = await openLesson(page)
  await lesson.getByRole('button', { name: /^Approve/ }).click()
  await lesson.getByRole('button', { name: /^Send/ }).click()
  await settle(lesson)
  await lesson.getByRole('button', { name: /^Send/ }).click()
  await expect(atStop(lesson, 'ledger')).toHaveCount(1)
  expect(await tabInView(page)).toBe(true)
})
