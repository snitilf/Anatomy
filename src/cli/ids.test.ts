import { describe, expect, it } from 'vitest'
import { inSchemaOrder } from '../board/shape'
import { runAnatomy } from './anatomy'
import { baseBoard, memoryIo } from './corpus'

const BOARD = '.anatomy/board.json'
const PREV = '.anatomy/board.prev.json'
const pretty = (board: unknown) => `${JSON.stringify(inSchemaOrder(board), null, 2)}\n`
type Json = Record<string, any>

/** The base board, changed by `change`, with the files next to it. */
function setup(change: (board: Json) => void = () => {}, files: Record<string, string> = {}, stdin?: string) {
  const board = baseBoard()
  change(board)
  const map = new Map<string, string>([[BOARD, pretty(board)], ...Object.entries(files)])
  const io = memoryIo(map, undefined, stdin)
  return { map, io, run: (...args: string[]) => runAnatomy(args, io), board: () => JSON.parse(map.get(BOARD)!) as Json }
}

const part = { label: 'Queue', summary: 'Holds jobs.', source: { kind: 'agent-explanation' } }
const addPart = (value: unknown, path = '/components') => ({ op: 'add', path, value })

describe('anatomy id', () => {
  it('prints a slug of the label', () => {
    expect(setup().run('id', 'Payment step')).toEqual({ code: 0, stdout: 'payment-step\n', stderr: '' })
  })

  it('adds -2, then -3, when the slug is taken by any kind of item on the board', () => {
    const s = setup((b) => {
      b.components.push({ ...part, id: 'payment-step' })
      b.items.push({ id: 'payment-step-2', kind: 'question', text: 'Why?' })
    })
    expect(s.run('id', 'Payment step').stdout).toBe('payment-step-3\n')
    expect(s.run('id', 'Payment Step!').stdout).toBe('payment-step-3\n')
  })

  it('treats the ID of the board, a group, and a scenario as taken', () => {
    const s = setup()
    expect(s.run('id', 'Shop').stdout).toBe('shop-2\n')
    expect(s.run('id', 'Backend').stdout).toBe('backend-2\n')
    expect(s.run('id', 'Place an order').stdout).toBe('place-an-order-2\n')
  })

  it('counts on from a label that already ends in a number', () => {
    const s = setup((b) => b.components.push({ ...part, id: 'step-2' }))
    expect(s.run('id', 'Step 2').stdout).toBe('step-3\n')
  })

  it('makes a valid ID from accents, capitals, symbols, and spaces', () => {
    const s = setup()
    expect(s.run('id', '  Café: Ünïcode & Co.  ').stdout).toBe('cafe-unicode-co\n')
    expect(s.run('id', 'a_b/c').stdout).toBe('a-b-c\n')
  })

  it('keeps the ID within 64 characters and never ends it with a hyphen', () => {
    const long = `${'word '.repeat(40)}`
    const out = setup().run('id', long).stdout.trim()
    expect(out.length).toBeLessThanOrEqual(64)
    expect(out).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    const s = setup((b) => b.components.push({ ...part, id: out }))
    const next = s.run('id', long).stdout.trim()
    expect(next.length).toBeLessThanOrEqual(64)
    expect(next).toMatch(/-2$/)
    expect(next).not.toBe(out)
  })

  it('works before a board exists', () => {
    expect(runAnatomy(['id', 'Payment step'], memoryIo(new Map())).stdout).toBe('payment-step\n')
  })

  it('reads the board named by --board', () => {
    const s = setup((b) => b.components.push({ ...part, id: 'queue' }))
    s.map.set('work/draft.json', pretty({ ...baseBoard(), components: [] }))
    expect(s.run('id', 'Queue', '--board', 'work/draft.json').stdout).toBe('queue\n')
    expect(s.run('id', 'Queue').stdout).toBe('queue-2\n')
  })

  it('prints one JSON object with --json', () => {
    expect(setup().run('id', 'Payment step', '--json')).toEqual({ code: 0, stdout: '{"id":"payment-step"}\n', stderr: '' })
  })

  it('writes nothing', () => {
    const s = setup()
    s.run('id', 'Payment step')
    expect(s.io.written).toEqual([])
  })

  it('exits 2 when the label has nothing to make an ID from', () => {
    for (const label of ['日本語', '---', '   ', '']) {
      const r = setup().run('id', label)
      expect(r.code, label).toBe(2)
      expect(r.stdout).toBe('')
      expect(r.stderr).toContain('letters or digits')
    }
  })

  it('exits 2 on wrong usage', () => {
    for (const args of [['id'], ['id', 'a', 'b'], ['id', 'a', '--strict'], ['id', 'a', '--nope'], ['id', 'a', '--base', '3']]) {
      expect(setup().run(...args).code, args.join(' ')).toBe(2)
    }
  })

  it('exits 2 when the board is not readable JSON', () => {
    const r = setup(() => {}, { [BOARD]: '{ nope' }).run('id', 'Queue')
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('.anatomy/board.json')
  })

  it('is in the help', () => {
    expect(setup().run('help').stdout).toContain('id <label>')
  })
})

