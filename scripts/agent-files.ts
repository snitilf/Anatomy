// Writes the files the app writes for an agent into `<folder>/.anatomy/`, the way Copy prompt does: the README, the
// topics in `guide/`, the JSON Schema, and `anatomy.mjs`. A file the user took over (no mark) stays as it is.
// It is for the evaluation in `eval/`, so a run needs no browser.
// Run with: npm run agent-files -- <folder>
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { keepScript } from '../src/cli/script.ts'
import { buildCliBundle } from './lib/cliBundle.ts'
import { withAppModules } from './lib/vite.ts'

interface AgentFile {
  name: string
  text: string
  keep: (existing: string) => boolean
}

const folder = process.argv[2]
if (folder === undefined || !existsSync(folder) || !statSync(folder).isDirectory()) {
  console.error('Usage: npm run agent-files -- <folder>\nThe folder must exist.')
  process.exit(2)
}

const [{ agentFiles }] = (await withAppModules(['/src/app/agentReadme.ts'], (modules) => modules)) as [{ agentFiles: () => AgentFile[] }]
const script = (await buildCliBundle()).text
const files: AgentFile[] = [...agentFiles(), { name: 'anatomy.mjs', text: script, keep: (existing) => keepScript(existing, script) }]

const target = resolve(folder, '.anatomy')
for (const file of files) {
  const path = join(target, file.name)
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : undefined
  if (existing !== undefined && file.keep(existing)) {
    console.log(`Kept ${path}`)
    continue
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, file.text)
  console.log(`Wrote ${path}`)
}
