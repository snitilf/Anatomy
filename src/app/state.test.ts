import { describe, expect, it } from 'vitest'
import { clone, nordetBoard } from '../layer/testBoards'
import { emptyLayer, type Mark } from '../layer/model'
import { HISTORY_LIMIT } from './history'
import { initialState, reducer, type Action, type AppState } from './state'

const opened = (): AppState => reducer(initialState, { type: 'boardOpened', board: nordetBoard(), warnings: [] })
const run = (state: AppState, ...actions: Action[]) => actions.reduce(reducer, state)
const now = new Date('2026-01-01T00:00:00.000Z')

describe('reducer', () => {
  it('opens a board with an empty layer that stores no positions', () => {
    const state = opened()
    expect(state.layer).toEqual(emptyLayer(nordetBoard().id))
    expect(state.changes).toBeUndefined()
  })

  it('does not change the state when a card is dropped where it already is', () => {
    const id = nordetBoard().components[0]!.id
    const state = run(opened(), { type: 'cardsMoved', positions: { [id]: { x: 5, y: 6 } } })
    expect(reducer(state, { type: 'cardsMoved', positions: { [id]: { x: 5, y: 6 } } })).toBe(state)
    expect(reducer(state, { type: 'cardsMoved', positions: { ghost: { x: 5, y: 6 } } })).toBe(state)
  })

  it('keeps the layer and computes changes when the same board is opened again', () => {
    const first = nordetBoard().components[0]!.id
    let state = run(opened(), { type: 'cardsMoved', positions: { [first]: { x: 900, y: 700 } } })
    const next = clone(nordetBoard())
    next.revision = 2
    next.components[0]!.summary = 'A new summary.'
    next.components.push({ ...clone(next.components[1]!), id: 'brand-new', label: 'Brand new' })
    state = reducer(state, { type: 'boardOpened', board: next, warnings: [] })
    expect(state.layer?.positions).toEqual({ [first]: { x: 900, y: 700 } })
    expect(state.previousBoard?.revision).toBe(1)
    expect(state.changes?.added.components).toEqual(['brand-new'])
    expect(state.changes?.changed.components).toContain(first)
  })

  it('starts fresh for a different board', () => {
    const state = opened()
    const other = clone(nordetBoard())
    other.id = 'another-board'
    const next = reducer(state, { type: 'boardOpened', board: other, warnings: [] })
    expect(next.layer?.boardId).toBe('another-board')
    expect(next.changes).toBeUndefined()
    expect(next.previousBoard).toBeUndefined()
  })

  it('uses the layer that comes with an export file', () => {
    const board = nordetBoard()
    const layer = { ...emptyLayer(board.id), positions: { [board.components[0]!.id]: { x: 5, y: 6 } } }
    const state = reducer(initialState, { type: 'boardOpened', board, layer, warnings: [] })
    expect(state.layer).toBe(layer)
  })

  it('keeps the board and layer when a file fails to open', () => {
    const state = opened()
    const next = reducer(state, { type: 'openFailed', fileName: 'bad.json', errors: [{ path: '', message: 'no' }] })
    expect(next.board).toBe(state.board)
    expect(next.layer).toBe(state.layer)
    expect(next.openErrors?.fileName).toBe('bad.json')
    expect(reducer(next, { type: 'dismissErrors' }).openErrors).toBeUndefined()
  })

  it('selects and clears the selection', () => {
    const state = reducer(opened(), { type: 'select', selection: { type: 'component', id: 'x' } })
    expect(state.selection).toEqual({ type: 'component', id: 'x' })
    expect(reducer(state, { type: 'select', selection: undefined }).selection).toBeUndefined()
  })

})

