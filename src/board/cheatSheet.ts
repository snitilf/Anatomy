// A short list of every field of a board and its limits, made from the JSON Schema. `npm run schema` writes it as
// `schema/board.v1.fields.txt`, and `anatomy schema` prints it, so an agent does not have to read the whole schema.

interface Node {
  type?: string
  const?: unknown
  enum?: unknown[]
  pattern?: string
  maxLength?: number
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  items?: Node
  properties?: Record<string, Node>
  required?: string[]
}

const ID_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$'

/** "list max 20", "list 1 to 60", or "list". */
function list(node: Node): string {
  if (node.minItems !== undefined && node.maxItems !== undefined) return `list ${node.minItems} to ${node.maxItems}`
  if (node.maxItems !== undefined) return `list max ${node.maxItems}`
  return node.minItems !== undefined ? `list min ${node.minItems}` : 'list'
}

/** The value of a field on one line, or undefined when the field holds an object or a list of objects. */
function value(node: Node): string | undefined {
  if (node.const !== undefined) return JSON.stringify(node.const)
  if (node.enum) return node.enum.join(' | ')
  if (node.type === 'string') return node.pattern === ID_PATTERN ? 'id' : `text max ${node.maxLength}`
  if (node.type === 'integer') return node.minimum === undefined ? 'integer' : `integer min ${node.minimum}`
  if (node.type === 'number') return `number from ${node.minimum} to ${node.maximum}`
  if (node.type === 'array' && node.items && value(node.items) !== undefined) return `${list(node)} of ${value(node.items)}`
  return undefined
}

function fields(node: Node, depth: number, out: string[]): void {
  const pad = '  '.repeat(depth)
  for (const [name, child] of Object.entries(node.properties ?? {})) {
    const key = `${pad}${name}${node.required?.includes(name) ? '*' : ''}`
    const line = value(child)
    if (line !== undefined) {
      out.push(`${key}: ${line}`)
    } else if (child.type === 'array' && child.items) {
      out.push(`${key}: ${list(child)} of`)
      fields(child.items, depth + 1, out)
    } else {
      out.push(`${key}:`)
      fields(child, depth + 1, out)
    }
  }
}

/** The field list for a JSON Schema of the board. */
export function fieldSheet(schema: object): string {
  const out = [
    'The fields of a board. * marks a required field.',
    'Text is never empty, and its limit is in characters. An id uses lowercase letters, digits, and single hyphens, at most 64.',
    '',
  ]
  fields(schema as Node, 0, out)
  out.push(
    '',
    'Anatomy also checks what the schema cannot:',
    '- Every id is unique across the whole board.',
    '- Every from, to, about, and highlight names a component or relationship that exists, and every group names a group.',
    '- A documented-intent source has at least one reference.',
    'Run validate to check all of it.',
  )
  return `${out.join('\n')}\n`
}
