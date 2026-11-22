import { describe, expect, it } from 'vitest'
import { inSchemaOrder } from '../board/shape'
import { parseBoard } from '../board/validate'
import { runAnatomy } from './anatomy'
import { PATCH_LIMITS } from './apply'
import { baseBoard, memoryIo } from './corpus'
import { changedCopy, diffOps } from './patchKit'

const BOARD = '.anatomy/board.json'
const PREV = '.anatomy/board.prev.json'
const pretty = (board: unknown) => `${JSON.stringify(inSchemaOrder(board), null, 2)}\n`

const FEEDBACK = JSON.stringify({
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
})

/** Runs `apply` on the base board in memory, with the patch as the patch file. */
function apply(patch: unknown, args: string[] = [], files: Record<string, string> = {}) {
  const map = new Map<string, string>([[BOARD, pretty(baseBoard())], ['.anatomy/patch.json', typeof patch === 'string' ? patch : JSON.stringify(patch)], ...Object.entries(files)])
  const io = memoryIo(map)
  const result = runAnatomy(['apply', ...args], io)
  const board = () => JSON.parse(map.get(BOARD)!) as Record<string, any>
  return { ...result, io, files: map, board }
}

const replaceSummary = { op: 'replace', path: '/components/payment/summary', value: 'Charges the card and retries twice.' }

