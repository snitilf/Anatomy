import { describe, expect, it } from 'vitest'
import { CARD_HEIGHT, CARD_WIDTH } from '../overlay/layout'
import { pillHeight, placeLabel, wrap } from './labelPlacement'
import { hitsAnyCard, pickSides, planEdges, routeConnection, type Rect } from './routing'

const at = (x: number, y: number): Rect => ({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT })

describe('pickSides', () => {
  it('uses right and left for cards side by side', () => {
    expect(pickSides({ x: 0, y: 0 }, { x: 320, y: 0 })).toEqual({ out: 'right', in: 'left' })
    expect(pickSides({ x: 320, y: 0 }, { x: 0, y: 0 })).toEqual({ out: 'left', in: 'right' })
  })

  it('uses bottom and top for cards in one column', () => {
    expect(pickSides({ x: 0, y: 0 }, { x: 0, y: 180 })).toEqual({ out: 'bottom', in: 'top' })
    expect(pickSides({ x: 0, y: 180 }, { x: 0, y: 0 })).toEqual({ out: 'top', in: 'bottom' })
  })
})

describe('planEdges', () => {
  it('keeps two connections between the same pair apart and parallel', () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 320, y: 0 } }
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
    const plans = planEdges({ a: { x: 0, y: 0 }, b: { x: 0, y: 180 } }, [{ id: 'e', from: 'a', to: 'b' }])
    expect(plans.get('e')?.a).toEqual({ x: CARD_WIDTH / 2, y: CARD_HEIGHT })
    expect(plans.get('e')?.b).toEqual({ x: CARD_WIDTH / 2, y: 180 })
  })
})

describe('routeConnection', () => {
  it('draws a plain curve when nothing is in the way', () => {
    const a = at(0, 0)
    const b = at(320, 0)
    const [plan] = [...planEdges({ a, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const route = routeConnection(plan!, [a, b], [a, b])
    expect(route.d).toContain('C')
    expect(route.runs).toBeUndefined()
  })

  it('goes around a card that sits between two others', () => {
    const a = at(0, 360)
    const middle = at(320, 180)
    const b = at(640, 0)
    const [plan] = [...planEdges({ a, middle, b }, [{ id: 'e', from: 'a', to: 'b' }]).values()]
    const cards = [a, middle, b]
    const direct = routeConnection(plan!, [a, b], [a, b])
    expect(hitsAnyCard(direct, [middle])).toBe(true)
    const route = routeConnection(plan!, cards, [a, b])
    expect(route.runs).toBeDefined()
    expect(hitsAnyCard(route, [middle])).toBe(false)
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
    const route = routeConnection(plan!, [a, b], [a, b])
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
  const routes = ends.map((e) => routeConnection(plans.get(e.id)!, [a, b], [a, b]))

  it('draw curves that stay visibly apart in the middle', () => {
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const p = routes[i]!.points[24]!
        const q = routes[j]!.points[24]!
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(30)
      }
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
