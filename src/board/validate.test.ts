import { describe, expect, it } from 'vitest'
import anatomyText from '../examples/anatomy.board.json?raw'
import claudeCodeText from '../examples/claude-code-harness.board.json?raw'
import llmText from '../examples/how-an-llm-works.board.json?raw'
import refundText from '../../e2e/fixtures/refund-approval.board.json?raw'
import { LIMITS } from './schema'
import { parseBoard, type BoardProblem, type ParseResult } from './validate'

/** A small valid board. Each test copies it and breaks one thing. */
function minimalBoard(): Record<string, any> {
  return {
    format: 'anatomy-board',
    schemaVersion: 1,
    id: 'tiny',
    revision: 1,
    title: 'Tiny board',
    goal: 'Show two parts and one connection.',
    scope: { includes: ['Two parts'], excludes: [] },
    groups: [{ id: 'backend', label: 'Backend' }],
    components: [
      { id: 'api', label: 'API', summary: 'Answers requests.', group: 'backend', source: { kind: 'agent-explanation' } },
      { id: 'db', label: 'Database', summary: 'Keeps records.', source: { kind: 'agent-proposal' } },
    ],
    relationships: [
      { id: 'api-to-db', from: 'api', to: 'db', kind: 'stores-in', label: 'records', source: { kind: 'agent-explanation' } },
    ],
    items: [{ id: 'q-backup', kind: 'question', text: 'Who backs up the database?', about: 'db' }],
    scenarios: [{ id: 'save', title: 'Save a record', steps: [{ caption: 'The API stores a record.', highlight: ['api', 'api-to-db'] }] }],
  }
}

function parse(data: unknown): ParseResult {
  return parseBoard(JSON.stringify(data))
}

function errorsOf(result: ParseResult) {
  if (result.ok) throw new Error('expected the board to be rejected')
  return result.errors
}

function expectError(result: ParseResult, path: string, message: RegExp) {
  expect(errorsOf(result)).toContainEqual(expect.objectContaining({ path, message: expect.stringMatching(message) }))
}

describe('example boards', () => {
  it.each([
    ['Refund approval', refundText],
    ['Claude Code harness', claudeCodeText],
    ['Large language model', llmText],
    ['Anatomy', anatomyText],
  ])('accepts the %s example without warnings', (_name, text) => {
    const result = parseBoard(text)
    expect(result.ok ? result.warnings : result.errors).toEqual([])
  })

  it('accepts the minimal board and fills in defaults', () => {
    const data = minimalBoard()
    delete data.items
    const result = parseBoard(JSON.stringify(data))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.board.items).toEqual([])
      expect(result.board.components[0]?.inputs).toEqual([])
    }
  })
})

describe('files that are not boards', () => {
  it('rejects text that is not JSON', () => {
    expectError(parseBoard('{ "format": '), '', /not valid JSON/)
  })

  it('rejects a JSON array', () => {
    expectError(parseBoard('[]'), '', /one JSON object/)
  })

  it('rejects a JSON file without the board format marker', () => {
    expectError(parse({ name: 'package' }), 'format', /not an Anatomy board/)
  })

  it('names the version when the schema version is unsupported', () => {
    expectError(parse({ ...minimalBoard(), schemaVersion: 2 }), 'schemaVersion', /version 2.*supports version 1/)
  })

  it('accepts a file that starts with a byte order mark', () => {
    expect(parseBoard(`\uFEFF${JSON.stringify(minimalBoard())}`).ok).toBe(true)
  })

  it('counts bytes, not characters, for the size limit', () => {
    const text = JSON.stringify({ ...minimalBoard(), goal: 'é'.repeat(LIMITS.fileBytes / 2) })
    expect(text.length).toBeLessThan(LIMITS.fileBytes)
    expectError(parseBoard(text), '', /bytes/)
  })

  it('rejects a file over the size limit before parsing it', () => {
    const huge = `{"padding":"${'x'.repeat(LIMITS.fileBytes)}"}`
    expectError(parseBoard(huge), '', /The limit is 1,000,000 bytes/)
  })
})

describe('IDs', () => {
  it('rejects an ID with spaces or capitals', () => {
    const data = minimalBoard()
    data.components[0].id = 'Rule Check'
    expectError(parse(data), 'components[0].id', /lowercase/)
  })

  it('rejects the same ID used for a component and a relationship', () => {
    const data = minimalBoard()
    data.relationships[0].id = 'api'
    expectError(parse(data), 'relationships[0].id', /"api" is already used at components\[0\]\.id/)
  })

  it('rejects two components with the same ID', () => {
    const data = minimalBoard()
    data.components[1].id = 'api'
    data.relationships[0].to = 'api'
    expectError(parse(data), 'components[1].id', /already used/)
  })
})

