import { describe, expect, it } from 'vitest'
import { allBoards } from '../layer/testBoards'
import { CARD_SIZE, placeCards } from '../layout/cards'
import { computeGeometry } from './buildGraph'
import { pillHeight, placeLabel, wrap } from './labelPlacement'
import { Drawn, elbow, hitsAnyCard, lineHitsCards, pickSides, planEdges, quickRoute, routeConnection, TRACK, type Rect } from './routing'

const CARD_WIDTH = CARD_SIZE.width
const CARD_HEIGHT = CARD_SIZE.height
const at = (x: number, y: number, width = CARD_WIDTH, height = CARD_HEIGHT): Rect => ({ x, y, width, height })

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
    // The middle run is down the middle of the gap.
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

  it('leaves the cheap elbow of a moving card free of any search', () => {
    const a = at(0, 0)
    const b = at(400, 200)
    const [plan] = [...planEdges({ a, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    expect(quickRoute(plan!).runs).toHaveLength(3)
    expect(elbow(plan!)).toHaveLength(4)
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
  it('wraps a long label onto two lines in a wide pill', () => {
    expect(wrap('exact recipient and message', 150).lines).toBe(2)
    expect(wrap('writes', 150).lines).toBe(1)
  })

  it('keeps a label off the text of the cards when the line has room elsewhere', () => {
    const a = at(0, 0)
    const b = at(0, 180)
    const [plan] = [...planEdges({ a, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const route = routeConnection(plan!, [a, b])
    const spot = placeLabel(route.points, 'exact recipient and message', [a, b], [])
    expect(spot.lines).toBe(2)
    const top = spot.y - (spot.lines * 16 + 6) / 2
    const bottom = spot.y + (spot.lines * 16 + 6) / 2
    expect(top).toBeGreaterThan(a.y + CARD_HEIGHT - 34 + 8 - 1)
    expect(bottom).toBeLessThan(b.y + 8 + 1)
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

  it('run on their own tracks and never along each other', () => {
    for (let i = 0; i < routes.length; i++) {
      const others = new Drawn()
      routes.forEach((r, j) => j !== i && others.add(r.runs!))
      for (const [p, q] of routes[i]!.runs!) expect(others.shared(p, q)).toBe(0)
    }
  })

  it('get labels that never overlap each other', () => {
    const taken: Rect[] = []
    const lines = routes.flatMap((r) => r.points)
    for (const route of routes) {
      const spot = placeLabel(route.points, 'was this already sent?', [a, b], taken, lines)
      const box = { x: spot.x - spot.width / 2, y: spot.y - pillHeight(spot.lines) / 2, width: spot.width, height: pillHeight(spot.lines) }
      for (const t of taken) {
        const apart = box.x >= t.x + t.width || t.x >= box.x + box.width || box.y >= t.y + t.height || t.y >= box.y + box.height
        expect(apart).toBe(true)
      }
      taken.push(box)
    }
  })
})
