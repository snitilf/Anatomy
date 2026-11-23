import type { z } from 'zod'
import { BOARD_FORMAT, LIMITS, SCHEMA_VERSION, board as boardSchema, type Board } from './schema.ts'
import { keysOf, schemaAt } from './shape.ts'
import { freeId, nearest, slugify } from './suggest.ts'

/**
 * A short, stable name for each kind of problem, for scripts and for the `anatomy` command line tool.
 * The app shows `message`; the code never changes when a message is reworded.
 */
export type ProblemCode =
  // The file
  | 'file-too-large'
  | 'not-json'
  | 'not-object'
  | 'not-board'
  | 'schema-version'
  // One field
  | 'missing'
  | 'wrong-type'
  | 'empty'
  | 'too-long'
  | 'too-few'
  | 'too-many'
  | 'out-of-range'
  | 'bad-id'
  | 'bad-value'
  | 'unknown-key'
  | 'needs-reference'
  | 'invalid'
  // Between fields
  | 'duplicate-id'
  | 'unknown-group'
  | 'unknown-component'
  | 'unknown-target'
  | 'more-problems'
  // Warnings. The board opens, but something is likely wrong.
  | 'unknown-lesson'
  | 'changed-not-on-board'
  // Advice, from `advice.ts`. Only the command line tool reports these.
  | 'unconnected'
  | 'guarantee'
  | 'adopted-without-changes'
  | 'unanswered-feedback'
  | 'unknown-feedback-item'
  | 'withdrawn-answered'
  | 'responds-to-other'
  | 'revision-not-raised'
  | 'revision-not-risen'
  | 'no-explanation'
  | 'feedback-unreadable'
  | 'no-assumptions'

export interface BoardProblem {
  /** Where the problem is, for example `relationships[2].to`. Empty for the whole file. */
  path: string
  message: string
  /** Set on every problem `parseBoard` reports. Problems from other readers, such as the layer, have none. */
  code?: ProblemCode
  /** A concrete fix when one can be computed, for example `Did you mean "payment"?`. */
  hint?: string
}

export type ParseResult =
  | { ok: true; board: Board; warnings: BoardProblem[] }
  | {
      ok: false
      /** At most 25 problems. When there are more, the last entry says how many are left out. */
      errors: BoardProblem[]
      /** How many problems the list leaves out. */
      omitted?: number
    }

const MAX_REPORTED_ERRORS = 25

/**
 * Parses and validates the text of a board file.
 *
 * Never throws for bad input. A failed result lists every problem found,
 * so the caller can keep the current board and show the list.
 */
export interface ParseOptions {
  /** Lesson IDs this app can show. A board that names another lesson still opens, with a warning. */
  knownLessons?: readonly string[]
}

export function parseBoard(fileText: string, options: ParseOptions = {}): ParseResult {
  // Some editors start a file with a byte order mark. JSON.parse rejects it.
  if (fileText.startsWith('\uFEFF')) fileText = fileText.slice(1)

  const bytes = new TextEncoder().encode(fileText).length
  if (bytes > LIMITS.fileBytes) {
    return fail('', 'file-too-large', boardTooLargeMessage(bytes))
  }

  let data: unknown
  try {
    data = JSON.parse(fileText)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return fail('', 'not-json', `The file is not valid JSON: ${detail}`)
  }

  const headerProblem = checkHeader(data)
  if (headerProblem) return { ok: false, errors: [headerProblem] }

  const parsed = boardSchema.safeParse(data)
  if (!parsed.success) {
    // Hints are computed only for the problems that are reported, so a file with thousands of problems stays fast.
    const ids = once(() => idsIn(data))
    const issues = parsed.error.issues
    return limit(issues.slice(0, MAX_REPORTED_ERRORS).map((issue) => fromIssue(issue, data, ids)), issues.length)
  }

  const errors = checkReferences(parsed.data)
  if (errors.length > 0) return limit(errors.slice(0, MAX_REPORTED_ERRORS), errors.length)

  return { ok: true, board: parsed.data, warnings: collectWarnings(parsed.data, options) }
}

/** Gives a clear message for files that are not boards, or boards from another version. */
function checkHeader(data: unknown): BoardProblem | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { path: '', code: 'not-object', message: 'A board file must contain one JSON object.' }
  }
  const record = data as Record<string, unknown>
  if (record.format !== BOARD_FORMAT) {
    return {
      path: 'format',
      code: 'not-board',
      message: `This is not an Anatomy board. Expected "format": "${BOARD_FORMAT}".`,
    }
  }
  if (record.schemaVersion !== SCHEMA_VERSION) {
    return {
      path: 'schemaVersion',
      code: 'schema-version',
      message: `This board uses schema version ${JSON.stringify(record.schemaVersion)}. This app supports version ${SCHEMA_VERSION}.`,
    }
  }
  return undefined
}

