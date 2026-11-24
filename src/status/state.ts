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

/** What each state means, in words a visitor can act on. The status key lists them next to the glyphs. */
export const STATE_MEANING: Record<ItemState, string> = {
  unsent: 'Not with your agent yet.',
  sent: 'Your agent has it, with no answer yet.',
  answered: 'Your agent replied. Read it in Review.',
  adopted: 'Your agent used it in the board.',
  declined: 'Your agent chose not to use it.',
  outdated: 'The part changed after you wrote this.',
  relinking: 'Its part is gone. Link it to another.',
}

/**
 * Which state wins when an item, or the notes on one part, have more than one. An item that cannot be acted on comes first.
 * Then the agent's answer, which is new and which resolves the item. Then a part that changed, then what still has to be
 * sent, then what was sent. The first in this list wins.
 */
const PRIORITY: readonly ItemState[] = ['relinking', 'answered', 'declined', 'adopted', 'outdated', 'unsent', 'sent']

type StateLayer = Pick<Layer, 'answers' | 'sent'> & Partial<Pick<Layer, 'proposals' | 'notes' | 'links'>>

/** The agent's status for the item, when it has answered it. */
function answerState(layer: Pick<Layer, 'answers'>, id: string): ItemState | undefined {
  return layer.answers.find((a) => a.id === id)?.response.status
}

/** The state of one item that is on the map. */
export function itemState(board: Board, layer: StateLayer, entry: Item): ItemState {
  if (entry.type === 'note' && noteStatus(board, entry.item) === 'needs-relinking') return 'relinking'
  if (entry.type === 'link' && linkStatus(board, { proposals: layer.proposals ?? [] }, entry.item) === 'needs-relinking') return 'relinking'
  const answer = answerState(layer, entry.item.id)
  if (answer) return answer
  if (entry.type === 'note' && noteStatus(board, entry.item) === 'possibly-outdated') return 'outdated'
  return wasSent(layer, entry.item) ? 'sent' : 'unsent'
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

/** For each part, the state that wins among the notes and questions attached to it, and how many of them are in it. */
export function partStates(board: Board, layer: StateLayer & Pick<Layer, 'notes'>): Map<string, { state: ItemState; count: number }> {
  const found = new Map<string, ItemState[]>()
  for (const note of layer.notes) {
    if (note.target.type !== 'component') continue
    const list = found.get(note.target.id) ?? []
    list.push(noteState(board, layer, note))
    found.set(note.target.id, list)
  }
  const out = new Map<string, { state: ItemState; count: number }>()
  for (const [id, states] of found) {
    const state = topState(states)!
    out.set(id, { state, count: states.filter((s) => s === state).length })
  }
  return out
}

/** The name of the badge on a part: how many notes and questions are on it, and the state that wins among them. */
export function noteBadgeLabel(total: number, state: ItemState, inState: number): string {
  const what = total === 1 ? 'note or question' : 'notes or questions'
  const word = STATE_WORD[state].toLowerCase()
  return inState === total ? `${total} ${what} from you, ${word}` : `${total} ${what} from you, ${inState} ${word}`
}
