import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { build, type Rolldown } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

const root = process.cwd()

/** The largest the script that the page loads first may be, minified, before compression. The build warning is at 800 kB; this is the line the work of C5 reached. */
const FIRST_SCRIPT_BUDGET = 1_200_000

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
    process.env.NODE_ENV = before
  }
  const outputs = Array.isArray(result) ? result : [result]
  chunks = outputs.flatMap((o) => o.output).filter((c): c is Rolldown.OutputChunk => c.type === 'chunk')
  const found = chunks.find((c) => c.isEntry)
  if (!found) throw new Error('The build has no entry chunk.')
  entry = found
}, 120_000)

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
      expect(chunks.some((c) => !c.isEntry && c.code.includes(text)), `${file} has a script of its own`).toBe(true)
    }
  })

  it('has no part of the bundled command line tool in it', () => {
    // The usage line of its help text is only in the tool.
    const mark = '<command> [file] [options]'
    const tool = chunks.find((c) => !c.isEntry && c.code.includes(mark))
    expect(tool, 'the tool has a script of its own').toBeDefined()
    expect(entry.code.includes(mark)).toBe(false)
    expect(entry.imports, 'the first script loads the tool at start').not.toContain(tool!.fileName)
  })

  it('stays under its byte budget', () => {
    const bytes = Buffer.byteLength(entry.code)
    expect(bytes, `the first script is ${bytes} bytes`).toBeLessThanOrEqual(FIRST_SCRIPT_BUDGET)
  })
})
