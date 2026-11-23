import { describe, expect, it } from 'vitest'
import baselineText from '../../tokens.baseline.json?raw'
import guideText from '../../docs/authoring-guide.md?raw'
import fieldsText from '../../schema/board.v1.fields.txt?raw'
import { cliOutputs } from '../../scripts/lib/cliOutputs.ts'
import { estimateTokens } from '../../scripts/lib/estimate.ts'
import { agentReadme } from './agentReadme'

// The README is the first thing every agent session reads, and an agent reads every line the anatomy tool prints,
// so their sizes are a budget.
// To let it grow on purpose, edit tokens.baseline.json in the same change and say why.
// Run `npm run tokens` to see the numbers.

interface Size {
  characters: number
  tokens: number
}

interface Baseline {
  readme: Size
  hardCap: Size
  allowedGrowth: number
  /** One entry per output in scripts/lib/cliOutputs.ts. */
  cli: Record<string, Size>
  cliHardCap: Size
}

const baseline = JSON.parse(baselineText) as Baseline
const readme = agentReadme()
const characters = readme.length
const tokens = estimateTokens(readme, 'prose')

describe('the agent README size', () => {
  it('stays within the allowed growth over the baseline', () => {
    const growth = 1 + baseline.allowedGrowth
    expect(characters, 'characters over baseline; edit tokens.baseline.json if the growth is intended').toBeLessThanOrEqual(
      Math.floor(baseline.readme.characters * growth),
    )
    expect(tokens, 'estimated tokens over baseline; edit tokens.baseline.json if the growth is intended').toBeLessThanOrEqual(
      Math.floor(baseline.readme.tokens * growth),
    )
  })

  it('is not far below the baseline, so the baseline ratchets down on purpose', () => {
    const floor = 1 - baseline.allowedGrowth
    expect(characters, 'README shrank; lower the baseline in tokens.baseline.json').toBeGreaterThanOrEqual(Math.ceil(baseline.readme.characters * floor))
    expect(tokens, 'README shrank; lower the baseline in tokens.baseline.json').toBeGreaterThanOrEqual(Math.ceil(baseline.readme.tokens * floor))
  })

  it('stays under the hard cap', () => {
    expect(characters).toBeLessThanOrEqual(baseline.hardCap.characters)
    expect(tokens).toBeLessThanOrEqual(baseline.hardCap.tokens)
  })

  it('has a baseline below the hard cap', () => {
    expect(baseline.readme.characters).toBeLessThanOrEqual(baseline.hardCap.characters)
    expect(baseline.readme.tokens).toBeLessThanOrEqual(baseline.hardCap.tokens)
  })
})

const examples = Object.fromEntries(
  Object.entries(import.meta.glob('../examples/*.board.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>).map(([path, text]) => [
    path.slice(path.lastIndexOf('/') + 1),
    text,
  ]),
)
const outputs = cliOutputs(examples, { guide: guideText, fields: fieldsText }).map((o) => ({ name: o.name, characters: o.text.length, tokens: estimateTokens(o.text, o.kind) }))

describe('the anatomy tool output size', () => {
  it('has a baseline for every measured output, and no stale ones', () => {
    expect(Object.keys(baseline.cli).sort()).toEqual(outputs.map((o) => o.name).sort())
  })

  it.each(outputs.map((o) => [o.name, o] as const))('keeps "%s" within 5 percent of its baseline and under the hard cap', (name, output) => {
    const base = baseline.cli[name]!
    expect(output.characters, 'output grew; edit tokens.baseline.json if the growth is intended').toBeLessThanOrEqual(Math.floor(base.characters * (1 + baseline.allowedGrowth)))
    expect(output.characters, 'output shrank; lower the baseline in tokens.baseline.json').toBeGreaterThanOrEqual(Math.ceil(base.characters * (1 - baseline.allowedGrowth)))
    expect(output.characters).toBeLessThanOrEqual(baseline.cliHardCap.characters)
    expect(output.tokens).toBeLessThanOrEqual(baseline.cliHardCap.tokens)
  })
})
