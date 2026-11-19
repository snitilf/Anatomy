import { describe, expect, it } from 'vitest'
import fortyText from '../../e2e/fixtures/forty-parts.board.json?raw'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { CARD_SIZE, placeCards } from '../layout/cards'
import type { Point, Rect } from '../layout/geometry'
import { anatomyBoard, refundBoard } from '../layer/testBoards'
import { assembleGraph, buildGraph, computeGeometry, GraphCache, moveCard } from './buildGraph'
import { RunIndex } from './labelPlacement'

const forty = (): Board => {
  const r = parseBoard(fortyText)
  if (!r.ok) throw new Error('fixture board is invalid')
  return r.board
}

function setup(board: Board) {
  const positions = placeCards(board, { positions: {}, sizes: {} })
  const geometry = computeGeometry(board, positions)
  const cache = new GraphCache()
  const noCounts = new Map<string, number>()
  const build = (pos: Record<string, Rect>, geo = geometry, held?: string) =>
    assembleGraph(board, pos, geo, undefined, undefined, [], noCounts, cache, held)
  return { positions, geometry, build }
}

describe.each([
  ['a small board', refundBoard],
  ['a large board', forty],
])('moving one card on %s', (_name, load) => {
  const board = load()
  const touching = (id: string) => board.relationships.filter((r) => r.from === id || r.to === id).map((r) => r.id)
  // The card with the most connections makes the clearest case.
  const id = [...board.components].sort((a, b) => touching(b.id).length - touching(a.id).length)[0]!.id

  it('redraws only the connections of that card and its group', () => {
    const { positions, geometry } = setup(board)
    const next = { ...positions, [id]: { ...positions[id]!, x: positions[id]!.x + 40, y: positions[id]!.y + 30 } }
    const after = moveCard(board, geometry, next, id)
    const mine = new Set(touching(id))
    expect(mine.size).toBeGreaterThan(0)
    for (const [edgeId, shape] of geometry.edges) {
      if (mine.has(edgeId)) expect(after.edges.get(edgeId)).not.toBe(shape)
      else expect(after.edges.get(edgeId)).toBe(shape)
    }
    const group = board.components.find((c) => c.id === id)?.group
    after.groups.forEach((g, i) => {
      if (g.id === group) expect(g).not.toBe(geometry.groups[i])
      else expect(g).toBe(geometry.groups[i])
    })
  })

  it('hides the connections of the moved card without solving them again', () => {
    const { positions, geometry, build } = setup(board)
    const next = { ...positions, [id]: { ...positions[id]!, x: positions[id]!.x + 40, y: positions[id]!.y + 30 } }
    const after = moveCard(board, geometry, next, id)
    for (const edgeId of touching(id)) {
      const before = geometry.edges.get(edgeId)!
      const shape = after.edges.get(edgeId)!
      expect(shape.cheap).toBe(true)
      expect(shape.path).toBe(before.path)
    }
    // A second frame of the same drag keeps the same objects, so nothing is redrawn.
    const again = moveCard(board, after, { ...next, [id]: { ...next[id]!, x: next[id]!.x + 5 } }, id)
    for (const edgeId of touching(id)) expect(again.edges.get(edgeId)).toBe(after.edges.get(edgeId))
    const hidden = new Set(
      build(next, after, id)
        .edges.filter((e) => e.hidden)
        .map((e) => e.id),
    )
    expect(hidden).toEqual(new Set(touching(id)))
  })

  it('hands React Flow the same objects for everything that did not change', () => {
    const { positions, geometry, build } = setup(board)
    const first = build(positions)
    const next = { ...positions, [id]: { ...positions[id]!, x: positions[id]!.x + 40, y: positions[id]!.y + 30 } }
    const second = build(next, moveCard(board, geometry, next, id), id)
    const mine = new Set(touching(id))
    const group = board.components.find((c) => c.id === id)?.group
    for (const node of first.nodes) {
      const again = second.nodes.find((n) => n.id === node.id)!
      const changed = node.id === id || node.id === (group === undefined ? '' : `group:${group}`)
      expect(again === node).toBe(!changed)
    }
    for (const edge of first.edges) {
      const again = second.edges.find((e) => e.id === edge.id)!
      if (mine.has(edge.id) || again === edge) {
        expect(again === edge).toBe(!mine.has(edge.id))
        continue
      }
      // A label near the edge of the moved card's group sees that group change size: only its tint differs.
      expect(group).toBeDefined()
      expect({ ...again.data, tint: '' }).toEqual({ ...edge.data, tint: '' })
      expect(again.data!.tint).not.toBe(edge.data!.tint)
    }
  })

  it('returns the same objects when nothing changed', () => {
    const { positions, build } = setup(board)
    const first = build(positions)
    const second = build(positions)
    expect(second.nodes.every((n, i) => n === first.nodes[i])).toBe(true)
    expect(second.edges.every((e, i) => e === first.edges[i])).toBe(true)
  })
})

