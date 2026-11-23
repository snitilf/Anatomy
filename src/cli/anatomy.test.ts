import { fastestMs } from '../test/timing'
import { describe, expect, it } from 'vitest'
import { parseBoard } from '../board/validate'
import { LESSON_IDS } from '../lessons/ids'
import { clip, runAnatomy } from './anatomy'
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
    const real = app.errors.filter((e) => e.code !== 'more-problems')
    expect(lines).toHaveLength(real.length + 1 + (app.omitted ? 1 : 0))
    real.forEach((e, i) => expect(lines[i + 1]).toContain(clip(`${e.path || '(file)'}: ${e.message}`)))
    if (app.omitted) expect(lines.at(-1)).toBe(`${app.omitted} more errors are not shown.`)
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
      omittedErrors: 0,
      warnings: [],
      omittedWarnings: 0,
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

describe('long output', () => {
  it('cuts long quoted values and long lines', () => {
    expect(clip(`a: "${'x'.repeat(81)}" and "short"`)).toBe(`a: "${'x'.repeat(79)}…" (81 characters) and "short"`)
    expect(clip(`a: "${'x'.repeat(80)}"`)).toBe(`a: "${'x'.repeat(80)}"`)
    const once = clip(`a: "${'x'.repeat(900)}"`)
    expect(clip(once)).toBe(once)
    const between = `The ID "api" is already used. ${'Text between two values. '.repeat(5)}Use "api-2".`
    expect(clip(between)).toBe(between)
    expect(clip('y'.repeat(5000))).toBe(`${'y'.repeat(999)}…`)
  })

  it('cuts on whole characters and counts them, so an emoji is never split', () => {
    const emoji = '😀'.repeat(100)
    expect(clip(`a: "${emoji}"`)).toBe(`a: "${'😀'.repeat(79)}…" (100 characters)`)
    expect(clip(`a: "${'😀'.repeat(80)}"`)).toBe(`a: "${'😀'.repeat(80)}"`)
    expect(Array.from(clip('😀'.repeat(2000)))).toHaveLength(1000)
  })

  it('keeps every printed line short, whatever the board holds', () => {
    for (const c of CORPUS) {
      for (const text of runCase(c).stdout.split('\n')) expect(Array.from(text).length, c.name).toBeLessThanOrEqual(1000)
    }
  })

  it('lists at most 25 warnings and counts the rest', () => {
    const result = runCase(CORPUS.find((c) => c.name === 'more warnings than the report shows')!)
    const lines = result.stdout.trimEnd().split('\n')
    expect(lines[0]).toBe('.anatomy/board.json: valid, revision 4, 33 warnings')
    expect(lines).toHaveLength(27)
    expect(lines.at(-1)).toBe('8 more warnings are not shown.')
    const report = JSON.parse(runCase(CORPUS.find((c) => c.name === 'more warnings than the report shows')!, ['validate', '--json']).stdout) as { warnings: unknown[]; omittedWarnings: number }
    expect(report.warnings).toHaveLength(25)
    expect(report.omittedWarnings).toBe(8)
  })
})

