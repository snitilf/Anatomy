import { describe, expect, it } from 'vitest'
import sixtyText from '../../e2e/fixtures/sixty-parts.board.json?raw'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { placeCards } from '../layout/cards'
import type { Rect } from '../layout/geometry'
import { settleMoves } from '../layout/groups'
import { allBoards } from '../layer/testBoards'
import { computeGeometry, geometrySteps, moveCard } from './buildGraph'
import { hitsAnyCard } from './routing'

/**
 * Releasing a resize solves the lines in steps, one slice per frame, and keeps every line that nothing touched, as a drop
 * does. That build is not a fresh solve of the whole board: a kept line keeps the track it had, and the lines that are
 * solved again route around it. What must hold is checked here on every example board and fixture.
 */
function release(board: Board, id: string) {
  const before = placeCards(board, { positions: {}, sizes: {} })
  const solved = computeGeometry(board, before)
  const after: Record<string, Rect> = { ...before, [id]: { ...before[id]!, width: before[id]!.width + 60, height: before[id]!.height + 40 } }
  for (const [k, p] of Object.entries(settleMoves(board, after, [id]))) after[k] = { ...after[k]!, ...p }
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]))
  let hidden = solved
  for (const k of changed) hidden = moveCard(board, hidden, after, k)
  return { before, after, solved, hidden, changed: new Set(changed) }
}

const sixty = (): Board => {
  const r = parseBoard(sixtyText)
  if (!r.ok) throw new Error('fixture board is invalid')
  return r.board
}

describe.each([...allBoards(), sixty()].map((b) => [b.title, b] as const))('releasing a resize on %s', (_title, board) => {
  const degree = (id: string) => board.relationships.filter((r) => r.from === id || r.to === id).length
  const ids = [...new Set([board.components[0]!.id, [...board.components].sort((a, b) => degree(b.id) - degree(a.id))[0]!.id, board.components.at(-1)!.id])]

  it.each(ids)('builds the same map in steps as in one go: %s', (id) => {
    const { after, hidden } = release(board, id)
    const whole = computeGeometry(board, after, [], hidden)
    const steps = geometrySteps(board, after, [], hidden)
    let count = 0
    let step = steps.next()
    while (!step.done) {
      count++
      step = steps.next()
    }
    expect(count).toBeGreaterThan(0)
    expect(step.value).toEqual(whole)
  })

  it.each(ids)('keeps what was not touched and keeps every line out of the cards: %s', (id) => {
    const { after, solved, hidden, changed } = release(board, id)
    const built = computeGeometry(board, after, [], hidden)
    const fresh = computeGeometry(board, after)
    const cards = Object.values(after)
    expect([...built.edges.keys()].sort()).toEqual([...fresh.edges.keys()].sort())
    for (const [edgeId, shape] of built.edges) {
      const full = fresh.edges.get(edgeId)!
      // The same ends, and the line meets the same sides at the same places.
      expect([shape.from, shape.to]).toEqual([full.from, full.to])
      expect(shape.points[0]).toEqual(full.points[0])
      expect(shape.points.at(-1)).toEqual(full.points.at(-1))
      const own = [after[shape.from]!, after[shape.to]!]
      const others = cards.filter((c) => !own.includes(c))
      if (!hitsAnyCard({ d: full.path, points: [...full.points] }, others)) expect(hitsAnyCard({ d: shape.path, points: [...shape.points] }, others)).toBe(false)
      // A line whose cards did not change and that no changed card reaches is the very same line.
      const old = solved.edges.get(edgeId)!
      const reached = [...changed].some((k) => old.points.some((p) => p.x > after[k]!.x - 16 && p.x < after[k]!.x + after[k]!.width + 16 && p.y > after[k]!.y - 16 && p.y < after[k]!.y + after[k]!.height + 16))
      if (!changed.has(shape.from) && !changed.has(shape.to) && !reached) expect(shape.path).toBe(old.path)
    }
  })
})
