import type { FolderAccess } from './folder'
import { createMemoryFolder, type MemoryFile } from './memoryFolder'

/** The localStorage key an end-to-end test sets to stand in a repository folder. */
export const TEST_FOLDER_KEY = 'anatomy:test-folder'

interface Stored {
  name: string
  files: Record<string, MemoryFile>
  remembered: boolean
}

/**
 * A repository folder kept in localStorage, for end-to-end tests of folder mode in a browser without a folder picker.
 * Only `vite build --mode e2e` includes it. It is used only when a test has set TEST_FOLDER_KEY.
 */
export function testFolderAccess(): FolderAccess | undefined {
  let stored: Stored
  try {
    const raw = localStorage.getItem(TEST_FOLDER_KEY)
    if (raw === null) return undefined
    stored = JSON.parse(raw) as Stored
  } catch {
    return undefined
  }
  const save = () => localStorage.setItem(TEST_FOLDER_KEY, JSON.stringify(stored))
  const folder = createMemoryFolder(stored.name, new Map(Object.entries(stored.files)), {
    onWrite: (files) => {
      stored.files = Object.fromEntries(files)
      save()
    },
  })
  return {
    pick: async () => folder,
    remember: async (f) => {
      stored.remembered = f !== undefined
      save()
    },
    recall: async () => (stored.remembered ? folder : undefined),
  }
}
