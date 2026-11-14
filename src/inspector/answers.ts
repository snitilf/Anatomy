import type { Board, BoardResponse } from '../board/schema'
import type { PickerItem } from './pickerItems'

/** The agent's answer to one of the user's items, from the open revision. */
export function answerFor(board: Board, id: string): BoardResponse | undefined {
  return board.responses?.items.find((r) => r.feedbackId === id)
}

/** Every target a note can be attached to, as picker rows. */
export function targetItems(board: Board): PickerItem[] {
  const names = new Map(board.components.map((c) => [c.id, c.label]))
  return [
    { value: 'board', label: 'The whole board' },
    ...board.components.map((c) => ({ value: `component:${c.id}`, label: c.label, group: 'Parts' })),
    ...board.relationships.map((r) => ({ value: `relationship:${r.id}`, label: `${r.label}: ${names.get(r.from) ?? r.from} to ${names.get(r.to) ?? r.to}`, group: 'Connections' })),
  ]
}
