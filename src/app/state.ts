import type { Board } from '../board/schema'
import type { BoardProblem } from '../board/validate'
import { diffBoards } from '../overlay/diff'
import { resolvePositions } from '../overlay/layout'
import { setPosition } from '../overlay/notes'
import { emptyOverlay, type Overlay, type Point } from '../overlay/types'

export type Selection = { type: 'board' } | { type: 'component' | 'relationship'; id: string }

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
}

export type Action =
  | { type: 'boardOpened'; board: Board; overlay?: Overlay | undefined; warnings: BoardProblem[] }
  | { type: 'openFailed'; fileName: string; errors: BoardProblem[] }
  | { type: 'dismissErrors' }
  | { type: 'dismissWarnings' }
  | { type: 'select'; selection: Selection | undefined }
  | { type: 'cardMoved'; id: string; point: Point }

export const initialState: AppState = { warnings: [] }

function selectionExists(board: Board, selection: Selection | undefined): boolean {
  if (!selection) return false
  if (selection.type === 'board') return true
  const list = selection.type === 'component' ? board.components : board.relationships
  return list.some((x) => x.id === selection.id)
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'boardOpened': {
      const { board } = action
      const old = state.board
      const sameBoard = old !== undefined && old.id === board.id
      const keptOverlay = sameBoard && state.overlay?.boardId === board.id ? state.overlay : undefined
      const base = action.overlay ?? keptOverlay ?? emptyOverlay(board.id)
      // Freeze every card position now, so a later layout change cannot move an existing card.
      const overlay: Overlay = { ...base, positions: resolvePositions(board, base) }
      const next: AppState = { board, overlay, warnings: action.warnings }
      if (sameBoard) {
        next.previousBoard = old
        next.changes = diffBoards(old, board)
        if (selectionExists(board, state.selection)) next.selection = state.selection as Selection
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
  }
}
