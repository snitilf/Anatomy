import type { Board } from '../board/schema'

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export function partName(board: Board, id: string, proposals: readonly { id: string; label: string }[] = []): string | undefined {
  return board.components.find((c) => c.id === id)?.label ?? proposals.find((p) => p.id === id)?.label
}

/** A short date such as "Nov 13". */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : MONTH_DAY.format(date)
}
