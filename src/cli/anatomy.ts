import { boardAdvice, feedbackAdvice, firstBoardAdvice, readFeedback } from '../board/advice.ts'
import { inSchemaOrder } from '../board/shape.ts'
import { parseBoard, type BoardProblem } from '../board/validate.ts'
import { editDistance } from '../board/suggest.ts'
import { LESSON_IDS } from '../lessons/ids.ts'
import { runApply, type ApplyOptions } from './applyCommand.ts'
import { clip, count, line, MAX_WARNINGS, plain, type CliIo, type CliResult } from './output.ts'
import { splitGuide, topicIndex, TOPICS } from './topics.ts'

export { clip }
export type { CliIo, CliResult, ReadResult } from './output.ts'

// The `anatomy` command line tool, without any file system access: the caller passes the files in and takes the output.
// `bin/anatomy.ts` connects it to Node, and the app ships the same code bundled as `.anatomy/anatomy.mjs`.
// It reads a board as data. It never runs anything from the board and never uses the network.

export function usage(invocation: string): string {
  return `Usage: ${invocation} <command> [file] [options]

Commands:
  validate [file]  Check a board the way Anatomy does. The file defaults to .anatomy/board.json.
  fmt [file]       Put the keys of a valid board in schema order and indent with two spaces.
  apply [patch|-]  Edit the board with a JSON list of operations (default .anatomy/patch.json, - is stdin).
  topic [name]     Print a topic of the authoring guide. Without a name, list the topics.
  schema           Print every field of a board with its limits.
  help             Show this text.

Options:
  --json         Print the result as one JSON object (validate, fmt, apply).
  --strict       Exit with 1 when there are warnings (validate, fmt).
  --base N       Stop unless the board is at revision N (apply).
  --cascade      Drop what refers to a removed part (apply).
  --dry-run      Print the changes and write nothing (apply).
  --board file   The board to edit (apply).

Exit codes: 0 valid or applied, 1 problems or patch not applied, 2 file not readable or wrong usage.
fmt and apply write the board. apply raises revision by one and keeps the old board as board.prev.json.
`
}

interface Options {
  command: 'validate' | 'fmt' | 'apply' | 'help'
  file: string | undefined
  json: boolean
  strict: boolean
  board: string | undefined
  base: number | undefined
  cascade: boolean
  dryRun: boolean
}

const APPLY_ONLY = ['--board', '--base', '--cascade', '--dry-run']

/** `topic [name]` and `schema`, which take no options. */
function parseText(command: 'topic' | 'schema', rest: readonly string[]): { command: 'topic' | 'schema' | 'help'; name: string | undefined } | string {
  if (rest.some((arg) => arg === '--help' || arg === '-h')) return { command: 'help', name: undefined }
  const option = rest.find((arg) => arg.startsWith('-'))
  if (option !== undefined) return `Unknown option "${option}".`
  if (command === 'schema' && rest.length > 0) return 'schema takes no file.'
  if (rest.length > 1) return 'Give at most one topic.'
  return { command, name: rest[0] }
}

function parseArgs(args: readonly string[]): Options | string {
  const [first, ...rest] = args
  const options: Options = { command: 'help', file: undefined, json: false, strict: false, board: undefined, base: undefined, cascade: false, dryRun: false }
  if (first === undefined || first === 'help' || first === '--help' || first === '-h') return options
  if (first !== 'validate' && first !== 'fmt' && first !== 'apply') return `Unknown command "${first}".`
  options.command = first
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    const [name, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined]
    if (APPLY_ONLY.includes(name) && first !== 'apply') return `"${name}" works only with apply.`
    if (arg === '--json') options.json = true
    else if (arg === '--strict') {
      if (first === 'apply') return '"--strict" works only with validate and fmt.'
      options.strict = true
    } else if (arg === '--cascade') options.cascade = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (name === '--board' || name === '--base') {
      const value = inline ?? rest[++i]
      if (value === undefined) return `"${name}" needs a value.`
      if (name === '--board') options.board = value
      else if (/^[1-9]\d{0,9}$/.test(value)) options.base = Number(value)
      else return '"--base" needs a revision, a whole number of 1 or more.'
    } else if (arg === '--help' || arg === '-h') return { ...options, command: 'help' }
    else if (arg.startsWith('-') && arg !== '-') return `Unknown option "${arg}".`
    else if (options.file !== undefined) return first === 'apply' ? 'Give at most one patch.' : 'Give at most one file.'
    else options.file = arg
  }
  return options
}

