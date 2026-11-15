import { describe, expect, it } from 'vitest'
import guide from '../../docs/authoring-guide.md?raw'
import { LESSON_IDS } from '../lessons/catalog'
import { EXAMPLES } from '../app/examples'
import { parseBoard } from './validate'

const boards = import.meta.glob('../examples/**/*.board.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('every bundled and external example board', () => {
  it('finds the examples', () => {
    expect(Object.keys(boards).length).toBeGreaterThanOrEqual(3)
  })

  it.each(Object.entries(boards))('%s passes the full validator without warnings', (_path, text) => {
    const result = parseBoard(text, { knownLessons: LESSON_IDS })
    expect(result.ok ? result.warnings : result.errors).toEqual([])
  })
})

describe('the examples offered to the user', () => {
  it('list every bundled and external board', () => {
    const ids = Object.values(boards).map((text) => (JSON.parse(text) as { id: string }).id)
    expect(EXAMPLES.map((e) => (JSON.parse(e.raw) as { id: string }).id).sort()).toEqual(ids.sort())
  })
})

describe('authoring guide', () => {
  it('contains a minimal example that passes the full validator', () => {
    const block = /```json\n([\s\S]*?)\n```/.exec(guide)?.[1]
    expect(block).toBeDefined()
    const result = parseBoard(block ?? '')
    expect(result.ok ? result.warnings : result.errors).toEqual([])
  })
})
