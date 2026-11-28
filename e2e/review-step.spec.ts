/// <reference lib="dom" />
/**
 * Review step-through (M19c): J and K walk the answers that wait for a decision, one card at a time, and the map
 * follows each step. Every card carries Keep, Dismiss, and Reply, and each one lands where the round trip needs it.
 */
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { openStandInFolder, standInFileText, writeStandInFile, type FolderFile } from './helpers.ts'
import { fingerprintPart, seedFolder, SHORTENER } from './states.ts'

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
  const row = answers(page).getByRole('button', { name: q.text })
  await expect(row).toBeFocused()
  await expect(answers(page).getByText(q.text)).toBeInViewport()
  await expect(answers(page).getByText(q.answer)).toBeInViewport()
  await expect(card(page, q.part.id).locator('[data-card]')).toHaveAttribute('data-selected')
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
    await page.keyboard.press('Shift+Digit1')
    await part(page, second.part.label).click()
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

test('Reply opens an empty question on the same part, so Add alone makes no copy', async ({ page }) => {
  const file = BOARDS[1]!
  const board = await readBoard(file)
  const [first, second] = questionsFor(board)
  await reviewWithAnswers(page, file, [first, second])

  await answers(page).locator('li').filter({ hasText: first.text }).getByRole('button', { name: 'Reply' }).click()
  const panel = review(page)

  // The part comes up in Details, and the note input on it is an empty question.
  await expect(panel.getByRole('heading', { name: first.part.label })).toBeVisible()
  const field = panel.getByRole('textbox', { name: 'Add a question' })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('')
  await expect(panel.getByRole('radio', { name: 'Question' })).toBeChecked()

  // With nothing typed there is nothing to add, so no copy of the question.
  const notes = panel.getByRole('region', { name: 'Notes' })
  await expect(panel.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
  await expect(notes.getByText(first.text, { exact: true })).toHaveCount(1)

  // A few words make it the follow-up, and it goes to the part like any question.
  const followUp = 'Say who tests it.'
  await field.fill(followUp)
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(notes.getByText(followUp)).toBeVisible()
  await expect(notes.getByText(first.text, { exact: true })).toHaveCount(1)
})

const AT = '2026-11-14T00:00:00.000Z'

/** Opens the shortener with items the agent has already answered, on the map, with the Review tab in front. */
async function openAnswered(page: Page, items: Record<string, unknown[]>, replies: { id: string; text: string }[]) {
  const text = await readFile(SHORTENER, 'utf8')
  const board = JSON.parse(text) as FolderFile
  const layer = {
    format: 'anatomy-layer',
    schemaVersion: 2,
    boardId: board.id,
    positions: {},
    sizes: {},
    notes: [],
    links: [],
    marks: [],
    proposals: [],
    reconnects: [],
    archive: [],
    ...items,
    answers: replies.map((r) => ({ id: r.id, response: { respondsTo: 'feedback-step00001', status: 'answered', text: r.text, changed: [] } })),
  }
  await seedFolder(page, text, layer)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.getByRole('tab', { name: 'Map' }).or(page.getByRole('region', { name: 'Sidebar' })).first()).toBeVisible()
  await page.waitForTimeout(300)
  // A crowded window opens on the Overview. The steps are on the map.
  if (await page.getByTestId('overview').isVisible()) await page.getByRole('tab', { name: 'Map' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await review(page).getByRole('tab', { name: /^Review/ }).click()
  await expect(answers(page).locator('li')).toHaveCount(replies.length)
  return board
}

/** A question about one part, written against the part as it is, so it reads as current. */
const questionOn = (board: FolderFile, id: string, partId: string, text: string) => ({
  id,
  kind: 'question',
  text,
  target: { type: 'component', id: partId },
  targetFingerprint: fingerprintPart(board as unknown as Parameters<typeof fingerprintPart>[0], partId),
  createdAt: AT,
  updatedAt: AT,
})

const node = (id: string) => `.react-flow__node[data-id="${id}"]`

/** Whether every element shows whole inside the map. */
const wholeInView = (page: Page, selectors: string[]) =>
  page.evaluate((list) => {
    const map = document.querySelector('.react-flow')?.getBoundingClientRect()
    if (!map) return false
    return list.every((selector) => {
      const r = document.querySelector(selector)?.getBoundingClientRect()
      return r !== undefined && r.left >= map.left - 1 && r.right <= map.right + 1 && r.top >= map.top - 1 && r.bottom <= map.bottom + 1
    })
  }, selectors)

/** Zooms in and drags the map until some of the elements are off it. */
async function panOff(page: Page, selectors: string[]) {
  for (let i = 0; i < 4; i++) await page.keyboard.press('+')
  const from = await panePoint(page)
  if (!from) throw new Error('no empty place on the map to drag from')
  for (let i = 0; i < 5 && (await wholeInView(page, selectors)); i++) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let s = 1; s <= 8; s++) {
      await page.mouse.move(from.x - (420 * s) / 8, from.y + (300 * s) / 8)
      await page.waitForTimeout(20)
    }
    await page.mouse.up()
    await page.waitForTimeout(100)
  }
  expect(await wholeInView(page, selectors), 'the item never left the view').toBe(false)
}

