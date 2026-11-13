import type { Board } from '../board/schema'
import type { BoardProblem } from '../board/validate'
import { diffBoards } from '../overlay/diff'
import { resolvePositions } from '../overlay/layout'
import {
  addManualLink,
  addNote,
  confirmNote,
  deleteManualLink,
  deleteNote,
  editManualLink,
  editNote,
  relinkNote,
  setPosition,
} from '../overlay/notes'
import { emptyOverlay, type Note, type Overlay, type Point, type Target } from '../overlay/types'

export type Selection = { type: 'board' } | { type: 'component' | 'relationship' | 'link'; id: string }

export interface AppState {
  board?: Board
  overlay?: Overlay
  /** The board before the latest re-import of the same board. */
  previousBoard?: Board
  /** What the latest re-import added, removed, and changed. */
  changes?: ReturnType<typeof diffBoards>
  warnings: BoardProblem[]
  openErrors?: { fileName: string; errors: BoardProblem[] }
  selection?: Selection
  /** The walkthrough that is playing, and the step it shows. */
  scenario?: { id: string; step: number }
}

export type Action =
  | {
      type: 'boardOpened'
      board: Board
      overlay?: Overlay | undefined
      warnings: BoardProblem[]
      /** The saved version of this board, when it is not the one open now. The changes are measured from it. */
      previous?: Board | undefined
    }
  | { type: 'closed' }
  | { type: 'noticeShown'; message: string }
  | { type: 'changesDismissed' }
  | { type: 'noteAdded'; kind: Note['kind']; text: string; target: Target; id: string; now: Date }
  | { type: 'noteEdited'; id: string; text: string; now: Date }
  | { type: 'noteDeleted'; id: string }
  | { type: 'noteConfirmed'; id: string; now: Date }
  | { type: 'noteRelinked'; id: string; target: Target; now: Date }
  | { type: 'linkAdded'; from: string; to: string; label: string; id: string; now: Date }
  | { type: 'linkEdited'; id: string; change: { from?: string; to?: string; label?: string } }
  | { type: 'linkDeleted'; id: string }
  | { type: 'openFailed'; fileName: string; errors: BoardProblem[] }
  | { type: 'dismissErrors' }
  | { type: 'dismissWarnings' }
  | { type: 'select'; selection: Selection | undefined }
  | { type: 'cardMoved'; id: string; point: Point }
  | { type: 'scenarioStarted'; id: string }
  | { type: 'scenarioMoved'; index: number }
  | { type: 'scenarioNext' }
  | { type: 'scenarioPrevious' }
  | { type: 'scenarioStopped' }

export const initialState: AppState = { warnings: [] }

function selectionExists(board: Board, selection: Selection | undefined, overlay?: Overlay): boolean {
  if (!selection) return false
  if (selection.type === 'board') return true
  if (selection.type === 'link') return overlay?.manualLinks.some((l) => l.id === selection.id) ?? false
  const list = selection.type === 'component' ? board.components : board.relationships
  return list.some((x) => x.id === selection.id)
}

function withStep(state: AppState, index: number): AppState {
  const { board, scenario } = state
  const total = board?.scenarios.find((s) => s.id === scenario?.id)?.steps.length
  if (!scenario || total === undefined) return state
  const step = Math.min(Math.max(Math.trunc(index), 0), total - 1)
  return step === scenario.step ? state : { ...state, scenario: { ...scenario, step } }
}

function withOverlay(state: AppState, change: (overlay: Overlay, board: Board) => Overlay): AppState {
  if (!state.board || !state.overlay) return state
  const overlay = change(state.overlay, state.board)
  return overlay === state.overlay ? state : { ...state, overlay }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'boardOpened': {
      const { board } = action
      const old = action.previous ?? state.board
      const sameBoard = old !== undefined && old.id === board.id
      const keptOverlay = sameBoard && state.overlay?.boardId === board.id ? state.overlay : undefined
      const base = action.overlay ?? keptOverlay ?? emptyOverlay(board.id)
      // Freeze every card position now, so a later layout change cannot move an existing card.
      const overlay: Overlay = { ...base, positions: resolvePositions(board, base) }
      const next: AppState = { board, overlay, warnings: action.warnings }
      if (sameBoard) {
        next.previousBoard = old
        next.changes = diffBoards(old, board)
        if (selectionExists(board, state.selection, overlay)) next.selection = state.selection as Selection
      }
      return next
    }
    case 'closed':
      return initialState
    case 'noticeShown':
      return { ...state, warnings: [{ path: '', message: action.message }] }
    case 'changesDismissed': {
      const { changes: _c, ...rest } = state
      return rest
    }
    case 'noteAdded':
      return withOverlay(state, (o, b) => addNote(o, b, { kind: action.kind, text: action.text, target: action.target }, action.now, action.id))
    case 'noteEdited':
      return withOverlay(state, (o) => editNote(o, action.id, action.text, action.now))
    case 'noteDeleted':
      return withOverlay(state, (o) => deleteNote(o, action.id))
    case 'noteConfirmed':
      return withOverlay(state, (o, b) => confirmNote(o, b, action.id, action.now))
    case 'noteRelinked':
      return withOverlay(state, (o, b) => relinkNote(o, b, action.id, action.target, action.now))
    case 'linkAdded':
      return withOverlay(state, (o, b) => addManualLink(o, { from: action.from, to: action.to, label: action.label }, action.now, action.id, b).overlay)
    case 'linkEdited':
      return withOverlay(state, (o, b) => editManualLink(o, action.id, action.change, b).overlay)
    case 'linkDeleted': {
      const next = withOverlay(state, (o) => deleteManualLink(o, action.id))
      if (state.selection?.type === 'link' && state.selection.id === action.id) {
        const { selection: _s, ...rest } = next
        return rest
      }
      return next
    }
    case 'openFailed':
      return { ...state, openErrors: { fileName: action.fileName, errors: action.errors } }
    case 'dismissErrors': {
      const { openErrors: _dropped, ...rest } = state
      return rest
    }
    case 'dismissWarnings':
      return state.warnings.length === 0 ? state : { ...state, warnings: [] }
    case 'select': {
      const { selection: _dropped, ...rest } = state
      return action.selection ? { ...rest, selection: action.selection } : rest
    }
    case 'cardMoved': {
      if (!state.overlay) return state
      const overlay = setPosition(state.overlay, action.id, action.point)
      return overlay === state.overlay ? state : { ...state, overlay }
    }
    case 'scenarioStarted': {
      if (!state.board?.scenarios.some((s) => s.id === action.id)) return state
      return { ...state, scenario: { id: action.id, step: 0 } }
    }
    case 'scenarioMoved':
      return withStep(state, action.index)
    case 'scenarioNext':
      return state.scenario ? withStep(state, state.scenario.step + 1) : state
    case 'scenarioPrevious':
      return state.scenario ? withStep(state, state.scenario.step - 1) : state
    case 'scenarioStopped': {
      if (!state.scenario) return state
      const { scenario: _dropped, ...rest } = state
      return rest
    }
  }
}
