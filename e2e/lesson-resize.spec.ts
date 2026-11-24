import { expect, test } from './test.ts'
import type { Locator, Page } from '@playwright/test'

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

async function openHarness(page: Page) {
  await page.setViewportSize(DESKTOP)
  await page.goto('/')
  await page.getByRole('button', { name: /How the Claude Code harness works/ }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
}

/** The lesson row in the part's details, the way a visitor reaches it: pick the part, then the row. */
async function openFromPart(page: Page): Promise<Locator> {
  await openHarness(page)
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill('Permission check')
  await menu.getByRole('option', { name: /^Permission check/ }).first().click()
  await page.getByTestId('inspector').getByRole('button', { name: /^Approval gate/ }).click()
  const lesson = page.getByRole('dialog', { name: 'Approval gate' })
  await expect(lesson.getByRole('group', { name: 'Controls' })).toBeVisible()
  return lesson
}

/** The lesson row on the Overview page. */
async function openFromOverview(page: Page): Promise<Locator> {
  await openHarness(page)
  await page.getByRole('tab', { name: 'Overview' }).click()
  await page.getByTestId('overview').getByRole('button', { name: /^Approval gate/ }).click()
  const lesson = page.getByRole('dialog', { name: 'Approval gate' })
  await expect(lesson.getByRole('group', { name: 'Controls' })).toBeVisible()
  return lesson
}

const settled = (lesson: Locator) => expect(lesson.locator('.ag[data-settled="true"]')).toBeVisible({ timeout: 15_000 })

test('a lesson opened from a part stays open, with its state, across the phone breakpoint and back', async ({ page }) => {
  const lesson = await openFromPart(page)
  await lesson.getByRole('button', { name: /^Approve/ }).click()
  await expect(lesson.getByText('v1 approved · sent none', { exact: true })).toBeVisible()
  await settled(lesson)

  await page.setViewportSize(PHONE)
  await expect(page.getByRole('dialog', { name: 'Approval gate' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Approval gate' }).getByText('v1 approved · sent none', { exact: true })).toBeVisible()
  // The lesson is one live run: it is not built again, so it is not back at its start.
  await expect(page.getByRole('dialog', { name: 'Approval gate' }).locator('.ag')).toHaveCount(1)

  await page.setViewportSize(DESKTOP)
  await expect(page.getByRole('dialog', { name: 'Approval gate' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Approval gate' }).getByText('v1 approved · sent none', { exact: true })).toBeVisible()
})

test('Escape after a resize closes the lesson and focus lands on a visible lesson row', async ({ page }) => {
  const lesson = await openFromPart(page)
  await lesson.getByRole('button', { name: /^Approve/ }).click()
  await page.setViewportSize(PHONE)
  await expect(page.getByRole('dialog', { name: 'Approval gate' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Approval gate' })).toHaveCount(0)
  const row = page.getByTestId('inspector').getByRole('button', { name: /^Approval gate/ })
  await expect(row).toBeVisible()
  await expect(row).toBeFocused()
})

test('a resize back to the desktop width, then Escape, returns focus to the row in the sidebar', async ({ page }) => {
  const lesson = await openFromPart(page)
  await lesson.getByRole('button', { name: /^Approve/ }).click()
  await page.setViewportSize(PHONE)
  await expect(page.getByRole('dialog', { name: 'Approval gate' })).toBeVisible()
  await page.setViewportSize(DESKTOP)
  await expect(page.getByRole('dialog', { name: 'Approval gate' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Approval gate' })).toHaveCount(0)
  const row = page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: /^Approval gate/ })
  await expect(row).toBeVisible()
  await expect(row).toBeFocused()
})

test('a lesson opened from the Overview stays open across the phone breakpoint, and Escape returns to its row', async ({ page }) => {
  const lesson = await openFromOverview(page)
  await lesson.getByRole('button', { name: /^Approve/ }).click()
  await expect(lesson.getByText('v1 approved · sent none', { exact: true })).toBeVisible()
  await page.setViewportSize(PHONE)
  await expect(page.getByRole('dialog', { name: 'Approval gate' }).getByText('v1 approved · sent none', { exact: true })).toBeVisible()
  await page.setViewportSize(DESKTOP)
  await expect(page.getByRole('dialog', { name: 'Approval gate' }).getByText('v1 approved · sent none', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Approval gate' })).toHaveCount(0)
  const row = page.getByTestId('overview').getByRole('button', { name: /^Approval gate/ })
  await expect(row).toBeVisible()
  await expect(row).toBeFocused()
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a sent version is still sent, and settled, after the resize', async ({ page }) => {
    const lesson = await openFromPart(page)
    await lesson.getByRole('button', { name: /^Approve/ }).click()
    await lesson.getByRole('button', { name: /^Send/ }).click()
    await expect(lesson.getByText('v1 approved · sent v1', { exact: true })).toBeVisible()
    await page.setViewportSize(PHONE)
    const after = page.getByRole('dialog', { name: 'Approval gate' })
    await expect(after).toBeVisible()
    await expect(after.getByText('v1 approved · sent v1', { exact: true })).toBeVisible()
    await expect(after.locator('.ag[data-settled="true"]')).toBeVisible({ timeout: 600 })
    await expect(after.locator('[data-part="outbox"]')).toHaveAttribute('data-version', '1')
  })
})
