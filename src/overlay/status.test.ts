import { describe, expect, it } from 'vitest'
import { addManualLink, addNote, confirmNote, relinkNote } from './notes'
import { manualLinkStatus, noteStatus, summarizeOverlay } from './status'
import { anatomyBoard, clone } from './testBoards'
import { emptyOverlay } from './types'

const now = new Date('2026-01-01T00:00:00.000Z')

describe('note status', () => {
  it('moves current -> possibly-outdated -> current after confirm', () => {
    const board = anatomyBoard()
    const target = { type: 'component' as const, id: board.components[0]!.id }
    let overlay = addNote(emptyOverlay(board.id), board, { kind: 'note', text: 'hi', target }, now, 'note-aaaaaa')
    const note = () => overlay.notes[0]!
    expect(noteStatus(board, note())).toBe('current')

    const next = clone(board)
    next.components[0]!.summary = 'A new summary.'
    expect(noteStatus(next, note())).toBe('possibly-outdated')
    expect(summarizeOverlay(next, overlay).outdated).toHaveLength(1)

    overlay = confirmNote(overlay, next, 'note-aaaaaa', now)
    expect(noteStatus(next, note())).toBe('current')
  })

  it('needs relinking when the target is removed, and relink fixes it', () => {
    const board = anatomyBoard()
    const removed = board.components[0]!.id
    let overlay = addNote(emptyOverlay(board.id), board, { kind: 'question', text: 'why', target: { type: 'component', id: removed } }, now, 'note-bbbbbb')
    const next = clone(board)
    next.components = next.components.filter((c) => c.id !== removed)
    expect(noteStatus(next, overlay.notes[0]!)).toBe('needs-relinking')
    expect(summarizeOverlay(next, overlay).needsRelinking).toHaveLength(1)

    overlay = relinkNote(overlay, next, 'note-bbbbbb', { type: 'component', id: next.components[0]!.id }, now)
    expect(noteStatus(next, overlay.notes[0]!)).toBe('current')
  })

  it('flags manual links with a missing endpoint', () => {
    const board = anatomyBoard()
    const [a, b] = board.components
    const r = addManualLink(emptyOverlay(board.id), { from: a!.id, to: b!.id, label: '' }, now, 'link-cccccc', board)
    if (!r.ok) throw new Error('expected ok')
    const link = r.overlay.manualLinks[0]!
    expect(manualLinkStatus(board, link)).toBe('current')
    const next = clone(board)
    next.components = next.components.filter((c) => c.id !== b!.id)
    expect(manualLinkStatus(next, link)).toBe('needs-relinking')
    expect(summarizeOverlay(next, r.overlay).brokenLinks).toEqual([link])
  })

  it('board notes follow the board fingerprint', () => {
    const board = anatomyBoard()
    const overlay = addNote(emptyOverlay(board.id), board, { kind: 'note', text: 'x', target: { type: 'board' } }, now, 'note-dddddd')
    expect(noteStatus({ ...board, title: 'Renamed' }, overlay.notes[0]!)).toBe('possibly-outdated')
  })
})