describe('references between parts', () => {
  it('rejects a relationship that points to a missing component', () => {
    const data = minimalBoard()
    data.relationships[0].to = 'databse'
    expectError(parse(data), 'relationships[0].to', /"databse", which is not a component/)
  })

  it('rejects a relationship whose endpoint is another relationship', () => {
    const data = minimalBoard()
    data.relationships.push({ id: 'loop', from: 'api', to: 'api-to-db', kind: 'calls', label: 'x', source: { kind: 'agent-proposal' } })
    expectError(parse(data), 'relationships[1].to', /not a component/)
  })

  it('rejects a component in a group that does not exist', () => {
    const data = minimalBoard()
    data.components[1].group = 'frontend'
    expectError(parse(data), 'components[1].group', /"frontend", which is not a group/)
  })

  it('rejects a question about a missing target', () => {
    const data = minimalBoard()
    data.items[0].about = 'cache'
    expectError(parse(data), 'items[0].about', /question "q-backup" is about "cache"/)
  })

  it('rejects a scenario step that highlights a missing target', () => {
    const data = minimalBoard()
    data.scenarios[0].steps[0].highlight.push('cache')
    expectError(parse(data), 'scenarios[0].steps[0].highlight[2]', /Step 1 of scenario "save" highlights "cache"/)
  })

  it('reports every broken reference, not only the first', () => {
    const data = minimalBoard()
    data.relationships[0].from = 'a'
    data.relationships[0].to = 'b'
    expect(errorsOf(parse(data))).toHaveLength(2)
  })
})

describe('meaning and sources', () => {
  it('rejects a relationship kind outside the fixed list', () => {
    const data = minimalBoard()
    data.relationships[0].kind = 'talks-to'
    expectError(parse(data), 'relationships[0].kind', /.+/)
  })

  it('rejects a source kind that version 1 does not support', () => {
    const data = minimalBoard()
    data.components[0].source.kind = 'code-derived'
    expectError(parse(data), 'components[0].source.kind', /.+/)
  })

  it('requires a reference for documented intent', () => {
    const data = minimalBoard()
    data.components[0].source = { kind: 'documented-intent' }
    expectError(parse(data), 'components[0].source.references', /at least one reference/)
  })

  it('rejects a scenario without steps', () => {
    const data = minimalBoard()
    data.scenarios[0].steps = []
    expectError(parse(data), 'scenarios[0].steps', /at least one step/)
  })
})

