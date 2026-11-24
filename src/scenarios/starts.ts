import type { Board } from '../board/schema'

/**
 * The parts where a walkthrough starts, each with the titles of the walkthroughs that start there, in board order.
 *
 * A walkthrough starts at the first thing its first step is about: that part, or the part a connection runs from. A first step
 * about nothing is about the whole board, so that walkthrough has no start and marks no part.
 */
export function flowStarts(board: Board): Map<string, string[]> {
  const parts = new Set(board.components.map((c) => c.id))
  const from = new Map(board.relationships.map((r) => [r.id, r.from]))
  const starts = new Map<string, string[]>()
  for (const scenario of board.scenarios) {
    const first = scenario.steps[0]?.highlight[0]
    if (first === undefined) continue
    const part = parts.has(first) ? first : from.get(first)
    if (part === undefined || !parts.has(part)) continue
    starts.set(part, [...(starts.get(part) ?? []), scenario.title])
  }
  return starts
}

/** The words for the walkthroughs that start at a part: "Starts the walkthrough A", or "Starts the walkthroughs A and B". */
export function startsLabel(titles: readonly string[]): string {
  if (titles.length === 0) return ''
  if (titles.length === 1) return `Starts the walkthrough ${titles[0]}`
  return `Starts the walkthroughs ${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
}

const cache = new WeakMap<Board, Map<string, string[]>>()

/** `flowStarts` for the board that is open, worked out once per board, so every build of the map hands each card the same list. */
export function flowStartsOf(board: Board): Map<string, string[]> {
  let starts = cache.get(board)
  if (!starts) {
    starts = flowStarts(board)
    cache.set(board, starts)
  }
  return starts
}
