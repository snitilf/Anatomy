import { readdir } from 'node:fs/promises'
import csv from './builtin/csv.ts'
import json from './builtin/json.ts'
import type { Plugin } from './types.ts'

export async function loadPlugins(dir: string): Promise<Plugin[]> {
  const found: Plugin[] = [csv, json]
  for (const file of await readdir(dir).catch(() => [])) {
    found.push((await import(`${dir}/${file}`)).default)
  }
  return found
}
