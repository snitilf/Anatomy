// Builds `.anatomy/anatomy.mjs`: `bin/anatomy.ts` and everything it imports (the board schema, `parseBoard`, Zod) in one
// file that runs on Node with no install. The app imports the text as `virtual:anatomy-cli` and writes it next to the
// README, so the app and the tool always run the same validation code.
import { readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, type Plugin, type Rolldown } from 'vite'
import { SCRIPT_BANNER } from '../../src/cli/script.ts'
import { agentGuide } from '../../src/cli/topics.ts'

// fileURLToPath decodes the URL, so a folder name with a space or other special character stays a real path.
const root = fileURLToPath(new URL('../../', import.meta.url))
const ENTRY = 'bin/anatomy.ts'
const VIRTUAL = 'virtual:anatomy-cli'
const RESOLVED = `\0${VIRTUAL}`
/** Text files the tool carries inside it, by the name `bin/anatomy.ts` reads them with. */
const EMBEDDED = { __ANATOMY_GUIDE__: 'docs/authoring-guide.md', __ANATOMY_FIELDS__: 'schema/board.v1.fields.txt' } as const

export interface CliBundle {
  /** The whole file, banner first. */
  text: string
  /** Absolute paths of the source files in the bundle, and of the text files it carries. */
  modules: string[]
}

/** The text of an embedded file. Of the guide, only the sections that topics use. */
function embedded(path: string): string {
  const text = readFileSync(join(root, path), 'utf8')
  return path === EMBEDDED.__ANATOMY_GUIDE__ ? agentGuide(text) : text
}

/** Bundles the tool. Node built-ins stay imports; everything else is inside the file. */
export async function buildCliBundle(): Promise<CliBundle> {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    // The app's plugins and public folder have nothing to do with the tool.
    plugins: [],
    publicDir: false,
    ssr: { noExternal: true, target: 'node' },
    define: Object.fromEntries(Object.entries(EMBEDDED).map(([name, path]) => [name, JSON.stringify(embedded(path))])),
    build: {
      ssr: ENTRY,
      write: false,
      minify: true,
      target: 'node24',
      rollupOptions: { output: { format: 'es', codeSplitting: false } },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[]
  const chunks = outputs.flatMap((o) => o.output).filter((c): c is Rolldown.OutputChunk => c.type === 'chunk')
  const [chunk] = chunks
  if (chunks.length !== 1 || !chunk) throw new Error(`Expected one chunk for ${ENTRY}, got ${chunks.length}.`)
  const modules = chunk.moduleIds.filter((id) => id.startsWith(root) && !id.includes(`${sep}node_modules${sep}`))
  return { text: `${SCRIPT_BANNER}${chunk.code}`, modules: [...modules, ...Object.values(EMBEDDED).map((path) => join(root, path))] }
}

/** Makes `import('virtual:anatomy-cli')` give the bundled tool as a string, in the dev server, the build, and tests. */
export function anatomyCli(): Plugin {
  return {
    name: 'anatomy-cli',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined
    },
    async load(id) {
      if (id !== RESOLVED) return undefined
      const bundle = await buildCliBundle()
      // The dev server and tests then rebuild the text when a source file of the tool changes.
      for (const file of bundle.modules) this.addWatchFile(file)
      return `export default ${JSON.stringify(bundle.text)}\n`
    },
  }
}
