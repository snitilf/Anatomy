import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { pickConnection, pickPart } from './helpers.ts'

const BOARD_FILE = 'src/examples/refund-approval.board.json'
const BOARD_TITLE = 'Refund approval: paying back a customer'

test('open, inspect, walk through, learn, take a note, reload, export, and open the export in a fresh browser', async ({ page }, testInfo) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  const inspector = page.getByRole('complementary', { name: 'Sidebar' })
  const noteText = `Check the approval rule again ${Date.now()}`

  // Import a bare board file.
  await page.goto('/')
  await expect(page.getByText('Open a repository to see its anatomy.')).toBeVisible()
  await page.getByLabel('Board file').setInputFiles(BOARD_FILE)
  await expect(page.getByRole('heading', { name: BOARD_TITLE, level: 2 })).toBeVisible()
  await expect(page.locator('[data-save-state="saved"]')).toBeAttached()

  // Inspect a part: its explanation and its source label.
  await pickPart(page, 'policy-check')
  await expect(inspector.getByRole('heading', { name: 'Policy check', level: 2 })).toBeVisible()
  // The explanation is open, held to a height with a button for the rest.
  const more = inspector.getByRole('button', { name: 'Show more' })
  if (await more.count()) await more.click()
  await expect(inspector.getByText('The policy check only proposes. It does not pay anything, and it never changes the request or the policy.')).toBeVisible()
  // The default source, the agent's own explanation, shows no source line.
  await expect(inspector.locator('[data-source]')).toHaveCount(0)

  // Inspect a connection: its kind in plain English.
  await pickConnection(page, 'proposes a payout')
  await expect(inspector.getByRole('heading', { name: 'proposes a payout', level: 2 })).toBeVisible()
  await expect(inspector.getByText(/Policy check triggers Payout preview/)).toBeVisible()

  // Play a walkthrough.
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: /Refund approval/ }).click()
  await inspector.getByRole('button', { name: 'Play Approve and pay' }).click()
  const player = page.getByRole('region', { name: 'Walkthrough: Approve and pay' })
  await expect(player.getByText('1 / 5')).toBeVisible()
  await player.getByRole('button', { name: 'Next' }).click()
  await expect(player.getByText('2 / 5')).toBeVisible()
  await expect(player.getByText('The policy check finds that the policy allows the refund and proposes a payout.')).toBeVisible()
  await player.getByRole('button', { name: 'Close' }).click()
  await expect(player).toBeHidden()

  // Open the lesson from the Manager approval part. A second send of the same approved version is blocked.
  await pickPart(page, 'manager-approval')
  await expect(inspector.getByRole('heading', { name: 'Manager approval', level: 2 })).toBeVisible()
  await expect(inspector.getByText('From a written plan')).toBeVisible()
  await inspector.getByRole('button', { name: /^Approval gate/ }).click()
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

  // Add a note to Manager approval and wait for it to be saved.
  await inspector.getByRole('textbox', { name: 'Add a note' }).fill(noteText)
  await inspector.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(inspector.getByRole('region', { name: 'Notes' }).getByText(noteText)).toBeVisible()
  await expect(page.locator('[data-save-state="saved"]')).toBeAttached()

  // Reload: the board and the note come back from this browser.
  await page.reload()
  await expect(page.getByRole('heading', { name: BOARD_TITLE, level: 2 })).toBeVisible()
  await pickPart(page, 'manager-approval')
  await expect(inspector.getByRole('region', { name: 'Notes' }).getByText(noteText)).toBeVisible()

  // Download a copy from the command menu.
  const download = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('dialog', { name: 'Command menu' }).getByRole('option', { name: /Download a copy/ }).click()
  const exportPath = testInfo.outputPath('anatomy-export.json')
  await (await download).saveAs(exportPath)
  const exported = JSON.parse(await readFile(exportPath, 'utf8')) as { format: string }
  expect(exported.format).toBe('anatomy-export')

  // A fresh browser has nothing saved. Opening the export there brings the note back.
  await page.evaluate(() => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('anatomy')
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  }))
  await page.goto('/')
  await expect(page.getByText('Open a repository to see its anatomy.')).toBeVisible()
  await expect(page.getByRole('heading', { name: BOARD_TITLE })).toHaveCount(0)
  await page.getByLabel('Board file').setInputFiles(exportPath)
  await expect(page.getByRole('heading', { name: BOARD_TITLE, level: 2 })).toBeVisible()
  await pickPart(page, 'manager-approval')
  await expect(inspector.getByRole('region', { name: 'Notes' }).getByText(noteText)).toBeVisible()

  // No request left this machine.
  const outside = requests.filter((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return false
    return new URL(url).hostname !== '127.0.0.1'
  })
  expect(outside).toEqual([])
})
