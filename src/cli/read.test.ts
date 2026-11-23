import { describe, expect, it } from 'vitest'
import exampleFeedback from './fixtures/anatomy-example.feedback.json?raw'
import exampleBoard from '../examples/anatomy.board.json?raw'
import { runAnatomy } from './anatomy'
import { baseBoard, CORPUS, INVALID_CASES, memoryIo, runCase, VALID_CASES } from './corpus'

// `feedback`, `outline`, and `show` read the board and the feedback file and print them in a compact form.
// An agent that answers feedback should never need the whole board or the raw feedback.json.

/** Characters that can move the cursor, clear the screen, or reorder text. A newline (U+000A) separates lines, so it is allowed. */
const CONTROL = new RegExp('[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069]')

const BOARD = '.anatomy/board.json'
const FEEDBACK = '.anatomy/feedback.json'

function run(args: string[], files: Record<string, string>) {
  return runAnatomy(args, memoryIo(new Map(Object.entries(files))))
}

const base = (): string => `${JSON.stringify(baseBoard(), null, 2)}\n`
const feedbackOf = (extra: object = {}) =>
  JSON.stringify({ ...(JSON.parse(CORPUS.find((c) => c.name === 'feedback not answered yet')!.feedback!) as object), ...extra })

/** Text is stable across JSON parsers: the golden file leaves their own words out. */
const stable = (text: string) => text.replace(/(is not valid JSON: ).*/g, '$1<parser message>')

describe('the golden output', () => {
  it('matches read.golden.txt for every corpus board and the example with its feedback', async () => {
    const section = (title: string, result: { code: number; stdout: string; stderr: string }) =>
      `## ${title}\n(exit ${result.code})\n${stable(result.stdout + result.stderr)}`
    const parts: string[] = []
    for (const c of CORPUS) {
      const files: Record<string, string> = { [BOARD]: c.text }
      if (c.feedback !== undefined) files[FEEDBACK] = c.feedback
      parts.push(section(`${c.name}: outline`, run(['outline'], files)))
      if (c.feedback !== undefined) parts.push(section(`${c.name}: feedback`, run(['feedback'], files)))
    }
    const base = CORPUS.find((c) => c.name === 'base board')!
    const filesOfBase = { [BOARD]: base.text }
    parts.push(section('base board: show a part, a connection, an item, a group, a scenario', run(['show', 'payment', 'api-to-payment', 'q-timeout', 'backend', 'place-order'], filesOfBase)))
    parts.push(section('base board: show with unknown IDs', run(['show', 'paymnt', 'cart', 'zzzzzz', 'cart'], filesOfBase)))
    parts.push(section('base board: show --json', run(['show', 'payment', 'nope', '--json'], filesOfBase)))
    parts.push(section('base board: outline --json', run(['outline', '--json'], filesOfBase)))
    const files = { [BOARD]: exampleBoard, [FEEDBACK]: exampleFeedback }
    parts.push(section('example board: outline', run(['outline'], files)))
    parts.push(section('example board: feedback', run(['feedback'], files)))
    parts.push(section('example board: feedback --json', run(['feedback', '--json'], files)))
    parts.push(section('example board: show', run(['show', 'validator', 'agent-writes-file', 'open-a-board'], files)))
    await expect(parts.join('\n')).toMatchFileSnapshot('./read.golden.txt')
  })
})

