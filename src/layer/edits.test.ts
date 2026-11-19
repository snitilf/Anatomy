import { describe, expect, it } from 'vitest'
import {
  addLink,
  addMark,
  addNote,
  addProposal,
  archiveItems,
  confirmNote,
  deleteLink,
  deleteNote,
  deleteProposal,
  dropArchived,
  editLink,
  editNote,
  findItem,
  moveCards,
  newId,
  receiveAnswers,
  reconnect,
  relinkNote,
  resizeCard,
  restoreArchived,
  simplifyStroke,
  updateMark,
} from './edits'
import { emptyLayer, layerSchema, type Layer, type Mark, type Proposal } from './model'
import { anatomyBoard, clone, refundBoard } from './testBoards'

const t0 = new Date('2026-01-01T00:00:00.000Z')
const t1 = new Date('2026-02-01T00:00:00.000Z')
const iso = t0.toISOString()

const part = (id: string, x = 0): Proposal => ({ id, label: 'Cache', summary: 'Keeps answers.', x, y: 0, width: 260, height: 150, createdAt: iso })

function valid(layer: Layer) {
  expect(layerSchema.safeParse(layer).success).toBe(true)
}

describe('notes', () => {
  const board = anatomyBoard()
  const [a, b] = board.components
  const target = { type: 'component' as const, id: a!.id }

  it('adds, edits, confirms, relinks and deletes without mutating', () => {
    const empty = emptyLayer(board.id)
    const frozen = JSON.stringify(empty)
    const l1 = addNote(empty, board, { kind: 'note', text: '  hello  ', target }, t0, 'note-abcdef')
    expect(JSON.stringify(empty)).toBe(frozen)
    expect(l1.notes[0]).toMatchObject({ text: 'hello', createdAt: t0.toISOString(), updatedAt: t0.toISOString() })

    const changed = clone(board)
    changed.components[0]!.summary = 'Different.'
    const original = l1.notes[0]!.targetFingerprint

    const l2 = editNote(l1, 'note-abcdef', 'edited', t1)
    expect(l2.notes[0]).toMatchObject({ text: 'edited', updatedAt: t1.toISOString(), targetFingerprint: original })
    expect(editNote(l2, 'note-abcdef', 'edited', t1)).toBe(l2)

    const l3 = confirmNote(l2, changed, 'note-abcdef', t1)
    expect(l3.notes[0]!.targetFingerprint).not.toBe(original)

    const l4 = relinkNote(l3, board, 'note-abcdef', { type: 'component', id: b!.id }, t1)
    expect(l4.notes[0]!.target).toEqual({ type: 'component', id: b!.id })
    expect(relinkNote(l4, board, 'note-abcdef', { type: 'component', id: 'ghost' }, t1)).toBe(l4)

    expect(deleteNote(l4, 'note-abcdef').notes).toEqual([])
    expect(deleteNote(l4, 'note-zzzzzz')).toBe(l4)
    valid(l4)
  })

  it('ignores invalid notes', () => {
    const empty = emptyLayer(board.id)
    expect(addNote(empty, board, { kind: 'note', text: '   ', target }, t0, 'note-abcdef')).toBe(empty)
    expect(addNote(empty, board, { kind: 'note', text: 'x', target: { type: 'component', id: 'ghost' } }, t0, 'note-abcdef')).toBe(empty)
    const l = addNote(empty, board, { kind: 'note', text: 'x', target }, t0, 'note-abcdef')
    expect(editNote(l, 'note-abcdef', '  ', t1)).toBe(l)
    expect(editNote(l, 'note-nothere', 'y', t1)).toBe(l)
  })
})

