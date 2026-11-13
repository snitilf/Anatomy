import { useReducer, type ReactNode } from 'react'
import { DispatchContext, StateContext } from './appContext'
import { initialState, reducer, type AppState } from './state'

/** Holds the one reducer for the whole app. Read it with `useAppState` and `useAppDispatch`. */
export function AppStateProvider({ children, initial = initialState }: { children: ReactNode; initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial)
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}
