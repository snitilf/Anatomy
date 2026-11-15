import { describe, expect, it } from 'vitest'
import { allBoards } from '../layer/testBoards'
import { CARD_SIZE, placeCards } from '../layout/cards'
import { computeGeometry } from './buildGraph'
import { pillHeight, placeLabel, RunIndex, wrap, type LabelContext } from './labelPlacement'
import { Drawn, hitsAnyCard, lineHitsCards, Obstacles, pickSides, planEdges, rounded, routeConnection, TRACK, type Rect } from './routing'
import { groupTitle } from './bands'
import { minParallel } from '../test/lineMetrics'
import type { EdgeShape } from './buildGraph'

const CARD_WIDTH = CARD_SIZE.width
const CARD_HEIGHT = CARD_SIZE.height
const at = (x: number, y: number, width = CARD_WIDTH, height = CARD_HEIGHT): Rect => ({ x, y, width, height })
const context = (cards: Rect[], lines: RunIndex = new RunIndex(), taken: Rect[] = [], own = -1): LabelContext => ({ cards, bands: [], taken, lines, own })

describe('pickSides', () => {
  it('uses right and left for cards side by side', () => {
    expect(pickSides(at(0, 0), at(320, 0))).toEqual({ out: 'right', in: 'left' })
    expect(pickSides(at(320, 0), at(0, 0))).toEqual({ out: 'left', in: 'right' })
  })

  it('uses bottom and top for cards in one column', () => {
    expect(pickSides(at(0, 0), at(0, 180))).toEqual({ out: 'bottom', in: 'top' })
    expect(pickSides(at(0, 180), at(0, 0))).toEqual({ out: 'top', in: 'bottom' })
  })
})

describe('planEdges', () => {
  it('keeps two connections between the same pair apart and parallel', () => {
    const positions = { a: at(0, 0), b: at(320, 0) }
    const plans = planEdges(positions, [
      { id: 'one', from: 'a', to: 'b' },
      { id: 'two', from: 'b', to: 'a' },
    ])
    const one = plans.get('one')!
    const two = plans.get('two')!
    expect(one.a.x).toBe(CARD_WIDTH)
    expect(two.b.x).toBe(CARD_WIDTH)
    expect(Math.abs(one.a.y - two.b.y)).toBeGreaterThanOrEqual(20)
    expect(Math.abs(one.b.y - two.a.y)).toBeGreaterThanOrEqual(20)
  })

  it('leaves a lone connection at the middle of the side', () => {
    const plans = planEdges({ a: at(0, 0), b: at(0, 180) }, [{ id: 'e', from: 'a', to: 'b' }])
    expect(plans.get('e')?.a).toEqual({ x: CARD_WIDTH / 2, y: CARD_HEIGHT })
    expect(plans.get('e')?.b).toEqual({ x: CARD_WIDTH / 2, y: 180 })
  })

  it('meets each card at the middle of its own side when the cards differ in size', () => {
    const plans = planEdges({ a: at(0, 0, 400, 300), b: at(600, 40) }, [{ id: 'e', from: 'a', to: 'b' }])
    expect(plans.get('e')?.a).toEqual({ x: 400, y: 150 })
    expect(plans.get('e')?.b).toEqual({ x: 600, y: 40 + CARD_HEIGHT / 2 })
  })

  it('takes the side by the real width: a wide card next to another leaves from its right edge', () => {
    expect(pickSides(at(0, 0, 400, 150), at(380, 0))).toEqual({ out: 'bottom', in: 'top' })
    expect(pickSides(at(0, 0, 400, 150), at(420, 0))).toEqual({ out: 'right', in: 'left' })
  })
})

