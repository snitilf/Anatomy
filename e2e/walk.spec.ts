import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { open, pickPart } from './helpers.ts'

const SIXTY = 'e2e/fixtures/sixty-parts.board.json'
const NORDET = 'src/examples/nordet.board.json'

interface Raw {
  components: { id: string; label: string }[]
  relationships: { from: string; to: string }[]
}
const raw = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Raw

const here = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="location"]')

test('Alt with the arrows walks from a part to its target and back to its source', async ({ page }) => {
  await open(page, NORDET)
  await pickPart(page, 'rule-check')
  await expect(here(page)).toHaveText('Rule check')
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveText('Preview')
  // The sidebar follows.
  await expect(page.getByTestId('inspector').getByRole('heading', { level: 2, name: 'Preview' })).toBeVisible()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(here(page)).toHaveText('Rule check')
})

test('Alt with the arrows steps from a connection to the part at its end', async ({ page }) => {
  await open(page, NORDET)
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill('proposes an action')
  await menu.getByRole('option', { name: /^proposes an action/ }).first().click()
  await expect(here(page)).toHaveText('proposes an action')
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveText('Preview')
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
  await open(page, NORDET)
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveCount(0)
  await pickPart(page, 'rule-check')
  await page.keyboard.press('c')
  await expect(page.getByRole('textbox').first()).toBeFocused()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(here(page)).toHaveText('Rule check')
})

test('the command menu lists the walk keys', async ({ page }) => {
  await open(page, NORDET)
  await pickPart(page, 'rule-check')
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await expect(menu.getByRole('option', { name: /^Go to target/ })).toContainText(/(⌥|Alt ?)→/)
  await expect(menu.getByRole('option', { name: /^Go to source/ })).toContainText(/(⌥|Alt ?)←/)
})