describe('links', () => {
  const board = anatomyBoard()
  const [a, b] = board.components
  const empty = emptyLayer(board.id)

  it('adds, edits and deletes, also to a proposed part', () => {
    const r = addLink(empty, board, { from: a!.id, to: b!.id, label: 'feeds' }, t0, 'link-abcdef')
    if (!r.ok) throw new Error('expected ok')
    const e = editLink(r.layer, board, 'link-abcdef', { label: 'renamed' })
    expect(e.ok && e.layer.links[0]!.label).toBe('renamed')
    expect(deleteLink(r.layer, 'link-abcdef').links).toEqual([])

    const withPart = addProposal(empty, part('part-aaaaaa'))
    const toPart = addLink(withPart, board, { from: a!.id, to: 'part-aaaaaa', label: '' }, t0, 'link-bbbbbb')
    expect(toPart.ok).toBe(true)
  })

  it('rejects same ends, unknown ids, long labels', () => {
    for (const input of [
      { from: a!.id, to: a!.id, label: '' },
      { from: a!.id, to: 'ghost', label: '' },
      { from: a!.id, to: b!.id, label: 'x'.repeat(61) },
    ]) {
      const r = addLink(empty, board, input, t0, 'link-abcdef')
      expect(r.ok).toBe(false)
      expect(r.layer).toBe(empty)
    }
    expect(editLink(empty, board, 'link-nothere', {}).ok).toBe(false)
  })
})

describe('cards', () => {
  it('stores only the cards the user moved, in one change, and rejects bad numbers', () => {
    const l = emptyLayer('x')
    const moved = moveCards(l, { api: { x: 1, y: 2 }, db: { x: 3, y: 4 } })
    expect(moved.positions).toEqual({ api: { x: 1, y: 2 }, db: { x: 3, y: 4 } })
    expect(l.positions).toEqual({})
    expect(moveCards(moved, { api: { x: 1, y: 2 } })).toBe(moved)
    expect(moveCards(moved, { api: { x: NaN, y: 0 } })).toBe(moved)
    expect(moveCards(moved, { api: { x: 1e9, y: 0 } })).toBe(moved)
  })

  it('stores a size and ignores the same size or a negative one', () => {
    const l = resizeCard(emptyLayer('x'), 'api', { width: 320, height: 200 })
    expect(l.sizes).toEqual({ api: { width: 320, height: 200 } })
    expect(resizeCard(l, 'api', { width: 320, height: 200 })).toBe(l)
    expect(resizeCard(l, 'api', { width: -1, height: 200 })).toBe(l)
    valid(l)
  })
})

describe('marks', () => {
  const stroke = (points: { x: number; y: number }[]): Mark => ({ id: 'mark-aaaaaa', createdAt: iso, kind: 'stroke', points })

  it('simplifies a stroke: a straight run keeps its ends, a corner stays', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i * 0.01 }))
    expect(simplifyStroke(line)).toEqual([{ x: 0, y: 0 }, { x: 49, y: 0.5 }])
    const corner = [...Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 })), ...Array.from({ length: 20 }, (_, i) => ({ x: 19, y: i + 1 }))]
    expect(simplifyStroke(corner)).toEqual([{ x: 0, y: 0 }, { x: 19, y: 0 }, { x: 19, y: 20 }])
  })

  it('adds a simplified stroke, and caps its points', () => {
    const zigzag = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: i % 2 === 0 ? 0 : 10 }))
    const l = addMark(emptyLayer('x'), stroke(zigzag))
    const added = l.marks[0]
    expect(added?.kind === 'stroke' && added.points.length).toBe(2000)
    valid(l)
  })

  it('rejects invalid marks and keeps the ID and kind on update', () => {
    const empty = emptyLayer('x')
    expect(addMark(empty, stroke([]))).toBe(empty)
    expect(addMark(empty, { id: 'mark-aaaaaa', createdAt: iso, kind: 'text', x: 0, y: 0, width: 10, height: 10, text: '  ' })).toBe(empty)
    const box: Mark = { id: 'mark-bbbbbb', createdAt: iso, kind: 'rect', x: 0, y: 0, width: 100, height: 60 }
    const l = addMark(empty, box)
    const moved = updateMark(l, box.id, (m) => ({ ...m, x: 40, note: 'These two' }) as Mark)
    expect(moved.marks[0]).toMatchObject({ x: 40, note: 'These two' })
    expect(updateMark(l, box.id, (m) => ({ ...m, id: 'mark-cccccc' }))).toBe(l)
    expect(updateMark(l, box.id, (m) => ({ ...m, width: -5 }) as Mark)).toBe(l)
  })
})

