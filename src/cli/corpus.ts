// Broken and borderline boards for the `anatomy` tool's tests: one fault each, plus a few with many faults.
// The golden test prints the tool's output for each one, and the parity test checks the bundled tool against the app.
// `npm run tokens` measures the output of some of them.
import { runAnatomy, type CliIo, type CliResult } from './anatomy.ts'

export interface CorpusCase {
  name: string
  /** The text of `board.json`. */
  text: string
  /** The text of the `feedback.json` next to it, when the case needs one. */
  feedback?: string
}

type Json = Record<string, any>

/** A valid board with 6 parts that draws no warning. Each case copies it and breaks one thing. */
export function baseBoard(): Json {
  const source = { kind: 'agent-explanation' }
  return {
    format: 'anatomy-board',
    schemaVersion: 1,
    id: 'shop',
    revision: 3,
    title: 'How an order moves through the shop',
    goal: 'Understand how an order goes from the cart to the warehouse.',
    scope: { includes: ['The order path'], excludes: ['Refunds, which are planned'] },
    groups: [
      { id: 'frontend', label: 'Frontend' },
      { id: 'backend', label: 'Backend' },
    ],
    components: [
      { id: 'cart', label: 'Cart', summary: 'Holds the items the customer chose.', group: 'frontend', source },
      { id: 'checkout', label: 'Checkout page', summary: 'Asks for the address and the card.', group: 'frontend', source },
      { id: 'api', label: 'API', summary: 'Checks the order and saves it.', group: 'backend', source },
      { id: 'payment', label: 'Payment', summary: 'Charges the card through the provider.', group: 'backend', source },
      { id: 'database', label: 'Database', summary: 'Keeps orders and their state.', group: 'backend', source },
      {
        id: 'warehouse',
        label: 'Warehouse queue',
        summary: 'Hands paid orders to the warehouse.',
        group: 'backend',
        source: { kind: 'documented-intent', references: [{ label: 'Shop notes', path: 'docs/shop.md' }] },
      },
    ],
    relationships: [
      { id: 'cart-to-checkout', from: 'cart', to: 'checkout', kind: 'sends-data-to', label: 'items', source },
      { id: 'checkout-to-api', from: 'checkout', to: 'api', kind: 'calls', label: 'place order', source },
      { id: 'api-to-payment', from: 'api', to: 'payment', kind: 'calls', label: 'charge', source },
      { id: 'api-to-database', from: 'api', to: 'database', kind: 'stores-in', label: 'order', source },
      { id: 'api-to-warehouse', from: 'api', to: 'warehouse', kind: 'triggers', label: 'paid order', source },
    ],
    items: [{ id: 'q-timeout', kind: 'question', text: 'What happens when the payment provider times out?', about: 'payment' }],
    scenarios: [
      {
        id: 'place-order',
        title: 'Place an order',
        steps: [
          { caption: 'The customer opens checkout.', highlight: ['cart', 'cart-to-checkout'] },
          { caption: 'The API checks the order.', highlight: ['checkout-to-api', 'api'] },
          { caption: 'The API charges the card.', highlight: ['api-to-payment', 'payment'] },
        ],
      },
    ],
  }
}

const feedbackFile = (extra: Json = {}) =>
  JSON.stringify({
    format: 'anatomy-feedback',
    schemaVersion: 1,
    id: 'feedback-k2m9x0q4z7ab',
    boardId: 'shop',
    baseRevision: 3,
    createdAt: '2026-11-14T10:02:00.000Z',
    items: [
      { id: 'note-a1b2c3d4e5f6', type: 'question', text: 'What happens when the payment call times out?' },
      { id: 'edit-0p9o8i7u6y5t', type: 'reconnect' },
      { id: 'part-9z8y7x6w5v4u', type: 'new-part', label: 'Fraud check' },
    ],
    withdrawn: ['note-old000000001'],
    ...extra,
  })