describe('unexpected or unsafe content', () => {
  it('rejects a misspelled field instead of ignoring it', () => {
    const data = minimalBoard()
    data.components[0].lable = 'API'
    expectError(parse(data), 'components[0]', /lable/)
  })

  it('rejects a __proto__ key and does not change object prototypes', () => {
    const text = JSON.stringify(minimalBoard()).replace('"id":"tiny"', '"id":"tiny","__proto__":{"polluted":true}')
    const result = parseBoard(text)
    expect(result.ok).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('rejects a coordinate that overflows to infinity', () => {
    const text = JSON.stringify(minimalBoard()).replace('"id":"api",', '"id":"api","position":{"x":1e400,"y":0},')
    expectError(parseBoard(text), 'components[0].position.x', /.+/)
  })

  it('rejects an explanation over the length limit', () => {
    const data = minimalBoard()
    data.components[0].explanation = 'a'.repeat(LIMITS.markdown + 1)
    expectError(parse(data), 'components[0].explanation', /.+/)
  })

  it('rejects a text field that holds only spaces', () => {
    const data = minimalBoard()
    data.title = '   '
    expectError(parse(data), 'title', /must not be empty/)
  })
})

describe('lessons', () => {
  it('warns about a lesson this app does not have, but still opens the board', () => {
    const data = minimalBoard()
    data.components[0].lesson = 'flux-capacitor'
    const result = parseBoard(JSON.stringify(data), { knownLessons: ['approval-gate'] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.warnings).toEqual([{ path: 'components[0].lesson', code: 'unknown-lesson', message: expect.stringMatching(/flux-capacitor/) }])
  })

  it('accepts a known lesson without warnings', () => {
    const data = minimalBoard()
    data.components[0].lesson = 'approval-gate'
    const result = parseBoard(JSON.stringify(data), { knownLessons: ['approval-gate'] })
    expect(result.ok && result.warnings).toEqual([])
  })
})

describe('size', () => {
  function withComponents(count: number) {
    const data = minimalBoard()
    for (let i = data.components.length; i < count; i++) {
      data.components.push({ id: `part-${i}`, label: `Part ${i}`, summary: 'Filler.', source: { kind: 'agent-proposal' } })
    }
    return data
  }

  it('accepts 16 components without a warning, because the sidebar says it', () => {
    const result = parse(withComponents(16))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.warnings).toEqual([])
  })

  it('rejects more than 60 components', () => {
    expectError(parse(withComponents(61)), 'components', /more than 60 components/)
  })

  it('limits the number of reported problems', () => {
    const data = withComponents(40)
    data.components.forEach((c: Record<string, unknown>) => (c.group = 'missing'))
    const errors = errorsOf(parse(data))
    expect(errors).toHaveLength(26)
    expect(errors.at(-1)?.message).toMatch(/15 more problems/)
  })
})

describe('codes and hints', () => {
  function only(result: ParseResult): BoardProblem {
    const errors = errorsOf(result)
    expect(errors).toHaveLength(1)
    return errors[0]!
  }

  it('names the file problems', () => {
    expect(only(parseBoard('')).code).toBe('not-json')
    expect(only(parseBoard('[]')).code).toBe('not-object')
    expect(only(parse({ name: 'package' })).code).toBe('not-board')
    expect(only(parse({ ...minimalBoard(), schemaVersion: 2 })).code).toBe('schema-version')
    expect(only(parseBoard(`{"padding":"${'x'.repeat(LIMITS.fileBytes)}"}`)).code).toBe('file-too-large')
  })

  it('tells a missing field from a field of the wrong type', () => {
    const data = minimalBoard()
    delete data.title
    expect(only(parse(data))).toMatchObject({ path: 'title', code: 'missing', hint: 'The field is missing.' })
    expect(only(parse({ ...minimalBoard(), revision: '2' }))).toMatchObject({ path: 'revision', code: 'wrong-type' })
    expect(only(parse({ ...minimalBoard(), revision: 0 }))).toMatchObject({ path: 'revision', code: 'out-of-range' })
  })

  it('gives the length of a text that is too long, after trimming', () => {
    const data = minimalBoard()
    data.components[0].label = `  ${'a'.repeat(LIMITS.label + 5)}  `
    expect(only(parse(data))).toMatchObject({ code: 'too-long', hint: `It has ${LIMITS.label + 5}.` })
  })

  it('counts the entries of a list that is too long', () => {
    const data = minimalBoard()
    data.groups = Array.from({ length: LIMITS.groups + 1 }, (_, i) => ({ id: `g-${i}`, label: `G ${i}` }))
    data.components[0].group = 'g-0'
    expect(only(parse(data))).toMatchObject({ path: 'groups', code: 'too-many', hint: `It has ${LIMITS.groups + 1}.` })
  })

  it('marks empty text and empty lists', () => {
    expect(only(parse({ ...minimalBoard(), title: ' ' }))).toMatchObject({ code: 'empty' })
    const data = minimalBoard()
    data.scenarios[0].steps = []
    expect(only(parse(data))).toMatchObject({ code: 'too-few' })
  })

  it('suggests a valid ID for a badly formed one', () => {
    const data = minimalBoard()
    data.groups[0].id = 'Back End'
    data.components[0].group = 'Back End'
    expect(errorsOf(parse(data))).toContainEqual(expect.objectContaining({ path: 'groups[0].id', code: 'bad-id', hint: 'Try "back-end".' }))
  })

  it('suggests the nearest allowed value and key', () => {
    const data = minimalBoard()
    data.relationships[0].kind = 'store-in'
    expect(only(parse(data))).toMatchObject({ code: 'bad-value', hint: 'Did you mean "stores-in"?' })
    const typo = minimalBoard()
    typo.components[0].sumary = 'x'
    delete typo.components[0].summary
    expect(errorsOf(parse(typo))).toContainEqual(expect.objectContaining({ path: 'components[0]', code: 'unknown-key', hint: 'Did you mean "summary"?' }))
    const far = minimalBoard()
    far.components[0].color = 'red'
    expect(only(parse(far))).toEqual({ path: 'components[0]', code: 'unknown-key', message: expect.stringContaining('color') })
  })

  it('names a missing reference for documented intent', () => {
    const data = minimalBoard()
    data.components[0].source = { kind: 'documented-intent' }
    expect(only(parse(data)).code).toBe('needs-reference')
  })

  it('suggests a free ID for a duplicate', () => {
    const data = minimalBoard()
    data.items[0].id = 'api'
    expect(only(parse(data))).toMatchObject({ code: 'duplicate-id', hint: 'Use a new ID, for example "api-2".' })
  })

  it('suggests the nearest ID for a broken reference, and nothing when no ID is close', () => {
    const data = minimalBoard()
    data.relationships[0].to = 'dbb'
    data.components[1].group = 'backnd'
    data.items[0].about = 'api-to-dc'
    data.scenarios[0].steps[0].highlight = ['something-else']
    const errors = errorsOf(parse(data))
    expect(errors).toEqual([
      expect.objectContaining({ path: 'components[1].group', code: 'unknown-group', hint: 'Did you mean "backend"?' }),
      expect.objectContaining({ path: 'relationships[0].to', code: 'unknown-component', hint: 'Did you mean "db"?' }),
      expect.objectContaining({ path: 'items[0].about', code: 'unknown-target', hint: 'Did you mean "api-to-db"?' }),
      { path: 'scenarios[0].steps[0].highlight[0]', code: 'unknown-target', message: expect.any(String) },
    ])
  })

  it('marks the line that counts the problems left out', () => {
    const data = minimalBoard()
    for (let i = 0; i < 30; i++) data.components.push({ id: `p-${i}`, label: 'P', summary: 'P.', group: 'nowhere', source: { kind: 'agent-proposal' } })
    expect(errorsOf(parse(data)).at(-1)?.code).toBe('more-problems')
  })
})
