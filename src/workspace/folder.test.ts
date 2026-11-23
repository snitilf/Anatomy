import { beforeEach, describe, expect, it } from 'vitest'
import { browserFolderAccess, type FileName, type Folder } from './folder'
import { createMemoryFolder } from './memoryFolder'
import { TEST_FOLDER_KEY, testFolderAccess } from './testFolder'

// The folder layer writes inside `.anatomy` and in one folder below it, `.anatomy/guide`, and nowhere else.

/** A directory in memory with the parts of the File System Access API that folder.ts uses. */
class FakeDir {
  readonly kind = 'directory'
  readonly dirs = new Map<string, FakeDir>()
  readonly files = new Map<string, string>()
  readonly name: string
  constructor(name: string) {
    this.name = name
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (name.includes('/') || name === '..' || name === '.') throw new TypeError(`Bad name ${name}`)
    let dir = this.dirs.get(name)
    if (!dir) {
      if (!options?.create) throw new DOMException('Missing', 'NotFoundError')
      dir = new FakeDir(name)
      this.dirs.set(name, dir)
    }
    return dir
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (name.includes('/') || name === '..' || name === '.') throw new TypeError(`Bad name ${name}`)
    if (!this.files.has(name)) {
      if (!options?.create) throw new DOMException('Missing', 'NotFoundError')
      this.files.set(name, '')
    }
    return {
      getFile: async () => new File([this.files.get(name)!], name, { lastModified: 1 }),
      createWritable: async () => {
        let text = ''
        return {
          write: async (data: string) => void (text += data),
          close: async () => void this.files.set(name, text),
        }
      },
    }
  }
  async queryPermission() {
    return 'granted' as const
  }
  async requestPermission() {
    return 'granted' as const
  }
  /** Every file below this directory, as paths. */
  paths(prefix = ''): string[] {
    return [...[...this.files.keys()].map((f) => `${prefix}${f}`), ...[...this.dirs].flatMap(([n, d]) => d.paths(`${prefix}${n}/`))].sort()
  }
}

async function browserFolder(): Promise<{ folder: Folder; root: FakeDir }> {
  const root = new FakeDir('shop')
  const win = { showDirectoryPicker: async () => root } as unknown as Window
  const folder = await browserFolderAccess(win).pick()
  return { folder: folder!, root }
}

const outside = ['../escape.md', 'guide/../../escape.md', 'guide/../README.md', '/etc/escape.md', 'other/escape.md', 'guide/sub/escape.md', 'guide/', '.', '..', '', 'guide/.hidden.md', 'guide\\escape.md']

describe('the browser folder', () => {
  it('writes a topic into .anatomy/guide and reads it back', async () => {
    const { folder, root } = await browserFolder()
    await folder.write('guide/ask.md', 'Ask first.')
    await folder.write('README.md', 'Core.')
    expect(root.paths()).toEqual(['.anatomy/README.md', '.anatomy/guide/ask.md'])
    expect((await folder.read('guide/ask.md'))?.text).toBe('Ask first.')
    expect(await folder.stat('guide/honesty.md')).toBeUndefined()
  })

  it.each(outside)('refuses to write "%s" and writes nothing', async (name) => {
    const { folder, root } = await browserFolder()
    await expect(folder.write(name as FileName, 'x')).rejects.toThrow()
    expect(root.paths()).toEqual([])
  })
})

describe('the memory folder', () => {
  it('writes a topic under guide/', async () => {
    const folder = createMemoryFolder('shop')
    await folder.write('guide/ask.md', 'Ask first.')
    expect([...folder.files.keys()]).toEqual(['guide/ask.md'])
  })

  it.each(outside)('refuses to write "%s"', async (name) => {
    const folder = createMemoryFolder('shop')
    await expect(folder.write(name as FileName, 'x')).rejects.toThrow()
    expect(folder.files.size).toBe(0)
  })
})

describe('the end-to-end test folder', () => {
  beforeEach(() => localStorage.setItem(TEST_FOLDER_KEY, JSON.stringify({ name: 'shop', files: {}, remembered: false })))

  it('writes a topic under guide/', async () => {
    const folder = (await testFolderAccess()!.pick())!
    await folder.write('guide/ask.md', 'Ask first.')
    expect(Object.keys((JSON.parse(localStorage.getItem(TEST_FOLDER_KEY)!) as { files: object }).files)).toEqual(['guide/ask.md'])
  })

  it.each(outside)('refuses to write "%s"', async (name) => {
    const folder = (await testFolderAccess()!.pick())!
    await expect(folder.write(name as FileName, 'x')).rejects.toThrow()
    expect((JSON.parse(localStorage.getItem(TEST_FOLDER_KEY)!) as { files: object }).files).toEqual({})
  })
})
