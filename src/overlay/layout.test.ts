import { describe, expect, it } from 'vitest'
import { defaultLayout, resolvePositions } from './layout'
import { anatomyBoard, clone, exampleBoard } from './testBoards'
import { emptyOverlay } from './types'

/** The same board with every starting position removed, so the default slots apply. */
function withoutPositions<T extends { components: { position?: unknown }[] }>(b: T): T {
  return { ...b, components: b.components.map(({ position: _p, ...rest }) => rest) }
}

function overlaps(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) < 280 && Math.abs(a.y - b.y) < 160
}

describe('defaultLayout', () => {
  it('is deterministic and gives every component its own slot', () => {
    const b = exampleBoard()
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

describe('resolvePositions', () => {
  it('prefers overlay, then board position, then default', () => {
    const b = clone(anatomyBoard())
    const [a, c] = b.components
    a!.position = { x: 10, y: 20 }
    c!.position = { x: 500, y: 600 }
    const overlay = { ...emptyOverlay(b.id), positions: { [c!.id]: { x: -5, y: -6 } } }
    const r = resolvePositions(b, overlay)
    expect(r[a!.id]).toEqual({ x: 10, y: 20 })
    expect(r[c!.id]).toEqual({ x: -5, y: -6 })
  })

  it('never moves existing cards and places new cards without overlap', () => {
    const b = exampleBoard()
    const layout = defaultLayout(b)
    // Everything but the last component already has a position, all stacked in the default slots shifted so the default slot of the last one is taken.
    const last = b.components[b.components.length - 1]!
    const positions: Record<string, { x: number; y: number }> = {}
    for (const c of b.components) if (c.id !== last.id) positions[c.id] = { x: layout[c.id]!.x + 0, y: layout[c.id]!.y }
    positions[b.components[0]!.id] = { ...layout[last.id]! }
    const overlay = { ...emptyOverlay(b.id), positions }
    const r = resolvePositions(b, overlay)
    for (const [id, p] of Object.entries(positions)) expect(r[id]).toEqual(p)
    const all = Object.values(r)
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i]!, all[j]!)).toBe(false)
    expect(resolvePositions(b, overlay)).toEqual(r)
  })

  it('keeps a free default slot when there is no collision', () => {
    const b = withoutPositions(anatomyBoard())
    expect(resolvePositions(b, emptyOverlay(b.id))).toEqual(defaultLayout(b))
  })

  it('places several new cards below the lowest card of their column', () => {
    const b = clone(anatomyBoard())
    b.groups = [{ id: 'g1', label: 'One' }]
    b.components = withoutPositions(b).components.slice(0, 3).map((c) => ({ ...c, group: 'g1' }))
    const [a] = b.components
    const overlay = { ...emptyOverlay(b.id), positions: { [a!.id]: { x: 0, y: 0 } } }
    const r = resolvePositions(b, overlay)
    expect(r[b.components[1]!.id]).toEqual({ x: 0, y: 240 })
    expect(r[b.components[2]!.id]).toEqual({ x: 0, y: 480 })
  })
})
