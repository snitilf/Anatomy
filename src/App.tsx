import { AppStateProvider } from './app/AppState'
import { PersistenceProvider } from './app/persistence'
import { Shell } from './app/Shell'

export default function App() {
  return (
    <AppStateProvider>
      <PersistenceProvider>
        <Shell />
      </PersistenceProvider>
    </AppStateProvider>
  )
}
