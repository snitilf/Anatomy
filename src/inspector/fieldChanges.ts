import { KIND_WORDS, SOURCE_LABEL } from '../app/labels'
import type { Board, Source } from '../board/schema'

/** One field that differs between two revisions, in words: how it read before, and how it reads now. */
export interface FieldChange {
  field: string
  before: string
  after: string
}

type Target = { type: 'board' } | { type: 'component' | 'relationship'; id: string }

const list = (items: readonly string[]) => items.join('; ')

function sourceWords(source: Source): string {
  const cited = source.references.map((r) => r.label)
  return cited.length === 0 ? SOURCE_LABEL[source.kind] : `${SOURCE_LABEL[source.kind]}: ${list(cited)}`
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The fields whose values differ, named as the review names them, in the order a part or connection is read. */
export function fieldChanges(previous: Board, current: Board, target: Target): FieldChange[] {
  const out: FieldChange[] = []
  const add = <T,>(field: string, a: T, b: T, words: (value: T, board: Board) => string) => {
    if (same(a, b)) return
    const before = words(a, previous)
    const after = words(b, current)
    if (before !== after) out.push({ field, before, after })
  }
  const text = (value: string | undefined) => value ?? ''
  const part = (id: string | undefined, board: Board) => board.components.find((c) => c.id === id)?.label ?? id ?? ''
  const group = (id: string | undefined, board: Board) => board.groups.find((g) => g.id === id)?.label ?? id ?? ''

  if (target.type === 'board') {
    add('title', previous.title, current.title, text)
    add('goal', previous.goal, current.goal, text)
    add('scope', previous.scope, current.scope, (s) => `Includes: ${list(s.includes)}\nExcludes: ${list(s.excludes)}`)
    return out
  }
  if (target.type === 'component') {
    const a = previous.components.find((c) => c.id === target.id)
    const b = current.components.find((c) => c.id === target.id)
    if (!a || !b) return out
    add('name', a.label, b.label, text)
    add('summary', a.summary, b.summary, text)
    add('explanation', a.explanation, b.explanation, text)
    add('group', a.group, b.group, group)
    add('inputs', a.inputs, b.inputs, list)
    add('outputs', a.outputs, b.outputs, list)
    add('source', a.source, b.source, sourceWords)
    return out
  }
  const a = previous.relationships.find((r) => r.id === target.id)
  const b = current.relationships.find((r) => r.id === target.id)
  if (!a || !b) return out
  add('start', a.from, b.from, part)
  add('end', a.to, b.to, part)
  add('kind', a.kind, b.kind, (kind) => KIND_WORDS[kind])
  add('label', a.label, b.label, text)
  add('explanation', a.explanation, b.explanation, text)
  add('source', a.source, b.source, sourceWords)
  return out
}
