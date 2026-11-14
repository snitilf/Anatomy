import { describe, expect, it } from 'vitest'
import { reducer, initialState, type AppState } from '../app/state'
import { emptyLayer, type Layer, type Mark } from '../layer/model'
import { nordetBoard } from '../layer/testBoards'
import { connectionEnds, endDropAction } from './endDrop'
import type { Scene } from './geometry'

const board = nordetBoard()
const rel = board.relationships[0]!
const others = board.components.map((c) => c.id).filter((id) => id !== rel.from && id !== rel.to)
const third = others[0]!
const iso = '2026-01-01T00:00:00.000Z'
const make = { id: 'edit-abcdef', now: new Date(iso) }
const scene: Scene = { rects: Object.fromEntries(board.components.map((c, i) => [c.id, { x: i * 300, y: 0, width: 200, height: 100 }])), lines: new Map() }

function opened(layer: Layer = emptyLayer(board.id)): AppState {
  return reducer(initialState, { type: 'boardOpened', board, layer, warnings: [] })
}

const ctx = (layer: Layer) => ({ board, layer, scene, reach: 10 })

describe('dropping the end of a connection', () => {
  it('moves the end to another part', () => {
    const action = endDropAction({ kind: 'relationship', id: rel.id, end: 'to' }, { at: { x: 0, y: 0 }, part: third }, ctx(emptyLayer(board.id)), make)
    expect(action).toMatchObject({ type: 'reconnected', relationshipId: rel.id, end: 'to', part: third })
    const state = reducer(opened(), action!)
    expect(connectionEnds(board, state.layer!, rel.id)).toEqual({ from: rel.from, to: third })
  })

  it('does nothing on empty space, on the same part, or on the part at the other end', () => {
    const layer = emptyLayer(board.id)
    const ref = { kind: 'relationship', id: rel.id, end: 'to' } as const
    expect(endDropAction(ref, { at: { x: 0, y: 0 } }, ctx(layer), make)).toBeUndefined()
    expect(endDropAction(ref, { at: { x: 0, y: 0 }, part: rel.to }, ctx(layer), make)).toBeUndefined()
    expect(endDropAction(ref, { at: { x: 0, y: 0 }, part: rel.from }, ctx(layer), make)).toBeUndefined()
  })

  it('removes the edit when the end goes back to the original part, as one step of undo', () => {
    const moved = reducer(opened(), endDropAction({ kind: 'relationship', id: rel.id, end: 'to' }, { at: { x: 0, y: 0 }, part: third }, ctx(emptyLayer(board.id)), make)!)
    const back = endDropAction({ kind: 'relationship', id: rel.id, end: 'to' }, { at: { x: 0, y: 0 }, part: rel.to }, ctx(moved.layer!), make)
    const state = reducer(moved, back!)
    expect(state.layer!.reconnects).toEqual([])
    expect(reducer(state, { type: 'undo' }).layer!.reconnects).toHaveLength(1)
  })
})

describe('dropping the end of a link', () => {
  it('moves the end, and refuses the part at the other end', () => {
    const layer: Layer = { ...emptyLayer(board.id), links: [{ id: 'link-abcdef', from: rel.from, to: rel.to, label: '', createdAt: iso }] }
    const ref = { kind: 'link', id: 'link-abcdef', end: 'from' } as const
    expect(endDropAction(ref, { at: { x: 0, y: 0 }, part: third }, ctx(layer), make)).toEqual({ type: 'linkEdited', id: 'link-abcdef', change: { from: third } })
    expect(endDropAction(ref, { at: { x: 0, y: 0 }, part: rel.to }, ctx(layer), make)).toBeUndefined()
  })
})

describe('dropping the end of an arrow', () => {
  const arrow: Mark = { id: 'mark-abcdef', createdAt: iso, kind: 'arrow', from: { type: 'part', id: third }, to: { type: 'point', x: 10, y: 10 } }
  const layer: Layer = { ...emptyLayer(board.id), marks: [arrow] }

  it('attaches to a part, or stays at a free point', () => {
    expect(endDropAction({ kind: 'arrow', id: arrow.id, end: 'to' }, { at: { x: 0, y: 0 }, part: rel.from }, ctx(layer), make)).toMatchObject({
      type: 'markChanged',
      mark: { to: { type: 'part', id: rel.from } },
    })
    expect(endDropAction({ kind: 'arrow', id: arrow.id, end: 'to' }, { at: { x: 40, y: 50 } }, ctx(layer), make)).toMatchObject({
      mark: { to: { type: 'point', x: 40, y: 50 } },
    })
  })

  it('does nothing when the end lands where it was, or on the part at the other end', () => {
    expect(endDropAction({ kind: 'arrow', id: arrow.id, end: 'to' }, { at: { x: 10, y: 10 } }, ctx(layer), make)).toBeUndefined()
    expect(endDropAction({ kind: 'arrow', id: arrow.id, end: 'to' }, { at: { x: 0, y: 0 }, part: third }, ctx(layer), make)).toBeUndefined()
  })
})
