import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { StorageError, openStore } from './workspace/db'
import { placeCards } from './layout/cards'
import { nordetBoard } from './layer/testBoards'
import nordetRaw from './examples/nordet.board.json?raw'
import { openConnection, openPart } from './test/openOnMap'
import { press } from './test/press'

// A test can make saving fail by setting this. The store itself stays the real one.
const failing = vi.hoisted(() => ({ on: false }))
vi.mock('./workspace/db', async (original) => {
  const actual = await original<typeof import('./workspace/db')>()
  return {
    ...actual,
    openStore: async (...args: Parameters<typeof actual.openStore>) => {
      const store = await actual.openStore(...args)
      return failing.on ? { ...store, saveLayer: () => Promise.reject(new actual.StorageError('quota', 'full')) } : store
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

async function loadNordet() {
  fireEvent.click(screen.getByRole('button', { name: /Nordet follow-up/ }))
  await screen.findByTestId('inspector')
}

function positionOf(stored: { layer?: unknown } | undefined, id: string): { x: number; y: number } {
  const positions = (stored as { layer: { positions: Record<string, { x: number; y: number }> } }).layer.positions
  return positions[id]!
}
const flow = () => within(screen.getByTestId('inspector')).getByRole('region', { name: 'Outgoing' })
const panel = () => within(screen.getByTestId('inspector'))

/** Picks a row in an open picker or the command menu. */
async function pick(name: RegExp | string) {
  fireEvent.click(await screen.findByRole('option', { name }))
}

/** Links the selected part to another one through the flow block's picker. */
async function addLink(to: string, label = '') {
  press(panel().getByRole('button', { name: 'Add link' }))
  await pick(new RegExp(`^${to}`))
  const field = await panel().findByRole('textbox', { name: 'Label' })
  fireEvent.change(field, { target: { value: label } })
  fireEvent.submit(field.closest('form')!)
}

async function runCommand(name: string) {
  act(() => {
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
  })
  const menu = within(await screen.findByRole('dialog', { name: 'Command menu' }))
  fireEvent.click(menu.getByRole('option', { name: new RegExp(name) }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command menu' })).not.toBeInTheDocument())
  // The menu runs a command once it has closed.
  await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
}

function selectPart(id: string) {
  openPart(part(id).label)
  expect(panel().getByRole('heading', { name: part(id).label })).toBeInTheDocument()
}

function addNote(text: string, kind: 'Note' | 'Question' = 'Note') {
  // The kind and Add show once the field has focus.
  fireEvent.focus(panel().getByRole('textbox', { name: /^Add a (note|question)$/ }))
  const group = panel().getByRole('radiogroup', { name: 'Kind' })
  fireEvent.click(within(group).getByRole('radio', { name: kind }))
  fireEvent.change(panel().getByRole('textbox', { name: `Add a ${kind.toLowerCase()}` }), { target: { value: text } })
  fireEvent.click(panel().getByRole('button', { name: 'Add' }))
}

/** Waits for a confirmed write. The status says nothing when saved, so the state is read, not the text. */
async function saved() {
  await waitFor(() => expect(document.querySelector('[data-save-state="saved"]')).not.toBeNull(), { timeout: 3000 })
}

async function openFile(container: HTMLElement, text: string, name = 'board.json') {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'application/json' })] } })
}

