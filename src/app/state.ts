import type { Board } from '../board/schema'
import type { BoardProblem } from '../board/validate'
import type { Size, Point } from '../layout/geometry'
import { bundleGroups } from '../canvas/bundles'
import { bundleKey } from '../canvas/bundleWords'
import { diffBoards } from '../layer/diff'
import {
  addLink,
  addMark,
  addNote,
  addProposal,
  archiveItems,
  confirmNote,
  deleteLink,
  deleteMark,
  deleteNote,
  deleteProposal,
  deleteReconnect,
  dropArchived,
  editLink,
  editNote,
  findItem,
  moveCards,
  moveProposals,
  receiveAnswers,
  reconnect,
  recordSent,
  relinkNote,
  resizeCard,
  restoreArchived,
  updateMark,
  updateProposal,
} from '../layer/edits'
import { emptyLayer, type Layer, type Mark, type Note, type Proposal, type Response, type Sent, type Target } from '../layer/model'
import { emptyHistory, remember, stepBack, stepForward, type History } from './history'

/**
 * What is selected. A bundle is the set of connections between two blocks of the far view. It is keyed by its two ends
 * (`id` is the key of the pair), never by an index, so it holds across layouts and reimports.
 */
export type Selection = { type: 'board' } | { type: 'component' | 'relationship' | 'link' | 'mark' | 'proposal'; id: string } | { type: 'bundle'; id: string; a: string; b: string }

/** The selection of the bundle between two ends, as `bundleGroups` names them. */
export const bundleSelection = (a: string, b: string): Selection => ({ type: 'bundle', id: bundleKey(a, b), a, b })

export interface AppState {
  board?: Board
  layer?: Layer
  /** Undo and redo of the layer. */
  history: History
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

/** Every change to the user layer. Each one is a single step of undo. */
export type LayerAction =
  | { type: 'noteAdded'; kind: Note['kind']; text: string; target: Target; id: string; now: Date }
  | { type: 'noteEdited'; id: string; text: string; now: Date }
  | { type: 'noteDeleted'; id: string }
  | { type: 'noteConfirmed'; id: string; now: Date }
  | { type: 'noteRelinked'; id: string; target: Target; now: Date }
  | { type: 'linkAdded'; from: string; to: string; label: string; id: string; now: Date }
  | { type: 'linkEdited'; id: string; change: { from?: string; to?: string; label?: string } }
  | { type: 'linkDeleted'; id: string }
  /** One drop or one run of arrow keys. Several cards move together when a drop pushes others aside. Proposed parts move too. */
  | { type: 'cardsMoved'; positions: Readonly<Record<string, Point>> }
  /** One resize. `positions` holds the cards it pushed aside, so the whole change is one step of undo. */
  | { type: 'cardResized'; id: string; size: Size; positions?: Readonly<Record<string, Point>> }
  | { type: 'markAdded'; mark: Mark }
  | { type: 'markChanged'; id: string; mark: Mark }
  | { type: 'markDeleted'; id: string }
  | { type: 'proposalAdded'; proposal: Proposal }
  | { type: 'proposalChanged'; id: string; change: Partial<Omit<Proposal, 'id' | 'createdAt'>> }
  | { type: 'proposalDeleted'; id: string }
  | { type: 'reconnected'; relationshipId: string; end: 'from' | 'to'; part: string; id: string; now: Date }
  | { type: 'reconnectDeleted'; id: string }
  | { type: 'itemsArchived'; answers: readonly { id: string; response: Response }[]; now: Date }
  | { type: 'archiveRestored'; id: string }
  | { type: 'archiveDropped'; id: string }

export type Action =
  | LayerAction
  | {
      type: 'boardOpened'
      board: Board
      layer?: Layer | undefined
      warnings: BoardProblem[]
      /** The saved version of this board, when it is not the one open now. The changes are measured from it. */
      previous?: Board | undefined
      /** When it opened. Items the agent adopted are archived with this time. */
      now?: Date | undefined
    }
  | { type: 'closed' }
  | { type: 'noticeShown'; message: string }
  | { type: 'changesDismissed' }
  /** The feedback was handed to the agent. Nothing before it can be undone. */
  | { type: 'feedbackSent'; sent: Sent }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'openFailed'; fileName: string; errors: BoardProblem[] }
  | { type: 'dismissErrors' }
  | { type: 'dismissWarnings' }
  | { type: 'select'; selection: Selection | undefined }
  | { type: 'scenarioStarted'; id: string }
  | { type: 'scenarioMoved'; index: number }
  | { type: 'scenarioNext' }
  | { type: 'scenarioPrevious' }
  | { type: 'scenarioStopped' }

