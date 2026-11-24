import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { build, type Rolldown } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

const root = process.cwd()

/**
 * The most that the page may load at start, minified, before compression: the first script and every script it imports
 * statically, because a shared script the bundler splits off still loads before the first paint. It sits a little above
 * the size of today's build (about 1,003,000 bytes). `chunkSizeWarningLimit` in `vite.config.ts` warns on the first script alone.
 */
const FIRST_SCRIPT_BUDGET = 1_010_000

let entry: Rolldown.OutputChunk
let chunks: Rolldown.OutputChunk[]

beforeAll(async () => {
  // Vitest sets NODE_ENV to test, and React then ships its larger development build. The budget is for what the user gets.
  const before = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  let result: Rolldown.RolldownOutput | Rolldown.RolldownOutput[]
  try {
    result = (await build({ root, mode: 'production', logLevel: 'silent', build: { write: false } })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[]
  } finally {
    if (before === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = before
  }
  const outputs = Array.isArray(result) ? result : [result]
  chunks = outputs.flatMap((o) => o.output).filter((c): c is Rolldown.OutputChunk => c.type === 'chunk')
  const found = chunks.find((c) => c.isEntry)
  if (!found) throw new Error('The build has no entry chunk.')
  entry = found
}, 120_000)

/** Every script that the first script loads at start: its static imports, and theirs. */
function loadedAtStart(): Set<string> {
  const seen = new Set<string>()
  const walk = (chunk: Rolldown.OutputChunk) => {
    for (const name of chunk.imports) {
      if (seen.has(name)) continue
      seen.add(name)
      const next = chunks.find((c) => c.fileName === name)
      if (next) walk(next)
    }
  }
  walk(entry)
  return seen
}

/** The longest plain sentence of a board: a string that stays the same in minified code, and that no other file repeats. */
function marker(path: string): string {
  const strings: string[] = []
  JSON.parse(readFileSync(path, 'utf8'), (_key, value) => {
    if (typeof value === 'string' && /^[A-Za-z0-9 ,.'-]+$/.test(value)) strings.push(value)
    return value
  })
  return strings.sort((a, b) => b.length - a.length)[0]!
}

describe('the first script', () => {
  it('has none of the example boards in it', () => {
    const dir = join(root, 'src/examples')
    const files = readdirSync(dir).filter((f) => f.endsWith('.board.json'))
    expect(files.length).toBeGreaterThanOrEqual(3)
    for (const file of files) {
      const text = marker(join(dir, file))
      expect(text.length, file).toBeGreaterThan(60)
      expect(entry.code.includes(text), `${file} is in the first script`).toBe(false)
      // Each board is in a script of its own, so it loads when the user opens it.
      const own = chunks.find((c) => !c.isEntry && c.code.includes(text))
      expect(own, `${file} has a script of its own`).toBeDefined()
      expect(loadedAtStart().has(own!.fileName), `${file} loads at start`).toBe(false)
    }
  })

  it('has the map outlines of the examples in a script of its own, which loads after the first paint', () => {
    const file = join(root, 'src/app/exampleOutlines.generated.ts')
    // The longest packed line string of the first example: path text that minified code keeps as it is.
    const line = (readFileSync(file, 'utf8').match(/"M[^"]{40,}"/g) ?? []).sort((a, b) => b.length - a.length)[0]!.slice(1, 41)
    expect(line.length).toBe(40)
    expect(entry.code.includes(line), 'the outlines are in the first script').toBe(false)
    const own = chunks.find((c) => !c.isEntry && c.code.includes(line))
    expect(own, 'the outlines have a script of their own').toBeDefined()
    expect(loadedAtStart().has(own!.fileName), 'the outlines load at start').toBe(false)
  })

  it('has no part of the bundled command line tool in it', () => {
    // The usage line of its help text is only in the tool.
    const mark = '<command> [file] [options]'
    const tool = chunks.find((c) => !c.isEntry && c.code.includes(mark))
    expect(tool, 'the tool has a script of its own').toBeDefined()
    expect(entry.code.includes(mark)).toBe(false)
    expect(loadedAtStart().has(tool!.fileName), 'the first script loads the tool at start').toBe(false)
  })

  it('has no map in it: React Flow and the whiteboard tools load when a board opens', () => {
    const mark = 'react-flow__renderer'
    expect(entry.code.includes(mark)).toBe(false)
    const map = chunks.find((c) => !c.isEntry && c.code.includes(mark))
    expect(map, 'the map has a script of its own').toBeDefined()
    expect(loadedAtStart().has(map!.fileName), 'the map loads at start').toBe(false)
  })

  it('stays under its byte budget, with every script it loads at start', () => {
    const atStart = [...loadedAtStart()].map((name) => chunks.find((c) => c.fileName === name)).filter((c) => c !== undefined)
    const bytes = [entry, ...atStart].reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0)
    expect(bytes, `the page loads ${bytes} bytes of script at start`).toBeLessThanOrEqual(FIRST_SCRIPT_BUDGET)
  })
})
