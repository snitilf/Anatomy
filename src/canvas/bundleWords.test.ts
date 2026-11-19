import { describe, expect, it } from 'vitest'
import sixtyText from '../../e2e/fixtures/sixty-parts.board.json?raw'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { ARROW_OF, bundleKey, bundleWords, connectionsWord, endName, endRank, wayOf } from './bundleWords'
import { bundleGroups } from './bundles'

const sixty = (): Board => {
  const r = parseBoard(sixtyText)
  if (!r.ok) throw new Error('fixture board is invalid')
  return r.board
}

describe('the way a pair runs', () => {
  it('is forward, backward, or both, from the first end to the second', () => {
    expect(wayOf(3, 0)).toBe('forward')
    expect(wayOf(0, 2)).toBe('backward')
    expect(wayOf(1, 1)).toBe('both')
    expect([ARROW_OF.forward, ARROW_OF.backward, ARROW_OF.both]).toEqual(['→', '←', '↔'])
  })

  it('counts connections with the right word', () => {
    expect(connectionsWord(1)).toBe('1 connection')
    expect(connectionsWord(14)).toBe('14 connections')
  })
})

describe('naming a bundle', () => {
  const board = sixty()
  const [first, second] = board.groups
  const one = `group:${first!.id}`
  const two = `group:${second!.id}`

  it('names an end by its group label or its part name, and puts the groups in the board order', () => {
    expect(endName(board, [], one)).toBe(first!.label)
    expect(endName(board, [{ id: 'part-aaaaaa', label: 'Cache' }], 'part-aaaaaa')).toBe('Cache')
    const part = board.components.find((c) => c.group === undefined)
    if (part) expect(endName(board, [], part.id)).toBe(part.label)
    expect(endRank(board, one)).toBeLessThan(endRank(board, two))
    expect(endRank(board, 'loose-part')).toBe(board.groups.length)
  })

  it('reads the arrow from the first group to the second, whichever order the pair stores its ends in', () => {
    const forward = bundleWords(board, [], { a: one, b: two, ab: 3, ba: 0, count: 3 })
    expect(forward.tag).toBe(`${first!.label} → ${second!.label}, 3 connections`)
    expect(forward.spoken).toBe(`${first!.label} to ${second!.label}, 3 connections`)
    // The pair keeps its ends in the order of their ids. Its first end may come second on the board.
    const swapped = bundleWords(board, [], { a: two, b: one, ab: 3, ba: 0, count: 3 })
    expect(swapped.way).toBe('backward')
    expect(swapped.title).toBe(`${first!.label} ← ${second!.label}`)
    expect(swapped.spoken).toBe(`${second!.label} to ${first!.label}, 3 connections`)
    const both = bundleWords(board, [], { a: one, b: two, ab: 1, ba: 1, count: 2 })
    expect(both.title).toBe(`${first!.label} ↔ ${second!.label}`)
    expect(both.spoken).toBe(`${first!.label} and ${second!.label}, 2 connections`)
    expect(bundleWords(board, [], { a: one, b: two, ab: 1, ba: 0, count: 1 }).tag).toMatch(/, 1 connection$/)
  })

  it('agrees with the connections that every pair of the board holds', () => {
    for (const pair of bundleGroups(board)) {
      const words = bundleWords(board, [], pair)
      const swap = endRank(board, pair.a) > endRank(board, pair.b)
      const forward = swap ? pair.ba : pair.ab
      const backward = swap ? pair.ab : pair.ba
      expect(words.title).toContain(forward > 0 && backward > 0 ? '↔' : forward > 0 ? '→' : '←')
      expect(words.tag.endsWith(connectionsWord(pair.count))).toBe(true)
    }
  })

  it('keys a pair by its two ends', () => {
    expect(bundleKey(one, two)).toBe(`${one}|${two}`)
  })
})
