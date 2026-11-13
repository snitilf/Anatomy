import { describe, expect, it } from 'vitest'
import fortyText from '../../e2e/fixtures/forty-parts.board.json?raw'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'
import { resolvePositions } from '../overlay/layout'
import { nordetBoard } from '../overlay/testBoards'
import { emptyOverlay, type Point } from '../overlay/types'
import { assembleGraph, buildGraph, computeGeometry, GraphCache, moveCard } from './buildGraph'
import { PointIndex } from './labelPlacement'

const forty = (): Board => {
  const r = parseBoard(fortyText)
  if (!r.ok) throw new Error('fixture board is invalid')
  return r.board
}

function setup(board: Board) {
  const positions = resolvePositions(board, emptyOverlay(board.id))
  const geometry = computeGeometry(board, positions)
  const cache = new GraphCache()
  const noCounts = new Map<string, number>()
  const build = (pos: Record<string, Point>, geo = geometry, held?: string) =>
    assembleGraph(board, pos, geo, undefined, undefined, [], noCounts, cache, held)
  return { positions, geometry, build }
}

describe.each([
  ['a small board', nordetBoard],
  ['a large board', forty],
])('moving one card on %s', (_name, load) => {
  const board = load()
  const touching = (id: string) => board.relationships.filter((r) => r.from === id || r.to === id).map((r) => r.id)
  // The card with the most connections makes the clearest case.
  const id = [...board.components].sort((a, b) => touching(b.id).length - touching(a.id).length)[0]!.id

  it('redraws only the connections of that card and its group', () => {
    const { positions, geometry } = setup(board)
    const next = { ...positions, [id]: { x: positions[id]!.x + 40, y: positions[id]!.y + 30 } }
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

  it('keeps the labels of a moved connection on its line', () => {
    const { positions, geometry } = setup(board)
    const next = { ...positions, [id]: { x: positions[id]!.x + 40, y: positions[id]!.y + 30 } }
    const after = moveCard(board, geometry, next, id)
    for (const edgeId of touching(id)) {
      const before = geometry.edges.get(edgeId)!
      const shape = after.edges.get(edgeId)!
      expect(shape.path).not.toBe(before.path)
      expect(shape.labelWidth).toBe(before.labelWidth)
      expect(shape.labelLines).toBe(before.labelLines)
      expect(Number.isFinite(shape.labelX) && Number.isFinite(shape.labelY)).toBe(true)
    }
  })

  it('hands React Flow the same objects for everything that did not change', () => {
    const { positions, geometry, build } = setup(board)
    const first = build(positions)
    const next = { ...positions, [id]: { x: positions[id]!.x + 40, y: positions[id]!.y + 30 } }
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
      expect(again === edge).toBe(!mine.has(edge.id))
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
    const board = nordetBoard()
    const [a, b, c] = board.components
    const positions = resolvePositions(board, emptyOverlay(board.id))
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

describe('arrowheads', () => {
  it('share one marker object per color', () => {
    const { edges } = buildGraph(forty(), resolvePositions(forty(), emptyOverlay('x')), undefined)
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

describe('PointIndex', () => {
  it('counts the points in a box the same way a plain scan does', () => {
    const index = new PointIndex()
    const lines: Point[][] = []
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let owner = 0; owner < 6; owner++) {
      const points = Array.from({ length: 80 }, () => ({ x: random() * 1500 - 300, y: random() * 900 - 200 }))
      lines.push(points)
      index.add(owner, points)
    }
    for (let i = 0; i < 60; i++) {
      const box = { x: random() * 1200 - 200, y: random() * 700 - 100, width: 40 + random() * 200, height: 20 + random() * 120 }
      const skip = i % 7 === 6 ? -1 : i % 6
      let expected = 0
      lines.forEach((points, owner) => {
        if (owner === skip) return
        for (const p of points) if (p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height) expected++
      })
      expect(index.countInside(box, skip)).toBe(expected)
    }
  })
})