test('J frames every kind of item with a place on the map: a connection, a link, a drawing, a new part, a moved connection', async ({ page }) => {
  const items = {
    notes: [{ id: 'note-step00001', kind: 'question', text: 'Is this lookup cached?', target: { type: 'relationship', id: 'r-redirect-to-store' }, targetFingerprint: 'x', createdAt: AT, updatedAt: AT }],
    links: [{ id: 'link-step00001', from: 'web-form', to: 'link-cache', label: 'Shares the cache', createdAt: AT }],
    marks: [{ id: 'mark-step00001', kind: 'rect', x: 0, y: -240, width: 240, height: 120, note: 'Group these two', createdAt: AT }],
    proposals: [{ id: 'part-step00001', label: 'Rate limiter', summary: '', x: -480, y: 0, width: 200, height: 90, createdAt: AT }],
    reconnects: [{ id: 'edit-step00001', relationshipId: 'r-visitor-to-domain', to: 'redirect-handler', createdAt: AT }],
  }
  await openAnswered(page, items, ['note-step00001', 'link-step00001', 'mark-step00001', 'part-step00001', 'edit-step00001'].map((id) => ({ id, text: 'Noted.' })))

  const steps = [
    { row: /^Is this lookup cached\?/, show: [node('redirect-handler'), node('link-store')] },
    { row: /^Shares the cache/, show: [node('web-form'), node('link-cache')] },
    { row: /^Group these two/, show: ['[data-mark="mark-step00001"]'] },
    { row: /^Rate limiter/, show: [node('part-step00001')] },
    { row: /^GET short code/, show: [node('visitor-browser'), node('redirect-handler')] },
  ]
  let before: (typeof steps)[number] | undefined
  for (const step of steps) {
    await panOff(page, step.show)
    // The drag took the focus off the card in front; the user comes back to it before the next step.
    if (before) await answers(page).getByRole('button', { name: before.row }).focus()
    await page.keyboard.press('j')
    await expect(answers(page).getByRole('button', { name: step.row })).toBeFocused()
    await expect.poll(() => wholeInView(page, step.show), { message: `${String(step.row)} is framed` }).toBe(true)
    before = step
  }
})

test('Keep and Dismiss hand the focus to the next card, and J goes on from there', async ({ page }) => {
  const text = await readFile(SHORTENER, 'utf8')
  const board = JSON.parse(text) as FolderFile
  const long = 'Which database holds the links, how is each one keyed, and when does an old link leave the table for good?'
  const notes = [questionOn(board, 'note-keep00001', 'web-form', 'Who owns the form?'), questionOn(board, 'note-keep00002', 'link-store', long), questionOn(board, 'note-keep00003', 'edge-dns', 'When does DNS change?')]
  await openAnswered(page, { notes }, notes.map((n) => ({ id: n.id, text: `About ${n.text}` })))
  const row = (text: string) => answers(page).getByRole('button', { name: text })
  const cardOf = (text: string) => answers(page).locator('li').filter({ has: page.getByRole('button', { name: text }) })

  await page.keyboard.press('j')
  await expect(row('Who owns the form?')).toBeFocused()
  await page.keyboard.press('j')
  await expect(row(long)).toBeFocused()
  // The card in front shows its whole question, not one clipped line.
  expect(await row(long).evaluate((el) => [...el.querySelectorAll('span')].every((s) => s.scrollWidth <= s.clientWidth + 1))).toBe(true)
  // Each action says which question it settles.
  for (const name of ['Keep', 'Dismiss', 'Reply']) await expect(cardOf(long).getByRole('button', { name })).toHaveAccessibleDescription(long)

  // Keep from the keyboard: the next card comes to the front, on the map too.
  await page.keyboard.press('Tab')
  await expect(cardOf(long).getByRole('button', { name: 'Keep' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(answers(page).locator('li')).toHaveCount(2)
  await expect(row('When does DNS change?')).toBeFocused()
  await expect(card(page, 'edge-dns').locator('[data-card]')).toHaveAttribute('data-selected')
  // The kept question no longer says its answer waits in Review.
  await expect(card(page, 'link-store').locator('[role="img"][data-state]')).toHaveAttribute('data-state', 'kept')

  // J goes on from the card in front, around the end.
  await page.keyboard.press('j')
  await expect(row('Who owns the form?')).toBeFocused()
  await page.keyboard.press('k')
  await expect(row('When does DNS change?')).toBeFocused()

  // Dismiss on the last card: the one before it comes to the front.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(cardOf('When does DNS change?').getByRole('button', { name: 'Dismiss' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(answers(page).locator('li')).toHaveCount(1)
  await expect(row('Who owns the form?')).toBeFocused()

  // The last one kept: nothing is left to step to, and the focus waits on the Review tab, not on the page.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(answers(page)).toHaveCount(0)
  await expect(review(page).getByRole('tab', { name: /^Review/ })).toBeFocused()
})

test('J opens the Answers group when it was closed', async ({ page }) => {
  const text = await readFile(SHORTENER, 'utf8')
  const board = JSON.parse(text) as FolderFile
  const notes = [questionOn(board, 'note-open00001', 'web-form', 'Who owns the form?')]
  await openAnswered(page, { notes }, [{ id: notes[0]!.id, text: 'Team A.' }])
  const toggle = answers(page).getByRole('button', { name: /^Answers/ })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('j')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(answers(page).getByRole('button', { name: 'Who owns the form?' })).toBeFocused()
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
    await expect(answers(page).getByRole('button', { name: first.text })).toBeFocused()
    const state = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a instanceof CSSAnimation).length)
    expect(state).toBe(0)
    await expect(card(page, first.part.id)).toBeInViewport()
  })
})
