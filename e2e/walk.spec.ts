import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { open, pickPart } from './helpers.ts'

const SIXTY = 'e2e/fixtures/sixty-parts.board.json'
const REFUND = 'src/examples/refund-approval.board.json'

interface Raw {
  components: { id: string; label: string }[]
  relationships: { from: string; to: string }[]
}
const raw = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Raw

const here = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="location"]')

test('Alt with the arrows walks from a part to its target and back to its source', async ({ page }) => {
  await open(page, REFUND)
  await pickPart(page, 'policy-check')
  await expect(here(page)).toHaveText('Policy check')
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveText('Payout preview')
  // The sidebar follows.
  await expect(page.getByTestId('inspector').getByRole('heading', { level: 2, name: 'Payout preview' })).toBeVisible()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(here(page)).toHaveText('Policy check')
})

test('Alt with the arrows steps from a connection to the part at its end', async ({ page }) => {
  await open(page, REFUND)
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill('proposes an action')
  await menu.getByRole('option', { name: /^proposes an action/ }).first().click()
  await expect(here(page)).toHaveText('proposes an action')
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveText('Payout preview')
})

test('Alt with up and down cycles the parts that share a source, and the camera follows each step', async ({ page }) => {
  const board = raw(SIXTY)
  const outs = new Map<string, string[]>()
  for (const r of board.relationships) outs.set(r.from, [...(outs.get(r.from) ?? []), r.to])
  const [source, targets] = [...outs.entries()].find(([, list]) => new Set(list).size >= 2)!
  const unique = [...new Set(targets)]
  const label = (id: string) => board.components.find((c) => c.id === id)!.label
  await open(page, SIXTY)
  await pickPart(page, source)
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveText(label(unique[0]!))
  await page.keyboard.press('Alt+ArrowDown')
  await expect(here(page)).toHaveText(label(unique[1]!))
  // At the end of the row it wraps.
  await page.keyboard.press('Alt+ArrowDown')
  await expect(here(page)).toHaveText(label(unique[0]!))
  await page.keyboard.press('Alt+ArrowUp')
  await expect(here(page)).toHaveText(label(unique[1]!))
  // The camera follows: the part stepped to is on screen.
  const id = unique[1]!
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const map = document.querySelector('.react-flow')!.getBoundingClientRect()
        const r = document.querySelector(`.react-flow__node-card[data-id="${id}"]`)?.getBoundingClientRect()
        return !!r && r.left >= map.left && r.right <= map.right && r.top >= map.top && r.bottom <= map.bottom
      }, id),
    )
    .toBe(true)
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(here(page)).toHaveText(label(source))
})

test('the walk keys do nothing with nothing selected, or in a text field', async ({ page }) => {
  await open(page, REFUND)
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveCount(0)
  await pickPart(page, 'policy-check')
  await page.keyboard.press('c')
  await expect(page.getByRole('textbox').first()).toBeFocused()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveText('Policy check')
})

test('the command menu lists the walk keys', async ({ page }) => {
  await open(page, REFUND)
  await pickPart(page, 'policy-check')
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await expect(menu.getByRole('option', { name: /^Go to target/ })).toContainText(/(⌥|Alt ?)→/)
  await expect(menu.getByRole('option', { name: /^Go to source/ })).toContainText(/(⌥|Alt ?)←/)
})

test('Alt with the arrows never navigates the browser history', async ({ page }) => {
  await open(page, REFUND)
  // Two history entries: the Overview, and back on the map.
  await pickPart(page, 'policy-check')
  const entries = await page.evaluate(() => window.history.length)
  expect(entries).toBeGreaterThan(1)
  const url = page.url()
  await page.keyboard.press('Alt+ArrowLeft')
  await page.keyboard.press('Alt+ArrowRight')
  await page.waitForTimeout(300)
  expect(page.url()).toBe(url)
  expect(new URL(page.url()).hash).toBe('')
  await expect(page.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('overview')).toHaveCount(0)
  // The keys were taken by the walk, not left to the browser: the selection moved there and back.
  await expect(here(page)).toHaveText('Policy check')
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveText('Payout preview')
  expect(page.url()).toBe(url)
  // The default of the key is prevented, which is what stops Back on Windows and Linux.
  const prevented = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true })
        document.body.dispatchEvent(event)
        resolve(event.defaultPrevented)
      }),
  )
  expect(prevented).toBe(true)
})

test('Alt+ArrowRight on a part with no outgoing line is still taken, and the selection stays', async ({ page }) => {
  await open(page, REFUND)
  await pickPart(page, 'payout-ledger')
  await expect(here(page)).toHaveText('Payout ledger')
  const prevented = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true })
        document.body.dispatchEvent(event)
        resolve(event.defaultPrevented)
      }),
  )
  expect(prevented).toBe(true)
  await expect(here(page)).toHaveText('Payout ledger')
  // The menu does not offer a step there.
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Command menu' }).getByRole('option', { name: /^Go to target/ })).toHaveCount(0)
})
