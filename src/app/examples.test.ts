import { describe, expect, it } from 'vitest'
import { EXAMPLES, isExampleBoard, loadExample } from './examples'

const boards = import.meta.glob('../examples/*.board.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const byFile = new Map(Object.entries(boards).map(([path, text]) => [path.split('/').pop()!, text]))

describe('the example index', () => {
  it('lists every bundled board once, and nothing else', () => {
    expect(EXAMPLES.map((e) => e.fileName).sort()).toEqual([...byFile.keys()].sort())
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length)
  })

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s names its board and loads the same text', async (_id, example) => {
    const text = byFile.get(example.fileName)
    expect(text).toBeDefined()
    const board = JSON.parse(text!) as { id: string }
    expect(example.boardId).toBe(board.id)
    expect(isExampleBoard(board.id)).toBe(true)
    expect(await loadExample(example)).toBe(text)
    expect(example.title.length).toBeGreaterThan(0)
    expect(example.description.length).toBeGreaterThan(0)
  })

  it('does not call a board of the user an example', () => {
    expect(isExampleBoard('refund-approval')).toBe(false)
  })
})
