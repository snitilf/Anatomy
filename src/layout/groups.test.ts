import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { allBoards } from '../layer/testBoards'
import { groupAreas, placeCards } from './cards'
import { inflate, overlaps, type Rect } from './geometry'
import { GROUP_GAP, separateGroups, settleMoves } from './groups'

const card = (x: number, y: number, width = 240, height = 112): Rect => ({ x, y, width, height })

function board(groups: Record<string, string[]>, extra: string[] = []): Board {
  const components = [
    ...Object.entries(groups).flatMap(([group, ids]) => ids.map((id) => ({ id, label: id, summary: 's', group, source: { kind: 'inferred' as const } }))),
    ...extra.map((id) => ({ id, label: id, summary: 's', source: { kind: 'inferred' as const } })),
  ]
  return { groups: Object.keys(groups).map((id) => ({ id, label: id })), components, relationships: [] } as unknown as Board
}

const apply = (rects: Record<string, Rect>, moves: Record<string, { x: number; y: number }>) => {
  const out = { ...rects }
  for (const [id, p] of Object.entries(moves)) out[id] = { ...(out[id] as Rect), ...p }
  return out
}

/** Group areas that overlap or are closer than the gap, and cards outside a group that sit inside one. */
function clashes(b: Board, rects: Record<string, Rect>): string[] {
  const areas = groupAreas(b, rects)
  const keys = Object.keys(areas)
  const out: string[] = []
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (overlaps(inflate(areas[keys[i]!]!, GROUP_GAP / 2 - 0.5), inflate(areas[keys[j]!]!, GROUP_GAP / 2 - 0.5))) out.push(`${keys[i]} ${keys[j]}`)
    }
  }
  for (const c of b.components) if (c.group === undefined) for (const [g, a] of Object.entries(areas)) if (overlaps(a, rects[c.id]!)) out.push(`${c.id} in ${g}`)
  return out
}

describe('separateGroups', () => {
  it('moves nothing when the groups keep their distance', () => {
    const b = board({ g: ['a'], h: ['b'] })
    expect(separateGroups(b, { a: card(0, 0), b: card(400, 0) }, new Set(['a']))).toEqual({})
  })

  it('moves the other group, every card of it by the same amount, along the shorter way', () => {
    const b = board({ g: ['a'], h: ['b', 'c'] })
    const rects = { a: card(0, 0), b: card(200, 20), c: card(200, 300) }
    const moves = separateGroups(b, rects, new Set(['a']))
    expect(Object.keys(moves).sort()).toEqual(['b', 'c'])
    expect(moves.b!.x - rects.b.x).toBe(moves.c!.x - rects.c.x)
    expect(moves.b!.y - rects.b.y).toBe(moves.c!.y - rects.c.y)
    expect(clashes(b, apply(rects, moves))).toEqual([])
  })

  it('keeps the dropped card and its group where they are', () => {
    const b = board({ g: ['a', 'x'], h: ['b'] })
    const rects = { a: card(0, 0), x: card(0, 200), b: card(100, 100) }
    const moves = separateGroups(b, rects, new Set(['a']))
    expect(moves.a).toBeUndefined()
    expect(moves.x).toBeUndefined()
    expect(clashes(b, apply(rects, moves))).toEqual([])
  })

  it('cascades to a third group', () => {
    const b = board({ g: ['a'], h: ['b'], i: ['c'] })
    const rects = { a: card(0, 0), b: card(150, 0), c: card(500, 0) }
    const moves = separateGroups(b, rects, new Set(['a']))
    expect(clashes(b, apply(rects, moves))).toEqual([])
  })

  it('moves a group away from an ungrouped card dropped into it', () => {
    const b = board({ h: ['b', 'c'] }, ['loose'])
    const rects = { loose: card(60, 60), b: card(0, 0), c: card(300, 0) }
    const moves = separateGroups(b, rects, new Set(['loose']))
    expect(moves.loose).toBeUndefined()
    expect(clashes(b, apply(rects, moves))).toEqual([])
  })

  it('moves a loose card out of a group that grew over it', () => {
    const b = board({ g: ['a', 'x'] }, ['loose'])
    const rects = { a: card(0, 0), x: card(0, 600), loose: card(60, 250) }
    const moves = separateGroups(b, rects, new Set(['a']))
    expect(moves.loose).toBeDefined()
    expect(clashes(b, apply(rects, moves))).toEqual([])
  })
})