describe('apply assigns missing IDs', () => {
  const apply = (ops: unknown[], args: string[] = []) => {
    const s = setup(() => {}, { '.anatomy/patch.json': JSON.stringify(ops) })
    return { ...s.run('apply', ...args), board: s.board, files: s.map }
  }

  it('gives an added part an ID from its label and prints the map', () => {
    const r = apply([addPart(part)])
    expect(r.code).toBe(0)
    expect(r.board().components.at(-1).id).toBe('queue')
    expect(r.stdout).toBe('.anatomy/board.json: applied, revision 3 to 4\n+ components/queue\nops[0] ID: queue\n')
  })

  it('prints the map in --json', () => {
    const r = apply([addPart(part)], ['--json'])
    expect(JSON.parse(r.stdout)).toMatchObject({ applied: true, assigned: [{ op: 0, id: 'queue' }], omittedAssigned: 0 })
  })

  it('prints no map and no "assigned" lines when every ID was given', () => {
    const r = apply([addPart({ ...part, id: 'queue' })])
    expect(r.stdout).not.toContain('ID:')
    expect(JSON.parse(apply([addPart({ ...part, id: 'queue' })], ['--json']).stdout).assigned).toEqual([])
  })

  it('takes a free ID when the slug is taken, also by an item added earlier in the patch', () => {
    const r = apply([addPart(part), addPart({ ...part, label: 'Queue!' }), addPart({ ...part, label: 'Payment' })])
    expect(r.board().components.slice(-3).map((c: Json) => c.id)).toEqual(['queue', 'queue-2', 'payment-2'])
    expect(r.stdout).toContain('ops[1] ID: queue-2')
  })

  it('uses the title of a scenario, the label of a group, and the text of an item', () => {
    const r = apply([
      addPart({ title: 'Refund an order', steps: [{ caption: 'The customer asks.', highlight: ['cart'] }] }, '/scenarios'),
      addPart({ label: 'Data' }, '/groups'),
      addPart({ kind: 'question', text: 'Who pays for retries?' }, '/items'),
    ])
    expect(r.code, r.stdout).toBe(0)
    expect(r.board().scenarios.at(-1).id).toBe('refund-an-order')
    expect(r.board().groups.at(-1).id).toBe('data')
    expect(r.board().items.at(-1).id).toBe('who-pays-for-retries')
  })

  it('names a connection from its ends, and a second one between the same parts gets -2', () => {
    const link = { from: 'cart', to: 'api', kind: 'calls', label: 'prices', source: { kind: 'agent-explanation' } }
    const r = apply([addPart(link, '/relationships'), addPart(link, '/relationships')])
    expect(r.code, r.stdout).toBe(0)
    expect(r.board().relationships.slice(-2).map((x: Json) => x.id)).toEqual(['cart-to-api', 'cart-to-api-2'])
  })

  it('still refuses an added item that has neither an ID nor a label', () => {
    const r = apply([addPart({ summary: 'Holds jobs.', source: { kind: 'agent-explanation' } })])
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('ops[0] missing-id')
    expect(r.files.get(PREV)).toBeUndefined()
  })

  it('still refuses when the label has no letters or digits', () => {
    const r = apply([addPart({ ...part, label: '日本語' })])
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('ops[0] missing-id')
    expect(r.stdout).toContain('letters or digits')
  })

  it('keeps an ID the patch gives', () => {
    expect(apply([addPart({ ...part, id: 'jobs' })]).board().components.at(-1).id).toBe('jobs')
  })

  it('assigns IDs in a dry run too, and writes nothing', () => {
    const r = apply([addPart(part)], ['--dry-run'])
    expect(r.stdout).toContain('ops[0] ID: queue')
    expect(r.files.get(PREV)).toBeUndefined()
  })

  it('respects "before" when the ID is assigned', () => {
    const r = apply([{ ...addPart(part), before: 'api' }])
    expect(r.board().components.map((c: Json) => c.id).slice(0, 4)).toEqual(['cart', 'checkout', 'queue', 'api'])
  })

  it('counts the lines of the map past 50', () => {
    const ops = Array.from({ length: 52 }, (_, i) => addPart({ ...part, label: `Queue ${i}` }, '/items').op && addPart({ kind: 'question', text: `Question number ${i}?` }, '/items'))
    const r = apply(ops)
    expect(r.code, r.stdout).toBe(0)
    expect(r.stdout).toContain('ID: ')
    expect(r.stdout).toContain('more IDs are not shown.')
  })
})

