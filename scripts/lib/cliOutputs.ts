// What the `anatomy` tool prints in typical and worst cases. `npm run tokens` shows the sizes, and
// src/app/tokenBudget.test.ts holds them to tokens.baseline.json, because an agent reads every line of it.
import { runAnatomy } from '../../src/cli/anatomy.ts'
import { CORPUS, memoryIo, runCase } from '../../src/cli/corpus.ts'
import type { TextKind } from './estimate.ts'

export interface CliOutput {
  name: string
  text: string
  kind: TextKind
}

function corpus(name: string, args: string[] = ['validate']): string {
  const found = CORPUS.find((c) => c.name === name)
  if (!found) throw new Error(`No corpus case named "${name}".`)
  const result = runCase(found, args)
  return result.stdout + result.stderr
}

/** `examples` maps a file name to the text of a bundled example board. */
/** The output of `apply` on the corpus base board, for a patch that works and a patch that does not. */
function applied(patch: unknown[], args: string[] = []): string {
  const found = CORPUS.find((c) => c.name === 'base board')
  if (!found) throw new Error('No base board in the corpus.')
  const files = new Map([['.anatomy/board.json', found.text]])
  return runAnatomy(['apply', '-', ...args], memoryIo(files, undefined, JSON.stringify(patch))).stdout
}

export function cliOutputs(examples: Record<string, string>): CliOutput[] {
  const [firstName, firstText] = Object.entries(examples).sort(([a], [b]) => a.localeCompare(b))[0] ?? []
  if (firstName === undefined || firstText === undefined) throw new Error('No example boards.')
  const valid = runAnatomy(['validate', firstName], memoryIo(new Map([[firstName, firstText]])))
  return [
    { name: 'anatomy help', text: runAnatomy(['help'], memoryIo(new Map())).stdout, kind: 'prose' },
    { name: 'anatomy validate, valid example', text: valid.stdout, kind: 'prose' },
    { name: 'anatomy validate, one broken reference', text: corpus('relationship to a misspelled component'), kind: 'prose' },
    { name: 'anatomy validate, four faults', text: corpus('several faults at once'), kind: 'prose' },
    { name: 'anatomy validate, five feedback warnings', text: corpus('feedback partly answered, revision not raised'), kind: 'prose' },
    { name: 'anatomy validate, over 25 errors', text: corpus('more problems than the report shows'), kind: 'prose' },
    { name: 'anatomy validate --json, over 25 errors', text: corpus('more problems than the report shows', ['validate', '--json']), kind: 'json' },
    {
      name: 'anatomy apply, three changes',
      text: applied([
        { op: 'replace', path: '/components/payment/summary', value: 'Charges the card and retries twice.' },
        { op: 'add', path: '/relationships', value: { id: 'api-to-queue', from: 'api', to: 'warehouse', kind: 'calls', label: 'jobs', source: { kind: 'agent-explanation' } } },
        { op: 'remove', path: '/relationships/api-to-database' },
      ]),
      kind: 'prose',
    },
    {
      name: 'anatomy apply, a removed part that is still used',
      text: applied([{ op: 'remove', path: '/components/payment' }]),
      kind: 'prose',
    },
  ]
}
