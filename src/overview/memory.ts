/**
 * What the Overview page remembers while the map is in front: how far it was scrolled, the row it was left from,
 * and which groups were closed. It lives for the session and belongs to one board.
 */
interface Memory {
  boardId: string
  scroll: number
  row: string | undefined
  closed: Set<string>
}

let memory: Memory = { boardId: '', scroll: 0, row: undefined, closed: new Set() }

export function overviewMemory(boardId: string): Memory {
  if (memory.boardId !== boardId) memory = { boardId, scroll: 0, row: undefined, closed: new Set() }
  return memory
}
