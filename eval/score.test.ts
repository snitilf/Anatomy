import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseBoard } from '../src/board/validate.ts'
import { labelsMatch, normalizeLabel, scoreBoard, type FeedbackFile, type Gold } from './score.ts'

const task = (id: string, file: string) => readFileSync(join(process.cwd(), 'eval', 'tasks', id, file), 'utf8')
const gold = (id: string) => JSON.parse(task(id, 'gold.json')) as Gold

function board(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 'anatomy-board',
    schemaVersion: 1,
    id: 'demo',
    revision: 1,
    title: 'Demo',
    goal: 'Understand the demo.',
    scope: { includes: [], excludes: [] },
    components: [
      { id: 'web-page', label: 'The web pages', summary: 'Shows tasks.', source: { kind: 'agent-explanation' } },
      { id: 'api', label: 'API', summary: 'Serves tasks.', source: { kind: 'agent-explanation' } },
      { id: 'database', label: 'SQLite database', summary: 'Keeps tasks.', source: { kind: 'agent-explanation' } },
      { id: 'cache', label: 'Cache', summary: 'Not in the gold list.', source: { kind: 'agent-explanation' } },
    ],
    relationships: [
      { id: 'web-to-api', from: 'web-page', to: 'api', kind: 'calls', label: 'fetch', source: { kind: 'agent-explanation' } },
      { id: 'db-to-api', from: 'database', to: 'api', kind: 'sends-data-to', label: 'rows', source: { kind: 'agent-explanation' } },
    ],
    items: [{ id: 'q-expiry', kind: 'question', text: 'How long does a cookie last?' }],
    ...overrides,
  })
}

const small: Gold = {
  id: 'small',
  kind: 'first-board',
  components: [
    { name: 'Web page', aliases: [] },
    { name: 'API', aliases: ['server'] },
    { name: 'Database', aliases: [] },
    { name: 'Session check', aliases: [] },
  ],
  edges: [
    { from: 'Web page', to: 'API' },
    { from: 'API', to: 'Database' },
    { from: 'API', to: 'Session check' },
  ],
  minUnknowns: 1,
  needsDocumentedIntent: false,
}

describe('label matching', () => {
  it('ignores case, punctuation, plurals, and filler words', () => {
    expect(normalizeLabel('The Web-Pages!')).toEqual(['web', 'page'])
    expect(labelsMatch('The web pages', 'Web page')).toBe(true)
    expect(labelsMatch('SQLite database', 'Database')).toBe(true)
    expect(labelsMatch('Cache', 'Database')).toBe(false)
    expect(labelsMatch('', 'API')).toBe(false)
  })
})

describe('scoring a board', () => {
  it('computes recall, precision, and edge recall against the gold facts', () => {
    const scores = scoreBoard({ gold: small, parse: parseBoard, boardText: board() })
    expect(scores.validFirstWrite).toBe(true)
    expect(scores.components.recall).toBe(0.75)
    expect(scores.components.precision).toBe(0.75)
    expect(scores.components.missing).toEqual(['Session check'])
    expect(scores.components.extra).toEqual(['Cache'])
    // The reversed edge between the API and the database still counts. The session edge is missing.
    expect(scores.edges.recall).toBeCloseTo(2 / 3)
    expect(scores.edges.missing).toEqual(['API -> Session check'])
    expect(scores.unknowns).toEqual({ count: 1, required: 1, ok: true })
  })

  it('reports an invalid file with its errors and zero recall', () => {
    const scores = scoreBoard({ gold: small, parse: parseBoard, boardText: '{ "format": "nope" }' })
    expect(scores.validFinal).toBe(false)
    expect(scores.errors.length).toBeGreaterThan(0)
    expect(scores.components.recall).toBe(0)
  })

  it('scores the first write apart from the final file', () => {
    const scores = scoreBoard({ gold: small, parse: parseBoard, firstWriteText: '{', boardText: board() })
    expect(scores.validFirstWrite).toBe(false)
    expect(scores.validFinal).toBe(true)
  })

  it('counts guarantee words in text and ignores IDs', () => {
    const text = board({
      components: [
        { id: 'always-on', label: 'API', summary: 'It is secure and always up.', source: { kind: 'agent-explanation' } },
      ],
      relationships: [],
    })
    const scores = scoreBoard({ gold: small, parse: parseBoard, boardText: text })
    expect(scores.guaranteeWords.count).toBe(2)
    expect(scores.guaranteeWords.found.sort()).toEqual(['always', 'secure'])
  })

  it('counts documented-intent sources without a reference, even in an invalid file', () => {
    const text = board({
      components: [{ id: 'api', label: 'API', summary: 'x', source: { kind: 'documented-intent' } }],
      relationships: [],
    })
    const scores = scoreBoard({ gold: small, parse: parseBoard, boardText: text })
    expect(scores.validFinal).toBe(false)
    expect(scores.documentedIntentWithoutReference).toBe(1)
  })

  it('flags a plan board that never uses documented-intent', () => {
    const plan = { ...small, needsDocumentedIntent: true }
    expect(scoreBoard({ gold: plan, parse: parseBoard, boardText: board() }).documentedIntentMissing).toBe(true)
  })

  it('fails the unknown count when a board has none and the task needs some', () => {
    const scores = scoreBoard({ gold: small, parse: parseBoard, boardText: board({ items: [] }) })
    expect(scores.unknowns.ok).toBe(false)
  })
})

