import type { Board } from './schema.ts'
import { nearest } from './suggest.ts'
import type { BoardProblem } from './validate.ts'

// Warnings about a valid board that the schema cannot express. The `anatomy` command line tool prints them, so an
// agent can fix them before it hands the board over. The app does not show them: the board opens either way.
// Each rule must stay quiet on the bundled example boards, so a warning always points at a likely mistake.

/** Warnings past this many are not listed, so they get no hint. The tool lists at most 25. */
const HINT_LIMIT = 25

/** The parts of `.anatomy/feedback.json` that the checks need. */
export interface FeedbackSummary {
  id: string
  boardId: string
  baseRevision: number
  items: string[]
  withdrawn: string[]
}

/** Reads the parts of a feedback file that the checks need. Undefined when the text is not a feedback file. */
export function readFeedback(text: string): FeedbackSummary | undefined {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return undefined
  }
  if (data === null || typeof data !== 'object') return undefined
  const record = data as Record<string, unknown>
  const strings = (value: unknown) => (Array.isArray(value) && value.every((x) => typeof x === 'string') ? (value as string[]) : undefined)
  const items = Array.isArray(record.items) ? record.items.map((item: unknown) => (item !== null && typeof item === 'object' ? (item as Record<string, unknown>).id : undefined)) : undefined
  const itemIds = strings(items)
  const withdrawn = record.withdrawn === undefined ? [] : strings(record.withdrawn)
  if (record.format !== 'anatomy-feedback' || typeof record.id !== 'string' || typeof record.boardId !== 'string') return undefined
  if (typeof record.baseRevision !== 'number' || itemIds === undefined || withdrawn === undefined) return undefined
  return { id: record.id, boardId: record.boardId, baseRevision: record.baseRevision, items: itemIds, withdrawn }
}

/**
 * Phrases that promise more than an explanation can know. Words that honest text uses often are left out:
 * "always", "secure", and "guarantees" ("TCP guarantees ordering" is a fact, not a promise).
 */
