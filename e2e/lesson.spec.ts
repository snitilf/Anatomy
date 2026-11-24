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