describe('feedback', () => {
  it('lists each open item with its ID, type, target, and text, and leaves the withdrawn ones out', () => {
    const result = run(['feedback'], { [BOARD]: base(), [FEEDBACK]: feedbackOf() })
    expect(result.code).toBe(0)
    const lines = result.stdout.trimEnd().split('\n')
    expect(lines[0]).toBe('feedback-k2m9x0q4z7ab  board shop  base rev 3  3 items, 1 withdrawn not shown')
    expect(lines[1]).toContain('note-a1b2c3d4e5f6  question')
    expect(lines[1]).toContain('"What happens when the payment call times out?"')
    expect(result.stdout).not.toContain('note-old000000001')
  })

  it('says how the board moved on since the feedback was made', () => {
    const board = JSON.stringify({ ...baseBoard(), revision: 5 })
    expect(run(['feedback'], { [BOARD]: board, [FEEDBACK]: feedbackOf() }).stdout.split('\n')[0]).toContain('board now rev 5')
    const other = JSON.stringify({ ...baseBoard(), id: 'elsewhere' })
    expect(run(['feedback'], { [BOARD]: other, [FEEDBACK]: feedbackOf() }).stdout.split('\n')[0]).toContain('board is "elsewhere"')
  })

  it('works when the board cannot be read, because it only needs the feedback', () => {
    const result = run(['feedback'], { [FEEDBACK]: feedbackOf() })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('note-a1b2c3d4e5f6')
  })

  it('handles an empty feedback file', () => {
    const result = run(['feedback'], { [BOARD]: base(), [FEEDBACK]: feedbackOf({ items: [], withdrawn: [] }) })
    expect(result).toEqual({ code: 0, stdout: 'feedback-k2m9x0q4z7ab  board shop  base rev 3  no open items\n', stderr: '' })
    const withdrawn = run(['feedback'], { [BOARD]: base(), [FEEDBACK]: feedbackOf({ items: [], withdrawn: ['a', 'b'] }) })
    expect(withdrawn.stdout).toBe('feedback-k2m9x0q4z7ab  board shop  base rev 3  no open items, 2 withdrawn not shown\n')
  })

  it('exits 2 and says so when there is no feedback file', () => {
    const result = run(['feedback'], { [BOARD]: base() })
    expect(result.code).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('Cannot read .anatomy/feedback.json: no such file. The user sends feedback from Anatomy.\n')
  })

  it('exits 2 for a file that is not feedback, and for text that is not JSON', () => {
    const other = run(['feedback'], { [FEEDBACK]: '{ "format": "something-else" }' })
    expect(other.code).toBe(2)
    expect(other.stderr).toBe('.anatomy/feedback.json is not a feedback file.\n')
    expect(run(['feedback'], { [FEEDBACK]: '{ nope' }).code).toBe(2)
  })

  it('reads feedback next to the board named with --board', () => {
    const result = run(['feedback', '--board', 'other/board.json'], { 'other/board.json': base(), 'other/feedback.json': feedbackOf() })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('note-a1b2c3d4e5f6')
  })

  it('describes every item type and shows the snapshot only when the target changed', () => {
    const result = run(['feedback'], { [BOARD]: exampleBoard, [FEEDBACK]: exampleFeedback })
    const out = result.stdout
    for (const type of ['question', 'note', 'link', 'reconnect', 'new-part', 'drawing', 'shape', 'arrow', 'sticky']) expect(out, type).toMatch(new RegExp(`  ${type}  `))
    expect(out).toContain('possibly-outdated')
    expect(out).toContain('needs-relinking')
    // The question has no status, so its snapshot is left out.
    expect(out).not.toContain('Checks every board file.')
    // The note with a status shows what it said.
    expect(out).toContain('sends-data-to')
    expect(out.trimEnd().split('\n').length).toBeLessThan(20)
  })

  it('prints every item of an arbitrary feedback file, even with fields missing or of the wrong type', () => {
    const items = [{ id: 'a', type: 'question' }, { id: 'b', type: 'reconnect', connection: 7 }, { id: 'c', type: 'mystery', x: 1 }, { type: 'note' }, 'text', null, { id: 'd', type: 'arrow', from: [] }]
    const result = run(['feedback'], { [FEEDBACK]: feedbackOf({ items }) })
    expect(result.code).toBe(0)
    for (const id of ['a', 'b', 'c', 'd']) expect(result.stdout).toMatch(new RegExp(`^${id}  `, 'm'))
    expect(result.stdout).toContain('3 items not readable')
  })

  it('cuts a very long text and a very large file', () => {
    const items = Array.from({ length: 400 }, (_, i) => ({ id: `n-${i}`, type: 'note', text: 'word '.repeat(2000), about: { type: 'board' } }))
    const result = run(['feedback'], { [FEEDBACK]: feedbackOf({ items }) })
    const lines = result.stdout.trimEnd().split('\n')
    expect(lines.length).toBeLessThan(320)
    expect(result.stdout).toContain('100 more items are not shown.')
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThan(1000)
    expect(lines[1]).toContain('(10,000 characters)')
  })

  it('prints no terminal control character from the user text, the labels, or the IDs', () => {
    const evil = 'a\u001b[2Jb\u0007c\u0085d\u202ee\u2028f\r\ng\u009bh'
    const items = [{ id: 'n\u001b1', type: 'note', text: evil, about: { type: 'component', id: 'p', label: evil } }]
    for (const args of [['feedback'], ['feedback', '--json']]) {
      const result = run(args, { [FEEDBACK]: feedbackOf({ items }) })
      expect(result.stdout, args.join(' ')).not.toMatch(CONTROL)
      expect(result.stdout.trimEnd().split('\n').length).toBe(args.includes('--json') ? 1 : 3 + 1)
    }
  })

  it('prints one JSON object with --json', () => {
    const result = run(['feedback', '--json'], { [BOARD]: base(), [FEEDBACK]: feedbackOf() })
    expect(result.stdout.endsWith('\n')).toBe(true)
    expect(result.stdout.trimEnd().includes('\n')).toBe(false)
    const report = JSON.parse(result.stdout) as Record<string, any>
    expect(report).toMatchObject({ id: 'feedback-k2m9x0q4z7ab', boardId: 'shop', baseRevision: 3, boardRevision: 3, withdrawn: 1, omittedItems: 0, unreadableItems: 0 })
    expect(report.items[0]).toMatchObject({ id: 'note-a1b2c3d4e5f6', type: 'question', text: 'What happens when the payment call times out?' })
  })

  it('exits 2 for usage errors', () => {
    expect(run(['feedback', 'x.json'], {}).code).toBe(2)
    expect(run(['feedback', '--strict'], {}).code).toBe(2)
    expect(run(['feedback', '--base', '3'], {}).code).toBe(2)
  })
})

