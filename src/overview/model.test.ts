import { describe, expect, it } from 'vitest'
import { emptyLayer } from '../layer/model'
import { allBoards, urlShortenerBoard } from '../layer/testBoards'
import { bundleGroups } from './betweenGroups'
import { innerConnections } from './innerConnections'
import { changeCounts, changeLine, filterGroups, partGroups, responseLine } from './model'

const none: ReadonlySet<string> = new Set()

describe('partGroups', () => {
  it('lists every part once, on every board, in the order of the board groups', () => {
    for (const board of allBoards()) {
      const groups = partGroups(board, emptyLayer(board.id), none)
      expect(groups.flatMap((g) => g.rows).map((r) => r.id).sort()).toEqual(board.components.map((c) => c.id).sort())
      const order = board.groups.map((g) => g.id).filter((id) => groups.some((g) => g.key === id))
      expect(groups.filter((g) => board.groups.some((x) => x.id === g.key)).map((g) => g.key)).toEqual(order)
    }
  })

  it('counts connections in and out, and the open items on each part', () => {
    const board = urlShortenerBoard()
    const rows = partGroups(board, emptyLayer(board.id), none).flatMap((g) => g.rows)
    for (const r of rows) {
      expect(r.in).toBe(board.relationships.filter((x) => x.to === r.id).length)
      expect(r.out).toBe(board.relationships.filter((x) => x.from === r.id).length)
      expect(r.open).toBe(board.items.filter((i) => i.about === r.id).length)
    }
  })

  it('puts the parts the user proposed last, under their own group', () => {
    const board = urlShortenerBoard()
    const layer = { ...emptyLayer(board.id), proposals: [{ id: 'part-abc123', label: 'Rate limiter', summary: '', x: 0, y: 0, width: 100, height: 60, createdAt: '2026-11-01T00:00:00.000Z' }] }
    const groups = partGroups(board, layer, none)
    expect(groups.at(-1)).toMatchObject({ key: 'yours', yours: true })
    expect(groups.at(-1)!.rows[0]).toMatchObject({ type: 'proposal', label: 'Rate limiter' })
  })
})

describe('filterGroups', () => {
  it('keeps the rows that match the words, and drops a group with none', () => {
    const board = urlShortenerBoard()
    const groups = partGroups(board, emptyLayer(board.id), none)
    const found = filterGroups(groups, { query: 'cache', mode: 'all' })
    expect(found.flatMap((g) => g.rows).length).toBeGreaterThan(0)
    expect(found.length).toBeLessThan(groups.length)
    expect(filterGroups(groups, { query: 'zzzz', mode: 'all' })).toEqual([])
  })

  it('narrows to undecided parts and to parts with open items', () => {
    const board = urlShortenerBoard()
    const groups = partGroups(board, emptyLayer(board.id), none)
    for (const r of filterGroups(groups, { query: '', mode: 'undecided' }).flatMap((g) => g.rows)) expect(r.source).toBe('agent-proposal')
    for (const r of filterGroups(groups, { query: '', mode: 'questions' }).flatMap((g) => g.rows)) expect(r.open).toBeGreaterThan(0)
  })
})

describe('the Needs you lines', () => {
  it('says what a revision changed in plain words', () => {
    expect(changeLine({ parts: 6, connections: 0, boardChanged: false }, 4)).toBe('6 parts changed in revision 4')
    expect(changeLine({ parts: 1, connections: 2, boardChanged: false }, 4)).toBe('1 part and 2 connections changed in revision 4')
    expect(changeLine({ parts: 0, connections: 0, boardChanged: true }, 4)).toBe('Title, goal, or scope changed in revision 4')
    expect(changeLine(changeCounts(undefined), 4)).toBeUndefined()
  })

  it('sums up the answers only when they answer the last send', () => {
    const board = { ...urlShortenerBoard(), revision: 4 }
    const items = [
      { feedbackId: 'a', status: 'adopted' as const, text: 'x', changed: [] },
      { feedbackId: 'b', status: 'adopted' as const, text: 'x', changed: [] },
      { feedbackId: 'c', status: 'declined' as const, text: 'x', changed: [] },
    ]
    const withResponses = { ...board, responses: { respondsTo: 'feedback-aaaaaa', items } }
    const sent = { feedbackId: 'feedback-aaaaaa', baseRevision: 3, at: '2026-11-14T10:00:00.000Z', items: [] }
    expect(responseLine(withResponses, { ...emptyLayer(board.id), sent })).toBe('Revision 4 answered 3 items: 2 adopted, 1 declined.')
    expect(responseLine(withResponses, { ...emptyLayer(board.id), sent: { ...sent, feedbackId: 'feedback-bbbbbb' } })).toBeUndefined()
    expect(responseLine(withResponses, emptyLayer(board.id))).toBeUndefined()
  })
})

describe('bundleGroups', () => {
  it('counts the connections between two groups whichever way they run, busiest first, and leaves out those inside a group', () => {
    for (const board of allBoards()) {
      const bundles = bundleGroups(board, [], [])
      const group = new Map(board.components.map((c) => [c.id, c.group]))
      const between = board.relationships.filter((r) => group.get(r.from) !== group.get(r.to) || group.get(r.from) === undefined)
      expect(bundles.reduce((n, b) => n + b.count, 0)).toBe(between.length)
      expect(bundles.map((b) => b.count)).toEqual([...bundles.map((b) => b.count)].sort((a, b) => b - a))
    }
  })
})

describe('innerConnections', () => {
  it('counts what stays inside a group, so the rows add up to every connection', () => {
    for (const board of allBoards()) {
      const inner = innerConnections(board, [], [])
      const between = bundleGroups(board, [], [])
      const group = new Map(board.components.map((c) => [c.id, c.group]))
      const selfLoops = board.relationships.filter((r) => r.from === r.to && group.get(r.from) === undefined).length
      expect([...inner, ...between].reduce((n, b) => n + b.count, 0)).toBe(board.relationships.length - selfLoops)
      for (const b of inner) expect(b.a).toBe(b.b)
    }
  })

  it('names the group and lists the connection IDs', () => {
    const board = urlShortenerBoard()
    const group = board.groups[1]!.id
    const inside = board.relationships.filter((r) => board.components.find((c) => c.id === r.from)?.group === group && board.components.find((c) => c.id === r.to)?.group === group)
    const found = innerConnections(board, [], []).find((b) => b.a === `group:${group}`)
    expect(found?.connectionIds.sort()).toEqual(inside.map((r) => r.id).sort())
  })
})