describe('proposals and reconnects', () => {
  const board = refundBoard()
  const rel = board.relationships[0]!
  const other = board.components.find((c) => c.id !== rel.from && c.id !== rel.to)!

  it('moves an end, and dropping it back on the original part removes the edit', () => {
    const empty = emptyLayer(board.id)
    const r1 = reconnect(empty, board, { relationshipId: rel.id, end: 'to', part: other.id }, t0, 'edit-aaaaaa')
    if (!r1.ok) throw new Error('expected ok')
    expect(r1.layer.reconnects).toEqual([{ id: 'edit-aaaaaa', relationshipId: rel.id, to: other.id, createdAt: iso }])
    const back = reconnect(r1.layer, board, { relationshipId: rel.id, end: 'to', part: rel.to }, t1, 'edit-bbbbbb')
    expect(back.ok && back.layer.reconnects).toEqual([])
    expect(reconnect(empty, board, { relationshipId: rel.id, end: 'to', part: rel.from }, t0, 'edit-aaaaaa').ok).toBe(false)
    expect(reconnect(empty, board, { relationshipId: 'ghost', end: 'to', part: other.id }, t0, 'edit-aaaaaa').ok).toBe(false)
    valid(r1.layer)
  })

  it('deleting a proposed part takes its links and moved ends with it, and leaves arrows at its spot', () => {
    let l = addProposal(emptyLayer(board.id), part('part-aaaaaa', 1000))
    const linked = addLink(l, board, { from: other.id, to: 'part-aaaaaa', label: '' }, t0, 'link-aaaaaa')
    if (!linked.ok) throw new Error('expected ok')
    const moved = reconnect(linked.layer, board, { relationshipId: rel.id, end: 'to', part: 'part-aaaaaa' }, t0, 'edit-aaaaaa')
    if (!moved.ok) throw new Error('expected ok')
    l = addMark(moved.layer, { id: 'mark-aaaaaa', createdAt: iso, kind: 'arrow', from: { type: 'point', x: 0, y: 0 }, to: { type: 'part', id: 'part-aaaaaa' } })
    const gone = deleteProposal(l, 'part-aaaaaa')
    expect(gone.proposals).toEqual([])
    expect(gone.links).toEqual([])
    expect(gone.reconnects).toEqual([])
    expect(gone.marks[0]).toMatchObject({ to: { type: 'point', x: 1130, y: 75 } })
    valid(gone)
  })
})

describe('archive', () => {
  const board = anatomyBoard()
  const response = { respondsTo: 'feedback-aaaaaa', status: 'adopted' as const, text: 'Added.', changed: [] }

  it('moves resolved items into the archive and restores them', () => {
    const l = addNote(emptyLayer(board.id), board, { kind: 'question', text: 'Why?', target: { type: 'board' } }, t0, 'note-aaaaaa')
    const archived = archiveItems(l, [{ id: 'note-aaaaaa', response }, { id: 'note-ghost1', response }], t1)
    expect(archived.notes).toEqual([])
    expect(archived.archive).toEqual([{ type: 'note', item: l.notes[0], response, archivedAt: t1.toISOString() }])
    expect(findItem(archived, 'note-aaaaaa')).toBeUndefined()
    valid(archived)
    expect(restoreArchived(archived, 'note-aaaaaa').notes).toEqual(l.notes)
    expect(restoreArchived(archived, 'note-aaaaaa').archive).toEqual([])
    expect(dropArchived(archived, 'note-aaaaaa').archive).toEqual([])
    expect(archiveItems(l, [{ id: 'note-ghost1', response }], t1)).toBe(l)
  })
})

