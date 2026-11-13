import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { StorageError, openStore } from './persistence/store'
import { resolvePositions } from './overlay/layout'
import { nordetBoard } from './overlay/testBoards'
import { emptyOverlay } from './overlay/types'
import nordetRaw from './examples/nordet.board.json?raw'

// A test can make saving fail by setting this. The store itself stays the real one.
const failing = vi.hoisted(() => ({ on: false }))
vi.mock('./persistence/store', async (original) => {
  const actual = await original<typeof import('./persistence/store')>()
  return {
    ...actual,
    openStore: async (...args: Parameters<typeof actual.openStore>) => {
      const store = await actual.openStore(...args)
      return failing.on ? { ...store, saveOverlay: () => Promise.reject(new actual.StorageError('quota', 'full')) } : store
    },
  }
})

type RawBoard = {
  title: string
  revision: number
  components: { id: string; label: string; summary: string }[]
  relationships: { id: string; from: string; to: string; label: string }[]
  scenarios: { steps: { highlight: string[] }[] }[]
  items: { about?: string }[]
}
const nordet = JSON.parse(nordetRaw) as RawBoard & { id: string }
const part = (id: string) => nordet.components.find((c) => c.id === id)!

const blobs: Blob[] = []

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob)
    return 'blob:test'
  })
  URL.revokeObjectURL = vi.fn()
  HTMLAnchorElement.prototype.click = vi.fn()
})

beforeEach(() => {
  failing.on = false
  blobs.length = 0
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  failing.on = false
})

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

function loadNordet() {
  fireEvent.click(screen.getByRole('button', { name: 'Load an example' }))
  fireEvent.click(screen.getByRole('button', { name: /Nordet follow-up/ }))
}

function positionOf(stored: { overlay?: unknown } | undefined, id: string): { x: number; y: number } {
  const positions = (stored as { overlay: { positions: Record<string, { x: number; y: number }> } }).overlay.positions
  return positions[id]!
}
const links = () => within(screen.getByTestId('inspector')).getByRole('heading', { name: 'Your links' }).closest('section')!
const panel = () => within(screen.getByTestId('inspector'))

function selectPart(id: string) {
  fireEvent.click(panel().getAllByRole('button', { name: new RegExp(`^${part(id).label}`) })[0]!)
  expect(panel().getByRole('heading', { name: part(id).label })).toBeInTheDocument()
}

function addNote(text: string, kind: 'Note' | 'Question' = 'Note') {
  const group = panel().getByRole('radiogroup', { name: 'Kind' })
  fireEvent.click(within(group).getByRole('radio', { name: kind }))
  fireEvent.change(panel().getByRole('textbox', { name: new RegExp(`^Your ${kind.toLowerCase()}$`) }), { target: { value: text } })
  fireEvent.click(panel().getByRole('button', { name: `Add ${kind.toLowerCase()}` }))
}

async function saved() {
  await screen.findByText('Saved in this browser', {}, { timeout: 3000 })
}

async function openFile(container: HTMLElement, text: string, name = 'board.json') {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'application/json' })] } })
}

async function exportText(): Promise<string> {
  fireEvent.click(screen.getByRole('button', { name: 'Export' }))
  return readBlob(blobs[blobs.length - 1]!)
}

/** A copy of Nordet where Preview says something new and Fictional clock is gone. */
function modifiedNordet(): string {
  const next = structuredClone(nordet)
  next.revision = 2
  next.components.find((c) => c.id === 'preview')!.summary = 'Shows the proposed message, with the amount in bold.'
  next.components = next.components.filter((c) => c.id !== 'fictional-clock')
  const gone = new Set(['fictional-clock', 'clock-to-rule-check'])
  next.relationships = next.relationships.filter((r) => !gone.has(r.id))
  for (const s of next.scenarios) for (const step of s.steps) step.highlight = step.highlight.filter((h) => !gone.has(h))
  next.items = next.items.filter((i) => i.about === undefined || !gone.has(i.about))
  return JSON.stringify(next)
}