describe('fmt --bump', () => {
  it('raises the revision by one and writes it', () => {
    const s = setup()
    const r = s.run('fmt', '--bump')
    expect(r).toEqual({ code: 0, stdout: '.anatomy/board.json: formatted, valid, revision 3 to 4\n', stderr: '' })
    expect(s.board().revision).toBe(4)
    expect(s.io.written).toEqual([BOARD])
  })

  it('keeps the format of fmt, so a later fmt changes nothing', () => {
    const s = setup()
    s.run('fmt', '--bump')
    expect(s.run('fmt').stdout).toBe('.anatomy/board.json: already formatted, valid, revision 4\n')
  })

  it('formats a compact board while it raises the revision', () => {
    const s = setup(() => {}, { [BOARD]: JSON.stringify(baseBoard()) })
    s.run('fmt', '--bump')
    expect(s.map.get(BOARD)).toBe(pretty({ ...baseBoard(), revision: 4 }))
  })

  it('goes above the last version seen when the file fell back', () => {
    const s = setup((b) => (b.revision = 2), { [PREV]: pretty({ ...baseBoard(), revision: 5 }) })
    expect(s.run('fmt', '--bump').stdout).toContain('revision 2 to 6')
    expect(s.board().revision).toBe(6)
  })

  it('does not look at a prev file that is not a board', () => {
    const s = setup(() => {}, { [PREV]: 'not json' })
    expect(s.run('fmt', '--bump').stdout).toContain('revision 3 to 4')
  })

  it('writes nothing to an invalid board', () => {
    const s = setup((b) => delete b.title)
    const before = s.map.get(BOARD)
    const r = s.run('fmt', '--bump')
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('invalid')
    expect(s.map.get(BOARD)).toBe(before)
    expect(s.io.written).toEqual([])
  })

  it('writes one file only, and not board.prev.json', () => {
    const s = setup()
    s.run('fmt', '--bump')
    expect(s.map.has(PREV)).toBe(false)
  })

  it('reports in --json', () => {
    const report = JSON.parse(setup().run('fmt', '--bump', '--json').stdout)
    expect(report).toMatchObject({ valid: true, revision: 4, formatted: true, bumped: { from: 3, to: 4 } })
  })

  it('works only with fmt', () => {
    for (const command of ['validate', 'apply', 'outline']) {
      const r = setup().run(command, '--bump')
      expect(r.code, command).toBe(2)
      expect(r.stderr).toContain('"--bump" works only with fmt')
    }
  })

  it('is in the help', () => {
    expect(setup().run('help').stdout).toContain('--bump')
  })
})

