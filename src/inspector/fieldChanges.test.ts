import { describe, expect, it } from 'vitest'
import { allBoards, clone, refundBoard } from '../layer/testBoards'
import { fieldChanges } from './fieldChanges'

describe('fieldChanges', () => {
  it('gives the words before and after for each field of a part that differs', () => {
    const board = refundBoard()
    const next = clone(board)
    const part = next.components[0]!
    const was = board.components[0]!
    part.summary = 'A new summary.'
    part.label = 'Renamed'
    part.inputs = ['first', 'second']
    expect(fieldChanges(board, next, { type: 'component', id: part.id })).toEqual([
      { field: 'name', before: was.label, after: 'Renamed' },
      { field: 'summary', before: was.summary, after: 'A new summary.' },
      { field: 'inputs', before: was.inputs.join('; '), after: 'first; second' },
    ])
  })

  it('names the group, the ends, and the kind in words, from the revision each belongs to', () => {
    const board = refundBoard()
    const next = clone(board)
    const line = next.relationships[0]!
    const was = board.relationships[0]!
    const other = next.components.find((c) => c.id !== was.from && c.id !== was.to)!
    line.to = other.id
    line.kind = was.kind === 'calls' ? 'triggers' : 'calls'
    const changes = fieldChanges(board, next, { type: 'relationship', id: line.id })
    const label = (b: typeof board, id: string) => b.components.find((c) => c.id === id)!.label
    expect(changes.map((c) => c.field)).toEqual(['end', 'kind'])
    expect(changes[0]).toEqual({ field: 'end', before: label(board, was.to), after: other.label })
    // The refund board puts its first part in "Team screens". The group is named in words, not by its ID.
    const regrouped = clone(board)
    regrouped.components[0]!.group = 'refund-logic'
    expect(fieldChanges(board, regrouped, { type: 'component', id: regrouped.components[0]!.id })).toEqual([{ field: 'group', before: 'Team screens', after: 'Refund logic' }])
  })

  it('compares the title, goal, and scope of the board', () => {
    const board = refundBoard()
    const next = clone(board)
    next.goal = 'A new goal.'
    next.scope.excludes = ['Something else']
    const changes = fieldChanges(board, next, { type: 'board' })
    expect(changes.map((c) => c.field)).toEqual(['goal', 'scope'])
    expect(changes[1]!.after).toContain('Excludes: Something else')
  })

  it('has nothing for a part that did not change, or one missing from either revision', () => {
    for (const board of allBoards()) {
      const id = board.components[0]!.id
      expect(fieldChanges(board, clone(board), { type: 'component', id })).toEqual([])
      expect(fieldChanges(board, clone(board), { type: 'board' })).toEqual([])
      expect(fieldChanges(board, clone(board), { type: 'component', id: 'nope' })).toEqual([])
    }
  })

  it('treats a missing explanation as empty text', () => {
    const board = refundBoard()
    const next = clone(board)
    next.components[0]!.explanation = 'Now it explains itself.'
    delete (board.components[0] as { explanation?: string }).explanation
    expect(fieldChanges(board, next, { type: 'component', id: next.components[0]!.id })).toEqual([{ field: 'explanation', before: '', after: 'Now it explains itself.' }])
  })
})
