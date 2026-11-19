import { describe, expect, it } from 'vitest'
import { emptyLayer, type Layer, type Note } from '../layer/model'
import { fingerprintTarget, fingerprintValue } from '../layer/fingerprint'
import { clone, refundBoard } from '../layer/testBoards'
import { itemState, noteBadgeLabel, partStates, topState } from './state'

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
