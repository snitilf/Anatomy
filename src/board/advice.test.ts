import { describe, expect, it } from 'vitest'
import { baseBoard } from '../cli/corpus'
import { boardAdvice, readFeedback, type FeedbackSummary } from './advice'
import { parseBoard } from './validate'
import type { Board } from './schema'

// Every realistic board in the repository. The two stress fixtures are left out: one is invalid on purpose, and one
// has a lone card on purpose.
const examples = import.meta.glob(['../examples/*.board.json', '../../eval/tasks/*/board.json', '../../e2e/fixtures/*.board.json', '!**/many-errors.board.json', '!**/worst-text.board.json'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function board(change: (b: Record<string, any>) => void = () => {}): Board {
  const data = baseBoard()
  change(data)
  const result = parseBoard(JSON.stringify(data))
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.board
}

const feedback = (extra: Partial<FeedbackSummary> = {}): FeedbackSummary => ({
  id: 'feedback-a',
  boardId: 'shop',
  baseRevision: 3,
  items: ['note-1', 'note-2'],
  withdrawn: ['note-0'],
  ...extra,
})

const codes = (b: Board, f?: FeedbackSummary | 'unreadable') => boardAdvice(b, f).map((p) => p.code)

describe('boardAdvice on real boards', () => {
  it.each(Object.entries(examples))('stays quiet on %s', (_path, text) => {
    const result = parseBoard(text)
    expect(result.ok && boardAdvice(result.board)).toEqual([])
  })

  it('stays quiet on the base board of the corpus', () => {
    expect(boardAdvice(board())).toEqual([])
  })
})

describe('boardAdvice rules', () => {
  it('flags a part with no connection, but not a board with one part', () => {
    const lonely = board((b) => b.components.push({ id: 'mailer', label: 'Mailer', summary: 'Sends mail.', source: { kind: 'agent-proposal' } }))
    expect(boardAdvice(lonely)).toEqual([{ path: 'components[6]', code: 'unconnected', message: 'Component "mailer" has no connection.' }])
    const single = board((b) => {
      b.components = [b.components[0]]
      b.relationships = []
      b.items = []
      b.scenarios = []
    })
    expect(boardAdvice(single)).toEqual([])
  })

  it('flags words that promise a guarantee in claims, once per field', () => {
    const b = board((d) => {
      d.goal = 'Show why checkout never fails and is guaranteed.'
      d.scenarios[0].steps[1].caption = 'The bulletproof API checks the order.'
      d.items[0].text = 'Is delivery guaranteed?'
    })
    expect(boardAdvice(b).map((p) => [p.path, p.code])).toEqual([
      ['goal', 'guarantee'],
      ['scenarios[0].steps[1].caption', 'guarantee'],
    ])
  })

  it('leaves common words alone', () => {
    const b = board((d) => (d.goal = 'The API always answers over a secure connection, with a guaranteed-free trial of guarantees-api.'))
    expect(codes(b)).toEqual([])
  })

  it('flags an adopted answer with no changed IDs, since the mark then stays on the map', () => {
    const b = board((d) => (d.responses = { respondsTo: 'feedback-old', items: [{ feedbackId: 'n', status: 'adopted', text: 'Done.' }] }))
    expect(codes(b)).toEqual(['adopted-without-changes'])
  })
})

describe('boardAdvice with a feedback file', () => {
  const answer = (feedbackId: string) => ({ feedbackId, status: 'answered', text: 'Yes.' })

  it('accepts a revision that answers every item', () => {
    const b = board((d) => {
      d.revision = 4
      d.responses = { respondsTo: 'feedback-a', items: [answer('note-1'), answer('note-2')] }
    })
    expect(codes(b, feedback())).toEqual([])
  })

  it('stays quiet before the agent writes the next revision', () => {
    expect(codes(board(), feedback())).toEqual([])
  })

  it('flags the next revision when it does not answer the feedback', () => {
    expect(codes(board((d) => (d.revision = 4)), feedback())).toEqual(['responds-to-other'])
  })

  it('stays quiet on a later revision without answers, because Anatomy keeps the answers it received', () => {
    expect(codes(board((d) => (d.revision = 6)), feedback())).toEqual([])
  })

  it('flags answers to an older feedback file', () => {
    const b = board((d) => {
      d.revision = 6
      d.responses = { respondsTo: 'feedback-old', items: [answer('note-1')] }
    })
    expect(boardAdvice(b, feedback())).toEqual([expect.objectContaining({ path: 'responses.respondsTo', code: 'responds-to-other', hint: 'Set responses.respondsTo to "feedback-a" and answer every item.' })])
  })

  it('flags a missing answer, an unknown item, a withdrawn item, and a revision that did not rise', () => {
    const b = board((d) => (d.responses = { respondsTo: 'feedback-a', items: [answer('note-1'), answer('note-0'), answer('nte-1')] }))
    expect(boardAdvice(b, feedback())).toEqual([
      expect.objectContaining({ path: 'revision', code: 'revision-not-raised', hint: 'Set revision to 4.' }),
      expect.objectContaining({ path: 'responses.items', code: 'unanswered-feedback', message: 'Feedback item "note-2" has no answer.' }),
      expect.objectContaining({ path: 'responses.items[1].feedbackId', code: 'withdrawn-answered' }),
      expect.objectContaining({ path: 'responses.items[2].feedbackId', code: 'unknown-feedback-item', hint: 'Did you mean "note-1"?' }),
    ])
  })

  it('ignores feedback for another board', () => {
    expect(codes(board((d) => (d.revision = 4)), feedback({ boardId: 'other' }))).toEqual([])
  })

  it('says when the feedback file cannot be read', () => {
    expect(codes(board(), 'unreadable')).toEqual(['feedback-unreadable'])
  })
})

describe('readFeedback', () => {
  it('reads the IDs it needs', () => {
    const text = JSON.stringify({ format: 'anatomy-feedback', schemaVersion: 1, id: 'f', boardId: 'b', baseRevision: 2, items: [{ id: 'a', type: 'note' }], withdrawn: ['z'] })
    expect(readFeedback(`﻿${text}`)).toEqual({ id: 'f', boardId: 'b', baseRevision: 2, items: ['a'], withdrawn: ['z'] })
  })

  it('rejects anything else', () => {
    expect(readFeedback('nope')).toBeUndefined()
    expect(readFeedback('null')).toBeUndefined()
    expect(readFeedback('{"format":"anatomy-board"}')).toBeUndefined()
    expect(readFeedback(JSON.stringify({ format: 'anatomy-feedback', id: 'f', boardId: 'b', baseRevision: 2, items: [{}] }))).toBeUndefined()
  })
})
