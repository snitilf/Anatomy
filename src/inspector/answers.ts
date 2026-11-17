import { CircleCheck, CircleX, MessageSquareReply } from 'lucide-react'
import type { Board } from '../board/schema'
import type { Layer, Response } from '../layer/model'
import type { PickerItem } from './pickerItems'

/** The agent's latest answer to one of the user's items. Answers are kept in the layer, so a later revision does not lose them. */
export function answerFor(layer: Pick<Layer, 'answers'> | undefined, id: string): Response | undefined {
  return layer?.answers.find((a) => a.id === id)?.response
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

export const ANSWER = {
  adopted: { label: 'Adopted', icon: CircleCheck },
  declined: { label: 'Declined', icon: CircleX },
  answered: { label: 'Answered', icon: MessageSquareReply },
} as const