describe('your notes', () => {
  it('adds, edits, and deletes a note on a part', () => {
    render(<App />)
    loadNordet()
    selectPart('approval')
    addNote('Ask legal who signs off')
    const item = panel().getByText('Ask legal who signs off').closest('li')!
    expect(within(item).getByText('You')).toBeInTheDocument()
    expect(within(item).getByText('Note')).toBeInTheDocument()

    fireEvent.click(within(item).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(item).getByRole('textbox'), { target: { value: 'Ask legal and finance' } })
    fireEvent.click(within(item).getByRole('button', { name: 'Save' }))
    expect(panel().getByText('Ask legal and finance')).toBeInTheDocument()
    expect(panel().queryByText('Ask legal who signs off')).not.toBeInTheDocument()

    fireEvent.click(panel().getByRole('button', { name: 'Delete' }))
    fireEvent.click(panel().getByRole('button', { name: 'Delete note' }))
    expect(panel().queryByText('Ask legal and finance')).not.toBeInTheDocument()
  })

  it('adds a question to a connection, and counts it on the card', () => {
    render(<App />)
    loadNordet()
    const rel = nordet.relationships.find((r) => r.id === 'approval-to-send')!
    fireEvent.click(panel().getAllByRole('button', { name: new RegExp(rel.label) })[0]!)
    addNote('What if the version is stale?', 'Question')
    const item = panel().getByText('What if the version is stale?').closest('li')!
    expect(within(item).getByText('Question')).toBeInTheDocument()

    selectPart('approval')
    addNote('One more')
    expect(screen.getByRole('img', { name: '1 note or question from you' })).toBeInTheDocument()
  })

  it('shows a counter only near the limit', () => {
    render(<App />)
    loadNordet()
    const box = panel().getByRole('textbox', { name: 'Your note' })
    fireEvent.change(box, { target: { value: 'a'.repeat(100) } })
    expect(panel().queryByText(/of 2000/)).not.toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'a'.repeat(1950) } })
    expect(panel().getByText('1950 of 2000')).toBeInTheDocument()
  })

  it('adds with Ctrl+Enter', () => {
    render(<App />)
    loadNordet()
    fireEvent.change(panel().getByRole('textbox', { name: 'Your note' }), { target: { value: 'Whole board thought' } })
    fireEvent.keyDown(panel().getByRole('textbox', { name: 'Your note' }), { key: 'Enter', ctrlKey: true })
    expect(panel().getByText('Whole board thought')).toBeInTheDocument()
  })
})

