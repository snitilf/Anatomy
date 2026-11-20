import type { Board } from '../board/schema'
import type { Link, Reconnect } from '../layer/model'

/** One connection, as far as bundling cares: where it goes, and whether the user drew it. */
export interface Connection {
  /** The connection's id, or the id of the user's link. */
  id: string
  from: string
  to: string
  mine: boolean
}

/**
 * What a part belongs to in the far view: its group, or itself when it has none. A part the user proposed has no
 * group, so each one is a block of its own too.
 */
export const clusterOf = (board: Board, proposals: readonly { id: string }[] = []): Map<string, string> => {
  const clusters = new Map(board.components.map((c) => [c.id, c.group !== undefined && board.groups.some((g) => g.id === c.group) ? `group:${c.group}` : c.id]))
  for (const p of proposals) clusters.set(p.id, p.id)
  return clusters
}

/** Every connection of the board and the user's links, with the ends the user moved to. */
export function connectionsOf(board: Board, links: readonly Link[], reconnects: readonly Reconnect[]): Connection[] {
  const edit = new Map(reconnects.map((e) => [e.relationshipId, e]))
  return [
    ...board.relationships.map((r) => ({ id: r.id, from: edit.get(r.id)?.from ?? r.from, to: edit.get(r.id)?.to ?? r.to, mine: false })),
    ...links.map((l) => ({ id: l.id, from: l.from, to: l.to, mine: true })),
  ]
}

export interface Pair {
  /** The two ends, in order of name, so a pair is the same in either direction. An end is `group:<id>`, or the id of a part with no group. */
  a: string
  b: string
  count: number
  /** How many of the connections run from `a` to `b`, and how many from `b` to `a`. */
  ab: number
  ba: number
  /** The ids of the connections and links the pair holds. */
  connectionIds: string[]
  /** Every connection of the pair is one the user drew. */
  mine: boolean
  /** How many of the connections are links the user drew. */
  yours: number
}

/** Counts the connections between each two clusters. A connection inside one cluster, or to a part that is not on the map, is not counted. */
export function countPairs(clusters: ReadonlyMap<string, string>, connections: readonly Connection[]): Pair[] {
  const pairs = new Map<string, Pair>()
  for (const c of connections) {
    const x = clusters.get(c.from)
    const y = clusters.get(c.to)
    if (x === undefined || y === undefined || x === y) continue
    const [a, b] = x < y ? [x, y] : [y, x]
    const key = `${a}|${b}`
    let pair = pairs.get(key)
    if (pair) {
      pair.count++
      pair.connectionIds.push(c.id)
      pair.mine = pair.mine && c.mine
      if (c.mine) pair.yours++
    } else {
      pair = { a, b, count: 1, ab: 0, ba: 0, connectionIds: [c.id], mine: c.mine, yours: c.mine ? 1 : 0 }
      pairs.set(key, pair)
    }
    if (x === a) pair.ab++
    else pair.ba++
  }
  return [...pairs.values()].sort((p, q) => (`${p.a}|${p.b}` < `${q.a}|${q.b}` ? -1 : 1))
}

/**
 * Which connections fall between which two groups, and how many. A part with no group is an end of its own. A
 * connection inside one group is left out. It uses no layout and no routing, so a list of the links between groups can share it.
 */
export function bundleGroups(board: Board, links: readonly Link[] = [], reconnects: readonly Reconnect[] = [], proposals: readonly { id: string }[] = []): Pair[] {
  return countPairs(clusterOf(board, proposals), connectionsOf(board, links, reconnects))
}
