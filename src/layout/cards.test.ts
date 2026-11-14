import { describe, expect, it } from 'vitest'
import { allBoards, anatomyBoard, clone, nordetBoard } from '../layer/testBoards'
import { CARD_SIZE, defaultLayout, placeCards } from './cards'
import { overlaps } from './geometry'

const none = { positions: {}, sizes: {} }

/** The same board with every starting position removed, so the default slots apply. */
function withoutPositions<T extends { components: { position?: unknown }[] }>(b: T): T {
  return { ...b, components: b.components.map(({ position: _p, ...rest }) => rest) }
}

describe('defaultLayout', () => {
  it('is deterministic and gives every component its own slot', () => {
    const b = nordetBoard()
    const a = defaultLayout(b)
    expect(defaultLayout(clone(b))).toEqual(a)
    expect(Object.keys(a).sort()).toEqual(b.components.map((c) => c.id).sort())
    const pts = Object.values(a)
    expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(pts.length)
  })

  it('uses columns of 440 and rows of 240, groups in file order, ungrouped last', () => {
    const b = clone(anatomyBoard())
    b.groups = [{ id: 'g1', label: 'One' }, { id: 'g2', label: 'Two' }]
    b.components = b.components.slice(0, 4).map((c, i) => {
      const { group: _g, ...rest } = c
      return i === 0 ? { ...rest, group: 'g2' } : i === 1 ? { ...rest, group: 'g1' } : i === 2 ? { ...rest, group: 'g2' } : rest
    })
    const l = defaultLayout(b)
    const ids = b.components.map((c) => c.id)
    expect(l[ids[1]!]).toEqual({ x: 0, y: 0 })
    expect(l[ids[0]!]).toEqual({ x: 440, y: 0 })
    expect(l[ids[2]!]).toEqual({ x: 440, y: 240 })
    expect(l[ids[3]!]).toEqual({ x: 880, y: 0 })
  })
})

describe('placeCards', () => {
  it('prefers the user position, then the board position, then the default slot', () => {
    const b = clone(anatomyBoard())
    const [a, c] = b.components
    a!.position = { x: 10, y: 20 }
    c!.position = { x: 500, y: 600 }
    const r = placeCards(b, { positions: { [c!.id]: { x: -5, y: -6 } }, sizes: {} })
    expect(r[a!.id]).toMatchObject({ x: 10, y: 20 })
    expect(r[c!.id]).toMatchObject({ x: -5, y: -6 })
  })

  it('gives each card the default size unless the user resized it', () => {
    const b = nordetBoard()
    const [a, c] = b.components
    const r = placeCards(b, { positions: {}, sizes: { [a!.id]: { width: 400, height: 300 } } })
    expect(r[a!.id]).toMatchObject({ width: 400, height: 300 })
    expect(r[c!.id]).toMatchObject(CARD_SIZE)
  })

  it('places cards without a position clear of the cards the board placed, on every board', () => {
    for (const b of allBoards()) {
      const r = placeCards(b, none)
      const auto = b.components.filter((c) => c.position === undefined).map((c) => r[c.id]!)
      for (const x of auto) for (const y of Object.values(r)) if (x !== y) expect(overlaps(x, y)).toBe(false)
      expect(placeCards(b, none)).toEqual(r)
    }
  })

  it('moves nothing else when the user moves or resizes one card', () => {
    for (const b of allBoards()) {
      const first = b.components[0]!
      const layout = defaultLayout(b)
      const last = b.components[b.components.length - 1]!
      const before = placeCards(b, none)
      // The first card is dropped on the last card's slot, and grown.
      const r = placeCards(b, { positions: { [first.id]: layout[last.id]! }, sizes: { [first.id]: { width: 420, height: 260 } } })
      expect(r[first.id]).toMatchObject({ ...layout[last.id], width: 420, height: 260 })
      for (const c of b.components) if (c.id !== first.id) expect(r[c.id]).toEqual(before[c.id])
    }
  })

  it('keeps a free default slot when there is no collision', () => {
    const b = withoutPositions(anatomyBoard())
    const r = placeCards(b, none)
    for (const [id, p] of Object.entries(defaultLayout(b))) expect(r[id]).toEqual({ ...p, ...CARD_SIZE })
  })

  it('places several new cards below the lowest card of their column', () => {
    const b = clone(anatomyBoard())
    b.groups = [{ id: 'g1', label: 'One' }]
    b.components = withoutPositions(b).components.slice(0, 3).map((c) => ({ ...c, group: 'g1' }))
    const [a] = b.components
    a!.position = { x: 0, y: 0 }
    const r = placeCards(b, none)
    expect(r[b.components[1]!.id]).toMatchObject({ x: 0, y: 240 })
    expect(r[b.components[2]!.id]).toMatchObject({ x: 0, y: 480 })
  })
})