const answers = (items: Json[], respondsTo = 'feedback-k2m9x0q4z7ab') => ({ respondsTo, items })
const answer = (feedbackId: string, status = 'answered', changed: string[] = []) => ({ feedbackId, status, text: 'Done.', changed })
const allAnswered = () =>
  answers([answer('note-a1b2c3d4e5f6'), answer('edit-0p9o8i7u6y5t', 'adopted', ['api-to-payment']), answer('part-9z8y7x6w5v4u', 'declined')])

/** A case made from the base board. `change` breaks it in place. */
function mutate(name: string, change: (board: Json) => void, feedback?: string): CorpusCase {
  const board = baseBoard()
  change(board)
  return { name, text: `${JSON.stringify(board, null, 2)}\n`, ...(feedback === undefined ? {} : { feedback }) }
}

/** Valid boards, with or without warnings. */
export const VALID_CASES: readonly CorpusCase[] = [
  mutate('base board', () => {}),
  { name: 'compact JSON with a byte order mark', text: `﻿${JSON.stringify(baseBoard())}` },
  mutate('unknown lesson', (b) => (b.components[0].lesson = 'flux-capacitor')),
  mutate('part with no connection', (b) => b.components.push({ id: 'mailer', label: 'Mailer', summary: 'Sends receipts.', source: { kind: 'agent-proposal' } })),
  mutate('guarantee words', (b) => {
    b.components[3].summary = 'Charges the card and never fails.'
    b.relationships[1].explanation = 'Delivery is **bulletproof**.'
  }),
  mutate('changed ID not on the board', (b) => (b.responses = answers([answer('note-x1', 'adopted', ['api-to-paymnt'])], 'feedback-older0000001'))),
  mutate('adopted with no changed IDs', (b) => (b.responses = answers([answer('note-x1', 'adopted')], 'feedback-older0000001'))),
  mutate('feedback answered in full', (b) => {
    b.revision = 4
    b.responses = allAnswered()
  }, feedbackFile()),
  mutate('feedback not answered yet', () => {}, feedbackFile()),
  mutate('feedback forgotten in the next revision', (b) => (b.revision = 4), feedbackFile()),
  mutate('feedback with old respondsTo', (b) => {
    b.revision = 4
    b.responses = answers([answer('note-a1b2c3d4e5f6')], 'feedback-older0000001')
  }, feedbackFile()),
  mutate('feedback partly answered, revision not raised', (b) => {
    b.responses = answers([answer('note-a1b2c3d4e5f6'), answer('note-old000000001'), answer('edit-0p9o8i7u6y5u', 'adopted', ['api-to-payment'])])
  }, feedbackFile()),
  mutate('more warnings than the report shows', (b) => {
    b.revision = 4
    b.responses = answers(Array.from({ length: 30 }, (_, i) => answer(`zz-${i}`)))
  }, feedbackFile()),
  mutate('huge feedback item IDs', (b) => {
    b.revision = 4
    b.responses = answers([answer('note-a1b2c3d4e5f6')])
  }, feedbackFile({ items: [{ id: 'x'.repeat(300_000), type: 'note' }] })),
  mutate('feedback for another board', (b) => (b.revision = 4), feedbackFile({ boardId: 'other-board' })),
  mutate('feedback file that is not feedback', (b) => (b.revision = 4), '{ "format": "something-else" }'),
]

