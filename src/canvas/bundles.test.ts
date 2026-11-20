import { describe, expect, it } from 'vitest'
import sixtyText from '../../e2e/fixtures/sixty-parts.board.json?raw'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { placeCards } from '../layout/cards'
import { bundleGroups, clusterOf, connectionsOf, countPairs } from './bundles'
import { arrowOf, type Bundle, visibleArrows, blocksOf, bundleWidth, BUNDLE_MAX_WIDTH, computeBundles, roundedPath } from './bundleRoutes'

const sixty = (): Board => {
  const r = parseBoard(sixtyText)
  if (!r.ok) throw new Error('fixture board is invalid')
  return r.board
}

describe('counting pairs', () => {
  const board = sixty()
  const clusters = clusterOf(board)

  it('puts a part in its group, and a part with no group in a block of its own', () => {
    const grouped = board.components.find((c) => c.group !== undefined)!
    const loose = board.components.find((c) => c.group === undefined)!
    expect(clusters.get(grouped.id)).toBe(`group:${grouped.group}`)
    expect(clusters.get(loose.id)).toBe(loose.id)
  })

  it('counts every connection between two blocks once, in either direction, and drops those inside one group', () => {
    const map = new Map([
      ['x1', 'group:g'],
      ['x2', 'group:g'],
      ['x3', 'group:h'],
    ])
    const pairs = countPairs(map, [
      { id: 'r1', from: 'x1', to: 'x3', mine: false },
      { id: 'r2', from: 'x3', to: 'x2', mine: false },
      { id: 'r3', from: 'x1', to: 'x2', mine: false },
      { id: 'r4', from: 'x1', to: 'missing', mine: false },
    ])
    expect(pairs).toEqual([{ a: 'group:g', b: 'group:h', count: 2, ab: 1, ba: 1, connectionIds: ['r1', 'r2'], mine: false, yours: 0 }])
  })

  it('counts which way each connection of a pair runs', () => {
    const map = new Map([
      ['p', 'group:a'],
      ['q', 'group:b'],
    ])
    const [one] = countPairs(map, [
      { id: 'r1', from: 'p', to: 'q', mine: false },
      { id: 'r2', from: 'p', to: 'q', mine: false },
    ])
    expect([one?.ab, one?.ba]).toEqual([2, 0])
    const [back] = countPairs(map, [{ id: 'r3', from: 'q', to: 'p', mine: false }])
    expect([back?.ab, back?.ba]).toEqual([0, 1])
  })

  it('accounts for all connections of the board', () => {
    const pairs = countPairs(clusters, connectionsOf(board, [], []))
    const inside = board.relationships.filter((r) => clusters.get(r.from) === clusters.get(r.to)).length
    expect(pairs.reduce((n, p) => n + p.count, 0)).toBe(board.relationships.length - inside)
  })

  it('lists the pairs of groups with their connection ids, from the board alone', () => {
    const pairs = bundleGroups(board)
    expect(pairs.flatMap((p) => p.connectionIds).sort()).toEqual(
      board.relationships.filter((r) => clusters.get(r.from) !== clusters.get(r.to)).map((r) => r.id).sort(),
    )
    for (const p of pairs) expect(p.connectionIds.length).toBe(p.count)
    expect(pairs.some((p) => p.a.startsWith('group:') && p.b.startsWith('group:'))).toBe(true)
  })

  it('counts a link the user drew with the pair it joins', () => {
    const x = board.components.find((c) => c.group === 'g-1')!
    const y = board.components.find((c) => c.group === 'g-2')!
    const before = bundleGroups(board).find((p) => p.a === 'group:g-1' && p.b === 'group:g-2')!.count
    const after = bundleGroups(board, [{ id: 'link-1', from: x.id, to: y.id, label: '' } as never]).find((p) => p.a === 'group:g-1' && p.b === 'group:g-2')!
    expect(after.count).toBe(before + 1)
    expect(after.connectionIds).toContain('link-1')
  })

  it('treats a proposed part as a block of its own, so a link to it is counted', () => {
    const part = board.components.find((c) => c.group === 'g-1')!
    const link = { id: 'link-2', from: part.id, to: 'part-new', label: '' } as never
    expect(bundleGroups(board, [link]).some((p) => p.connectionIds.includes('link-2'))).toBe(false)
    const pairs = bundleGroups(board, [link], [], [{ id: 'part-new' }])
    const pair = pairs.find((p) => p.connectionIds.includes('link-2'))!
    expect([pair.a, pair.b].sort()).toEqual(['group:g-1', 'part-new'])
    expect(pair.mine).toBe(true)
    expect(pair.yours).toBe(1)
  })

  it("counts the user's links in a bundle they share with the agent's lines", () => {
    const map = new Map([['p', 'group:g'], ['q', 'group:h']])
    const [pair] = countPairs(map, [
      { id: 'r1', from: 'p', to: 'q', mine: false },
      { id: 'link-1', from: 'p', to: 'q', mine: true },
      { id: 'r2', from: 'q', to: 'p', mine: false },
    ])
    expect(pair).toMatchObject({ count: 3, mine: false, yours: 1 })
  })

  it('uses the ends the user moved a connection to', () => {
    const r = board.relationships[0]!
    const other = board.components.find((c) => c.id !== r.from && c.id !== r.to)!
    expect(connectionsOf(board, [], [{ relationshipId: r.id, from: other.id, to: r.to } as never])[0]?.from).toBe(other.id)
  })
})

