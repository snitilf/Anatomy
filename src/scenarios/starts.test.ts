import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { allBoards, clone, refundBoard, urlShortenerBoard } from '../layer/testBoards'
import { flowStarts } from './starts'

const withSteps = (board: Board, steps: { highlight: string[] }[][]): Board => {
  const next = clone(board)
  next.scenarios = steps.map((list, i) => ({ id: `s${i}`, title: `Flow ${i}`, steps: list.map((s, n) => ({ caption: `Step ${n}`, highlight: s.highlight })) }))
  return next
}

describe('flowStarts', () => {
  it('maps the part of the first step of each walkthrough to that walkthrough', () => {
    const starts = flowStarts(refundBoard())
    expect(Object.fromEntries(starts)).toEqual({
      'refund-request': ['Approve and pay'],
      'payout-preview': ['Reject and stop'],
      'manager-approval': ['Edit, then approve again'],
      'payout-ledger': ['A repeated payout is blocked'],
    })
  })

  it('lists every walkthrough that starts at the same part, in board order', () => {
    const starts = flowStarts(urlShortenerBoard())
    expect(starts.get('visitor-browser')).toEqual(['Open an existing short link', 'Open a short code that does not exist'])
    expect(starts.get('web-form')).toEqual(['Create a short link'])
  })

  it('starts at the first highlighted item, and at the source end of a connection', () => {
    const board = refundBoard()
    const first = withSteps(board, [[{ highlight: ['request-to-policy-check', 'payout-ledger'] }, { highlight: ['simulated-payout'] }]])
    expect(Object.fromEntries(flowStarts(first))).toEqual({ 'refund-request': ['Flow 0'] })
  })

  it('has no start when the first step is about the whole board, or when the board has no walkthrough', () => {
    const board = refundBoard()
    expect(flowStarts(withSteps(board, [[{ highlight: [] }, { highlight: ['policy-check'] }]])).size).toBe(0)
    expect(flowStarts(withSteps(board, [])).size).toBe(0)
  })

  it('ignores an id that is not on the board and never starts at a part that does not exist', () => {
    const board = refundBoard()
    const ids = new Set(board.components.map((c) => c.id))
    for (const [id] of flowStarts(withSteps(board, [[{ highlight: ['nothing-here'] }]]))) expect(ids.has(id)).toBe(true)
  })

  it('only ever names parts of the board, on every example', () => {
    for (const board of allBoards()) {
      const ids = new Set(board.components.map((c) => c.id))
      const starts = flowStarts(board)
      for (const [id, titles] of starts) {
        expect(ids.has(id)).toBe(true)
        expect(titles.length).toBeGreaterThan(0)
      }
      expect([...starts.values()].flat().length).toBeLessThanOrEqual(board.scenarios.length)
    }
  })
})
