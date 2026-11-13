import { describe, expect, it } from 'vitest'
import { diffBoards } from './diff'
import { anatomyBoard, clone, nordetBoard } from './testBoards'

describe('diffBoards', () => {
  it('reports nothing for identical boards', () => {
    for (const b of [anatomyBoard(), nordetBoard()]) {
      const d = diffBoards(b, clone(b))
      expect(d.added).toEqual({ components: [], relationships: [] })
      expect(d.removed).toEqual({ components: [], relationships: [] })
      expect(d.changed).toEqual({ components: [], relationships: [] })
      expect(d.boardChanged).toBe(false)
    }
  })

  it('reports added, removed, and changed parts and connections', () => {
    const prev = nordetBoard()
    const next = clone(prev)
    const removedC = next.components.pop()!
    const changedC = next.components[0]!
    changedC.summary = 'Changed on purpose.'
    const addedC = { ...clone(removedC), id: 'brand-new-part' }
    next.components.push(addedC)
    const removedR = next.relationships.shift()!
    const changedR = next.relationships[0]!
    changedR.label = 'new label'
    next.relationships.push({ ...clone(removedR), id: 'brand-new-link' })
    next.goal = 'A new goal.'

    const d = diffBoards(prev, next)
    expect(d.added.components).toEqual(['brand-new-part'])
    expect(d.removed.components).toEqual([removedC.id])
    expect(d.changed.components).toEqual([changedC.id])
    expect(d.added.relationships).toEqual(['brand-new-link'])
    expect(d.removed.relationships).toEqual([removedR.id])
    expect(d.changed.relationships).toEqual([changedR.id])
    expect(d.boardChanged).toBe(true)
  })

  it('does not count a position change', () => {
    const prev = anatomyBoard()
    const next = clone(prev)
    next.components[0]!.position = { x: 1, y: 2 }
    expect(diffBoards(prev, next).changed.components).toEqual([])
  })
})
