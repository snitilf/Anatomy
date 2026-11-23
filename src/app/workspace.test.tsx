import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import refundRaw from '../../e2e/fixtures/refund-approval.board.json?raw'
import { FILES, type Folder } from '../workspace/folder'
import { createMemoryFolder, memoryFolderAccess, type MemoryFile } from '../workspace/memoryFolder'
import { AppStoreProvider } from './AppStoreProvider'
import { Shell } from './Shell'
import { WorkspaceProvider } from './workspace'
import { useWorkspace } from './workspaceContext'

const refund = JSON.parse(refundRaw) as { title: string; components: { id: string; label: string }[] }
const panel = () => within(screen.getByTestId('inspector'))
const opened = async () => within(await screen.findByTestId('inspector')).findByRole('heading', { name: refund.title })

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

beforeEach(() => {
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
})

function repo(files: Record<string, string> = { [FILES.board]: refundRaw }) {
  let time = 1000
  const map = new Map<string, MemoryFile>(Object.entries(files).map(([name, text]) => [name, { text, lastModified: time }]))
  return createMemoryFolder('shop', map, { clock: () => ++time })
}

function app(access: ReturnType<typeof memoryFolderAccess>) {
  return render(
    <AppStoreProvider>
      <WorkspaceProvider folderAccess={access}>
        <Shell />
      </WorkspaceProvider>
    </AppStoreProvider>,
  )
}

const layerOf = (folder: ReturnType<typeof repo>) => JSON.parse(folder.files.get(FILES.layer)?.text ?? 'null') as { notes: { text: string }[] } | null

async function addNote(text: string) {
  fireEvent.change(panel().getByRole('textbox', { name: 'Add a note' }), { target: { value: text } })
  fireEvent.click(panel().getByRole('button', { name: 'Add' }))
}

const MARKED = '<!-- Written by Anatomy, which replaces this file when the format changes. Delete this line to keep your own version. -->\n\n'

/** A button that opens the folder the access picks next, as the open menu does while a board is open. */
function PickAgain() {
  const { openFolder } = useWorkspace()
  return <button onClick={openFolder}>Pick again</button>
}

function appWithPicker(access: ReturnType<typeof memoryFolderAccess>) {
  return render(
    <AppStoreProvider>
      <WorkspaceProvider folderAccess={access}>
        <Shell />
        <PickAgain />
      </WorkspaceProvider>
    </AppStoreProvider>,
  )
}

const otherBoard = (JSON.stringify({ ...JSON.parse(refundRaw), id: 'other-board', title: 'Another board' }))

