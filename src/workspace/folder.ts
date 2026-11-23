import { LIMITS } from '../board/schema'
import { boardTooLargeMessage } from '../board/validate'
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
  /** The bundled `anatomy` tool that checks a board the way the app does. */
  script: 'anatomy.mjs',
  /** The JSON Schema of a board, for an agent's tools. */
  schema: 'board.schema.json',
} as const

/** The one folder inside `.anatomy` that Anatomy writes to: the topics of the authoring guide. */
export const GUIDE_DIR = 'guide'
/** A topic file, `guide/<name>.md`. */
export type GuideFile = `${typeof GUIDE_DIR}/${string}.md`
export type FileName = (typeof FILES)[keyof typeof FILES] | GuideFile

/** The files straight inside `.anatomy`. */
const TOP_FILES = new Set<string>(Object.values(FILES))
/** A topic file name: lowercase words joined by single hyphens, then `.md`. */
const TOPIC_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

/**
 * Where a file goes inside `.anatomy`: straight in it when it is one of `FILES`, or in its `guide` folder when it is a
 * topic file. Throws for any other name, so no caller can reach a file outside `.anatomy`, whatever name it passes.
 */
export function filePath(name: string): { dir: typeof GUIDE_DIR | undefined; file: string } {
  if (TOP_FILES.has(name)) return { dir: undefined, file: name }
  const slash = name.indexOf('/')
  if (slash !== -1 && name.slice(0, slash) === GUIDE_DIR && TOPIC_FILE.test(name.slice(slash + 1))) return { dir: GUIDE_DIR, file: name.slice(slash + 1) }
  throw new StorageError('folder', `Anatomy writes only inside .anatomy, so it refused the name "${name}".`)
}

/**
 * The most bytes `read` loads for each file. The size is checked first, so a file over its limit is never read.
 * The board has the board limit. The layer grows with the user's marks, so it has room for much more. The files the app
 * writes itself are small, so a bigger one is not the app's.
 */
const READ_LIMITS: Record<string, number> = {
  [FILES.board]: LIMITS.fileBytes,
  [FILES.layer]: 16_000_000,
}
const HELPER_READ_LIMIT = 2_000_000
export const readLimit = (name: string): number => Object.hasOwn(READ_LIMITS, name) ? READ_LIMITS[name]! : HELPER_READ_LIMIT

/** A file is over the size `read` accepts. Nothing of it was read. */
export class FileTooLargeError extends Error {
  readonly file: string
  readonly size: number
  readonly limit: number
  constructor(file: string, size: number, limit: number) {
    super(file === FILES.board ? boardTooLargeMessage(size) : `${file} is ${size.toLocaleString('en-US')} bytes. The limit is ${limit.toLocaleString('en-US')} bytes.`)
    this.name = 'FileTooLargeError'
    this.file = file
    this.size = size
    this.limit = limit
  }
}

/** Throws a `FileTooLargeError` when a file of this size is over the limit for its name. */
export function checkReadSize(name: string, size: number): void {
  const limit = readLimit(name)
  if (size > limit) throw new FileTooLargeError(name, size, limit)
}

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
  /** Undefined when the file does not exist. Throws a `FileTooLargeError`, without reading the file, when it is over its limit. */
  read(file: FileName): Promise<{ text: string; stamp: FileStamp } | undefined>
  /** Creates `.anatomy`, its `guide` folder for a topic, and the file when they are missing. Refuses any other path. */
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
    const path = filePath(name)
    const anatomy = await handle.getDirectoryHandle(ANATOMY_DIR, { create })
    const dir = path.dir === undefined ? anatomy : await anatomy.getDirectoryHandle(path.dir, { create })
    return dir.getFileHandle(path.file, { create })
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
      if (!f) return undefined
      checkReadSize(name, f.size)
      return { text: await f.text(), stamp: { lastModified: f.lastModified, size: f.size } }
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
