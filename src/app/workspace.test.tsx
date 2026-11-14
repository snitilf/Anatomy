import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import nordetRaw from '../examples/nordet.board.json?raw'
import { FILES, type Folder } from '../workspace/folder'
import { createMemoryFolder, memoryFolderAccess, type MemoryFile } from '../workspace/memoryFolder'
import { AppStoreProvider } from './AppStoreProvider'
import { Shell } from './Shell'
import { WorkspaceProvider } from './workspace'

const nordet = JSON.parse(nordetRaw) as { title: string; components: { id: string; label: string }[] }
const panel = () => within(screen.getByTestId('inspector'))
const opened = async () => within(await screen.findByTestId('inspector')).findByRole('heading', { name: nordet.title })

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

function repo(files: Record<string, string> = { [FILES.board]: nordetRaw }) {
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

describe('folder mode', () => {
  it('opens the board from the folder, saves the layer next to it, and opens it again after a reload', async () => {
    const folder = repo()
    const access = memoryFolderAccess(folder)
    const first = app(access)
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
    expect(await opened()).toBeInTheDocument()
    expect(folder.files.has(FILES.layer)).toBe(false)

    await addNote('Kept in the repository')
    await waitFor(() => expect(layerOf(folder)?.notes.map((n) => n.text)).toEqual(['Kept in the repository']), { timeout: 2000 })
    await waitFor(() => expect(screen.getByRole('status')).toHaveAttribute('data-state', 'saved'))
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
      await waitFor(() => expect(folder.files.get(FILES.readme)?.text).toMatch(/^<!-- Written by Anatomy[^]*# Authoring an Anatomy board/))
      expect(writeText).toHaveBeenCalledWith('Read .anatomy/README.md, then write .anatomy/board.json that explains: ')
      await folder.write(FILES.board, nordetRaw)
      await act(() => vi.advanceTimersByTimeAsync(4100))
      expect(await opened()).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a new revision through the update review and keeps the notes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const folder = repo()
      app(memoryFolderAccess(folder))
      fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
      await opened()
      await addNote('Still mine')
      const next = JSON.parse(nordetRaw) as { revision: number; components: { summary: string }[] }
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
    const folder: Folder & { files: Map<string, MemoryFile> } = repo({ [FILES.board]: nordetRaw, [FILES.layer]: '{ not json' })
    app(memoryFolderAccess(folder))
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
    await opened()
    expect(folder.files.get(FILES.layerBackup)?.text).toBe('{ not json')
    expect(await screen.findByText(/kept as layer.backup.json/)).toBeInTheDocument()
  })
})
