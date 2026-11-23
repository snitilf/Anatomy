import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { allBoards, anatomyBoard, clone, refundBoard } from '../layer/testBoards'
import { autoLayout } from './autoLayout'
import { CARD_MAX, CARD_MIN, CARD_SIZE, CARD_WIDTH, clampSize, contentSize, groupAreas, lineCount, placeCards, summaryLinesFor } from './cards'
import { overlaps, type Rect } from './geometry'
import { fastestMs } from '../test/timing'

const none = { positions: {}, sizes: {} }

/** The same board with every starting position removed, so the layout places every card. */
function withoutPositions(b: Board): Board {
  return { ...b, components: b.components.map(({ position: _p, ...rest }) => rest) }
}

function overlapping(rects: readonly Rect[]): number {
  let count = 0
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlaps(rects[i]!, rects[j]!)) count++
  return count
}

function bounds(rects: readonly Rect[]) {
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  return { width: Math.max(...rects.map((r) => r.x + r.width)) - minX, height: Math.max(...rects.map((r) => r.y + r.height)) - minY }
}

describe('card sizes', () => {
  it('counts the lines a text wraps to', () => {
    expect(lineCount('short', 200, 6)).toBe(1)
    expect(lineCount('a b c d e f g h i j', 60, 6)).toBe(2)
    expect(lineCount('x'.repeat(70), 120, 6)).toBe(4)
    expect(lineCount('', 120, 6)).toBe(1)
  })

  it('makes a card as tall as its text, on the 8 px grid and within the limits', () => {
    const short = contentSize({ label: 'Clock', summary: 'Tells the time.' })
    expect(short).toEqual({ width: CARD_WIDTH, height: CARD_MIN.height })
    const long = contentSize({ label: 'A rather long title that needs two lines here', summary: 'word '.repeat(60) })
    expect(long.height).toBeGreaterThan(CARD_MIN.height)
    expect(long.height % 8).toBe(0)
    expect(long.height).toBeLessThanOrEqual(CARD_MAX.height)
  })

  it('leaves no large gap under a two-line summary', () => {
    const size = contentSize({ label: 'Policy check', summary: 'Compares the request with the policy and the spending limit.' })
    expect(size.height).toBe(CARD_MIN.height)
    expect(summaryLinesFor({ label: 'Policy check' }, size)).toBeGreaterThanOrEqual(2)
  })

  it('shows more summary lines on a taller card', () => {
    const card = { label: 'Policy check' }
    expect(summaryLinesFor(card, { width: 240, height: 320 })).toBeGreaterThan(summaryLinesFor(card, { width: 240, height: 112 }))
  })

  it('keeps a line for the footer row when the part has notes, so the summary never runs into the note count', () => {
    const size = { width: 240, height: 112 }
    expect(summaryLinesFor({ label: 'Policy check' }, size, 2)).toBeLessThan(summaryLinesFor({ label: 'Policy check' }, size))
  })

  it('clamps a size to the limits and snaps it to the grid', () => {
    expect(clampSize({ width: 100, height: 50 })).toEqual(CARD_MIN)
    expect(clampSize({ width: 900, height: 900 })).toEqual(CARD_MAX)
    expect(clampSize({ width: 301, height: 205 })).toEqual({ width: 304, height: 208 })
  })
})

describe('autoLayout', () => {
  it('places every card with no overlap and the same result twice, on every board', () => {
    for (const board of allBoards().map(withoutPositions)) {
      const sizeOf = () => ({ ...CARD_SIZE })
      const a = autoLayout(board, sizeOf)
      expect(Object.keys(a).sort()).toEqual(board.components.map((c) => c.id).sort())
      expect(autoLayout(clone(board), sizeOf)).toEqual(a)
      const rects = Object.values(a).map((p) => ({ ...p, ...CARD_SIZE }))
      expect(overlapping(rects)).toBe(0)
    }
  })

  it('keeps group areas apart, so no group area covers a card of another group', () => {
    for (const board of allBoards().map(withoutPositions)) {
      const rects = placeCards(board, none)
      const areas = groupAreas(board, rects)
      for (const c of board.components) {
        for (const [id, area] of Object.entries(areas)) if (id !== c.group) expect(overlaps(area, rects[c.id]!), `${c.id} under ${id}`).toBe(false)
      }
      const list = Object.values(areas)
      expect(overlapping(list)).toBe(0)
    }
  })

  it('reads left to right: a connection between groups mostly runs forward', () => {
    for (const board of allBoards().map(withoutPositions)) {
      const rects = placeCards(board, none)
      const forward = board.relationships.filter((r) => rects[r.from]!.x < rects[r.to]!.x).length
      const backward = board.relationships.filter((r) => rects[r.from]!.x > rects[r.to]!.x).length
      expect(forward, board.title).toBeGreaterThanOrEqual(backward)
    }
  })

  it('stays compact on the sixteen and forty part boards', () => {
    const [, , , sixteen, forty] = allBoards()
    for (const board of [sixteen!, forty!]) {
      const rects = Object.values(placeCards(withoutPositions(board), none))
      const size = bounds(rects)
      // A long strip is hard to read at any zoom. The pieces are packed toward a screen-like shape.
      expect(size.width / size.height).toBeGreaterThan(0.5)
      expect(size.width / size.height).toBeLessThan(3)
      const area = rects.reduce((sum, r) => sum + r.width * r.height, 0)
      expect(area / (size.width * size.height)).toBeGreaterThan(0.12)
    }
  })

  it('takes a few milliseconds on the forty part board', () => {
    const forty = withoutPositions(allBoards()[4]!)
    expect(fastestMs(() => placeCards(forty, none), 60)).toBeLessThan(600)
  })

  it('packs cards that no connection joins instead of one long row or column', () => {
    const b = withoutPositions(clone(refundBoard()))
    b.relationships = []
    b.groups = []
    b.components = b.components.map(({ group: _g, ...c }) => c)
    const size = bounds(Object.values(placeCards(b, none)))
    expect(size.width).toBeLessThan(CARD_WIDTH * 7)
    expect(size.height).toBeLessThan(CARD_MIN.height * 7)
  })
})

