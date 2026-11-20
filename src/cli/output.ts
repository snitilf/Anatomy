import type { BoardProblem } from '../board/validate.ts'

// What every command of the `anatomy` tool shares: the file system it is given, the shape of a result, and the way
// a printed line is cut so one huge key or ID cannot flood the output.

export type ReadResult = { ok: true; text: string } | { ok: false; missing: boolean; reason: string }

export interface CliIo {
  /** The board file when the command names none. */
  defaultBoard: string
  /** How the user starts the tool, for the help text, for example `node .anatomy/anatomy.mjs`. */
  invocation: string
  read(path: string): ReadResult
  /** What was piped in, up to the size cap of a patch. Only `apply` reads it. */
  stdin(): ReadResult
  /** Replaces the whole file. Throws when it cannot. With `create`, a file that does not exist yet is made. */
  write(path: string, text: string, options?: { create?: boolean }): void
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

/** Quoted values longer than this are cut in printed lines, so one huge key or ID cannot flood the output. */
const MAX_QUOTED = 80
/** No printed line is longer than this. */
const MAX_LINE = 1000
/** Warnings past this many are counted, not listed, as the app does with errors. */
export const MAX_WARNINGS = 25

/**
 * `text` cut to `max` characters with "…" as the last one, or undefined when it fits. Counts code points, so an emoji
 * stays whole, and a cut text fits, so cutting twice changes nothing.
 */
function head(text: string, max: number): { start: string; length: number } | undefined {
  if (text.length <= max) return undefined
  const points = Array.from(text)
  return points.length <= max ? undefined : { start: `${points.slice(0, max - 1).join('')}…`, length: points.length }
}

/**
 * Cuts long quoted values to `"start…" (N characters)`, then cuts the text itself if it is still too long.
 * Characters are Unicode code points.
 */
export function clip(text: string): string {
  // Quotes pair up from the left, so text between two quoted values is never taken for a value.
  const quoted = text.replace(/"([^"]*)"/g, (match, value: string) => {
    const cut = head(value, MAX_QUOTED)
    return cut === undefined ? match : `"${cut.start}" (${cut.length.toLocaleString('en-US')} characters)`
  })
  const cut = head(quoted, MAX_LINE)
  return cut === undefined ? quoted : cut.start
}

export function line(problem: BoardProblem): string {
  const where = problem.path === '' ? '(file)' : problem.path
  if (problem.hint === undefined) return clip(`${where}: ${problem.message}`)
  const stop = /[.?!]$/.test(problem.message) ? '' : '.'
  return clip(`${where}: ${problem.message}${stop} ${problem.hint}`)
}

export function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** A problem for --json, cut like a printed line. */
export function plain(problem: BoardProblem) {
  const { path, code } = problem
  const message = clip(problem.message)
  return problem.hint === undefined ? { path, code, message } : { path, code, message, hint: clip(problem.hint) }
}