async function exportText(): Promise<string> {
  await runCommand('Download a copy')
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
  it('adds, edits, and deletes a note on a part', async () => {
    render(<App />)
    await loadNordet()
    selectPart('approval')
    addNote('Ask legal who signs off')
    const item = panel().getByText('Ask legal who signs off').closest('li')!
    expect(item).toHaveAttribute('data-yours')
    expect(within(item).getByText(/^Note/)).toBeInTheDocument()

    fireEvent.click(within(item).getByRole('button', { name: 'Edit note' }))
    fireEvent.change(within(item).getByRole('textbox'), { target: { value: 'Ask legal and finance' } })
    fireEvent.click(within(item).getByRole('button', { name: 'Save' }))
    expect(panel().getByText('Ask legal and finance')).toBeInTheDocument()
    expect(panel().queryByText('Ask legal who signs off')).not.toBeInTheDocument()

    // Delete acts at once, and the toast offers the way back.
    fireEvent.click(panel().getByRole('button', { name: 'Delete note' }))
    expect(panel().queryByText('Ask legal and finance')).not.toBeInTheDocument()
    const toast = (await screen.findByText('Note deleted')).closest('li')!
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }))
    expect(panel().getByText('Ask legal and finance')).toBeInTheDocument()
  })

  it('adds a question to a connection, and counts it on the card', async () => {
    render(<App />)
    await loadNordet()
    const rel = nordet.relationships.find((r) => r.id === 'approval-to-send')!
    await openConnection(rel.label)
    addNote('What if the version is stale?', 'Question')
    const item = panel().getByText('What if the version is stale?').closest('li')!
    expect(within(item).getByText(/^Question/)).toBeInTheDocument()

    selectPart('approval')
    addNote('One more')
    expect(screen.getByRole('img', { name: '1 note or question from you, not sent' })).toBeInTheDocument()
  })

  it('keeps the composer to one row until it is used', async () => {
    render(<App />)
    await loadNordet()
    const box = panel().getByRole('textbox', { name: 'Add a note' })
    expect(panel().queryByRole('radiogroup', { name: 'Kind' })).not.toBeInTheDocument()
    fireEvent.focus(box)
    expect(panel().getByRole('radiogroup', { name: 'Kind' })).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('shows a note under its group even when the group was closed', async () => {
    render(<App />)
    await loadNordet()
    expect(panel().queryByRole('button', { name: /^Notes/ })).not.toBeInTheDocument()
    addNote('First thought')
    fireEvent.click(panel().getByRole('button', { name: /^Notes/ }))
    expect(panel().getByRole('button', { name: /^Notes/ })).toHaveAttribute('aria-expanded', 'false')
    addNote('Back in view')
    expect(panel().getByRole('button', { name: /^Notes/ })).toHaveAttribute('aria-expanded', 'true')
    expect(within(panel().getByRole('region', { name: 'Notes' })).getByText('Back in view')).toBeInTheDocument()
  })

  it('keeps C working after a group was opened with the keyboard', async () => {
    render(<App />)
    await loadNordet()
    const toggle = panel().getByRole('button', { name: /^Walkthroughs/ })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    toggle.focus()
    fireEvent.keyDown(toggle, { key: 'c' })
    await waitFor(() => expect(panel().getByRole('textbox', { name: 'Add a note' })).toHaveFocus())
  })

  it('keeps focus in the field when Add is pressed from the keyboard', async () => {
    render(<App />)
    await loadNordet()
    const box = panel().getByRole('textbox', { name: 'Add a note' })
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'From the keyboard' } })
    fireEvent.click(panel().getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(within(panel().getByRole('region', { name: 'Notes' })).getByText('From the keyboard')).toBeInTheDocument())
    expect(box).toHaveFocus()
  })

  it('shows a counter only near the limit', async () => {
    render(<App />)
    await loadNordet()
    const box = panel().getByRole('textbox', { name: 'Add a note' })
    fireEvent.change(box, { target: { value: 'a'.repeat(100) } })
    expect(panel().queryByText(/of 2000/)).not.toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'a'.repeat(1950) } })
    expect(panel().getByText('1950 of 2000')).toBeInTheDocument()
  })

  it('adds with Ctrl+Enter', async () => {
    render(<App />)
    await loadNordet()
    fireEvent.change(panel().getByRole('textbox', { name: 'Add a note' }), { target: { value: 'Whole board thought' } })
    fireEvent.keyDown(panel().getByRole('textbox', { name: 'Add a note' }), { key: 'Enter', ctrlKey: true })
    expect(within(panel().getByRole('region', { name: 'Notes' })).getByText('Whole board thought')).toBeInTheDocument()
  })
})

