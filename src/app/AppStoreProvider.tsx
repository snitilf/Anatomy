import { useState, type ReactNode } from 'react'
import { initialState, type AppState } from './state'
import { AppStoreContext, createAppStore } from './store'

/** Creates one store for each mounted app, so two apps never share state. */
export function AppStoreProvider({ children, initial = initialState }: { children: ReactNode; initial?: AppState }) {
  const [api] = useState(() => createAppStore(initial))
  return <AppStoreContext.Provider value={api}>{children}</AppStoreContext.Provider>
}
