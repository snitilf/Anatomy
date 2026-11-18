import { useEffect } from 'react'
import type { FocusEventHandler, PointerEventHandler } from 'react'
import type { Selection } from '../app/state'
import { MANUAL_PREFIX } from '../canvas/buildGraph'
import { spotlight, type Spot } from '../canvas/emphasis'

/** What a sidebar row about this selection points at on the map. A board, a note on the board, and a drawing point at nothing. */
export function spotOf(selection: Selection | undefined): Spot | undefined {
  if (!selection) return undefined
  if (selection.type === 'component' || selection.type === 'proposal') return { parts: [selection.id] }
  if (selection.type === 'relationship') return { edges: [selection.id] }
  if (selection.type === 'link') return { edges: [`${MANUAL_PREFIX}${selection.id}`] }
  return undefined
}

export interface SpotProps {
  onPointerEnter: PointerEventHandler
  onPointerLeave: PointerEventHandler
  onFocus: FocusEventHandler
  onBlur: FocusEventHandler
}

/**
 * The handlers that spotlight a spot on the map while the pointer or keyboard focus is on a row. Spread them on the row.
 * A finger never hovers, so touch does nothing here. Moving off the row clears it.
 */
export function spotProps(spot: Spot | undefined): SpotProps {
  const on = () => spotlight(spot)
  const off = () => spotlight(undefined)
  return {
    onPointerEnter: (event) => {
      if (event.pointerType !== 'touch') on()
    },
    onPointerLeave: off,
    onFocus: on,
    onBlur: off,
  }
}

/** Clears the spotlight when what the rows show changes, because a row that goes away never sends its own leave. */
export function useSpotlightReset(selection: string, tab: string, layer: unknown, board: unknown): void {
  useEffect(() => () => spotlight(undefined), [selection, tab, layer, board])
}
