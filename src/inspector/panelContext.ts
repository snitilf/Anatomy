import { createContext, useContext, type RefObject } from 'react'
import type { Selection } from '../app/state'

interface PanelApi {
  choose: (selection: Selection) => void
  headingRef: RefObject<HTMLHeadingElement | null>
  scrollRef?: RefObject<HTMLDivElement | null>
  recentNoteId?: string | undefined
  noteAdded?: (id: string) => void
}

export const PanelContext = createContext<PanelApi>({
  choose: () => {},
  headingRef: { current: null },
  scrollRef: { current: null },
  recentNoteId: undefined,
  noteAdded: () => {},
})

export function usePanel(): PanelApi {
  return useContext(PanelContext)
}