describe('a walkthrough', () => {
  it('never dims the selected card or the card being held', () => {
    const board = refundBoard()
    const [a, b, c] = board.components
    const positions = placeCards(board, { positions: {}, sizes: {} })
    const geometry = computeGeometry(board, positions)
    const highlight = new Set([a!.id])
    const build = (selection: Parameters<typeof assembleGraph>[3], held?: string) =>
      assembleGraph(board, positions, geometry, selection, highlight, [], new Map(), new GraphCache(), held)
    const dimmed = (graph: ReturnType<typeof build>, id: string) => (graph.nodes.find((n) => n.id === id)!.data as { dimmed: boolean }).dimmed
    const plain = build(undefined)
    expect(dimmed(plain, a!.id)).toBe(false)
    expect(dimmed(plain, b!.id)).toBe(true)
    expect(dimmed(build({ type: 'component', id: b!.id }), b!.id)).toBe(false)
    expect(dimmed(build(undefined, c!.id), c!.id)).toBe(false)
    expect(dimmed(build(undefined, c!.id), b!.id)).toBe(true)
  })
})

describe('softening the lines while a part is selected', () => {
  const board = refundBoard()
  const positions = placeCards(board, { positions: {}, sizes: {} })
  const geometry = computeGeometry(board, positions)
  const part = board.components.find((c) => board.relationships.some((r) => r.from === c.id || r.to === c.id))!
  const build = (selection: Parameters<typeof assembleGraph>[3], held?: string, highlight?: ReadonlySet<string>) =>
    assembleGraph(board, positions, geometry, selection, highlight, [], new Map(), new GraphCache(), held)
  const faded = (graph: ReturnType<typeof build>) => new Map(graph.edges.map((e) => [e.id, (e.data as { faded: boolean }).faded]))

  it('keeps the lines of the selected part strong and softens the rest', () => {
    const result = faded(build({ type: 'component', id: part.id }))
    for (const r of board.relationships) expect(result.get(r.id)).toBe(r.from !== part.id && r.to !== part.id)
    expect([...result.values()].some(Boolean)).toBe(true)
  })

  it('softens nothing without a selected part, while a card is held, or during a walkthrough', () => {
    expect([...faded(build(undefined)).values()].every((f) => !f)).toBe(true)
    expect([...faded(build({ type: 'component', id: part.id }, part.id)).values()].every((f) => !f)).toBe(true)
    expect([...faded(build({ type: 'component', id: part.id }, undefined, new Set([part.id]))).values()].every((f) => !f)).toBe(true)
  })
})

describe('the spotlight on a selection', () => {
  const board = refundBoard()
  const positions = placeCards(board, { positions: {}, sizes: {} })
  const geometry = computeGeometry(board, positions)
  const build = (selection: Parameters<typeof assembleGraph>[3]) =>
    assembleGraph(board, positions, geometry, selection, undefined, [], new Map(), new GraphCache())
  const fadedCards = (graph: ReturnType<typeof build>) => graph.nodes.filter((n) => n.type === 'card' && (n.data as { faded: boolean }).faded).map((n) => n.id)

  it('keeps a selected part and its neighbors, and steps every other card back', () => {
    const part = board.relationships[0]!.from
    const near = new Set([part, ...board.relationships.flatMap((r) => (r.from === part ? [r.to] : r.to === part ? [r.from] : []))])
    const faded = fadedCards(build({ type: 'component', id: part }))
    expect(faded.some((id) => near.has(id))).toBe(false)
    expect(faded.length).toBe(board.components.length - near.size)
  })

  it('keeps the two ends of a selected line and fades the other lines and cards', () => {
    const r = board.relationships[0]!
    const graph = build({ type: 'relationship', id: r.id })
    const lines = new Map(graph.edges.map((e) => [e.id, (e.data as { faded: boolean }).faded]))
    expect(lines.get(r.id)).toBe(false)
    expect(board.relationships.filter((x) => x.id !== r.id).every((x) => lines.get(x.id) === true)).toBe(true)
    const faded = fadedCards(graph)
    expect(faded).not.toContain(r.from)
    expect(faded).not.toContain(r.to)
    expect(faded.length).toBe(board.components.length - 2)
  })

  it('fades nothing with no selection', () => {
    expect(fadedCards(build(undefined))).toEqual([])
  })
})