describe('scoring feedback answers', () => {
  const feedback: FeedbackFile = { id: 'feedback-one', items: [{ id: 'note-one' }, { id: 'note-two' }, { id: 'note-three' }], withdrawn: [] }
  const revisionGold: Gold = { ...small, kind: 'revision', startRevision: 1, unclearItems: ['note-three'], minUnknowns: 0 }

  it('finds unanswered items, bad changed lists, and unclear items that were acted on', () => {
    const text = board({
      revision: 2,
      responses: {
        respondsTo: 'feedback-one',
        items: [
          { feedbackId: 'note-one', status: 'adopted', text: 'Done.', changed: ['no-such-part'] },
          { feedbackId: 'note-three', status: 'adopted', text: 'Done.', changed: ['api'] },
        ],
      },
    })
    const f = scoreBoard({ gold: revisionGold, parse: parseBoard, boardText: text, feedback }).feedback
    expect(f?.answered).toBe(2)
    expect(f?.unanswered).toEqual(['note-two'])
    expect(f?.badChanged).toEqual(['note-one: no-such-part'])
    expect(f?.unclearAdopted).toEqual(['note-three'])
    expect(f?.revisionRaised).toBe(true)
  })

  it('accepts a complete, honest set of answers', () => {
    const text = board({
      revision: 2,
      responses: {
        respondsTo: 'feedback-one',
        items: [
          { feedbackId: 'note-one', status: 'adopted', text: 'Done.', changed: ['api'] },
          { feedbackId: 'note-two', status: 'answered', text: 'It lives in the API.', changed: [] },
          { feedbackId: 'note-three', status: 'answered', text: 'What do you mean here?', changed: [] },
        ],
      },
    })
    const scores = scoreBoard({ gold: { ...revisionGold, minQuestions: 1 }, parse: parseBoard, boardText: text, feedback })
    expect(scores.feedback).toMatchObject({ answered: 3, unanswered: [], badChanged: [], unclearAdopted: [] })
    expect(scores.questions).toEqual({ count: 1, required: 1, ok: true })
  })

  it('does not require withdrawn items', () => {
    const f = scoreBoard({
      gold: revisionGold,
      parse: parseBoard,
      boardText: board({ revision: 2, responses: { respondsTo: 'feedback-one', items: [] } }),
      feedback: { ...feedback, withdrawn: ['note-one', 'note-two', 'note-three'] },
    }).feedback
    expect(f?.total).toBe(0)
  })
})

describe('the fixture tasks', () => {
  const ids = ['web-app', 'cli-plugins', 'plan-only', 'monorepo', 'revision-clear', 'revision-unclear']

  it('each have a prompt and a gold file whose edges name gold components', () => {
    for (const id of ids) {
      const g = gold(id)
      expect(task(id, 'task.md').trim().length).toBeGreaterThan(40)
      const names = g.components.map((c) => c.name)
      for (const edge of g.edges) {
        expect(names, `${id}: ${edge.from}`).toContain(edge.from)
        expect(names, `${id}: ${edge.to}`).toContain(edge.to)
      }
    }
  })

  it('give revision tasks a valid starting board and a feedback file for it', () => {
    for (const id of ['revision-clear', 'revision-unclear']) {
      const parsed = parseBoard(task(id, 'board.json'))
      expect(parsed.ok, id).toBe(true)
      const feedback = JSON.parse(task(id, 'feedback.json')) as FeedbackFile
      expect(feedback.id).toBe(gold(id).feedbackId)
      expect(parsed.ok && parsed.board.revision).toBe(gold(id).startRevision)
    }
    expect((JSON.parse(task('revision-clear', 'feedback.json')) as FeedbackFile).items).toHaveLength(8)
  })

  it('scores the starting board of a revision task as a good map of its gold facts', () => {
    const scores = scoreBoard({ gold: gold('revision-clear'), parse: parseBoard, boardText: task('revision-clear', 'board.json') })
    expect(scores.components.precision).toBe(1)
    expect(scores.guaranteeWords.count).toBe(0)
  })
})
