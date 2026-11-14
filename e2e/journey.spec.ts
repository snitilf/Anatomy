import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const BOARD_FILE = 'src/examples/nordet.board.json'
const BOARD_TITLE = 'Nordet: follow-up on an overdue invoice'

// A part row in the overview reads "Label Group". Connection rows read "Label to Other".
const partRow = (label: string) => new RegExp(`^${label} (?!to )`)

test('open, inspect, walk through, learn, take a note, reload, export, and open the export', async ({ page }, testInfo) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  const inspector = page.getByRole('complementary', { name: 'Details' })
  const noteText = `Check the approval rule again ${Date.now()}`

  // Import a bare board file.
  await page.goto('/')
  await expect(page.getByText('Open a board to see how it fits together.')).toBeVisible()
  await page.getByLabel('Board file').setInputFiles(BOARD_FILE)
  await expect(page.getByRole('heading', { name: BOARD_TITLE, level: 2 })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()

  // Inspect a part: its explanation and its source label.
  await inspector.getByRole('button', { name: partRow('Rule check') }).click()
  await expect(inspector.getByRole('heading', { name: 'Rule check', level: 2 })).toBeVisible()
  await inspector.locator('summary', { hasText: 'Explanation' }).click()
  await expect(inspector.getByText('The rule check only proposes. It does not send anything.')).toBeVisible()
  // The default source, the agent's own explanation, shows no source line.
  await expect(inspector.locator('[data-source]')).toHaveCount(0)

  // Inspect a connection: its kind in plain English.
  await inspector.getByRole('button', { name: /proposes an action/ }).click()
  await expect(inspector.getByRole('heading', { name: 'proposes an action', level: 2 })).toBeVisible()
  await expect(inspector.getByText('triggers', { exact: true })).toBeVisible()

  // Play a walkthrough.
  await inspector.getByRole('button', { name: 'Board overview' }).click()
  await inspector.getByRole('button', { name: 'Play Approve and simulate' }).click()
  const player = page.getByRole('region', { name: 'Walkthrough: Approve and simulate' })
  await expect(player.getByText('Step 1 of 5')).toBeVisible()
  await player.getByRole('button', { name: 'Next' }).click()
  await expect(player.getByText('Step 2 of 5')).toBeVisible()
  await expect(player.getByText('The rule check finds that the rule matches and proposes a reminder.')).toBeVisible()
  await player.getByRole('button', { name: 'Close' }).click()
  await expect(player).toBeHidden()

  // Open the lesson from the Approval part. A second send of the same approved version is blocked.
  await inspector.getByRole('button', { name: partRow('Approval') }).click()
  await expect(inspector.getByRole('heading', { name: 'Approval', level: 2 })).toBeVisible()
  await expect(inspector.getByText('From a written plan')).toBeVisible()
  await inspector.getByRole('button', { name: 'Open lesson' }).click()
  const lesson = page.getByRole('dialog', { name: 'Approval gate' })
  await expect(lesson.getByRole('group', { name: 'Controls' })).toBeVisible()
  await lesson.getByRole('button', { name: /^Approve/ }).click()
  const send = lesson.getByRole('button', { name: /^Send/ })
  await send.click()
  await expect(lesson.getByText('v1 approved · sent v1', { exact: true })).toBeVisible()
  await send.click()
  await expect(lesson.getByText(/Blocked\. Version 1 already went out/).first()).toBeVisible()
  await expect(lesson.getByText('v1 approved · sent v1', { exact: true })).toBeVisible()
  await lesson.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(lesson).toBeHidden()

  // Add a note to Approval and wait for it to be saved.
  await inspector.locator('summary', { hasText: 'Your notes' }).click()
  await inspector.getByRole('textbox', { name: 'Your note' }).fill(noteText)
  await inspector.getByRole('button', { name: 'Add note' }).click()
  await expect(inspector.getByText(noteText)).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()

  // Reload: the board and the note come back from this browser.
  await page.reload()
  await expect(page.getByRole('heading', { name: BOARD_TITLE, level: 2 })).toBeVisible()
  await inspector.getByRole('button', { name: partRow('Approval') }).click()
  await inspector.locator('summary', { hasText: 'Your notes' }).click()
  await expect(inspector.getByText(noteText)).toBeVisible()

  // Export to a file.
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  const exportPath = testInfo.outputPath('anatomy-export.json')
  await (await download).saveAs(exportPath)
  const exported = JSON.parse(await readFile(exportPath, 'utf8')) as { format: string }
  expect(exported.format).toBe('anatomy-export')

  // The Work space is separate and starts empty. Opening the export there brings the note back.
  await page.getByRole('radio', { name: 'Work' }).check({ force: true })
  await expect(page.getByText('Open a board to see how it fits together.')).toBeVisible()
  await expect(page.getByRole('heading', { name: BOARD_TITLE })).toHaveCount(0)
  await page.getByLabel('Board file').setInputFiles(exportPath)
  await expect(page.getByRole('heading', { name: BOARD_TITLE, level: 2 })).toBeVisible()
  await inspector.getByRole('button', { name: partRow('Approval') }).click()
  await inspector.locator('summary', { hasText: 'Your notes' }).click()
  await expect(inspector.getByText(noteText)).toBeVisible()

  // No request left this machine.
  const outside = requests.filter((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return false
    return new URL(url).hostname !== '127.0.0.1'
  })
  expect(outside).toEqual([])
})