export const initialState: AppState = { warnings: [], history: emptyHistory }

type Edit<T extends LayerAction['type']> = (layer: Layer, board: Board, action: Extract<LayerAction, { type: T }>) => Layer

const onBoard = (b: Board, positions: Readonly<Record<string, Point>>) => Object.fromEntries(Object.entries(positions).filter(([id]) => b.components.some((c) => c.id === id)))

const EDITS: { [T in LayerAction['type']]: Edit<T> } = {
  noteAdded: (l, b, a) => addNote(l, b, { kind: a.kind, text: a.text, target: a.target }, a.now, a.id),
  noteEdited: (l, _b, a) => editNote(l, a.id, a.text, a.now),
  noteDeleted: (l, _b, a) => deleteNote(l, a.id),
  noteConfirmed: (l, b, a) => confirmNote(l, b, a.id, a.now),
  noteRelinked: (l, b, a) => relinkNote(l, b, a.id, a.target, a.now),
  linkAdded: (l, b, a) => addLink(l, b, { from: a.from, to: a.to, label: a.label }, a.now, a.id).layer,
  linkEdited: (l, b, a) => editLink(l, b, a.id, a.change).layer,
  linkDeleted: (l, _b, a) => deleteLink(l, a.id),
  cardsMoved: (l, b, a) => moveProposals(moveCards(l, onBoard(b, a.positions)), a.positions),
  cardResized: (l, b, a) => {
    const part = b.components.some((c) => c.id === a.id)
    if (!part && !l.proposals.some((p) => p.id === a.id)) return l
    const sized = part ? resizeCard(l, a.id, a.size) : updateProposal(l, a.id, { width: a.size.width, height: a.size.height })
    const pushed = a.positions ?? {}
    return moveProposals(moveCards(sized, onBoard(b, pushed)), pushed)
  },
  markAdded: (l, _b, a) => addMark(l, a.mark),
  markChanged: (l, _b, a) => updateMark(l, a.id, () => a.mark),
  markDeleted: (l, _b, a) => deleteMark(l, a.id),
  proposalAdded: (l, _b, a) => addProposal(l, a.proposal),
  proposalChanged: (l, _b, a) => updateProposal(l, a.id, a.change),
  proposalDeleted: (l, _b, a) => deleteProposal(l, a.id),
  reconnected: (l, b, a) => reconnect(l, b, { relationshipId: a.relationshipId, end: a.end, part: a.part }, a.now, a.id).layer,
  reconnectDeleted: (l, _b, a) => deleteReconnect(l, a.id),
  itemsArchived: (l, _b, a) => archiveItems(l, a.answers, a.now),
  archiveRestored: (l, _b, a) => restoreArchived(l, a.id),
  archiveDropped: (l, _b, a) => dropArchived(l, a.id),
}

const isLayerAction = (action: Action): action is LayerAction => Object.hasOwn(EDITS, action.type)

