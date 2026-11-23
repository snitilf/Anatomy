// Prints the size of what an agent reads and writes: characters and estimated tokens.
// Run with: npm run tokens
import { readdirSync, readFileSync } from 'node:fs'
import { cliOutputs } from './lib/cliOutputs.ts'
import { splitGuide } from '../src/cli/topics.ts'
import { estimateTokens, guideSections, type TextKind } from './lib/estimate.ts'
import { withAppModules } from './lib/vite.ts'

interface Row {
  artifact: string
  characters: number
  tokens: number
}

const rootUrl = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, rootUrl), 'utf8')

function row(artifact: string, text: string, kind: TextKind): Row {
  return { artifact, characters: text.length, tokens: estimateTokens(text, kind) }
}

async function measure(): Promise<Row[]> {
  const schemaText = read('schema/board.v1.schema.json')
  const guide = read('docs/authoring-guide.md')
  const fields = read('schema/board.v1.fields.txt')
  const [{ agentReadme }] = (await withAppModules(['/src/app/agentReadme.ts'], (modules) => modules)) as [
    { agentReadme: () => string },
  ]
  const readme = agentReadme()

  const rows: Row[] = [
    { artifact: '.anatomy/README.md as generated', characters: readme.length, tokens: estimateTokens(readme, 'prose') },
    row('docs/authoring-guide.md, whole', guide, 'prose'),
    ...guideSections(guide).map((section) => row(`  ${section.title}`, section.text, 'prose')),
    ...splitGuide(guide).map((topic) => row(`.anatomy/guide/${topic.name}.md`, topic.text, 'prose')),
    row('JSON Schema, pretty printed', schemaText, 'json'),
    row('  minified', JSON.stringify(JSON.parse(schemaText)), 'json'),
  ]

  const exampleDir = new URL('src/examples/', rootUrl)
  const examples: Record<string, string> = {}
  for (const name of readdirSync(exampleDir).filter((file) => file.endsWith('.board.json')).sort()) {
    const text = readFileSync(new URL(name, exampleDir), 'utf8')
    examples[name] = text
    rows.push(row(`example board ${name}`, text, 'json'))
    rows.push(row(`  same, minified`, JSON.stringify(JSON.parse(text)), 'json'))
  }

  // The output of the anatomy tool. tokenBudget.test.ts guards these rows too.
  for (const output of cliOutputs(examples, { guide, fields })) rows.push(row(output.name, output.text, output.kind))
  return rows
}

function printTable(rows: Row[]): void {
  const width = Math.max(...rows.map((r) => r.artifact.length), 'Artifact'.length)
  const line = (a: string, b: string, c: string) => `${a.padEnd(width)}  ${b.padStart(10)}  ${c.padStart(10)}`
  console.log(line('Artifact', 'Characters', 'Est. tokens'))
  console.log(line('-'.repeat(width), '-'.repeat(10), '-'.repeat(10)))
  for (const r of rows) console.log(line(r.artifact, r.characters.toLocaleString('en-US'), r.tokens.toLocaleString('en-US')))
  console.log('\nEstimate: characters / 4 for prose, characters / 3 for JSON.\nThe anatomy rows count its text output as prose and its --json output as JSON.')
}

printTable(await measure())
