import { AppStoreProvider } from './app/AppStoreProvider'
import { AppToaster } from './app/AppToaster'
import { PersistenceProvider } from './app/persistence'
import { Shell } from './app/Shell'

export default function App() {
  return (
    <AppStoreProvider>
      <PersistenceProvider>
        <Shell />
      </PersistenceProvider>
      <AppToaster />
    </AppStoreProvider>
  )
}
