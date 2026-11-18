import type { z } from 'zod'
import { BOARD_FORMAT, LIMITS, SCHEMA_VERSION, board as boardSchema, type Board } from './schema'

export interface BoardProblem {
  /** Where the problem is, for example `relationships[2].to`. Empty for the whole file. */
  path: string
  message: string
}

export type ParseResult =
  | { ok: true; board: Board; warnings: BoardProblem[] }
  | { ok: false; errors: BoardProblem[] }

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
    return fail('', `The file is ${formatBytes(bytes)}. The limit is ${formatBytes(LIMITS.fileBytes)}.`)
  }

  let data: unknown
  try {
    data = JSON.parse(fileText)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return fail('', `The file is not valid JSON: ${detail}`)
  }

  const headerProblem = checkHeader(data)
  if (headerProblem) return { ok: false, errors: [headerProblem] }

  const parsed = boardSchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, errors: limit(parsed.error.issues.map(fromIssue)) }
  }

  const errors = checkReferences(parsed.data)
  if (errors.length > 0) return { ok: false, errors: limit(errors) }

  return { ok: true, board: parsed.data, warnings: collectWarnings(parsed.data, options) }
}

/** Gives a clear message for files that are not boards, or boards from another version. */
function checkHeader(data: unknown): BoardProblem | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { path: '', message: 'A board file must contain one JSON object.' }
  }
  const record = data as Record<string, unknown>
  if (record.format !== BOARD_FORMAT) {
    return {
      path: 'format',
      message: `This is not an Anatomy board. Expected "format": "${BOARD_FORMAT}".`,
    }
  }
  if (record.schemaVersion !== SCHEMA_VERSION) {
    return {
      path: 'schemaVersion',
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
  const claim = (id: string, path: string) => {
    const first = owners.get(id)
    if (first === undefined) owners.set(id, path)
    else errors.push({ path, message: `The ID "${id}" is already used at ${first}. IDs must be unique.` })
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
  const isTarget = (id: string) => components.has(id) || relationships.has(id)

  board.components.forEach((c, i) => {
    if (c.group !== undefined && !groups.has(c.group)) {
      errors.push({
        path: `components[${i}].group`,
        message: `Component "${c.id}" is in group "${c.group}", which is not a group on this board.`,
      })
    }
  })

  board.relationships.forEach((r, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!components.has(r[end])) {
        errors.push({
          path: `relationships[${i}].${end}`,
          message: `Relationship "${r.id}" points ${end} "${r[end]}", which is not a component on this board.`,
        })
      }
    }
  })

  board.items.forEach((it, i) => {
    if (it.about !== undefined && !isTarget(it.about)) {
      errors.push({
        path: `items[${i}].about`,
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
          message: `The answer to "${r.feedbackId}" says it changed "${changedId}", which is not a component or relationship on this board.`,
        })
      }
    })
  })
  return warnings
}

function fromIssue(issue: z.core.$ZodIssue): BoardProblem {
  return { path: formatPath(issue.path), message: issue.message }
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((key, i) => (typeof key === 'number' ? `[${key}]` : i === 0 ? String(key) : `.${String(key)}`))
    .join('')
}

function fail(path: string, message: string): ParseResult {
  return { ok: false, errors: [{ path, message }] }
}

function limit(errors: BoardProblem[]): BoardProblem[] {
  if (errors.length <= MAX_REPORTED_ERRORS) return errors
  return [
    ...errors.slice(0, MAX_REPORTED_ERRORS),
    { path: '', message: `${errors.length - MAX_REPORTED_ERRORS} more problems are not shown.` },
  ]
}

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString('en-US')} bytes`
}
