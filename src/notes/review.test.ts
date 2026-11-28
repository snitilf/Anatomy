import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { addNote } from '../layer/edits'
import { emptyLayer, layerSchema, type Layer, type Response } from '../layer/model'
import { anatomyBoard } from '../layer/testBoards'
import { pendingAnswers, reviewCounts, stepAnswer } from './review'

const t0 = new Date('2026-01-01T00:00:00.000Z')

const response = (status: Response['status'] = 'answered'): Response => ({ respondsTo: 'feedback-aaaaaa', status, text: 'Because.', changed: [] })

/** A layer with `count` questions on the board, each with an answer, and the given answers kept. */
function answered(board: Board, count: number, kept: readonly string[] = []): Layer {
  let layer = emptyLayer(board.id)
  for (let i = 0; i < count; i++) layer = addNote(layer, board, { kind: 'question', text: `Question ${i}`, target: { type: 'board' } }, t0, `note-quest${i}`)
  const answers = Array.from({ length: count }, (_, i) => ({ id: `note-quest${i}`, response: response() }))
  layer = { ...layer, answers, kept: [...kept] }
  if (!layerSchema.safeParse(layer).success) throw new Error('the test layer is not valid')
  return layer
}

describe('pendingAnswers', () => {
  it('holds the answered items that still wait for a decision, in the order of the layer', () => {
    for (const board of [anatomyBoard()]) {
      const layer = answered(board, 2)
      expect(pendingAnswers(layer).map((e) => e.item.id)).toEqual(['note-quest0', 'note-quest1'])
    }
  })

  it('leaves the kept ones out, and ignores an answer whose item left the map', () => {
    const board = anatomyBoard()
    const layer = answered(board, 2, ['note-quest0'])
    const stale = { ...layer, answers: [...layer.answers, { id: 'note-gone00', response: response() }] }
    expect(pendingAnswers(stale).map((e) => e.item.id)).toEqual(['note-quest1'])
  })
})

describe('stepAnswer', () => {
  it('starts at the first item forward and the last one back', () => {
    const layer = answered(anatomyBoard(), 3)
    const pending = pendingAnswers(layer)
    expect(stepAnswer(pending, undefined, 1)?.item.id).toBe('note-quest0')
    expect(stepAnswer(pending, undefined, -1)?.item.id).toBe('note-quest2')
  })

  it('steps one card at a time and wraps at both ends', () => {
    const layer = answered(anatomyBoard(), 3)
    const pending = pendingAnswers(layer)
    expect(stepAnswer(pending, 'note-quest1', 1)?.item.id).toBe('note-quest2')
    expect(stepAnswer(pending, 'note-quest2', 1)?.item.id).toBe('note-quest0')
    expect(stepAnswer(pending, 'note-quest0', -1)?.item.id).toBe('note-quest2')
    expect(stepAnswer(pending, 'note-quest1', -1)?.item.id).toBe('note-quest0')
  })

  it('starts over from an id that is not pending, such as a kept item', () => {
    const layer = answered(anatomyBoard(), 2, ['note-quest0'])
    const pending = pendingAnswers(layer)
    expect(stepAnswer(pending, 'note-quest0', 1)?.item.id).toBe('note-quest1')
    expect(stepAnswer(pending, 'note-gone00', -1)?.item.id).toBe('note-quest1')
  })

  it('has nowhere to go when nothing waits', () => {
    const layer = answered(anatomyBoard(), 1, ['note-quest0'])
    expect(stepAnswer(pendingAnswers(layer), undefined, 1)).toBeUndefined()
    expect(stepAnswer([], undefined, -1)).toBeUndefined()
  })
})

describe('reviewCounts', () => {
  it('counts only the answers that still wait for a decision', () => {
    const board = anatomyBoard()
    const layer = answered(board, 2, ['note-quest0'])
    const counts = reviewCounts(board, layer, undefined)
    expect(counts.answers).toBe(1)
    expect(counts.decisions).toBe(1)
    expect(counts.total).toBe(1)
  })

  it('counts every answer while none is kept', () => {
    const board = anatomyBoard()
    const counts = reviewCounts(board, answered(board, 2), undefined)
    expect(counts.answers).toBe(2)
    expect(counts.decisions).toBe(2)
  })
})
