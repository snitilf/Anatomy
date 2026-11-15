import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { placeCards } from '../layout/cards'
import type { Point, Rect } from '../layout/geometry'
import { addLink, addMark, addNote, addProposal, archiveItems, deleteNote, editNote, reconnect, recordSent } from '../layer/edits'
import { emptyLayer, type Layer, type Mark } from '../layer/model'
import { allBoards, nordetBoard } from '../layer/testBoards'
import { nearestOnLine, pointAlong } from '../whiteboard/geometry'
import { buildFeedback, describeMarkFor, mapSceneOf, unsentCount } from './build'

const t0 = new Date('2026-05-01T10:00:00.000Z')
const iso = t0.toISOString()
const build = (board: Board, layer: Layer, id = 'feedback-aaaaaa') => buildFeedback(board, layer, { id, now: t0 })

const rects = (board: Board, layer: Layer = emptyLayer(board.id)) => placeCards(board, layer)
const ring = (r: Rect, by = 20): Mark => ({ id: 'mark-ring01', createdAt: iso, kind: 'ellipse', x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 })

describe('buildFeedback', () => {
  it('writes the header and every kind of item in board terms, on every board', () => {
    for (const board of allBoards()) {
      const [a, b] = board.components
      const r = rects(board)
      let layer = emptyLayer(board.id)
      layer = addNote(layer, board, { kind: 'question', text: 'Why two?', target: { type: 'component', id: a!.id } }, t0, 'note-aaaaaa')
      const linked = addLink(layer, board, { from: a!.id, to: b!.id, label: 'should call' }, t0, 'link-aaaaaa')
      if (!linked.ok) throw new Error('link')
      layer = addMark(linked.layer, ring(r[a!.id]!))
      const { feedback, skipped } = build(board, layer)
      expect(feedback).toMatchObject({ format: 'anatomy-feedback', schemaVersion: 1, id: 'feedback-aaaaaa', boardId: board.id, baseRevision: board.revision, createdAt: iso, withdrawn: [] })
      expect(skipped).toEqual([])
      expect(feedback.items).toContainEqual({
        id: 'note-aaaaaa',
        type: 'question',
        text: 'Why two?',
        about: { type: 'component', id: a!.id, label: a!.label },
        snapshot: { type: 'component', label: a!.label, summary: a!.summary },
      })
      expect(feedback.items).toContainEqual({
        id: 'link-aaaaaa',
        type: 'link',
        from: { type: 'component', id: a!.id, label: a!.label },
        to: { type: 'component', id: b!.id, label: b!.label },
        label: 'should call',
      })
      const shape = feedback.items.find((i) => i.id === 'mark-ring01')
      expect(shape?.type === 'shape' && shape.encloses.map((x) => x.id)).toContain(a!.id)
    }
  })

  it('resolves a closed hand-drawn loop to what it encloses, and an open stroke to what it touches', () => {
    const board = nordetBoard()
    const [a, b] = board.components
    const box = rects(board)[a!.id]!
    const loop: Mark = {
      id: 'mark-loop01',
      createdAt: iso,
      kind: 'stroke',
      points: [
        { x: box.x - 30, y: box.y - 30 },
        { x: box.x + box.width + 30, y: box.y - 30 },
        { x: box.x + box.width + 30, y: box.y + box.height + 30 },
        { x: box.x - 30, y: box.y + box.height + 30 },
        { x: box.x - 25, y: box.y - 10 },
      ],
    }
    const under: Mark = { id: 'mark-line01', createdAt: iso, kind: 'stroke', points: [{ x: box.x, y: box.y + box.height - 4 }, { x: box.x + box.width, y: box.y + box.height - 4 }] }
    const layer = addMark(addMark(emptyLayer(board.id), loop), under)
    const items = build(board, layer).feedback.items
    const drawn = items.find((i) => i.id === 'mark-loop01')
    expect(drawn?.type === 'drawing' && drawn.encloses.map((x) => x.id)).toEqual([a!.id])
    const line = items.find((i) => i.id === 'mark-line01')
    expect(line?.type === 'drawing' && line.encloses).toEqual([])
    expect(line?.type === 'drawing' && line.touches.map((x) => x.id)).toContain(a!.id)
    expect(line?.type === 'drawing' && line.touches.map((x) => x.id)).not.toContain(b!.id)
  })

  it('uses the size the user gave a card', () => {
    const board = nordetBoard()
    const a = board.components[0]!
    const layer = { ...emptyLayer(board.id), sizes: { [a.id]: { width: 480, height: 320 } } }
    const r = rects(board, layer)[a.id]!
    // A point inside the grown card, outside the default size.
    const arrow: Mark = { id: 'mark-arrow1', createdAt: iso, kind: 'arrow', from: { type: 'point', x: -5000, y: -5000 }, to: { type: 'point', x: r.x + 400, y: r.y + 280 } }
    const item = build(board, addMark(layer, arrow)).feedback.items[0]
    expect(item).toEqual({ id: 'mark-arrow1', type: 'arrow', from: { type: 'point' }, to: { type: 'component', id: a.id, label: a.label } })
  })

  it('skips marks that say nothing, and sends them once they have a note', () => {
    const board = nordetBoard()
    const nowhere: Mark = { id: 'mark-empty1', createdAt: iso, kind: 'rect', x: -9000, y: -9000, width: 20, height: 20 }
    const free: Mark = { id: 'mark-free01', createdAt: iso, kind: 'arrow', from: { type: 'point', x: -9000, y: -9000 }, to: { type: 'point', x: -8000, y: -9000 } }
    const blank: Mark = { id: 'mark-blank1', createdAt: iso, kind: 'sticky', x: -9000, y: -9000, width: 100, height: 100, text: '' }
    const layer = addMark(addMark(addMark(emptyLayer(board.id), nowhere), free), blank)
    const draft = build(board, layer)
    expect(draft.feedback.items).toEqual([])
    expect(draft.skipped).toEqual([
      { id: 'mark-empty1', reason: 'no-meaning' },
      { id: 'mark-free01', reason: 'no-meaning' },
      { id: 'mark-blank1', reason: 'no-meaning' },
    ])
    const noted = addMark(emptyLayer(board.id), { ...nowhere, note: 'A queue goes here' })
    expect(build(board, noted).feedback.items).toEqual([{ id: 'mark-empty1', type: 'shape', shape: 'rect', note: 'A queue goes here', encloses: [], touches: [] }])
  })

  it('describes a reconnect as was and now, and a new part with its links and neighbors', () => {
    const board = nordetBoard()
    const rel = board.relationships[0]!
    const other = board.components.find((c) => c.id !== rel.from && c.id !== rel.to)!
    const near = rects(board)[other.id]!
    let layer = addProposal(emptyLayer(board.id), { id: 'part-aaaaaa', label: 'Audit log', summary: 'Keeps every send.', x: near.x + near.width + 10, y: near.y, width: 260, height: 150, createdAt: iso })
    const moved = reconnect(layer, board, { relationshipId: rel.id, end: 'to', part: 'part-aaaaaa' }, t0, 'edit-aaaaaa')
    if (!moved.ok) throw new Error('reconnect')
    const linked = addLink(moved.layer, board, { from: other.id, to: 'part-aaaaaa', label: 'writes' }, t0, 'link-aaaaaa')
    if (!linked.ok) throw new Error('link')
    layer = linked.layer
    const items = build(board, layer).feedback.items
    const part = (id: string) => {
      const c = board.components.find((x) => x.id === id)!
      return { type: 'component', id, label: c.label }
    }
    expect(items).toContainEqual({
      id: 'edit-aaaaaa',
      type: 'reconnect',
      connection: { id: rel.id, label: rel.label, kind: rel.kind },
      was: { from: part(rel.from), to: part(rel.to) },
      now: { from: part(rel.from), to: { type: 'new-part', id: 'part-aaaaaa', label: 'Audit log' } },
    })
    const added = items.find((i) => i.id === 'part-aaaaaa')
    expect(added).toMatchObject({ type: 'new-part', label: 'Audit log', summary: 'Keeps every send.', links: [{ id: 'link-aaaaaa', direction: 'from', part: part(other.id), label: 'writes' }] })
    expect(added?.type === 'new-part' && added.near.map((x) => x.id)).toContain(other.id)
  })

  it('points an arrow at a connection along its drawn line, and says where along it', () => {
    let checked = 0
    for (const board of allBoards()) {
      const layer = emptyLayer(board.id)
      const scene = mapSceneOf(board, layer)
      const boxes = Object.values(scene.rects)
      const clear = (p: { x: number; y: number }) => boxes.every((box) => p.x < box.x - 10 || p.x > box.x + box.width + 10 || p.y < box.y - 10 || p.y > box.y + box.height + 10)
      const rel = board.relationships.find((x) => {
        const line = scene.lines.get(x.id)
        const p = line && pointAlong(line, 0.3)
        return p !== undefined && clear(p)
      })
      if (!rel) continue
      const line = scene.lines.get(rel.id)!
      const free = pointAlong(line, 0.3)!
      const arrow: Mark = { id: 'mark-arrow1', createdAt: iso, kind: 'arrow', from: { type: 'point', x: free.x, y: free.y }, to: { type: 'relationship', id: rel.id, t: 0.75 } }
      const item = build(board, addMark(layer, arrow)).feedback.items[0]
      const ref = { type: 'relationship', id: rel.id, label: rel.label, from: rel.from, to: rel.to }
      expect(item?.type === 'arrow' && item.to).toEqual({ ...ref, at: 0.75 })
      expect(item?.type === 'arrow' && item.from).toMatchObject({ type: 'relationship' })
      const from = item?.type === 'arrow' && item.from.type === 'relationship' && item.from.id === rel.id ? item.from.at : undefined
      if (from !== undefined) expect(from).toBeCloseTo(0.3, 1)
      checked++
    }
    expect(checked).toBeGreaterThan(1)
  })

  it('reads marks against the lines the map draws, when the map passes them', () => {
    const board = nordetBoard()
    const layer = emptyLayer(board.id)
    const scene = mapSceneOf(board, layer)
    const rel = board.relationships[0]!
    // A line drawn far from both cards, as if the map had routed it there.
    const away = [
      { x: -5000, y: -5000 },
      { x: -4000, y: -5000 },
    ]
    const lines = new Map(scene.lines)
    lines.set(rel.id, away)
    const stroke: Mark = { id: 'mark-cross1', createdAt: iso, kind: 'stroke', points: [{ x: -4500, y: -5050 }, { x: -4500, y: -4950 }] }
    const marked = addMark(layer, stroke)
    expect(build(board, marked).skipped).toEqual([{ id: 'mark-cross1', reason: 'no-meaning' }])
    const item = buildFeedback(board, marked, { id: 'feedback-aaaaaa', now: t0, scene: { rects: scene.rects, lines } }).feedback.items[0]
    expect(item?.type === 'drawing' && item.touches.map((x) => x.id)).toEqual([rel.id])
  })

  it('matches the unfiltered connection predicate for outlines and arrow points', () => {
    const board = nordetBoard()
    const layer = emptyLayer(board.id)
    const rel = board.relationships[0]!
    const ref = { type: 'relationship' as const, id: rel.id, label: rel.label, from: rel.from, to: rel.to }
    const straight = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const bent = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    const stroke = (points: Point[]): Extract<Mark, { kind: 'stroke' }> => ({ id: 'mark-test01', createdAt: iso, kind: 'stroke', points, note: 'test' })
    const shape = (kind: 'rect' | 'ellipse', x: number, y: number): Extract<Mark, { kind: 'rect' | 'ellipse' }> =>
      ({ id: 'mark-test01', createdAt: iso, kind, x, y, width: 200, height: 200, note: 'test' })
    const cases = [
      { name: 'below reach', mark: stroke([{ x: 50, y: 7.99 }]), line: straight, touched: true, enclosed: false },
      { name: 'at reach', mark: stroke([{ x: 50, y: 8 }]), line: straight, touched: true, enclosed: false },
      { name: 'above reach', mark: stroke([{ x: 50, y: 8.01 }]), line: straight, touched: false, enclosed: false },
      { name: 'bent connection', mark: stroke([{ x: 108, y: 50 }]), line: bent, touched: true, enclosed: false },
      { name: 'one-point connection', mark: stroke([{ x: 8, y: 0 }]), line: [{ x: 0, y: 0 }], touched: true, enclosed: false },
      { name: 'empty stroke', mark: stroke([]), line: straight, touched: false, enclosed: false },
      { name: 'rectangle encloses', mark: shape('rect', -50, -100), line: straight, touched: false, enclosed: true },
      { name: 'ellipse encloses', mark: shape('ellipse', -50, -100), line: straight, touched: false, enclosed: true },
      { name: 'far shape', mark: shape('rect', 1000, 1000), line: bent, touched: false, enclosed: false },
    ]
    for (const { name, mark, line, touched, enclosed } of cases) {
      const path: Point[] = mark.kind === 'stroke' ? mark.points : mark.kind === 'rect'
        ? [{ x: mark.x, y: mark.y }, { x: mark.x + mark.width, y: mark.y }, { x: mark.x + mark.width, y: mark.y + mark.height }, { x: mark.x, y: mark.y + mark.height }]
        : Array.from({ length: 48 }, (_, i) => ({ x: mark.x + mark.width / 2 + Math.cos(i * Math.PI / 24) * mark.width / 2, y: mark.y + mark.height / 2 + Math.sin(i * Math.PI / 24) * mark.height / 2 }))
      const closed = mark.kind !== 'stroke'
      const corners = closed ? [...path, path[0]!] : path
      const samples = corners.flatMap((p, i) => {
        const q = corners[i + 1]
        if (!q) return [p]
        const steps = Math.floor(Math.hypot(q.x - p.x, q.y - p.y) / 6)
        return [p, ...Array.from({ length: Math.max(0, steps - 1) }, (_, j) => ({ x: p.x + (q.x - p.x) * (j + 1) / steps, y: p.y + (q.y - p.y) * (j + 1) / steps }))]
      })
      const middle = pointAlong(line, 0.5)!
      let inside = false
      for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
        const a = path[i]!, b = path[j]!
        if (a.y > middle.y !== b.y > middle.y && middle.x < (b.x - a.x) * (middle.y - a.y) / (b.y - a.y) + a.x) inside = !inside
      }
      const referenceEncloses = closed && inside ? [ref] : []
      const referenceTouches = referenceEncloses.length === 0 && samples.some((p) => (nearestOnLine(line, p)?.distance ?? Infinity) <= 8) ? [ref] : []
      expect(referenceTouches.length > 0, name).toBe(touched)
      expect(referenceEncloses.length > 0, name).toBe(enclosed)
      const scene = { rects: {}, lines: new Map([[rel.id, line]]) }
      const item = describeMarkFor(board, layer, mark, scene)
      expect(item && (item.type === 'drawing' || item.type === 'shape') && { touches: item.touches, encloses: item.encloses }, name).toEqual({ touches: referenceTouches, encloses: referenceEncloses })

      const p = path[0] ?? { x: 1000, y: 1000 }
      const nearest = nearestOnLine(line, p)
      const pointed = nearest && nearest.distance <= 8 ? [{ ...ref, at: Math.round(nearest.t * 100) / 100 }] : []
      const arrow: Mark = { id: 'mark-arrow1', createdAt: iso, kind: 'arrow', from: { type: 'point', ...p }, to: { type: 'point', x: 5000, y: 5000 }, note: 'test' }
      const result = describeMarkFor(board, layer, arrow, scene)
      expect(result?.type === 'arrow' ? [result.from, result.to].filter((end) => end.type === 'relationship') : undefined, name).toEqual(pointed)
    }
  })

  it('sends what is new or changed, sends again what has no answer yet, and lists what was withdrawn', () => {
    const board = nordetBoard()
    let layer = addNote(emptyLayer(board.id), board, { kind: 'note', text: 'One', target: { type: 'board' } }, t0, 'note-aaaaaa')
    layer = addNote(layer, board, { kind: 'note', text: 'Two', target: { type: 'board' } }, t0, 'note-bbbbbb')
    const first = build(board, layer)
    expect(first.feedback.items.map((i) => i.id)).toEqual(['note-aaaaaa', 'note-bbbbbb'])
    expect(first.fresh).toEqual(['note-aaaaaa', 'note-bbbbbb'])
    expect(unsentCount(first)).toBe(2)
    layer = recordSent(layer, first.sent)

    // Nothing new, but nothing answered: a second send still carries both, so the agent never loses them.
    const repeat = build(board, layer, 'feedback-bbbbbb')
    expect(repeat.feedback.items.map((i) => i.id)).toEqual(['note-aaaaaa', 'note-bbbbbb'])
    expect(repeat.again).toEqual(['note-aaaaaa', 'note-bbbbbb'])
    expect(unsentCount(repeat)).toBe(0)

    layer = editNote(layer, 'note-aaaaaa', 'One, edited', new Date('2026-05-02T00:00:00.000Z'))
    layer = deleteNote(layer, 'note-bbbbbb')
    layer = addNote(layer, board, { kind: 'question', text: 'Three?', target: { type: 'board' } }, t0, 'note-cccccc')
    const second = build(board, layer, 'feedback-bbbbbb')
    expect(second.feedback.items.map((i) => i.id)).toEqual(['note-aaaaaa', 'note-cccccc'])
    expect(second.feedback.withdrawn).toEqual(['note-bbbbbb'])
    expect(unsentCount(second)).toBe(3)
    expect(second.sent.items.map((i) => i.id)).toEqual(['note-aaaaaa', 'note-cccccc'])
    layer = recordSent(layer, second.sent)

    // An answered item stays home until the user changes it.
    const answered = { ...layer, answers: [{ id: 'note-aaaaaa', response: { respondsTo: 'feedback-bbbbbb', status: 'answered' as const, text: 'Yes.', changed: [] } }] }
    expect(build(board, answered, 'feedback-cccccc').feedback.items.map((i) => i.id)).toEqual(['note-cccccc'])
    const edited = editNote(answered, 'note-aaaaaa', 'One, again', new Date('2026-05-03T00:00:00.000Z'))
    expect(build(board, edited, 'feedback-cccccc').fresh).toEqual(['note-aaaaaa'])

    // An item the agent resolved is archived, not withdrawn.
    layer = archiveItems(layer, [{ id: 'note-cccccc', response: { respondsTo: 'feedback-bbbbbb', status: 'answered', text: 'Because.', changed: [] } }], t0)
    expect(build(board, layer, 'feedback-cccccc').feedback.withdrawn).toEqual([])
  })

  it('flags a note whose part changed or left the board', () => {
    const board = nordetBoard()
    const [a, b] = board.components
    let layer = addNote(emptyLayer(board.id), board, { kind: 'note', text: 'x', target: { type: 'component', id: a!.id } }, t0, 'note-aaaaaa')
    layer = addNote(layer, board, { kind: 'note', text: 'y', target: { type: 'component', id: b!.id } }, t0, 'note-bbbbbb')
    const next = structuredClone(board)
    next.components[0]!.summary = 'Changed.'
    next.components = next.components.filter((c) => c.id !== b!.id)
    next.relationships = next.relationships.filter((r) => r.from !== b!.id && r.to !== b!.id)
    const items = build(next, layer).feedback.items
    expect(items[0]).toMatchObject({ status: 'possibly-outdated' })
    expect(items[1]).toMatchObject({ about: { type: 'missing', id: b!.id }, status: 'needs-relinking' })
  })
})
