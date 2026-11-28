import type { Board } from '../board/schema'
import { changedFields, diffBoards, type IdChanges } from './diff'
import type { Sent } from './model'

interface Delta {
  added: number
  changed: number
  removed: number
}

/** What a new revision did, in counts. Everything here comes from the two boards and the record of the last send. */
export interface RevisionSummary {
  revision: number
  /** The agent's answers to items the user sent. */
  answers: number
  parts: Delta
  connections: Delta
  /** The words of the board itself that changed: title, goal, scope. */
  boardFields: string[]
}

const NONE: Delta = { added: 0, changed: 0, removed: 0 }

const delta = (added: IdChanges, changed: IdChanges, removed: IdChanges, of: keyof IdChanges): Delta => ({
  added: added[of].length,
  changed: changed[of].length,
  removed: removed[of].length,
})

/**
 * The counts for the banner and the tab title.
 * `previous` is the revision before; without it there is nothing to compare, and only the answers count.
 * `feedback` is the record of what the user sent: an answer to anything else is not counted, because the app drops it too.
 * Without that record, every answer the agent wrote counts. A revision that does not rise has no new answers.
 */
export function revisionSummary(previous: Board | undefined, current: Board, feedback: Pick<Sent, 'items'> | undefined): RevisionSummary {
  const sentIds = feedback ? new Set(feedback.items.map((i) => i.id)) : undefined
  const rises = previous === undefined || current.revision > previous.revision
  const answers = rises ? (current.responses?.items ?? []).filter((r) => sentIds === undefined || sentIds.has(r.feedbackId)).length : 0
  if (!previous) return { revision: current.revision, answers, parts: NONE, connections: NONE, boardFields: [] }
  const diff = diffBoards(previous, current)
  return {
    revision: current.revision,
    answers,
    parts: delta(diff.added, diff.changed, diff.removed, 'components'),
    connections: delta(diff.added, diff.changed, diff.removed, 'relationships'),
    boardFields: changedFields(previous, current, { type: 'board' }),
  }
}

/** How many things the revision holds, for the count in the title of the tab. */
export function summaryTotal(s: RevisionSummary): number {
  const sum = (d: Delta) => d.added + d.changed + d.removed
  return s.answers + sum(s.parts) + sum(s.connections) + s.boardFields.length
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const list = (words: readonly string[]) => (words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`)

/** "Revision 2: 5 answers, 1 new part, 1 changed part." Nothing when the revision holds nothing to say. */
export function summaryLine(s: RevisionSummary): string | undefined {
  const clauses: string[] = []
  if (s.answers > 0) clauses.push(plural(s.answers, 'answer'))
  for (const [d, word] of [[s.parts, 'part'], [s.connections, 'connection']] as const) {
    if (d.added > 0) clauses.push(`${plural(d.added, `new ${word}`)}`)
    if (d.changed > 0) clauses.push(plural(d.changed, `changed ${word}`))
    if (d.removed > 0) clauses.push(plural(d.removed, `removed ${word}`))
  }
  if (s.boardFields.length > 0) clauses.push(`${list(s.boardFields)} changed`)
  return clauses.length === 0 ? undefined : `Revision ${s.revision}: ${clauses.join(', ')}.`
}
