import { expect, test } from '@playwright/test'
import { open } from './helpers.ts'

const SHORTENER = 'src/examples/external/url-shortener.board.json'

const tab = (page: import('@playwright/test').Page, name: 'Map' | 'Overview') => page.getByRole('tab', { name })

test('a board opens on the map, and the tabs switch the view and the address', async ({ page }) => {
  await open(page, SHORTENER)
  await expect(tab(page, 'Map')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await tab(page, 'Overview').click()
  await expect(page.getByTestId('overview')).toBeVisible()
  expect(new URL(page.url()).hash).toBe('#overview')
  // The sidebar toggle is gone on the Overview.
  await expect(page.getByRole('button', { name: /sidebar/i })).toHaveCount(0)
  await tab(page, 'Map').click()
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hide sidebar' })).toBeVisible()
})

test('G then O and G then M switch the view', async ({ page }) => {
  await open(page, SHORTENER)
  await page.keyboard.press('g')
  await page.keyboard.press('o')
  await expect(page.getByTestId('overview')).toBeVisible()
  // O alone is not the Ellipse tool on this page, and the map did not change tool.
  await page.keyboard.press('g')
  await page.keyboard.press('m')
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
})

test('the browser back button returns to the map and forward to the Overview', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  await expect(page.getByTestId('overview')).toBeVisible()
  await page.goBack()
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await page.goForward()
  await expect(page.getByTestId('overview')).toBeVisible()
})

test('the command menu goes to the Overview and back to the map', async ({ page }) => {
  await open(page, SHORTENER)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('option', { name: /^Go to Overview/ }).click()
  await expect(page.getByTestId('overview')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('option', { name: /^Go to Map/ }).click()
  await expect(page.getByTestId('overview')).toHaveCount(0)
})

test('the last view is remembered per board', async ({ page }) => {
  await open(page, SHORTENER)
  await tab(page, 'Overview').click()
  await page.reload()
  await page.getByLabel('Board file').setInputFiles(SHORTENER)
  await expect(page.getByTestId('overview')).toBeVisible()
})