describe('outline', () => {
  it('prints one line per part and per connection, then the groups, items, and scenarios', () => {
    const result = run(['outline'], { [BOARD]: base() })
    expect(result.code).toBe(0)
    const lines = result.stdout.trimEnd().split('\n')
    expect(lines[0]).toBe('shop  rev 3  "How an order moves through the shop"')
    expect(result.stdout).toContain('cart  "Cart"  frontend')
    expect(result.stdout).toContain('api-to-payment  api > payment  calls  "charge"')
    expect(result.stdout).toContain('question 1: q-timeout')
    expect(result.stdout).toContain('place-order  "Place an order"  3 steps')
    // No summaries and no explanations.
    expect(result.stdout).not.toContain('Charges the card')
  })

  it('is far smaller than the board', () => {
    const result = run(['outline'], { [BOARD]: exampleBoard })
    expect(result.stdout.length).toBeLessThan(exampleBoard.length / 4)
  })

  it('exits 1 and points at validate when the board is invalid, and 2 when it is missing', () => {
    const broken = INVALID_CASES.find((c) => c.name === 'missing title')!
    const result = runCase(broken, ['outline'])
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('.anatomy/board.json: invalid, 1 error. Run validate to see them.\n')
    expect(run(['outline'], {})).toEqual({ code: 2, stdout: '', stderr: 'Cannot read .anatomy/board.json: no such file.\n' })
  })

  it('runs on every valid corpus board and every example', () => {
    for (const c of VALID_CASES) expect(runCase(c, ['outline']).code, c.name).toBe(0)
  })

  it('counts what it leaves out when a section is long', () => {
    const board = baseBoard()
    for (let i = 0; i < 130; i++) board.relationships.push({ id: `extra-${i}`, from: 'api', to: 'cart', kind: 'calls', label: 'call', source: { kind: 'agent-proposal' } })
    const result = run(['outline'], { [BOARD]: JSON.stringify(board) })
    expect(result.stdout).toContain('35 more connections are not shown.')
    expect(result.stdout.trimEnd().split('\n').length).toBeLessThan(140)
  })

  it('prints no terminal control character from labels and IDs', () => {
    const board = baseBoard()
    board.components[0].label = 'Cart\u001b[2J\u202e'
    board.title = 'Shop\u0007\u0085'
    for (const args of [['outline'], ['outline', '--json']]) {
      const result = run(args, { [BOARD]: JSON.stringify(board) })
      expect(result.code).toBe(0)
      expect(result.stdout).not.toMatch(CONTROL)
    }
  })

  it('prints one JSON object with --json', () => {
    const result = run(['outline', '--json'], { [BOARD]: base() })
    const report = JSON.parse(result.stdout) as Record<string, any>
    expect(report).toMatchObject({ id: 'shop', revision: 3, title: 'How an order moves through the shop' })
    expect(report.components).toHaveLength(6)
    expect(report.components[0]).toEqual({ id: 'cart', label: 'Cart', group: 'frontend' })
    expect(report.connections[2]).toEqual({ id: 'api-to-payment', from: 'api', to: 'payment', kind: 'calls', label: 'charge' })
    expect(report.items).toEqual({ question: ['q-timeout'] })
    expect(report.scenarios).toEqual([{ id: 'place-order', title: 'Place an order', steps: 3 }])
  })

  it('takes no file and no ID', () => {
    expect(run(['outline', 'x.json'], { [BOARD]: base() }).code).toBe(2)
    expect(run(['outline', '--dry-run'], { [BOARD]: base() }).code).toBe(2)
  })
})

