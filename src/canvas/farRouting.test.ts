import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { placeCards } from '../layout/cards'
import type { Point, Rect } from '../layout/geometry'
import { bundleGroups } from './bundles'
import { blocksOf, computeBundles } from './bundleRoutes'

const sources = {
  ...import.meta.glob('../../e2e/fixtures/*.board.json', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../examples/*.board.json', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('./fixtures/*.board.json', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

/** True when a straight run passes through the inside of a rectangle. */
function crossesInside(p: Point, q: Point, r: Rect): boolean {
  return Math.max(p.x, q.x) > r.x && Math.min(p.x, q.x) < r.x + r.width && Math.max(p.y, q.y) > r.y && Math.min(p.y, q.y) < r.y + r.height
}

describe('far view lines keep out of blocks', () => {
  const entries = Object.entries(sources)
  it('finds the test boards', () => expect(entries.length).toBeGreaterThanOrEqual(15))
  for (const [path, text] of entries) {
    it(`never runs a bundle through a block it does not join: ${path.split('/').pop()}`, () => {
      const parsed = parseBoard(text)
      if (!parsed.ok) return // a board with errors on purpose
      const board: Board = parsed.board
      const rects = placeCards(board, { positions: {}, sizes: {} })
      const blocks = blocksOf(board, rects)
      for (const b of computeBundles(board, rects, bundleGroups(board))) {
        for (let i = 1; i < b.points.length; i++) {
          for (const [id, r] of blocks) {
            if (id === b.a || id === b.b) continue
            expect(crossesInside(b.points[i - 1] as Point, b.points[i] as Point, r), `${b.id} crosses ${id}`).toBe(false)
          }
        }
      }
    })
  }
})

/** A small seeded generator, so a failing board is the same on every run. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A board of loose parts and groups of one to four parts, joined by random connections, some of them loops. */
function generated(seed: number): Board {
  const next = random(seed)
  const pick = (n: number) => Math.floor(next() * n)
  const groupCount = 1 + pick(5)
  const looseCount = pick(5)
  const components = [
    ...Array.from({ length: looseCount }, (_, i) => ({ id: `l${i}`, label: `Loose ${i}`, summary: 'A part.', source: { kind: 'agent-explanation' as const } })),
    ...Array.from({ length: groupCount }, (_, g) => Array.from({ length: 1 + pick(4) }, (_, i) => ({ id: `g${g}p${i}`, label: `Part ${g} ${i}`, summary: 'A part.', source: { kind: 'agent-explanation' as const }, group: `g${g}` }))).flat(),
  ]
  const relationships = Array.from({ length: components.length + pick(components.length + 1) }, (_, i) => ({
    id: `r${i}`,
    from: (components[pick(components.length)] as { id: string }).id,
    to: (components[pick(components.length)] as { id: string }).id,
    kind: 'sends-data-to' as const,
    label: `link ${i}`,
    source: { kind: 'agent-explanation' as const },
  })).filter((r) => r.from !== r.to)
  return {
    format: 'anatomy-board',
    schemaVersion: 1,
    revision: 1,
    goal: 'Generated.',
    scope: { includes: ['x'], excludes: [] },
    id: `gen-${seed}`,
    title: `gen-${seed}`,
    groups: Array.from({ length: groupCount }, (_, g) => ({ id: `g${g}`, label: `Group ${g}` })),
    components,
    relationships,
  } as unknown as Board
}

describe('far view lines keep out of blocks on generated boards', () => {
  it('holds for 150 boards of groups and loose parts, loops included', () => {
    const failures: string[] = []
    for (let seed = 1; seed <= 150; seed++) {
      const board = generated(seed)
      const rects = placeCards(board, { positions: {}, sizes: {} })
      const blocks = blocksOf(board, rects)
      for (const b of computeBundles(board, rects, bundleGroups(board))) {
        for (let i = 1; i < b.points.length; i++) {
          for (const [id, r] of blocks) {
            if (id === b.a || id === b.b) continue
            if (crossesInside(b.points[i - 1] as Point, b.points[i] as Point, r)) failures.push(`seed ${seed}: ${b.id} crosses ${id}`)
          }
        }
      }
    }
    expect(failures.slice(0, 10)).toEqual([])
  })
})
