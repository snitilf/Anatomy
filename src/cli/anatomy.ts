import { boardAdvice, explanationAdvice, feedbackAdvice, firstBoardAdvice, readFeedback, revisionAdvice } from '../board/advice.ts'
import { inSchemaOrder } from '../board/shape.ts'
import { parseBoard, type BoardProblem } from '../board/validate.ts'
import { editDistance } from '../board/suggest.ts'
import { LESSON_IDS } from '../lessons/ids.ts'
import { runApply, type ApplyOptions } from './applyCommand.ts'
import { idsOn, makeId, previousName, revisionIn } from './ids.ts'
import { MAX_SHOW_IDS, runRead } from './readCommands.ts'
import { clip, count, finalText, jsonLine, line, MAX_WARNINGS, plain, safe, type CliIo, type CliResult } from './output.ts'
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
  fmt [file]       Put the keys of a valid board in schema order and indent with two spaces. With --bump, also raise revision by one.
  apply [patch|-]  Edit the board with a JSON list of operations (default .anatomy/patch.json, - is stdin).
  id <label>       Print an ID made from a label that no part of the board uses yet.
  feedback         List the open feedback items, one line each, with what a response needs.
  outline          List every part, connection, item, and scenario of the board, one line each.
  show <id...>     Print the full JSON of the parts, connections, items, groups, or scenarios you name.
  topic [name]     Print a topic of the authoring guide. Without a name, list the topics.
  schema           Print every field of a board with its limits.
  help             Show this text.

Options:
  --json         Print the result as one JSON object (validate, fmt, apply, feedback, outline, show).
  --bump         Raise revision by one, after a rewrite of the whole file (fmt).
  --strict       Exit with 1 when there are warnings (validate, fmt).
  --base N       Stop unless the board is at revision N (apply).
  --cascade      Drop what refers to a removed part (apply).
  --dry-run      Print the changes and write nothing (apply).
  --board file   The board to edit or read (apply, id, feedback, outline, show).

