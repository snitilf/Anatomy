import { describe, expect, it } from 'vitest'
import {
  addManualLink,
  addNote,
  confirmNote,
  deleteManualLink,
  deleteNote,
  editManualLink,
  editNote,
  newId,
  relinkNote,
  setPosition,
} from './notes'
import { overlaySchema } from './schema'
import { anatomyBoard, clone } from './testBoards'
import { emptyOverlay } from './types'

const t0 = new Date('2026-01-01T00:00:00.000Z')
const t1 = new Date('2026-02-01T00:00:00.000Z')

describe('notes', () => {
  const board = anatomyBoard()
  const [a, b] = board.components
  const target = { type: 'component' as const, id: a!.id }

  it('adds, edits, confirms, relinks and deletes without mutating', () => {
    const empty = emptyOverlay(board.id)
    const frozen = JSON.stringify(empty)
    const o1 = addNote(empty, board, { kind: 'note', text: '  hello  ', target }, t0, 'note-abcdef')
    expect(JSON.stringify(empty)).toBe(frozen)
    expect(o1.notes[0]).toMatchObject({ text: 'hello', createdAt: t0.toISOString(), updatedAt: t0.toISOString() })

    const changed = clone(board)
    changed.components[0]!.summary = 'Different.'
    const original = o1.notes[0]!.targetFingerprint

    const o2 = editNote(o1, 'note-abcdef', 'edited', t1)
    expect(o2.notes[0]).toMatchObject({ text: 'edited', updatedAt: t1.toISOString(), targetFingerprint: original })

    const o3 = confirmNote(o2, changed, 'note-abcdef', t1)
    expect(o3.notes[0]!.targetFingerprint).not.toBe(original)

    const o4 = relinkNote(o3, board, 'note-abcdef', { type: 'component', id: b!.id }, t1)
    expect(o4.notes[0]!.target).toEqual({ type: 'component', id: b!.id })
    expect(relinkNote(o4, board, 'note-abcdef', { type: 'component', id: 'ghost' }, t1)).toBe(o4)

    expect(deleteNote(o4, 'note-abcdef').notes).toEqual([])
    expect(deleteNote(o4, 'note-zzzzzz')).toBe(o4)
    expect(overlaySchema.safeParse(o4).success).toBe(true)
  })

  it('ignores invalid notes', () => {
    const empty = emptyOverlay(board.id)
    expect(addNote(empty, board, { kind: 'note', text: '   ', target }, t0, 'note-abcdef')).toBe(empty)
    expect(addNote(empty, board, { kind: 'note', text: 'x', target: { type: 'component', id: 'ghost' } }, t0, 'note-abcdef')).toBe(empty)
    const o = addNote(empty, board, { kind: 'note', text: 'x', target }, t0, 'note-abcdef')
    expect(editNote(o, 'note-abcdef', '  ', t1)).toBe(o)
    expect(editNote(o, 'note-nothere', 'y', t1)).toBe(o)
  })
})

describe('manual links', () => {
  const board = anatomyBoard()
  const [a, b] = board.components
  const empty = emptyOverlay(board.id)

  it('adds, edits and deletes', () => {
    const r = addManualLink(empty, { from: a!.id, to: b!.id, label: 'feeds' }, t0, 'link-abcdef', board)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const e = editManualLink(r.overlay, 'link-abcdef', { label: 'renamed' }, board)
    expect(e.ok && e.overlay.manualLinks[0]!.label).toBe('renamed')
    expect(deleteManualLink(r.overlay, 'link-abcdef').manualLinks).toEqual([])
  })

  it('rejects same ends, unknown ids, long labels', () => {
    for (const input of [
      { from: a!.id, to: a!.id, label: '' },
      { from: a!.id, to: 'ghost', label: '' },
      { from: a!.id, to: b!.id, label: 'x'.repeat(61) },
    ]) {
      const r = addManualLink(empty, input, t0, 'link-abcdef', board)
      expect(r.ok).toBe(false)
      expect(r.overlay).toBe(empty)
    }
    expect(editManualLink(empty, 'link-nothere', {}, board).ok).toBe(false)
  })
})

describe('setPosition and newId', () => {
  it('sets a position without mutation and rejects bad numbers', () => {
    const o = emptyOverlay('x')
    const p = setPosition(o, 'api', { x: 1, y: 2 })
    expect(p.positions).toEqual({ api: { x: 1, y: 2 } })
    expect(o.positions).toEqual({})
    expect(setPosition(p, 'api', { x: NaN, y: 0 })).toBe(p)
    expect(setPosition(p, 'api', { x: 1e9, y: 0 })).toBe(p)
  })

  it('makes valid unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId('note')))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^note-[a-z0-9]{12}$/)
    expect(newId('link')).toMatch(/^link-[a-z0-9]{12}$/)
  })
})
