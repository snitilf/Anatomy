import { boardAdvice, readFeedback } from '../board/advice.ts'
import { inSchemaOrder } from '../board/shape.ts'
import { parseBoard, type BoardProblem, type ProblemCode } from '../board/validate.ts'
import { LESSON_IDS } from '../lessons/ids.ts'

// The `anatomy` command line tool, without any file system access: the caller passes the files in and takes the output.
// `bin/anatomy.ts` connects it to Node, and the app ships the same code bundled as `.anatomy/anatomy.mjs`.
// It reads a board as data. It never runs anything from the board and never uses the network.

export type ReadResult = { ok: true; text: string } | { ok: false; missing: boolean; reason: string }

export interface CliIo {
  /** The board file when the command names none. */
  defaultBoard: string
  /** How the user starts the tool, for the help text, for example `node .anatomy/anatomy.mjs`. */
  invocation: string
  read(path: string): ReadResult
  /** Replaces the whole file. Throws when it cannot. */
  write(path: string, text: string): void
  /** A file in the same folder as `path`. */
  sibling(path: string, name: string): string
  /** A short form of the path for messages. */
  display(path: string): string
}

export interface CliResult {
  /** 0: valid. 1: problems found. 2: a file could not be read or written, or the command was wrong. */
  code: 0 | 1 | 2
  stdout: string
  stderr: string
}

export function usage(invocation: string): string {
  return `Usage: ${invocation} <command> [file] [options]

Commands:
  validate [file]  Check a board the way Anatomy does. The file defaults to .anatomy/board.json.
  fmt [file]       Put the keys in schema order and indent with two spaces, then validate.
  help             Show this text.

Options:
  --json    Print the result as one JSON object.
  --strict  Exit with 1 when there are warnings.

Exit codes: 0 valid, 1 problems found, 2 file not readable or wrong usage.
It reads the board and the feedback.json next to it. Only fmt writes, and only to the board.
`
}

interface Options {
  command: 'validate' | 'fmt' | 'help'
  file: string | undefined
  json: boolean
  strict: boolean
}

function parseArgs(args: readonly string[]): Options | string {
  const [first, ...rest] = args
  if (first === undefined || first === 'help' || first === '--help' || first === '-h') return { command: 'help', file: undefined, json: false, strict: false }
  if (first !== 'validate' && first !== 'fmt') return `Unknown command "${first}".`
  const options: Options = { command: first, file: undefined, json: false, strict: false }
  for (const arg of rest) {
    if (arg === '--json') options.json = true
    else if (arg === '--strict') options.strict = true
    else if (arg === '--help' || arg === '-h') return { ...options, command: 'help' }
    else if (arg.startsWith('-')) return `Unknown option "${arg}".`
    else if (options.file !== undefined) return 'Give at most one file.'
    else options.file = arg
  }
  return options
}

/** Problems that mean the file is not a board at all, so fmt leaves it alone. */
const NOT_A_BOARD: ReadonlySet<ProblemCode | undefined> = new Set(['file-too-large', 'not-json', 'not-object', 'not-board', 'schema-version'])

function line(problem: BoardProblem): string {
  const where = problem.path === '' ? '(file)' : problem.path
  if (problem.hint === undefined) return `${where}: ${problem.message}`
  const stop = /[.?!]$/.test(problem.message) ? '' : '.'
  return `${where}: ${problem.message}${stop} ${problem.hint}`
}

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function plain(problem: BoardProblem) {
  const { path, code, message, hint } = problem
  return hint === undefined ? { path, code, message } : { path, code, message, hint }
}

export function runAnatomy(args: readonly string[], io: CliIo): CliResult {
  const options = parseArgs(args)
  if (typeof options === 'string') return { code: 2, stdout: '', stderr: `${options}\n\n${usage(io.invocation)}` }
  if (options.command === 'help') return { code: 0, stdout: usage(io.invocation), stderr: '' }

  const file = options.file ?? io.defaultBoard
  const shown = io.display(file)
  const read = io.read(file)
  if (!read.ok) return { code: 2, stdout: '', stderr: `Cannot read ${shown}: ${read.reason}.\n` }

  let text = read.text
  let formatted: boolean | undefined
  const result = parseBoard(text, { knownLessons: LESSON_IDS })
  if (options.command === 'fmt' && (result.ok || !result.errors.some((e) => NOT_A_BOARD.has(e.code)))) {
    const next = `${JSON.stringify(inSchemaOrder(JSON.parse(text.replace(/^﻿/, ''))), null, 2)}\n`
    formatted = next !== text
    if (formatted) {
      try {
        io.write(file, next)
      } catch (error) {
        return { code: 2, stdout: '', stderr: `Cannot write ${shown}: ${error instanceof Error ? error.message : String(error)}.\n` }
      }
      text = next
    }
  }

  let errors: BoardProblem[] = []
  let warnings: BoardProblem[] = []
  if (result.ok) {
    const feedbackPath = io.sibling(file, 'feedback.json')
    const feedbackFile = feedbackPath === file ? undefined : io.read(feedbackPath)
    const feedback = feedbackFile === undefined || (!feedbackFile.ok && feedbackFile.missing) ? undefined : feedbackFile.ok ? (readFeedback(feedbackFile.text) ?? 'unreadable') : 'unreadable'
    warnings = [...result.warnings, ...boardAdvice(result.board, feedback)]
  } else {
    errors = result.errors
  }

  const code = errors.length > 0 || (options.strict && warnings.length > 0) ? 1 : 0
  if (options.json) {
    const report = {
      file: shown,
      valid: result.ok,
      ...(result.ok ? { revision: result.board.revision } : {}),
      ...(formatted === undefined ? {} : { formatted }),
      errors: errors.map(plain),
      warnings: warnings.map(plain),
    }
    return { code, stdout: `${JSON.stringify(report)}\n`, stderr: '' }
  }

  const status: string[] = []
  if (formatted !== undefined) status.push(formatted ? 'formatted' : 'already formatted')
  if (result.ok) {
    status.push(`valid, revision ${result.board.revision}`)
    if (warnings.length > 0) status.push(count(warnings.length, 'warning'))
  } else {
    const more = errors.some((e) => e.code === 'more-problems')
    const real = errors.filter((e) => e.code !== 'more-problems').length
    status.push(more ? `invalid, more than ${real} errors` : `invalid, ${count(real, 'error')}`)
  }
  const lines = [`${shown}: ${status.join(', ')}`, ...[...errors, ...warnings].map(line)]
  return { code, stdout: `${lines.join('\n')}\n`, stderr: '' }
}