describe('settleMoves on the example boards', () => {
  for (const [index, b] of allBoards().entries()) {
    const groups = b.groups.filter((g) => b.components.some((c) => c.group === g.id))
    if (groups.length < 2) continue
    it(`no two group areas overlap after a card is dropped into another group (board ${index}, ${b.components.length} parts)`, () => {
      const start = placeCards(b, { positions: {}, sizes: {} })
      const areas = groupAreas(b, start)
      let dropped = 0
      for (const mover of b.components.filter((c) => c.group !== undefined)) {
        const target = groups.find((g) => g.id !== mover.group)
        const into = target ? areas[target.id] : undefined
        if (!into) continue
        const size = start[mover.id]!
        const rects = { ...start, [mover.id]: { ...size, x: Math.round(into.x + into.width / 2 - size.width / 2), y: Math.round(into.y + into.height / 2 - size.height / 2) } }
        const moves = settleMoves(b, rects, [mover.id])
        const after = apply(rects, moves)
        // Only what the drop made worse counts: the layout may already hold two groups closer than the gap elsewhere.
        const worse = clashes(b, after).filter((c) => !clashes(b, start).includes(c))
        expect(worse, `${mover.id} into ${target!.id}`).toEqual([])
        expect(after[mover.id]).toEqual(rects[mover.id])
        const ids = Object.keys(after)
        const cover = ids.flatMap((a, i) => ids.slice(i + 1).filter((c) => overlaps(after[a]!, after[c]!)).map((c) => `${a}+${c}`))
        const coverBefore = ids.flatMap((a, i) => ids.slice(i + 1).filter((c) => overlaps(rects[a]!, rects[c]!)).map((c) => `${a}+${c}`))
        expect(cover.filter((c) => !coverBefore.includes(c)), `${mover.id} into ${target!.id}`).toEqual([])
        dropped++
        if (dropped > 12) break
      }
      expect(dropped).toBeGreaterThan(0)
    })
  }

  it('a resize that grows a group over another moves the other group', () => {
    for (const b of allBoards()) {
      const start = placeCards(b, { positions: {}, sizes: {} })
      const mover = b.components.find((c) => c.group !== undefined)
      if (!mover) continue
      const rects = { ...start, [mover.id]: { ...start[mover.id]!, width: 480, height: 320 } }
      const after = apply(rects, settleMoves(b, rects, [mover.id]))
      const worse = clashes(b, after).filter((c) => !clashes(b, start).includes(c))
      expect(worse).toEqual([])
    }
  })
})

describe('settleMoves keeps other groups rigid', () => {
  it('moves every displaced member of a hit group by the same amount', () => {
    const b = board({ h: ['b', 'c'] }, ['a'])
    const rects = { a: card(600, 0), b: card(600, 0), c: card(600, 200) }
    const moves = settleMoves(b, rects, ['a'])
    expect(moves.a).toBeUndefined()
    const db = { x: moves.b!.x - rects.b.x, y: moves.b!.y - rects.b.y }
    const dc = { x: moves.c!.x - rects.c.x, y: moves.c!.y - rects.c.y }
    expect(db).toEqual(dc)
    expect(clashes(b, apply(rects, moves))).toEqual([])
  })

  it('moves a group away from an ungrouped card that was pushed onto it', () => {
    const b = board({ h: ['c'] }, ['a', 'b'])
    const rects = { a: card(0, 0), b: card(200, 0), c: card(500, 0) }
    const moves = settleMoves(b, rects, ['a'])
    const after = apply(rects, moves)
    expect(clashes(b, after)).toEqual([])
    const ids = Object.keys(after)
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(overlaps(after[ids[i]!]!, after[ids[j]!]!)).toBe(false)
  })

  it('still pushes cards apart inside one group', () => {
    const b = board({ g: ['a', 'x'] })
    const rects = { a: card(0, 0), x: card(40, 80) }
    const moves = settleMoves(b, rects, ['a'])
    expect(moves.x).toBeDefined()
    expect(overlaps(rects.a, apply(rects, moves).x!)).toBe(false)
  })
})