function checkReferences(board: Board): BoardProblem[] {
  const errors: BoardProblem[] = []

  // IDs are unique across the whole document, so a reference like `about`
  // or a scenario highlight always points at exactly one thing.
  const owners = new Map<string, string>()
  const allIds = new Set([board.id, ...[board.groups, board.components, board.relationships, board.items, board.scenarios].flatMap((list) => list.map((x) => x.id))])
  const claim = (id: string, path: string) => {
    const first = owners.get(id)
    if (first === undefined) owners.set(id, path)
    else
      errors.push({
        path,
        code: 'duplicate-id',
        message: `The ID "${id}" is already used at ${first}. IDs must be unique.`,
        hint: `Use a new ID, for example "${freeId(id, allIds, LIMITS.id)}".`,
      })
  }
  claim(board.id, 'id')
  board.groups.forEach((g, i) => claim(g.id, `groups[${i}].id`))
  board.components.forEach((c, i) => claim(c.id, `components[${i}].id`))
  board.relationships.forEach((r, i) => claim(r.id, `relationships[${i}].id`))
  board.items.forEach((it, i) => claim(it.id, `items[${i}].id`))
  board.scenarios.forEach((s, i) => claim(s.id, `scenarios[${i}].id`))

  const groups = new Set(board.groups.map((g) => g.id))
  const components = new Set(board.components.map((c) => c.id))
  const relationships = new Set(board.relationships.map((r) => r.id))
  const targets = new Set([...components, ...relationships])
  const isTarget = (id: string) => targets.has(id)
  // Only problems that will be reported get a hint.
  const didYouMean = (value: string, candidates: ReadonlySet<string>) => (errors.length < MAX_REPORTED_ERRORS ? hintFor(value, candidates) : {})

  board.components.forEach((c, i) => {
    if (c.group !== undefined && !groups.has(c.group)) {
      errors.push({
        path: `components[${i}].group`,
        code: 'unknown-group',
        ...didYouMean(c.group, groups),
        message: `Component "${c.id}" is in group "${c.group}", which is not a group on this board.`,
      })
    }
  })

  board.relationships.forEach((r, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!components.has(r[end])) {
        errors.push({
          path: `relationships[${i}].${end}`,
          code: 'unknown-component',
          ...didYouMean(r[end], components),
          message: `Relationship "${r.id}" points ${end} "${r[end]}", which is not a component on this board.`,
        })
      }
    }
  })

  board.items.forEach((it, i) => {
    if (it.about !== undefined && !isTarget(it.about)) {
      errors.push({
        path: `items[${i}].about`,
        code: 'unknown-target',
        ...didYouMean(it.about, targets),
        message: `The ${it.kind} "${it.id}" is about "${it.about}", which is not a component or relationship on this board.`,
      })
    }
  })

  board.scenarios.forEach((s, si) => {
    s.steps.forEach((step, ti) => {
      step.highlight.forEach((target, hi) => {
        if (!isTarget(target)) {
          errors.push({
            path: `scenarios[${si}].steps[${ti}].highlight[${hi}]`,
            code: 'unknown-target',
            ...didYouMean(target, targets),
            message: `Step ${ti + 1} of scenario "${s.id}" highlights "${target}", which is not a component or relationship on this board.`,
          })
        }
      })
    })
  })

  return errors
}

function collectWarnings(board: Board, options: ParseOptions): BoardProblem[] {
  const warnings: BoardProblem[] = []
  if (options.knownLessons) {
    const known = new Set(options.knownLessons)
    board.components.forEach((c, i) => {
      if (c.lesson !== undefined && !known.has(c.lesson)) {
        warnings.push({
          path: `components[${i}].lesson`,
          code: 'unknown-lesson',
          message: `Component "${c.id}" names the lesson "${c.lesson}", which this version of Anatomy does not have.`,
        })
      }
    })
  }
  const targets = new Set([...board.components.map((c) => c.id), ...board.relationships.map((r) => r.id)])
  board.responses?.items.forEach((r, i) => {
    r.changed.forEach((changedId, j) => {
      if (!targets.has(changedId)) {
        warnings.push({
          path: `responses.items[${i}].changed[${j}]`,
          code: 'changed-not-on-board',
          ...(warnings.length < MAX_REPORTED_ERRORS ? hintFor(changedId, targets) : {}),
          message: `The answer to "${r.feedbackId}" says it changed "${changedId}", which is not a component or relationship on this board.`,
        })
      }
    })
  })
  return warnings
}

