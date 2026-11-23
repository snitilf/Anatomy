import type { Board } from '../board/schema'

/** Every board file the tests lay out: the examples, the browser test fixtures, and the routing fixtures. */
export const boardSources = {
  ...import.meta.glob('../../e2e/fixtures/*.board.json', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../examples/*.board.json', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../canvas/fixtures/*.board.json', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

/** The file name of a board source path. */
export const fileName = (path: string) => path.split('/').pop() as string

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
export function generatedBoard(seed: number): Board {
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

/** The number of generated boards the layout and routing tests run on. */
export const GENERATED_BOARDS = 150
