import { checkReadSize, filePath, type FileName, type FileStamp, type Folder, type FolderAccess, type Permission } from './folder'

export interface MemoryFile {
  text: string
  lastModified: number
}

/**
 * A folder that lives in memory, for tests. `onWrite` sees every write, so a caller can keep the files somewhere.
 * `clock` gives the modification time of each write.
 */
export function createMemoryFolder(
  name: string,
  files: Map<string, MemoryFile> = new Map(),
  options: { permission?: Permission; onWrite?: (files: Map<string, MemoryFile>) => void; clock?: () => number } = {},
): Folder & { files: Map<string, MemoryFile>; grant(permission: Permission): void } {
  let permission: Permission = options.permission ?? 'granted'
  const clock = options.clock ?? (() => Date.now())
  const stampOf = (f: MemoryFile): FileStamp => ({ lastModified: f.lastModified, size: new TextEncoder().encode(f.text).length })
  const check = () => {
    if (permission !== 'granted') throw new DOMException('Permission is needed.', 'NotAllowedError')
  }
  return {
    name,
    files,
    grant(next) {
      permission = next
    },
    async permission(ask) {
      if (ask && permission === 'prompt') permission = 'granted'
      return permission
    },
    async stat(file: FileName) {
      check()
      filePath(file)
      const f = files.get(file)
      return f ? stampOf(f) : undefined
    },
    async read(file: FileName) {
      check()
      filePath(file)
      const f = files.get(file)
      if (!f) return undefined
      checkReadSize(file, stampOf(f).size)
      return { text: f.text, stamp: stampOf(f) }
    },
    async write(file: FileName, text: string) {
      check()
      filePath(file)
      files.set(file, { text, lastModified: clock() })
      options.onWrite?.(files)
    },
  }
}

/** Folder access that always picks the same folder and remembers it in memory. */
export function memoryFolderAccess(folder: Folder | undefined, remembered?: Folder): FolderAccess & { remembered: Folder | undefined } {
  const access = {
    remembered,
    async pick() {
      return folder
    },
    async remember(f: Folder | undefined) {
      access.remembered = f
    },
    async recall() {
      return access.remembered
    },
  }
  return access
}