describe('show', () => {
  it('prints the full JSON of the named parts, by ID, from every list', () => {
    const result = run(['show', 'payment', 'api-to-payment', 'q-timeout', 'backend', 'place-order'], { [BOARD]: base() })
    expect(result.code).toBe(0)
    const sections = result.stdout.split(/^(?=\S+\/\S+$)/m)
    expect(sections).toHaveLength(5)
    expect(result.stdout).toMatch(/^components\/payment$/m)
    expect(result.stdout).toMatch(/^relationships\/api-to-payment$/m)
    expect(result.stdout).toMatch(/^items\/q-timeout$/m)
    expect(result.stdout).toMatch(/^groups\/backend$/m)
    expect(result.stdout).toMatch(/^scenarios\/place-order$/m)
    expect(result.stdout).toContain('"summary": "Charges the card through the provider."')
    expect(result.stdout).toContain('"caption": "The API charges the card."')
  })

  it('prints each part exactly as the board holds it', () => {
    const result = run(['show', 'cart', '--json'], { [BOARD]: base() })
    const report = JSON.parse(result.stdout) as { items: { list: string; value: unknown }[] }
    expect(report.items).toEqual([{ list: 'components', id: 'cart', value: baseBoard().components[0] }])
  })

  it('suggests the nearest ID for an unknown one, still prints the others, and exits 1', () => {
    const result = run(['show', 'paymnt', 'cart', 'zzzzzz', 'cart'], { [BOARD]: base() })
    expect(result.code).toBe(1)
    expect(result.stdout).toMatch(/^components\/cart$/m)
    // A repeated ID is printed once.
    expect(result.stdout.match(/^components\/cart$/gm)).toHaveLength(1)
    expect(result.stdout).toContain('Unknown ID "paymnt". Did you mean "payment"?')
    expect(result.stdout).toContain('Unknown ID "zzzzzz".')
    expect(result.stdout).not.toContain('Unknown ID "zzzzzz". Did')
    expect(result.stderr).toBe('')
  })

  it('puts the unknown IDs in --json', () => {
    const result = run(['show', 'payment', 'paymnt', '--json'], { [BOARD]: base() })
    expect(result.code).toBe(1)
    const report = JSON.parse(result.stdout) as Record<string, any>
    expect(report.unknown).toEqual([{ id: 'paymnt', hint: 'Did you mean "payment"?' }])
    expect(report.items).toHaveLength(1)
  })

  it('needs an ID, and takes at most 20', () => {
    const none = run(['show'], { [BOARD]: base() })
    expect(none.code).toBe(2)
    expect(none.stderr).toContain('show needs at least one ID. Run outline to list them.')
    const many = run(['show', ...Array.from({ length: 21 }, (_, i) => `part-${i}`)], { [BOARD]: base() })
    expect(many.code).toBe(2)
    expect(many.stderr).toContain('Give at most 20 IDs.')
  })

  it('stops before a part that would pass the line cap, and names what it left out', () => {
    const board = baseBoard()
    board.scenarios = Array.from({ length: 10 }, (_, i) => ({
      id: `walk-${i}`,
      title: `Walk ${i}`,
      steps: Array.from({ length: 50 }, (_, j) => ({ caption: `Step ${j}.`, highlight: ['cart', 'api'] })),
    }))
    const ids = board.scenarios.map((s: { id: string }) => s.id)
    const result = run(['show', ...ids], { [BOARD]: JSON.stringify(board) })
    expect(result.code).toBe(0)
    expect(result.stdout.trimEnd().split('\n').length).toBeLessThan(700)
    expect(result.stdout).toMatch(/not shown: walk-\d/)
    expect(result.stdout).toContain('scenarios/walk-0')
  })

  it('exits 1 for an invalid board and 2 for a missing one', () => {
    expect(runCase(INVALID_CASES.find((c) => c.name === 'missing title')!, ['show', 'cart']).code).toBe(1)
    expect(run(['show', 'cart'], {}).code).toBe(2)
  })

  it('prints no terminal control character, even from a long text', () => {
    const board = baseBoard()
    board.components[0].explanation = 'x\u001b[31m\u0085\u202e'
    board.components[0].label = 'Cart\u0007'
    for (const args of [['show', 'cart'], ['show', 'cart', '--json'], ['show', 'ca\u001brt']]) {
      const result = run(args, { [BOARD]: JSON.stringify(board) })
      expect(result.stdout + result.stderr, args.join(' ')).not.toMatch(CONTROL)
    }
  })

  it('rejects an option that belongs to another command', () => {
    expect(run(['show', 'cart', '--strict'], { [BOARD]: base() }).code).toBe(2)
    expect(run(['show', 'cart', '--cascade'], { [BOARD]: base() }).code).toBe(2)
  })
})

describe('the other commands', () => {
  it('escape control characters in what they print, so a board cannot write to the terminal', () => {
    const board = baseBoard()
    board.components[1].label = 'x'.repeat(10)
    board.relationships[0].to = 'a\u001b[2Jb'
    const result = run(['validate'], { [BOARD]: JSON.stringify(board) })
    expect(result.stdout).not.toMatch(CONTROL)
    expect(result.stdout).toContain('\\x1b')
  })

  it('lists the new commands in help', () => {
    const help = runAnatomy(['help'], memoryIo(new Map())).stdout
    for (const word of ['feedback', 'outline', 'show <id...>']) expect(help).toContain(word)
  })
})
