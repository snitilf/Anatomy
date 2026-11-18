import type { Board } from '../board/schema'
import type { Item, Layer, Note } from '../layer/model'
import { linkStatus, noteStatus, wasSent } from '../layer/status'

/**
 * Where an item the user made stands in the round trip to the agent. Every place that shows the state reads it from here,
 * so the same state always gets the same glyph and the same word.
 */
export const ITEM_STATES = ['unsent', 'sent', 'answered', 'adopted', 'declined', 'outdated', 'relinking'] as const
export type ItemState = (typeof ITEM_STATES)[number]

export const STATE_WORD: Record<ItemState, string> = {
  unsent: 'Not sent',
  sent: 'Sent',
  answered: 'Answered',
  adopted: 'Adopted',
  declined: 'Declined',
  outdated: 'Possibly outdated',
  relinking: 'Needs relinking',
}

/**
 * Which state wins when an item has more than one. A problem the user must fix comes first, then the agent's answer,
 * then the send state. The first in this list wins.
 */
const PRIORITY: readonly ItemState[] = ['relinking', 'outdated', 'answered', 'declined', 'adopted', 'sent', 'unsent']

type StateLayer = Pick<Layer, 'answers' | 'sent'> & Partial<Pick<Layer, 'proposals' | 'notes' | 'links'>>

/** The agent's status for the item, when it has answered it. */
function answerState(layer: Pick<Layer, 'answers'>, id: string): ItemState | undefined {
  return layer.answers.find((a) => a.id === id)?.response.status
}

/** The state of one item that is on the map. */
export function itemState(board: Board, layer: StateLayer, entry: Item): ItemState {
  if (entry.type === 'note') {
    const status = noteStatus(board, entry.item)
    if (status === 'needs-relinking') return 'relinking'
    if (status === 'possibly-outdated') return 'outdated'
  }
  if (entry.type === 'link' && linkStatus(board, { proposals: layer.proposals ?? [] }, entry.item) === 'needs-relinking') return 'relinking'
  return answerState(layer, entry.item.id) ?? (wasSent(layer, entry.item) ? 'sent' : 'unsent')
}

/** The state of a note. */
export function noteState(board: Board, layer: StateLayer, note: Note): ItemState {
  return itemState(board, layer, { type: 'note', item: note })
}

/** The state that wins among several. */
export function topState(states: Iterable<ItemState>): ItemState | undefined {
  let best: ItemState | undefined
  for (const s of states) if (best === undefined || PRIORITY.indexOf(s) < PRIORITY.indexOf(best)) best = s
  return best
}

/** For each part, the state that wins among the notes and questions attached to it. */
export function partStates(board: Board, layer: StateLayer & Pick<Layer, 'notes'>): Map<string, ItemState> {
  const found = new Map<string, ItemState[]>()
  for (const note of layer.notes) {
    if (note.target.type !== 'component') continue
    const list = found.get(note.target.id) ?? []
    list.push(noteState(board, layer, note))
    found.set(note.target.id, list)
  }
  const out = new Map<string, ItemState>()
  for (const [id, states] of found) out.set(id, topState(states)!)
  return out
}