describe('validate warns when the revision did not rise', () => {
  const prev = (revision: number) => ({ [PREV]: pretty({ ...baseBoard(), revision }) })

  it('is quiet when the revision is above the last version', () => {
    expect(setup(() => {}, prev(2)).run('validate').stdout).toBe('.anatomy/board.json: valid, revision 3\n')
  })

  it('is quiet when there is no board.prev.json, because there is nothing to compare', () => {
    expect(setup().run('validate', '--strict').code).toBe(0)
  })

  it('warns when the revision equals the last one', () => {
    const r = setup(() => {}, prev(3)).run('validate')
    expect(r.code).toBe(0)
    expect(r.stdout).toBe(
      '.anatomy/board.json: valid, revision 3, 1 warning\nrevision: Revision 3 is not above revision 3 of the last version, board.prev.json. Run fmt --bump.\n',
    )
  })

  it('warns when the revision is lower, and exits 1 with --strict', () => {
    const r = setup(() => {}, prev(7)).run('validate', '--strict')
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('Revision 3 is not above revision 7')
  })

  it('names the prev file after the board file', () => {
    const s = setup(() => {}, { 'work/draft.json': pretty(baseBoard()), 'work/draft.prev.json': pretty({ ...baseBoard(), revision: 3 }) })
    expect(s.run('validate', 'work/draft.json').stdout).toContain('work/draft.prev.json')
  })

  it('ignores a prev file that is not a board or has no revision', () => {
    for (const text of ['not json', '[]', '{"revision":"3"}', '{"revision":0}']) {
      expect(setup(() => {}, { [PREV]: text }).run('validate', '--strict').code, text).toBe(0)
    }
  })

  it('has the code revision-not-risen in --json', () => {
    const report = JSON.parse(setup(() => {}, prev(3)).run('validate', '--json').stdout)
    expect(report.warnings).toEqual([expect.objectContaining({ path: 'revision', code: 'revision-not-risen' })])
  })

  it('is quiet after apply, which raises the revision', () => {
    const s = setup(() => {}, { '.anatomy/patch.json': JSON.stringify([{ op: 'replace', path: '/title', value: 'A new title' }]) })
    expect(s.run('apply').code).toBe(0)
    expect(s.run('validate', '--strict').code).toBe(0)
  })

  it('is quiet after fmt --bump', () => {
    const s = setup(() => {}, prev(3))
    s.run('fmt', '--bump')
    expect(s.run('validate', '--strict').code).toBe(0)
  })
})

describe('validate warns about connections with no explanation', () => {
  const bare = (board: Json) => board.relationships.forEach((r: Json) => delete r.explanation)

  it('is quiet when every connection has an explanation', () => {
    expect(setup().run('validate', '--strict').code).toBe(0)
  })

  it('is quiet on a board with no connections', () => {
    expect(setup((b) => (b.relationships = [])).run('validate').stdout).not.toContain('explanation')
  })

  it('counts them once and names the first three', () => {
    const s = setup(bare)
    const r = s.run('validate')
    expect(r.code).toBe(0)
    const lines = r.stdout.trimEnd().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('.anatomy/board.json: valid, revision 3, 1 warning')
    expect(lines[1]).toBe(
      'relationships: 5 connections have no explanation: cart-to-checkout, checkout-to-api, api-to-payment, and 2 more. Say in one or two sentences why each exists, in "explanation".',
    )
  })

  it('names every ID when there are three or fewer, and says "1 connection has"', () => {
    const few = setup((b) => (b.relationships = b.relationships.slice(0, 3)))
    few.board()
    const one = setup((b) => {
      bare(b)
      b.relationships = b.relationships.slice(0, 1)
    })
    expect(one.run('validate').stdout).toContain('relationships: 1 connection has no explanation: cart-to-checkout.')
    const three = setup((b) => {
      bare(b)
      b.relationships = b.relationships.slice(0, 3)
    })
    expect(three.run('validate').stdout).toContain('3 connections have no explanation: cart-to-checkout, checkout-to-api, api-to-payment.')
  })

  it('has the code no-explanation in --json, and counts as one warning', () => {
    const report = JSON.parse(setup(bare).run('validate', '--json').stdout)
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0]).toMatchObject({ path: 'relationships', code: 'no-explanation' })
  })

  it('is also printed by apply', () => {
    const s = setup(() => {}, { '.anatomy/patch.json': JSON.stringify([addPart({ id: 'api-to-queue', from: 'api', to: 'warehouse', kind: 'calls', label: 'jobs', source: { kind: 'agent-explanation' } }, '/relationships')]) })
    expect(s.run('apply').stdout).toContain('relationships: 1 connection has no explanation: api-to-queue.')
  })
})
