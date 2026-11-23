import fieldsText from '../../schema/board.v1.fields.txt?raw'
import { describe, expect, it } from 'vitest'
import { runAnatomy } from '../cli/anatomy'
import { memoryIo } from '../cli/corpus'
import { fieldSheet } from './cheatSheet'
import { boardJsonSchema } from './jsonSchema'
import { ITEM_KINDS, LIMITS, RELATIONSHIP_KINDS, RESPONSE_STATUSES, SOURCE_KINDS } from './schema'

// `anatomy schema` prints a short list of every field and its limits, made from the JSON Schema, so an agent does not
// need to read the whole schema. `npm run schema` writes it next to the schema, and the tool embeds that file.
const sheet = fieldSheet(boardJsonSchema())

type Node = { properties?: Record<string, Node>; items?: Node }

/** Every property name in the schema, at any depth. */
function names(node: Node, out = new Set<string>()): Set<string> {
  for (const [name, child] of Object.entries(node.properties ?? {})) {
    out.add(name)
    names(child, out)
  }
  if (node.items) names(node.items, out)
  return out
}

describe('the field sheet', () => {
  it('is the committed file, so `npm run schema` keeps it current', () => {
    expect(fieldsText).toBe(sheet)
  })

  it('names every field of the board', () => {
    for (const name of names(boardJsonSchema() as Node)) expect(sheet, name).toMatch(new RegExp(`\\b${name}\\b`))
  })

  it('lists every allowed value and the limits an agent meets most', () => {
    for (const value of [...SOURCE_KINDS, ...RELATIONSHIP_KINDS, ...ITEM_KINDS, ...RESPONSE_STATUSES]) expect(sheet, value).toContain(value)
    for (const limit of [LIMITS.label, LIMITS.summary, LIMITS.shortText, LIMITS.markdown, LIMITS.title, LIMITS.id, LIMITS.components]) expect(sheet).toContain(String(limit))
    expect(sheet).toContain('anatomy-board')
  })

  it('says that from and to name a component only', () => {
    expect(sheet).toContain('Every from and to names a component,')
    expect(sheet).not.toMatch(/\bfrom, to\b/)
  })

  it('marks required fields', () => {
    expect(sheet).toMatch(/\bid\*/)
    expect(sheet).toMatch(/\bsummary\*/)
    expect(sheet).not.toMatch(/\bexplanation\*/)
  })

  it('is short: at most 3,000 characters', () => {
    expect(sheet.length).toBeLessThanOrEqual(3000)
  })

  it('is what anatomy schema prints', () => {
    const io = { ...memoryIo(new Map()), schemaSheet: () => sheet }
    expect(runAnatomy(['schema'], io)).toEqual({ code: 0, stdout: sheet, stderr: '' })
    expect(runAnatomy(['schema', 'extra'], io).code).toBe(2)
  })
})
