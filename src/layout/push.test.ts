import { describe, expect, it } from 'vitest'
import { allBoards } from '../layer/testBoards'
import { groupAreas, placeCards } from './cards'
import { overlaps, type Rect } from './geometry'
import { PUSH_GAP, pushApart } from './push'

const card = (x: number, y: number, width = 240, height = 112): Rect => ({ x, y, width, height })

function apply(rects: Record<string, Rect>, moves: Record<string, { x: number; y: number }>): Record<string, Rect> {
  const out = { ...rects }
  for (const [id, p] of Object.entries(moves)) out[id] = { ...(out[id] as Rect), ...p }
  return out
}

function groupAreasOf(rects: Record<string, Rect>, ids: string[]): Rect {
  const list = ids.map((id) => rects[id]!)
  const minX = Math.min(...list.map((r) => r.x))
  const minY = Math.min(...list.map((r) => r.y))
  const maxX = Math.max(...list.map((r) => r.x + r.width))
  const maxY = Math.max(...list.map((r) => r.y + r.height))
  return { x: minX - 24, y: minY - 46, width: maxX - minX + 48, height: maxY - minY + 70 }
}

describe('pushApart', () => {
  it('moves nothing when nothing overlaps', () => {
    expect(pushApart({ a: card(0, 0), b: card(300, 0) }, new Set(['a']))).toEqual({})
  })

  it('pushes a covered card out along the shorter way, a gap away, and never moves the pinned card', () => {
    // b sits mostly below a: the way down is shorter than the way to the side.
    const moves = pushApart({ a: card(0, 0), b: card(40, 80) }, new Set(['a']))
    expect(Object.keys(moves)).toEqual(['b'])
    expect(moves.b).toEqual({ x: 40, y: 112 + PUSH_GAP })
  })

  it('pushes sideways when the side is the shorter way', () => {
    const moves = pushApart({ a: card(0, 0), b: card(200, 10) }, new Set(['a']))
    expect(moves.b).toEqual({ x: 240 + PUSH_GAP, y: 10 })
  })

  it('cascades: a pushed card pushes the next one', () => {
    const rects = { a: card(0, 0), b: card(0, 100), c: card(0, 240) }
    const moves = pushApart(rects, new Set(['a']))
    const after = apply(rects, moves)
    expect(overlaps(after.a!, after.b!)).toBe(false)
    expect(overlaps(after.b!, after.c!)).toBe(false)
    expect(after.a).toEqual(rects.a)
  })

  it('keeps a card inside its group area when that costs a little more', () => {
    // Out to the right is 76 px and down is 88 px, but only down keeps b inside its group, which runs down to c.
    const rects = { a: card(0, 0), b: card(180, 40), c: card(180, 400) }
    const groupOf = (id: string) => (id === 'a' ? undefined : 'g')
    const areas = groupAreasOf(rects, ['b', 'c'])
    const moves = pushApart(rects, new Set(['a']), { groupOf, areas: { g: areas } })
    expect(moves.b).toEqual({ x: 180, y: 112 + PUSH_GAP })
    expect(pushApart(rects, new Set(['a'])).b).toEqual({ x: 240 + PUSH_GAP, y: 40 })
  })

  it('avoids landing a pushed card on a card that has settled', () => {
    // Right of b is taken by c, which a does not touch, so b goes another way.
    const rects = { a: card(0, 0), b: card(150, 0), c: card(260 + 150 - 10, 0) }
    const moves = pushApart(rects, new Set(['a', 'c']))
    const after = apply(rects, moves)
    expect(overlaps(after.b!, after.c!)).toBe(false)
    expect(overlaps(after.a!, after.b!)).toBe(false)
  })

  it('clears a card dropped in the middle of every board', () => {
    for (const board of allBoards()) {
      const rects = placeCards(board, { positions: {}, sizes: {} })
      const ids = board.components.map((c) => c.id)
      const target = rects[ids[Math.floor(ids.length / 2)]!]!
      const dropped = ids[0]!
      const placed = { ...rects, [dropped]: { ...rects[dropped]!, x: target.x + 30, y: target.y + 20 } }
      const groupOf = new Map(board.components.map((c) => [c.id, c.group]))
      const moves = pushApart(placed, new Set([dropped]), { groupOf: (id) => groupOf.get(id), areas: groupAreas(board, placed) })
      const after = apply(placed, moves)
      for (const id of ids) if (id !== dropped) expect(overlaps(after[id]!, after[dropped]!), `${board.title}: ${id}`).toBe(false)
      expect(moves[dropped]).toBeUndefined()
    }
  })
})
