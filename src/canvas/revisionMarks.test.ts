import { describe, expect, it } from 'vitest'
import { placeCards } from '../layout/cards'
import { clone, refundBoard } from '../layer/testBoards'
import { initialState, reducer } from '../app/state'
import { NO_MARKS, revisionMarks } from './revisionMarks'

function revised() {
  const board = refundBoard()
  const next = clone(board)
  next.revision = 2
  const [kept, changed, removed] = [next.components[0]!, next.components[1]!, next.components[next.components.length - 1]!]
  changed.summary = 'A new summary.'
  next.components = next.components.filter((c) => c.id !== removed.id)
  next.relationships = next.relationships.filter((r) => r.from !== removed.id && r.to !== removed.id)
  const line = next.relationships[0]!
  line.label = 'carries something else'
  next.components.push({ ...clone(kept), id: 'brand-new', label: 'Brand new' })
  next.relationships.push({ ...clone(line), id: 'brand-new-line', from: kept.id, to: 'brand-new', label: 'feeds' })
  const first = reducer(initialState, { type: 'boardOpened', board, warnings: [] })
  const second = reducer(first, { type: 'boardOpened', board: next, warnings: [] })
  return { board, next, first, second, changed: changed.id, removed: removed.id, line: line.id }
}

describe('revisionMarks', () => {
  it('marks new and changed parts and connections with words that do not need color', () => {
    const { second, changed, line } = revised()
    const marks = revisionMarks(second.board!, second.previousBoard, second.changes, second.layer)
    expect(marks.parts.get('brand-new')).toEqual({ kind: 'new', words: 'New in revision 2.' })
    expect(marks.parts.get(changed)).toEqual({ kind: 'changed', words: 'Changed in revision 2: summary.' })
    expect(marks.lines.get('brand-new-line')).toEqual({ kind: 'new', words: 'New in revision 2.' })
    expect(marks.lines.get(line)).toEqual({ kind: 'changed', words: 'Changed in revision 2: label.' })
    expect(marks.parts.size).toBe(2)
  })

  it('keeps a removed part as a ghost, where it was drawn', () => {
    const { board, first, second, removed } = revised()
    const marks = revisionMarks(second.board!, second.previousBoard, second.changes, second.layer)
    const was = placeCards(board, first.layer!)[removed]!
    expect(marks.ghosts).toEqual([{ id: removed, label: board.components.find((c) => c.id === removed)!.label, rect: was }])
  })

  it('marks nothing once the revision is marked reviewed', () => {
    const { second } = revised()
    const reviewed = reducer(second, { type: 'changesDismissed' })
    expect(revisionMarks(reviewed.board!, reviewed.previousBoard, reviewed.changes, reviewed.layer)).toBe(NO_MARKS)
  })

  it('drops the ghosts once the layout is tidied, since their places no longer mean anything', () => {
    const { second } = revised()
    const tidied = reducer(second, { type: 'layoutTidied' })
    expect(revisionMarks(tidied.board!, tidied.previousBoard, tidied.changes, tidied.layer).ghosts).toEqual([])
  })
})
