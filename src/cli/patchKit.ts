// Test helpers for `anatomy apply`: a generator that turns the difference between two boards into a patch, and a seeded
// generator that makes a changed copy of a board. The tests use both to check that `apply` reaches the second board.

type Json = Record<string, any>
export type PatchOp = Record<string, unknown>

const LISTS = ['groups', 'components', 'relationships', 'items', 'scenarios'] as const
/** Remove in this order, so a part goes after what refers to it. */
const REMOVE_ORDER = ['relationships', 'items', 'scenarios', 'components', 'groups'] as const

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const ids = (list: Json[] | undefined) => (list ?? []).map((entry) => entry.id as string)

/** The operations that turn board `a` into board `b`, apart from `revision` and `responses`. */
export function diffOps(a: Json, b: Json): PatchOp[] {
  const ops: PatchOp[] = []
  for (const key of ['title', 'goal', 'scope']) if (!same(a[key], b[key])) ops.push({ op: 'replace', path: `/${key}`, value: b[key] })

  const reordered = new Set<string>()
  for (const list of LISTS) {
    const inB = new Set(ids(b[list]))
    const inA = new Set(ids(a[list]))
    const orderA = ids(a[list]).filter((id) => inB.has(id))
    const orderB = ids(b[list]).filter((id) => inA.has(id))
    // The same parts in another order: say the whole list, which is what the agent would do.
    if (!same(orderA, orderB)) {
      reordered.add(list)
      ops.push({ op: 'replace', path: `/${list}`, value: b[list] })
    }
  }
  for (const list of REMOVE_ORDER) {
    if (reordered.has(list)) continue
    const keep = new Set(ids(b[list]))
    for (const id of ids(a[list])) if (!keep.has(id)) ops.push({ op: 'remove', path: `/${list}/${id}` })
  }
  for (const list of LISTS) {
    if (reordered.has(list)) continue
    const before = new Map(((a[list] ?? []) as Json[]).map((entry) => [entry.id as string, entry]))
    for (const entry of (b[list] ?? []) as Json[]) {
      const old = before.get(entry.id)
      if (old === undefined || same(old, entry)) continue
      for (const field of Object.keys(entry)) if (!same(old[field], entry[field])) ops.push({ op: Object.hasOwn(old, field) ? 'replace' : 'add', path: `/${list}/${entry.id}/${field}`, value: entry[field] })
      for (const field of Object.keys(old)) if (!Object.hasOwn(entry, field)) ops.push({ op: 'remove', path: `/${list}/${entry.id}/${field}` })
    }
    // Adding from the end means the part that comes next is already on the board when `before` names it.
    const listB = (b[list] ?? []) as Json[]
    for (let i = listB.length - 1; i >= 0; i--) {
      const entry = listB[i]!
      if (before.has(entry.id)) continue
      const next = listB[i + 1]
      ops.push({ op: 'add', path: `/${list}`, value: entry, ...(next === undefined ? {} : { before: next.id }) })
    }
  }
  return ops
}

/** A deterministic generator: the same seed always gives the same numbers. */
export function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A changed copy of a valid board, still valid: edited text, a new part with a connection, a removed part with what
 * referred to it, a retargeted connection, two parts swapped, a new question, a changed walkthrough.
 */
export function changedCopy(board: Json, seed: number, changes = 3): Json {
  const next = seeded(seed)
  const pick = <T>(list: T[]): T | undefined => list[Math.floor(next() * list.length)]
  const copy: Json = structuredClone(board)
  const taken = () => new Set<string>([copy.id, ...LISTS.flatMap((l) => ids(copy[l]))])
  const list = (name: string): Json[] => (copy[name] ??= [])
  const fresh = (stem: string) => {
    for (let n = 1; ; n++) if (!taken().has(`${stem}-${n}`)) return `${stem}-${n}`
  }
  for (let i = 0; i < changes; i++) {
    const kind = Math.floor(next() * 8)
    const component = pick<Json>(copy.components)
    if (kind === 0 && component) component.summary = `${String(component.summary).slice(0, 200)} (changed ${i})`
    else if (kind === 1 && component && copy.components.length < 55 && (copy.relationships?.length ?? 0) < 195) {
      const id = fresh('added')
      list('components').splice(Math.floor(next() * (copy.components.length + 1)), 0, { id, label: `Added ${id}`, summary: 'A part added in a later revision.', source: { kind: 'agent-proposal', references: [] }, inputs: [], outputs: [] })
      list('relationships').push({ id: fresh('link'), from: component.id, to: id, kind: 'calls', label: 'new call', source: { kind: 'agent-proposal', references: [] } })
    } else if (kind === 2 && component && copy.components.length > 3) {
      const gone = new Set<string>([component.id])
      copy.components = copy.components.filter((c: Json) => c.id !== component.id)
      for (const r of (copy.relationships ?? []) as Json[]) if (r.from === component.id || r.to === component.id) gone.add(r.id)
      copy.relationships = (copy.relationships ?? []).filter((r: Json) => !gone.has(r.id))
      if (copy.items) copy.items = copy.items.filter((item: Json) => item.about === undefined || !gone.has(item.about))
      for (const s of (copy.scenarios ?? []) as Json[]) for (const step of s.steps) step.highlight = step.highlight.filter((h: string) => !gone.has(h))
    } else if (kind === 3) {
      const relationship = pick<Json>(copy.relationships ?? [])
      const target = pick<Json>(copy.components)
      if (relationship && target) relationship.to = target.id
    } else if (kind === 4 && copy.components.length > 1) {
      const a = Math.floor(next() * copy.components.length)
      const b = (a + 1) % copy.components.length
      ;[copy.components[a], copy.components[b]] = [copy.components[b], copy.components[a]]
    } else if (kind === 5 && (copy.items?.length ?? 0) < 99) {
      list('items').push({ id: fresh('open-question'), kind: 'question', text: 'What happens when this fails?', ...(component && next() < 0.5 ? { about: component.id } : {}) })
    } else if (kind === 6) {
      const scenario = pick<Json>(copy.scenarios ?? [])
      const step = scenario ? pick<Json>(scenario.steps) : undefined
      if (step) step.caption = `${String(step.caption).slice(0, 500)} (changed ${i})`
    } else if (kind === 7) copy.goal = `${String(copy.goal).slice(0, 500)} (changed ${i})`
  }
  return copy
}
