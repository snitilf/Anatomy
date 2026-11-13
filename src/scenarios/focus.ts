import { createContext, type MutableRefObject } from 'react'

/** The Play button that started the walkthrough. Closing the player puts focus back on it. */
export const PlayOriginContext = createContext<MutableRefObject<HTMLElement | null>>({ current: null })
