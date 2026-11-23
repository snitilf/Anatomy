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
  /** The text of the authoring guide, for `topic`. Undefined in a copy of the tool built without it. */
  guide?(): string
  /** The field list, for `schema`. */
  schemaSheet?(): string
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
 * Characters that can move the cursor, clear the screen, hide text, or reorder it: the C0 and C1 controls, the line
 * and paragraph separators, the left-to-right and right-to-left marks, the bidirectional overrides, and the byte order mark. A board and a feedback file
 * are data from anywhere, so none of these reaches the terminal as it is.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

/** Characters the last pass escapes: `UNSAFE` without the tab and the newline, which text output needs. */
// eslint-disable-next-line no-control-regex
const NOT_FINAL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

/**
 * The last pass over everything the tool prints, whatever put it there: each remaining unsafe character becomes a
 * `\uXXXX` escape, which is also a valid escape inside a JSON string. `runAnatomy` applies it to every result, so no
 * path, argument, or message can reach the terminal with a control character.
 */
export function finalText(text: string): string {
  return text.replace(NOT_FINAL, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** What `UNSAFE` covers that JSON does not escape itself: everything but the C0 controls. */
const BEYOND_JSON = /[\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

const NAMED: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' }

/** `text` with each unsafe character written as an escape: `\n`, `\x1b`, or `\u202e`. */
export function safe(text: string): string {
  return text.replace(UNSAFE, (c) => NAMED[c] ?? (c.charCodeAt(0) < 256 ? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}` : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`))
}

/** One line of JSON for `--json`. JSON escapes the C0 controls itself, and this escapes the rest of what `safe` covers. */
export function jsonLine(value: unknown, space?: number): string {
  return JSON.stringify(value, null, space).replace(BEYOND_JSON, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/**
 * Cuts long quoted values to `"start…" (N characters)`, then cuts the text itself if it is still too long.
 * Characters are Unicode code points.
 */
export function clip(text: string): string {
  // Quotes pair up from the left, so text between two quoted values is never taken for a value.
  const quoted = safe(text).replace(/"([^"]*)"/g, (match, value: string) => {
    const cut = head(value, MAX_QUOTED)
    return cut === undefined ? match : `"${cut.start}" (${cut.length.toLocaleString('en-US')} characters)`
  })
  const cut = head(quoted, MAX_LINE)
  return cut === undefined ? quoted : cut.start
}

/** A text, cut at `max` characters and with the control characters escaped, for a printed line. `quote` wraps it in quotes. */
export function shown(text: string, max: number, quote = false): string {
  const whole = safe(text)
  const cut = head(whole, max)
  const body = cut === undefined ? whole : cut.start
  const out = quote ? `"${body.replace(/"/g, '\\"')}"` : body
  return cut === undefined ? out : `${out} (${cut.length.toLocaleString('en-US')} characters)`
}

/** `text` cut at `max` characters, with "…" at the end when it was cut. For `--json`, where `jsonLine` does the escaping. */
export function cutText(text: string, max: number): string {
  return head(text, max)?.start ?? text
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