describe('folder mode with a file that is too large', () => {
  it('reports a board over the limit without reading it, and opens the board when a valid one is written', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const folder = repo({ [FILES.board]: 'x'.repeat(1_200_000) })
      const read = vi.spyOn(folder, 'read')
      app(memoryFolderAccess(folder))
      fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
      expect(await screen.findByText('The file is 1,200,000 bytes. The limit is 1,000,000 bytes.')).toBeInTheDocument()
      await expect(read.mock.results[0]!.value).rejects.toMatchObject({ name: 'FileTooLargeError' })
      // The folder is still watched: the next board the agent writes opens.
      await folder.write(FILES.board, refundRaw)
      await act(() => vi.advanceTimersByTimeAsync(6100))
      expect(await opened()).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not write the open board layer into a folder whose layer is far over the limit, and keeps that file', async () => {
    const first = repo()
    const second = repo({ [FILES.board]: otherBoard, [FILES.layer]: 'x'.repeat(17_000_000) })
    const access = memoryFolderAccess(first)
    appWithPicker(access)
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
    await opened()
    await addNote('Belongs to the first board')
    await waitFor(() => expect(layerOf(first)?.notes).toHaveLength(1), { timeout: 10_000 })
    const read = vi.spyOn(second, 'read')

    access.pick = async () => second
    fireEvent.click(screen.getByRole('button', { name: 'Pick again' }))
    expect(await screen.findByText(/could not read layer\.json in shop/)).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await expect(read.mock.results.find((_, n) => read.mock.calls[n]![0] === FILES.layer)!.value).rejects.toMatchObject({ name: 'FileTooLargeError' })
    expect(second.files.get(FILES.layer)?.text).toBe('x'.repeat(17_000_000))
    expect(second.files.has(FILES.layerBackup)).toBe(false)
  })

  it('never writes the first board layer into the folder it switches to while that layer is being read', async () => {
    const first = repo()
    const writes: string[] = []
    const second = createMemoryFolder(
      'second',
      new Map([
        [FILES.board, { text: otherBoard, lastModified: 1 }],
        [FILES.layer, { text: JSON.stringify({ format: 'anatomy-layer', version: 2, boardId: 'other-board', notes: [] }), lastModified: 1 }],
      ]),
      { onWrite: (files) => writes.push(files.get(FILES.layer)?.text ?? '') },
    )
    const slow = second.read.bind(second)
    second.read = async (name) => {
      if (name === FILES.layer) await new Promise((resolve) => setTimeout(resolve, 1200))
      return slow(name)
    }
    const access = memoryFolderAccess(first)
    appWithPicker(access)
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
    await opened()
    await addNote('Belongs to the first board')
    await waitFor(() => expect(layerOf(first)?.notes).toHaveLength(1), { timeout: 10_000 })

    access.pick = async () => second
    fireEvent.click(screen.getByRole('button', { name: 'Pick again' }))
    expect(await within(await screen.findByTestId('inspector')).findByRole('heading', { name: 'Another board' }, { timeout: 5000 })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(writes.join('')).not.toContain('Belongs to the first board')
  })

  it('keeps a helper file over 2 MB without reading it, and still writes the others', async () => {
    const big = MARKED + 'x'.repeat(2_000_001)
    const folder = repo({ 'guide/ask.md': big })
    app(memoryFolderAccess(folder))
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
    await screen.findByRole('heading', { name: 'shop has no board yet.' })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
    const read = vi.spyOn(folder, 'read')
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Copy prompt' }))
    await waitFor(() => expect(folder.files.get(FILES.readme)?.text).toMatch(/^<!-- Written by Anatomy/))
    await waitFor(() => expect(folder.files.get('guide/honesty.md')?.text).toContain('## Honesty rules'))
    expect(folder.files.get('guide/ask.md')?.text).toBe(big)
    const askRead = read.mock.calls.findIndex(([name]) => name === 'guide/ask.md')
    expect(askRead).toBeGreaterThanOrEqual(0)
    await expect(read.mock.results[askRead]!.value).rejects.toMatchObject({ name: 'FileTooLargeError' })
  })
})

