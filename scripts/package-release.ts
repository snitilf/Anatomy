import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

// Stages the folder of the release zip: the build, the server that runs it, and the run instructions.
// The release workflow zips the folder that this prints. Run `npm run build` first.
//
//   node scripts/package-release.ts [--dist dist] [--out release]
const { values } = parseArgs({ options: { dist: { type: 'string', default: 'dist' }, out: { type: 'string', default: 'release' } } })

const root = resolve(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
const dist = resolve(values.dist)

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`There is no build in ${dist}. Run: npm run build`)
  process.exit(1)
}

const folder = join(resolve(values.out), `anatomy-${version}`)
rmSync(folder, { recursive: true, force: true })
mkdirSync(folder, { recursive: true })
cpSync(dist, join(folder, 'dist'), { recursive: true })
cpSync(join(root, 'scripts/release/serve.mjs'), join(folder, 'serve.mjs'))
cpSync(join(root, 'scripts/release/README-run.txt'), join(folder, 'README-run.txt'))
console.log(folder)
