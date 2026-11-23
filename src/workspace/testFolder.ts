import { filePath, type FileName, type FolderAccess, type Folder } from './folder'
import type { MemoryFile } from './memoryFolder'

/** The localStorage key an end-to-end test sets to stand in a repository folder. */
export const TEST_FOLDER_KEY = 'anatomy:test-folder'

interface Stored {
  name: string
  files: Record<string, MemoryFile>
  remembered: boolean
}

function read(): Stored | undefined {
  try {
    const raw = localStorage.getItem(TEST_FOLDER_KEY)
    return raw === null ? undefined : (JSON.parse(raw) as Stored)
  } catch {
    return undefined
  }
}

const save = (stored: Stored) => localStorage.setItem(TEST_FOLDER_KEY, JSON.stringify(stored))

/**
 * A repository folder kept in localStorage, for end-to-end tests of folder mode in a browser without a folder picker.
 * Every read goes back to localStorage, so a test can write a new revision of the board as an agent would.
 * Only `vite build --mode e2e` includes it. It is used only when a test has set TEST_FOLDER_KEY.
 */
export function testFolderAccess(): FolderAccess | undefined {
  const first = read()
  if (!first) return undefined
  const file = (name: FileName) => read()?.files[name]
  const stampOf = (f: MemoryFile) => ({ lastModified: f.lastModified, size: new TextEncoder().encode(f.text).length })
  const folder: Folder = {
    name: first.name,
    permission: async () => 'granted',
    stat: async (name) => {
      const f = file(name)
      return f ? stampOf(f) : undefined
    },
    read: async (name) => {
      const f = file(name)
      return f ? { text: f.text, stamp: stampOf(f) } : undefined
    },
    write: async (name, text) => {
      filePath(name)
      const stored = read() ?? { ...first, files: {} }
      stored.files[name] = { text, lastModified: Date.now() }
      save(stored)
    },
  }
  const remember = (on: boolean) => {
    const stored = read()
    if (stored) save({ ...stored, remembered: on })
  }
  return {
    pick: async () => folder,
    remember: async (f) => remember(f !== undefined),
    recall: async () => (read()?.remembered ? folder : undefined),
  }
}