describe('paths', () => {
  it('finds a list item by ID, and a field inside it', () => {
    const r = apply([replaceSummary])
    expect(r.code).toBe(0)
    expect(r.board().components[3].summary).toBe('Charges the card and retries twice.')
    expect(r.stdout).toBe('.anatomy/board.json: applied, revision 3 to 4\n~ components/payment.summary\n')
  })

  it('reaches a field two levels down', () => {
    const r = apply([{ op: 'replace', path: '/components/payment/source/kind', value: 'user-stated' }])
    expect(r.code).toBe(0)
    expect(r.board().components[3].source.kind).toBe('user-stated')
  })

  it('suggests the nearest ID when an ID is misspelled', () => {
    const r = apply([{ op: 'replace', path: '/components/paymnt/summary', value: 'x' }])
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('ops[0] not-found /components/paymnt/summary: There is no component with the ID "paymnt" in components. Did you mean "payment"?')
  })

  it('says that items have no positions', () => {
    const r = apply([{ op: 'replace', path: '/components/0/summary', value: 'x' }])
    expect(r.stdout).toContain('Items are addressed by ID, not by position.')
  })

  it.each([
    ['the steps of a scenario', '/scenarios/place-order/steps/0/caption', 'a list without IDs'],
    ['a list of scope', '/scope/includes/0', 'a list without IDs'],
  ])('rejects %s, which has no IDs', (_name, path, message) => {
    const r = apply([{ op: 'replace', path, value: 'x' }])
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('not-addressable')
    expect(r.stdout).toContain(message)
    expect(r.stdout).toContain('Replace the whole list at')
  })

  it('replaces a whole list that has no IDs', () => {
    const r = apply([{ op: 'replace', path: '/scenarios/place-order/steps', value: [{ caption: 'Only step.', highlight: ['cart'] }] }])
    expect(r.code).toBe(0)
    expect(r.board().scenarios[0].steps).toEqual([{ caption: 'Only step.', highlight: ['cart'] }])
  })

  it.each(['/components/__proto__/x', '/__proto__/polluted', '/components/constructor', '/components/payment/prototype'])('never follows %s', (path) => {
    const r = apply([{ op: 'add', path, value: 'x' }])
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('forbidden-segment')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('treats a "__proto__" key in a value as data that the schema rejects', () => {
    const r = apply(`[{"op":"add","path":"/components","value":{"id":"evil","label":"Evil","summary":"x","source":{"kind":"agent-explanation"},"__proto__":{"polluted":true}}}]`)
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('Unrecognized key')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(r.board().components).toHaveLength(6)
  })

  it.each([
    ['no leading slash', 'components/payment'],
    ['an empty part', '/components//summary'],
    ['a path that is just a slash', '/'],
  ])('rejects %s', (_name, path) => {
    const r = apply([{ op: 'replace', path, value: 'x' }])
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('bad-path')
  })

  it('does not step into a value', () => {
    expect(apply([{ op: 'replace', path: '/title/more', value: 'x' }]).stdout).toContain('holds a value')
  })

  it('reads the JSON Pointer escapes', () => {
    const r = apply([{ op: 'replace', path: '/components/a~1b', value: {} }])
    expect(r.stdout).toContain('"a/b"')
  })

  it('stops on two items with the same ID instead of choosing one', () => {
    const board = baseBoard()
    board.components.push({ ...board.components[0] })
    const r = apply([replaceSummary, { op: 'replace', path: '/components/cart/summary', value: 'x' }], [], { [BOARD]: pretty(board) })
    expect(r.stdout).toContain('ops[1] ambiguous-id')
  })
})

describe('the operations', () => {
  it('add appends an item to a list, and before puts it in front of another', () => {
    const part = { id: 'queue', label: 'Queue', summary: 'Holds jobs.', source: { kind: 'agent-explanation' } }
    const end = apply([{ op: 'add', path: '/components', value: part }])
    expect(end.board().components.map((c: { id: string }) => c.id).at(-1)).toBe('queue')
    const front = apply([{ op: 'add', path: '/components', value: part, before: 'payment' }])
    expect(front.board().components.map((c: { id: string }) => c.id)).toEqual(['cart', 'checkout', 'api', 'queue', 'payment', 'database', 'warehouse'])
    expect(front.stdout).toContain('+ components/queue')
  })

  it('add sets a field that is not set yet, and sets it again when it is', () => {
    const r = apply([{ op: 'add', path: '/components/payment/explanation', value: 'It **charges** the card.' }])
    expect(r.board().components[3].explanation).toBe('It **charges** the card.')
    expect(r.stdout).toContain('~ components/payment.explanation')
    expect(apply([{ op: 'add', path: '/components/payment/summary', value: 'New.' }]).board().components[3].summary).toBe('New.')
  })

  it('add needs an ID, refuses one that is taken anywhere, and offers a free one', () => {
    const part = { label: 'Queue', summary: 'Holds jobs.', source: { kind: 'agent-explanation' } }
    expect(apply([{ op: 'add', path: '/components', value: part }]).stdout).toContain('missing-id')
    const taken = apply([{ op: 'add', path: '/components', value: { ...part, id: 'api-to-payment' } }])
    expect(taken.stdout).toContain('ops[0] duplicate-id')
    expect(taken.stdout).toContain('Use a new ID, for example "api-to-payment-2".')
  })

  it('add refuses a "before" that is not in the list, and one on a field', () => {
    const part = { id: 'queue', label: 'Queue', summary: 'Holds jobs.', source: { kind: 'agent-explanation' } }
    expect(apply([{ op: 'add', path: '/components', value: part, before: 'nothing' }]).stdout).toContain('unknown-sibling')
    expect(apply([{ op: 'add', path: '/title', value: 'x', before: 'cart' }]).stdout).toContain('bad-target')
  })

  it('add on an item path points to the list', () => {
    const r = apply([{ op: 'add', path: '/components/payment', value: {} }])
    expect(r.stdout).toContain('bad-target')
    expect(r.stdout).toContain('/components')
  })

  it('replace swaps a whole item, and keeps its place', () => {
    const next = { ...baseBoard().components[3], summary: 'Rewritten.' }
    const r = apply([{ op: 'replace', path: '/components/payment', value: next }])
    expect(r.board().components[3].summary).toBe('Rewritten.')
    expect(r.stdout).toBe('.anatomy/board.json: applied, revision 3 to 4\n~ components/payment.summary\n')
  })

  it('replace never changes an ID', () => {
    const rename = apply([{ op: 'replace', path: '/components/payment/id', value: 'billing' }])
    expect(rename.stdout).toContain('ops[0] id-immutable')
    const whole = apply([{ op: 'replace', path: '/components/payment', value: { ...baseBoard().components[3], id: 'billing' } }])
    expect(whole.stdout).toContain('id-mismatch')
  })

  it('replace needs something to replace, and says to use add', () => {
    const r = apply([{ op: 'replace', path: '/components/payment/explanation', value: 'x' }])
    expect(r.stdout).toContain('not-found')
    expect(apply([{ op: 'replace', path: '/components/paymnt', value: {} }]).stdout).toContain('Did you mean "payment"?')
  })

  it('replace swaps a whole list', () => {
    const r = apply([{ op: 'replace', path: '/items', value: [] }])
    expect(r.board().items).toEqual([])
    expect(r.stdout).toContain('- items/q-timeout')
  })

  it('remove takes an item out by ID, and a field out by name', () => {
    const r = apply([{ op: 'remove', path: '/relationships/api-to-database' }, { op: 'remove', path: '/items/q-timeout/about' }])
    expect(r.code).toBe(0)
    expect(r.board().relationships.map((x: { id: string }) => x.id)).not.toContain('api-to-database')
    expect(r.board().items[0]).not.toHaveProperty('about')
    expect(r.stdout).toContain('- relationships/api-to-database\n~ items/q-timeout.about\n')
  })

  it('remove does not empty a whole list', () => {
    expect(apply([{ op: 'remove', path: '/relationships' }]).stdout).toContain('Name the item by ID')
  })

  it.each([['/revision', 'revision'], ['/responses', 'answers'], ['/id', 'ID'], ['/format', 'fixed'], ['/schemaVersion', 'fixed']])('keeps %s out of reach', (path, word) => {
    for (const op of ['replace', 'add', 'remove']) {
      const r = apply([op === 'remove' ? { op, path } : { op, path, value: 4 }])
      expect(r.stdout, op).toContain('reserved-path')
      expect(r.stdout).toContain(word)
    }
  })

  it('test passes on an equal value and fails on another', () => {
    expect(apply([{ op: 'test', path: '/components/payment/label', value: 'Payment' }, replaceSummary]).code).toBe(0)
    const failed = apply([{ op: 'test', path: '/components/payment/label', value: 'Pay' }, replaceSummary])
    expect(failed.code).toBe(1)
    expect(failed.stdout).toContain('ops[0] test-failed /components/payment/label')
    expect(failed.files.get(BOARD)).toBe(pretty(baseBoard()))
  })

  it('rejects an operation that is wrong in itself', () => {
    const r = apply([{ op: 'replce', path: '/title', value: 'x' }, { op: 'replace', path: '/title', value: 'x', extra: 1 }, { op: 'replace', path: '/title' }, 'text', { op: 'respond', for: 'x', status: 'maybe', text: 'y' }, { op: 'add', path: 7, value: 1 }])
    expect(r.stdout).toContain('ops[0] bad-op')
    expect(r.stdout).toContain('Did you mean "replace"?')
    expect(r.stdout).toContain('ops[1] unknown-key')
    expect(r.stdout).toContain('ops[2] missing-field')
    expect(r.stdout).toContain('ops[3] bad-op')
    expect(r.stdout).toContain('ops[4] wrong-type')
    expect(r.stdout).toContain('ops[5] wrong-type')
  })

  it('runs the operations in order on the result of the earlier ones', () => {
    const r = apply([replaceSummary, { op: 'test', path: '/components/payment/summary', value: 'Charges the card and retries twice.' }, { op: 'remove', path: '/components/payment/summary' }])
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('summary')
  })
})

describe('the revision', () => {
  it('goes up by exactly one', () => {
    expect(apply([replaceSummary]).board().revision).toBe(4)
  })

  it('cannot be set by the patch', () => {
    expect(apply([{ op: 'replace', path: '/revision', value: 9 }]).stdout).toContain('reserved-path')
  })

  it('stops the patch when a test on /revision fails, and writes nothing', () => {
    const r = apply([{ op: 'test', path: '/revision', value: 2 }, replaceSummary, { op: 'replace', path: '/nothing', value: 1 }])
    expect(r.code).toBe(1)
    expect(r.stdout).toBe('.anatomy/board.json: not changed, 1 patch error\nops[0] stale-revision /revision: The board is at revision 3, but the patch expects 2. Read the board again and make the patch from it.\n')
    expect(r.io.written).toEqual([])
  })

  it('--base does the same without a test operation', () => {
    expect(apply([replaceSummary], ['--base', '3']).code).toBe(0)
    const stale = apply([replaceSummary], ['--base=2'])
    expect(stale.code).toBe(1)
    expect(stale.stdout).toContain('(patch) stale-revision --base: The board is at revision 3, but the patch expects 2.')
    expect(stale.io.written).toEqual([])
  })

  it('needs a board that has one', () => {
    const board = { ...baseBoard() }
    delete (board as Record<string, unknown>).revision
    expect(apply([replaceSummary], [], { [BOARD]: JSON.stringify(board) }).stdout).toContain('no-revision')
  })
})

describe('feedback', () => {
  const files = { '.anatomy/feedback.json': FEEDBACK }
  const patch = [
    { op: 'replace', path: '/components/payment/summary', value: 'Charges the card and retries twice.', for: 'note-a1b2c3d4e5f6' },
    { op: 'add', path: '/relationships', value: { id: 'api-to-queue', from: 'api', to: 'warehouse', kind: 'sends-data-to', label: 'charge jobs', source: { kind: 'agent-explanation' } }, for: 'edit-0p9o8i7u6y5t' },
    { op: 'add', path: '/items', value: { id: 'q-retry', kind: 'question', text: 'How often should it retry?' }, for: 'edit-0p9o8i7u6y5t' },
    { op: 'respond', for: 'note-a1b2c3d4e5f6', status: 'answered', text: 'It retries twice.' },
    { op: 'respond', for: 'edit-0p9o8i7u6y5t', status: 'adopted', text: 'The API now hands charges to the queue.' },
    { op: 'respond', for: 'part-9z8y7x6w5v4u', status: 'declined', text: 'Not needed.' },
  ]

  it('builds responses and changed, and reads respondsTo from feedback.json', () => {
    const r = apply(patch, [], files)
    expect(r.code).toBe(0)
    expect(r.board().responses).toEqual({
      respondsTo: 'feedback-k2m9x0q4z7ab',
      items: [
        { feedbackId: 'note-a1b2c3d4e5f6', status: 'answered', text: 'It retries twice.', changed: ['payment'] },
        { feedbackId: 'edit-0p9o8i7u6y5t', status: 'adopted', text: 'The API now hands charges to the queue.', changed: ['api-to-queue'] },
        { feedbackId: 'part-9z8y7x6w5v4u', status: 'declined', text: 'Not needed.', changed: [] },
      ],
    })
    expect(r.stdout).toContain('+ responses/note-a1b2c3d4e5f6')
    // Everything is answered, so the validator has nothing to say.
    expect(runAnatomy(['validate', '--strict'], r.io).code).toBe(0)
  })

  it('matches the format the README shows, so validate and the app accept it', () => {
    const r = apply(patch, [], files)
    expect(parseBoard(r.files.get(BOARD)!).ok).toBe(true)
  })

  it('warns about an item left without an answer', () => {
    const r = apply(patch.slice(0, 5), [], files)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('1 warning')
    expect(r.stdout).toContain('responses.items: Feedback item "part-9z8y7x6w5v4u" has no answer.')
  })

  it('refuses an edit "for" an item that nothing answers', () => {
    const r = apply(patch.filter((op) => !(op.op === 'respond' && op.for === 'edit-0p9o8i7u6y5t')), [], files)
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('ops[1] for-unanswered edit-0p9o8i7u6y5t')
  })

  it('refuses an unknown, a withdrawn, and a doubled answer, and says what to do', () => {
    const r = apply([
      { op: 'respond', for: 'note-a1b2c3d4e5f7', status: 'answered', text: 'x' },
      { op: 'respond', for: 'note-old000000001', status: 'answered', text: 'x' },
      { op: 'respond', for: 'note-a1b2c3d4e5f6', status: 'answered', text: 'x' },
      { op: 'respond', for: 'note-a1b2c3d4e5f6', status: 'answered', text: 'y' },
    ], [], files)
    expect(r.stdout).toContain('ops[0] unknown-feedback-item')
    expect(r.stdout).toContain('Did you mean "note-a1b2c3d4e5f6"?')
    expect(r.stdout).toContain('ops[1] withdrawn-item')
    expect(r.stdout).toContain('ops[3] duplicate-respond')
  })

  it('needs a feedback file for the same board', () => {
    const answer = [{ op: 'respond', for: 'note-a1b2c3d4e5f6', status: 'answered', text: 'x' }]
    expect(apply(answer).stdout).toContain('no-feedback')
    expect(apply(answer, [], { '.anatomy/feedback.json': '{}' }).stdout).toContain('no-feedback')
    expect(apply(answer, [], { '.anatomy/feedback.json': FEEDBACK.replace('"shop"', '"other"') }).stdout).toContain('feedback-other-board')
  })

  it('keeps earlier answers to the same feedback and adds to them', () => {
    const first = apply([patch[0]!, patch[3]!], [], files)
    expect(first.code).toBe(0)
    const second = runAnatomy(['apply', '-'], memoryIo(first.files, undefined, JSON.stringify([patch[1]!, patch[2]!, patch[4]!, patch[5]!])))
    expect(second.code).toBe(0)
    const board = JSON.parse(first.files.get(BOARD)!) as ReturnType<typeof baseBoard>
    expect(board.revision).toBe(5)
    expect(board.responses.items.map((x: { feedbackId: string }) => x.feedbackId)).toEqual(['note-a1b2c3d4e5f6', 'edit-0p9o8i7u6y5t', 'part-9z8y7x6w5v4u'])
    expect(board.responses.items[0].changed).toEqual(['payment'])
  })

  it('drops the answers of older feedback when new feedback is answered', () => {
    const board = { ...baseBoard(), responses: { respondsTo: 'feedback-older0000001', items: [{ feedbackId: 'note-x1', status: 'answered', text: 'Old.', changed: [] }] } }
    const r = apply([{ op: 'respond', for: 'note-a1b2c3d4e5f6', status: 'answered', text: 'New.' }], [], { ...files, [BOARD]: pretty(board) })
    expect(r.board().responses.items.map((x: { feedbackId: string }) => x.feedbackId)).toEqual(['note-a1b2c3d4e5f6'])
  })

  it('leaves out of changed what is not a part or a connection on the board', () => {
    const r = apply([
      { op: 'add', path: '/components', value: { id: 'queue', label: 'Queue', summary: 'Holds jobs.', source: { kind: 'agent-explanation' } }, for: 'edit-0p9o8i7u6y5t' },
      { op: 'remove', path: '/components/queue', for: 'edit-0p9o8i7u6y5t' },
      { op: 'replace', path: '/items/q-timeout/text', value: 'Does it retry?', for: 'edit-0p9o8i7u6y5t' },
      { op: 'respond', for: 'edit-0p9o8i7u6y5t', status: 'adopted', text: 'Done.' },
    ], [], files)
    expect(r.board().responses.items[0].changed).toEqual([])
  })
})

describe('--cascade', () => {
  const removePayment = [{ op: 'remove', path: '/components/payment' }]

  it('reports a part that something still refers to, and writes nothing', () => {
    const r = apply(removePayment)
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('ops[0] dangling-reference /components/payment: components/payment is removed, but relationships/api-to-payment (to), items/q-timeout (about), scenarios/place-order (highlight) still refer to it.')
    expect(r.stdout).toContain('add --cascade')
    expect(r.stdout).toContain('relationships[2].to')
    expect(r.io.written).toEqual([])
  })

  it('accepts the removal when the patch removes what refers to it', () => {
    const r = apply([
      { op: 'remove', path: '/relationships/api-to-payment' },
      { op: 'remove', path: '/items/q-timeout' },
      { op: 'replace', path: '/scenarios/place-order/steps', value: [{ caption: 'The customer opens checkout.', highlight: ['cart'] }] },
      ...removePayment,
    ])
    expect(r.code).toBe(0)
  })

  it('drops the connections, items, and highlights of a part, and says so', () => {
    const r = apply(removePayment, ['--cascade'])
    expect(r.code).toBe(0)
    expect(r.stdout).toBe(
      [
        '.anatomy/board.json: applied, revision 3 to 4',
        '- components/payment',
        '- relationships/api-to-payment (cascade, with components/payment)',
        '- items/q-timeout (cascade, with components/payment)',
        '~ scenarios/place-order.steps (cascade, with components/payment)',
        '',
      ].join('\n'),
    )
    const board = r.board()
    expect(board.scenarios[0].steps[2].highlight).toEqual([])
    expect(JSON.stringify(board)).not.toContain('payment')
  })

  it('goes on through the connections to what refers to them', () => {
    const board = baseBoard()
    board.items.push({ id: 'q-link', kind: 'question', text: 'Why?', about: 'api-to-payment' })
    const r = apply(removePayment, ['--cascade'], { [BOARD]: pretty(board) })
    expect(r.board().items).toEqual([])
    expect(r.stdout).toContain('- items/q-link (cascade, with relationships/api-to-payment)')
  })

  it('applies to a connection too, and to a group, whose parts lose the group', () => {
    const link = apply([{ op: 'remove', path: '/relationships/api-to-payment' }], ['--cascade'])
    expect(link.stdout).toContain('~ scenarios/place-order.steps (cascade, with relationships/api-to-payment)')
    const group = apply([{ op: 'remove', path: '/groups/backend' }], ['--cascade'])
    expect(group.code).toBe(0)
    expect(group.board().components.every((c: { group?: string }) => c.group !== 'backend')).toBe(true)
    expect(group.stdout).toContain('~ components/api.group (cascade, with groups/backend)')
    expect(apply([{ op: 'remove', path: '/groups/backend' }]).stdout).toContain('dangling-reference')
  })

  it('does not take the flag from the validate command', () => {
    expect(runAnatomy(['validate', '--cascade'], memoryIo(new Map())).stderr).toContain('works only with apply')
  })
})

describe('--dry-run', () => {
  it('prints the changes by ID and writes nothing', () => {
    const r = apply([replaceSummary, { op: 'add', path: '/relationships', value: { id: 'api-to-queue', from: 'api', to: 'warehouse', kind: 'calls', label: 'jobs', source: { kind: 'agent-explanation' } } }, { op: 'remove', path: '/relationships/api-to-database' }, { op: 'replace', path: '/title', value: 'Orders' }], ['--dry-run'])
    expect(r.code).toBe(0)
    expect(r.stdout.split('\n').slice(0, 6)).toEqual(['.anatomy/board.json: dry run, nothing written, would raise revision 3 to 4, 1 warning', '~ title', '~ components/payment.summary', '+ relationships/api-to-queue', '- relationships/api-to-database', 'components[4]: Component "database" has no connection.'])
    expect(r.io.written).toEqual([])
    expect(r.files.get(BOARD)).toBe(pretty(baseBoard()))
  })

  it('shows a change of order', () => {
    const swapped = baseBoard().components.slice().reverse()
    expect(apply([{ op: 'replace', path: '/components', value: swapped }], ['--dry-run']).stdout).toContain('~ components (order)')
  })

  it('still reports every problem', () => {
    const r = apply([{ op: 'replace', path: '/components/paymnt/summary', value: 'x' }], ['--dry-run'])
    expect(r.code).toBe(1)
    expect(r.io.written).toEqual([])
  })

  it('lists at most 50 changes and counts the rest', () => {
    const board = baseBoard()
    board.relationships = Array.from({ length: 80 }, (_, i) => ({ id: `r-${i}`, from: 'cart', to: 'api', kind: 'calls', label: 'x', source: { kind: 'agent-explanation' } }))
    board.items = []
    board.scenarios = []
    const r = apply([{ op: 'replace', path: '/relationships', value: [] }], ['--dry-run'], { [BOARD]: pretty(board) })
    expect(r.stdout.split('\n').filter((l) => l.startsWith('- relationships/'))).toHaveLength(50)
    expect(r.stdout).toContain('30 more changes are not shown.')
  })
})

describe('the result is checked first', () => {
  it('lists the validator problems of the patched board and writes nothing', () => {
    const typo = apply([{ op: 'replace', path: '/relationships/api-to-payment/to', value: 'paymnt' }])
    expect(typo.code).toBe(1)
    expect(typo.stdout).toContain('.anatomy/board.json: not changed, 1 board error')
    expect(typo.stdout).toContain('relationships[2].to: ')
    expect(typo.stdout).toContain('Did you mean "payment"?')
    const r = apply([{ op: 'add', path: '/components/api/summery', value: 'x' }])
    expect(r.stdout).toContain('Did you mean "summary"?')
    expect(r.io.written).toEqual([])
    expect(r.files.get(BOARD)).toBe(pretty(baseBoard()))
  })

  it('prints both kinds of problem, and counts them in --json', () => {
    const r = apply([{ op: 'replace', path: '/components/paymnt/summary', value: 'x' }, { op: 'replace', path: '/relationships/api-to-payment/to', value: 'gone' }], ['--json'])
    const report = JSON.parse(r.stdout)
    expect(report).toMatchObject({ applied: false, opErrors: [{ op: 0, code: 'not-found', path: '/components/paymnt/summary' }], errors: [{ path: 'relationships[2].to', code: 'unknown-component' }], omittedOpErrors: 0, omittedErrors: 0 })
  })

  it('caps the lists and counts the rest', () => {
    const r = apply(Array.from({ length: 40 }, (_, i) => ({ op: 'remove', path: `/components/none-${i}` })))
    const lines = r.stdout.trimEnd().split('\n')
    expect(lines[0]).toBe('.anatomy/board.json: not changed, 40 patch errors')
    expect(lines).toHaveLength(27)
    expect(lines.at(-1)).toBe('15 more patch errors are not shown.')
  })

  it('shortens a huge ID in a message', () => {
    const r = apply([{ op: 'remove', path: `/components/${'x'.repeat(190)}` }])
    expect(Array.from(r.stdout.split('\n')[1]!).length).toBeLessThan(400)
  })

  it('can repair a board that does not validate', () => {
    const broken = baseBoard()
    broken.relationships[2].to = 'paymnt'
    const r = apply([{ op: 'replace', path: '/relationships/api-to-payment/to', value: 'payment' }], [], { [BOARD]: JSON.stringify(broken) })
    expect(r.code).toBe(0)
    expect(r.board().relationships[2].to).toBe('payment')
  })

  it('says when a patch changes nothing', () => {
    expect(apply([{ op: 'replace', path: '/components/payment/label', value: 'Payment' }]).stdout).toContain('no-change')
    expect(apply([{ op: 'test', path: '/revision', value: 3 }]).stdout).toContain('no-change')
  })

  it.each([
    ['an empty patch', '[]', 'empty-patch'],
    ['text that is not JSON', '[{"op":', 'patch-not-json'],
    ['an object', '{"op":"replace"}', 'patch-not-array'],
    ['too many operations', JSON.stringify(Array.from({ length: PATCH_LIMITS.ops + 1 }, () => ({ op: 'test', path: '/title', value: 1 }))), 'too-many-ops'],
    ['a patch that is too big', JSON.stringify([{ op: 'replace', path: '/goal', value: 'x'.repeat(PATCH_LIMITS.bytes) }]), 'too-big'],
    ['a patch nested too deeply', `[{"op":"replace","path":"/goal","value":${'['.repeat(100)}${']'.repeat(100)}}]`, 'too-deep'],
    ['a patch nested 200,000 levels deep', `[${'['.repeat(200_000)}${']'.repeat(200_000)}]`, 'too-deep'],
  ])('rejects %s with %s', (_name, patch, code) => {
    const r = apply(patch)
    expect(r.code).toBe(1)
    expect(r.stdout).toContain(`(patch) ${code}`)
    expect(r.io.written).toEqual([])
  })

  it.each([
    ['not JSON', '{ "format": ', 'board-not-json'],
    ['not an object', '[1]', 'board-not-object'],
    ['too deep', `{"revision":1,"x":${'['.repeat(100)}${']'.repeat(100)}}`, 'board-too-deep'],
  ])('refuses a board that is %s', (_name, board, code) => {
    const r = apply([replaceSummary], [], { [BOARD]: board })
    expect(r.code).toBe(1)
    expect(r.stdout).toContain(code)
  })
})

describe('the output file', () => {
  it('is what fmt would write, so a later fmt changes nothing', () => {
    const r = apply([replaceSummary, { op: 'add', path: '/components/payment/explanation', value: 'x' }])
    expect(r.files.get(BOARD)).toBe(pretty(r.board()))
    const fmt = runAnatomy(['fmt'], r.io)
    expect(fmt.stdout).toBe('.anatomy/board.json: already formatted, valid, revision 4\n')
  })

  it('keeps the old board as board.prev.json, first', () => {
    const r = apply([replaceSummary])
    expect(r.io.written).toEqual([PREV, BOARD])
    expect(r.files.get(PREV)).toBe(pretty(baseBoard()))
  })

  it('keeps the exact bytes of the old board, even when it was not formatted', () => {
    const compact = JSON.stringify(baseBoard())
    const r = apply([replaceSummary], [], { [BOARD]: compact })
    expect(r.files.get(PREV)).toBe(compact)
  })

  it('names the old board after the board file', () => {
    const files = new Map([['work/draft.json', pretty(baseBoard())], ['work/patch.json', JSON.stringify([replaceSummary])]])
    expect(runAnatomy(['apply', '--board', 'work/draft.json'], memoryIo(files)).code).toBe(0)
    expect([...files.keys()].sort()).toEqual(['work/draft.json', 'work/draft.prev.json', 'work/patch.json'])
  })

  it('stays as it was when the write fails, and says so', () => {
    const map = new Map([[BOARD, pretty(baseBoard())], ['.anatomy/patch.json', JSON.stringify([replaceSummary])]])
    const io = memoryIo(map)
    const write = io.write
    io.write = (path, text, options) => {
      if (path === BOARD) throw new Error('disk full')
      write(path, text, options)
    }
    expect(runAnatomy(['apply'], io)).toEqual({ code: 2, stdout: '', stderr: 'Cannot write .anatomy/board.json: disk full. It is unchanged.\n' })
    expect(map.get(BOARD)).toBe(pretty(baseBoard()))
  })

  it('writes nothing when the old board cannot be kept', () => {
    const map = new Map([[BOARD, pretty(baseBoard())], ['.anatomy/patch.json', JSON.stringify([replaceSummary])]])
    const io = memoryIo(map)
    io.write = () => {
      throw new Error('it is read-only')
    }
    expect(runAnatomy(['apply'], io)).toEqual({ code: 2, stdout: '', stderr: 'Cannot write .anatomy/board.prev.json: it is read-only. .anatomy/board.json is unchanged.\n' })
  })

  it('does not overwrite a board that changed while the patch was applied', () => {
    const map = new Map([[BOARD, pretty(baseBoard())], ['.anatomy/patch.json', JSON.stringify([replaceSummary])]])
    const io = memoryIo(map)
    const read = io.read
    let boardReads = 0
    io.read = (path) => {
      if (path === BOARD && ++boardReads === 2) map.set(BOARD, pretty({ ...baseBoard(), title: 'Edited meanwhile' }))
      return read(path)
    }
    const r = runAnatomy(['apply'], io)
    expect(r.code).toBe(2)
    expect(r.stderr).toBe('.anatomy/board.json changed while the patch was applied. Nothing was written. Run the command again.\n')
    expect(JSON.parse(map.get(BOARD)!).title).toBe('Edited meanwhile')
  })
})

describe('reading the patch', () => {
  it('reads patch.json next to the board by default, a named file, or stdin', () => {
    expect(apply([replaceSummary]).code).toBe(0)
    const named = new Map([[BOARD, pretty(baseBoard())], ['fix.json', JSON.stringify([replaceSummary])]])
    expect(runAnatomy(['apply', 'fix.json'], memoryIo(named)).code).toBe(0)
    const piped = new Map([[BOARD, pretty(baseBoard())]])
    expect(runAnatomy(['apply', '-'], memoryIo(piped, undefined, JSON.stringify([replaceSummary]))).code).toBe(0)
    expect(runAnatomy(['apply', '-'], memoryIo(piped)).stderr).toBe('Cannot read the patch from stdin: nothing was piped in.\n')
  })

  it('exits 2 when a file cannot be read', () => {
    expect(runAnatomy(['apply'], memoryIo(new Map())).stderr).toBe('Cannot read .anatomy/board.json: no such file.\n')
    expect(runAnatomy(['apply'], memoryIo(new Map([[BOARD, pretty(baseBoard())]]))).stderr).toBe('Cannot read .anatomy/patch.json: no such file.\n')
  })

  it('exits 2 on wrong usage', () => {
    for (const args of [['apply', 'a.json', 'b.json'], ['apply', '--base'], ['apply', '--base', 'x'], ['apply', '--base', '0'], ['apply', '--strict'], ['apply', '--nope'], ['fmt', '--dry-run']]) {
      expect(runAnatomy(args, memoryIo(new Map())).code, args.join(' ')).toBe(2)
    }
  })

  it('is in the help', () => {
    const help = runAnatomy(['help'], memoryIo(new Map())).stdout
    for (const word of ['apply [patch|-]', '--base N', '--cascade', '--dry-run', 'board.prev.json']) expect(help).toContain(word)
  })
})

describe('round trips on real boards', () => {
  const sources = import.meta.glob(['../examples/*.board.json', '../../e2e/fixtures/*.board.json', '../../eval/tasks/*/board.json'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const boards = Object.entries(sources).filter(([, text]) => parseBoard(text).ok)

  function applyOps(text: string, ops: unknown[], args: string[] = []) {
    const map = new Map([[BOARD, text]])
    const result = runAnatomy(['apply', '-', ...args], memoryIo(map, undefined, JSON.stringify(ops)))
    return { ...result, text: map.get(BOARD)! }
  }

  it('finds example boards to test', () => {
    expect(boards.length).toBeGreaterThanOrEqual(8)
  })

  it.each(boards)('turns %s into a changed copy, byte for byte after fmt', (_name, text) => {
    const a = JSON.parse(text) as ReturnType<typeof baseBoard>
    for (let seed = 1; seed <= 12; seed++) {
      const b = changedCopy(a, seed, 1 + (seed % 4))
      expect(parseBoard(JSON.stringify(b)).ok, `seed ${seed} makes a valid board`).toBe(true)
      const ops = diffOps(a, b)
      if (ops.length === 0) continue
      const done = applyOps(text, ops, ['--base', String(a.revision)])
      expect(done.stdout, `seed ${seed}`).toMatch(/^[^\n]*: applied, revision/)
      expect(done.text, `seed ${seed}`).toBe(pretty({ ...b, revision: a.revision + 1 }))
    }
  })

  it.each(boards)('undoes its own changes on %s with the inverse patch', (_name, text) => {
    const a = JSON.parse(text) as ReturnType<typeof baseBoard>
    for (let seed = 100; seed < 110; seed++) {
      const b = changedCopy(a, seed, 4)
      const forward = diffOps(a, b)
      if (forward.length === 0) continue
      const there = applyOps(text, [{ op: 'test', path: '/revision', value: a.revision }, ...forward])
      expect(there.code, `seed ${seed}: ${there.stdout}`).toBe(0)
      const inverse = diffOps(JSON.parse(there.text), a)
      const back = applyOps(there.text, [{ op: 'test', path: '/revision', value: a.revision + 1 }, ...inverse])
      expect(back.code, `seed ${seed}: ${back.stdout}`).toBe(0)
      expect(back.text, `seed ${seed}`).toBe(pretty({ ...a, revision: a.revision + 2 }))
    }
  })

  it('the same patch twice changes the board once', () => {
    const [, text] = boards[0]!
    const a = JSON.parse(text) as ReturnType<typeof baseBoard>
    const ops = diffOps(a, changedCopy(a, 7, 3))
    const once = applyOps(text, ops)
    expect(once.code).toBe(0)
    const twice = applyOps(once.text, ops)
    expect(twice.code).toBe(1)
    expect(twice.text).toBe(once.text)
  })
})
