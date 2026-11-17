import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../app/store'
import { useUi, useUiApi } from '../app/ui'
import { flowRows, type Side } from './flowRows'

/** Whether a group is open. The choice is kept per group name in this browser. */
export function useGroup(name: string, defaultOpen: boolean): readonly [boolean, () => void] {
  const ui = useUiApi()
  const stored = useUi((u) => u.groups[name])
  const open = stored ?? defaultOpen
  return [open, () => ui.setGroup(name, !open)] as const
}

/** The plain inputs and outputs a part lists that no connection names. They read as prose, in the explanation. */
export function usePlainFlow(partId: string): Record<Side, string[]> {
  const { board, layer } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer })))
  if (!board) return { in: [], out: [] }
  const rows = flowRows(board, layer, partId)
  const plain = (side: Side) => rows[side].filter((row) => row.part === undefined).map((row) => row.what)
  return { in: plain('in'), out: plain('out') }
}
