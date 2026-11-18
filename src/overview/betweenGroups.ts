import type { Board } from '../board/schema'
import { endsOf } from '../inspector/flowRows'
import type { Link, Reconnect } from '../layer/model'

export interface Bundle {
  /** The two ends: `group:<id>` for a group, or the ID of a part that has none. Order carries no direction. */
  a: string
  b: string
  count: number
  /** The IDs of the connections and of the user's links between the two ends. */
  connectionIds: string[]
  /** Every connection in the bundle is one the user drew. */
  mine: boolean
}

/*
 * A stand-in with the signature of `bundleGroups` in `src/canvas/bundles.ts`, which is built on another branch.
 * It will be replaced by that function after a rebase, and this file removed.
 */
export function bundleGroups(board: Board, links: readonly Link[], reconnects: Reconnect[]): Bundle[] {
  const groupOf = new Map(board.components.map((c) => [c.id, c.group] as const))
  const known = new Set(board.groups.map((g) => g.id))
  const end = (part: string) => {
    const g = groupOf.get(part)
    return g !== undefined && known.has(g) ? `group:${g}` : part
  }
  const bundles = new Map<string, Bundle>()
  const add = (from: string, to: string, id: string, mine: boolean) => {
    const a = end(from)
    const b = end(to)
    if (a === b) return
    const [x, y] = a < b ? [a, b] : [b, a]
    const key = `${x}|${y}`
    const found = bundles.get(key) ?? { a: x, b: y, count: 0, connectionIds: [], mine: true }
    found.count++
    found.connectionIds.push(id)
    found.mine = found.mine && mine
    bundles.set(key, found)
  }
  for (const r of board.relationships) {
    const now = endsOf({ reconnects }, r)
    add(now.from, now.to, r.id, false)
  }
  for (const l of links) add(l.from, l.to, l.id, true)
  return [...bundles.values()].sort((p, q) => q.count - p.count || `${p.a}${p.b}`.localeCompare(`${q.a}${q.b}`))
}