describe('answers from a revision', () => {
  /** The next revision of a board, answering the user's items. */
  function answering(board: ReturnType<typeof refundBoard>, items: { feedbackId: string; status: 'adopted' | 'declined' | 'answered'; text: string; changed: string[] }[]) {
    const next = clone(board)
    next.revision = board.revision + 1
    next.responses = { respondsTo: 'feedback-aaaaaa', items }
    return next
  }

  it('archives an adopted reconnect whose changes are on the board, and keeps declined and answered items with their answer', () => {
    for (const board of [refundBoard(), anatomyBoard()]) {
      const rel = board.relationships[0]!
      const other = board.components.find((c) => c.id !== rel.from && c.id !== rel.to)!
      let layer = addNote(emptyLayer(board.id), board, { kind: 'question', text: 'Why?', target: { type: 'board' } }, t0, 'note-aaaaaa')
      layer = addNote(layer, board, { kind: 'note', text: 'Split it.', target: { type: 'board' } }, t0, 'note-bbbbbb')
      const moved = reconnect(layer, board, { relationshipId: rel.id, end: 'to', part: other.id }, t0, 'edit-aaaaaa')
      if (!moved.ok) throw new Error('reconnect')
      layer = moved.layer
      const next = answering(board, [
        { feedbackId: 'edit-aaaaaa', status: 'adopted', text: 'Moved it.', changed: [rel.id] },
        { feedbackId: 'note-aaaaaa', status: 'answered', text: 'Because.', changed: [] },
        { feedbackId: 'note-bbbbbb', status: 'declined', text: 'Too small.', changed: [] },
        { feedbackId: 'note-gone00', status: 'answered', text: 'Nothing here.', changed: [] },
      ])
      next.relationships[0] = { ...rel, to: other.id }
      const after = receiveAnswers(layer, next, t1)
      expect(after.reconnects).toEqual([])
      expect(after.archive.map((e) => [e.item.id, e.response.status, e.archivedAt])).toEqual([['edit-aaaaaa', 'adopted', t1.toISOString()]])
      expect(after.notes.map((n) => n.id)).toEqual(['note-aaaaaa', 'note-bbbbbb'])
      expect(after.answers.map((a) => [a.id, a.response.status, a.response.respondsTo])).toEqual([
        ['note-aaaaaa', 'answered', 'feedback-aaaaaa'],
        ['note-bbbbbb', 'declined', 'feedback-aaaaaa'],
      ])
      expect(layerSchema.safeParse(after).success).toBe(true)
      // The same revision opening again changes nothing.
      expect(receiveAnswers(after, next, t1)).toBe(after)
    }
  })

  it('keeps an adopted item on the map when what it names is not on the board', () => {
    const board = refundBoard()
    const layer = addNote(emptyLayer(board.id), board, { kind: 'note', text: 'Add a queue.', target: { type: 'board' } }, t0, 'note-aaaaaa')
    for (const changed of [[], ['no-such-part']]) {
      const after = receiveAnswers(layer, answering(board, [{ feedbackId: 'note-aaaaaa', status: 'adopted', text: 'Added.', changed }]), t1)
      expect(after.notes).toHaveLength(1)
      expect(after.archive).toEqual([])
      expect(after.answers[0]?.response.status).toBe('adopted')
    }
  })

  it('a restored item keeps its answer and is not archived again by the same revision', () => {
    const board = refundBoard()
    const part = board.components[0]!
    const layer = addNote(emptyLayer(board.id), board, { kind: 'note', text: 'Rename it.', target: { type: 'component', id: part.id } }, t0, 'note-aaaaaa')
    const next = answering(board, [{ feedbackId: 'note-aaaaaa', status: 'adopted', text: 'Renamed.', changed: [part.id] }])
    const archived = receiveAnswers(layer, next, t1)
    expect(archived.notes).toEqual([])
    const restored = restoreArchived(archived, 'note-aaaaaa')
    expect(restored.notes.map((n) => n.id)).toEqual(['note-aaaaaa'])
    expect(restored.answers.map((a) => a.id)).toEqual(['note-aaaaaa'])
    expect(receiveAnswers(restored, next, t1)).toBe(restored)
  })

  it('dismissing archives the item and its answer; deleting an item drops its answer', () => {
    const board = refundBoard()
    let layer = addNote(emptyLayer(board.id), board, { kind: 'note', text: 'x', target: { type: 'board' } }, t0, 'note-aaaaaa')
    layer = addNote(layer, board, { kind: 'note', text: 'y', target: { type: 'board' } }, t0, 'note-bbbbbb')
    const next = answering(board, [
      { feedbackId: 'note-aaaaaa', status: 'declined', text: 'No.', changed: [] },
      { feedbackId: 'note-bbbbbb', status: 'answered', text: 'Yes.', changed: [] },
    ])
    layer = receiveAnswers(layer, next, t1)
    const response = layer.answers[0]!.response
    const dismissed = archiveItems(layer, [{ id: 'note-aaaaaa', response }], t1)
    expect(dismissed.answers.map((a) => a.id)).toEqual(['note-bbbbbb'])
    expect(dismissed.archive[0]?.response).toEqual(response)
    expect(deleteNote(dismissed, 'note-bbbbbb').answers).toEqual([])
  })
})

describe('newId', () => {
  it('makes valid unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId('note')))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^note-[a-z0-9]{12}$/)
    expect(newId('part')).toMatch(/^part-[a-z0-9]{12}$/)
  })
})
