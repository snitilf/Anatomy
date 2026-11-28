/// <reference lib="dom" />
/**
 * A revision arrives (M19b): a banner says what the agent did and stays until the user acts, the tab title counts it, the
 * Send button waits for the agent, a changed part shows its words before and after, and a file that cannot be opened leaves
 * the open board alone with a quiet warning.
 */
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'

const KEY = 'anatomy:test-folder'
const BOARD = 'e2e/fixtures/url-shortener.board.json'

interface Part {
  id: string
  label: string
  summary: string
  position?: unknown
  lesson?: unknown
}
interface BoardFile {
  revision: number
  goal: string
  components: Part[]
  relationships: { id: string; from: string; to: string; label: string }[]
  responses?: unknown
}

const fileText = (page: Page, name: string) =>
  page.evaluate(([key, file]) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { files: Record<string, { text: string }> }).files[file]?.text, [KEY, name] as const)

/** Writes a file into the stand-in folder, as the agent would. */
const writeFile = (page: Page, name: string, text: string) =>
  page.evaluate(
    ([key, file, body]) => {
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { files: Record<string, { text: string; lastModified: number }> }
      stored.files[file] = { text: body, lastModified: Date.now() }
      localStorage.setItem(key, JSON.stringify(stored))
    },
    [KEY, name, text] as const,
  )

async function openFolder(page: Page, file = BOARD) {
  const text = await readFile(file, 'utf8')
  await page.addInitScript(
    ([key, body]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ name: 'shortener', files: { 'board.json': { text: body, lastModified: 1 } }, remembered: false }))
    },
    [KEY, text] as const,
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await page.waitForTimeout(400)
  return JSON.parse(text) as BoardFile
}

const sendButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Send to agent/ })
const banner = (page: Page) => page.getByRole('status', { name: 'Revision update' })
const problem = (page: Page) => page.getByRole('status', { name: 'Board file problem' })

async function ask(page: Page, text: string) {
  const panel = page.getByRole('complementary')
  await panel.getByRole('textbox', { name: /^Add a (note|question)$/ }).click()
  await panel.getByRole('radio', { name: 'Question' }).check()
  await panel.getByRole('textbox', { name: 'Add a question' }).fill(text)
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByText(text).first()).toBeVisible()
}

test.use({ viewport: { width: 1440, height: 900 } })

test('after Send the button waits for the agent, and the revision arrives as a banner with a count in the tab title', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const board = await openFolder(page)
  await expect(sendButton(page)).toHaveAccessibleName('Send to agent')
  await expect(page).toHaveTitle('Anatomy')

  await ask(page, 'Where are the short codes kept?')
  await sendButton(page).click()
  const popover = page.getByRole('dialog', { name: 'Send to agent' })
  await popover.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(popover.getByText('Sent 1 item')).toBeVisible()
  await page.keyboard.press('Escape')

  // Waiting is shown in words, and the button still opens what was sent.
  await expect(sendButton(page)).toHaveAccessibleName('Send to agent, waiting for the agent')
  await expect(sendButton(page)).toContainText('Waiting for the agent')
  // New work to send takes the button back.
  await ask(page, 'Is the cache warm?')
  await expect(sendButton(page)).toHaveAccessibleName('Send to agent, 1 new')
  const sent = JSON.parse((await fileText(page, 'feedback.json')) ?? 'null') as { id: string; items: { id: string }[] }

  // The agent answers, changes a part, and adds a part with a connection.
  const next = structuredClone(board)
  next.revision = 2
  next.components[0]!.summary = `${next.components[0]!.summary} It now retries once.`
  const { position: _p, lesson: _l, ...base } = next.components[1]!
  next.components.push({ ...base, id: 'rate-limiter', label: 'Rate limiter', summary: 'Slows down a visitor who asks too often.' })
  next.relationships.push({ ...structuredClone(next.relationships[0]!), id: 'limit-line', from: base.id, to: 'rate-limiter', label: 'checks with' })
  next.responses = { respondsTo: sent.id, items: [{ feedbackId: sent.items[0]!.id, status: 'answered', text: 'In the link store.', changed: [] }] }
  await writeFile(page, 'board.json', JSON.stringify(next, null, 2))

  await expect(banner(page)).toHaveText(/Revision 2: 1 answer, 1 new part, 1 changed part, 1 new connection\./, { timeout: 15_000 })
  await expect(page).toHaveTitle('(4) Anatomy')
  // Nothing opened by itself, and the banner stays while the user looks around.
  await page.locator('.react-flow__node-card').first().click()
  await page.waitForTimeout(600)
  await expect(banner(page)).toBeVisible()
  // The answer ended the wait.
  await expect(sendButton(page)).not.toContainText('Waiting')

  // Review opens the tab with the answer, and the banner and the count go.
  await banner(page).getByRole('button', { name: 'Review' }).click()
  await expect(banner(page)).toHaveCount(0)
  await expect(page).toHaveTitle('Anatomy')
  const review = page.getByRole('complementary')
  await expect(review.getByRole('region', { name: 'Answers' }).getByText('In the link store.')).toBeVisible()
})

