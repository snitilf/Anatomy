import { describe, expect, it } from 'vitest'
import { allBoards } from '../layer/testBoards'
import { labelCollisions, layoutAspect, lineBandHits, maxLabelGap, measureBoard, minParallel, shown, slopedRuns } from '../test/lineMetrics'
import { LABEL_REACH } from './labelPlacement'
import { TRACK } from './routing'

/** What every board must satisfy: the examples and both e2e fixtures, laid out by the app with no saved positions. */
const boards = allBoards().map((board) => ({ title: board.title, board, measured: measureBoard(board) }))

describe.each(boards)('lines and labels on $title', ({ board, measured }) => {
  it('keeps parallel runs of different lines at least a track apart', () => {
    const { distance, where } = minParallel(measured.edges)
    expect(distance, where).toBeGreaterThanOrEqual(TRACK)
    expect(measured.edges.filter((e) => e.crowded).map((e) => e.id)).toEqual([])
  })

  it('draws only horizontal and vertical runs', () => {
    expect(slopedRuns(measured.edges)).toBe(0)
  })

  it('keeps every run out of the name of every group', () => {
    expect(lineBandHits(measured)).toEqual([])
  })

  it('puts each shown label within a few pixels of its own line', () => {
    const { gap, where } = maxLabelGap(measured.edges)
    expect(gap, where).toBeLessThanOrEqual(LABEL_REACH)
  })

  it('keeps labels off cards, group name bands, each other, and every other line', () => {
    const hits = labelCollisions(measured)
    expect(hits).toEqual({ band: [], card: [], label: [], line: [] })
  })

  it('shows most labels, and holds back only the ones that have no free place', () => {
    const labelled = measured.edges.filter((e) => e.labelWidth > 0 || e.labelHidden).length
    expect(labelled).toBe(board.relationships.length)
    expect(shown(measured.edges).length / labelled).toBeGreaterThanOrEqual(0.75)
  })

  it('lays the cards out in a shape that fills the map', () => {
    const aspect = layoutAspect(measured)
    expect(aspect).toBeGreaterThanOrEqual(1)
    expect(aspect).toBeLessThanOrEqual(1.8)
  })
})
