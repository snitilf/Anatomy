import { describe, expect, it } from 'vitest'
import type { Bundle } from './bundleRoutes'
import { countHeight, countWidth, farNames, groupNameRect, isMixed, nameRoom, placeCounts, YOURS_TICK } from './farLabels'

const bundle = (id: string, count: number, points: { x: number; y: number }[]): Bundle => ({ id, a: 'a', b: 'b', count, ab: count, ba: 0, connectionIds: [], mine: false, yours: 0, d: '', points, width: 2 })
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

describe('the room of a group name', () => {
  it('sits above the top edge and grows with the scale', () => {
    const area = { x: 100, y: 300, width: 500, height: 400 }
    const small = groupNameRect(area, 'Backend', 15, 2)
    const large = groupNameRect(area, 'Backend', 15, 6)
    expect(small.y + small.height).toBeLessThan(300)
    expect(large.width).toBeGreaterThan(small.width * 2.5)
  })
})

describe("the user's mark on a count", () => {
  it('is on a bundle that mixes their links with the agent lines, and the count makes room for it', () => {
    expect(isMixed({ mine: false, yours: 1 })).toBe(true)
    expect(isMixed({ mine: false, yours: 0 })).toBe(false)
    // A bundle of only their links is drawn in their dash and dot already.
    expect(isMixed({ mine: true, yours: 2 })).toBe(false)
    // The mark sits under the number: the count is taller, and as wide as before, which leaves room for the mark's 13 px.
    expect(countHeight({ mine: false, yours: 1 }) - countHeight({ mine: false, yours: 0 })).toBe(YOURS_TICK)
    expect(countWidth({ count: 2 })).toBeGreaterThanOrEqual(13)
  })
})

describe('the room for a group name', () => {
  const area = (x: number, y: number) => ({ x, y, width: 280, height: 400 })
  it('stops short of the next group on the same line, and is the widest name anywhere else', () => {
    const room = nameRoom([{ id: 'a', area: area(0, 0) }, { id: 'b', area: area(320, 0) }, { id: 'c', area: area(0, 600) }], 2)
    // 320 board pixels at a label scale of 2 is 160 at natural size, less the gap.
    expect(room.get('a')).toBe(152)
    expect(room.get('b')).toBe(260)
    expect(room.get('c')).toBe(260)
  })
})

describe('where a group name goes in the far view', () => {
  const group = (id: string, x: number, y: number, label = 'Group', width = 280) => ({ id, label, count: 3, area: { x, y, width, height: 300 } })
  const frameOf = (gs: ReturnType<typeof group>[]) => {
    const x = Math.min(...gs.map((g) => g.area.x))
    const y = Math.min(...gs.map((g) => g.area.y))
    return { x, y, width: Math.max(...gs.map((g) => g.area.x + g.area.width)) - x, height: Math.max(...gs.map((g) => g.area.y + g.area.height)) - y }
  }

  it('keeps the long name of a narrow group at the right edge inside the frame', () => {
    const groups = [group('a', 0, 0), group('b', 400, 0, 'A very long name for a group with one part', 160)]
    const frame = frameOf(groups)
    const placed = farNames(groups, [], frame, 3)
    const rect = placed.get('b')!.rect
    expect(rect.x + rect.width).toBeLessThanOrEqual(frame.x + frame.width)
  })

  it('puts a name inside its own block when another block sits too close above it', () => {
    const groups = [group('top', 0, 0), group('below', 0, 340)]
    const placed = farNames(groups, [], frameOf(groups), 2.5)
    const name = placed.get('below')!
    expect(name.inside).toBe(true)
    // Inside, it covers nothing of the block above.
    expect(name.rect.y).toBeGreaterThanOrEqual(340)
  })

  it('keeps a name above its block when the room above is clear', () => {
    const groups = [group('top', 0, 0), group('below', 0, 500)]
    const placed = farNames(groups, [], frameOf(groups), 2.5)
    expect(placed.get('below')!.inside).toBe(false)
    expect(placed.get('below')!.rect.y + placed.get('below')!.rect.height).toBeLessThanOrEqual(500)
  })

  it('counts a loose part above a group as a block too', () => {
    const groups = [group('g', 0, 200)]
    const tile = { x: 20, y: 60, width: 240, height: 112 }
    const name = farNames(groups, [tile], { x: 0, y: 60, width: 280, height: 440 }, 2.5).get('g')!
    expect(hit(name.rect, tile)).toBe(false)
  })

  it('goes below its block when the room above and the top of the block are taken', () => {
    // A block close above, and tiles right at the top of the group.
    const groups = [group('top', 0, 0), group('g', 0, 340)]
    const tiles = [{ x: 0, y: 348, width: 280, height: 200 }]
    const name = farNames(groups, tiles, { x: 0, y: 0, width: 280, height: 800 }, 2.5).get('g')!
    expect(hit(name.rect, tiles[0]!)).toBe(false)
    expect(name.rect.y).toBeGreaterThanOrEqual(640)
  })
})
