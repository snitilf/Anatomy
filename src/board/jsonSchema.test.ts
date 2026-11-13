import { describe, expect, it } from 'vitest'
import committed from '../../schema/board.v1.schema.json?raw'
import { boardJsonSchemaText } from './jsonSchema'

describe('exported JSON Schema', () => {
  it('matches the Zod schema (run `npm run schema` after a schema change)', () => {
    expect(committed).toBe(boardJsonSchemaText())
  })
})

describe('exported JSON Schema with an independent validator', () => {
  it('accepts both example boards and rejects a misspelled field', async () => {
    const { Ajv2020 } = await import('ajv/dist/2020.js')
    const anatomy = (await import('../examples/anatomy.board.json')).default
    const nordet = (await import('../examples/nordet.board.json')).default
    const validate = new Ajv2020({ strict: false }).compile(JSON.parse(committed))
    expect(validate(anatomy)).toBe(true)
    expect(validate(nordet)).toBe(true)
    expect(validate({ ...nordet, titel: 'typo' })).toBe(false)
  })
})
