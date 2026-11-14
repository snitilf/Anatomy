/// <reference lib="dom" />
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

// The key src/workspace/testFolder.ts reads: a stand-in repository folder kept in localStorage.
const KEY = 'anatomy:test-folder'
const PROMPT = 'Read .anatomy/feedback.json and answer every item in the next revision of .anatomy/board.json. The format is in .anatomy/README.md.'

interface FeedbackFile {
  id: string
  baseRevision: number
  items: { id: string; type: string; text?: string; connection?: { id: string }; now?: { to: { id: string } }; encloses?: { id: string }[] }[]
  withdrawn: string[]
}

const fileText = (page: Page, name: string) =>
  page.evaluate(
    ([key, file]) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { files: Record<string, { text: string }> }).files[file]?.text,
    [KEY, name] as const,
  )

const feedback = async (page: Page) => JSON.parse((await fileText(page, 'feedback.json')) ?? 'null') as FeedbackFile

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

const cards = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.react-flow__node-card')].map((n) => {
      const r = n.getBoundingClientRect()
      return { id: n.dataset.id ?? '', x: r.x, y: r.y, width: r.width, height: r.height }
    }),
  )

async function dragLine(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
}

async function addNote(page: Page, kind: 'Note' | 'Question', text: string) {
  const panel = page.getByRole('complementary')
  await panel.getByRole('radio', { name: kind }).check()
  await panel.getByRole('textbox', { name: kind === 'Note' ? 'Add a note' : 'Add a question' }).fill(text)
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByText(text).first()).toBeVisible()
}

const sendButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Send to agent/ })

