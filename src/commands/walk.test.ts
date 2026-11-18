import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { allBoards, clone, exampleBoard } from '../layer/testBoards'
import { emptyLayer } from '../layer/model'
import { currentTrail, neighbors, noteSelection, rememberStep, walkStep, type Trail } from './walk'

/** A small board by hand: a feeds b and c, b feeds d, c feeds d, and d feeds nothing. */
function diamond(): Board {
  const board = clone(exampleBoard())
  const base = board.components[0]!
  board.components = ['a', 'b', 'c', 'd', 'lone'].map((id) => ({ ...clone(base), id, label: id.toUpperCase(), inputs: [], outputs: [] }))
  const line = { ...clone(board.relationships[0]!) }
  const edge = (id: string, from: string, to: string) => ({ ...clone(line), id, from, to, label: id })
  board.relationships = [edge('ab', 'a', 'b'), edge('ac', 'a', 'c'), edge('bd', 'b', 'd'), edge('cd', 'c', 'd')]
  return board
}

const at = (id: string) => ({ type: 'component' as const, id })
const to = (board: Board, selection: ReturnType<typeof at> | undefined, trail: Trail | undefined, move: Parameters<typeof walkStep>[4]) => walkStep(board, undefined, selection, trail, move)

describe('walkStep', () => {
  it('follows the first line out or in, in the order the sidebar lists them', () => {
    const board = diamond()
    expect(to(board, at('a'), undefined, 'target')?.selection).toEqual(at('b'))
    expect(to(board, at('d'), undefined, 'source')?.selection).toEqual(at('b'))
    expect(neighbors(board, undefined, 'a', 'out')).toEqual(['b', 'c'])
  })

  it('has nowhere to go from a part with no line that way, or from a part on its own', () => {
    const board = diamond()
    expect(to(board, at('d'), undefined, 'target')).toBeUndefined()
    expect(to(board, at('a'), undefined, 'source')).toBeUndefined()
    expect(to(board, at('lone'), undefined, 'target')).toBeUndefined()
    expect(to(board, at('lone'), undefined, 'next')).toBeUndefined()
  })

  it('goes back where it came from, even when the part has several lines that way', () => {
    const board = diamond()
    const there = to(board, at('a'), undefined, 'target')!
    const onward = to(board, at('c'), { at: 'c', from: 'a', via: 'out' }, 'target')!
    expect(onward.selection).toEqual(at('d'))
    // d has two sources, b and c. Having come from c, the way back is c.
    expect(to(board, onward.selection as ReturnType<typeof at>, onward.trail, 'source')?.selection).toEqual(at('c'))
    expect(there.trail).toEqual({ at: 'b', from: 'a', via: 'out' })
  })

  it('visits the other parts that share the source it came from, and wraps', () => {
    const board = diamond()
    const first = to(board, at('a'), undefined, 'target')!
    expect(first.selection).toEqual(at('b'))
    const second = to(board, at('b'), first.trail, 'next')!
    expect(second.selection).toEqual(at('c'))
    const wrapped = to(board, at('c'), second.trail, 'next')!
    expect(wrapped.selection).toEqual(at('b'))
    expect(to(board, at('b'), first.trail, 'previous')?.selection).toEqual(at('c'))
  })

  it('uses the first source of a part picked another way as its row', () => {
    const board = diamond()
    expect(to(board, at('b'), undefined, 'next')?.selection).toEqual(at('c'))
    // d is fed by b, and b feeds only d, so d has no sibling that way.
    expect(to(board, at('d'), undefined, 'next')).toBeUndefined()
    // a has no source, so its row is the sources of its first target, and b has only a.
    expect(to(board, at('a'), undefined, 'next')).toBeUndefined()
  })

  it('goes from a selected connection to the part at its end', () => {
    const board = diamond()
    expect(walkStep(board, undefined, { type: 'relationship', id: 'ab' }, undefined, 'target')?.selection).toEqual(at('b'))
    expect(walkStep(board, undefined, { type: 'relationship', id: 'ab' }, undefined, 'source')?.selection).toEqual(at('a'))
    expect(walkStep(board, undefined, { type: 'relationship', id: 'ab' }, undefined, 'next')).toBeUndefined()
  })

  it('follows the end the user moved a connection to', () => {
    const board = diamond()
    const layer = clone(emptyLayer(board.id))
    layer.reconnects.push({ id: 'edit-aaaaaa', relationshipId: 'ab', to: 'lone', createdAt: '2026-01-01T00:00:00.000Z' } as never)
    expect(walkStep(board, layer, at('a'), undefined, 'target')?.selection).toEqual(at('lone'))
  })

  it('follows a link the user drew, to a new part too', () => {
    const board = diamond()
    const layer = clone(emptyLayer(board.id))
    layer.links.push({ id: 'link-aaaaaa', from: 'd', to: 'a', label: '', createdAt: '2026-01-01T00:00:00.000Z' } as never)
    expect(walkStep(board, layer, at('d'), undefined, 'target')?.selection).toEqual(at('a'))
    expect(walkStep(board, layer, { type: 'link', id: 'link-aaaaaa' }, undefined, 'source')?.selection).toEqual(at('d'))
  })

  it('does nothing for the board, a drawing, or a part that is gone', () => {
    const board = diamond()
    expect(walkStep(board, undefined, { type: 'board' }, undefined, 'target')).toBeUndefined()
    expect(walkStep(board, undefined, { type: 'mark', id: 'mark-aaaaaa' }, undefined, 'target')).toBeUndefined()
    expect(walkStep(board, undefined, at('gone'), undefined, 'target')).toBeUndefined()
    expect(walkStep(board, undefined, undefined, undefined, 'target')).toBeUndefined()
  })

  it('never steps onto the part it is on, and never to a part that is not there', () => {
    for (const board of allBoards()) {
      for (const part of board.components) {
        for (const move of ['target', 'source', 'next', 'previous'] as const) {
          const step = walkStep(board, undefined, at(part.id), undefined, move)
          if (step) {
            expect(step.selection).not.toEqual(at(part.id))
            expect(board.components.some((c) => c.id === (step.selection as { id: string }).id)).toBe(true)
          }
        }
      }
    }
  })
})

describe('the trail', () => {
  it('is kept for the step that made it, and cleared by any other change of selection', () => {
    const board = diamond()
    const step = walkStep(board, undefined, at('a'), undefined, 'target')!
    rememberStep(step)
    noteSelection(step.selection)
    expect(currentTrail()).toEqual(step.trail)
    noteSelection(at('c'))
    expect(currentTrail()).toBeUndefined()
  })

  it('does not survive a click on another part and back to the same one', () => {
    const board = diamond()
    const step = walkStep(board, undefined, at('a'), undefined, 'target')!
    rememberStep(step)
    noteSelection(step.selection)
    noteSelection(at('d'))
    noteSelection(step.selection)
    expect(currentTrail()).toBeUndefined()
  })
})