describe('arrowheads', () => {
  it('share one marker object per color', () => {
    const { edges } = buildGraph(forty(), placeCards(forty(), { positions: {}, sizes: {} }), undefined)
    const byColor = new Map<string, unknown>()
    for (const e of edges) {
      const marker = e.markerEnd as { color: string }
      const seen = byColor.get(marker.color)
      if (seen) expect(marker).toBe(seen)
      else byColor.set(marker.color, marker)
    }
    expect(byColor.size).toBeLessThan(edges.length)
  })
})

describe('RunIndex', () => {
  it('finds the runs through a box the same way a plain scan does', () => {
    const index = new RunIndex()
    const lines: [Point, Point][][] = []
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let owner = 0; owner < 6; owner++) {
      const runs: [Point, Point][] = Array.from({ length: 30 }, () => {
        const a = { x: Math.round(random() * 1500 - 300), y: Math.round(random() * 900 - 200) }
        return random() < 0.5 ? [a, { x: a.x + Math.round(random() * 300 - 150) + 1, y: a.y }] : [a, { x: a.x, y: a.y + Math.round(random() * 300 - 150) + 1 }]
      })
      lines.push(runs)
      index.add(owner, runs)
    }
    for (let i = 0; i < 80; i++) {
      const box = { x: random() * 1200 - 200, y: random() * 700 - 100, width: 20 + random() * 200, height: 20 + random() * 120 }
      const skip = i % 7 === 6 ? -1 : i % 6
      let expected = false
      lines.forEach((runs, owner) => {
        if (owner === skip) return
        for (const [p, q] of runs) {
          if (Math.max(p.x, q.x) > box.x && Math.min(p.x, q.x) < box.x + box.width && Math.max(p.y, q.y) > box.y && Math.min(p.y, q.y) < box.y + box.height) expected = true
        }
      })
      expect(index.hits(box, skip)).toBe(expected)
    }
  })
})

describe.each([
  ['a small board', refundBoard],
  ['a large board', forty],
])('the full build after a card is dropped on %s', (_name, load) => {
  const board = load()
  const touching = (id: string) => board.relationships.filter((r) => r.from === id || r.to === id).map((r) => r.id)
  const id = [...board.components].sort((a, b) => touching(b.id).length - touching(a.id).length)[0]!.id
  const mine = new Set(touching(id))
  const start = () => {
    const positions = placeCards(board, { positions: {}, sizes: {} })
    return { positions, solved: computeGeometry(board, positions) }
  }
  const drop = (to: Point) => {
    const { positions, solved } = start()
    const next = { ...positions, [id]: { ...positions[id]!, ...to } }
    // What the map shows during the drag, and then the build that follows the drop.
    const cheap = moveCard(board, solved, next, id)
    return { solved, next, cheap, after: computeGeometry(board, next, [], cheap) }
  }

  it('leaves every unrelated connection exactly where it was when the card lands in free space', () => {
    const far = drop({ x: 6000, y: 6000 })
    for (const [edgeId, shape] of far.solved.edges) {
      if (mine.has(edgeId)) continue
      expect(far.after.edges.get(edgeId)).toBe(shape)
    }
  })

  it('solves the connections of the moved card again, with a placed label', () => {
    const far = drop({ x: 6000, y: 6000 })
    for (const edgeId of mine) {
      const shape = far.after.edges.get(edgeId)!
      expect(shape.cheap).toBeUndefined()
      expect(shape).not.toBe(far.solved.edges.get(edgeId))
    }
  })

  it('gives a label a new place when the moved card now covers it, and keeps the others', () => {
    const { solved, positions } = start()
    // Land the card on the label of a connection that is not its own.
    const victim = [...solved.edges.values()].find((s) => !mine.has(s.id) && s.from !== id && s.to !== id)!
    const to = { x: victim.labelX - CARD_SIZE.width / 2, y: victim.labelY - CARD_SIZE.height / 2 + 20 }
    const next = { ...positions, [id]: { ...positions[id]!, ...to } }
    const after = computeGeometry(board, next, [], moveCard(board, solved, next, id))
    const label = after.edges.get(victim.id)!
    // The label that sat under the landed card gets a new place. The pill is not drawn where the old one was.
    expect(label).not.toBe(victim)
    expect(label.labelX !== victim.labelX || label.labelY !== victim.labelY).toBe(true)
    // Every unrelated connection that the card did not touch is the same object as before.
    let kept = 0
    for (const [edgeId, shape] of solved.edges) {
      if (mine.has(edgeId)) continue
      if (after.edges.get(edgeId) === shape) kept++
    }
    expect(kept).toBeGreaterThan(0)
  })

  it('draws the same picture as a first build when nothing moved', () => {
    const { positions, solved } = start()
    const again = computeGeometry(board, positions, [], solved)
    for (const [edgeId, shape] of solved.edges) expect(again.edges.get(edgeId)).toBe(shape)
  })

  it('never keeps the cheap line from the drag, even when the card returns to its start', () => {
    const { positions, solved } = start()
    const away = { ...positions, [id]: { ...positions[id]!, x: positions[id]!.x + 30, y: positions[id]!.y + 30 } }
    const cheap = moveCard(board, solved, away, id)
    const back = moveCard(board, cheap, positions, id)
    const after = computeGeometry(board, positions, [], back)
    for (const edgeId of mine) expect(after.edges.get(edgeId)!.cheap).toBeUndefined()
  })

  it('marks the labels of the moved card as moving until the full build', () => {
    const { positions, solved } = start()
    const away = { ...positions, [id]: { ...positions[id]!, x: positions[id]!.x + 40, y: positions[id]!.y + 30 } }
    const cheap = moveCard(board, solved, away, id)
    const build = (geometry: typeof cheap) =>
      assembleGraph(board, away, geometry, undefined, undefined, [], new Map(), new GraphCache(), id).edges
    for (const edge of build(cheap)) expect((edge.data as { moving: boolean }).moving).toBe(mine.has(edge.id))
    for (const edge of build(computeGeometry(board, away, [], cheap))) expect((edge.data as { moving: boolean }).moving).toBe(false)
  })
})

