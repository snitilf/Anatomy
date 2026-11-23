import { describe, expect, it } from 'vitest'
import fortyText from '../../e2e/fixtures/forty-parts.board.json?raw'
import sixtyText from '../../e2e/fixtures/sixty-parts.board.json?raw'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { placeCards } from '../layout/cards'
import { bundleGroups } from './bundles'
import { computeBundles } from './bundleRoutes'
import { computeGeometry } from './buildGraph'
import { labelStats, resetLabelStats } from './labelPlacement'
import { resetRouteStats, routeStats } from './routing'

const load = (text: string): Board => {
  const r = parseBoard(text)
  if (!r.ok) throw new Error('fixture board is invalid')
  return r.board
}

/** Runs one solve and returns the counts of the work it did. */
function measure(board: Board) {
  const rects = placeCards(board, { positions: {}, sizes: {} })
  resetRouteStats()
  resetLabelStats()
  const geometry = computeGeometry(board, rects)
  const geo = { searches: routeStats.searches, expansions: routeStats.expansions, placements: labelStats.placements, candidates: labelStats.candidates }
  resetRouteStats()
  const pairs = bundleGroups(board)
  const bundles = computeBundles(board, rects, pairs)
  const bun = { searches: routeStats.searches, expansions: routeStats.expansions, pairs: pairs.length }
  return { geometry, geo, bundles, bun }
}

/**
 * The counts below were recorded from the code as it stood when this guard was added (40 parts: 51 connections, 22 block
 * pairs; 60 parts: 78 connections, 32 block pairs). They are exact for a given build, so a drift of a quarter either way is
 * allowed for honest changes to the router. Quadratic growth in the hot paths, or a retry loop that stops converging, goes
 * far past them. No clock is read.
 */
const HEADROOM = 1.25
const RECORDED = {
  forty: { searches: 48, expansions: 7966, placements: 51, candidates: 37382, bundleSearches: 15, bundleExpansions: 3195 },
  sixty: { searches: 158, expansions: 68736, placements: 78, candidates: 63011, bundleSearches: 27, bundleExpansions: 15504 },
}
const within = (value: number, recorded: number) => {
  expect(value).toBeLessThanOrEqual(Math.ceil(recorded * HEADROOM))
}

describe('work of the hot paths', () => {
  const forty = load(fortyText)
  const sixty = load(sixtyText)
  const small = measure(forty)
  const large = measure(sixty)

  it('counts something, so the guard cannot pass by measuring nothing', () => {
    expect(small.geo.searches).toBeGreaterThan(forty.relationships.length / 2)
    expect(small.geo.expansions).toBeGreaterThan(0)
    expect(small.geo.candidates).toBeGreaterThan(0)
    expect(small.bun.searches).toBeGreaterThan(0)
    expect(small.bundles.length).toBeGreaterThan(0)
  })

  it.each([
    ['forty', small, RECORDED.forty],
    ['sixty', large, RECORDED.sixty],
  ] as const)('routes and places labels within the recorded work on %s parts', (_name, got, rec) => {
    within(got.geo.searches, rec.searches)
    within(got.geo.expansions, rec.expansions)
    within(got.geo.placements, rec.placements)
    within(got.geo.candidates, rec.candidates)
  })

  it.each([
    ['forty', small, RECORDED.forty],
    ['sixty', large, RECORDED.sixty],
  ] as const)('draws the far-view bundles within the recorded work on %s parts', (_name, got, rec) => {
    within(got.bun.searches, rec.bundleSearches)
    within(got.bun.expansions, rec.bundleExpansions)
  })

  it('places one label for each connection, and no more than a short sweep of spots for each', () => {
    for (const [board, got] of [[forty, small], [sixty, large]] as const) {
      expect(got.geo.placements).toBeLessThanOrEqual(board.relationships.length * 2)
      expect(got.geo.candidates / got.geo.placements).toBeLessThanOrEqual(1000)
    }
  })

  it('grows from 40 to 60 parts no faster than recorded', () => {
    const ratio = (get: (m: typeof small) => number) => get(large) / get(small)
    // A ratio is compared without rounding, so the headroom stays 1.25 times.
    const within = (value: number, recorded: number) => expect(value).toBeLessThanOrEqual(recorded * HEADROOM)
    within(ratio((m) => m.geo.expansions), RECORDED.sixty.expansions / RECORDED.forty.expansions)
    within(ratio((m) => m.geo.searches), RECORDED.sixty.searches / RECORDED.forty.searches)
    within(ratio((m) => m.geo.candidates), RECORDED.sixty.candidates / RECORDED.forty.candidates)
    within(ratio((m) => m.bun.expansions), RECORDED.sixty.bundleExpansions / RECORDED.forty.bundleExpansions)
    within(ratio((m) => m.bun.searches), RECORDED.sixty.bundleSearches / RECORDED.forty.bundleSearches)
  })
})
