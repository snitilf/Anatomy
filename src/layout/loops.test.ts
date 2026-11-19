import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { autoLayout } from './autoLayout'

const size = () => ({ width: 240, height: 112 })

function make(parts: [id: string, group?: string][], links: [string, string][]): Board {
  const groups = [...new Set(parts.flatMap(([, g]) => (g ? [g] : [])))]
  return {
    groups: groups.map((id) => ({ id, label: id })),
    components: parts.map(([id, group]) => ({ id, label: id, summary: 's', ...(group ? { group } : {}), source: { kind: 'inferred' as const } })),
    relationships: links.map(([from, to], i) => ({ id: `r${i}`, from, to, label: 'uses', source: { kind: 'inferred' as const } })),
  } as unknown as Board
}

/** The column of each card, with and without the connection that closes the loop (the last one). */
const withAndWithout = (parts: [string, string?][], links: [string, string][]) => {
  const column = (b: Board) => {
    const at = autoLayout(b, size)
    return Object.fromEntries(b.components.map((c) => [c.id, (at[c.id] as { x: number }).x]))
  }
  return { loop: column(make(parts, links)), open: column(make(parts, links.slice(0, -1))) }
}

describe('a loop in the connections', () => {
  const cases: Record<string, [[string, string?][], [string, string][]]> = {
    'a loop of three': [[['a'], ['b'], ['c']], [['a', 'b'], ['b', 'c'], ['c', 'a']]],
    'a loop with a lead-in': [
      [['x'], ['ctx'], ['a'], ['b'], ['c'], ['d']],
      [['x', 'ctx'], ['ctx', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'ctx']],
    ],
    'a loop inside a group': [[['p', 'g'], ['q', 'g'], ['r', 'g'], ['s', 'g']], [['p', 'q'], ['q', 'r'], ['r', 's'], ['s', 'p']]],
    'a loop through the members of a group': [[['a'], ['b', 'g'], ['c', 'g']], [['a', 'b'], ['b', 'c'], ['c', 'a']]],
    'two groups with a loop between them': [[['a'], ['b', 'g1'], ['c', 'g2']], [['a', 'b'], ['b', 'c'], ['c', 'a']]],
  }
  for (const [name, [parts, links]] of Object.entries(cases)) {
    it(`places the cards of ${name} as it does without the closing connection`, () => {
      const { loop, open } = withAndWithout(parts, links)
      expect(loop).toEqual(open)
    })
  }

  it('keeps the groups and their cards in the order of the file when a loop closes through them', () => {
    const b = make([['start'], ['a', 'g1'], ['b', 'g1'], ['c', 'g2'], ['d', 'g2']], [['start', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'start']])
    const at = autoLayout(b, size) as Record<string, { x: number; y: number }>
    expect(at.start).toEqual({ x: 0, y: 0 })
    expect(at.a!.x).toBeLessThan(at.b!.x)
    expect(at.c!.x).toBeLessThan(at.d!.x)
    // The second group never sits before the first: it is lower, or further right.
    expect(at.c!.y > at.a!.y || at.c!.x > at.b!.x).toBe(true)
  })

  it('still lays a reply that comes back out in its own direction when it closes no loop', () => {
    const b = make([['a'], ['b']], [['b', 'a']])
    const at = autoLayout(b, size)
    expect(at.b!.x).toBeLessThan(at.a!.x)
  })

  it('does not change the layout of a board without a loop', () => {
    const diamond = make([['a'], ['b'], ['c'], ['d']], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']])
    const reply = make([['a'], ['b'], ['c']], [['a', 'b'], ['c', 'b'], ['c', 'a']])
    expect(autoLayout(diamond, size)).toEqual({ a: { x: 0, y: 0 }, b: { x: 0, y: 384 }, c: { x: 0, y: 208 }, d: { x: 368, y: 296 } })
    expect(autoLayout(reply, size)).toEqual({ a: { x: 0, y: 208 }, b: { x: 368, y: 257 }, c: { x: 0, y: 0 } })
  })
})