describe('routing the bundles', () => {
  const board = sixty()
  const rects = placeCards(board, { positions: {}, sizes: {} })
  const bundles = computeBundles(board, rects, bundleGroups(board))

  it('draws one line per pair of blocks, with the blocks as its routing input', () => {
    const blocks = blocksOf(board, rects)
    expect(blocks.size).toBe(board.groups.length + board.components.filter((c) => c.group === undefined).length)
    expect(new Set(bundles.map((b) => b.id)).size).toBe(bundles.length)
    expect(bundles.length).toBeGreaterThan(3)
    for (const b of bundles) {
      expect(blocks.has(b.a) && blocks.has(b.b)).toBe(true)
      expect(b.d.startsWith('M')).toBe(true)
    }
  })

  it('keeps the same picture from one build to the next', () => {
    expect(computeBundles(board, rects, bundleGroups(board))).toEqual(bundles)
  })

  it('draws a line to a proposed part, which is a block of its own', () => {
    const part = board.components.find((c) => c.group === 'g-1')!
    const placed = { ...rects, 'part-new': { x: -600, y: 0, width: 240, height: 112 } }
    const pairs = bundleGroups(board, [{ id: 'link-2', from: part.id, to: 'part-new', label: '' } as never], [], [{ id: 'part-new' }])
    const drawn = computeBundles(board, placed, pairs)
    expect(drawn.some((b) => b.connectionIds.includes('link-2'))).toBe(true)
  })
})

describe('bundle width', () => {
  it('grows gently with the count and stops at a cap', () => {
    expect(bundleWidth(1)).toBeCloseTo(1.25)
    expect(bundleWidth(2)).toBeCloseTo(1.25)
    expect(bundleWidth(4)).toBeCloseTo(1.75)
    expect(bundleWidth(14)).toBeLessThanOrEqual(BUNDLE_MAX_WIDTH)
    expect(bundleWidth(10000)).toBe(BUNDLE_MAX_WIDTH)
  })
})

describe('direction', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
  ]

  it('puts the arrowhead where every connection runs to, along the last run', () => {
    expect(arrowOf({ ab: 3, ba: 0 }, points)).toEqual({ at: { x: 100, y: 50 }, angle: 90 })
    expect(arrowOf({ ab: 0, ba: 2 }, points)).toEqual({ at: { x: 0, y: 0 }, angle: 180 })
  })

  it('draws none when the connections run both ways', () => {
    expect(arrowOf({ ab: 2, ba: 1 }, points)).toBeUndefined()
  })

  it('rounds corners without leaving the points', () => {
    expect(roundedPath(points)).toMatch(/^M0 0 L.* Q100 0 .* L100 50$/)
  })
})

describe('arrowheads at a crowded edge', () => {
  const bundle = (id: string, to: string, y: number, mine = false): Bundle => ({
    id,
    a: 'x',
    b: to,
    ab: 1,
    ba: 0,
    count: 1,
    connectionIds: [],
    mine,
    yours: mine ? 1 : 0,
    d: '',
    points: [],
    width: 1.5,
    arrow: { at: { x: 0, y }, angle: 0 },
  })

  it('keeps every head when they are far apart on screen, and one per run when they are not', () => {
    const list = [bundle('a', 'g', 0), bundle('b', 'g', 10), bundle('c', 'g', 20), bundle('d', 'h', 5)]
    expect([...visibleArrows(list, 1)].sort()).toEqual(['a', 'b', 'c', 'd'])
    // At 12 board pixels per screen pixel, heads need 72 apart.
    expect([...visibleArrows(list, 12)].sort()).toEqual(['a', 'd'])
  })

  it('keeps the head of a bundle that is yours', () => {
    const list = [bundle('a', 'g', 0), bundle('b', 'g', 10, true)]
    expect([...visibleArrows(list, 12)].sort()).toEqual(['a', 'b'])
  })
})