describe('speed', () => {
  /** Distinct 64-character IDs that look random but are the same on every run (a seeded mulberry32 generator). */
  function ids(count: number, seed: number): string[] {
    let state = seed
    const next = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const letters = 'abcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from({ length: count }, () => Array.from({ length: 64 }, () => letters[Math.floor(next() * 36)]).join(''))
  }

  it('checks 300 unknown answers against 5,000 feedback items quickly', () => {
    const board = { ...baseBoard(), revision: 4, responses: { respondsTo: 'feedback-big', items: ids(300, 1).map((feedbackId) => ({ feedbackId, status: 'answered', text: 'Yes.' })) } }
    const feedback = { format: 'anatomy-feedback', schemaVersion: 1, id: 'feedback-big', boardId: 'shop', baseRevision: 3, items: ids(5000, 2).map((id) => ({ id, type: 'note' })), withdrawn: [] }
    const files = new Map([['.anatomy/board.json', JSON.stringify(board)], ['.anatomy/feedback.json', JSON.stringify(feedback)]])
    let result = runAnatomy(['validate', '--json'], memoryIo(files))
    expect(fastestMs(() => { result = runAnatomy(['validate', '--json'], memoryIo(files)) }, 3000, 5)).toBeLessThan(30_000)
    const report = JSON.parse(result.stdout) as { warnings: { code: string }[]; omittedWarnings: number }
    expect(report.warnings).toHaveLength(25)
    expect(report.warnings[0]?.code).toBe('unanswered-feedback')
    expect(report.omittedWarnings).toBe(5300 - 25)
  })

  it('suggests only for listed problems when hundreds of references are broken', () => {
    const board = baseBoard()
    const targets = ids(400, 3)
    board.scenarios[0].steps = Array.from({ length: 50 }, (_, i) => ({ caption: `Step ${i}.`, highlight: targets.slice(0, 30) }))
    const files = new Map([['.anatomy/board.json', JSON.stringify(board)]])
    let result = runAnatomy(['validate'], memoryIo(files))
    expect(fastestMs(() => { result = runAnatomy(['validate'], memoryIo(files)) }, 3000, 5)).toBeLessThan(30_000)
    expect(result.stdout.split('\n')[0]).toBe('.anatomy/board.json: invalid, 1500 errors')
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

describe('the first board notice', () => {
  const first = (items: unknown[]) => JSON.stringify({ ...baseBoard(), revision: 1, items })

  it('warns, without failing, on a revision 1 board with no assumption or unknown items', () => {
    const result = runAnatomy(['validate', 'board.json'], memoryIo(new Map([['board.json', first([])]])))
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/^board\.json: valid, revision 1, 1 warning\nitems: .*\bask\b.*\n$/)
    const json = JSON.parse(runAnatomy(['validate', 'board.json', '--json'], memoryIo(new Map([['board.json', first([])]]))).stdout) as { warnings: { code: string }[] }
    expect(json.warnings.map((w) => w.code)).toEqual(['no-assumptions'])
  })

  it('stays quiet once the board records an assumption', () => {
    const text = first([{ id: 'a-scope', kind: 'assumption', text: 'Only the order path.' }])
    expect(runAnatomy(['validate', 'board.json'], memoryIo(new Map([['board.json', text]]))).stdout).toBe('board.json: valid, revision 1\n')
  })
})

describe('help', () => {
  it('lists topic and schema next to the other commands', () => {
    const help = runAnatomy(['help'], memoryIo(new Map())).stdout
    for (const command of ['validate', 'fmt', 'apply', 'topic', 'schema', 'help']) expect(help).toMatch(new RegExp(`^  ${command}\\b`, 'm'))
    // topic and schema print plain text, so --json names the commands it works with.
    expect(help).toMatch(/^ {2}--json .*\(validate, fmt, apply\)\.$/m)
    expect(runAnatomy(['topic', '--json'], memoryIo(new Map())).code).toBe(2)
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

  it.each([
    ['an invalid board', compact.replace('"to":"payment"', '"to":"paymnt"')],
    ['a board whose numbers JSON cannot keep', compact.replace('"revision":3', '"revision":3,"big":1e400,"neg":-0,"huge":123456789012345678901234567890')],
    ['a board nested 200,000 levels deep', compact.replace('"revision":3', `"revision":3,"deep":${'['.repeat(200_000)}${']'.repeat(200_000)}`)],
    ['text that is not JSON', '{ "format": '],
    ['a JSON file that is not a board', '{"version":"1.0.0","name":"shop"}'],
    ['a board of another schema version', JSON.stringify({ ...baseBoard(), schemaVersion: 2 })],
  ])('leaves %s alone and reports its problems', (_name, text) => {
    const io = memoryIo(new Map([['.anatomy/board.json', text]]))
    const result = runAnatomy(['fmt'], io)
    expect(result.code).toBe(1)
    expect(result.stdout).toMatch(/^\.anatomy\/board\.json: invalid, /)
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
