import { AppStoreProvider } from './app/AppStoreProvider'
import { AppToaster } from './app/AppToaster'
import { Shell } from './app/Shell'
import { WorkspaceProvider } from './app/workspace'
import { testFolderAccess } from './workspace/testFolder'

// End-to-end builds (`vite build --mode e2e`) can stand in a folder kept in this browser for the folder picker.
// In every other build the condition is false at build time, and the test folder is not bundled.
const folderAccess = import.meta.env.MODE === 'e2e' ? testFolderAccess() : undefined

export default function App() {
  return (
    <AppStoreProvider>
      <WorkspaceProvider folderAccess={folderAccess}>
        <Shell />
      </WorkspaceProvider>
      <AppToaster />
    </AppStoreProvider>
  )
}