describe('card sizes', () => {
  it('draws a resized card at its size, grows its group, and solves its lines again', () => {
    const board = refundBoard()
    const grouped = board.components.find((c) => c.group !== undefined)!
    const rects = placeCards(board, { positions: {}, sizes: {} })
    const before = computeGeometry(board, rects)
    const big = { ...rects, [grouped.id]: { ...rects[grouped.id]!, width: 480, height: 320 } }
    const after = computeGeometry(board, big, [], before)
    const node = assembleGraph(board, big, after, undefined, undefined, [], new Map(), new GraphCache()).nodes.find((n) => n.id === grouped.id)!
    expect(node).toMatchObject({ width: 480, height: 320, measured: { width: 480, height: 320 } })
    const group = after.groups.find((g) => g.id === grouped.group)!
    expect(group.x + group.width).toBeGreaterThanOrEqual(big[grouped.id]!.x + 480)
    expect(group.y + group.height).toBeGreaterThanOrEqual(big[grouped.id]!.y + 320)
    const own = board.relationships.find((r) => r.from === grouped.id || r.to === grouped.id)
    if (own) expect(after.edges.get(own.id)).not.toBe(before.edges.get(own.id))
  })
})

describe('the user layer on the map', () => {
  const board = refundBoard()
  const iso = '2026-01-01T00:00:00.000Z'
  const rects: Record<string, Rect> = { ...placeCards(board, { positions: {}, sizes: {} }), 'part-abcdef': { x: -600, y: -400, width: 240, height: 112 } }
  const proposal = { id: 'part-abcdef', label: 'Cache', summary: '', x: -600, y: -400, width: 240, height: 112, createdAt: iso }
  const rel = board.relationships[0]!
  const third = board.components.find((c) => c.id !== rel.from && c.id !== rel.to)!.id
  const link = { id: 'link-abcdef', from: 'part-abcdef', to: rel.from, label: '', createdAt: iso }
  const reconnect = { id: 'edit-abcdef', relationshipId: rel.id, to: third, createdAt: iso }
  const sticky = { id: 'mark-abcdef', createdAt: iso, kind: 'sticky' as const, x: 10, y: 20, width: 176, height: 128, text: 'Hi' }

  it('routes links to proposed parts, and keeps lines out of them', () => {
    const geometry = computeGeometry(board, rects, [link])
    const shape = geometry.edges.get('manual:link-abcdef')
    expect(shape).toBeDefined()
    const inside = (p: Point, r: Rect) => p.x > r.x + 1 && p.x < r.x + r.width - 1 && p.y > r.y + 1 && p.y < r.y + r.height - 1
    for (const s of geometry.edges.values()) expect(s.points.some((p) => inside(p, rects['part-abcdef']!))).toBe(false)
  })

  it('draws a moved connection where the user put it, with its original dimmed under it and its label on the new line', () => {
    const geometry = computeGeometry(board, rects, [], undefined, [reconnect])
    const moved = geometry.edges.get(`edit:${rel.id}`)
    expect(moved).toMatchObject({ from: rel.from, to: third })
    expect(moved!.labelWidth).toBeGreaterThan(0)
    expect(geometry.edges.get(rel.id)!.labelWidth).toBe(0)
    const { edges } = assembleGraph(board, rects, geometry, undefined, undefined, [], new Map(), new GraphCache(), undefined, undefined, {
      proposals: [proposal],
      reconnects: [reconnect],
      marks: [],
    })
    const edge = edges.find((e) => e.id === rel.id)!
    expect(edge).toMatchObject({ source: rel.from, target: third, data: { edited: true, ghost: geometry.edges.get(rel.id)!.path, path: moved!.path } })
  })

  it('a later build keeps its lines, and drops the moved line once the edit is gone', () => {
    const edited = computeGeometry(board, rects, [], undefined, [reconnect])
    const back = computeGeometry(board, rects, [], edited, [])
    expect(back.edges.has(`edit:${rel.id}`)).toBe(false)
    expect(back.edges.get(rel.id)!.labelWidth).toBeGreaterThan(0)
  })

  it('adds proposed parts, text, and sticky notes as nodes, and draws a note in motion where it is', () => {
    const geometry = computeGeometry(board, rects)
    const { nodes } = assembleGraph(board, rects, geometry, { type: 'mark', id: sticky.id }, undefined, [], new Map(), new GraphCache(), undefined, undefined, {
      proposals: [proposal],
      reconnects: [],
      marks: [sticky],
      moving: { id: sticky.id, x: 50, y: 60 },
    })
    expect(nodes.find((n) => n.id === 'part-abcdef')).toMatchObject({ type: 'proposal', position: { x: -600, y: -400 } })
    expect(nodes.find((n) => n.id === 'mark:mark-abcdef')).toMatchObject({ type: 'mark-sticky', position: { x: 50, y: 60 }, selected: true })
  })
})

