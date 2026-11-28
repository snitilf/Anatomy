import { describe, expect, it } from 'vitest'
import { emptyLayer, type Layer, type Note } from '../layer/model'
import { fingerprintTarget, fingerprintValue } from '../layer/fingerprint'
import { clone, refundBoard } from '../layer/testBoards'
import { ITEM_STATES, itemState, noteBadgeLabel, partStates, STATE_MEANING, STATE_WORD, topState } from './state'

const board = refundBoard()
const part = board.components[0]!
const at = '2026-05-01T00:00:00.000Z'

function note(id: string, over: Partial<Note> = {}): Note {
  return { id, kind: 'note', text: 'Why?', target: { type: 'component', id: part.id }, targetFingerprint: fingerprintTarget(board, { type: 'component', id: part.id })!, createdAt: at, updatedAt: at, ...over }
}

function layerWith(notes: Note[], extra: Partial<Layer> = {}): Layer {
  return { ...emptyLayer(board.id), notes, ...extra }
}

describe('item state', () => {
  it('is not sent until the item has gone out, and sent while it is unchanged', () => {
    const n = note('note-aaaaaa')
    expect(itemState(board, layerWith([n]), { type: 'note', item: n })).toBe('unsent')
    const sent = { feedbackId: 'feedback-aaaaaa', baseRevision: 1, at, items: [{ id: n.id, fingerprint: fingerprintValue(n) }] }
    expect(itemState(board, layerWith([n], { sent }), { type: 'note', item: n })).toBe('sent')
    const edited = { ...n, text: 'Changed' }
    expect(itemState(board, layerWith([edited], { sent }), { type: 'note', item: edited })).toBe('unsent')
  })

  it('takes the agent status when the item was answered', () => {
    const n = note('note-aaaaaa')
    for (const status of ['answered', 'adopted', 'declined'] as const) {
      const layer = layerWith([n], { answers: [{ id: n.id, response: { respondsTo: 'feedback-aaaaaa', status, text: 'ok', changed: [] } }] })
      expect(itemState(board, layer, { type: 'note', item: n })).toBe(status)
    }
  })

  it('puts an agent answer before a part that changed, and a removed target before everything', () => {
    const answers = (id: string) => [{ id, response: { respondsTo: 'feedback-aaaaaa', status: 'answered' as const, text: 'ok', changed: [] } }]
    const stale = note('note-aaaaaa', { targetFingerprint: 'old' })
    expect(itemState(board, layerWith([stale]), { type: 'note', item: stale })).toBe('outdated')
    expect(itemState(board, layerWith([stale], { answers: answers(stale.id) }), { type: 'note', item: stale })).toBe('answered')
    const gone = note('note-bbbbbb', { target: { type: 'component', id: 'no-such-part' } })
    expect(itemState(board, layerWith([gone], { answers: answers(gone.id) }), { type: 'note', item: gone })).toBe('relinking')
  })

  it('flags a link whose part left the board', () => {
    const link = { id: 'link-aaaaaa', from: part.id, to: 'gone-part', label: '', createdAt: at }
    expect(itemState(board, layerWith([], { links: [link] }), { type: 'link', item: link })).toBe('relinking')
  })

  it('names the winning state of a part from its notes', () => {
    expect(topState(['sent', 'unsent'])).toBe('unsent')
    expect(topState(['outdated', 'answered'])).toBe('answered')
    expect(topState(['outdated', 'adopted'])).toBe('adopted')
    expect(topState(['unsent', 'outdated'])).toBe('outdated')
    expect(topState(['answered', 'relinking'])).toBe('relinking')
    expect(topState([])).toBeUndefined()
    const layer = layerWith([note('note-aaaaaa'), note('note-bbbbbb', { targetFingerprint: 'old' }), note('note-cccccc', { targetFingerprint: 'old' })])
    expect(partStates(clone(board), layer).get(part.id)).toEqual({ state: 'outdated', count: 2 })
  })

  it('names the badge with the count in the winning state when it differs from the total', () => {
    expect(noteBadgeLabel(1, 'unsent', 1)).toBe('1 note or question from you, not sent')
    expect(noteBadgeLabel(3, 'answered', 1)).toBe('3 notes or questions from you, 1 answered')
    expect(noteBadgeLabel(2, 'sent', 2)).toBe('2 notes or questions from you, sent')
  })
})

describe('STATE_MEANING', () => {
  it('says what each state means in one short sentence that does not repeat the word', () => {
    for (const state of ITEM_STATES) {
      const text = STATE_MEANING[state]
      expect(text, state).toMatch(/\S/)
      expect(text.length, state).toBeLessThanOrEqual(48)
      expect(text, state).toMatch(/\.$/)
      expect(text, state).not.toContain('\u2014')
      expect(text.toLowerCase(), state).not.toBe(STATE_WORD[state].toLowerCase() + '.')
    }
    expect(new Set(ITEM_STATES.map((s) => STATE_MEANING[s])).size).toBe(ITEM_STATES.length)
  })
})

describe('kept answers', () => {
  const answered = (id: string) => ({ id, response: { respondsTo: 'feedback-aaaaaa', status: 'answered' as const, text: 'ok', changed: [] } })

  it('an answer the user kept reads as kept, and its meaning does not send the user to Review', () => {
    const n = note('note-aaaaaa')
    expect(itemState(board, layerWith([n], { answers: [answered(n.id)], kept: [n.id] }), { type: 'note', item: n })).toBe('kept')
    expect(itemState(board, layerWith([n], { answers: [answered(n.id)] }), { type: 'note', item: n })).toBe('answered')
    expect(STATE_MEANING.kept).not.toMatch(/Review/)
    expect(STATE_WORD.kept).toBe('Kept')
  })

  it('a part shows an answer that waits before one that was kept, and counts only the one that waits', () => {
    const a = note('note-aaaaaa')
    const b = note('note-bbbbbb')
    const answers = [answered(a.id), answered(b.id)]
    expect(partStates(board, layerWith([a, b], { answers, kept: [a.id] })).get(part.id)).toEqual({ state: 'answered', count: 1 })
    expect(partStates(board, layerWith([a, b], { answers, kept: [a.id, b.id] })).get(part.id)).toEqual({ state: 'kept', count: 2 })
    // Something still to send wins over an answer that is settled.
    const fresh = note('note-cccccc')
    expect(partStates(board, layerWith([a, fresh], { answers: [answered(a.id)], kept: [a.id] })).get(part.id)).toEqual({ state: 'unsent', count: 1 })
  })
})
