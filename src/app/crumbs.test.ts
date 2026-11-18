import { describe, expect, it } from 'vitest'
import { allBoards, clone, exampleBoard } from '../layer/testBoards'
import { emptyLayer } from '../layer/model'
import { trailOf } from './crumbs'

describe('trailOf', () => {
  it('names the group and the part of a selected part', () => {
    const board = exampleBoard()
    const part = board.components.find((c) => c.group !== undefined)!
    const group = board.groups.find((g) => g.id === part.group)!
    expect(trailOf(board, undefined, { type: 'component', id: part.id })).toEqual({ group: { id: group.id, label: group.label }, last: { label: part.label, kind: 'part' } })
  })

  it('names only the line for a connection', () => {
    const board = exampleBoard()
    const line = board.relationships[0]!
    expect(trailOf(board, undefined, { type: 'relationship', id: line.id })).toEqual({ last: { label: line.label, kind: 'line' } })
  })

  it('names a link by its label, or Link when it has none, and a new part by its name', () => {
    const board = exampleBoard()
    const [a, b] = board.components
    const layer = clone(emptyLayer(board.id))
    layer.links.push({ id: 'link-aaaaaa', from: a!.id, to: b!.id, label: '', createdAt: '2026-01-01T00:00:00.000Z' } as never)
    expect(trailOf(board, layer, { type: 'link', id: 'link-aaaaaa' })?.last).toEqual({ label: 'Link', kind: 'line' })
  })

  it('has nothing for the board, a drawing, or something that is gone', () => {
    const board = exampleBoard()
    expect(trailOf(board, undefined, { type: 'board' })).toBeUndefined()
    expect(trailOf(board, undefined, { type: 'mark', id: 'mark-aaaaaa' })).toBeUndefined()
    expect(trailOf(board, undefined, { type: 'component', id: 'nope' })).toBeUndefined()
    expect(trailOf(board, undefined, { type: 'link', id: 'nope' })).toBeUndefined()
  })

  it('works for every part and connection of every board', () => {
    for (const board of allBoards()) {
      for (const c of board.components) expect(trailOf(board, undefined, { type: 'component', id: c.id })?.last.label).toBe(c.label)
      for (const r of board.relationships) expect(trailOf(board, undefined, { type: 'relationship', id: r.id })?.last.label).toBe(r.label)
    }
  })
})