describe('your links', () => {
  it('draws a link from the keyboard path, shows it in the flow, and lists it in the line key', async () => {
    render(<App />)
    await loadNordet()
    selectPart('preview')
    await addLink('Saved record', 'I would check this')
    expect(await panel().findByRole('heading', { name: 'I would check this' })).toBeInTheDocument()
    expect(panel().getByRole('textbox', { name: 'Label' })).toHaveValue('I would check this')

    selectPart('preview')
    const row = within(flow()).getByRole('button', { name: 'I would check this' }).closest('li')!
    expect(row).toHaveAttribute('data-yours', 'link')
    expect(within(row).getByRole('button', { name: 'Saved record' })).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'I would check this' }))

    fireEvent.click(screen.getByRole('button', { name: 'Line key' }))
    const key = await screen.findByRole('dialog', { name: 'Line key' })
    expect(within(key).getByText('Your link')).toBeInTheDocument()

    fireEvent.click(panel().getByRole('button', { name: 'Delete' }))
    expect(panel().getByRole('heading', { name: nordet.title })).toBeInTheDocument()
    expect(await screen.findByText('Link deleted')).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('keeps notes, a moved card, and a link across a reload', async () => {
    const first = render(<App />)
    await loadNordet()
    selectPart('approval')
    addNote('Survives a reload')
    await addLink('Saved record')
    // Adding a link shows the link. The card must be selected again for the arrow keys to move it.
    fireEvent.click(panel().getByRole('button', { name: 'Board' }))
    selectPart('approval')

    const card = first.container.querySelector('.react-flow__node[data-id="approval"]') as HTMLElement
    fireEvent.keyDown(card, { key: 'ArrowRight', shiftKey: true })
    // A keyboard move is saved once the keys stop, a quarter of a second later.
    await new Promise((resolve) => setTimeout(resolve, 350))
    await saved()
    first.unmount()

    const store = await openStore()
    const raw = await store.loadBoard('nordet-invoice-follow-up')
    store.close()
    const moved = positionOf(raw, 'approval')
    expect(moved).toBeDefined()
    const start = placeCards(nordetBoard(), { positions: {}, sizes: {} })['approval']!
    expect(moved).not.toEqual(start)

    render(<App />)
    await screen.findByTestId('inspector')
    expect(await panel().findByRole('heading', { name: nordet.title })).toBeInTheDocument()
    selectPart('approval')
    expect(panel().getByText('Survives a reload')).toBeInTheDocument()
    const mine = within(flow()).getByRole('button', { name: 'Link' }).closest('li')!
    expect(within(mine).getByRole('button', { name: 'Saved record' })).toBeInTheDocument()
    await saved()
    const again = await openStore()
    const reloaded = await again.loadBoard('nordet-invoice-follow-up')
    again.close()
    expect(positionOf(reloaded, 'approval').x).toBe(moved.x)
  })

  it('says Not saved and offers a download when the write fails, and keeps the note', async () => {
    failing.on = true
    render(<App />)
    await loadNordet()
    selectPart('approval')
    addNote('Still here')
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(within(alert).getByText('Not saved')).toBeInTheDocument()
    expect(within(alert).getByText(/out of storage space/)).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Download a copy' })).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(panel().getByText('Still here')).toBeInTheDocument()
    expect(new StorageError('quota', 'x').kind).toBe('quota')
  })

  it('lists saved boards, and asks before deleting one', async () => {
    render(<App />)
    await loadNordet()
    await saved()
    press(within(screen.getByRole('banner')).getByRole('button', { name: 'Example' }))
    const open = within(await screen.findByRole('dialog', { name: 'Open' }))
    expect(open.getByRole('heading', { name: 'Recent' })).toBeInTheDocument()
    fireEvent.click(open.getByRole('button', { name: `Delete ${nordet.title}` }))
    const dialog = await screen.findByRole('dialog', { name: `Delete ${nordet.title}?` })
    expect(within(dialog).getByText(/notes from this browser/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete board' }))
    expect(await screen.findByRole('button', { name: 'Open file' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument())
  })
})

describe('export and open', () => {
  it('restores notes, positions, and links from an export in a fresh browser', async () => {
    const first = render(<App />)
    await loadNordet()
    selectPart('approval')
    addNote('Travels with the file')
    await addLink('Saved record')
    fireEvent.click(panel().getByRole('button', { name: 'Board' }))
    selectPart('approval')
    const card = first.container.querySelector('.react-flow__node[data-id="approval"]') as HTMLElement
    fireEvent.keyDown(card, { key: 'ArrowDown', shiftKey: true })
    // A keyboard move joins the layer once the keys stop, a quarter of a second later.
    await new Promise((resolve) => setTimeout(resolve, 350))
    const text = await exportText()
    expect(await screen.findByText('Downloaded')).toBeInTheDocument()
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
    const file = JSON.parse(text) as { layer: { positions: Record<string, { y: number }> } }
    first.unmount()

    globalThis.indexedDB = new IDBFactory()
    const second = render(<App />)
    await openFile(second.container, text, 'export.json')
    await screen.findByTestId('inspector')
    expect(await panel().findByRole('heading', { name: nordet.title })).toBeInTheDocument()
    selectPart('approval')
    expect(panel().getByText('Travels with the file')).toBeInTheDocument()
    const mine = within(flow()).getByRole('button', { name: 'Link' }).closest('li')!
    expect(within(mine).getByRole('button', { name: 'Saved record' })).toBeInTheDocument()
    await saved()
    const store = await openStore()
    const raw = await store.loadBoard('nordet-invoice-follow-up')
    store.close()
    expect(positionOf(raw, 'approval').y).toBe(file.layer.positions['approval']!.y)
  })

  it('asks which notes to keep when a file and this browser both have notes', async () => {
    const first = render(<App />)
    await loadNordet()
    selectPart('approval')
    addNote('In the file')
    const text = await exportText()
    addNote('Only in the browser')
    await saved()

    await openFile(first.container, text, 'export.json')
    const dialog = await screen.findByRole('dialog', { name: /Notes and layout for/ })
    fireEvent.click(within(dialog).getByRole('button', { name: "Use file notes and layout" }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(panel().getByText('In the file')).toBeInTheDocument()
    expect(panel().queryByText('Only in the browser')).not.toBeInTheDocument()

    addNote('Newer')
    await saved()
    await openFile(first.container, text, 'export.json')
    const again = await screen.findByRole('dialog', { name: /Notes and layout for/ })
    fireEvent.click(within(again).getByRole('button', { name: 'Use browser notes and layout' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(panel().getByText('Newer')).toBeInTheDocument()
  })
})

describe('a new version of a board you already have', () => {
  it('reviews what changed and flags notes, and never moves them by itself', async () => {
    const first = render(<App />)
    await loadNordet()
    selectPart('preview')
    addNote('Check the wording')
    fireEvent.click(panel().getByRole('button', { name: 'Board' }))
    selectPart('fictional-clock')
    addNote('Where does the date come from?', 'Question')
    fireEvent.click(panel().getByRole('button', { name: 'Board' }))
    await saved()

    await openFile(first.container, modifiedNordet(), 'nordet.json')
    // A new revision does not switch tabs. A toast says so and offers the review.
    expect(await screen.findByText('Revision 2 is open')).toBeInTheDocument()
    const tab = await panel().findByRole('tab', { name: /Review/ })
    expect(tab).toHaveTextContent('2')
    expect(panel().getByRole('heading', { name: nordet.title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))

    const changes = panel().getByRole('region', { name: 'Changed in revision 2' })
    expect(within(changes).getByRole('button', { name: part('preview').label })).toBeInTheDocument()
    expect(within(changes).getByText(part('fictional-clock').label)).toBeInTheDocument()

    const outdatedGroup = panel().getByRole('region', { name: 'Possibly outdated' })
    const outdated = within(outdatedGroup).getByText('Check the wording').closest('li')!
    expect(within(outdated).getByText(/Preview changed after you wrote this: summary\./)).toBeInTheDocument()
    const relinking = panel().getByRole('region', { name: 'Needs relinking' })
    const homeless = within(relinking).getByText('Where does the date come from?').closest('li')!
    expect(within(homeless).getByText(/was removed\./)).toBeInTheDocument()

    fireEvent.click(within(outdated).getByRole('button', { name: 'Still true' }))
    expect(panel().queryByRole('region', { name: 'Possibly outdated' })).not.toBeInTheDocument()

    press(within(homeless).getByRole('button', { name: 'Attach to' }))
    await pick(/^Rule check/)
    expect(panel().queryByRole('region', { name: 'Needs relinking' })).not.toBeInTheDocument()

    fireEvent.click(panel().getByRole('button', { name: 'Mark reviewed' }))
    // With nothing left to review, the Review tab goes quiet and the details show.
    await waitFor(() => expect(panel().getByRole('tab', { name: /Review/ })).toHaveAttribute('aria-disabled', 'true'))

    selectPart('rule-check')
    expect(panel().getByText('Where does the date come from?')).toBeInTheDocument()
  })

  it('keeps a note whose part was removed until the user decides', async () => {
    const first = render(<App />)
    await loadNordet()
    selectPart('fictional-clock')
    addNote('Orphan')
    fireEvent.click(panel().getByRole('button', { name: 'Board' }))
    await openFile(first.container, modifiedNordet(), 'nordet.json')
    fireEvent.click(await panel().findByRole('tab', { name: /Review/ }))
    fireEvent.click(await panel().findByRole('button', { name: 'Mark reviewed' }))
    const relinking = panel().getByRole('region', { name: 'Needs relinking' })
    expect(within(relinking).getByText('Orphan')).toBeInTheDocument()
  })
})
