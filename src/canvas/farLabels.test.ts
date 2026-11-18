import { describe, expect, it } from 'vitest'
import type { Bundle } from './bundleRoutes'
import { groupNameRect, placeCounts, placeNames } from './farLabels'

const bundle = (id: string, count: number, points: { x: number; y: number }[]): Bundle => ({ id, a: 'a', b: 'b', count, ab: count, ba: 0, connectionIds: [], mine: false, d: '', points, width: 2 })
const hit = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

describe('counts on bundled lines', () => {
  const line = [{ x: 0, y: 0 }, { x: 1000, y: 0 }]

  it('puts a count in the middle of the longest run', () => {
    expect(placeCounts([bundle('x', 5, line)], [], 4).get('x')).toEqual({ x: 500, y: 0 })
  })

  it('leaves out a count for one connection', () => {
    expect(placeCounts([bundle('x', 1, line)], [], 4).size).toBe(0)
  })

  it('slides along the run to clear a group name', () => {
    const name = { x: 400, y: -50, width: 200, height: 100 }
    const at = placeCounts([bundle('x', 12, line)], [name], 4).get('x')!
    expect(at).toBeDefined()
    const chip = { x: at.x - 40, y: at.y - 36, width: 80, height: 72 }
    expect(hit(chip, name)).toBe(false)
  })

  it('is left out when every place on the line is taken', () => {
    const wall = { x: -100, y: -100, width: 1300, height: 200 }
    expect(placeCounts([bundle('x', 12, line)], [wall], 4).has('x')).toBe(false)
  })

  it('keeps two counts apart', () => {
    const at = placeCounts([bundle('x', 5, line), bundle('y', 5, line)], [], 4)
    expect(at.get('x')).not.toEqual(at.get('y'))
  })
})

describe('names of tiles that have no group', () => {
  const tile = { id: 't', label: 'Search', rect: { x: 0, y: 0, width: 240, height: 112 } }

  it('names a tile wide enough on screen, under it', () => {
    const [name] = placeNames([tile], [], 4)
    expect(name?.box.y).toBeGreaterThan(112)
  })

  it('skips a tile under 48px wide on screen', () => {
    expect(placeNames([tile], [], 6)).toEqual([])
  })

  it('goes over the tile when under it is taken, and is left out when both are', () => {
    const under = { x: -50, y: 112, width: 400, height: 100 }
    const over = { x: -50, y: -100, width: 400, height: 100 }
    expect(placeNames([tile], [under], 4)[0]?.box.y).toBeLessThan(0)
    expect(placeNames([tile], [under, over], 4)).toEqual([])
  })
})

describe('the room of a group name', () => {
  it('sits above the top edge and grows with the scale', () => {
    const area = { x: 100, y: 300, width: 500, height: 400 }
    const small = groupNameRect(area, 'Backend', 15, 2)
    const large = groupNameRect(area, 'Backend', 15, 6)
    expect(small.y + small.height).toBeLessThan(300)
    expect(large.width).toBeGreaterThan(small.width * 2.5)
  })
})
