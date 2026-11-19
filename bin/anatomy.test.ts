import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import script from 'virtual:anatomy-cli'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseBoard } from '../src/board/validate.ts'
import { runAnatomy } from '../src/cli/anatomy.ts'
import { CORPUS, memoryIo, type CorpusCase } from '../src/cli/corpus.ts'
import { keepScript, SCRIPT_BANNER, SCRIPT_MARK } from '../src/cli/script.ts'
import { LESSON_IDS } from '../src/lessons/ids.ts'

// These tests run the file the app writes, `.anatomy/anatomy.mjs`, in a real Node process, the way an agent does.
// They prove that the bundle and the app's own `parseBoard` agree on every board in the corpus and the repository.

const run = promisify(execFile)

// Vitest runs from the repository root.
const boardsIn = (folder: string, match: (name: string) => boolean): CorpusCase[] =>
  readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter(match)
    .sort()
    .map((name) => ({ name: `${folder}${name}`, text: readFileSync(join(folder, name), 'utf8') }))

/** The corpus, and every board file in the repository. */
const cases: CorpusCase[] = [
  ...CORPUS,
  ...boardsIn('src/examples/', (name) => name.endsWith('.board.json')),
  ...boardsIn('e2e/fixtures/', (name) => name.endsWith('.board.json')),
  ...boardsIn('eval/tasks/', (name) => name.endsWith('/board.json')),
]

let root = ''
let tool = ''

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'anatomy-cli-'))
  mkdirSync(join(root, '.anatomy'))
  tool = join(root, '.anatomy', 'anatomy.mjs')
  writeFileSync(tool, script)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Runs the bundled tool. A non-zero exit is a result here, not a failure. */
async function node(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [tool, ...args], { cwd })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string }
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
  }
}

/** Runs one case in its own folder, with the bundle and in this process, in the same mode. */
async function both(c: CorpusCase, index: number, args: string[]) {
  const dir = join(root, `case-${index}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'board.json'), c.text)
  if (c.feedback !== undefined) writeFileSync(join(dir, 'feedback.json'), c.feedback)
  const files = new Map([['board.json', c.text]])
  if (c.feedback !== undefined) files.set('feedback.json', c.feedback)
  const local = runAnatomy([...args, 'board.json'], memoryIo(files))
  return { bundled: await node([...args, 'board.json'], dir), local }
}

/** Runs the cases a few at a time. */
async function eachCase<T>(work: (c: CorpusCase, i: number) => Promise<T>): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < cases.length; i += 8) results.push(...(await Promise.all(cases.slice(i, i + 8).map((c, j) => work(c, i + j)))))
  return results
}

describe('the bundled tool', () => {
  it('starts with the banner and carries no source maps', () => {
    expect(script.startsWith(`${SCRIPT_BANNER}`)).toBe(true)
    expect(script.split('\n')[0]).toBe(SCRIPT_MARK)
    expect(script).not.toMatch(/sourceMappingURL/)
  })

  it('imports only the file system and path modules of Node', () => {
    const imports = [...script.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1]).sort()
    expect(imports).toEqual(['node:fs', 'node:path', 'node:url'])
    expect(script).not.toMatch(/\bimport\s*\(|\brequire\s*\(|child_process|node:(?:http|https|net|dgram|tls|dns|worker_threads|vm)|\bfetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(/)
  })

  it('stays small', () => {
    expect(script.length).toBeLessThan(150_000)
  })

  it('agrees with the app on every board, in text and in JSON', async () => {
    const results = await eachCase(async (c, i) => ({ c, text: await both(c, i, ['validate']), json: await both(c, i, ['validate', '--json']) }))
    for (const { c, text, json } of results) {
      expect(text.bundled, c.name).toEqual(text.local)
      expect(json.bundled, c.name).toEqual(json.local)
      const report = JSON.parse(json.bundled.stdout) as { valid: boolean; errors: { path: string; message: string }[]; warnings: { path: string; message: string }[] }
      const app = parseBoard(c.text, { knownLessons: LESSON_IDS })
      const pick = (list: { path: string; message: string }[]) => list.map(({ path, message }) => ({ path, message }))
      expect(report.valid, c.name).toBe(app.ok)
      if (app.ok) expect(pick(report.warnings).slice(0, app.warnings.length), c.name).toEqual(pick(app.warnings))
      else expect(pick(report.errors), c.name).toEqual(pick(app.errors))
    }
  })

  it('finds .anatomy/board.json next to itself, from any folder', async () => {
    const board = CORPUS.find((c) => c.name === 'relationship to a misspelled component')!
    writeFileSync(join(root, '.anatomy', 'board.json'), board.text)
    const fromProject = await node(['validate'], root)
    expect(fromProject.code).toBe(1)
    expect(fromProject.stdout).toMatch(/^\.anatomy\/board\.json: invalid, 1 error\nrelationships\[2\]\.to: .* Did you mean "payment"\?\n$/)
    const fromInside = await node(['validate'], join(root, '.anatomy'))
    expect(fromInside.stdout).toMatch(/^board\.json: invalid/)
    expect((await node(['help'], root)).stdout).toMatch(/^Usage: node \.anatomy\/anatomy\.mjs /)
  })

  it('exits 2 when the board is missing', async () => {
    const dir = join(root, 'empty')
    mkdirSync(join(dir, '.anatomy'), { recursive: true })
    expect(await node(['validate', '.anatomy/board.json'], dir)).toEqual({ code: 2, stdout: '', stderr: 'Cannot read .anatomy/board.json: no such file.\n' })
  })

  it('formats in place and leaves no temporary file', async () => {
    const dir = join(root, 'fmt')
    mkdirSync(dir)
    const base = CORPUS.find((c) => c.name === 'base board')!
    writeFileSync(join(dir, 'board.json'), JSON.stringify(JSON.parse(base.text)))
    const result = await node(['fmt', 'board.json'], dir)
    expect(result).toEqual({ code: 0, stdout: 'board.json: formatted, valid, revision 3\n', stderr: '' })
    expect(readFileSync(join(dir, 'board.json'), 'utf8')).toBe(base.text)
    expect(readdirSync(dir)).toEqual(['board.json'])
  })
})

describe('keepScript', () => {
  it('replaces an older Anatomy script and keeps a script the user took over', () => {
    expect(keepScript(script, script)).toBe(true)
    expect(keepScript(`${SCRIPT_MARK}\nold code`, script)).toBe(false)
    expect(keepScript('// my own version\ncode', script)).toBe(true)
  })
})