describe('your links', () => {
  it('draws a link from the keyboard path and lists it in the line key', () => {
    render(<App />)
    loadNordet()
    selectPart('preview')
    fireEvent.change(panel().getByLabelText('Draw a link to'), { target: { value: 'saved-record' } })
    fireEvent.change(panel().getByLabelText('Label (optional)'), { target: { value: 'I would check this' } })
    fireEvent.click(panel().getByRole('button', { name: 'Add link' }))
    const row = panel().getByRole('button', { name: /Saved record/ })
    fireEvent.click(row)
    expect(panel().getByRole('heading', { name: 'Your link' })).toBeInTheDocument()
    expect(panel().getByRole('textbox', { name: 'Label' })).toHaveValue('I would check this')

    fireEvent.click(screen.getByRole('button', { name: 'Line key' }))
    const key = document.querySelector('#' + screen.getByRole('button', { name: 'Line key' }).getAttribute('aria-controls')) as HTMLElement
    expect(within(key).getByText('Your link')).toBeInTheDocument()

    fireEvent.click(panel().getByRole('button', { name: 'Delete' }))
    fireEvent.click(panel().getByRole('button', { name: 'Delete link' }))
    expect(panel().getByRole('heading', { name: nordet.title })).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('keeps notes, a moved card, and a link across a reload', async () => {
    const first = render(<App />)
    loadNordet()
    selectPart('approval')
    addNote('Survives a reload')
    fireEvent.change(panel().getByLabelText('Draw a link to'), { target: { value: 'saved-record' } })
    fireEvent.click(panel().getByRole('button', { name: 'Add link' }))

    const card = first.container.querySelector('.react-flow__node[data-id="approval"]') as HTMLElement
    fireEvent.keyDown(card, { key: 'ArrowRight', shiftKey: true })
    await saved()
    first.unmount()

    const store = await openStore('home')
    const raw = await store.loadBoard('nordet-invoice-follow-up')
    store.close()
    const moved = positionOf(raw, 'approval')
    const start = resolvePositions(nordetBoard(), emptyOverlay('nordet-invoice-follow-up'))['approval']!
    expect(moved).not.toEqual(start)

    render(<App />)
    expect(await screen.findByRole('heading', { name: nordet.title })).toBeInTheDocument()
    selectPart('approval')
    expect(panel().getByText('Survives a reload')).toBeInTheDocument()
    expect(within(links()).getByRole('button', { name: /Saved record/ })).toBeInTheDocument()
    await saved()
    const again = await openStore('home')
    const reloaded = await again.loadBoard('nordet-invoice-follow-up')
    again.close()
    expect(positionOf(reloaded, 'approval').x).toBe(moved.x)
  })

  it('keeps Home and Work apart', async () => {
    render(<App />)
    loadNordet()
    await saved()
    fireEvent.click(screen.getByRole('radio', { name: 'Work' }))
    expect(await screen.findByRole('button', { name: 'Load an example' })).toBeInTheDocument()
    expect(screen.queryByText(nordet.title)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `Open ${nordet.title}` })).not.toBeInTheDocument()
    expect(localStorage.getItem('anatomy.namespace')).toBe('work')

    fireEvent.click(screen.getByRole('radio', { name: 'Home' }))
    expect(await screen.findByRole('heading', { name: nordet.title })).toBeInTheDocument()
  })

  it('says Not saved and offers an export when the write fails, and keeps the note', async () => {
    failing.on = true
    render(<App />)
    loadNordet()
    selectPart('approval')
    addNote('Still here')
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(within(alert).getByText('Not saved')).toBeInTheDocument()
    expect(within(alert).getByText(/out of storage space/)).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Export' })).toBeInTheDocument()
    expect(screen.queryByText(/Saved in this browser/)).not.toBeInTheDocument()
    expect(panel().getByText('Still here')).toBeInTheDocument()
    expect(new StorageError('quota', 'x').kind).toBe('quota')
  })

  it('lists saved boards, and asks before deleting one', async () => {
    render(<App />)
    loadNordet()
    await saved()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: `Delete ${nordet.title}` }))
    const dialog = screen.getByRole('dialog', { name: `Delete ${nordet.title}?` })
    expect(within(dialog).getByText(/notes from this browser/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete board' }))
    expect(await screen.findByRole('button', { name: 'Load an example' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/Saved in this browser/)).not.toBeInTheDocument())
  })
})