describe('folder mode', () => {
  it('opens the board from the folder, saves the layer next to it, and opens it again after a reload', async () => {
    const folder = repo()
    const access = memoryFolderAccess(folder)
    const first = app(access)
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
    expect(await opened()).toBeInTheDocument()
    expect(folder.files.has(FILES.layer)).toBe(false)

    await addNote('Kept in the repository')
    await waitFor(() => expect(layerOf(folder)?.notes.map((n) => n.text)).toEqual(['Kept in the repository']), { timeout: 10_000 })
    await waitFor(() => expect(document.querySelector('[data-save-state="saved"]')).not.toBeNull())
    // The crumb names the folder.
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'shop' })).toBeInTheDocument()
    first.unmount()

    app(access)
    expect(await opened()).toBeInTheDocument()
    expect(within(panel().getByRole('region', { name: 'Notes' })).getByText('Kept in the repository')).toBeInTheDocument()
  })

  it('asks for a click to reopen a remembered folder that needs permission again', async () => {
    const folder = repo()
    folder.grant('prompt')
    const access = memoryFolderAccess(undefined, folder)
    const db = await import('../workspace/db').then((m) => m.openStore())
    await db.setLastOpened({ mode: 'folder' })
    db.close()
    app(access)
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen shop' }))
    expect(await opened()).toBeInTheDocument()
  })

  it('says when the folder has no board, and opens the board as soon as the agent writes it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const folder = repo({})
      app(memoryFolderAccess(folder))
      fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
      expect(await screen.findByRole('heading', { name: 'shop has no board yet.' })).toBeInTheDocument()
      const main = within(screen.getByRole('main'))
      expect(main.getByText(/It opens here when your agent writes/)).toHaveTextContent('It opens here when your agent writes .anatomy/board.json.')
      expect(main.getByRole('button', { name: 'How to make a board' })).toBeInTheDocument()
      // Copy prompt writes the format next to the board and copies the prompt that points the agent at it.
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
      fireEvent.click(main.getByRole('button', { name: 'Copy prompt' }))
      await waitFor(() => expect(folder.files.get(FILES.readme)?.text).toMatch(/^<!-- Written by Anatomy[^]*# Anatomy\n/))
      // The topics go next to it, in .anatomy/guide, with the JSON Schema.
      await waitFor(() => expect(folder.files.get('guide/ask.md')?.text).toMatch(/^<!-- Written by Anatomy[^]*## Ask before you write/))
      expect(JSON.parse(folder.files.get('board.schema.json')!.text)).toMatchObject({ title: 'Anatomy board, version 1' })
      // It also writes the anatomy tool that the README tells the agent to run.
      await waitFor(() => expect(folder.files.get(FILES.script)?.text).toMatch(/^\/\/ Written by Anatomy[^]*node:fs/))
      expect(writeText).toHaveBeenCalledWith('Read .anatomy/README.md, then write .anatomy/board.json that explains: ')
      await folder.write(FILES.board, refundRaw)
      await act(() => vi.advanceTimersByTimeAsync(4100))
      expect(await opened()).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a topic file the user took over, and refreshes one Anatomy wrote before', async () => {
    const mine = '# My own way to ask\n'
    const older = '<!-- Written by Anatomy, which replaces this file when the format changes. Delete this line to keep your own version. -->\n\nOld.\n'
    const folder = repo({ 'guide/ask.md': mine, 'guide/honesty.md': older })
    app(memoryFolderAccess(folder))
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
    await screen.findByRole('heading', { name: 'shop has no board yet.' })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Copy prompt' }))
    await waitFor(() => expect(folder.files.get('guide/honesty.md')?.text).toContain('## Honesty rules'))
    expect(folder.files.get('guide/ask.md')?.text).toBe(mine)
    // Nothing lands outside .anatomy: every name the app wrote is a file in it or in its guide folder.
    for (const name of folder.files.keys()) expect(name).toMatch(/^(?:guide\/)?[a-z0-9][a-z0-9.-]*$/i)
  })

  it('shows a new revision through the update review and keeps the notes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const folder = repo()
      app(memoryFolderAccess(folder))
      fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
      await opened()
      await addNote('Still mine')
      const next = JSON.parse(refundRaw) as { revision: number; components: { summary: string }[] }
      next.revision = 2
      next.components[0]!.summary = 'Says something new.'
      await folder.write(FILES.board, JSON.stringify(next))
      await act(() => vi.advanceTimersByTimeAsync(4100))
      fireEvent.click(await panel().findByRole('tab', { name: /Review/ }))
      expect(await panel().findByRole('heading', { name: 'Changed in revision 2' })).toBeInTheDocument()
      fireEvent.click(panel().getByRole('tab', { name: 'Details' }))
      expect(within(panel().getByRole('region', { name: 'Notes' })).getByText('Still mine')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a layer file it cannot read as a backup and starts a new one', async () => {
    const folder: Folder & { files: Map<string, MemoryFile> } = repo({ [FILES.board]: refundRaw, [FILES.layer]: '{ not json' })
    app(memoryFolderAccess(folder))
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
    await opened()
    expect(folder.files.get(FILES.layerBackup)?.text).toBe('{ not json')
    expect(await screen.findByText(/kept as layer.backup.json/)).toBeInTheDocument()
  })
})
