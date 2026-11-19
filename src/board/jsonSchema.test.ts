import { describe, expect, it } from 'vitest'
import committed from '../../schema/board.v1.schema.json?raw'
import { boardJsonSchemaText } from './jsonSchema'

describe('exported JSON Schema', () => {
  it('matches the Zod schema (run `npm run schema` after a schema change)', () => {
    expect(committed).toBe(boardJsonSchemaText())
  })
})

describe('exported JSON Schema with an independent validator', () => {
  it('accepts every example board and rejects a misspelled field', async () => {
    const { Ajv2020 } = await import('ajv/dist/2020.js')
    const anatomy = (await import('../examples/anatomy.board.json')).default
    const claudeCode = (await import('../examples/claude-code-harness.board.json')).default
    const llm = (await import('../examples/how-an-llm-works.board.json')).default
    const refund = (await import('../../e2e/fixtures/refund-approval.board.json')).default
    const validate = new Ajv2020({ strict: false }).compile(JSON.parse(committed))
    expect(validate(anatomy)).toBe(true)
    expect(validate(refund)).toBe(true)
    expect(validate(claudeCode)).toBe(true)
    expect(validate(llm)).toBe(true)
    expect(validate({ ...refund, titel: 'typo' })).toBe(false)
  })
})