function selectionExists(board: Board, layer: Layer | undefined, selection: Selection | undefined): boolean {
  if (!selection) return false
  switch (selection.type) {
    case 'board':
      return true
    case 'component':
      return board.components.some((c) => c.id === selection.id)
    case 'bundle':
      return bundleGroups(board, layer?.links ?? [], layer?.reconnects ?? [], layer?.proposals ?? []).some((p) => p.a === selection.a && p.b === selection.b)
    case 'relationship':
      return board.relationships.some((r) => r.id === selection.id)
    case 'link':
    case 'mark':
    case 'proposal':
      return layer !== undefined && findItem(layer, selection.id)?.type === selection.type
  }
}

/** Drops a selection that points at something no longer there. The state object stays when nothing changes. */
function withValidSelection(state: AppState): AppState {
  if (!state.board || !state.selection || selectionExists(state.board, state.layer, state.selection)) return state
  const { selection: _dropped, ...rest } = state
  return rest
}

/**
 * After undo or redo, an item that came back is selected, so the user sees what returned.
 * A selection whose item went away is dropped.
 */
function afterStep(state: AppState, from: Layer, to: Layer): AppState {
  const before = new Set([...from.links, ...from.marks, ...from.proposals].map((x) => x.id))
  const back = [
    ...to.links.filter((x) => !before.has(x.id)).map((x) => ({ type: 'link' as const, id: x.id })),
    ...to.marks.filter((x) => !before.has(x.id)).map((x) => ({ type: 'mark' as const, id: x.id })),
    ...to.proposals.filter((x) => !before.has(x.id)).map((x) => ({ type: 'proposal' as const, id: x.id })),
  ]
  const only = back.length === 1 ? back[0] : undefined
  return withValidSelection(only ? { ...state, selection: only } : state)
}

function withStep(state: AppState, index: number): AppState {
  const { board, scenario } = state
  const total = board?.scenarios.find((s) => s.id === scenario?.id)?.steps.length
  if (!scenario || total === undefined) return state
  const step = Math.min(Math.max(Math.trunc(index), 0), total - 1)
  return step === scenario.step ? state : { ...state, scenario: { ...scenario, step } }
}

function edit(state: AppState, action: LayerAction): AppState {
  const { board, layer } = state
  if (!board || !layer) return state
  const next = (EDITS[action.type] as Edit<typeof action.type>)(layer, board, action)
  if (next === layer) return state
  return withValidSelection({ ...state, layer: next, history: remember(state.history, layer) })
}

export function reducer(state: AppState, action: Action): AppState {
  if (isLayerAction(action)) return edit(state, action)
  switch (action.type) {
    case 'boardOpened': {
      const { board } = action
      const old = action.previous ?? state.board
      const sameBoard = old !== undefined && old.id === board.id
      const keptLayer = sameBoard && state.layer?.boardId === board.id ? state.layer : undefined
      // The agent's answers in this revision go next to the user's items, and adopted items that landed are archived.
      const layer = receiveAnswers(action.layer ?? keptLayer ?? emptyLayer(board.id), board, action.now ?? new Date())
      // A new revision is a barrier: undo never reaches back into the version before it.
      const next: AppState = { board, layer, warnings: action.warnings, history: emptyHistory }
      if (sameBoard) {
        next.previousBoard = old
        next.changes = diffBoards(old, board)
        if (selectionExists(board, layer, state.selection)) next.selection = state.selection as Selection
      }
      return next
    }
    case 'closed':
      return initialState
    case 'feedbackSent':
      return state.layer ? { ...state, layer: recordSent(state.layer, action.sent), history: emptyHistory } : state
    case 'undo':
    case 'redo': {
      if (!state.layer) return state
      const step = action.type === 'undo' ? stepBack(state.history, state.layer) : stepForward(state.history, state.layer)
      return step ? afterStep({ ...state, layer: step.layer, history: step.history }, state.layer, step.layer) : state
    }
    case 'noticeShown':
      return { ...state, warnings: [{ path: '', message: action.message }] }
    case 'changesDismissed': {
      const { changes: _c, ...rest } = state
      return rest
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
