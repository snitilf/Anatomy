import { openStore, StorageError, type BoardStore } from './db'

/** The files Anatomy reads and writes inside the `.anatomy` folder of a repository. */
export const ANATOMY_DIR = '.anatomy'
export const FILES = {
  /** Written by the agent. Only read here. */
  board: 'board.json',
  /** The user layer, saved a moment after each change. */
  layer: 'layer.json',
  /** A layer that could not be read, kept before it is replaced. */
  layerBackup: 'layer.backup.json',
  /** What the user sends to the agent. */
  feedback: 'feedback.json',
  /** The format notes for agents. */
  readme: 'README.md',
} as const
export type FileName = (typeof FILES)[keyof typeof FILES]

/** Enough to tell that a file changed without reading it. */
export interface FileStamp {
  lastModified: number
  size: number
}

export type Permission = 'granted' | 'prompt' | 'denied'

/** A repository folder the user opened. Files are named inside its `.anatomy` folder. */
export interface Folder {
  readonly name: string
  /** Whether the app may read and write the folder. Asking (`ask: true`) must happen in a user gesture. */
  permission(ask: boolean): Promise<Permission>
  /** Undefined when the file does not exist. */
  stat(file: FileName): Promise<FileStamp | undefined>
  read(file: FileName): Promise<{ text: string; stamp: FileStamp } | undefined>
  /** Creates `.anatomy` and the file when they are missing. */
  write(file: FileName, text: string): Promise<void>
}

/** Where folders come from: the folder picker, and the folder remembered from the last visit. */
export interface FolderAccess {
  /** Undefined when the user cancels. */
  pick(): Promise<Folder | undefined>
  remember(folder: Folder | undefined): Promise<void>
  recall(): Promise<Folder | undefined>
}

// The parts of the File System Access API used here. TypeScript's DOM types do not have all of them yet.
interface DirectoryHandle {
  kind: 'directory'
  name: string
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
}
interface FileHandle {
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}
type PickerWindow = Window & { showDirectoryPicker?: (options?: { id?: string; mode?: 'readwrite' }) => Promise<DirectoryHandle> }

const isMissing = (error: unknown) => error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError')

function folderError(error: unknown): StorageError {
  if (error instanceof StorageError) return error
  return new StorageError('folder', 'Anatomy could not write to the folder.', { cause: error })
}

function isHandle(value: unknown): value is DirectoryHandle {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'directory' && typeof (value as { getFileHandle?: unknown }).getFileHandle === 'function'
}

function browserFolder(handle: DirectoryHandle): Folder & { handle: DirectoryHandle } {
  const file = async (name: FileName, create: boolean) => {
    const dir = await handle.getDirectoryHandle(ANATOMY_DIR, { create })
    return dir.getFileHandle(name, { create })
  }
  const open = async (name: FileName): Promise<File | undefined> => {
    try {
      return await (await file(name, false)).getFile()
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }
  return {
    handle,
    name: handle.name,
    async permission(ask) {
      const options = { mode: 'readwrite' } as const
      return ask ? handle.requestPermission(options) : handle.queryPermission(options)
    },
    async stat(name) {
      const f = await open(name)
      return f ? { lastModified: f.lastModified, size: f.size } : undefined
    },
    async read(name) {
      const f = await open(name)
      return f ? { text: await f.text(), stamp: { lastModified: f.lastModified, size: f.size } } : undefined
    },
    async write(name, text) {
      try {
        const writable = await (await file(name, true)).createWritable()
        await writable.write(text)
        await writable.close()
      } catch (error) {
        throw folderError(error)
      }
    },
  }
}

/** True when this browser can open a folder (Chrome and Edge). */
export function canPickFolders(win: Window = window): boolean {
  return typeof (win as PickerWindow).showDirectoryPicker === 'function'
}

/** Runs one step with its own connection to the browser database. */
async function withStore<T>(work: (store: BoardStore) => Promise<T>): Promise<T> {
  const store = await openStore()
  try {
    return await work(store)
  } finally {
    store.close()
  }
}

/** Folders through the File System Access API. The handle is kept in the browser database, so a reload can ask for it again. */
export function browserFolderAccess(win: Window = window): FolderAccess {
  return {
    async pick() {
      const picker = (win as PickerWindow).showDirectoryPicker
      if (!picker) return undefined
      try {
        return browserFolder(await picker.call(win, { id: 'anatomy-repository', mode: 'readwrite' }))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return undefined
        throw error
      }
    },
    async remember(folder) {
      const handle = folder && 'handle' in folder ? (folder as { handle: unknown }).handle : undefined
      await withStore((store) => store.setFolder(handle))
    },
    async recall() {
      const handle = await withStore((store) => store.getFolder())
      return isHandle(handle) ? browserFolder(handle) : undefined
    },
  }
}