describe('placeCards', () => {
  it('prefers the user position, then the board position, then the layout', () => {
    const b = clone(anatomyBoard())
    const [a, c] = b.components
    a!.position = { x: 10, y: 20 }
    c!.position = { x: 500, y: 600 }
    const r = placeCards(b, { positions: { [c!.id]: { x: -5, y: -6 } }, sizes: {} })
    expect(r[a!.id]).toMatchObject({ x: 10, y: 20 })
    expect(r[c!.id]).toMatchObject({ x: -5, y: -6 })
  })

  it('sizes each card to its text unless the user resized it', () => {
    const b = refundBoard()
    const [a, c] = b.components
    const r = placeCards(b, { positions: {}, sizes: { [a!.id]: { width: 400, height: 300 } } })
    expect(r[a!.id]).toMatchObject({ width: 400, height: 300 })
    expect(r[c!.id]).toMatchObject(contentSize(c!))
  })

  it('places cards without a position clear of the cards the board placed, on every board', () => {
    for (const b of allBoards()) {
      const partial = clone(b)
      partial.components = partial.components.map((c, i) => (i % 2 === 0 ? { ...c, position: { x: (i % 4) * 300, y: Math.floor(i / 4) * 200 } } : (({ position: _p, ...rest }) => rest)(c)))
      const r = placeCards(partial, none)
      expect(overlapping(Object.values(r))).toBe(0)
      expect(placeCards(partial, none)).toEqual(r)
    }
  })

  it('keeps the other cards in place when the user moves one to an empty spot', () => {
    for (const b of allBoards().map(withoutPositions)) {
      const first = b.components[0]!
      const before = placeCards(b, none)
      const far = { x: -5000, y: -5000 }
      const r = placeCards(b, { positions: { [first.id]: far }, sizes: {} })
      expect(r[first.id]).toMatchObject(far)
      for (const c of b.components) if (c.id !== first.id) expect(r[c.id]).toEqual(before[c.id])
    }
  })

  it('never leaves a card under one the user moved: the auto-placed card steps aside', () => {
    for (const b of allBoards().map(withoutPositions)) {
      const [first, second] = b.components
      const before = placeCards(b, none)
      const r = placeCards(b, { positions: { [first!.id]: { x: before[second!.id]!.x + 20, y: before[second!.id]!.y + 10 } }, sizes: { [first!.id]: { width: 320, height: 200 } } })
      for (const c of b.components) if (c.id !== first!.id) expect(overlaps(r[c.id]!, r[first!.id]!), c.id).toBe(false)
    }
  })

  it('lays out a card a new revision adds without putting it on a card the user moved', () => {
    for (const b of allBoards().map(withoutPositions)) {
      const before = placeCards(b, none)
      const moved = Object.fromEntries(b.components.slice(0, 3).map((c) => [c.id, { x: before[c.id]!.x + 30, y: before[c.id]!.y + 30 }]))
      const next = clone(b)
      next.components.push({ ...next.components[0]!, id: 'added-in-revision-two', label: 'Added later' })
      next.relationships.push({ ...next.relationships[0]!, id: 'added-connection', from: next.components[1]!.id, to: 'added-in-revision-two' })
      const r = placeCards(next, { positions: moved, sizes: {} })
      for (const id of Object.keys(moved)) expect(overlaps(r['added-in-revision-two']!, r[id]!)).toBe(false)
    }
  })
})