describe('a kept line after another card moves', () => {
  it('meets its cards where a fresh build would put it, so a shared side is shared the same way', () => {
    const base = forty()
    const [a, b, c, d] = base.components.slice(0, 4).map((x) => ({ ...x, group: undefined }))
    const rel = base.relationships[0]!
    const board: Board = {
      ...base,
      groups: [],
      components: [a!, b!, c!, d!],
      relationships: [b!, c!, d!].map((t, k) => ({ ...rel, id: `r${k}`, from: a!.id, to: t.id, label: 'x' })),
    }
    const size = { width: 240, height: 112 }
    const at = (x: number, y: number): Rect => ({ x, y, ...size })
    const positions: Record<string, Rect> = { [a!.id]: at(0, 300), [b!.id]: at(600, 0), [c!.id]: at(600, 300), [d!.id]: at(600, 600) }
    const before = computeGeometry(board, positions)
    // D moves above B: A's order of anchors on its right side changes.
    const next = { ...positions, [d!.id]: at(600, -300) }
    const fresh = computeGeometry(board, next)
    const kept = computeGeometry(board, next, [], before)
    for (const [edgeId, shape] of fresh.edges) {
      const other = kept.edges.get(edgeId)!
      expect(other.points[0], edgeId).toEqual(shape.points[0])
      expect(other.points[other.points.length - 1], edgeId).toEqual(shape.points[shape.points.length - 1])
      expect(other.crowded, edgeId).toBe(shape.crowded)
    }
  })
})

describe('a hidden label after room frees up', () => {
  it('is placed again by the next build, when its line stays', () => {
    const board = refundBoard()
    const positions = placeCards(board, { positions: {}, sizes: {} })
    const before = computeGeometry(board, positions)
    const shown = [...before.edges.values()].find((e) => e.labelWidth > 0 && !e.labelHidden)!
    // The same build, but this label had been held back: its line is kept, and the room it needs is free.
    const held = new Map(before.edges)
    held.set(shown.id, { ...shown, labelHidden: true, labelWidth: 0, labelLines: 1 })
    const next = computeGeometry(board, positions, [], { ...before, edges: held })
    expect(next.edges.get(shown.id)!.path).toBe(shown.path)
    expect(next.edges.get(shown.id)!.labelHidden).toBeUndefined()
    expect(next.edges.get(shown.id)!.labelWidth).toBeGreaterThan(0)
  })

  it('stays held back, as the same object, when there is still no room', () => {
    const board = anatomyBoard()
    const positions = placeCards(board, { positions: {}, sizes: {} })
    const before = computeGeometry(board, positions)
    const next = computeGeometry(board, positions, [], before)
    expect(next.edges.get('agent-writes-file')).toBe(before.edges.get('agent-writes-file'))
    expect(next.edges.get('agent-writes-file')!.labelHidden).toBe(true)
  })
})
