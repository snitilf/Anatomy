import { describe, expect, it } from 'vitest'
import { addLink, addNote, addProposal, confirmNote, relinkNote } from './edits'
import { emptyLayer } from './model'
import { linkStatus, noteStatus, summarizeLayer } from './status'
import { anatomyBoard, clone } from './testBoards'

const now = new Date('2026-01-01T00:00:00.000Z')

describe('note status', () => {
  it('moves current -> possibly-outdated -> current after confirm', () => {
    const board = anatomyBoard()
    const target = { type: 'component' as const, id: board.components[0]!.id }
    let layer = addNote(emptyLayer(board.id), board, { kind: 'note', text: 'hi', target }, now, 'note-aaaaaa')
    const note = () => layer.notes[0]!
    expect(noteStatus(board, note())).toBe('current')

    const next = clone(board)
    next.components[0]!.summary = 'A new summary.'
    expect(noteStatus(next, note())).toBe('possibly-outdated')
    expect(summarizeLayer(next, layer).outdated).toHaveLength(1)

    layer = confirmNote(layer, next, 'note-aaaaaa', now)
    expect(noteStatus(next, note())).toBe('current')
  })

  it('needs relinking when the target is removed, and relink fixes it', () => {
    const board = anatomyBoard()
    const removed = board.components[0]!.id
    let layer = addNote(emptyLayer(board.id), board, { kind: 'question', text: 'why', target: { type: 'component', id: removed } }, now, 'note-bbbbbb')
    const next = clone(board)
    next.components = next.components.filter((c) => c.id !== removed)
    expect(noteStatus(next, layer.notes[0]!)).toBe('needs-relinking')
    expect(summarizeLayer(next, layer).needsRelinking).toHaveLength(1)

    layer = relinkNote(layer, next, 'note-bbbbbb', { type: 'component', id: next.components[0]!.id }, now)
    expect(noteStatus(next, layer.notes[0]!)).toBe('current')
  })

  it('flags links with a missing endpoint, and keeps links to a proposed part', () => {
    const board = anatomyBoard()
    const [a, b] = board.components
    const r = addLink(emptyLayer(board.id), board, { from: a!.id, to: b!.id, label: '' }, now, 'link-cccccc')
    if (!r.ok) throw new Error('expected ok')
    const link = r.layer.links[0]!
    expect(linkStatus(board, r.layer, link)).toBe('current')
    const next = clone(board)
    next.components = next.components.filter((c) => c.id !== b!.id)
    expect(linkStatus(next, r.layer, link)).toBe('needs-relinking')
    expect(summarizeLayer(next, r.layer).brokenLinks).toEqual([link])

    const withPart = addProposal(r.layer, { id: 'part-aaaaaa', label: 'Cache', summary: '', x: 0, y: 0, width: 260, height: 150, createdAt: now.toISOString() })
    const toPart = addLink(withPart, board, { from: a!.id, to: 'part-aaaaaa', label: '' }, now, 'link-dddddd')
    if (!toPart.ok) throw new Error('expected ok')
    expect(linkStatus(board, toPart.layer, toPart.layer.links[1]!)).toBe('current')
  })

  it('board notes follow the board fingerprint', () => {
    const board = anatomyBoard()
    const layer = addNote(emptyLayer(board.id), board, { kind: 'note', text: 'x', target: { type: 'board' } }, now, 'note-dddddd')
    expect(noteStatus({ ...board, title: 'Renamed' }, layer.notes[0]!)).toBe('possibly-outdated')
  })
})
