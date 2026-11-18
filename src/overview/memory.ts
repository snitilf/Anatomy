/**
 * What the Overview page remembers while the map is in front: how far it was scrolled, the row it was left from,
 * and which groups were closed. It lives for the session and belongs to one board.
 */
interface Memory {
  boardId: string
  scroll: number
  row: string | undefined
  closed: Set<string>
  /** Rows of Between groups that are open. */
  expanded: Set<string>
  /** The page scrolls this row into view when it opens, once. */
  reveal: boolean
}

let memory: Memory = { boardId: '', scroll: 0, row: undefined, closed: new Set(), expanded: new Set(), reveal: false }

export function overviewMemory(boardId: string): Memory {
  if (memory.boardId !== boardId) memory = { boardId, scroll: 0, row: undefined, closed: new Set(), expanded: new Set(), reveal: false }
  return memory
}

/** Leaves the page to open at a row: the group of it open, the row focused and scrolled into view. */
export function revealRow(boardId: string, row: string, group?: string): void {
  const memory = overviewMemory(boardId)
  memory.row = row
  memory.reveal = true
  if (group !== undefined) memory.closed.delete(group)
}