describe('reducer: undo and redo', () => {
  const id = nordetBoard().components[0]!.id
  const move = (x: number): Action => ({ type: 'cardsMoved', positions: { [id]: { x, y: 0 } } })
  const box: Mark = { id: 'mark-aaaaaa', createdAt: now.toISOString(), kind: 'rect', x: 0, y: 0, width: 50, height: 50 }

  it('undoes and redoes one drop at a time', () => {
    const start = opened()
    const state = run(start, move(10), move(20))
    const back = reducer(state, { type: 'undo' })
    expect(back.layer?.positions[id]).toEqual({ x: 10, y: 0 })
    const twice = reducer(back, { type: 'undo' })
    expect(twice.layer).toBe(start.layer)
    expect(reducer(twice, { type: 'undo' })).toBe(twice)
    expect(run(twice, { type: 'redo' }, { type: 'redo' }).layer).toBe(state.layer)
  })

  it('drops the redo steps on a new change', () => {
    const state = run(opened(), move(10), move(20), { type: 'undo' }, move(30))
    expect(state.history.future).toEqual([])
    expect(reducer(state, { type: 'redo' })).toBe(state)
  })

  it('records nothing for a change that changes nothing, or for selection and walkthroughs', () => {
    const state = run(opened(), move(10))
    const same = run(state, move(10), { type: 'select', selection: { type: 'component', id } }, { type: 'scenarioStarted', id: 'approve-and-simulate' })
    expect(same.history.past).toHaveLength(1)
  })

  it('keeps at most the history limit', () => {
    let state = opened()
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) state = reducer(state, move(i))
    expect(state.history.past).toHaveLength(HISTORY_LIMIT)
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) state = reducer(state, { type: 'undo' })
    expect(state.layer?.positions[id]).toEqual({ x: 20, y: 0 })
  })

  it('undoes every kind of layer change', () => {
    const board = nordetBoard()
    const [a, b] = board.components
    const rel = board.relationships[0]!
    const other = board.components.find((c) => c.id !== rel.from && c.id !== rel.to)!
    const proposal = { id: 'part-aaaaaa', label: 'Cache', summary: '', x: 0, y: 0, width: 260, height: 150, createdAt: now.toISOString() }
    const actions: Action[] = [
      { type: 'noteAdded', kind: 'note', text: 'Hi', target: { type: 'board' }, id: 'note-aaaaaa', now },
      { type: 'noteEdited', id: 'note-aaaaaa', text: 'Hello', now },
      { type: 'linkAdded', from: a!.id, to: b!.id, label: '', id: 'link-aaaaaa', now },
      { type: 'linkEdited', id: 'link-aaaaaa', change: { label: 'calls' } },
      { type: 'cardResized', id: a!.id, size: { width: 300, height: 200 } },
      { type: 'markAdded', mark: box },
      { type: 'markChanged', id: box.id, mark: { ...box, x: 40 } },
      { type: 'proposalAdded', proposal },
      { type: 'proposalChanged', id: proposal.id, change: { label: 'Queue' } },
      { type: 'reconnected', relationshipId: rel.id, end: 'to', part: other.id, id: 'edit-aaaaaa', now },
      { type: 'itemsArchived', answers: [{ id: 'note-aaaaaa', response: { respondsTo: 'feedback-aaaaaa', status: 'answered', text: 'Yes.', changed: [] } }], now },
      { type: 'archiveRestored', id: 'note-aaaaaa' },
      { type: 'markDeleted', id: box.id },
      { type: 'proposalDeleted', id: proposal.id },
      { type: 'linkDeleted', id: 'link-aaaaaa' },
      { type: 'noteDeleted', id: 'note-aaaaaa' },
    ]
    let state = opened()
    const layers = [state.layer]
    for (const action of actions) {
      const next = reducer(state, action)
      expect(next.layer, action.type).not.toBe(state.layer)
      state = next
      layers.push(state.layer)
    }
    for (let i = actions.length - 1; i >= 0; i--) {
      state = reducer(state, { type: 'undo' })
      expect(state.layer, actions[i]!.type).toBe(layers[i])
    }
  })

  it('selects an item that undo brings back, and drops a selection whose item went away', () => {
    const [a, b] = nordetBoard().components
    let state = run(opened(), { type: 'linkAdded', from: a!.id, to: b!.id, label: '', id: 'link-aaaaaa', now }, { type: 'select', selection: { type: 'link', id: 'link-aaaaaa' } })
    state = reducer(state, { type: 'undo' })
    expect(state.selection).toBeUndefined()
    state = reducer(state, { type: 'redo' })
    expect(state.selection).toEqual({ type: 'link', id: 'link-aaaaaa' })
    state = run(state, { type: 'select', selection: { type: 'board' } }, { type: 'linkDeleted', id: 'link-aaaaaa' }, { type: 'undo' })
    expect(state.selection).toEqual({ type: 'link', id: 'link-aaaaaa' })
  })

  it('treats a new revision and a send to the agent as barriers', () => {
    const board = clone(nordetBoard())
    const sent = { feedbackId: 'feedback-aaaaaa', baseRevision: 1, at: now.toISOString(), items: [] }
    const afterSend = run(opened(), move(10), { type: 'feedbackSent', sent })
    expect(afterSend.layer?.sent).toEqual(sent)
    expect(afterSend.layer?.positions[id]).toEqual({ x: 10, y: 0 })
    expect(reducer(afterSend, { type: 'undo' })).toBe(afterSend)
    board.revision = 2
    const afterRevision = run(opened(), move(10), { type: 'boardOpened', board, warnings: [] })
    expect(afterRevision.history.past).toEqual([])
    expect(afterRevision.layer?.positions[id]).toEqual({ x: 10, y: 0 })
  })
})