/** Boards the app rejects. */
export const INVALID_CASES: readonly CorpusCase[] = [
  { name: 'empty file', text: '' },
  { name: 'truncated JSON', text: JSON.stringify(baseBoard()).slice(0, 200) },
  { name: 'JSON array', text: '[]' },
  { name: 'another JSON file', text: '{ "name": "shop", "version": "1.0.0" }\n' },
  mutate('schema version 2', (b) => (b.schemaVersion = 2)),
  { name: 'file over the size limit', text: JSON.stringify({ ...baseBoard(), goal: 'x'.repeat(1_000_001) }) },
  mutate('missing title', (b) => delete b.title),
  mutate('revision as text', (b) => (b.revision = '4')),
  mutate('revision zero', (b) => (b.revision = 0)),
  mutate('label too long', (b) => (b.components[1].label = 'The page where the customer types the address and the card number')),
  mutate('summary of spaces', (b) => (b.components[2].summary = '   ')),
  mutate('misspelled key', (b) => {
    b.components[0].summery = b.components[0].summary
    delete b.components[0].summary
  }),
  mutate('unknown key with no near match', (b) => (b.relationships[0].color = 'red')),
  mutate('unknown key of 900,000 characters', (b) => (b.components[0]['k'.repeat(900_000)] = 1)),
  mutate('ID with capitals and spaces', (b) => (b.groups[0].id = 'Front End')),
  mutate('duplicate component ID', (b) => (b.components[5].id = 'payment')),
  mutate('item ID equal to a component ID', (b) => (b.items[0].id = 'api')),
  mutate('relationship to a misspelled component', (b) => (b.relationships[2].to = 'paymnt')),
  mutate('relationship from a missing component', (b) => (b.relationships[0].from = 'basket-service')),
  mutate('group that does not exist', (b) => (b.components[0].group = 'fronted')),
  mutate('item about a missing part', (b) => (b.items[0].about = 'payments')),
  mutate('highlight names a group', (b) => b.scenarios[0].steps[0].highlight.push('frontend')),
  mutate('highlight names an item', (b) => b.scenarios[0].steps[2].highlight.push('q-timeout')),
  mutate('relationship kind misspelled', (b) => (b.relationships[0].kind = 'send-data-to')),
  mutate('source kind from version 2', (b) => (b.components[0].source = { kind: 'code-derived' })),
  mutate('documented intent without a reference', (b) => (b.components[5].source = { kind: 'documented-intent' })),
  mutate('no components', (b) => {
    b.components = []
    b.relationships = []
    b.items = []
    b.scenarios = []
  }),
  mutate('scenario with no steps', (b) => (b.scenarios[0].steps = [])),
  mutate('too many groups', (b) => {
    for (let i = 0; i < 11; i++) b.groups.push({ id: `area-${i}`, label: `Area ${i}` })
  }),
  mutate('reference with a URL key', (b) => (b.components[5].source.references[0].url = 'https://example.com')),
  mutate('position out of range', (b) => (b.components[0].position = { x: 250_000, y: 0 })),
  mutate('response with a wrong status', (b) => (b.responses = answers([answer('note-x1', 'accepted')]))),
  mutate('explanation over the limit', (b) => (b.components[0].explanation = 'Long. '.repeat(700))),
  mutate('several faults at once', (b) => {
    delete b.goal
    b.components[1].label = ''
    b.relationships[3].kind = 'writes-to'
    b.items[0].kind = 'risk'
  }),
  mutate('broken references everywhere', (b) => {
    b.relationships.forEach((r: Json) => (r.to = `${r.to}-old`))
    b.components.forEach((c: Json) => (c.group = 'core'))
  }),
  mutate('more problems than the report shows', (b) => {
    for (let i = 0; i < 40; i++) b.relationships.push({ id: `extra-${i}`, from: 'api', to: `service-${i}`, kind: 'calls', label: 'call', source: { kind: 'agent-proposal' } })
  }),
]

export const CORPUS: readonly CorpusCase[] = [...VALID_CASES, ...INVALID_CASES]

/** Files in memory for the tool, with posix paths. `written` records each write. */
export function memoryIo(files: Map<string, string>, invocation = 'node .anatomy/anatomy.mjs'): CliIo & { written: string[] } {
  const written: string[] = []
  return {
    defaultBoard: '.anatomy/board.json',
    invocation,
    written,
    read: (path) => {
      const text = files.get(path)
      return text === undefined ? { ok: false, missing: true, reason: 'no such file' } : { ok: true, text }
    },
    write: (path, text) => {
      files.set(path, text)
      written.push(path)
    },
    sibling: (path, name) => `${path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''}${name}`,
    display: (path) => path,
  }
}

/** Runs the tool on one case in memory, with its files in `.anatomy/`. */
export function runCase(c: CorpusCase, args: readonly string[] = ['validate']): CliResult {
  const files = new Map([['.anatomy/board.json', c.text]])
  if (c.feedback !== undefined) files.set('.anatomy/feedback.json', c.feedback)
  return runAnatomy(args, memoryIo(files))
}
