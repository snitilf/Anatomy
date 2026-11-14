import { useState } from 'react'
import type { Board } from '../board/schema'
import type { Proposal } from '../layer/model'

export interface PickerItem {
  value: string
  label: string
  group?: string
}

/** Every part on the map, the agent's and the user's, as picker rows. */
export function partItems(board: Board, proposals: readonly Proposal[], exclude?: string): PickerItem[] {
  return [
    ...board.components.filter((c) => c.id !== exclude).map((c) => ({ value: c.id, label: c.label, group: 'Parts' })),
    ...proposals.filter((p) => p.id !== exclude).map((p) => ({ value: p.id, label: p.label, group: 'New parts' })),
  ]
}

/** Opens a picker each time `request` counts up. */
export function useRequestedOpen(request: number): [boolean, (open: boolean) => void] {
  const [seen, setSeen] = useState(request)
  const [open, setOpen] = useState(false)
  if (request !== seen) {
    setSeen(request)
    setOpen(true)
  }
  return [open, setOpen]
}
