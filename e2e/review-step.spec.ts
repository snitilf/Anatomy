/// <reference lib="dom" />
/**
 * Review step-through (M19c): J and K walk the answers that wait for a decision, one card at a time, and the map
 * follows each step. Every card carries Keep, Dismiss, and Reply, and each one lands where the round trip needs it.
 */
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { openStandInFolder, standInFileText, writeStandInFile, type FolderFile } from './helpers.ts'

const BOARDS = ['e2e/fixtures/url-shortener.board.json', 'e2e/fixtures/refund-approval.board.json']

const readBoard = async (file: string) => JSON.parse(await readFile(file, 'utf8')) as FolderFile

interface Pending {
  part: { id: string; label: string }
  text: string
  answer: string
}

const re = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const review = (page: Page) => page.getByRole('complementary')
const answers = (page: Page) => review(page).getByRole('region', { name: 'Answers' })
const banner = (page: Page) => page.getByRole('status', { name: 'Revision update' })
const sendButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Send to agent/ })
const card = (page: Page, id: string) => page.locator(`.react-flow__node-card[data-id="${id}"]`)
const part = (page: Page, label: string) => page.getByRole('group', { name: new RegExp(`^${re(label)}(,|$)`) })

/** Two questions about two parts of the board, so the answers step between two places on the map. */
const questionsFor = (board: FolderFile): [Pending, Pending] => {
  const [a, b] = board.components
  if (!a || !b) throw new Error('the board has too few parts')
  return [
    { part: { id: a.id, label: a.label }, text: `Who owns ${a.label}?`, answer: 'The team that owns the repository.' },
    { part: { id: b.id, label: b.label }, text: `When does ${b.label} run?`, answer: 'On every request.' },
  ]
}

/** Clicks the part on the map and asks a question about it. */
async function askAbout(page: Page, label: string, text: string) {
  await part(page, label).click()
  const panel = review(page)
  await panel.getByRole('textbox', { name: /^Add a (note|question)$/ }).click()
  await panel.getByRole('radio', { name: 'Question' }).check()
  await panel.getByRole('textbox', { name: 'Add a question' }).fill(text)
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByText(text).first()).toBeVisible()
}

/** Sends the questions, has the agent answer them in the next revision, and opens the Review tab. */
async function reviewWithAnswers(page: Page, file: string, pending: Pending[]) {
  const board = await openStandInFolder(page, file)
  for (const q of pending) await askAbout(page, q.part.label, q.text)

  await sendButton(page).click()
  const popover = page.getByRole('dialog', { name: 'Send to agent' })
  await popover.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(popover.getByText(`Sent ${pending.length} item${pending.length === 1 ? '' : 's'}`)).toBeVisible()
  await page.keyboard.press('Escape')

  const sent = JSON.parse((await standInFileText(page, 'feedback.json')) ?? 'null') as { id: string; items: { id: string; text: string }[] }
  const next = structuredClone(board)
  next.revision = board.revision + 1
  next.responses = {
    respondsTo: sent.id,
    items: pending.map((q) => {
      const item = sent.items.find((i) => i.text === q.text)
      if (!item) throw new Error(`"${q.text}" was never sent`)
      return { feedbackId: item.id, status: 'answered', text: q.answer, changed: [] }
    }),
  }
  await writeStandInFile(page, 'board.json', JSON.stringify(next, null, 2))
  await expect(banner(page)).toHaveText(new RegExp(`Revision ${next.revision}: ${pending.length} answer${pending.length === 1 ? '' : 's'}\\.`), { timeout: 15_000 })

  await banner(page).getByRole('button', { name: 'Review' }).click()
  await expect(banner(page)).toHaveCount(0)
  await expect(answers(page).locator('li')).toHaveCount(pending.length)
  return next
}

/** Whether the card sits inside the map, whatever the zoom. */
const inView = (page: Page, id: string) =>
  page.evaluate((cardId) => {
    const map = document.querySelector('.react-flow')?.getBoundingClientRect()
    const el = document.querySelector(`.react-flow__node-card[data-id="${cardId}"]`)
    if (!el || !map) return false
    const r = el.getBoundingClientRect()
    return r.right > map.left && r.bottom > map.top && r.left < map.right && r.top < map.bottom
  }, id)

/** An empty point of the map that a drag pans from, on the right half so the drag stays inside the window. */
const panePoint = (page: Page) =>
  page.evaluate(() => {
    const pane = document.querySelector('.react-flow__pane')?.getBoundingClientRect()
    if (!pane) return undefined
    for (let fx = 0.96; fx >= 0.5; fx -= 0.04) {
      for (let fy = 0.08; fy <= 0.5; fy += 0.04) {
        const x = pane.left + pane.width * fx
        const y = pane.top + pane.height * fy
        if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y }
      }
    }
    return undefined
  })

/** Zooms in and drags the map until the given card has left it. */
async function panAway(page: Page, id: string) {
  // Zoomed in, the board is larger than the view, so the drag has room to move the card out.
  for (let i = 0; i < 4; i++) await page.keyboard.press('+')
  const from = await panePoint(page)
  if (!from) throw new Error('no empty place on the map to drag from')
  for (let i = 0; i < 5 && (await inView(page, id)); i++) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let s = 1; s <= 8; s++) {
      await page.mouse.move(from.x - (420 * s) / 8, from.y + (300 * s) / 8)
      await page.waitForTimeout(20)
    }
    await page.mouse.up()
    await page.waitForTimeout(100)
  }
  expect(await inView(page, id), 'the card never left the view').toBe(false)
}