describe('reducer: scenarios', () => {
  const playing = (): AppState => reducer(opened(), { type: 'scenarioStarted', id: 'approve-and-simulate' })
  const total = nordetBoard().scenarios.find((s) => s.id === 'approve-and-simulate')!.steps.length

  it('starts a scenario at its first step', () => {
    expect(playing().scenario).toEqual({ id: 'approve-and-simulate', step: 0 })
  })

  it('ignores a scenario the board does not have', () => {
    const state = opened()
    expect(reducer(state, { type: 'scenarioStarted', id: 'nope' })).toBe(state)
    expect(reducer(initialState, { type: 'scenarioStarted', id: 'approve-and-simulate' }).scenario).toBeUndefined()
  })

  it('moves to the next and previous step and stops at both ends', () => {
    let state = playing()
    expect(reducer(state, { type: 'scenarioPrevious' })).toBe(state)
    for (let i = 1; i < total; i++) state = reducer(state, { type: 'scenarioNext' })
    expect(state.scenario?.step).toBe(total - 1)
    expect(reducer(state, { type: 'scenarioNext' })).toBe(state)
    expect(reducer(state, { type: 'scenarioPrevious' }).scenario?.step).toBe(total - 2)
  })

  it('jumps to a step and clamps the index', () => {
    const state = playing()
    expect(reducer(state, { type: 'scenarioMoved', index: 2 }).scenario?.step).toBe(2)
    expect(reducer(state, { type: 'scenarioMoved', index: 99 }).scenario?.step).toBe(total - 1)
    expect(reducer(state, { type: 'scenarioMoved', index: -4 })).toBe(state)
  })

  it('does nothing to move when no scenario plays', () => {
    const state = opened()
    expect(reducer(state, { type: 'scenarioNext' })).toBe(state)
    expect(reducer(state, { type: 'scenarioMoved', index: 1 })).toBe(state)
  })

  it('stops the scenario', () => {
    expect(reducer(playing(), { type: 'scenarioStopped' }).scenario).toBeUndefined()
  })

  it('stops the scenario when another board opens', () => {
    const other = clone(nordetBoard())
    other.id = 'another-board'
    expect(reducer(playing(), { type: 'boardOpened', board: other, warnings: [] }).scenario).toBeUndefined()
    expect(reducer(playing(), { type: 'boardOpened', board: nordetBoard(), warnings: [] }).scenario).toBeUndefined()
  })
})
