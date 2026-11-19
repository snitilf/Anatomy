import type { Board } from '../board/schema'
import { partName } from '../inspector/names'
import type { Pair } from './bundles'

/** The key of a bundle: its two ends, in the order `countPairs` gives them. It does not depend on where the line is drawn, so it holds across layouts and reimports. */
export const bundleKey = (a: string, b: string): string => `${a}|${b}`

type Proposals = readonly { id: string; label: string }[]

/** The name of one end of a bundle: a group's label, or the name of a part. */
export function endName(board: Board, proposals: Proposals, end: string): string {
  if (end.startsWith('group:')) return board.groups.find((g) => g.id === end.slice(6))?.label ?? end.slice(6)
  return partName(board, end, proposals) ?? end
}

/** Where an end sits in the board's order: its group's place, or after every group for a part. */
export function endRank(board: Board, end: string): number {
  const at = board.groups.findIndex((g) => `group:${g.id}` === end)
  return at >= 0 ? at : board.groups.length
}

export type Way = 'forward' | 'backward' | 'both'

/** Which way a pair's connections run, from its first end to its second. */
export function wayOf(forward: number, backward: number): Way {
  if (forward > 0 && backward > 0) return 'both'
  return forward > 0 ? 'forward' : 'backward'
}

export const ARROW_OF: Record<Way, string> = { forward: '→', backward: '←', both: '↔' }

export const connectionsWord = (count: number): string => `${count} ${count === 1 ? 'connection' : 'connections'}`

export interface BundleWords {
  /** The ends, in the order of the board's groups. */
  first: string
  second: string
  way: Way
  /** "Frontend → Backend". */
  title: string
  /** "Frontend → Backend, 14 connections". */
  tag: string
  /** "Frontend to Backend, 14 connections", for a screen reader. */
  spoken: string
}

/**
 * How a bundle reads: its ends in the order of the board's groups, with an arrow for the way its connections run
 * (→ from the first to the second, ← the other way, ↔ both ways).
 */
export function bundleWords(board: Board, proposals: Proposals, pair: Pick<Pair, 'a' | 'b' | 'ab' | 'ba' | 'count'>): BundleWords {
  const swap = endRank(board, pair.a) > endRank(board, pair.b)
  const [one, two] = swap ? [pair.b, pair.a] : [pair.a, pair.b]
  const way = wayOf(swap ? pair.ba : pair.ab, swap ? pair.ab : pair.ba)
  const first = endName(board, proposals, one)
  const second = endName(board, proposals, two)
  const count = connectionsWord(pair.count)
  const spokenWay = way === 'both' ? `${first} and ${second}` : way === 'forward' ? `${first} to ${second}` : `${second} to ${first}`
  return {
    first,
    second,
    way,
    title: `${first} ${ARROW_OF[way]} ${second}`,
    tag: `${first} ${ARROW_OF[way]} ${second}, ${count}`,
    spoken: `${spokenWay}, ${count}`,
  }
}
