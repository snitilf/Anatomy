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

type Parts = [string, string?][]
type Links = [string, string][]

/** Where each card sits with and without the connection that closes the loop (the last one). */
const withAndWithout = (parts: Parts, links: Links) => ({
  loop: autoLayout(make(parts, links), size),
  open: autoLayout(make(parts, links.slice(0, -1)), size),
})
const columns = (at: Record<string, { x: number; y: number }>) => Object.fromEntries(Object.entries(at).map(([id, p]) => [id, p.x]))
const reading = (at: Record<string, { x: number; y: number }>) =>
  Object.entries(at)
    .sort(([, a], [, b]) => a.x - b.x || a.y - b.y)
    .map(([id]) => id)

const chain = (...ids: string[]): Links => ids.slice(1).map((id, i) => [ids[i] as string, id])

describe('a loop in the connections', () => {
  const cases: Record<string, [Parts, Links]> = {
    'a loop of three': [[['a'], ['b'], ['c']], [...chain('a', 'b', 'c'), ['c', 'a']]],
    'a loop with a lead-in': [[['x'], ['ctx'], ['a'], ['b'], ['c'], ['d']], [...chain('x', 'ctx', 'a', 'b', 'c', 'd'), ['d', 'ctx']]],
    'a loop inside a group': [[['p', 'g'], ['q', 'g'], ['r', 'g'], ['s', 'g']], [...chain('p', 'q', 'r', 's'), ['s', 'p']]],
    'a loop through a group and loose cards': [[['p', 'g'], ['q', 'g'], ['r', 'g'], ['s'], ['t']], [['s', 'p'], ...chain('p', 'q', 'r', 't'), ['t', 's']]],
    'two groups with a loop between them': [[['a'], ['b', 'g1'], ['c', 'g2'], ['d']], [...chain('a', 'b', 'c', 'd'), ['d', 'a']]],
    'a loop that returns to its second card': [[['a'], ['b'], ['c'], ['d'], ['e'], ['f']], [...chain('a', 'b', 'c', 'd', 'e', 'f'), ['f', 'b']]],
    'a loop with a fork before it': [
      [['a'], ['b'], ['c'], ['d'], ['e']],
      [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'e'], ['e', 'b']],
    ],
  }
  for (const [name, [parts, links]] of Object.entries(cases)) {
    it(`places the cards of ${name} in the same columns and order as without the closing connection`, () => {
      const { loop, open } = withAndWithout(parts, links)
      expect(columns(loop)).toEqual(columns(open))
      expect(reading(loop)).toEqual(reading(open))
    })
  }

  it('lays out loose cards and two groups of two with a loop back through them as it does without the loop', () => {
    // The shape of a prompt that feeds a memory, which two groups read and write before the memory is read again.
    const parts: Parts = [['x'], ['ctx'], ['a', 'g1'], ['b', 'g1'], ['c', 'g2'], ['d', 'g2']]
    const { loop, open } = withAndWithout(parts, [...chain('x', 'ctx', 'a', 'b', 'c', 'd'), ['d', 'ctx']])
    expect(loop).toEqual(open)
  })

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
    expect(autoLayout(diamond, size)).toEqual({ a: { x: 0, y: 0 }, b: { x: 0, y: 368 }, c: { x: 0, y: 192 }, d: { x: 352, y: 280 } })
    expect(autoLayout(reply, size)).toEqual({ a: { x: 0, y: 192 }, b: { x: 352, y: 192 }, c: { x: 0, y: 0 } })
  })
})
