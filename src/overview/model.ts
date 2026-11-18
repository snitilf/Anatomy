import type { Board, BoardComponent } from '../board/schema'
import type { BoardDiff } from '../layer/diff'
import { endsOf } from '../inspector/flowRows'
import type { Layer } from '../layer/model'
import { partStates, type ItemState } from '../status/state'

export interface PartRow {
  id: string
  type: 'component' | 'proposal'
  label: string
  summary: string
  lesson: boolean
  /** Assumptions, unknowns, and questions about the part. */
  open: number
  /** The user's notes on the part. */
  notes: number
  /** Where the notes on the part stand in the round trip: the state that wins among them. Absent when it has none. */
  state?: ItemState
  in: number
  out: number
  source: BoardComponent['source']['kind']
}

export interface PartGroup {
  key: string
  label: string
  rows: PartRow[]
  /** The user's own new parts, which carry no group. */
  yours: boolean
}

/** How many connections and links come in to each part and go out of it, with the user's moved ends applied. */
function degrees(board: Board, layer: Layer): Map<string, { in: number; out: number }> {
  const out = new Map<string, { in: number; out: number }>()
  const bump = (id: string, side: 'in' | 'out') => {
    const d = out.get(id) ?? { in: 0, out: 0 }
    d[side]++
    out.set(id, d)
  }
  for (const r of board.relationships) {
    const e = endsOf(layer, r)
    bump(e.from, 'out')
    bump(e.to, 'in')
  }
  for (const l of layer.links) {
    bump(l.from, 'out')
    bump(l.to, 'in')
  }
  return out
}

/** Every part as one row of the list, grouped in the board's order. Parts with no group come last under Other. */
export function partGroups(board: Board, layer: Layer, lessons: ReadonlySet<string>): PartGroup[] {
  const flow = degrees(board, layer)
  const states = partStates(board, layer)
  const open = new Map<string, number>()
  for (const i of board.items) if (i.about) open.set(i.about, (open.get(i.about) ?? 0) + 1)
  const notes = new Map<string, number>()
  for (const n of layer.notes) {
    if (n.target.type !== 'component') continue
    notes.set(n.target.id, (notes.get(n.target.id) ?? 0) + 1)
  }
  const row = (c: BoardComponent): PartRow => ({
    id: c.id,
    type: 'component',
    label: c.label,
    summary: c.summary,
    lesson: c.lesson !== undefined && lessons.has(c.lesson),
    open: open.get(c.id) ?? 0,
    notes: notes.get(c.id) ?? 0,
    ...(states.has(c.id) ? { state: states.get(c.id)!.state } : {}),
    in: flow.get(c.id)?.in ?? 0,
    out: flow.get(c.id)?.out ?? 0,
    source: c.source.kind,
  })
  const known = new Set(board.groups.map((g) => g.id))
  const groups: PartGroup[] = board.groups.map((g) => ({ key: g.id, label: g.label, rows: board.components.filter((c) => c.group === g.id).map(row), yours: false }))
  const other = board.components.filter((c) => c.group === undefined || !known.has(c.group)).map(row)
  if (other.length > 0) groups.push({ key: 'other', label: board.groups.length > 0 ? 'Other' : 'All parts', rows: other, yours: false })
  const proposed = layer.proposals.map<PartRow>((p) => ({
    id: p.id,
    type: 'proposal',
    label: p.label,
    summary: p.summary,
    lesson: false,
    open: 0,
    notes: 0,
    in: flow.get(p.id)?.in ?? 0,
    out: flow.get(p.id)?.out ?? 0,
    source: 'user-stated',
  }))
  if (proposed.length > 0) groups.push({ key: 'yours', label: 'New parts', rows: proposed, yours: true })
  return groups.filter((g) => g.rows.length > 0)
}

export type PartFilter = { query: string; mode: 'all' | 'undecided' | 'questions' }

/** The rows a filter keeps. A group with none left drops out. */
export function filterGroups(groups: readonly PartGroup[], filter: PartFilter): PartGroup[] {
  const q = filter.query.trim().toLowerCase()
  if (q === '' && filter.mode === 'all') return [...groups]
  return groups
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => {
        if (filter.mode === 'undecided' && r.source !== 'agent-proposal') return false
        if (filter.mode === 'questions' && r.open === 0) return false
        return q === '' || r.label.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)
      }),
    }))
    .filter((g) => g.rows.length > 0)
}

export interface ChangeCounts {
  parts: number
  connections: number
  boardChanged: boolean
}

export function changeCounts(diff: BoardDiff | undefined): ChangeCounts {
  if (!diff) return { parts: 0, connections: 0, boardChanged: false }
  const all = [diff.added, diff.removed, diff.changed]
  return { parts: all.reduce((n, c) => n + c.components.length, 0), connections: all.reduce((n, c) => n + c.relationships.length, 0), boardChanged: diff.boardChanged }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "6 parts and 3 connections changed in revision 4". */
export function changeLine(counts: ChangeCounts, revision: number): string | undefined {
  const bits = [counts.parts > 0 ? plural(counts.parts, 'part', 'parts') : '', counts.connections > 0 ? plural(counts.connections, 'connection', 'connections') : ''].filter(Boolean)
  if (bits.length > 0) return `${bits.join(' and ')} changed in revision ${revision}`
  return counts.boardChanged ? `Title, goal, or scope changed in revision ${revision}` : undefined
}

/** "Revision 4 answered 9 items: 5 adopted, 3 answered, 1 declined." Only for the answers to the last send. */
export function responseLine(board: Board, layer: Layer): string | undefined {
  const responses = board.responses
  if (!responses || responses.items.length === 0 || layer.sent?.feedbackId !== responses.respondsTo) return undefined
  const by = (status: string) => responses.items.filter((r) => r.status === status).length
  const parts = (['adopted', 'answered', 'declined'] as const).filter((s) => by(s) > 0).map((s) => `${by(s)} ${s}`)
  return `Revision ${board.revision} answered ${plural(responses.items.length, 'item', 'items')}: ${parts.join(', ')}.`
}

export { plural }
