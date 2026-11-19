import type { Board } from './schema.ts'
import { nearest } from './suggest.ts'
import type { BoardProblem } from './validate.ts'

// Warnings about a valid board that the schema cannot express. The `anatomy` command line tool prints them, so an
// agent can fix them before it hands the board over. The app does not show them: the board opens either way.
// Each rule must stay quiet on the bundled example boards, so a warning always points at a likely mistake.

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
    data = JSON.parse(text.replace(/^﻿/, ''))
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

/** Words that promise more than an explanation can know. "Always" and "secure" are left out: they are common in honest text. */
const GUARANTEE = /(?<![\w-])(guarantee[ds]?|never fails?|cannot fail|can't fail|can never fail|foolproof|bulletproof|unbreakable|100% (?:secure|safe|reliable|uptime))(?![\w-])/i

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
      const near = nearest(r.feedbackId, items)
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
 * Warnings for a board that passed `parseBoard`. Pass the feedback file next to the board when there is one, or
 * `'unreadable'` when it exists but cannot be read.
 */
export function boardAdvice(board: Board, feedback?: FeedbackSummary | 'unreadable'): BoardProblem[] {
  const problems = [...unconnected(board), ...guarantees(board), ...adoptedWithoutChanges(board)]
  if (feedback === 'unreadable') {
    problems.push({ path: '', code: 'feedback-unreadable', message: 'feedback.json is not a feedback file, so the answers were not checked against it.' })
  } else if (feedback !== undefined) {
    problems.push(...feedbackAnswers(board, feedback))
  }
  return problems
}