describe('routeConnection', () => {
  it('draws a straight run when the two ends line up', () => {
    const a = at(0, 0)
    const b = at(320, 0)
    const [plan] = [...planEdges({ a, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const route = routeConnection(plan!, [a, b])
    expect(route.d).not.toContain('C')
    expect(route.runs).toHaveLength(1)
  })

  it('draws an elbow with right angles when the ends do not line up', () => {
    const a = at(0, 0)
    const b = at(400, 200)
    const [plan] = [...planEdges({ a, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const route = routeConnection(plan!, [a, b])
    expect(route.d).not.toContain('C')
    expect(route.runs).toHaveLength(3)
    for (const [p, q] of route.runs!) expect(p.x === q.x || p.y === q.y).toBe(true)
    expect(route.runs![1]![0].x).toBe((CARD_WIDTH + 400) / 2)
  })

  it('goes around a card that sits between two others', () => {
    const a = at(0, 360)
    const middle = at(320, 180)
    const b = at(640, 0)
    const [plan] = [...planEdges({ a, middle, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const route = routeConnection(plan!, [a, middle, b])
    expect(route.runs).toBeDefined()
    expect(hitsAnyCard(route, [middle])).toBe(false)
  })

  it('takes another track when the middle of the gap is taken', () => {
    const a = at(0, 0)
    const b = at(400, 200)
    const [plan] = [...planEdges({ a, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const first = routeConnection(plan!, [a, b])
    const drawn = new Drawn()
    drawn.add(first.runs!)
    const second = routeConnection(plan!, [a, b], drawn)
    expect(second.runs![1]![0].x).not.toBe(first.runs![1]![0].x)
    expect(Math.abs(second.runs![1]![0].x - first.runs![1]![0].x)).toBeGreaterThanOrEqual(TRACK)
  })

  it('never crosses a card on any board when a path exists, and draws only right angles', () => {
    for (const board of allBoards()) {
      const rects = placeCards(board, { positions: {}, sizes: {} })
      const geometry = computeGeometry(board, rects)
      for (const r of board.relationships) {
        const shape = geometry.edges.get(r.id)!
        expect(shape.path, `${board.title}: ${r.id}`).not.toContain('C')
        const others = board.components.filter((c) => c.id !== r.from && c.id !== r.to).map((c) => rects[c.id]!)
        expect(lineHitsCards(shape.points, others), `${board.title}: ${r.id}`).toBe(false)
      }
    }
  })

  it('solves the forty part board quickly, in full and after one card moves', () => {
    const board = allBoards()[4]!
    const rects = placeCards(board, { positions: {}, sizes: {} })
    let start = performance.now()
    const full = computeGeometry(board, rects)
    const fullMs = performance.now() - start
    const id = board.components[5]!.id
    const moved = { ...rects, [id]: { ...rects[id]!, x: rects[id]!.x + 40, y: rects[id]!.y + 300 } }
    start = performance.now()
    computeGeometry(board, moved, [], full)
    const partMs = performance.now() - start
    expect(fullMs).toBeLessThan(400)
    expect(partMs).toBeLessThan(200)
  })
})

describe('labels', () => {
  it('wraps a long label onto two lines, and a short one stays on one', () => {
    expect(wrap('exact payee and message')?.lines).toBe(2)
    expect(wrap('writes')?.lines).toBe(1)
  })

  it('never breaks a word: a label with a word too long for the widest pill has no wrap', () => {
    expect(wrap('Pneumonoultramicroscopicsilicovolcanoconiosis-and-more-letters-than-any-pill-holds')).toBeUndefined()
  })

  it('keeps a single word wider than the usual pill on one line, up to the widest pill', () => {
    const size = wrap('WWWWWWWWWWWWWWW')!
    expect(size.lines).toBe(1)
    expect(size.width).toBeGreaterThan(150)
    expect(size.width).toBeLessThanOrEqual(220)
  })

  it('never needs a third line: text that does not fit in two lines has no wrap', () => {
    const long = Array.from({ length: 30 }, (_, k) => `word${k}`).join(' ')
    expect(wrap(long)).toBeUndefined()
  })

  it('keeps every line of a wrapped label whole, split at a space', () => {
    const size = wrap('exact payee and message')!
    expect(size.width).toBeLessThanOrEqual(220)
    expect(size.lines).toBe(2)
  })

  it('keeps a label off the text of the cards when the line has room elsewhere', () => {
    const a = at(0, 0)
    const b = at(0, 280)
    const [plan] = [...planEdges({ a, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const route = routeConnection(plan!, [a, b])
    const lines = new RunIndex()
    lines.add(0, route.runs!)
    const spot = placeLabel(route.runs!, 'exact payee and message', context([a, b], lines, [], 0))
    expect(spot.hidden).toBeUndefined()
    const top = spot.y - pillHeight(spot.lines) / 2
    const bottom = spot.y + pillHeight(spot.lines) / 2
    expect(top).toBeGreaterThan(a.y + CARD_HEIGHT + 4)
    expect(bottom).toBeLessThan(b.y - 4)
  })

  it('holds a label back, rather than cut or misplace it, when no run has room', () => {
    const a = at(0, 0)
    const b = at(CARD_WIDTH + 40, 0)
    const [plan] = [...planEdges({ a, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const route = routeConnection(plan!, [a, b])
    const lines = new RunIndex()
    lines.add(0, route.runs!)
    const spot = placeLabel(route.runs!, 'exact payee and message', context([a, b], lines, [], 0))
    expect(spot.hidden).toBe(true)
    expect(spot.width).toBe(0)
  })
})

describe('connections between the same two cards', () => {
  const a = at(0, 0)
  const b = at(400, 300)
  const ends = [
    { id: 'one', from: 'a', to: 'b' },
    { id: 'two', from: 'a', to: 'b' },
    { id: 'back', from: 'b', to: 'a' },
  ]
  const plans = planEdges({ a, b }, ends)
  const drawn = new Drawn()
  const routes = ends.map((e) => {
    const route = routeConnection(plans.get(e.id)!, [a, b], drawn)
    drawn.add(route.runs!)
    return route
  })

  it('run on their own tracks and never closer than a track along each other', () => {
    for (let i = 0; i < routes.length; i++) {
      const others = new Drawn()
      routes.forEach((r, j) => j !== i && others.add(r.runs!))
      for (const [p, q] of routes[i]!.runs!) {
        expect(others.shared(p, q)).toBe(0)
        expect(others.tight(p, q)).toBe(false)
      }
      expect(routes[i]!.crowded).toBeUndefined()
    }
  })

  it('get labels that never overlap each other, nor any line', () => {
    const taken: Rect[] = []
    const lines = new RunIndex()
    routes.forEach((r, i) => lines.add(i, r.runs!))
    routes.forEach((route, i) => {
      const spot = placeLabel(route.runs!, 'was this already sent?', context([a, b], lines, taken, i))
      if (spot.hidden) return
      const box = { x: spot.x - spot.width / 2, y: spot.y - pillHeight(spot.lines) / 2, width: spot.width, height: pillHeight(spot.lines) }
      for (const t of taken) {
        const apart = box.x >= t.x + t.width || t.x >= box.x + box.width || box.y >= t.y + t.height || t.y >= box.y + box.height
        expect(apart).toBe(true)
      }
      taken.push(box)
    })
  })
})

describe('spacing', () => {
  it('tells a run alongside another from one that crosses or only touches it', () => {
    const drawn = new Drawn()
    drawn.add([[{ x: 0, y: 100 }, { x: 200, y: 100 }]])
    expect(drawn.tight({ x: 50, y: 110 }, { x: 150, y: 110 })).toBe(true)
    expect(drawn.tight({ x: 50, y: 100 }, { x: 150, y: 100 })).toBe(true)
    expect(drawn.tight({ x: 50, y: 100 + TRACK }, { x: 150, y: 100 + TRACK })).toBe(false)
    expect(drawn.tight({ x: 200, y: 105 }, { x: 300, y: 105 })).toBe(false)
    expect(drawn.tight({ x: 100, y: 0 }, { x: 100, y: 300 })).toBe(false)
  })

  it('keeps every pair of runs a track apart, or marks the line it could not place', () => {
    const a = at(0, 0, CARD_WIDTH, 400)
    const b = at(CARD_WIDTH + 80, 0, CARD_WIDTH, 400)
    const ends = Array.from({ length: 9 }, (_, k) => ({ id: `e${k}`, from: 'a', to: 'b' }))
    const plans = planEdges({ a, b }, ends)
    const drawn = new Drawn()
    const obstacles = new Obstacles([a, b])
    const shapes = ends.map((e) => {
      const route = routeConnection(plans.get(e.id)!, [a, b], drawn, obstacles)
      drawn.add(route.runs!)
      return { id: e.id, runs: route.runs!, ...(route.crowded ? { crowded: true as const } : {}) } as unknown as EdgeShape
    })
    const placed = shapes.filter((s) => !s.crowded)
    expect(placed.length).toBeGreaterThanOrEqual(5)
    expect(minParallel(placed).distance).toBeGreaterThanOrEqual(TRACK)
  })

  it('keeps the ends of connections that share a side a track apart', () => {
    const a = at(0, 0)
    const targets = Array.from({ length: 5 }, (_, k) => at(500, k * 200))
    const rects: Record<string, Rect> = { a }
    targets.forEach((t, k) => (rects[`t${k}`] = t))
    const plans = planEdges(
      rects,
      targets.map((_, k) => ({ id: `e${k}`, from: 'a', to: `t${k}` })),
    )
    const ys = [...plans.values()].map((p) => p.a.y).sort((p, q) => p - q)
    for (let k = 1; k < ys.length; k++) expect(ys[k]! - ys[k - 1]!).toBeGreaterThanOrEqual(TRACK)
  })
})

describe('anchors on a crowded side', () => {
  it('keeps every anchor on the card, moving the surplus to another side, and marks a side still too full', () => {
    const a = at(0, 300, CARD_WIDTH, 100)
    const targets = Array.from({ length: 10 }, (_, k) => at(600, k * 200 - 600))
    const rects: Record<string, Rect> = { a }
    targets.forEach((t, k) => (rects[`t${k}`] = t))
    const plans = planEdges(
      rects,
      targets.map((_, k) => ({ id: `e${k}`, from: 'a', to: `t${k}` })),
    )
    for (const p of plans.values()) {
      expect(p.a.y).toBeGreaterThanOrEqual(a.y)
      expect(p.a.y).toBeLessThanOrEqual(a.y + a.height)
      expect(p.a.x).toBeGreaterThanOrEqual(a.x)
      expect(p.a.x).toBeLessThanOrEqual(a.x + a.width)
    }
    expect(new Set([...plans.values()].map((p) => p.out)).size).toBeGreaterThan(1)
  })

  it('draws only right angles when the ends differ by less than half a pixel', () => {
    for (const dy of [0.1, 0.4, 0.49, 0.5, 0.9]) {
      const plan = { out: 'right' as const, in: 'left' as const, a: { x: 0, y: 50 }, b: { x: 500, y: 50 + dy } }
      for (const route of [routeConnection(plan, [])]) {
        for (const [p, q] of route.runs!) expect(p.x === q.x || p.y === q.y, `${dy}: ${JSON.stringify([p, q])}`).toBe(true)
        expect(route.runs![0]![0]).toEqual(plan.a)
        expect(route.runs![route.runs!.length - 1]![1]).toEqual(plan.b)
      }
    }
    const up = { out: 'bottom' as const, in: 'top' as const, a: { x: 50, y: 0 }, b: { x: 50.4, y: 500 } }
    for (const [p, q] of routeConnection(up, []).runs!) expect(p.x === q.x || p.y === q.y).toBe(true)
  })

  it('keeps both ends of a nearly aligned connection', () => {
    const plan = { out: 'right' as const, in: 'left' as const, a: { x: 0, y: 50 }, b: { x: 500, y: 50.6 } }
    const route = routeConnection(plan, [])
    expect(route.runs![0]![0]).toEqual(plan.a)
    expect(route.runs![route.runs!.length - 1]![1]).toEqual(plan.b)
  })
})

describe('group names', () => {
  it('route round the name of a group rather than through it', () => {
    const a = at(0, 100)
    const b = at(900, 100)
    const area = { x: 380, y: 0, width: 300, height: 330, label: 'A rather long group name' }
    const inside = at(area.x + 24, area.y + 46, 252, 112)
    const [plan] = [...planEdges({ a, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const obstacles = new Obstacles([a, b, inside], [area])
    const route = routeConnection(plan!, [a, b, inside], new Drawn(), obstacles)
    const title = groupTitle(area)
    for (const [p, q] of route.runs!) {
      const hit = Math.max(p.x, q.x) > title.x && Math.min(p.x, q.x) < title.x + title.width && Math.max(p.y, q.y) > title.y && Math.min(p.y, q.y) < title.y + title.height
      expect(hit).toBe(false)
    }
    expect(obstacles.blocksBand({ x: title.x - 10, y: title.y + 8 }, { x: title.x + 50, y: title.y + 8 })).toBe(true)
  })
})

describe('right angles', () => {
  it('squares up two points that miss by a pixel without moving the two ends', () => {
    const route = rounded([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 41, y: 60 },
      { x: 100, y: 60 },
    ])
    for (const [p, q] of route.runs!) expect(p.x === q.x || p.y === q.y).toBe(true)
    expect(route.runs![0]![0]).toEqual({ x: 0, y: 0 })
    const last = route.runs![route.runs!.length - 1]!
    expect(last[1]).toEqual({ x: 100, y: 60 })
  })
})
