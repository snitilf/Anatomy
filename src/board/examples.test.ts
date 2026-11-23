import { describe, expect, it } from 'vitest'
import guide from '../../docs/authoring-guide.md?raw'
import { LESSON_IDS } from '../lessons/catalog'
import { EXAMPLES } from '../app/examples'
import { readFeedback } from './advice'
import { parseBoard } from './validate'

const boards = import.meta.glob('../examples/**/*.board.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('every bundled example board', () => {
  it('finds the examples', () => {
    expect(Object.keys(boards).length).toBeGreaterThanOrEqual(3)
  })

  it.each(Object.entries(boards))('%s passes the full validator without warnings', (_path, text) => {
    const result = parseBoard(text, { knownLessons: LESSON_IDS })
    expect(result.ok ? result.warnings : result.errors).toEqual([])
  })
})

describe('the examples offered to the user', () => {
  it('list every bundled board', () => {
    const ids = Object.values(boards).map((text) => (JSON.parse(text) as { id: string }).id)
    expect(EXAMPLES.map((e) => (JSON.parse(e.raw) as { id: string }).id).sort()).toEqual(ids.sort())
  })
})

describe('the two practical examples', () => {
  const byId = (id: string) => {
    const raw = EXAMPLES.find((e) => e.id === id)!.raw
    const board = JSON.parse(raw) as {
      groups: { id: string }[]
      components: { id: string; label: string; lesson?: string; group?: string; source: { kind: string; references?: unknown[] } }[]
      relationships: { kind: string; source: { kind: string } }[]
      items: { kind: string; about?: string }[]
      scenarios: { steps: unknown[] }[]
    }
    return board
  }

  it.each(['claude-code', 'llm'])('%s has 6 to 12 parts in groups, with a few short walkthroughs', (id) => {
    const board = byId(id)
    expect(board.components.length).toBeGreaterThanOrEqual(6)
    expect(board.components.length).toBeLessThanOrEqual(12)
    expect(board.groups.length).toBeGreaterThanOrEqual(2)
    expect(board.components.filter((c) => c.group).length).toBeGreaterThan(board.components.length / 2)
    expect(board.scenarios.length).toBeGreaterThanOrEqual(3)
    for (const scenario of board.scenarios) {
      expect(scenario.steps.length).toBeGreaterThanOrEqual(3)
      expect(scenario.steps.length).toBeLessThanOrEqual(6)
    }
  })

  it.each(['claude-code', 'llm'])('%s uses open items and cited sources honestly', (id) => {
    const board = byId(id)
    expect(board.items.some((i) => i.kind === 'unknown')).toBe(true)
    expect(board.items.some((i) => i.kind === 'question')).toBe(true)
    expect(board.items.some((i) => i.kind === 'assumption')).toBe(true)
    for (const c of board.components) {
      if (c.source.kind === 'documented-intent') expect(c.source.references?.length).toBeGreaterThan(0)
    }
  })

  it('the Claude Code board uses every kind of connection and links the approval lesson at the permission check', () => {
    const board = byId('claude-code')
    const kinds = new Set(board.relationships.map((r) => r.kind))
    for (const kind of ['calls', 'sends-data-to', 'stores-in', 'reads-from', 'triggers', 'unknown']) expect(kinds).toContain(kind)
    expect(board.components.find((c) => c.id === 'permission-check')?.lesson).toBe('approval-gate')
  })

  it('the language model board says what is not public as unknown items', () => {
    const board = byId('llm')
    expect(board.items.filter((i) => i.kind === 'unknown').length).toBeGreaterThanOrEqual(4)
    const kinds = new Set(board.relationships.map((r) => r.kind))
    for (const kind of ['calls', 'sends-data-to', 'stores-in']) expect(kinds).toContain(kind)
  })
})

describe('authoring guide', () => {
  const section = (title: string) => guide.slice(guide.indexOf(title))
  const firstJson = (text: string) => /```json\n([\s\S]*?)\n```/.exec(text)?.[1] ?? ''

  it('contains a minimal example that passes the full validator', () => {
    const block = firstJson(section('Minimal valid example'))
    const result = parseBoard(block)
    expect(result.ok ? result.warnings : result.errors).toEqual([])
  })

  it('gives a feedback file, a patch, and a responses block that parse', () => {
    expect(readFeedback(firstJson(section('The feedback file')))).toMatchObject({ id: 'feedback-k2m9x0q4z7ab' })
    expect(Array.isArray(JSON.parse(firstJson(section('Revise with a patch'))))).toBe(true)
    expect(JSON.parse(`{${firstJson(section('### The responses block'))}}`)).toHaveProperty('responses.respondsTo', 'feedback-k2m9x0q4z7ab')
  })
})
