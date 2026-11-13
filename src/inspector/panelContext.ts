import { createContext, useContext, type RefObject } from 'react'
import type { Selection } from '../app/state'

interface PanelApi {
  choose: (selection: Selection) => void
  headingRef: RefObject<HTMLHeadingElement | null>
}

export const PanelContext = createContext<PanelApi>({
  choose: () => {},
  headingRef: { current: null },
})

export function usePanel(): PanelApi {
  return useContext(PanelContext)
}
