import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { groupAreas, placeCards } from '../layout/cards'
import { overlaps, type Rect } from '../layout/geometry'
import type { Mark } from '../layer/model'
import { clone } from '../layer/testBoards'
import { boardSources, fileName, generatedBoard, GENERATED_BOARDS } from '../test/boards'
import { initialState, reducer, type AppState } from './state'

/** Every valid board the tests know with room to add, remove, and change a part: the examples and the browser fixtures. */
const boards: { name: string; board: Board }[] = Object.entries(boardSources)
  .filter(([path]) => !path.includes('/canvas/fixtures/'))
  .flatMap(([path, text]) => {
    const parsed = parseBoard(text)
    return parsed.ok && parsed.board.components.length >= 4 ? [{ name: fileName(path), board: parsed.board }] : []
  })

const ADDED = 'added-in-revision'

/**
 * The next revision of a board: one part added, connected from a neighbor and in its group; one part removed, with its
 * connections; and one connection that survives with a new label.
 */
function revise(board: Board) {
  const next = clone(board)
  next.revision += 1
  const anchor = next.components.find((c) => next.relationships.some((r) => r.from === c.id || r.to === c.id)) ?? next.components[0]!
  const removed = [...next.components].reverse().find((c) => c.id !== anchor.id)!
  next.components = next.components.filter((c) => c.id !== removed.id)
  next.relationships = next.relationships.filter((r) => r.from !== removed.id && r.to !== removed.id)
  const changed = next.relationships[0]
  if (changed) changed.label = `${changed.label} again`
  const { position: _p, lesson: _l, ...base } = anchor
  next.components.push({ ...base, id: ADDED, label: 'Added in revision', summary: 'A part the next revision adds.' })
  const line = next.relationships[0] ?? board.relationships[0]
  next.relationships.push({ ...(line ?? { kind: 'sends-data-to', source: { kind: 'agent-explanation' } }), id: 'added-line', from: anchor.id, to: ADDED, label: 'hands over to' } as Board['relationships'][number])
  return { next, anchor: anchor.id, removed: removed.id, changed: changed?.id }
}

const open = (board: Board, state: AppState = initialState): AppState => reducer(state, { type: 'boardOpened', board, warnings: [] })
const rectsOf = (s: AppState): Record<string, Rect> => placeCards(s.board!, s.layer!)

/** The clear room between two rects, edge to edge. 0 when they touch or overlap. */
function gap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width))
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height))
  return Math.hypot(dx, dy)
}

/** How far a card moved against the others: the largest move left after the move of the first card is taken away. */
function relativeMove(before: Record<string, Rect>, after: Record<string, Rect>): { id: string; by: number } {
  const ids = Object.keys(before).filter((id) => after[id])
  const ref = ids[0]!
  const sx = after[ref]!.x - before[ref]!.x
  const sy = after[ref]!.y - before[ref]!.y
  let worst = { id: '', by: 0 }
  for (const id of ids) {
    const by = Math.hypot(after[id]!.x - before[id]!.x - sx, after[id]!.y - before[id]!.y - sy)
    if (by > worst.by) worst = { id, by }
  }
  return worst
}

function checkRevision(board: Board) {
  const first = open(board)
  const before = rectsOf(first)
  const { next, anchor, removed } = revise(board)
  const second = open(next, first)
  const after = rectsOf(second)
  const added = after[ADDED]!
  return { first, second, before, after, added, anchor, removed, next }
}

describe('a new revision keeps the map still', () => {
  for (const { name, board } of boards) {
    it(`no surviving card moves against the others on ${name}`, () => {
      const { before, after } = checkRevision(board)
      expect(relativeMove(before, after).by).toBeLessThanOrEqual(0.5)
    })

    it(`the new part sits next to its neighbor, clear of every card and of the removed one, on ${name}`, () => {
      const { before, after, added, anchor, removed, next } = checkRevision(board)
      for (const [id, r] of Object.entries(after)) if (id !== ADDED) expect(gap(added, r), `${ADDED} against ${id}`).toBeGreaterThanOrEqual(48)
      // The place the removed part had is left to its ghost.
      expect(gap(added, before[removed]!)).toBeGreaterThanOrEqual(48)
      expect(gap(added, after[anchor]!)).toBeLessThanOrEqual(400)
      const group = next.components.find((c) => c.id === ADDED)!.group
      const areas = groupAreas(next, after)
      const areasBefore = groupAreas(next, Object.fromEntries(Object.entries(after).filter(([id]) => id !== ADDED)))
      for (const [g, area] of Object.entries(areas)) {
        if (g === group) continue
        expect(overlaps(area, added), `${ADDED} inside the area of ${g}`).toBe(false)
      }
      if (group !== undefined) {
        const own = areas[group]!
        // The group grows to take the new part in, and never over a card that is not in it.
        for (const c of next.components) {
          if (c.group === group) continue
          const r = after[c.id]!
          const was = areasBefore[group] !== undefined && overlaps(areasBefore[group]!, r)
          if (!was) expect(overlaps(own, r), `${c.id} under the area of ${group}`).toBe(false)
        }
      }
    })
  }

  it('holds on the generated boards: nothing moves, and the new part overlaps nothing', () => {
    for (let seed = 0; seed < GENERATED_BOARDS; seed++) {
      const board = generatedBoard(seed)
      if (board.components.length < 3) continue
      const { before, after, added } = checkRevision(board)
      expect(relativeMove(before, after).by, `seed ${seed}`).toBeLessThanOrEqual(0.5)
      for (const [id, r] of Object.entries(after)) if (id !== ADDED) expect(overlaps(added, r), `seed ${seed}: ${id}`).toBe(false)
    }
  })

  it('places the same way twice, and opening the same revision again stores nothing new', () => {
    const { board } = boards[0]!
    const first = open(board)
    const { next } = revise(board)
    const a = open(next, first)
    const b = open(next, first)
    expect(rectsOf(a)).toEqual(rectsOf(b))
    expect(open(board, first).layer).toEqual(first.layer)
  })

  it('keeps a card the user moved where the user put it', () => {
    const { board } = boards[0]!
    const id = board.components[0]!.id
    const first = reducer(open(board), { type: 'cardsMoved', positions: { [id]: { x: -2000, y: -1500 } } })
    const second = open(revise(board).next, first)
    expect(rectsOf(second)[id]).toMatchObject({ x: -2000, y: -1500 })
  })
})

