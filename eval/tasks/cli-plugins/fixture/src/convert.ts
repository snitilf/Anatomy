import { readFile } from 'node:fs/promises'
import type { Plugin } from './plugins/types.ts'

export async function convert(path: string, to: string, plugins: Plugin[]): Promise<string> {
  const ext = path.split('.').pop() ?? ''
  const reader = plugins.find((p) => p.reads.includes(ext))
  const writer = plugins.find((p) => p.writes === to)
  if (!reader || !writer) throw new Error(`No plugin for ${ext} to ${to}`)
  return writer.write(reader.read(await readFile(path, 'utf8')))
}
