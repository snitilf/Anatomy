import { describe, expect, it } from 'vitest'
import { v1Placement } from './v1Layout'
import { emptyLayer, layerSchema, LAYER_LIMITS } from './model'
import { allBoards, refundBoard } from './testBoards'
import { readLayer } from './upgrade'

const iso = '2026-01-01T00:00:00.000Z'

function overlayV1(boardId: string, positions: Record<string, { x: number; y: number }>) {
  return {
    format: 'anatomy-overlay',
    schemaVersion: 1,
    boardId,
    positions,
    notes: [{ id: 'note-aaaaaa', kind: 'note', text: 'Hi', target: { type: 'board' }, targetFingerprint: 'abc', createdAt: iso, updatedAt: iso }],
    manualLinks: [{ id: 'link-aaaaaa', from: 'a', to: 'b', label: '', createdAt: iso }],
  }
}

describe('readLayer', () => {
  it('upgrades a version 1 overlay: frozen default positions go, moved ones stay, on every board', () => {
    for (const board of allBoards()) {
      const auto = v1Placement(board)
      const frozen = Object.fromEntries(Object.entries(auto).map(([id, r]) => [id, { x: r.x, y: r.y }]))
      const moved = board.components[0]!.id
      frozen[moved] = { x: -900, y: -900 }
      const r = readLayer(overlayV1(board.id, frozen), board)
      if (!r.ok) throw new Error('expected ok')
      expect(r.layer).toMatchObject({ format: 'anatomy-layer', schemaVersion: 2, positions: { [moved]: { x: -900, y: -900 } } })
      expect(Object.keys(r.layer.positions)).toEqual([moved])
      expect(r.layer.links.map((l) => l.id)).toEqual(['link-aaaaaa'])
      expect(r.layer.notes.map((n) => n.id)).toEqual(['note-aaaaaa'])
      expect(layerSchema.safeParse(r.layer).success).toBe(true)
    }
  })

  it('keeps every position of a version 1 overlay when the board is not known', () => {
    const r = readLayer(overlayV1('x', { a: { x: 0, y: 0 } }))
    expect(r.ok && r.layer.positions).toEqual({ a: { x: 0, y: 0 } })
  })

  it('reads version 2 as it is, and reports problems with paths', () => {
    const board = refundBoard()
    const layer = emptyLayer(board.id)
    expect(readLayer(layer, board)).toEqual({ ok: true, layer })
    const bad = readLayer({ ...layer, notes: [{ id: 'nope' }] })
    expect(!bad.ok && bad.errors[0]!.path).toMatch(/^notes\[0\]/)
    expect(readLayer({ format: 'something' }).ok).toBe(false)
    expect(readLayer(null).ok).toBe(false)
  })

  it('rejects a __proto__ key, out-of-range numbers, unknown keys inside a known field, and too many items, without polluting', () => {
    const layer = emptyLayer('x')
    const direct = JSON.parse('{"format":"anatomy-layer","schemaVersion":2,"boardId":"x","positions":{"__proto__":{"x":1,"y":2}},"sizes":{},"notes":[],"links":[],"marks":[],"proposals":[],"reconnects":[],"archive":[]}')
    expect(readLayer(direct).ok).toBe(false)
    expect(({} as Record<string, unknown>).x).toBeUndefined()
    expect(readLayer({ ...layer, positions: { a: { x: 1e6, y: 0 } } }).ok).toBe(false)
    // An unknown key at the top is a field of a later version and is left out. Inside a field this version knows, it is an error.
    expect(readLayer({ ...layer, positions: { a: { x: 1, y: 2, z: 3 } } }).ok).toBe(false)
    expect(readLayer({ ...layer, extra: 1 })).toEqual({ ok: true, layer })
    const many = Object.fromEntries(Array.from({ length: LAYER_LIMITS.positions + 1 }, (_, i) => [`c${i}`, { x: 0, y: 0 }]))
    expect(readLayer({ ...layer, positions: many }).ok).toBe(false)
    const points = Array.from({ length: LAYER_LIMITS.strokePoints + 1 }, (_, i) => ({ x: i, y: 0 }))
    expect(readLayer({ ...layer, marks: [{ id: 'mark-aaaaaa', createdAt: iso, kind: 'stroke', points }] }).ok).toBe(false)
    expect(readLayer({ ...layer, reconnects: [{ id: 'edit-aaaaaa', relationshipId: 'r', createdAt: iso }] }).ok).toBe(false)
  })
})

describe('a layer from a later version', () => {
  it('opens with the fields this version does not know left out, and still checks the ones it knows', () => {
    const later = { ...emptyLayer('refund-approval'), somethingNew: { a: 1 } }
    const read = readLayer(later)
    expect(read).toEqual({ ok: true, layer: emptyLayer('refund-approval') })
    expect(readLayer({ ...later, positions: { 'a-card': { x: 'left', y: 0 } } }).ok).toBe(false)
  })
})
