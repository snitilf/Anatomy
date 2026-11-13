import { createContext, useContext } from 'react'
import { useStore, type StoreApi } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { initialState, reducer, type Action, type AppState } from './state'

export type AppStore = StoreApi<AppState>
export type Dispatch = (action: Action) => void

export interface AppStoreApi {
  store: AppStore
  dispatch: Dispatch
}

/**
 * Makes one app store. The state changes only through the pure reducer in `state.ts`.
 * An action that leaves the state as it was notifies nobody.
 */
export function createAppStore(initial: AppState = initialState): AppStoreApi {
  const store = createStore<AppState>(() => initial)
  const dispatch: Dispatch = (action) => {
    const current = store.getState()
    const next = reducer(current, action)
    // The reducer sometimes drops a key, so the state is replaced, not merged.
    if (next !== current) store.setState(next, true)
  }
  return { store, dispatch }
}

export const AppStoreContext = createContext<AppStoreApi | undefined>(undefined)

function useApi(): AppStoreApi {
  const api = useContext(AppStoreContext)
  if (!api) throw new Error('The app store is missing. Wrap the tree in AppStoreProvider.')
  return api
}

/** Reads one slice of the app state. The component renders again only when the slice changes. */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(useApi().store, selector)
}

/** The store itself, for code that must read the latest state outside a render. */
export function useAppStoreApi(): AppStore {
  return useApi().store
}

export function useAppDispatch(): Dispatch {
  return useApi().dispatch
}
