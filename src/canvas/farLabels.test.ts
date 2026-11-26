import { describe, expect, it } from 'vitest'
import type { Bundle } from './bundleRoutes'
import { countHeight, countWidth, farNames, isMixed, nameRoom, placeCounts, tagRect, YOURS_TICK } from './farLabels'

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

  it('sits just above its block and grows with the scale', () => {
    const groups = [group('g', 100, 300, 'Backend', 500)]
    const small = farNames(groups, [], frameOf(groups), 2).get('g')!
    const large = farNames(groups, [], frameOf(groups), 6).get('g')!
    expect(small.rect.y + small.rect.height).toBeLessThan(300)
    expect(small.inside).toBe(false)
    expect(large.rect.width).toBeGreaterThan(small.rect.width * 2.5)
  })

  it('moves down onto the top edge of its block when another block sits too close above it', () => {
    const groups = [group('top', 0, 0), group('below', 0, 340)]
    const name = farNames(groups, [], frameOf(groups), 2.5).get('below')!
    expect(name.inside).toBe(true)
    // It covers nothing of the block above, and the block's edge runs across it.
    expect(name.rect.y).toBeGreaterThanOrEqual(300)
    expect(name.edge).toBeGreaterThan(0)
    expect(name.edge).toBeLessThan(20)
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

  it('moves along the top edge past a line that comes down into the block', () => {
    const groups = [group('g', 0, 200, 'Backend', 600)]
    const line = bundle('a|g', 3, [
      { x: 60, y: 0 },
      { x: 60, y: 200 },
    ])
    const name = farNames(groups, [], { x: 0, y: 0, width: 600, height: 500 }, 2, [line]).get('g')!
    expect(name.inside).toBe(false)
    expect(name.rect.x).toBeGreaterThan(60)
    expect(name.rect.y + name.rect.height).toBeLessThanOrEqual(200)
  })

  it('goes below its block when the room above and the top of the block are taken', () => {
    // A block close above, and tiles right at the top of the group.
    const groups = [group('top', 0, 0), group('g', 0, 340)]
    const tiles = [{ x: 0, y: 348, width: 280, height: 200 }]
    const name = farNames(groups, tiles, { x: 0, y: 0, width: 280, height: 800 }, 2.5).get('g')!
    expect(name.hidden).toBe(false)
    expect(name.rect.y).toBeGreaterThanOrEqual(640)
  })

  it('is cut short, but keeps its count and a few letters', () => {
    // A block right below, tiles that fill the group, and a line that comes down 90 board pixels in, at a scale of 1:
    // above the group there is room for about 80 pixels of name, less than the whole.
    const groups = [group('g', 0, 200, 'A long name for a group of parts', 280), group('under', 0, 510)]
    const line = bundle('a|g', 3, [
      { x: 90, y: 0 },
      { x: 90, y: 200 },
    ])
    const name = farNames(groups, [{ x: 0, y: 204, width: 280, height: 296 }], frameOf(groups), 1, [line]).get('g')!
    expect(name.hidden).toBe(false)
    expect(name.room).toBeGreaterThanOrEqual(64)
    expect(name.room).toBeLessThan(150)
    expect(name.rect.x + name.rect.width).toBeLessThanOrEqual(90)
  })

  it('is left off the map when there is no free place for it', () => {
    // The group is boxed in: blocks right above and below, and its own tiles fill it to the edges.
    const groups = [group('top', 0, 0), group('g', 0, 320), group('under', 0, 640)]
    const tiles = [{ x: 0, y: 322, width: 280, height: 296 }]
    const name = farNames(groups, tiles, frameOf(groups), 3).get('g')!
    expect(name.hidden).toBe(true)
  })

  it('keeps clear of the name tag of a lit tile', () => {
    const groups = [group('g', 0, 200, 'Your machine', 600)]
    const tile = { x: 20, y: 240, width: 240, height: 112 }
    const tag = tagRect(tile, 'You and your prompt', 2)
    expect(tag.y + tag.height).toBeLessThan(tile.y)
    const name = farNames(groups, [tile, tag], { x: 0, y: 0, width: 600, height: 600 }, 2).get('g')!
    expect(hit(name.rect, tag)).toBe(false)
    expect(name.hidden).toBe(false)
  })

  it('slides a narrow group at the right edge to the left, so its whole name fits', () => {
    // Open map to the left of the group above it: the other group is far below, out of the band of the name.
    const label = 'Outside the model'
    for (const scale of [3, 5]) {
      const groups = [group('a', 0, 600, 'Group', 600), group('b', 640, 0, label, 272)]
      const frame = frameOf(groups)
      const name = farNames(groups, [], frame, scale).get('b')!
      const whole = farNames([group('w', 0, 0, label, 4000)], [], { x: 0, y: 0, width: 4000, height: 300 }, scale).get('w')!
      expect(name.hidden, `scale ${scale}`).toBe(false)
      expect(name.room, `scale ${scale}`).toBeCloseTo(whole.room, 6)
      expect(name.rect.x + name.rect.width, `scale ${scale}`).toBeLessThanOrEqual(frame.x + frame.width)
      expect(name.rect.x, `scale ${scale}`).toBeLessThan(640)
      // It still reads as the block's: at least half of the block's width lies under it.
      expect(name.rect.x + name.rect.width - 640, `scale ${scale}`).toBeGreaterThanOrEqual(136)
    }
  })

  it('does not cut a name short of the next group on its line, but tries lower places first', () => {
    // At a scale of 6, 64 board pixels between the two groups leave 48 natural pixels before the next name.
    const groups = [group('g1', 0, 200, 'Backend services', 272), group('g2', 336, 200, 'Jobs', 272)]
    const placed = farNames(groups, [], frameOf(groups), 6)
    const name = placed.get('g1')!
    expect(name.hidden).toBe(false)
    expect(name.room).toBeGreaterThanOrEqual(64)
    expect(hit(name.rect, groups[1]!.area)).toBe(false)
    expect(hit(name.rect, placed.get('g2')!.rect)).toBe(false)
  })

  it('never takes a place with no room for its name', () => {
    // The next group starts 40 board pixels to the right, its name on the same line: no room is left above.
    const groups = [group('g1', 0, 200, 'Backend services', 600), { id: 'g2', label: 'Jobs', count: 1, area: { x: 40, y: 60, width: 272, height: 100 } }]
    const name = farNames(groups, [], frameOf(groups), 6).get('g1')!
    expect(name.hidden).toBe(false)
    expect(name.room).toBeGreaterThanOrEqual(64)
    expect(name.rect.width).toBeGreaterThanOrEqual(64 * 6)
  })

  it('keeps a hidden name at least as wide as a cut name while it has focus', () => {
    // The boxed-in group of the test above, as narrow as a group of one column, at a phone's scale.
    for (const scale of [5, 6]) {
      const groups = [group('top', 0, 0, 'Group', 272), group('g', 0, 320, 'A long name for a group of parts', 272), group('under', 0, 640, 'Group', 272)]
      const tiles = [{ x: 0, y: 322, width: 272, height: 296 }]
      const name = farNames(groups, tiles, frameOf(groups), scale).get('g')!
      expect(name.hidden, `scale ${scale}`).toBe(true)
      expect(name.room, `scale ${scale}`).toBeGreaterThanOrEqual(64)
      expect(name.rect.width, `scale ${scale}`).toBeCloseTo(name.room * scale, 6)
    }
  })

  it('never covers a tile, a line, or another name', () => {
    const groups = [group('a', 0, 0, 'Frontend services'), group('b', 320, 0, 'Backend'), group('c', 0, 340, 'Data and storage'), group('d', 320, 340, 'Jobs')]
    const tiles = groups.flatMap((g) => [
      { x: g.area.x + 16, y: g.area.y + 46, width: 240, height: 112 },
      { x: g.area.x + 16, y: g.area.y + 182, width: 240, height: 112 },
    ])
    const lines = [
      bundle('a|c', 2, [
        { x: 140, y: 300 },
        { x: 140, y: 340 },
      ]),
      bundle('b|d', 2, [
        { x: 380, y: 300 },
        { x: 380, y: 320 },
        { x: 560, y: 320 },
        { x: 560, y: 340 },
      ]),
    ]
    for (const scale of [1, 2, 3, 4, 6]) {
      const placed = [...farNames(groups, tiles, frameOf(groups), scale, lines).values()].filter((n) => !n.hidden)
      for (const [i, n] of placed.entries()) {
        for (const t of tiles) expect(hit(n.rect, t)).toBe(false)
        for (const o of placed.slice(i + 1)) expect(hit(n.rect, o.rect)).toBe(false)
        for (const l of lines) for (const [p, q] of l.points.slice(1).map((q, k) => [l.points[k]!, q] as const)) expect(hit(n.rect, { x: Math.min(p.x, q.x) - 1, y: Math.min(p.y, q.y) - 1, width: Math.abs(q.x - p.x) + 2, height: Math.abs(q.y - p.y) + 2 })).toBe(false)
      }
    }
  })
})
