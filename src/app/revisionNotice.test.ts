import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { summaryLine } from '../layer/revisionSummary'
import { clone, refundBoard } from '../layer/testBoards'
import { initialState, reducer, type Action, type AppState } from './state'
import { tabTitle } from './tabTitle'

const now = new Date('2026-11-28T10:00:00.000Z')
const run = (state: AppState, ...actions: Action[]) => actions.reduce(reducer, state)
const open = (board: Board) => reducer(initialState, { type: 'boardOpened', board, warnings: [], now })

function next(board: Board, edit: (b: Board) => void = (b) => void (b.components[0]!.summary = 'A new summary.')): Board {
  const b = clone(board)
  b.revision += 1
  edit(b)
  return b
}

describe('the notice for a new revision', () => {
  it('holds what the revision did, from the board that was open and what the user sent', () => {
    const board = refundBoard()
    let state = run(open(board), { type: 'noteAdded', kind: 'question', text: 'Why?', target: { type: 'board' }, id: 'note-aaaaaa', now })
    state = run(state, { type: 'feedbackSent', sent: { feedbackId: 'feedback-aaaaaa', baseRevision: 1, at: now.toISOString(), items: [{ id: 'note-aaaaaa', fingerprint: 'f' }] } })
    const revised = next(board, (b) => {
      b.components[0]!.summary = 'A new summary.'
      b.responses = { respondsTo: 'feedback-aaaaaa', items: [{ feedbackId: 'note-aaaaaa', status: 'answered', text: 'Because.', changed: [] }] }
    })
    state = run(state, { type: 'boardOpened', board: revised, warnings: [], previous: board, now })
    expect(state.revisionNotice).toMatchObject({ revision: 2, answers: 1, parts: { added: 0, changed: 1, removed: 0 } })
    expect(summaryLine(state.revisionNotice!)).toBe('Revision 2: 1 answer, 1 changed part.')
  })

  it('stays until the user acts: Dismiss, Mark reviewed, or the next board', () => {
    const board = refundBoard()
    const revised = run(open(board), { type: 'boardOpened', board: next(board), warnings: [], previous: board, now })
    expect(revised.revisionNotice).toBeDefined()
    expect(run(revised, { type: 'revisionNoticeDismissed' }).revisionNotice).toBeUndefined()
    // The changes stay for the Review tab when only the banner is dismissed.
    expect(run(revised, { type: 'revisionNoticeDismissed' }).changes).toBeDefined()
    expect(run(revised, { type: 'changesDismissed' }).revisionNotice).toBeUndefined()
    expect(run(revised, { type: 'closed' }).revisionNotice).toBeUndefined()
    expect(run(revised, { type: 'select', selection: { type: 'board' } }).revisionNotice).toBe(revised.revisionNotice)
    // A later revision replaces it.
    const later = run(revised, { type: 'boardOpened', board: next(next(board), (b) => void (b.goal = 'A new goal.')), warnings: [], now })
    expect(later.revisionNotice).toMatchObject({ revision: 3, boardFields: ['goal'] })
  })

  it('is not made for a first open, or for a revision with nothing in it', () => {
    const board = refundBoard()
    expect(open(board).revisionNotice).toBeUndefined()
    const nothing = run(open(board), { type: 'boardOpened', board: next(board, () => {}), warnings: [], previous: board, now })
    expect(nothing.revisionNotice).toBeUndefined()
    expect(run(open(board), { type: 'boardOpened', board: refundBoard(), warnings: [], previous: board, now }).revisionNotice).toBeUndefined()
  })

  it('does not count the answers of a file with the same revision again', () => {
    const board = refundBoard()
    const again = clone(board)
    again.responses = { respondsTo: 'feedback-aaaaaa', items: [{ feedbackId: 'note-aaaaaa', status: 'answered', text: 'Because.', changed: [] }] }
    expect(run(open(board), { type: 'boardOpened', board: again, warnings: [], previous: board, now }).revisionNotice).toBeUndefined()
  })
})

describe('the problem with the latest file', () => {
  const problem = { kind: 'invalid', count: 2, first: 'components.0.label: is required' } as const

  it('is kept next to the board that stays open, and goes when the user dismisses it or a revision opens', () => {
    const board = refundBoard()
    const state = run(open(board), { type: 'boardProblem', problem })
    expect(state.board).toBe(open(board).board)
    expect(state.boardProblem).toEqual(problem)
    expect(run(state, { type: 'boardProblem', problem: undefined }).boardProblem).toBeUndefined()
    expect(run(state, { type: 'boardOpened', board: next(board), warnings: [], previous: board, now }).boardProblem).toBeUndefined()
    expect(run(state, { type: 'closed' }).boardProblem).toBeUndefined()
  })

  it('is ignored when no board is open, and a second identical problem changes nothing', () => {
    expect(reducer(initialState, { type: 'boardProblem', problem })).toBe(initialState)
    const state = run(open(refundBoard()), { type: 'boardProblem', problem })
    expect(reducer(state, { type: 'boardProblem', problem: { ...problem } })).toBe(state)
  })
})

describe('the title of the tab', () => {
  it('shows how many things wait, and is the plain name when none do', () => {
    expect(tabTitle('Anatomy', 0)).toBe('Anatomy')
    expect(tabTitle('Anatomy', 1)).toBe('(1) Anatomy')
    expect(tabTitle('Anatomy', 99)).toBe('(99) Anatomy')
    expect(tabTitle('Anatomy', 100)).toBe('(99+) Anatomy')
    expect(tabTitle('Anatomy', 12_000)).toBe('(99+) Anatomy')
  })
})
