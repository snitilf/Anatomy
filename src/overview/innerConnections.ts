import type { Board } from '../board/schema'
import { endsOf } from '../inspector/flowRows'
import type { Link, Reconnect } from '../layer/model'
import type { Bundle } from './betweenGroups'

/**
 * The connections and links that stay inside one group, one entry per group that has any, in the order of the board's groups.
 * Between-group bundling leaves these out, so this is the other half of the list. Both ends are `group:<id>`.
 */
export function innerConnections(board: Board, links: readonly Link[], reconnects: readonly Reconnect[]): Bundle[] {
  const known = new Set(board.groups.map((g) => g.id))
  const groupOf = new Map(board.components.map((c) => [c.id, c.group !== undefined && known.has(c.group) ? c.group : undefined] as const))
  const found = new Map<string, Bundle>()
  const add = (from: string, to: string, id: string, mine: boolean) => {
    const g = groupOf.get(from)
    if (g === undefined || g !== groupOf.get(to)) return
    const entry = found.get(g) ?? { a: `group:${g}`, b: `group:${g}`, count: 0, connectionIds: [], mine: true }
    entry.count++
    entry.connectionIds.push(id)
    entry.mine = entry.mine && mine
    found.set(g, entry)
  }
  for (const r of board.relationships) {
    const now = endsOf({ reconnects: [...reconnects] }, r)
    add(now.from, now.to, r.id, false)
  }
  for (const l of links) add(l.from, l.to, l.id, true)
  return board.groups.flatMap((g) => found.get(g.id) ?? [])
}
