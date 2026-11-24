import { describe, expect, it } from 'vitest'
import fortyText from '../../e2e/fixtures/forty-parts.board.json?raw'
import sixtyText from '../../e2e/fixtures/sixty-parts.board.json?raw'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { placeCards } from '../layout/cards'
import type { Rect } from '../layout/geometry'
import { settleMoves } from '../layout/groups'
import { computeGeometry, moveCard } from './buildGraph'
import { computeBundles, sharedBundles } from './bundleRoutes'
import { bundleGroups } from './bundles'
import { resetRouteStats, routeStats, SEARCH_SLICE } from './routing'
import { buildSteps } from './slices'

const load = (text: string): Board => {
  const r = parseBoard(text)
  if (!r.ok) throw new Error('fixture board is invalid')
  return r.board
}

/** The map after a card was made bigger and the cards around it were pushed aside, with the lines of the changed cards hidden. */
function resized(board: Board) {
  const before = placeCards(board, { positions: {}, sizes: {} })
  const solved = computeGeometry(board, before)
  const id = board.components[3]!.id
  const after: Record<string, Rect> = { ...before, [id]: { ...before[id]!, width: before[id]!.width + 60, height: before[id]!.height + 40 } }
  for (const [k, p] of Object.entries(settleMoves(board, after, [id]))) after[k] = { ...after[k]!, ...p }
  let previous = solved
  for (const k of Object.keys(after)) if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) previous = moveCard(board, previous, after, k)
  return { rects: after, previous }
}

/** Runs every step, and reports the most search work any one step did. */
function drain<T>(steps: Generator<void, T, void>) {
  let widest = 0
  let seen = routeStats.expansions
  let step = steps.next()
  while (!step.done) {
    widest = Math.max(widest, routeStats.expansions - seen)
    seen = routeStats.expansions
    step = steps.next()
  }
  widest = Math.max(widest, routeStats.expansions - seen)
  return { value: step.value, widest }
}

describe.each([
  ['forty', fortyText],
  ['sixty', sixtyText],
])('the build after a resize on %s parts', (_name, text) => {
  it('gives the map that one go gives, and keeps every step to two slices of search work', () => {
    const board = load(text)
    const { rects, previous } = resized(board)
    resetRouteStats()
    const { value, widest } = drain(buildSteps({ board, rects, previous, links: [], reconnects: [], proposals: [], bundles: false }))
    expect(value).toEqual(computeGeometry(board, rects, [], previous))
    expect(widest).toBeLessThanOrEqual(2 * SEARCH_SLICE)
  })

  it('solves the far-view lines in the same steps when the far view shows, so the commit that ends the build has nothing left to solve', () => {
    const board = load(text)
    const { rects, previous } = resized(board)
    resetRouteStats()
    const { value, widest } = drain(buildSteps({ board, rects, previous, links: [], reconnects: [], proposals: [], bundles: true }))
    expect(widest).toBeLessThanOrEqual(2 * SEARCH_SLICE)
    const pairs = bundleGroups(board)
    resetRouteStats()
    const lines = sharedBundles(board, value.solved, pairs)
    expect(routeStats.searches).toBe(0)
    expect(lines).toEqual(computeBundles(board, rects, pairs))
  })

  it('leaves the far-view lines alone when the far view is not showing', () => {
    const board = load(text)
    const { rects, previous } = resized(board)
    const { value } = drain(buildSteps({ board, rects, previous, links: [], reconnects: [], proposals: [], bundles: false }))
    resetRouteStats()
    sharedBundles(board, value.solved, bundleGroups(board))
    expect(routeStats.searches).toBeGreaterThan(0)
  })
})