/** A hint that names the nearest existing ID, when the value looks like a typo of one. */
function hintFor(value: string, candidates: ReadonlySet<string>): { hint?: string } {
  const near = nearest(value, candidates)
  return near === undefined ? {} : { hint: `Did you mean "${near}"?` }
}

function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let current = data
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    const record = current as Record<PropertyKey, unknown>
    current = Object.hasOwn(record, key) ? record[key] : undefined
  }
  return current
}

/** The IDs a board file declares, read from the raw JSON, for hints given before the schema passes. */
function idsIn(data: unknown): Set<string> {
  const ids = new Set<string>()
  if (data === null || typeof data !== 'object') return ids
  const record = data as Record<string, unknown>
  if (typeof record.id === 'string') ids.add(record.id)
  for (const list of ['groups', 'components', 'relationships', 'items', 'scenarios']) {
    const entries = Object.hasOwn(record, list) ? record[list] : undefined
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const id = entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>).id : undefined
      if (typeof id === 'string') ids.add(id)
    }
  }
  return ids
}

/** Computes a value on first use and keeps it. */
function once<T>(make: () => T): () => T {
  let made: { value: T } | undefined
  return () => (made ??= { value: make() }).value
}

function fromIssue(issue: z.core.$ZodIssue, data: unknown, ids: () => Set<string>): BoardProblem {
  const problem = { path: formatPath(issue.path), message: issue.message }
  const value = valueAt(data, issue.path)
  const withHint = (code: ProblemCode, hint?: string): BoardProblem => (hint === undefined ? { ...problem, code } : { ...problem, code, hint })
  switch (issue.code) {
    case 'invalid_type':
      return value === undefined ? withHint('missing', 'The field is missing.') : withHint('wrong-type')
    case 'too_big':
      if (issue.origin === 'string' && typeof value === 'string') return withHint('too-long', `It has ${value.trim().length}.`)
      if (issue.origin === 'array' && Array.isArray(value)) return withHint('too-many', `It has ${value.length}.`)
      return withHint('out-of-range')
    case 'too_small':
      if (issue.origin === 'string') return withHint('empty')
      if (issue.origin === 'array') return withHint('too-few')
      return withHint('out-of-range')
    case 'invalid_format': {
      const slug = typeof value === 'string' ? slugify(value).slice(0, LIMITS.id).replace(/-+$/, '') : ''
      if (slug === '') return withHint('bad-id')
      const taken = ids()
      return withHint('bad-id', `Try "${taken.has(slug) ? freeId(slug, taken, LIMITS.id) : slug}".`)
    }
    case 'invalid_value': {
      const near = typeof value === 'string' ? nearest(value, issue.values.map(String)) : undefined
      return withHint('bad-value', near === undefined ? undefined : `Did you mean "${near}"?`)
    }
    case 'unrecognized_keys': {
      const allowed = keysOf(schemaAt(issue.path))
      const fixes = issue.keys.flatMap((key) => {
        const near = nearest(key, allowed)
        return near === undefined ? [] : [{ key, near }]
      })
      const [only] = fixes
      if (fixes.length === 1 && only && issue.keys.length === 1) return withHint('unknown-key', `Did you mean "${only.near}"?`)
      return withHint('unknown-key', fixes.length === 0 ? undefined : `Did you mean ${fixes.map((f) => `"${f.near}" for "${f.key}"`).join(', ')}?`)
    }
    case 'custom':
      return withHint(issue.path.at(-1) === 'references' ? 'needs-reference' : 'invalid')
    default:
      return withHint('invalid')
  }
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((key, i) => (typeof key === 'number' ? `[${key}]` : i === 0 ? String(key) : `.${String(key)}`))
    .join('')
}

function fail(path: string, code: ProblemCode, message: string): ParseResult {
  return { ok: false, errors: [{ path, code, message }] }
}

/** The first problems of `total`, with a last entry that counts the rest. */
function limit(shown: BoardProblem[], total: number): ParseResult {
  const omitted = total - shown.length
  if (omitted <= 0) return { ok: false, errors: shown }
  return { ok: false, errors: [...shown, { path: '', code: 'more-problems', message: `${omitted} more problems are not shown.` }], omitted }
}

/** What the app says about a board file over the size limit. Needs only the size, so a caller can say it before reading the file. */
export function boardTooLargeMessage(bytes: number): string {
  return `The file is ${formatBytes(bytes)}. The limit is ${formatBytes(LIMITS.fileBytes)}.`
}

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString('en-US')} bytes`
}