/** One step of the walkthrough asserts: the card in front holds the focus, and the map holds the part. */
async function stepIs(page: Page, q: Pending) {
  const row = answers(page).getByRole('button', { name: re(q.text) })
  await expect(row).toBeFocused()
  await expect(answers(page).getByText(q.text)).toBeInViewport()
  await expect(answers(page).getByText(q.answer)).toBeInViewport()
  await expect(card(page, q.part.id)).toHaveAttribute('data-selected', '')
  await expect(card(page, q.part.id)).toBeInViewport()
}

test.use({ viewport: { width: 1440, height: 900 } })

for (const file of BOARDS) {
  test(`J and K step through the answers of ${file.split('/').pop()}, and the map follows`, async ({ page }) => {
    const board = await readBoard(file)
    const [first, second] = questionsFor(board)
    await reviewWithAnswers(page, file, [first, second])

    // The map has moved off the first part, so the step has to bring it back.
    await panAway(page, first.part.id)
    await page.keyboard.press('j')
    await stepIs(page, first)

    // On to the second, back to the first, and around both ends.
    await page.keyboard.press('j')
    await stepIs(page, second)
    await page.keyboard.press('k')
    await stepIs(page, first)
    await page.keyboard.press('k')
    await stepIs(page, second)
    await page.keyboard.press('j')
    await stepIs(page, first)

    // The keys stay quiet while a field has the focus.
    await page.locator('.react-flow__node-card').first().click()
    const field = review(page).getByRole('textbox', { name: /^Add a (note|question)$/ })
    await field.click()
    await page.keyboard.type('jk')
    await expect(field).toHaveValue(/jk/)
    await review(page).getByRole('tab', { name: /^Review/ }).click()
    await page.keyboard.press('j')
    await stepIs(page, first)
  })
}

test('Keep leaves the item on the map with its answer, out of the review', async ({ page }) => {
  const file = BOARDS[0]!
  const board = await readBoard(file)
  const [first, second] = questionsFor(board)
  await reviewWithAnswers(page, file, [first, second])
  const group = answers(page)

  await group.locator('li').filter({ hasText: first.text }).getByRole('button', { name: 'Keep' }).click()
  await expect(group.locator('li')).toHaveCount(1)
  await expect(group).not.toContainText(first.text)
  await expect(review(page).getByRole('tab', { name: /^Review/ })).toHaveAccessibleName(/Review 1/)

  // The question is still on the map, with its answer next to it.
  await part(page, first.part.label).click()
  const notes = review(page).getByRole('region', { name: 'Notes' })
  await expect(notes.getByText(first.text)).toBeVisible()
  await expect(notes.getByText(first.answer)).toBeVisible()

  // One undo brings the card back to the answers that wait.
  await page.keyboard.press('ControlOrMeta+z')
  await expect(review(page).getByRole('tab', { name: /^Review/ })).toHaveAccessibleName(/Review 2/)
  await review(page).getByRole('tab', { name: /^Review/ }).click()
  await expect(group.locator('li')).toHaveCount(2)
  await expect(group.getByText(second.text)).toBeVisible()
})

test('Dismiss takes the item and its answer off the map, into the archive, and back', async ({ page }) => {
  const file = BOARDS[0]!
  const board = await readBoard(file)
  const [first, second] = questionsFor(board)
  await reviewWithAnswers(page, file, [first, second])
  const group = answers(page)

  await group.locator('li').filter({ hasText: first.text }).getByRole('button', { name: 'Dismiss' }).click()
  await expect(group.locator('li')).toHaveCount(1)

  // The question left the part it was on.
  await part(page, first.part.label).click()
  await expect(review(page).getByRole('region', { name: 'Notes' })).toHaveCount(0)

  // It waits in the archive, and Restore brings it back with its answer.
  await review(page).getByRole('tab', { name: /^Review/ }).click()
  const archive = review(page).getByRole('region', { name: 'Archive' })
  await archive.getByRole('button', { name: /Archive 1/ }).click()
  await expect(archive).toContainText(first.text)
  await archive.getByRole('button', { name: 'Restore' }).click()
  await expect(group.locator('li')).toHaveCount(2)
  await expect(group.getByText(first.answer)).toBeVisible()
})

test('Reply opens the note input on the same part, holding the question', async ({ page }) => {
  const file = BOARDS[1]!
  const board = await readBoard(file)
  const [first, second] = questionsFor(board)
  await reviewWithAnswers(page, file, [first, second])

  await answers(page).locator('li').filter({ hasText: first.text }).getByRole('button', { name: 'Reply' }).click()
  const panel = review(page)

  // The part comes up in Details, and the note input on it is a question holding the words of the first one.
  await expect(panel.getByRole('heading', { name: re(first.part.label) })).toBeVisible()
  const field = panel.getByRole('textbox', { name: 'Add a question' })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue(first.text)
  await expect(panel.getByRole('radio', { name: 'Question' })).toBeChecked()

  // A few words make it the follow-up, and it goes to the part like any question.
  const followUp = `${first.text} Say who tests it.`
  await field.fill(followUp)
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByRole('region', { name: 'Notes' }).getByText(followUp)).toBeVisible()
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the step lands at rest, with the card still framed', async ({ page }) => {
    const file = BOARDS[0]!
    const board = await readBoard(file)
    const [first] = questionsFor(board)
    await reviewWithAnswers(page, file, [first])
    await panAway(page, first.part.id)

    await page.keyboard.press('j')
    await expect(answers(page).getByRole('button', { name: re(first.text) })).toBeFocused()
    const state = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a instanceof CSSAnimation).length)
    expect(state).toBe(0)
    await expect(card(page, first.part.id)).toBeInViewport()
  })
})
