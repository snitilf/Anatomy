import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { placeCards } from '../layout/cards'
import type { Point, Rect } from '../layout/geometry'
import { bundleGroups } from './bundles'
import { blocksOf, computeBundles } from './bundleRoutes'
import { boardSources, GENERATED_BOARDS, generatedBoard } from '../test/boards'

const sources = boardSources

/** True when a straight run passes through the inside of a rectangle. */
function crossesInside(p: Point, q: Point, r: Rect): boolean {
  return Math.max(p.x, q.x) > r.x && Math.min(p.x, q.x) < r.x + r.width && Math.max(p.y, q.y) > r.y && Math.min(p.y, q.y) < r.y + r.height
}

describe('far view lines keep out of blocks', () => {
  const entries = Object.entries(sources)
  it('finds the test boards', () => expect(entries.length).toBeGreaterThanOrEqual(15))
  for (const [path, text] of entries) {
    it(`never runs a bundle through a block it does not join: ${path.split('/').pop()}`, () => {
      const parsed = parseBoard(text)
      if (!parsed.ok) return // a board with errors on purpose
      const board: Board = parsed.board
      const rects = placeCards(board, { positions: {}, sizes: {} })
      const blocks = blocksOf(board, rects)
      for (const b of computeBundles(board, rects, bundleGroups(board))) {
        for (let i = 1; i < b.points.length; i++) {
          for (const [id, r] of blocks) {
            if (id === b.a || id === b.b) continue
            expect(crossesInside(b.points[i - 1] as Point, b.points[i] as Point, r), `${b.id} crosses ${id}`).toBe(false)
          }
        }
      }
    })
  }
})

describe('far view lines keep out of blocks on generated boards', () => {
  // 150 boards in five batches, each with its own generous timeout, so a busy machine slows a batch and never fails it.
  const BATCH = 30
  for (let first = 1; first <= GENERATED_BOARDS; first += BATCH) {
    it(`holds for boards ${first} to ${first + BATCH - 1} of groups and loose parts, loops included`, { timeout: 120_000 }, () => {
      const failures: string[] = []
      for (let seed = first; seed < first + BATCH; seed++) {
        const board = generatedBoard(seed)
        const rects = placeCards(board, { positions: {}, sizes: {} })
        const blocks = blocksOf(board, rects)
        for (const b of computeBundles(board, rects, bundleGroups(board))) {
          for (let i = 1; i < b.points.length; i++) {
            for (const [id, r] of blocks) {
              if (id === b.a || id === b.b) continue
              if (crossesInside(b.points[i - 1] as Point, b.points[i] as Point, r)) failures.push(`seed ${seed}: ${b.id} crosses ${id}`)
            }
          }
        }
      }
      expect(failures.slice(0, 10)).toEqual([])
    })
  }
})
