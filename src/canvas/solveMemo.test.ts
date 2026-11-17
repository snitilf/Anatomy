import { describe, expect, it, vi } from 'vitest'
import { placeCards } from '../layout/cards'
import { nordetBoard } from '../layer/testBoards'
import { solve } from './Canvas'

const text = vi.hoisted(() => ({ scale: 1 }))
vi.mock('./textMeasure', async (original) => {
  const real = await original<typeof import('./textMeasure')>()
  return { ...real, textWidth: (t: string, s: Parameters<typeof real.textWidth>[1]) => real.textWidth(t, s) * text.scale }
})

describe('the solve memo', () => {
  const board = nordetBoard()
  const rects = placeCards(board, { positions: {}, sizes: {} })

  it('builds again from scratch after the text sizes change, as the font refresh does', () => {
    text.scale = 1
    const before = solve(board, rects, undefined, undefined, undefined)
    text.scale = 1.5
    const after = solve(board, { ...rects }, undefined, undefined, undefined)
    expect(after).not.toBe(before)
    const widths = (g: typeof before) => [...g.edges.values()].map((e) => e.labelWidth)
    expect(widths(after)).not.toEqual(widths(before))
  })

  it('does not solve the same change twice when it builds on a previous solve', () => {
    text.scale = 1
    const previous = solve(board, rects, undefined, undefined, undefined)
    const next = { ...rects, [board.components[0]!.id]: { ...rects[board.components[0]!.id]!, width: 400 } }
    const first = solve(board, next, undefined, previous, undefined)
    expect(solve(board, { ...next }, undefined, previous, undefined)).toBe(first)
  })
})
