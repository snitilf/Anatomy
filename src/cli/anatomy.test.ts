import { describe, expect, it } from 'vitest'
import { parseBoard } from '../board/validate'
import { LESSON_IDS } from '../lessons/ids'
import { runAnatomy } from './anatomy'
import { baseBoard, CORPUS, INVALID_CASES, memoryIo, runCase, VALID_CASES } from './corpus'

const examples = import.meta.glob(['../examples/*.board.json', '../../eval/tasks/*/board.json'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** The JSON parser's own words differ between Node versions, so the golden file leaves them out. */
const stable = (text: string) => text.replace(/(is not valid JSON: ).*/g, '$1<parser message>')

describe('the golden output', () => {
  it('matches corpus.golden.txt for every case', async () => {
    const sections = CORPUS.map((c) => {
      const result = runCase(c)
      return `## ${c.name}\n$ validate (exit ${result.code})\n${stable(result.stdout + result.stderr)}`
    })
    const json = ['base board', 'guarantee words', 'relationship to a misspelled component'].map((name) => {
      const result = runCase(CORPUS.find((c) => c.name === name)!, ['validate', '--json'])
      return `## ${name}\n$ validate --json (exit ${result.code})\n${result.stdout}`
    })
    await expect([...sections, ...json].join('\n')).toMatchFileSnapshot('./corpus.golden.txt')
  })
})

describe('validate', () => {
  it.each(Object.entries(examples))('passes %s with exit 0 and no warnings', (_path, text) => {
    const result = runAnatomy(['validate', 'board.json', '--strict'], memoryIo(new Map([['board.json', text]])))
    expect(result).toEqual({ code: 0, stdout: expect.stringMatching(/^board\.json: valid, revision \d+\n$/), stderr: '' })
  })

  it.each(VALID_CASES.map((c) => [c.name, c] as const))('exits 0 on the valid case "%s"', (_name, c) => {
    expect(runCase(c).code).toBe(0)
  })

  it.each(INVALID_CASES.map((c) => [c.name, c] as const))('exits 1 on the invalid case "%s" and prints every problem the app finds', (_name, c) => {
    const result = runCase(c)
    const app = parseBoard(c.text, { knownLessons: LESSON_IDS })
    expect(result.code).toBe(1)
    expect(app.ok).toBe(false)
    if (app.ok) return
    const lines = result.stdout.trimEnd().split('\n')
    expect(lines).toHaveLength(app.errors.length + 1)
    app.errors.forEach((e, i) => expect(lines[i + 1]).toContain(`${e.path || '(file)'}: ${e.message}`))
  })

  it('gives every problem in the corpus a code', () => {
    for (const c of CORPUS) {
      const report = JSON.parse(runCase(c, ['validate', '--json']).stdout) as { errors: { code?: string }[]; warnings: { code?: string }[] }
      for (const p of [...report.errors, ...report.warnings]) expect(p.code, c.name).toEqual(expect.any(String))
    }
  })

  it('exits 1 on warnings only with --strict', () => {
    const c = VALID_CASES.find((x) => x.name === 'part with no connection')!
    expect(runCase(c).code).toBe(0)
    expect(runCase(c, ['validate', '--strict']).code).toBe(1)
  })

  it('exits 2 when the file cannot be read', () => {
    const result = runAnatomy(['validate'], memoryIo(new Map()))
    expect(result).toEqual({ code: 2, stdout: '', stderr: 'Cannot read .anatomy/board.json: no such file.\n' })
  })

  it('reads the named file and the feedback next to it', () => {
    const board = { ...baseBoard(), revision: 4 }
    const feedback = JSON.stringify({ format: 'anatomy-feedback', id: 'f-1', boardId: 'shop', baseRevision: 3, items: [{ id: 'n-1' }], withdrawn: [] })
    const io = memoryIo(new Map([['work/draft.json', JSON.stringify(board)], ['work/feedback.json', feedback]]))
    expect(runAnatomy(['validate', 'work/draft.json'], io).stdout).toContain('does not answer feedback.json ("f-1", 1 item)')
  })

  it('prints one JSON object with --json', () => {
    const result = runCase(INVALID_CASES.find((c) => c.name === 'relationship to a misspelled component')!, ['validate', '--json'])
    expect(JSON.parse(result.stdout)).toEqual({
      file: '.anatomy/board.json',
      valid: false,
      errors: [{ path: 'relationships[2].to', code: 'unknown-component', message: expect.any(String), hint: 'Did you mean "payment"?' }],
      warnings: [],
    })
  })

  it('never writes', () => {
    for (const c of CORPUS) {
      const io = memoryIo(new Map([['.anatomy/board.json', c.text]]))
      runAnatomy(['validate'], io)
      expect(io.written).toEqual([])
    }
  })
})

describe('usage', () => {
  it('prints help with exit 0', () => {
    for (const args of [[], ['help'], ['--help'], ['validate', '-h']]) {
      const result = runAnatomy(args, memoryIo(new Map()))
      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/^Usage: node \.anatomy\/anatomy\.mjs <command>/)
    }
  })

  it('exits 2 on a wrong command or option', () => {
    expect(runAnatomy(['lint'], memoryIo(new Map())).stderr).toMatch(/^Unknown command "lint"\./)
    expect(runAnatomy(['validate', '--fix'], memoryIo(new Map())).code).toBe(2)
    expect(runAnatomy(['validate', 'a.json', 'b.json'], memoryIo(new Map())).stderr).toMatch(/^Give at most one file\./)
  })
})

describe('fmt', () => {
  const compact = JSON.stringify(baseBoard()).replace('{"format":"anatomy-board","schemaVersion":1,', '{"schemaVersion":1,"format":"anatomy-board",')

  it('writes the board in schema order with two spaces, then validates it', () => {
    const files = new Map([['.anatomy/board.json', compact]])
    const io = memoryIo(files)
    const result = runAnatomy(['fmt'], io)
    expect(result).toEqual({ code: 0, stdout: '.anatomy/board.json: formatted, valid, revision 3\n', stderr: '' })
    expect(io.written).toEqual(['.anatomy/board.json'])
    expect(files.get('.anatomy/board.json')).toBe(`${JSON.stringify(baseBoard(), null, 2)}\n`)
  })

  it('does not write a file that is already formatted, so the app does not reload it', () => {
    const files = new Map([['.anatomy/board.json', `${JSON.stringify(baseBoard(), null, 2)}\n`]])
    const io = memoryIo(files)
    expect(runAnatomy(['fmt'], io).stdout).toBe('.anatomy/board.json: already formatted, valid, revision 3\n')
    expect(io.written).toEqual([])
  })

  it('formats an invalid board and still reports its problems', () => {
    const broken = compact.replace('"to":"payment"', '"to":"paymnt"')
    const io = memoryIo(new Map([['.anatomy/board.json', broken]]))
    const result = runAnatomy(['fmt'], io)
    expect(result.code).toBe(1)
    expect(result.stdout).toMatch(/^\.anatomy\/board\.json: formatted, invalid, 1 error\n/)
    expect(io.written).toHaveLength(1)
  })

  it.each([
    ['text that is not JSON', '{ "format": '],
    ['a JSON file that is not a board', '{"version":"1.0.0","name":"shop"}'],
    ['a board of another schema version', JSON.stringify({ ...baseBoard(), schemaVersion: 2 })],
  ])('leaves %s alone', (_name, text) => {
    const io = memoryIo(new Map([['.anatomy/board.json', text]]))
    expect(runAnatomy(['fmt'], io).code).toBe(1)
    expect(io.written).toEqual([])
  })

  it('exits 2 when the write fails', () => {
    const io = memoryIo(new Map([['.anatomy/board.json', compact]]))
    io.write = () => {
      throw new Error('read-only file system')
    }
    expect(runAnatomy(['fmt'], io)).toEqual({ code: 2, stdout: '', stderr: 'Cannot write .anatomy/board.json: read-only file system.\n' })
  })
})
