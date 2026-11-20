import { execFile } from 'node:child_process'
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import script from 'virtual:anatomy-cli'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseBoard } from '../src/board/validate.ts'
import { clip, runAnatomy } from '../src/cli/anatomy.ts'
import { baseBoard, CORPUS, memoryIo, type CorpusCase } from '../src/cli/corpus.ts'
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
async function node(args: string[], cwd: string, nodeArgs: string[] = []): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [...nodeArgs, tool, ...args], { cwd, timeout: 20_000 })
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
    expect(SCRIPT_BANNER).toContain('/* eslint-disable */')
    expect(script.split('\n')[0]).toBe(SCRIPT_MARK)
    expect(script).not.toMatch(/sourceMappingURL/)
  })

  it('imports only the node:fs, node:path, and node:url modules', () => {
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
      const report = JSON.parse(json.bundled.stdout) as { valid: boolean; errors: { path: string; message: string }[]; omittedErrors: number; warnings: { path: string; message: string }[]; omittedWarnings: number }
      const app = parseBoard(c.text, { knownLessons: LESSON_IDS })
      // The tool cuts long quoted values, so the app side is cut the same way before the comparison.
      const pick = (list: { path: string; message: string; code?: string }[]) =>
        list.filter((p) => p.code !== 'more-problems').map(({ path, message }) => ({ path, message: clip(message) }))
      expect(report.valid, c.name).toBe(app.ok)
      if (app.ok) {
        // Feedback warnings come first, and the tool lists at most 25, so every app warning is there unless the list is cut.
        if (report.omittedWarnings === 0) expect(pick(report.warnings), c.name).toEqual(expect.arrayContaining(pick(app.warnings)))
      } else {
        expect(pick(report.errors), c.name).toEqual(pick(app.errors))
        expect(report.omittedErrors, c.name).toBe(app.omitted ?? 0)
      }
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

/** A Node --import file that counts every call to Function. With `block`, each call throws instead. */
function functionTrap(block: boolean): string {
  const file = join(root, `trap-${block ? 'block' : 'count'}.mjs`)
  writeFileSync(
    file,
    `const Original = globalThis.Function
let calls = 0
const handle = (run) => (...args) => { calls++; if (${block}) throw new Error('Function is blocked'); return run(...args) }
const trap = new Proxy(Original, { apply: handle((t, self, args) => Reflect.apply(t, self, args)), construct: handle((t, args, nt) => Reflect.construct(t, args, nt)) })
globalThis.Function = trap
Original.prototype.constructor = trap
process.on('exit', () => process.stderr.write('Function calls: ' + calls + '\\n'))
`,
  )
  return file
}

describe('what the bundled tool runs', () => {
  const board = () => CORPUS.find((c) => c.name === 'feedback partly answered, revision not raised')!

  it('never builds code with Function, on a valid board and on an invalid one', async () => {
    const dir = join(root, 'jit')
    mkdirSync(dir)
    const trap = functionTrap(false)
    writeFileSync(join(dir, 'board.json'), board().text)
    writeFileSync(join(dir, 'feedback.json'), board().feedback!)
    writeFileSync(join(dir, 'broken.json'), CORPUS.find((c) => c.name === 'several faults at once')!.text)
    for (const file of ['board.json', 'broken.json']) {
      const result = await node(['validate', file], dir, ['--import', trap])
      expect(result.stderr).toBe('Function calls: 0\n')
    }
  })

  it('prints the normal output when Function throws', async () => {
    const dir = join(root, 'no-function')
    mkdirSync(dir)
    writeFileSync(join(dir, 'board.json'), board().text)
    writeFileSync(join(dir, 'feedback.json'), board().feedback!)
    const normal = await node(['validate', 'board.json'], dir)
    const blocked = await node(['validate', 'board.json'], dir, ['--import', functionTrap(true)])
    expect(blocked.stdout).toBe(normal.stdout)
    expect(blocked.code).toBe(normal.code)
    expect(blocked.stderr).toBe('Function calls: 0\n')
  })
})

describe('files the bundled tool refuses', () => {
  it.each([
    ['a link to /dev/zero', (path: string) => symlinkSync('/dev/zero', path)],
    ['a folder', (path: string) => mkdirSync(path)],
  ])('does not read %s as the board or the feedback', async (_name, make) => {
    const dir = join(root, `refuse-${_name.replace(/\W+/g, '-')}`)
    mkdirSync(dir)
    make(join(dir, 'board.json'))
    const board = await node(['validate', 'board.json'], dir)
    expect(board.code).toBe(2)
    expect(board.stderr).toMatch(/^Cannot read board\.json: it is (not a regular file|a folder)\.\n$/)
    // Feedback that cannot be read only skips the feedback checks.
    rmSync(join(dir, 'board.json'), { recursive: true })
    writeFileSync(join(dir, 'board.json'), JSON.stringify({ ...baseBoard(), revision: 4 }))
    make(join(dir, 'feedback.json'))
    const feedback = await node(['validate', 'board.json'], dir)
    expect(feedback).toEqual({ code: 0, stdout: expect.stringContaining('feedback.json is not a feedback file'), stderr: '' })
  })
})

describe('fmt in the bundled tool', () => {
  const compact = JSON.stringify(baseBoard())
  const pretty = `${JSON.stringify(baseBoard(), null, 2)}\n`

  it('keeps the permissions of the board and leaves no temporary file', async () => {
    const dir = join(root, 'fmt-mode')
    mkdirSync(dir)
    writeFileSync(join(dir, 'board.json'), compact)
    chmodSync(join(dir, 'board.json'), 0o640)
    expect((await node(['fmt', 'board.json'], dir)).code).toBe(0)
    expect(statSync(join(dir, 'board.json')).mode & 0o777).toBe(0o640)
    expect(readFileSync(join(dir, 'board.json'), 'utf8')).toBe(pretty)
    expect(readdirSync(dir)).toEqual(['board.json'])
  })

  it('leaves a read-only board alone', async () => {
    const dir = join(root, 'fmt-read-only')
    mkdirSync(dir)
    writeFileSync(join(dir, 'board.json'), compact)
    chmodSync(join(dir, 'board.json'), 0o444)
    expect(await node(['fmt', 'board.json'], dir)).toEqual({ code: 2, stdout: '', stderr: 'Cannot write board.json: it is read-only.\n' })
    expect(readFileSync(join(dir, 'board.json'), 'utf8')).toBe(compact)
  })

  it('writes through a link to a file in the same folder and keeps the link', async () => {
    const dir = join(root, 'fmt-link-inside')
    mkdirSync(join(dir, 'boards'), { recursive: true })
    writeFileSync(join(dir, 'boards', 'shop.json'), compact)
    symlinkSync(join('boards', 'shop.json'), join(dir, 'board.json'))
    expect((await node(['fmt', 'board.json'], dir)).code).toBe(0)
    expect(lstatSync(join(dir, 'board.json')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(join(dir, 'board.json'))).toBe(join('boards', 'shop.json'))
    expect(readFileSync(join(dir, 'boards', 'shop.json'), 'utf8')).toBe(pretty)
  })

  it('refuses a link to a file outside the board folder', async () => {
    const dir = join(root, 'fmt-link-outside')
    mkdirSync(join(dir, 'project'), { recursive: true })
    writeFileSync(join(dir, 'elsewhere.json'), compact)
    symlinkSync(join('..', 'elsewhere.json'), join(dir, 'project', 'board.json'))
    expect(await node(['fmt', 'board.json'], join(dir, 'project'))).toEqual({ code: 2, stdout: '', stderr: 'Cannot write board.json: it is a link to a file outside its folder.\n' })
    expect(readFileSync(join(dir, 'elsewhere.json'), 'utf8')).toBe(compact)
  })

  it('never follows a link planted where a temporary file could go', async () => {
    const dir = join(root, 'fmt-planted')
    mkdirSync(dir)
    writeFileSync(join(dir, 'board.json'), compact)
    writeFileSync(join(dir, 'victim.txt'), 'keep me')
    // The names are random, so plant links for the ones a careless writer would use.
    for (const name of ['.board.json.tmp', `.board.json.${process.pid}.tmp`]) symlinkSync('victim.txt', join(dir, name))
    expect((await node(['fmt', 'board.json'], dir)).code).toBe(0)
    expect(readFileSync(join(dir, 'victim.txt'), 'utf8')).toBe('keep me')
    expect(readFileSync(join(dir, 'board.json'), 'utf8')).toBe(pretty)
  })
})

describe('keepScript', () => {
  it('replaces an older Anatomy script and keeps a script the user took over', () => {
    expect(keepScript(script, script)).toBe(true)
    expect(keepScript(`${SCRIPT_MARK}\nold code`, script)).toBe(false)
    expect(keepScript('// my own version\ncode', script)).toBe(true)
  })
})