/** Prints one topic, or the list of topics. */
function runTopic(name: string | undefined, io: CliIo): CliResult {
  const guide = io.guide?.()
  if (guide === undefined) return { code: 2, stdout: '', stderr: 'This copy of the tool has no topics. Read the files in .anatomy/guide/ instead.\n' }
  if (name === undefined) {
    return { code: 0, stdout: `Print a topic with: ${io.invocation} topic <name>\nEach topic is also the file .anatomy/guide/<name>.md.\n\n${topicIndex()}\n`, stderr: '' }
  }
  const topic = splitGuide(guide).find((t) => t.name === name)
  if (topic !== undefined) return { code: 0, stdout: topic.text, stderr: '' }
  // The names are few and short, so a typo of two letters, such as "aks", still finds its topic.
  const near = name.length > 2 && name.length <= 40 ? TOPICS.map((t) => ({ name: t.name, d: editDistance(name, t.name, 2) })).filter((t) => t.d <= 2).sort((a, b) => a.d - b.d)[0]?.name : undefined
  const names = TOPICS.map((t) => t.name).join(', ')
  return { code: 2, stdout: '', stderr: `${clip(`Unknown topic "${name}".`)}${near === undefined ? '' : ` Did you mean "${near}"?`} Topics: ${names}.\n` }
}

export function runAnatomy(args: readonly string[], io: CliIo): CliResult {
  const [first, ...rest] = args
  if (first === 'topic' || first === 'schema') {
    const text = parseText(first, rest)
    if (typeof text === 'string') return { code: 2, stdout: '', stderr: `${text}\n\n${usage(io.invocation)}` }
    if (text.command === 'help') return { code: 0, stdout: usage(io.invocation), stderr: '' }
    if (text.command === 'topic') return runTopic(text.name, io)
    const sheet = io.schemaSheet?.()
    if (sheet === undefined) return { code: 2, stdout: '', stderr: 'This copy of the tool has no field list. Read .anatomy/board.schema.json instead.\n' }
    return { code: 0, stdout: sheet, stderr: '' }
  }
  const options = parseArgs(args)
  if (typeof options === 'string') return { code: 2, stdout: '', stderr: `${options}\n\n${usage(io.invocation)}` }
  if (options.command === 'help') return { code: 0, stdout: usage(io.invocation), stderr: '' }
  if (options.command === 'apply') {
    const apply: ApplyOptions = { patch: options.file, board: options.board, base: options.base, cascade: options.cascade, dryRun: options.dryRun, json: options.json }
    return runApply(apply, io)
  }

  const file = options.file ?? io.defaultBoard
  const shown = io.display(file)
  const read = io.read(file)
  if (!read.ok) return { code: 2, stdout: '', stderr: `Cannot read ${shown}: ${read.reason}.\n` }

  let text = read.text
  let formatted: boolean | undefined
  const result = parseBoard(text, { knownLessons: LESSON_IDS })
  // fmt writes only a valid board. The schema bounds its depth and its numbers, so the rewrite keeps every value.
  if (options.command === 'fmt' && result.ok) {
    const next = `${JSON.stringify(inSchemaOrder(JSON.parse(text.replace(/^\uFEFF/, ''))), null, 2)}\n`
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

  // Both lists hold real problems only. The counts of what they leave out are kept apart.
  let errors: BoardProblem[] = []
  let omittedErrors = 0
  let warnings: BoardProblem[] = []
  if (result.ok) {
    const feedbackPath = io.sibling(file, 'feedback.json')
    const feedbackFile = feedbackPath === file ? undefined : io.read(feedbackPath)
    const feedback = feedbackFile === undefined || (!feedbackFile.ok && feedbackFile.missing) ? undefined : feedbackFile.ok ? (readFeedback(feedbackFile.text) ?? 'unreadable') : 'unreadable'
    // Feedback warnings come first, so the cap below never hides them.
    warnings = [...feedbackAdvice(result.board, feedback), ...result.warnings, ...boardAdvice(result.board), ...firstBoardAdvice(result.board)]
  } else {
    errors = result.errors.filter((e) => e.code !== 'more-problems')
    omittedErrors = result.omitted ?? 0
  }

  const code = errors.length > 0 || (options.strict && warnings.length > 0) ? 1 : 0
  const warningCount = warnings.length
  const omittedWarnings = Math.max(0, warningCount - MAX_WARNINGS)
  warnings = warnings.slice(0, MAX_WARNINGS)
  if (options.json) {
    const report = {
      file: shown,
      valid: result.ok,
      ...(result.ok ? { revision: result.board.revision } : {}),
      ...(formatted === undefined ? {} : { formatted }),
      errors: errors.map(plain),
      omittedErrors,
      warnings: warnings.map(plain),
      omittedWarnings,
    }
    return { code, stdout: `${JSON.stringify(report)}\n`, stderr: '' }
  }

  const status: string[] = []
  if (formatted !== undefined) status.push(formatted ? 'formatted' : 'already formatted')
  if (result.ok) {
    status.push(`valid, revision ${result.board.revision}`)
    if (warningCount > 0) status.push(count(warningCount, 'warning'))
  } else {
    status.push(`invalid, ${count(errors.length + omittedErrors, 'error')}`)
  }
  const more = [
    ...(omittedErrors > 0 ? [`${omittedErrors} more errors are not shown.`] : []),
    ...(omittedWarnings > 0 ? [`${omittedWarnings} more warnings are not shown.`] : []),
  ]
  const lines = [`${shown}: ${status.join(', ')}`, ...[...errors, ...warnings].map(line), ...more]
  return { code, stdout: `${lines.join('\n')}\n`, stderr: '' }
}
