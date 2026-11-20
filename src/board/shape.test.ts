import { describe, expect, it } from 'vitest'
import anatomyText from '../examples/anatomy.board.json?raw'
import llmText from '../examples/how-an-llm-works.board.json?raw'
import { inSchemaOrder, keysOf, schemaAt } from './shape'

describe('schemaAt and keysOf', () => {
  it('follow the schema through lists, defaults, and refinements', () => {
    expect(keysOf(schemaAt([]))).toEqual(expect.arrayContaining(['format', 'schemaVersion', 'id', 'components', 'responses']))
    expect(keysOf(schemaAt(['components', 3]))).toEqual(['id', 'label', 'summary', 'explanation', 'group', 'inputs', 'outputs', 'source', 'position', 'lesson'])
    expect(keysOf(schemaAt(['components', 0, 'source']))).toEqual(['kind', 'references'])
    expect(keysOf(schemaAt(['scenarios', 0, 'steps', 1]))).toEqual(['caption', 'highlight'])
    expect(keysOf(schemaAt(['responses', 'items', 0]))).toEqual(['feedbackId', 'status', 'text', 'changed'])
  })

  it('give nothing for a path the schema does not have', () => {
    expect(schemaAt(['nothing', 0])).toBeUndefined()
    expect(keysOf(schemaAt(['title']))).toEqual([])
  })
})

describe('inSchemaOrder', () => {
  it('orders keys as the schema declares them and keeps unknown keys last', () => {
    const ordered = inSchemaOrder({ title: 't', extra: 1, format: 'anatomy-board', components: [{ summary: 's', id: 'a' }] })
    expect(JSON.stringify(ordered)).toBe('{"format":"anatomy-board","title":"t","components":[{"id":"a","summary":"s"}],"extra":1}')
  })

  it('keeps every value and adds no defaults', () => {
    for (const text of [anatomyText, llmText]) {
      const data = JSON.parse(text) as unknown
      const ordered = inSchemaOrder(data)
      expect(ordered).toEqual(data)
      expect(inSchemaOrder(ordered)).toEqual(ordered)
    }
  })

  it('keeps a __proto__ key as data', () => {
    const data = JSON.parse('{"id":"x","__proto__":{"polluted":true}}') as unknown
    const ordered = inSchemaOrder(data) as Record<string, unknown>
    expect(Object.getPrototypeOf(ordered)).toBe(Object.prototype)
    expect(JSON.stringify(ordered)).toBe('{"id":"x","__proto__":{"polluted":true}}')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
