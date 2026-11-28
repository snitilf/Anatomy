import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { revisionSummary, summaryLine, summaryTotal, type RevisionSummary } from './revisionSummary'
import { allBoards, clone, urlShortenerBoard } from './testBoards'

const sent = (...ids: string[]) => ({ feedbackId: 'feedback-aaaaaa', baseRevision: 1, at: '2026-11-28T10:00:00.000Z', items: ids.map((id) => ({ id, fingerprint: 'f' })) })

/** The next revision: one part added, one changed, one removed, one connection changed, and `answers` answers. */
function revise(board: Board, answers: string[] = []): Board {
  const next = clone(board)
  next.revision += 1
  const removed = next.components[next.components.length - 1]!
  next.components = next.components.filter((c) => c !== removed)
  next.relationships = next.relationships.filter((r) => r.from !== removed.id && r.to !== removed.id)
  next.components[0]!.summary = `${next.components[0]!.summary} More.`
  next.components.push({ ...clone(next.components[1]!), id: 'brand-new', label: 'Brand new' })
  if (next.relationships[0]) next.relationships[0].label = `${next.relationships[0].label} again`
  if (answers.length > 0) next.responses = { respondsTo: 'feedback-aaaaaa', items: answers.map((feedbackId) => ({ feedbackId, status: 'answered' as const, text: 'Done.', changed: [] })) }
  return next
}

describe('revisionSummary', () => {
  it('counts what a revision added, changed, and removed, on every board', () => {
    for (const board of allBoards()) {
      const next = revise(board)
      const s = revisionSummary(board, next, undefined)
      expect(s.revision, board.id).toBe(board.revision + 1)
      expect(s.parts.added, board.id).toBe(1)
      expect(s.parts.removed, board.id).toBe(1)
      expect(s.parts.changed, board.id).toBeGreaterThanOrEqual(1)
      expect(s.connections.added, board.id).toBe(0)
      expect(s.boardFields, board.id).toEqual([])
    }
  })

  it('counts connections and the words of the board itself', () => {
    const board = urlShortenerBoard()
    const next = clone(board)
    next.revision = 2
    next.title = 'A new title'
    next.goal = 'A new goal.'
    next.relationships.push({ ...clone(next.relationships[0]!), id: 'extra-line', label: 'extra' })
    next.relationships[1]!.label = 'renamed'
    next.relationships = next.relationships.filter((r) => r.id !== board.relationships[2]!.id)
    const s = revisionSummary(board, next, undefined)
    expect(s.connections).toEqual({ added: 1, changed: 1, removed: 1 })
    expect(s.boardFields).toEqual(['title', 'goal'])
    expect(s.parts).toEqual({ added: 0, changed: 0, removed: 0 })
  })

  it('counts only the answers to what was sent', () => {
    const board = urlShortenerBoard()
    const next = revise(board, ['note-aaaaaa', 'note-bbbbbb', 'note-zzzzzz'])
    expect(revisionSummary(board, next, sent('note-aaaaaa', 'note-bbbbbb')).answers).toBe(2)
    expect(revisionSummary(board, next, sent()).answers).toBe(0)
    // With no record of a send, the answers the agent wrote are all that is known.
    expect(revisionSummary(board, next, undefined).answers).toBe(3)
    expect(revisionSummary(board, revise(board), sent('note-aaaaaa')).answers).toBe(0)
  })

  it('has no changes to count without a revision before it, and no answers when the revision did not rise', () => {
    const board = urlShortenerBoard()
    const s = revisionSummary(undefined, revise(board), undefined)
    expect(summaryTotal(s)).toBe(0)
    const same = clone(board)
    same.responses = { respondsTo: 'feedback-aaaaaa', items: [{ feedbackId: 'note-aaaaaa', status: 'answered', text: 'Done.', changed: [] }] }
    expect(revisionSummary(board, same, sent('note-aaaaaa')).answers).toBe(0)
  })
})

describe('summaryLine', () => {
  const none = { added: 0, changed: 0, removed: 0 }
  const make = (over: Partial<RevisionSummary>): RevisionSummary => ({ revision: 2, answers: 0, parts: none, connections: none, boardFields: [], ...over })

  it('says what arrived in one sentence, answers first', () => {
    expect(summaryLine(make({ answers: 5, parts: { added: 1, changed: 1, removed: 0 } }))).toBe('Revision 2: 5 answers, 1 new part, 1 changed part.')
  })

  it('uses the singular for one and the plural for the rest, up to 99', () => {
    expect(summaryLine(make({ answers: 1 }))).toBe('Revision 2: 1 answer.')
    expect(summaryLine(make({ answers: 99, parts: { added: 99, changed: 0, removed: 0 } }))).toBe('Revision 2: 99 answers, 99 new parts.')
    expect(summaryLine(make({ parts: { added: 0, changed: 0, removed: 1 }, connections: { added: 2, changed: 1, removed: 0 } }))).toBe(
      'Revision 2: 1 removed part, 2 new connections, 1 changed connection.',
    )
  })

  it('names the fields of the board that changed', () => {
    expect(summaryLine(make({ boardFields: ['goal'] }))).toBe('Revision 2: goal changed.')
    expect(summaryLine(make({ parts: { added: 1, changed: 0, removed: 0 }, boardFields: ['title', 'goal', 'scope'] }))).toBe('Revision 2: 1 new part, title, goal, and scope changed.')
  })

  it('has no line for a revision that changed and answered nothing', () => {
    expect(summaryLine(make({}))).toBeUndefined()
    expect(summaryTotal(make({}))).toBe(0)
  })

  it('counts the items for the tab title', () => {
    expect(summaryTotal(make({ answers: 5, parts: { added: 1, changed: 1, removed: 0 }, boardFields: ['goal'] }))).toBe(8)
  })
})
