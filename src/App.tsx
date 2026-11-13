import { AppStateProvider } from './app/AppState'
import { Shell } from './app/Shell'

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  )
}