test('a changed part shows its words before and after in the details, until the changes are marked reviewed', async ({ page }) => {
  const board = await openFolder(page)
  const next = structuredClone(board)
  next.revision = 2
  const part = next.components[2]!
  const was = part.summary
  part.summary = `${was} It also logs the request.`
  next.goal = 'Turn a long link into a short one, and count the visits.'
  await writeFile(page, 'board.json', JSON.stringify(next, null, 2))
  await expect(banner(page)).toHaveText(/Revision 2: 1 changed part, goal changed\./, { timeout: 15_000 })

  await page.getByRole('group', { name: new RegExp(`^${part.label}(,|$)`) }).click()
  const panel = page.getByRole('complementary')
  const change = panel.getByRole('region', { name: 'Changed in revision 2' })
  const summary = change.getByRole('group', { name: 'Summary' })
  await expect(summary).toContainText('Before')
  await expect(summary).toContainText(was)
  await expect(summary.locator('ins')).toHaveText('It also logs the request.')
  // The words that were added are underlined and the removed ones struck through, so the change reads without color.
  await expect(summary.locator('ins')).toHaveCSS('text-decoration-line', 'underline')

  // The board's own change shows at the top of the board view.
  await panel.getByRole('button', { name: 'Board' }).click()
  const goal = panel.getByRole('region', { name: 'Changed in revision 2' }).getByRole('group', { name: 'Goal' })
  await expect(goal.locator('ins')).toContainText('and count the visits')

  // Mark reviewed clears it.
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill('Mark reviewed')
  await page.keyboard.press('Enter')
  await expect(panel.getByRole('region', { name: 'Changed in revision 2' })).toHaveCount(0)
  await expect(banner(page)).toHaveCount(0)
})

test('a board with a problem, or a revision that did not rise, keeps the open board and says so quietly', async ({ page }) => {
  const board = await openFolder(page)
  const cards = await page.locator('.react-flow__node-card').count()

  // Valid JSON that is not a board: two problems, and nothing moves.
  const broken = structuredClone(board) as Partial<BoardFile>
  delete broken.goal
  broken.revision = 2
  await writeFile(page, 'board.json', JSON.stringify(broken))
  await expect(problem(page)).toContainText('board.json has 1 problem, so revision 1 stays open.', { timeout: 15_000 })
  await expect(problem(page)).toContainText('goal')
  await expect(page.locator('.react-flow__node-card')).toHaveCount(cards)
  await expect(banner(page)).toHaveCount(0)

  // The same revision with new words is not opened either.
  const same = structuredClone(board)
  same.components[0]!.summary = 'Edited without raising the revision.'
  await writeFile(page, 'board.json', JSON.stringify(same))
  await expect(problem(page)).toContainText('board.json changed but is still revision 1.', { timeout: 15_000 })
  await expect(page.locator('.react-flow__node-card')).toHaveCount(cards)

  // Dismiss closes it, and a valid higher revision opens and says so.
  await problem(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(problem(page)).toHaveCount(0)
  await writeFile(page, 'board.json', JSON.stringify({ ...same, revision: 2 }))
  await expect(banner(page)).toHaveText(/Revision 2: 1 changed part\./, { timeout: 15_000 })
  await expect(problem(page)).toHaveCount(0)
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the banner is at rest, and its Review button works from the keyboard', async ({ page }) => {
    const board = await openFolder(page)
    const next = structuredClone(board)
    next.revision = 2
    next.components[0]!.summary = 'A new summary of the form.'
    await writeFile(page, 'board.json', JSON.stringify(next, null, 2))
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    const rest = await banner(page).evaluate((el) => ({ opacity: Number(getComputedStyle(el).opacity), running: el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length }))
    expect(rest).toEqual({ opacity: 1, running: 0 })
    await banner(page).getByRole('button', { name: 'Review' }).focus()
    await page.keyboard.press('Enter')
    await expect(banner(page)).toHaveCount(0)
    await expect(page.getByRole('tab', { name: /^Review/ })).toHaveAttribute('aria-selected', 'true')
  })
})