describe('export and open', () => {
  it('restores notes, positions, and links from an export in a fresh space', async () => {
    const first = render(<App />)
    loadNordet()
    selectPart('approval')
    addNote('Travels with the file')
    fireEvent.change(panel().getByLabelText('Draw a link to'), { target: { value: 'saved-record' } })
    fireEvent.click(panel().getByRole('button', { name: 'Add link' }))
    const card = first.container.querySelector('.react-flow__node[data-id="approval"]') as HTMLElement
    fireEvent.keyDown(card, { key: 'ArrowDown', shiftKey: true })
    const text = await exportText()
    expect(await screen.findByText('Exported')).toBeInTheDocument()
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
    const file = JSON.parse(text) as { overlay: { positions: Record<string, { y: number }> } }
    first.unmount()

    globalThis.indexedDB = new IDBFactory()
    const second = render(<App />)
    await openFile(second.container, text, 'export.json')
    expect(await screen.findByRole('heading', { name: nordet.title })).toBeInTheDocument()
    selectPart('approval')
    expect(panel().getByText('Travels with the file')).toBeInTheDocument()
    expect(within(links()).getByRole('button', { name: /Saved record/ })).toBeInTheDocument()
    await saved()
    const store = await openStore('home')
    const raw = await store.loadBoard('nordet-invoice-follow-up')
    store.close()
    expect(positionOf(raw, 'approval').y).toBe(file.overlay.positions['approval']!.y)
  })

  it('asks which notes to keep when a file and this browser both have notes', async () => {
    const first = render(<App />)
    loadNordet()
    selectPart('approval')
    addNote('In the file')
    const text = await exportText()
    addNote('Only in the browser')
    await saved()

    await openFile(first.container, text, 'export.json')
    const dialog = await screen.findByRole('dialog', { name: /This file has its own notes and layout for/ })
    fireEvent.click(within(dialog).getByRole('button', { name: "Use the file's notes" }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(panel().getByText('In the file')).toBeInTheDocument()
    expect(panel().queryByText('Only in the browser')).not.toBeInTheDocument()

    addNote('Newer')
    await saved()
    await openFile(first.container, text, 'export.json')
    const again = await screen.findByRole('dialog', { name: /This file has its own notes and layout for/ })
    fireEvent.click(within(again).getByRole('button', { name: 'Keep the notes in this browser' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(panel().getByText('Newer')).toBeInTheDocument()
  })
})

describe('a new version of a board you already have', () => {
  it('shows what changed, flags notes, and never moves them by itself', async () => {
    const first = render(<App />)
    loadNordet()
    selectPart('preview')
    addNote('Check the wording')
    fireEvent.click(panel().getByRole('button', { name: /Board overview/ }))
    selectPart('fictional-clock')
    addNote('Where does the date come from?', 'Question')
    fireEvent.click(panel().getByRole('button', { name: /Board overview/ }))
    await saved()

    await openFile(first.container, modifiedNordet(), 'nordet.json')
    const changed = await panel().findByRole('heading', { name: 'What changed' })
    const section = changed.closest('section')!
    expect(within(section).getByRole('button', { name: part('preview').label })).toBeInTheDocument()
    expect(within(section).getByText(part('fictional-clock').label)).toBeInTheDocument()

    const review = panel().getByRole('heading', { name: 'Notes to review' }).closest('section')!
    const outdated = within(review).getByText('Check the wording').closest('li')!
    expect(within(outdated).getByText('Possibly outdated')).toBeInTheDocument()
    const homeless = within(review).getByText('Where does the date come from?').closest('li')!
    expect(within(homeless).getByText('Needs relinking')).toBeInTheDocument()

    fireEvent.click(within(outdated).getByRole('button', { name: 'Still true' }))
    expect(within(review).queryByText('Check the wording')).not.toBeInTheDocument()

    fireEvent.change(within(homeless).getByLabelText('Attach to'), { target: { value: 'component:rule-check' } })
    fireEvent.click(within(homeless).getByRole('button', { name: 'Attach' }))
    expect(panel().queryByRole('heading', { name: 'Notes to review' })).not.toBeInTheDocument()

    fireEvent.click(within(section).getByRole('button', { name: 'Done reviewing' }))
    expect(panel().queryByRole('heading', { name: 'What changed' })).not.toBeInTheDocument()

    selectPart('rule-check')
    expect(panel().getByText('Where does the date come from?')).toBeInTheDocument()
  })

  it('keeps a note whose part was removed until the user decides', async () => {
    const first = render(<App />)
    loadNordet()
    selectPart('fictional-clock')
    addNote('Orphan')
    fireEvent.click(panel().getByRole('button', { name: /Board overview/ }))
    await openFile(first.container, modifiedNordet(), 'nordet.json')
    fireEvent.click(await panel().findByRole('button', { name: 'Done reviewing' }))
    const review = panel().getByRole('heading', { name: 'Notes to review' }).closest('section')!
    expect(within(review).getByText('Orphan')).toBeInTheDocument()
    })
})