describe('Tidy layout', () => {
  for (const { name, board } of boards.slice(0, 4)) {
    it(`lays ${name} out again as if it opened fresh, as one step of undo`, () => {
      const { second, next } = checkRevision(board)
      const id = next.components[0]!.id
      const moved = reducer(second, { type: 'cardsMoved', positions: { [id]: { x: -3000, y: -3000 } } })
      const tidied = reducer(moved, { type: 'layoutTidied' })
      expect(tidied.layer!.positions).toEqual({})
      expect(rectsOf(tidied)).toEqual(placeCards(next, { positions: {}, sizes: {} }))
      const back = reducer(tidied, { type: 'undo' })
      expect(back.layer).toEqual(moved.layer)
      expect(reducer(back, { type: 'redo' }).layer).toEqual(tidied.layer)
    })
  }

  it('changes nothing, and adds no step of undo, when the board is already tidy', () => {
    const state = open(boards[0]!.board)
    expect(reducer(state, { type: 'layoutTidied' })).toBe(state)
  })
})

const AT = '2026-11-27T00:00:00.000Z'
const sticky = (id: string, r: Rect): Mark => ({ id, kind: 'sticky', createdAt: AT, x: r.x + 24, y: r.y + 16, width: 160, height: 96, text: 'Who owns this?' })
const stroke = (id: string, r: Rect): Mark => ({
  id,
  kind: 'stroke',
  createdAt: AT,
  points: [
    { x: r.x + 10, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height - 10 },
    { x: r.x + r.width - 10, y: r.y + r.height / 2 },
  ],
})
const away: Mark = { id: 'mark-faraway01', kind: 'text', createdAt: AT, x: -9000, y: -9000, width: 200, height: 40, text: 'Far from every card' }

/** Where a mark sits against a card: the offset of its first point or its corner from the card's corner. */
function offset(mark: Mark, card: Rect) {
  const at = mark.kind === 'stroke' ? mark.points[0]! : mark.kind === 'arrow' ? { x: 0, y: 0 } : { x: mark.x, y: mark.y }
  return { x: at.x - card.x, y: at.y - card.y }
}

describe('marks stay over the card they covered', () => {
  for (const { name, board } of boards) {
    it(`across a new revision and Tidy layout on ${name}`, () => {
      let state = open(board)
      const rects = rectsOf(state)
      const [a, b] = board.components.filter((c) => c.id !== revise(board).removed)
      state = reducer(state, { type: 'markAdded', mark: sticky('mark-stickya1', rects[a!.id]!) })
      // The first mark keeps the places of the cards it was drawn on.
      expect(state.layer!.placed).toBeDefined()
      expect(rectsOf(state)).toEqual(rects)
      state = reducer(state, { type: 'markAdded', mark: stroke('mark-strokeb1', rects[b!.id]!) })
      state = reducer(state, { type: 'markAdded', mark: away })
      const marks = () => Object.fromEntries(state.layer!.marks.map((m) => [m.id, m]))
      const expectAligned = () => {
        const now = rectsOf(state)
        expect(offset(marks()['mark-stickya1']!, now[a!.id]!)).toEqual(offset(sticky('x', rects[a!.id]!), rects[a!.id]!))
        expect(offset(marks()['mark-strokeb1']!, now[b!.id]!)).toEqual(offset(stroke('x', rects[b!.id]!), rects[b!.id]!))
      }
      state = open(revise(board).next, state)
      expectAligned()
      state = reducer(state, { type: 'layoutTidied' })
      expectAligned()
      expect(marks()['mark-faraway01']).toEqual(away)
    })
  }
})
