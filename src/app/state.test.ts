import { describe, expect, it } from 'vitest'
import { clone, nordetBoard } from '../overlay/testBoards'
import { emptyOverlay } from '../overlay/types'
import { initialState, reducer, type AppState } from './state'

const opened = (): AppState => reducer(initialState, { type: 'boardOpened', board: nordetBoard(), warnings: [] })

describe('reducer', () => {
  it('opens a board with an empty overlay and frozen positions', () => {
    const state = opened()
    const board = nordetBoard()
    expect(state.overlay?.boardId).toBe(board.id)
    expect(Object.keys(state.overlay?.positions ?? {}).sort()).toEqual(board.components.map((c) => c.id).sort())
    expect(state.changes).toBeUndefined()
  })

  it('keeps the existing overlay and computes changes when the same board is opened again', () => {
    let state = opened()
    const first = nordetBoard().components[0]!.id
    state = reducer(state, { type: 'cardMoved', id: first, point: { x: 900, y: 700 } })
    const next = clone(nordetBoard())
    next.revision = 2
    next.components[0]!.summary = 'A new summary.'
    next.components.push({ ...clone(next.components[1]!), id: 'brand-new', label: 'Brand new' })
    state = reducer(state, { type: 'boardOpened', board: next, warnings: [] })
    expect(state.overlay?.positions[first]).toEqual({ x: 900, y: 700 })
    expect(state.previousBoard?.revision).toBe(1)
    expect(state.changes?.added.components).toEqual(['brand-new'])
    expect(state.changes?.changed.components).toContain(first)
    expect(state.overlay?.positions['brand-new']).toBeDefined()
  })

  it('never moves existing cards when new cards arrive', () => {
    const before = opened()
    const next = clone(nordetBoard())
    next.components.push({ ...clone(next.components[0]!), id: 'extra', label: 'Extra' })
    const after = reducer(before, { type: 'boardOpened', board: next, warnings: [] })
    for (const [id, p] of Object.entries(before.overlay?.positions ?? {})) {
      expect(after.overlay?.positions[id]).toEqual(p)
    }
  })

  it('starts fresh for a different board', () => {
    const state = opened()
    const other = clone(nordetBoard())
    other.id = 'another-board'
    const next = reducer(state, { type: 'boardOpened', board: other, warnings: [] })
    expect(next.overlay?.boardId).toBe('another-board')
    expect(next.changes).toBeUndefined()
    expect(next.previousBoard).toBeUndefined()
  })

  it('uses the overlay that comes with an export file', () => {
    const board = nordetBoard()
    const overlay = { ...emptyOverlay(board.id), positions: { [board.components[0]!.id]: { x: 5, y: 6 } } }
    const state = reducer(initialState, { type: 'boardOpened', board, overlay, warnings: [] })
    expect(state.overlay?.positions[board.components[0]!.id]).toEqual({ x: 5, y: 6 })
  })

  it('keeps the board and overlay when a file fails to open', () => {
    const state = opened()
    const next = reducer(state, { type: 'openFailed', fileName: 'bad.json', errors: [{ path: '', message: 'no' }] })
    expect(next.board).toBe(state.board)
    expect(next.overlay).toBe(state.overlay)
    expect(next.openErrors?.fileName).toBe('bad.json')
    expect(reducer(next, { type: 'dismissErrors' }).openErrors).toBeUndefined()
  })

  it('selects and clears the selection', () => {
    const state = reducer(opened(), { type: 'select', selection: { type: 'component', id: 'x' } })
    expect(state.selection).toEqual({ type: 'component', id: 'x' })
    expect(reducer(state, { type: 'select', selection: undefined }).selection).toBeUndefined()
  })

  it('stores a moved card', () => {
    const state = opened()
    const id = nordetBoard().components[0]!.id
    const next = reducer(state, { type: 'cardMoved', id, point: { x: 12, y: 34 } })
    expect(next.overlay?.positions[id]).toEqual({ x: 12, y: 34 })
  })
})