const GUARANTEE = /(?<![\w-])(never fails?|cannot fail|can't fail|can never fail|foolproof|bulletproof|unbreakable|100% (?:secure|safe|reliable|uptime))(?![\w-])/i

/** The text fields that make claims. Items and answers are left out, because a question may name a guarantee to ask about it. */
function claims(board: Board): [path: string, text: string][] {
  const out: [string, string][] = [
    ['title', board.title],
    ['goal', board.goal],
  ]
  board.scope.includes.forEach((t, i) => out.push([`scope.includes[${i}]`, t]))
  board.scope.excludes.forEach((t, i) => out.push([`scope.excludes[${i}]`, t]))
  board.groups.forEach((g, i) => {
    out.push([`groups[${i}].label`, g.label])
    if (g.description !== undefined) out.push([`groups[${i}].description`, g.description])
  })
  board.components.forEach((c, i) => {
    out.push([`components[${i}].label`, c.label], [`components[${i}].summary`, c.summary])
    if (c.explanation !== undefined) out.push([`components[${i}].explanation`, c.explanation])
    c.inputs.forEach((t, j) => out.push([`components[${i}].inputs[${j}]`, t]))
    c.outputs.forEach((t, j) => out.push([`components[${i}].outputs[${j}]`, t]))
  })
  board.relationships.forEach((r, i) => {
    out.push([`relationships[${i}].label`, r.label])
    if (r.explanation !== undefined) out.push([`relationships[${i}].explanation`, r.explanation])
  })
  board.scenarios.forEach((s, i) => {
    out.push([`scenarios[${i}].title`, s.title])
    if (s.summary !== undefined) out.push([`scenarios[${i}].summary`, s.summary])
    s.steps.forEach((step, j) => out.push([`scenarios[${i}].steps[${j}].caption`, step.caption]))
  })
  return out
}

function unconnected(board: Board): BoardProblem[] {
  if (board.components.length < 2) return []
  const linked = new Set(board.relationships.flatMap((r) => [r.from, r.to]))
  return board.components.flatMap((c, i) =>
    linked.has(c.id) ? [] : [{ path: `components[${i}]`, code: 'unconnected' as const, message: `Component "${c.id}" has no connection.` }],
  )
}

function guarantees(board: Board): BoardProblem[] {
  return claims(board).flatMap(([path, text]) => {
    const found = GUARANTEE.exec(text)
    if (!found) return []
    return [{ path, code: 'guarantee' as const, message: `"${found[0]}" promises a guarantee. Keep it only if the material states it.` }]
  })
}

function adoptedWithoutChanges(board: Board): BoardProblem[] {
  return (board.responses?.items ?? []).flatMap((r, i) =>
    r.status === 'adopted' && r.changed.length === 0
      ? [
          {
            path: `responses.items[${i}].changed`,
            code: 'adopted-without-changes' as const,
            message: `The answer to "${r.feedbackId}" is adopted but lists no changed IDs, so Anatomy keeps the user's mark on the map.`,
            hint: 'List the components and relationships you changed.',
          },
        ]
      : [],
  )
}

function feedbackAnswers(board: Board, feedback: FeedbackSummary): BoardProblem[] {
  if (feedback.boardId !== board.id) return []
  const responses = board.responses
  const base = feedback.baseRevision

  if (responses?.respondsTo !== feedback.id) {
    // The revision right after the feedback is the one that answers it. A later revision without answers is fine,
    // because Anatomy keeps the answers it already received.
    const shouldAnswer = board.revision === base + 1 || (responses !== undefined && board.revision > base)
    if (!shouldAnswer) return []
    return [
      {
        path: responses ? 'responses.respondsTo' : '',
        code: 'responds-to-other',
        message: `The board does not answer feedback.json ("${feedback.id}", ${feedback.items.length} ${feedback.items.length === 1 ? 'item' : 'items'}).`,
        hint: `Set responses.respondsTo to "${feedback.id}" and answer every item.`,
      },
    ]
  }

  const problems: BoardProblem[] = []
  if (board.revision <= base) {
    problems.push({
      path: 'revision',
      code: 'revision-not-raised',
      message: `The feedback was made on revision ${base}, so the answer must have a higher revision.`,
      hint: `Set revision to ${base + 1}.`,
    })
  }
  const withdrawn = new Set(feedback.withdrawn)
  const items = new Set(feedback.items)
  const answered = new Set(responses.items.map((r) => r.feedbackId))
  for (const id of feedback.items) {
    if (!withdrawn.has(id) && !answered.has(id)) {
      problems.push({ path: 'responses.items', code: 'unanswered-feedback', message: `Feedback item "${id}" has no answer.` })
    }
  }
  responses.items.forEach((r, i) => {
    const path = `responses.items[${i}].feedbackId`
    if (withdrawn.has(r.feedbackId)) {
      problems.push({ path, code: 'withdrawn-answered', message: `The user withdrew "${r.feedbackId}". Remove this answer.` })
    } else if (!items.has(r.feedbackId)) {
      // Only the warnings that are listed get a hint, so a huge feedback file stays fast.
      const near = problems.length < HINT_LIMIT ? nearest(r.feedbackId, items) : undefined
      problems.push({
        path,
        code: 'unknown-feedback-item',
        message: `"${r.feedbackId}" is not an item in feedback.json.`,
        ...(near === undefined ? {} : { hint: `Did you mean "${near}"?` }),
      })
    }
  })
  return problems
}

/**
 * Warnings about the answers to the feedback file next to the board, for a board that passed `parseBoard`. Pass
 * `'unreadable'` when the file exists but cannot be read. Callers list these first, because they are what a revision
 * is for.
 */
export function feedbackAdvice(board: Board, feedback: FeedbackSummary | 'unreadable' | undefined): BoardProblem[] {
  if (feedback === undefined) return []
  if (feedback === 'unreadable') {
    return [{ path: '', code: 'feedback-unreadable', message: 'feedback.json is not a feedback file, so the answers were not checked against it.' }]
  }
  return feedbackAnswers(board, feedback)
}

/** Connections named in the warning about missing explanations. The rest are counted. */
const EXPLAIN_NAMED = 3

/**
 * One warning for all connections that have no `explanation`, so a large board does not print a line for each.
 * Kept apart from `boardAdvice`, because the boards that the app bundles and the test boards were written without them.
 */
export function explanationAdvice(board: Board): BoardProblem[] {
  const bare = board.relationships.filter((r) => r.explanation === undefined).map((r) => r.id)
  if (bare.length === 0) return []
  const named = bare.slice(0, EXPLAIN_NAMED).join(', ')
  const rest = bare.length - EXPLAIN_NAMED
  return [
    {
      path: 'relationships',
      code: 'no-explanation',
      message: `${bare.length} ${bare.length === 1 ? 'connection has' : 'connections have'} no explanation: ${named}${rest > 0 ? `, and ${rest} more` : ''}.`,
      hint: 'Say in one or two sentences why each exists, in "explanation".',
    },
  ]
}

/** The other warnings for a board that passed `parseBoard`. */
export function boardAdvice(board: Board): BoardProblem[] {
  return [...unconnected(board), ...guarantees(board), ...adoptedWithoutChanges(board)]
}

/**
 * A warning when the revision is not above the revision of the last version seen, which `apply` keeps as
 * `board.prev.json`. `last` is undefined when there is no such version, and then there is nothing to compare.
 */
export function revisionAdvice(board: Board, last: { revision: number; file: string } | undefined): BoardProblem[] {
  if (last === undefined || board.revision > last.revision) return []
  return [
    {
      path: 'revision',
      code: 'revision-not-risen',
      message: `Revision ${board.revision} is not above revision ${last.revision} of the last version, ${last.file}.`,
      hint: 'Run fmt --bump.',
    },
  ]
}

/**
 * A notice for a first board that records no assumption and no unknown. Such a board was most likely written without
 * the question rounds, or with gaps filled silently. It is kept apart from `boardAdvice`, because a board made for a
 * test or a demo may have no open items on purpose.
 */
export function firstBoardAdvice(board: Board): BoardProblem[] {
  if (board.revision !== 1 || board.items.some((item) => item.kind === 'assumption' || item.kind === 'unknown')) return []
  return [
    {
      path: 'items',
      code: 'no-assumptions',
      message: 'This first board records no assumption or unknown.',
      hint: 'Record each assumption you made and each point you could not confirm as an item. See the ask topic.',
    },
  ]
}