Exit codes: 0 valid or applied, 1 problems, patch not applied, or unknown ID, 2 file not readable or wrong usage.
fmt and apply write the board. apply raises revision by one and keeps the old board as board.prev.json.
apply gives an added item with no id one made from its label. validate warns when revision is not above the one in board.prev.json.
`
}

interface Options {
  command: 'validate' | 'fmt' | 'apply' | 'id' | 'feedback' | 'outline' | 'show' | 'help'
  file: string | undefined
  ids: string[]
  json: boolean
  strict: boolean
  board: string | undefined
  base: number | undefined
  cascade: boolean
  dryRun: boolean
  bump: boolean
}

const APPLY_ONLY = ['--base', '--cascade', '--dry-run']
const COMMANDS = ['validate', 'fmt', 'apply', 'id', 'feedback', 'outline', 'show']

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
  const options: Options = { command: 'help', file: undefined, ids: [], json: false, strict: false, board: undefined, base: undefined, cascade: false, dryRun: false, bump: false }
  if (first === undefined || first === 'help' || first === '--help' || first === '-h') return options
  if (!COMMANDS.includes(first)) return `Unknown command "${first}".`
  options.command = first as Options['command']
  const reads = first === 'feedback' || first === 'outline' || first === 'show'
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    const [name, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined]
    if (APPLY_ONLY.includes(name) && first !== 'apply') return `"${name}" works only with apply.`
    if (name === '--board' && first !== 'apply' && first !== 'id' && !reads) return '"--board" works only with apply, id, feedback, outline, and show.'
    if (arg === '--json') options.json = true
    else if (arg === '--strict') {
      if (first !== 'validate' && first !== 'fmt') return '"--strict" works only with validate and fmt.'
      options.strict = true
    } else if (arg === '--cascade') options.cascade = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--bump') {
      if (first !== 'fmt') return '"--bump" works only with fmt.'
      options.bump = true
    }
    else if (name === '--board' || name === '--base') {
      const value = inline ?? rest[++i]
      if (value === undefined) return `"${name}" needs a value.`
      if (name === '--board') options.board = value
      else if (/^[1-9]\d{0,9}$/.test(value)) options.base = Number(value)
      else return '"--base" needs a revision, a whole number of 1 or more.'
    } else if (arg === '--help' || arg === '-h') return { ...options, command: 'help' }
    else if (arg.startsWith('-') && arg !== '-') return `Unknown option "${arg}".`
    else if (first === 'show') options.ids.push(arg)
    else if (reads) return `${first} takes no file. Use --board to name the board.`
    else if (first === 'id' && options.file !== undefined) return 'Give one label. Put it in quotes if it has spaces.'
    else if (options.file !== undefined) return first === 'apply' ? 'Give at most one patch.' : 'Give at most one file.'
    else options.file = arg
  }
  if (first === 'id' && options.file === undefined) return 'id needs a label, for example: id "Payment step".'
  if (first === 'show' && options.ids.length === 0) return 'show needs at least one ID. Run outline to list them.'
  if (first === 'show' && options.ids.length > MAX_SHOW_IDS) return `Give at most ${MAX_SHOW_IDS} IDs.`
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

/** `id <label>`: an ID made from the label that nothing on the board uses. A board that does not exist yet uses none. */
function runId(label: string, boardFile: string | undefined, json: boolean, io: CliIo): CliResult {
  const file = boardFile ?? io.defaultBoard
  const read = io.read(file)
  let taken = new Set<string>()
  if (!read.ok && !read.missing) return { code: 2, stdout: '', stderr: `Cannot read ${io.display(file)}: ${read.reason}.\n` }
  if (read.ok) {
    try {
      const doc: unknown = JSON.parse(read.text.replace(/^\uFEFF/, ''))
      if (doc !== null && typeof doc === 'object' && !Array.isArray(doc)) taken = idsOn(doc as Record<string, unknown>)
    } catch {
      return { code: 2, stdout: '', stderr: `Cannot read ${io.display(file)}: it is not valid JSON.\n` }
    }
  }
  const id = makeId(label, taken)
  if (id === undefined) return { code: 2, stdout: '', stderr: `${clip(`${safe(JSON.stringify(label.slice(0, 80)))} has no letters or digits to make an ID from.`)} Use a-z and 0-9.\n` }
  return { code: 0, stdout: json ? `${jsonLine({ id })}\n` : `${id}\n`, stderr: '' }
}

export function runAnatomy(args: readonly string[], io: CliIo): CliResult {
  const result = runCommand(args, io)
  return { code: result.code, stdout: finalText(result.stdout), stderr: finalText(result.stderr) }
}

function runCommand(args: readonly string[], io: CliIo): CliResult {
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
  if (options.command === 'feedback' || options.command === 'outline' || options.command === 'show') {
    return runRead({ command: options.command, board: options.board, ids: options.ids, json: options.json }, io)
  }
  if (options.command === 'id') return runId(options.file ?? '', options.board, options.json, io)
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
  let bumped: { from: number; to: number } | undefined
  const result = parseBoard(text, { knownLessons: LESSON_IDS })
  // The last version seen is the one `apply` kept as board.prev.json.
  const lastFile = previousName(file)
  const lastText = result.ok ? io.read(io.sibling(file, lastFile)) : undefined
  const lastRevision = lastText?.ok ? revisionIn(lastText.text) : undefined
  let board = result.ok ? result.board : undefined
  // fmt writes only a valid board. The schema bounds its depth and its numbers, so the rewrite keeps every value.
  if (options.command === 'fmt' && result.ok) {
    const doc = JSON.parse(text.replace(/^\uFEFF/, '')) as Record<string, unknown>
    if (options.bump) {
      const from = result.board.revision
      const to = Math.max(from, lastRevision ?? 0) + 1
      if (!Number.isSafeInteger(to)) return { code: 2, stdout: '', stderr: `The revision ${from} cannot be raised.\n` }
      doc.revision = to
      bumped = { from, to }
      board = { ...result.board, revision: to }
    }
    const next = `${JSON.stringify(inSchemaOrder(doc), null, 2)}\n`
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
  if (result.ok && board !== undefined) {
    const feedbackPath = io.sibling(file, 'feedback.json')
    const feedbackFile = feedbackPath === file ? undefined : io.read(feedbackPath)
    const feedback = feedbackFile === undefined || (!feedbackFile.ok && feedbackFile.missing) ? undefined : feedbackFile.ok ? (readFeedback(feedbackFile.text) ?? 'unreadable') : 'unreadable'
    // Feedback warnings come first, so the cap below never hides them.
    warnings = [...feedbackAdvice(board, feedback), ...revisionAdvice(board, lastRevision === undefined ? undefined : { revision: lastRevision, file: lastFile }), ...result.warnings, ...boardAdvice(board), ...explanationAdvice(board), ...firstBoardAdvice(board)]
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
      ...(board === undefined ? {} : { revision: board.revision }),
      ...(formatted === undefined ? {} : { formatted }),
      ...(bumped === undefined ? {} : { bumped }),
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
    status.push(bumped === undefined ? `valid, revision ${result.board.revision}` : `valid, revision ${bumped.from} to ${bumped.to}`)
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