test('send to the agent, get answers in the next revision, dismiss, restore, and nothing is dropped on a second send', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const boardText = await readFile('src/examples/external/url-shortener.board.json', 'utf8')
  await page.addInitScript(
    ([key, text]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ name: 'shortener', files: { 'board.json': { text, lastModified: 1 } }, remembered: false }))
    },
    [KEY, boardText] as const,
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
  await page.waitForTimeout(400)
  await expect(sendButton(page)).toHaveAccessibleName('Send to agent')

  // A question about the board.
  await addNote(page, 'Question', 'Where are the short codes kept?')

  // A rectangle around two cards.
  const map = (await page.locator('.react-flow').boundingBox())!
  const shown = (await cards(page)).filter((c) => c.x > map.x + 10 && c.x + c.width < map.x + map.width - 20 && c.y > map.y + 10 && c.y + c.height < map.y + map.height - 120)
  const [a, b] = shown
  if (!a || !b) throw new Error('the board needs two cards in view')
  await page.getByRole('toolbar', { name: 'Whiteboard tools' }).getByRole('button', { name: 'Rectangle' }).click()
  await dragLine(
    page,
    { x: Math.min(a.x, b.x) - 16, y: Math.min(a.y, b.y) - 16 },
    { x: Math.max(a.x + a.width, b.x + b.width) + 16, y: Math.max(a.y + a.height, b.y + b.height) + 16 },
  )
  await expect(page.locator('[data-mark]')).toHaveCount(1)
  await page.keyboard.press('Escape')

  // Move the end of a connection onto another part.
  const line = await page.evaluate(() => {
    const map = document.querySelector('.react-flow')?.getBoundingClientRect()
    const label = [...document.querySelectorAll<HTMLElement>('[data-label][data-edge]')].find((l) => {
      const r = l.getBoundingClientRect()
      return map && r.left > map.left + 20 && r.right < map.right - 20 && r.top > map.top + 20 && r.bottom < map.bottom - 120
    })
    return label ? { id: label.dataset.edge ?? '', ends: (label.dataset.ends ?? '').split(' ') } : undefined
  })
  if (!line) throw new Error('no connection label in view')
  await page.locator(`[data-label][data-edge="${line.id}"]`).click()
  const end = (await page.locator('[data-end="to"] circle').first().boundingBox())!
  const other = (await cards(page)).find((c) => !line.ends.includes(c.id) && c.x > map.x && c.x + c.width < map.x + map.width - 20 && c.y + c.height < map.y + map.height - 100)
  if (!other) throw new Error('no free card')
  await dragLine(page, { x: end.x + end.width / 2, y: end.y + end.height / 2 }, { x: other.x + other.width / 2, y: other.y + other.height / 2 }, 16)
  await expect(page.locator(`[data-label][data-edge="${line.id}"][data-edited]`)).toBeVisible()
  await page.keyboard.press('Escape')

  // The button counts what is new, and the popover lists it.
  await expect(sendButton(page)).toHaveAccessibleName('Send to agent, 3 new')
  await page.keyboard.press('ControlOrMeta+Enter')
  const popover = page.getByRole('dialog', { name: 'Send to agent' })
  await expect(popover.getByRole('listitem')).toHaveText([/Questions\s*1/, /Moved connections\s*1/, /Drawings and shapes\s*1/])
  await popover.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(popover.getByText('Sent 3 items')).toBeVisible()
  await expect(popover.getByText('Prompt copied. Paste it to your agent.')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(PROMPT)
  const first = await feedback(page)
  expect(first.items.map((i) => i.type).sort()).toEqual(['question', 'reconnect', 'shape'])
  const reconnect = first.items.find((i) => i.type === 'reconnect')!
  expect(reconnect.connection?.id).toBe(line.id)
  expect(reconnect.now?.to.id).toBe(other.id)
  expect(first.items.find((i) => i.type === 'shape')?.encloses?.map((x) => x.id)).toEqual(expect.arrayContaining([a.id, b.id]))
  expect(await fileText(page, 'README.md')).toContain('### The responses block')
  await page.keyboard.press('Escape')
  await expect(sendButton(page)).toHaveAccessibleName('Send to agent')

  // A second send before the agent answers carries the first items again.
  await addNote(page, 'Note', 'The redirect should be cached.')
  await sendButton(page).click()
  await expect(popover.getByText('Includes 3 items sent before that have no answer yet.')).toBeVisible()
  await popover.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(popover.getByText('Sent 4 items')).toBeVisible()
  const second = await feedback(page)
  expect(second.id).not.toBe(first.id)
  expect(second.items.map((i) => i.id).sort()).toEqual([...first.items.map((i) => i.id), second.items.find((i) => i.type === 'note')!.id].sort())
  await page.keyboard.press('Escape')

  // The agent writes revision 2: it moves the connection, answers the question, and declines the rectangle.
  const shape = first.items.find((i) => i.type === 'shape')!
  const question = first.items.find((i) => i.type === 'question')!
  const next = JSON.parse(boardText) as { revision: number; relationships: { id: string; to: string }[]; responses?: unknown }
  next.revision = 2
  next.relationships = next.relationships.map((r) => (r.id === line.id ? { ...r, to: other.id } : r))
  next.responses = {
    respondsTo: second.id,
    items: [
      { feedbackId: reconnect.id, status: 'adopted', text: 'The call goes there now.', changed: [line.id] },
      { feedbackId: question.id, status: 'answered', text: 'In the link store.', changed: [] },
      { feedbackId: shape.id, status: 'declined', text: 'They are separate on purpose.', changed: [] },
    ],
  }
  await writeFile(page, 'board.json', JSON.stringify(next, null, 2))

  // The poll picks it up. The adopted move leaves the map, and the agent's own line now has the new end.
  await expect(page.getByText('Revision 2', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(`[data-label][data-edge="${line.id}"][data-edited]`)).toHaveCount(0)
  await expect(page.locator(`[data-label][data-edge="${line.id}"]`)).toHaveAttribute('data-ends', `${line.ends[0]} ${other.id}`)

  // Review shows each answer, and the moved connection before and after.
  await page.getByRole('tab', { name: /^Review/ }).click()
  const review = page.getByRole('complementary')
  const answers = review.getByRole('region', { name: 'Answers' })
  await expect(answers.getByText('In the link store.')).toBeVisible()
  await expect(answers.getByText('They are separate on purpose.')).toBeVisible()
  await expect(answers.getByText('The call goes there now.')).toBeVisible()
  await expect(answers.getByText('On the board in revision 2.')).toBeVisible()

  // Dismiss the declined rectangle: it leaves the map and waits in the archive.
  const declined = answers.getByRole('listitem').filter({ hasText: 'They are separate on purpose.' })
  await declined.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.locator('[data-mark]')).toHaveCount(0)
  await review.locator('summary', { hasText: 'Archive' }).click()
  await review.getByRole('listitem').filter({ hasText: 'They are separate on purpose.' }).getByRole('button', { name: 'Restore' }).click()
  await expect(page.locator('[data-mark]')).toHaveCount(1)

  // Undo takes the restore back, and redo brings it again.
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('[data-mark]')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.locator('[data-mark]')).toHaveCount(1)

  // Nothing new since the last send. The note with no answer stays sent, not new.
  await sendButton(page).click()
  await expect(popover.getByText('Nothing new to send.')).toBeVisible()
  await expect(popover.getByText(PROMPT)).toBeVisible()
})
