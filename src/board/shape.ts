import type { z } from 'zod'
import { board } from './schema.ts'

// Reads the board's Zod schema as a tree of fields, so other code can follow the same field order and know which keys
// an object allows. The schema stays the one source of truth for both.

interface Def {
  type: string
  innerType?: z.ZodType
  in?: z.ZodType
  shape?: Record<string, z.ZodType>
  element?: z.ZodType
}

const defOf = (schema: z.ZodType) => (schema as unknown as { _zod: { def: Def } })._zod.def

/** Removes `optional`, `default`, and similar wrappers. */
function unwrap(schema: z.ZodType): z.ZodType {
  let current = schema
  for (;;) {
    const def = defOf(current)
    if (def.innerType && ['optional', 'default', 'prefault', 'nullable', 'readonly', 'catch'].includes(def.type)) current = def.innerType
    else if (def.type === 'pipe' && def.in) current = def.in
    else return current
  }
}

/** The keys of an object schema in the order they are declared. Empty for anything else. */
export function keysOf(schema: z.ZodType | undefined): string[] {
  if (!schema) return []
  const def = defOf(unwrap(schema))
  return def.type === 'object' && def.shape ? Object.keys(def.shape) : []
}

/** The schema of one key of an object, or of the entries of an array. */
export function childOf(schema: z.ZodType | undefined, key: PropertyKey): z.ZodType | undefined {
  if (!schema) return undefined
  const def = defOf(unwrap(schema))
  if (def.type === 'array') return typeof key === 'number' ? def.element : undefined
  if (def.type === 'object' && def.shape && typeof key === 'string') return Object.hasOwn(def.shape, key) ? def.shape[key] : undefined
  return undefined
}

/** The schema at a path inside a board, for example `['components', 2, 'source']`. */
export function schemaAt(path: readonly PropertyKey[]): z.ZodType | undefined {
  let current: z.ZodType | undefined = board
  for (const key of path) current = childOf(current, key)
  return current
}

/**
 * The same JSON value with object keys in schema order. Keys the schema does not know keep their order after the known
 * ones. Values, arrays, and missing fields stay as they are, so the meaning never changes.
 */
export function inSchemaOrder(value: unknown, schema: z.ZodType | undefined = board): unknown {
  if (Array.isArray(value)) return value.map((entry, i) => inSchemaOrder(entry, childOf(schema, i)))
  if (value === null || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const own = Object.keys(record)
  const known = keysOf(schema).filter((key) => Object.hasOwn(record, key))
  const rest = own.filter((key) => !known.includes(key))
  // Object.fromEntries defines own properties, so a "__proto__" key stays data and never changes a prototype.
  return Object.fromEntries([...known, ...rest].map((key) => [key, inSchemaOrder(record[key], childOf(schema, key))]))
}
