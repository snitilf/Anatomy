import type { Board, BoardComponent, BoardRelationship } from '../board/schema'
import type { Target } from './model'

/** JSON with sorted keys and no undefined values, so equal data gives equal text. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonical(v))).join(',')}]`
  const record = value as Record<string, unknown>
  const parts: string[] = []
  for (const key of Object.keys(record).sort()) {
    const v = record[key]
    if (v === undefined) continue
    parts.push(`${JSON.stringify(key)}:${canonical(v)}`)
  }
  return `{${parts.join(',')}}`
}

/** cyrb53: a 53-bit string hash. Not cryptographic; used only to notice changes. */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return value.toString(16).padStart(14, '0')
}

export function fingerprintComponent(c: BoardComponent): string {
  return cyrb53(
    canonical({
      label: c.label,
      summary: c.summary,
      explanation: c.explanation,
      group: c.group,
      inputs: c.inputs,
      outputs: c.outputs,
      source: c.source,
    }),
  )
}

export function fingerprintRelationship(r: BoardRelationship): string {
  return cyrb53(
    canonical({
      from: r.from,
      to: r.to,
      kind: r.kind,
      label: r.label,
      explanation: r.explanation,
      source: r.source,
    }),
  )
}

export function fingerprintBoard(b: Board): string {
  return cyrb53(canonical({ title: b.title, goal: b.goal, scope: b.scope }))
}

/** The current fingerprint of a target, or undefined when the target is not in the board. */
export function fingerprintTarget(board: Board, target: Target): string | undefined {
  switch (target.type) {
    case 'board':
      return fingerprintBoard(board)
    case 'component': {
      const c = board.components.find((x) => x.id === target.id)
      return c ? fingerprintComponent(c) : undefined
    }
    case 'relationship': {
      const r = board.relationships.find((x) => x.id === target.id)
      return r ? fingerprintRelationship(r) : undefined
    }
  }
}

/** The fingerprint of any JSON value, such as one of the user's items. */
export function fingerprintValue(value: unknown): string {
  return cyrb53(canonical(value))
}
