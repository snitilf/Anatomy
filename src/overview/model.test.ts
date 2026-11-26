import { describe, expect, it } from 'vitest'
import { emptyLayer } from '../layer/model'
import { allBoards, urlShortenerBoard } from '../layer/testBoards'
import { bundleGroups } from '../canvas/bundles'
import { innerConnections } from './innerConnections'
import { boardMeta, changeCounts, changeLine, filterGroups, isGoalClamped, partGroups, responseLine, rowSlots, scopeSlice, showRowSource, type PartRow } from './model'

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

describe('the Connections rows', () => {
  it('count a link to a part the user proposed as one more connection, between that part and its neighbour', () => {
    const board = urlShortenerBoard()
    const link = { id: 'link-abc123', from: 'part-abc123', to: board.components[0]!.id, label: '', createdAt: '2026-11-01T00:00:00.000Z' }
    const proposals = [{ id: 'part-abc123' }]
    const rows = [...innerConnections(board, [link], []), ...bundleGroups(board, [link], [], proposals)]
    expect(rows.reduce((n, b) => n + b.count, 0)).toBe(board.relationships.length + 1)
    expect(bundleGroups(board, [link], [], proposals).some((b) => b.a === 'part-abc123' || b.b === 'part-abc123')).toBe(true)
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

describe('boardMeta', () => {
  it('formats 0, 1, and many of each count and omits missing groups or open questions', () => {
    expect(boardMeta({ parts: 0, groups: 0, connections: 0, questions: 0 })).toEqual([{ section: 'parts', text: '0 parts' }])
    expect(boardMeta({ parts: 1, groups: 1, connections: 1, questions: 1 })).toEqual([
      { section: 'parts', text: '1 part in 1 group' },
      { section: 'between', text: '1 connection' },
      { section: 'questions', text: '1 open question' },
    ])
    expect(boardMeta({ parts: 10, groups: 3, connections: 13, questions: 6 })).toEqual([
      { section: 'parts', text: '10 parts in 3 groups' },
      { section: 'between', text: '13 connections' },
      { section: 'questions', text: '6 open questions' },
    ])
    expect(boardMeta({ parts: 5, groups: 0, connections: 2, questions: 0 })).toEqual([
      { section: 'parts', text: '5 parts' },
      { section: 'between', text: '2 connections' },
    ])
  })
})

describe('rowSlots and showRowSource', () => {
  const base: PartRow = {
    id: 'p1',
    type: 'component',
    label: 'Worker',
    summary: 'Runs jobs',
    lesson: false,
    open: 0,
    notes: 0,
    in: 1,
    out: 2,
    source: 'agent-explanation',
  }

  it('reports only the slots that have something to show', () => {
    expect(rowSlots(base)).toEqual({ lesson: false, open: undefined, yours: undefined, source: false })
    expect(rowSlots({ ...base, lesson: true, open: 2, notes: 3, state: 'unsent', source: 'agent-proposal' })).toEqual({
      lesson: true,
      open: 2,
      yours: { count: 3, state: 'unsent' },
      source: true,
    })
  })

  it('shows the source icon only for an undecided component', () => {
    expect(showRowSource({ type: 'component', source: 'agent-proposal' })).toBe(true)
    expect(showRowSource({ type: 'component', source: 'agent-explanation' })).toBe(false)
    expect(showRowSource({ type: 'component', source: 'documented-intent' })).toBe(false)
    expect(showRowSource({ type: 'component', source: 'user-stated' })).toBe(false)
    expect(showRowSource({ type: 'proposal', source: 'agent-proposal' })).toBe(false)
  })
})

describe('scopeSlice', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => `Item ${i + 1}`)

  it('caps a list of 12 at 5 items with Show all 12, and expands to all 12 with Show less', () => {
    const collapsed = scopeSlice(twelve, 5, false)
    expect(collapsed.items).toHaveLength(5)
    expect(collapsed.moreLabel).toBe('Show all 12')

    const expanded = scopeSlice(twelve, 5, true)
    expect(expanded.items).toHaveLength(12)
    expect(expanded.moreLabel).toBe('Show less')
  })

  it('caps at 3 on narrow layouts and adds no toggle when the list fits', () => {
    const narrow = scopeSlice(twelve, 3, false)
    expect(narrow.items).toHaveLength(3)
    expect(narrow.moreLabel).toBe('Show all 12')

    const short = scopeSlice(twelve.slice(0, 5), 5, false)
    expect(short.items).toHaveLength(5)
    expect(short.moreLabel).toBeUndefined()
  })
})

describe('isGoalClamped', () => {
  it('shows no Show more unless at least a full line is hidden', () => {
    expect(isGoalClamped(88, 88, 22)).toBe(false)
    expect(isGoalClamped(90, 88, 22)).toBe(false)
    expect(isGoalClamped(99, 88, 22)).toBe(false)
    expect(isGoalClamped(110, 88, 22)).toBe(true)
    expect(isGoalClamped(132, 88, 22)).toBe(true)
    expect(isGoalClamped(110, 88, 0)).toBe(false)
  })
})
