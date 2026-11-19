import { describe, expect, it } from 'vitest'
import baselineText from '../../tokens.baseline.json?raw'
import schemaText from '../../schema/board.v1.schema.json?raw'
import { estimateReadmeTokens } from '../../scripts/lib/estimate.ts'
import { agentReadme } from './agentReadme'

// The README is the first thing every agent session reads, so its size is a budget.
// To let it grow on purpose, edit tokens.baseline.json in the same change and say why.
// Run `npm run tokens` to see the numbers.

interface Baseline {
  readme: { characters: number; tokens: number }
  hardCap: { characters: number; tokens: number }
  allowedGrowth: number
}

const baseline = JSON.parse(baselineText) as Baseline
const readme = agentReadme()
const characters = readme.length
const tokens = estimateReadmeTokens(readme, schemaText)

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

  it('stays under the hard cap', () => {
    expect(characters).toBeLessThanOrEqual(baseline.hardCap.characters)
    expect(tokens).toBeLessThanOrEqual(baseline.hardCap.tokens)
  })

  it('has a baseline below the hard cap', () => {
    expect(baseline.readme.characters).toBeLessThanOrEqual(baseline.hardCap.characters)
    expect(baseline.readme.tokens).toBeLessThanOrEqual(baseline.hardCap.tokens)
  })
})
