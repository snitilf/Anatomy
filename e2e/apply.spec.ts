/// <reference lib="dom" />
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile as writeDiskFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from './test.ts'
import type { Page } from '@playwright/test'

// The key src/workspace/testFolder.ts reads: a stand-in repository folder kept in localStorage.
const KEY = 'anatomy:test-folder'

type Files = Record<string, { text: string; lastModified: number }>

const files = (page: Page) => page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { files: Files }).files, KEY)

/**
 * Copies the stand-in folder to disk, runs the `anatomy.mjs` that the app wrote there with a patch on stdin, as an agent
 * would, and gives back the files the tool wrote.
 */
async function runApply(page: Page, patch: unknown[]): Promise<{ code: number; stdout: string; written: Record<string, string>; names: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'anatomy-e2e-apply-'))
  try {
    await mkdir(join(dir, '.anatomy', 'guide'), { recursive: true })
    for (const [name, file] of Object.entries(await files(page))) await writeDiskFile(join(dir, '.anatomy', name), file.text)
    const child = promisify(execFile)(process.execPath, ['.anatomy/anatomy.mjs', 'apply', '-'], { cwd: dir })
    child.child.stdin?.end(JSON.stringify(patch))
    let code = 0
    let stdout = ''
    try {
      stdout = (await child).stdout
    } catch (error) {
      const failed = error as { code: number; stdout: string }
      code = failed.code
      stdout = failed.stdout
    }
    const names = await readdir(join(dir, '.anatomy'))
    const written: Record<string, string> = {}
    for (const name of ['board.json', 'board.prev.json']) if (names.includes(name)) written[name] = await readFile(join(dir, '.anatomy', name), 'utf8')
    return { code, stdout, written, names }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('a patch from anatomy apply opens in the app and the notes of the user stay attached', async ({ page }) => {
  const boardText = await readFile('e2e/fixtures/url-shortener.board.json', 'utf8')
  const board = JSON.parse(boardText) as { revision: number; components: { id: string; summary: string }[] }
  const part = board.components[0]!
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

  // The user asks a question and sends it.
  const panel = page.getByRole('complementary')
  await panel.getByRole('textbox', { name: /^Add a (note|question)$/ }).click()
  await panel.getByRole('radio', { name: 'Question' }).check()
  await panel.getByRole('textbox', { name: 'Add a question' }).fill('Why is this kept in memory?')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByText('Why is this kept in memory?').first()).toBeVisible()
  await page.getByRole('banner').getByRole('button', { name: /^Send to agent/ }).click()
  const popover = page.getByRole('dialog', { name: 'Send to agent' })
  await popover.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(popover.getByText('Sent 1 item')).toBeVisible()
  await page.keyboard.press('Escape')

  const feedback = JSON.parse((await files(page))['feedback.json']!.text) as { items: { id: string }[] }
  const noteId = feedback.items[0]!.id

  // The agent answers with a patch: one edit for the note, and the answer.
  const summary = `${part.summary} It is also kept on disk.`.slice(0, 280)
  const first = await runApply(page, [
    { op: 'test', path: '/revision', value: board.revision },
    { op: 'replace', path: `/components/${part.id}/summary`, value: summary, for: noteId },
    { op: 'respond', for: noteId, status: 'adopted', text: 'It is on disk too now.' },
  ])
  expect(first.code, first.stdout).toBe(0)
  expect(first.stdout).toContain(`~ components/${part.id}.summary`)
  expect(first.names).toContain('board.prev.json')
  expect(first.written['board.prev.json']).toBe(boardText)

  // The agent's tool wrote board.json. The stand-in folder gets that file, as the real folder would.
  await page.evaluate(
    ([key, text]) => {
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { files: Record<string, { text: string; lastModified: number }> }
      stored.files['board.json'] = { text, lastModified: Date.now() }
      localStorage.setItem(key, JSON.stringify(stored))
    },
    [KEY, first.written['board.json']!] as const,
  )

  await expect(panel.getByText(new RegExp(`revision ${board.revision + 1}`))).toBeVisible({ timeout: 15_000 })
  await page.getByRole('tab', { name: /^Review/ }).click()
  const answers = panel.getByRole('region', { name: 'Answers' })
  await expect(answers.getByText('It is on disk too now.')).toBeVisible()

  // The note is still the user's: it is in the layer by its ID, and the app wrote no board file of its own.
  const after = await files(page)
  expect(Object.keys(after).sort()).toEqual(expect.arrayContaining(['board.json', 'feedback.json', 'layer.json']))
  expect(JSON.parse(after['board.json']!.text).revision).toBe(board.revision + 1)

  // The same patch again is refused, and the board the app shows does not change.
  const again = await runApply(page, [
    { op: 'test', path: '/revision', value: board.revision },
    { op: 'replace', path: `/components/${part.id}/summary`, value: summary },
  ])
  expect(again.code).toBe(1)
  expect(again.stdout).toContain('stale-revision')
  expect(again.written['board.json']).toBe(first.written['board.json'])
})
