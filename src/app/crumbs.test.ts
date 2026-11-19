import { describe, expect, it } from 'vitest'
import { allBoards, clone, refundBoard } from '../layer/testBoards'
import { emptyLayer } from '../layer/model'
import { bundleWords } from '../canvas/bundleWords'
import { bundleGroups } from '../canvas/bundles'
import { trailOf } from './crumbs'
import { bundleSelection } from './state'

describe('trailOf', () => {
  it('names the group and the part of a selected part', () => {
    const board = refundBoard()
    const part = board.components.find((c) => c.group !== undefined)!
    const group = board.groups.find((g) => g.id === part.group)!
    expect(trailOf(board, undefined, { type: 'component', id: part.id })).toEqual({ group: { id: group.id, label: group.label }, last: { label: part.label, kind: 'part' } })
  })

  it('names only the line for a connection', () => {
    const board = refundBoard()
    const line = board.relationships[0]!
    expect(trailOf(board, undefined, { type: 'relationship', id: line.id })).toEqual({ last: { label: line.label, kind: 'line' } })
  })

  it('names a link by its label, or Link when it has none, and a new part by its name', () => {
    const board = refundBoard()
    const [a, b] = board.components
    const layer = clone(emptyLayer(board.id))
    layer.links.push({ id: 'link-aaaaaa', from: a!.id, to: b!.id, label: '', createdAt: '2026-01-01T00:00:00.000Z' } as never)
    expect(trailOf(board, layer, { type: 'link', id: 'link-aaaaaa' })?.last).toEqual({ label: 'Link', kind: 'line' })
  })

  it('has nothing for the board, a drawing, or something that is gone', () => {
    const board = refundBoard()
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

  it('names the pair of a selected bundle, and has nothing when the pair is gone', () => {
    const board = refundBoard()
    const pair = bundleGroups(board)[0]!
    expect(trailOf(board, undefined, bundleSelection(pair.a, pair.b))).toEqual({ last: { label: bundleWords(board, [], pair).title, kind: 'bundle' } })
    expect(trailOf(board, undefined, bundleSelection('group:nope', 'group:nada'))).toBeUndefined()
  })
})
