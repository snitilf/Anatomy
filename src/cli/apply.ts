import type { FeedbackSummary } from '../board/advice.ts'
import { LIMITS, RESPONSE_STATUSES } from '../board/schema.ts'
import { inSchemaOrder, keysOf, schemaAt } from '../board/shape.ts'
import { freeId, nearest } from '../board/suggest.ts'
import { parseBoard, type BoardProblem } from '../board/validate.ts'
import { idsOn, makeId } from './ids.ts'
import { LESSON_IDS } from '../lessons/ids.ts'

// `anatomy apply`: a short list of edits that addresses list items by ID, applied to a copy of the board, checked
// with the app's own `parseBoard`, and handed back as the text to write. Nothing here touches a file.
// The patch and the board are data. Nothing in either is ever run, and no key of either is used as a property name
// before it is checked.

export const PATCH_LIMITS = {
  /** Operations in one patch. A board has at most 60 parts and 200 connections, so a rewrite of one is far below this. */
  ops: 500,
  /** The patch file, like the board file. */
  bytes: LIMITS.fileBytes,
  /** Nesting of the patch and of the board. A valid board is 7 deep. */
  depth: 16,
  nodes: 1_000_000,
  /** One path segment. An ID has at most 64 characters. */
  segment: 200,
} as const

/** The lists whose items have an `id`, so a path can name an item by it. Every other list is addressed as a whole. */
const LISTS = ['groups', 'components', 'relationships', 'items', 'scenarios'] as const
type ListName = (typeof LISTS)[number]

const isList = (name: string): name is ListName => (LISTS as readonly string[]).includes(name)

/** A segment that could reach a prototype. A board has no use for one, so a path may never contain it. */
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

/** What a patch cannot edit: the header of the board, and the answers, which `respond` builds. */
const RESERVED: Record<string, string> = {
  format: '"format" is fixed.',
  schemaVersion: '"schemaVersion" is fixed.',
  id: 'The ID of the board stays, because the notes of the user stay attached to it.',
  revision: 'apply raises the revision by one itself.',
  responses: 'The answers are built from respond operations.',
}

export type OpCode =
  // The patch
  | 'patch-not-json'
  | 'patch-not-array'
  | 'too-big'
  | 'too-many-ops'
  | 'too-deep'
  | 'empty-patch'
  // One operation
  | 'bad-op'
  | 'unknown-key'
  | 'missing-field'
  | 'wrong-type'
  // Paths
  | 'bad-path'
  | 'forbidden-segment'
  | 'not-found'
  | 'not-addressable'
  | 'ambiguous-id'
  | 'reserved-path'
  | 'id-immutable'
  | 'id-mismatch'
  | 'bad-target'
  | 'duplicate-id'
  | 'missing-id'
  | 'unknown-sibling'
  // Guards
  | 'test-failed'
  | 'stale-revision'
  | 'dangling-reference'
  | 'no-change'
  // Feedback
  | 'no-feedback'
  | 'feedback-other-board'
  | 'unknown-feedback-item'
  | 'withdrawn-item'
  | 'duplicate-respond'
  | 'for-unanswered'
  // The board file
  | 'board-not-json'
  | 'board-not-object'
  | 'board-too-deep'
  | 'no-revision'

export interface OpProblem {
  /** The index of the operation in the patch. Undefined for a problem with the patch or the board as a whole. */
  op: number | undefined
  path: string
  code: OpCode
  message: string
  hint?: string
}

export interface ApplyInput {
  boardText: string
  patchText: string
  /** The `feedback.json` next to the board. `'unreadable'` when it exists but is not a feedback file. */
  feedback: FeedbackSummary | 'unreadable' | undefined
  /** The revision the agent read. A board at another revision stops the patch. */
  base: number | undefined
  /** Drop what refers to a removed part instead of reporting it. */
  cascade: boolean
}

export type ApplyResult =
  | {
      ok: true
      /** The new board file, formatted the way `fmt` does. */
      text: string
      from: number
      to: number
      /** One line per change, by ID: `~ components/payment.summary`, `+ relationships/api-to-queue`, `- components/old`. */
      diff: string[]
      /** Warnings of `parseBoard` for the new board. */
      warnings: BoardProblem[]
      board: import('../board/schema.ts').Board
      /** The IDs given to added items that had none, with the index of the operation. */
      assigned: { op: number; id: string }[]
    }
  | {
      ok: false
      opErrors: OpProblem[]
      omittedOpErrors: number
      errors: BoardProblem[]
      omittedErrors: number
    }

type Obj = Record<string, unknown>

const isObj = (value: unknown): value is Obj => value !== null && typeof value === 'object' && !Array.isArray(value)
const idOf = (value: unknown): string | undefined => (isObj(value) && typeof value.id === 'string' ? value.id : undefined)

/** Sets an own property, so a key such as "__proto__" stays data and never reaches a prototype. */
function setOwn(target: Obj, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  if (isObj(a) && isObj(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
  }
  return false
}

/** `deep` when the value nests more than the limit, `large` when it has too many parts. Walks without recursion. */
function oversize(value: unknown): 'deep' | 'large' | undefined {
  const stack: [unknown, number][] = [[value, 1]]
  let nodes = 0
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const [current, depth] = next
    if (++nodes > PATCH_LIMITS.nodes) return 'large'
    if (depth > PATCH_LIMITS.depth) return 'deep'
    if (current !== null && typeof current === 'object') for (const child of Array.isArray(current) ? current : Object.values(current)) stack.push([child, depth + 1])
  }
  return undefined
}

/** A problem that stops one operation. */
class OpFailure extends Error {
  code: OpCode
  hint: string | undefined
  constructor(code: OpCode, message: string, hint?: string) {
    super(message)
    this.code = code
    this.hint = hint
  }
}

const fail = (code: OpCode, message: string, hint?: string): never => {
  throw new OpFailure(code, message, hint)
}

const show = (value: string) => JSON.stringify(value)

interface Op {
  op: 'test' | 'add' | 'remove' | 'replace' | 'respond'
  path: string
  segments: string[]
  has: { value: boolean }
  value: unknown
  for: string | undefined
  before: string | undefined
  status: string | undefined
  text: string | undefined
}

const OP_KEYS: Record<string, readonly string[]> = {
  test: ['op', 'path', 'value'],
  add: ['op', 'path', 'value', 'for', 'before'],
  remove: ['op', 'path', 'for'],
  replace: ['op', 'path', 'value', 'for'],
  respond: ['op', 'for', 'status', 'text'],
}

function text(op: Obj, key: string, required: boolean): string | undefined {
  if (!Object.hasOwn(op, key)) return required ? fail('missing-field', `The "${key}" field is missing.`) : undefined
  const value = op[key]
  if (typeof value !== 'string' || value === '') return fail('wrong-type', `"${key}" must be a non-empty string.`)
  return value
}

/** Splits a path like `/components/payment/summary`. Segments use the JSON Pointer escapes `~1` for "/" and `~0` for "~". */
function segmentsOf(path: string): string[] {
  if (!path.startsWith('/')) return fail('bad-path', `The path ${show(path)} must start with "/".`, 'For example "/components/payment/summary".')
  if (path.length > 10 * PATCH_LIMITS.segment) return fail('bad-path', 'The path is too long.')
  const segments = path
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  for (const s of segments) {
    if (s === '') return fail('bad-path', `The path ${show(path)} has an empty part.`)
    if (s.length > PATCH_LIMITS.segment) return fail('bad-path', 'A part of the path is too long.')
    if (FORBIDDEN.has(s)) return fail('forbidden-segment', `The path ${show(path)} has the part ${show(s)}, which no path may use.`)
  }
  return segments
}

function readOp(raw: unknown): Op {
  if (!isObj(raw)) return fail('bad-op', 'An operation must be an object, for example {"op": "replace", "path": "/title", "value": "..."}.')
  const name = raw.op
  if (typeof name !== 'string') return fail('missing-field', 'The "op" field is missing.', 'Use test, add, remove, replace, or respond.')
  if (!Object.hasOwn(OP_KEYS, name)) {
    const near = nearest(name, Object.keys(OP_KEYS))
    return fail('bad-op', `Unknown operation ${show(name.slice(0, 40))}.`, near === undefined ? 'Use test, add, remove, replace, or respond.' : `Did you mean "${near}"?`)
  }
  const allowed = OP_KEYS[name]!
  const extra = Object.keys(raw).filter((k) => !allowed.includes(k))
  if (extra.length > 0) {
    const near = nearest(extra[0]!, allowed)
    return fail('unknown-key', `A ${name} operation has no ${extra.map((k) => show(k.slice(0, 40))).join(', ')} field.`, near === undefined ? `It takes ${allowed.join(', ')}.` : `Did you mean "${near}"?`)
  }
  const kind = name as Op['op']
  const op: Op = { op: kind, path: '', segments: [], has: { value: Object.hasOwn(raw, 'value') }, value: raw.value, for: undefined, before: undefined, status: undefined, text: undefined }
  if (kind !== 'respond') {
    op.path = text(raw, 'path', true) ?? ''
    op.segments = segmentsOf(op.path)
    if ((kind === 'test' || kind === 'add' || kind === 'replace') && !op.has.value) fail('missing-field', 'The "value" field is missing.')
  }
  if (kind !== 'test') op.for = text(raw, 'for', kind === 'respond')
  if (kind === 'add') op.before = text(raw, 'before', false)
  if (kind === 'respond') {
    op.status = text(raw, 'status', true)
    if (!(RESPONSE_STATUSES as readonly string[]).includes(op.status ?? '')) fail('wrong-type', `"status" must be one of ${RESPONSE_STATUSES.join(', ')}.`)
    op.text = text(raw, 'text', true)
  }
  return op
}

const pathOf = (segments: readonly string[], count = segments.length) => `/${segments.slice(0, count).join('/')}`

type Located =
  | { kind: 'item'; listName: ListName; list: unknown[]; index: number; id: string }
  | { kind: 'key'; parent: Obj; key: string; exists: boolean; idList: boolean }

const SINGULAR: Record<ListName, string> = { groups: 'group', components: 'component', relationships: 'relationship', items: 'item', scenarios: 'scenario' }

/** Follows a path from the board. A list item is found by its ID, and a list without IDs is never entered. */
function locate(doc: Obj, segments: readonly string[]): Located {
  let current: unknown = doc
  const trail: PropertyKey[] = []
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!
    const last = i === segments.length - 1
    if (Array.isArray(current)) {
      const first = segments[0]!
      if (i !== 1 || !isList(first)) {
        return fail('not-addressable', `${show(segments[i - 1]!)} is a list without IDs, so ${pathOf(segments, i + 1)} points at a position.`, `Replace the whole list at ${pathOf(segments, i)}.`)
      }
      const matches: number[] = []
      current.forEach((entry, index) => {
        if (idOf(entry) === segment) matches.push(index)
      })
      if (matches.length > 1) return fail('ambiguous-id', `${show(segment)} is the ID of ${matches.length} items in ${first}.`, 'Run validate and make the IDs unique first.')
      const index = matches[0] ?? -1
      if (last) return { kind: 'item', listName: first, list: current, index, id: segment }
      if (index < 0) return notFoundItem(first, current, segment)
      current = current[index]
      trail.push(index)
      continue
    }
    if (isObj(current)) {
      const has = Object.hasOwn(current, segment)
      if (last) return { kind: 'key', parent: current, key: segment, exists: has, idList: i === 0 && isList(segment) && (!has || Array.isArray(current[segment])) }
      if (!has) return notFoundKey(current, segment, trail, pathOf(segments, i))
      current = current[segment]
      trail.push(segment)
      continue
    }
    return fail('bad-path', `${pathOf(segments, i)} holds a value, so there is nothing at ${pathOf(segments, i + 1)}.`)
  }
  return fail('bad-path', 'The path is empty.')
}

function notFoundItem(listName: ListName, list: unknown[], id: string): never {
  const ids = list.flatMap((entry) => idOf(entry) ?? [])
  const near = nearest(id, ids)
  const hint = near !== undefined ? `Did you mean "${near}"?` : /^\d+$/.test(id) ? 'Items are addressed by ID, not by position.' : undefined
  return fail('not-found', `There is no ${SINGULAR[listName]} with the ID ${show(id.slice(0, 80))} in ${listName}.`, hint)
}

function notFoundKey(parent: Obj, key: string, trail: readonly PropertyKey[], where: string): never {
  const known = [...new Set([...Object.keys(parent), ...keysOf(schemaAt(trail))])]
  const near = nearest(key, known)
  return fail('not-found', `${where} has no ${show(key.slice(0, 80))}.`, near === undefined ? undefined : `Did you mean "${near}"?`)
}

/** Every ID on the board, with the board's own. */
/** The field that names an item of each list, and so gives it an ID when the patch has none. */
const NAME_FIELD: Record<ListName, string> = { groups: 'label', components: 'label', relationships: 'label', items: 'text', scenarios: 'title' }

/** The text an added item's ID is made from: its ends for a connection, else its label, title, or text. Undefined when it has none. */
function nameFor(list: ListName, value: Obj): string | undefined {
  if (list === 'relationships' && typeof value.from === 'string' && typeof value.to === 'string') return `${value.from}-to-${value.to}`
  const name = value[NAME_FIELD[list]]
  return typeof name === 'string' && name.trim() !== '' ? name : undefined
}

/** What `--cascade` took out along with a removed part: a path, as in the diff, and the part it was removed with. */
type Cascaded = Map<string, string>

function dropReferences(doc: Obj, list: ListName, id: string, notes: Cascaded): void {
  const because = `${list}/${id}`
  const removeWhere = (name: ListName, test: (entry: Obj) => boolean): string[] => {
    const entries = doc[name]
    if (!Array.isArray(entries)) return []
    const gone: string[] = []
    doc[name] = entries.filter((entry) => {
      if (!isObj(entry) || !test(entry)) return true
      gone.push(typeof entry.id === 'string' ? entry.id : '')
      return false
    })
    return gone
  }
  if (list === 'groups') {
    if (Array.isArray(doc.components)) {
      for (const component of doc.components) {
        if (isObj(component) && component.group === id) {
          delete component.group
          notes.set(`components/${idOf(component) ?? ''}.group`, because)
        }
      }
    }
    return
  }
  if (list !== 'components' && list !== 'relationships') return
  if (list === 'components') {
    for (const gone of removeWhere('relationships', (r) => r.from === id || r.to === id)) {
      notes.set(`relationships/${gone}`, because)
      dropReferences(doc, 'relationships', gone, notes)
    }
  }
  for (const gone of removeWhere('items', (item) => item.about === id)) notes.set(`items/${gone}`, because)
  if (Array.isArray(doc.scenarios)) {
    for (const scenario of doc.scenarios) {
      if (!isObj(scenario) || !Array.isArray(scenario.steps)) continue
      let touched = false
      for (const step of scenario.steps) {
        if (isObj(step) && Array.isArray(step.highlight) && step.highlight.includes(id)) {
          step.highlight = step.highlight.filter((target) => target !== id)
          touched = true
        }
      }
      if (touched) notes.set(`scenarios/${idOf(scenario) ?? ''}.steps`, because)
    }
  }
  const responses = doc.responses
  if (isObj(responses) && Array.isArray(responses.items)) {
    for (const answer of responses.items) if (isObj(answer) && Array.isArray(answer.changed)) answer.changed = answer.changed.filter((changed) => changed !== id)
  }
}

/** What still points at an ID that a patch removed, as `relationships/api-to-payment (to)`. */
function referencesTo(doc: Obj, id: string): string[] {
  const found: string[] = []
  const each = (name: ListName, visit: (entry: Obj, entryId: string) => void) => {
    const list = doc[name]
    if (Array.isArray(list)) for (const entry of list) if (isObj(entry)) visit(entry, idOf(entry) ?? '')
  }
  each('components', (c, cid) => c.group === id && found.push(`components/${cid} (group)`))
  each('relationships', (r, rid) => {
    if (r.from === id) found.push(`relationships/${rid} (from)`)
    if (r.to === id) found.push(`relationships/${rid} (to)`)
  })
  each('items', (item, iid) => item.about === id && found.push(`items/${iid} (about)`))
  each('scenarios', (scenario, sid) => {
    if (Array.isArray(scenario.steps) && scenario.steps.some((step) => isObj(step) && Array.isArray(step.highlight) && step.highlight.includes(id))) found.push(`scenarios/${sid} (highlight)`)
  })
  return found
}

const SECTIONS = ['title', 'goal', 'scope', ...LISTS, 'responses']

/** One line per changed ID: `+` added, `-` removed, `~` changed, with the field for a changed item. */
export function diffBoards(before: Obj, after: Obj): string[] {
  const lines: string[] = []
  const keys = [...SECTIONS, ...[...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !SECTIONS.includes(k) && k !== 'revision').sort()]
  for (const key of keys) {
    const a = Object.hasOwn(before, key) ? before[key] : undefined
    const b = Object.hasOwn(after, key) ? after[key] : undefined
    if (deepEqual(a, b)) continue
    if (isList(key) || key === 'responses') {
      const field = key === 'responses' ? 'feedbackId' : 'id'
      const entries = (value: unknown): Obj[] => {
        const list = key === 'responses' ? (isObj(value) ? value.items : undefined) : value
        return Array.isArray(list) ? list.filter(isObj) : []
      }
      const was = entries(a)
      const now = entries(b)
      const name = (entry: Obj) => (typeof entry[field] === 'string' ? entry[field] : '')
      const old = new Map(was.map((entry) => [name(entry), entry]))
      const kept = new Set(now.map(name))
      if (key === 'responses' && isObj(a) !== isObj(b)) lines.push('~ responses.respondsTo')
      else if (key === 'responses' && isObj(a) && isObj(b) && a.respondsTo !== b.respondsTo) lines.push('~ responses.respondsTo')
      for (const entry of now) {
        const previous = old.get(name(entry))
        if (previous === undefined) lines.push(`+ ${key}/${name(entry)}`)
        else if (!deepEqual(previous, entry)) {
          const fields = [...new Set([...Object.keys(previous), ...Object.keys(entry)])].filter((f) => !deepEqual(Object.hasOwn(previous, f) ? previous[f] : undefined, Object.hasOwn(entry, f) ? entry[f] : undefined))
          for (const f of fields) lines.push(`~ ${key}/${name(entry)}.${f}`)
        }
      }
      for (const entry of was) if (!kept.has(name(entry))) lines.push(`- ${key}/${name(entry)}`)
      const order = (list: Obj[], keep: Set<string>) => list.map(name).filter((n) => keep.has(n))
      if (!deepEqual(order(was, kept), order(now, new Set(old.keys())))) lines.push(`~ ${key} (order)`)
    } else lines.push(`~ ${key}`)
  }
  return lines
}

/** The IDs of components and relationships that an edit with `for` touched, by the feedback item. */
type Touches = Map<string, { first: number; ids: string[] }>

function revisionOf(doc: Obj): number | undefined {
  const revision = doc.revision
  return typeof revision === 'number' && Number.isInteger(revision) && revision >= 1 ? revision : undefined
}

export function applyPatch(input: ApplyInput): ApplyResult {
  const stop = (...problems: OpProblem[]): ApplyResult => ({ ok: false, opErrors: problems, omittedOpErrors: 0, errors: [], omittedErrors: 0 })
  const problem = (code: OpCode, message: string, hint?: string, path = ''): OpProblem => ({ op: undefined, path, code, message, ...(hint === undefined ? {} : { hint }) })

  // The patch
  const patchText = input.patchText.replace(/^﻿/, '')
  if (new TextEncoder().encode(patchText).length > PATCH_LIMITS.bytes) return stop(problem('too-big', `The patch is larger than ${PATCH_LIMITS.bytes.toLocaleString('en-US')} bytes.`, 'Split it, or rewrite the board and run validate.'))
  let rawOps: unknown
  try {
    rawOps = JSON.parse(patchText)
  } catch (error) {
    return stop(problem('patch-not-json', `The patch is not valid JSON: ${error instanceof Error ? error.message : String(error)}`))
  }
  if (!Array.isArray(rawOps)) return stop(problem('patch-not-array', 'A patch is a JSON array of operations.', 'For example [{"op": "replace", "path": "/title", "value": "..."}].'))
  if (rawOps.length === 0) return stop(problem('empty-patch', 'The patch has no operations.'))
  if (rawOps.length > PATCH_LIMITS.ops) return stop(problem('too-many-ops', `The patch has ${rawOps.length} operations. The limit is ${PATCH_LIMITS.ops}.`, 'Rewrite the board and run validate.'))
  const size = oversize(rawOps)
  if (size !== undefined) return stop(problem(size === 'deep' ? 'too-deep' : 'too-big', `The patch is nested too ${size === 'deep' ? 'deeply' : 'widely'}.`))

  // The board
  let original: unknown
  try {
    original = JSON.parse(input.boardText.replace(/^﻿/, ''))
  } catch (error) {
    return stop(problem('board-not-json', `The board is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, 'Rewrite it, then run validate.'))
  }
  if (!isObj(original)) return stop(problem('board-not-object', 'The board file must contain one JSON object.'))
  if (oversize(original) !== undefined) return stop(problem('board-too-deep', 'The board is nested too deeply to patch.', 'Rewrite it, then run validate.'))
  const from = revisionOf(original)
  if (from === undefined) return stop(problem('no-revision', 'The board has no valid "revision", so there is nothing to raise.', 'Set "revision" to a whole number of 1 or more, or rewrite the board.', '/revision'))
  if (input.base !== undefined && input.base !== from) return stop(staleRevision(from, input.base, '--base'))

  const doc = structuredClone(original)
  const opErrors: OpProblem[] = []
  // A stale guard ends the patch: nothing after it was made for this board.
  let halted = false
  const found = (index: number, path: string, error: unknown): void => {
    if (!(error instanceof OpFailure)) throw error
    if (error.code === 'stale-revision') halted = true
    opErrors.push({ op: index, path, code: error.code, message: error.message, ...(error.hint === undefined ? {} : { hint: error.hint }) })
  }

  const touches: Touches = new Map()
  const answers = new Map<string, { op: number; status: string; text: string }>()
  const removed = new Map<string, { op: number; path: string }>()
  const assigned: { op: number; id: string }[] = []
  const cascaded: Cascaded = new Map()
  const feedback = input.feedback

  /** The feedback item an edit or answer names. It must be one the user sent and did not withdraw. */
  const checkFeedbackItem = (id: string): void => {
    if (feedback === undefined) return fail('no-feedback', 'There is no feedback.json next to the board, so there is nothing to answer.')
    if (feedback === 'unreadable') return fail('no-feedback', 'feedback.json next to the board is not a feedback file.')
    if (feedback.boardId !== doc.id) return fail('feedback-other-board', `feedback.json is for the board ${show(feedback.boardId)}, not this one.`)
    if (feedback.withdrawn.includes(id)) return fail('withdrawn-item', `The user withdrew ${show(id)}. Leave it out.`)
    if (!feedback.items.includes(id)) {
      const near = nearest(id, feedback.items)
      return fail('unknown-feedback-item', `${show(id.slice(0, 80))} is not an item in feedback.json.`, near === undefined ? undefined : `Did you mean "${near}"?`)
    }
  }

  const touch = (op: Op, index: number, partId: string | undefined): void => {
    if (op.for === undefined) return
    const entry = touches.get(op.for) ?? { first: index, ids: [] }
    touches.set(op.for, entry)
    const [list] = op.segments
    if (partId !== undefined && (list === 'components' || list === 'relationships') && !entry.ids.includes(partId)) entry.ids.push(partId)
  }

  const guardKey = (located: Extract<Located, { kind: 'key' }>, op: Op): void => {
    const [first] = op.segments
    if (op.segments.length === 1 && first !== undefined && Object.hasOwn(RESERVED, first)) fail('reserved-path', `${pathOf(op.segments)} cannot be edited. ${RESERVED[first]}`)
    if (located.key === 'id' && op.segments.length === 3 && isList(op.segments[0]!)) fail('id-immutable', 'An ID never changes, because the notes of the user stay attached by it.', 'Remove the item and add a new one.')
  }

  rawOps.forEach((raw, index) => {
    if (halted) return
    const label = isObj(raw) && typeof raw.path === 'string' ? raw.path.slice(0, 120) : ''
    try {
      const op = readOp(raw)
      if (op.op === 'respond') {
        checkFeedbackItem(op.for!)
        if (answers.has(op.for!)) fail('duplicate-respond', `${show(op.for!)} is answered twice in this patch.`)
        answers.set(op.for!, { op: index, status: op.status!, text: op.text! })
        return
      }
      if (op.for !== undefined) checkFeedbackItem(op.for)
      const [first] = op.segments
      if (op.op !== 'test' && first !== undefined && Object.hasOwn(RESERVED, first)) fail('reserved-path', `${pathOf(op.segments)} cannot be edited. ${RESERVED[first]}`)
      const located = locate(doc, op.segments)
      const partId = op.segments[1]

      if (op.op === 'test') {
        const actual = located.kind === 'item' ? (located.index < 0 ? fail('not-found', `There is no ${SINGULAR[located.listName]} with the ID ${show(located.id)}.`) : located.list[located.index]) : located.exists ? located.parent[located.key] : fail('not-found', `${op.path} does not exist.`)
        if (!deepEqual(actual, op.value)) {
          if (op.path === '/revision') fail('stale-revision', `The board is at revision ${String(actual)}, but the patch expects ${JSON.stringify(op.value)}.`, 'Read the board again and make the patch from it.')
          fail('test-failed', `The value at ${op.path} is not the one the patch expects.`, 'Read the board again and make the patch from it.')
        }
        return
      }

      if (located.kind === 'item') {
        const { list, listName, index: at, id } = located
        if (op.op === 'add') fail('bad-target', `${op.path} names an item. To add one, use the list: ${pathOf(op.segments, 1)}.`)
        if (at < 0) return notFoundItem(listName, list, id)
        if (op.op === 'replace') {
          if (!isObj(op.value) || op.value.id !== id) fail('id-mismatch', `The new value of ${op.path} must be an object with "id": ${show(id)}.`, 'An ID never changes. To rename, remove the item and add a new one.')
          list[at] = structuredClone(op.value)
          touch(op, index, id)
          return
        }
        list.splice(at, 1)
        removed.set(id, { op: index, path: op.path })
        if (input.cascade) dropReferences(doc, listName, id, cascaded)
        return
      }

      guardKey(located, op)
      if (located.idList) {
        const list = (Array.isArray(doc[located.key]) ? doc[located.key] : []) as unknown[]
        const listName = located.key as ListName
        if (op.op === 'remove') fail('bad-target', `${op.path} is a whole list. Name the item by ID: ${op.path}/<id>.`)
        if (op.op === 'replace') {
          if (!Array.isArray(op.value)) fail('wrong-type', `The new value of ${op.path} must be a list.`)
          for (const entry of list) if (idOf(entry) !== undefined) removed.set(idOf(entry)!, { op: index, path: `${op.path}/${idOf(entry)}` })
          setOwn(doc, located.key, structuredClone(op.value))
          return
        }
        // add: append an item, or put it before another one
        let value = op.value
        if (!isObj(value)) return fail('wrong-type', `The value added to ${op.path} must be an object.`)
        const taken = idsOn(doc)
        let id = idOf(value)
        if (id === undefined) {
          const source = nameFor(listName, value)
          id = source === undefined ? undefined : makeId(source, taken)
          if (id === undefined) {
            const example = `"id": "${listName === 'components' ? 'payment' : 'new-item'}"`
            if (source === undefined) return fail('missing-id', 'A new item needs an "id" or a label to make one from.', `Add one, for example ${example}.`)
            return fail('missing-id', `The ${NAME_FIELD[listName]} ${show(source.slice(0, 80))} has no letters or digits to make an ID from.`, `Add an "id", for example ${example}.`)
          }
          value = { ...value, id }
          assigned.push({ op: index, id })
        }
        if (taken.has(id)) return fail('duplicate-id', `The ID ${show(id.slice(0, 80))} is already used on the board. IDs are unique across the whole board.`, `Use a new ID, for example "${freeId(id, taken, LIMITS.id)}".`)
        let position = list.length
        if (op.before !== undefined) {
          position = list.findIndex((entry) => idOf(entry) === op.before)
          if (position < 0) return fail('unknown-sibling', `"before" names ${show(op.before.slice(0, 80))}, which is not in ${located.key}.`)
        }
        list.splice(position, 0, structuredClone(value))
        setOwn(doc, located.key, list)
        removed.delete(id)
        touch(op, index, id)
        return
      }
      if (op.before !== undefined) fail('bad-target', '"before" works only when adding an item to a list such as /components.')
      if (op.op === 'add') {
        // As in JSON Patch, adding a field that exists sets it.
        setOwn(located.parent, located.key, structuredClone(op.value))
      } else if (op.op === 'replace') {
        if (!located.exists) return notFoundKey(located.parent, located.key, [], pathOf(op.segments, op.segments.length - 1))
        setOwn(located.parent, located.key, structuredClone(op.value))
      } else {
        if (!located.exists) return notFoundKey(located.parent, located.key, [], pathOf(op.segments, op.segments.length - 1))
        delete located.parent[located.key]
      }
      touch(op, index, partId)
    } catch (error) {
      found(index, label, error)
    }
  })

  // Every edit with `for` must reach an answer, and `respond` builds the answers block.
  const responsesBefore = isObj(doc.responses) ? doc.responses : undefined
  const sameFeedback = feedback !== undefined && feedback !== 'unreadable' && responsesBefore?.respondsTo === feedback.id
  const earlier = new Map<string, Obj>()
  if (sameFeedback && Array.isArray(responsesBefore?.items)) for (const entry of responsesBefore.items) if (isObj(entry) && typeof entry.feedbackId === 'string') earlier.set(entry.feedbackId, entry)
  for (const [id, entry] of touches) {
    if (!answers.has(id) && !earlier.has(id)) opErrors.push({ op: entry.first, path: id, code: 'for-unanswered', message: `An edit says it is for ${show(id)}, but no operation answers it.`, hint: `Add {"op": "respond", "for": "${id}", "status": "adopted", "text": "..."}.` })
  }
  if ((answers.size > 0 || touches.size > 0) && opErrors.length === 0 && feedback !== undefined && feedback !== 'unreadable') {
    const onBoard = new Set([...(Array.isArray(doc.components) ? doc.components : []), ...(Array.isArray(doc.relationships) ? doc.relationships : [])].flatMap((entry) => idOf(entry) ?? []))
    const items: Obj[] = [...earlier.values()].map((entry) => structuredClone(entry))
    for (const id of new Set([...answers.keys(), ...touches.keys()])) {
      let item = items.find((entry) => entry.feedbackId === id)
      if (item === undefined) {
        item = { feedbackId: id, status: 'answered', text: '', changed: [] }
        items.push(item)
      }
      const answer = answers.get(id)
      if (answer !== undefined) {
        item.status = answer.status
        item.text = answer.text
      }
      const changed = new Set(Array.isArray(item.changed) ? item.changed.filter((c): c is string => typeof c === 'string') : [])
      for (const part of touches.get(id)?.ids ?? []) changed.add(part)
      item.changed = [...changed].filter((c) => onBoard.has(c))
    }
    doc.responses = { respondsTo: feedback.id, items }
  }

  // The result
  setOwn(doc, 'revision', from + 1)
  const diff = diffBoards(original, doc)
  if (diff.length === 0 && opErrors.length === 0) opErrors.push({ op: undefined, path: '', code: 'no-change', message: 'The patch changes nothing on the board.', hint: 'It may have been applied before.' })

  const text = `${JSON.stringify(inSchemaOrder(doc), null, 2)}\n`
  const parsed = parseBoard(text, { knownLessons: LESSON_IDS })
  if (parsed.ok && opErrors.length === 0) {
    const notes = [...cascaded].map(([path, because]) => ({ path, because }))
    const lines = diff.map((line) => {
      const because = notes.find((n) => line.slice(2) === n.path)
      return because === undefined ? line : `${line} (cascade, with ${because.because})`
    })
    return { ok: true, text, from, to: from + 1, diff: lines, warnings: parsed.warnings, board: parsed.board, assigned }
  }
  if (!parsed.ok && !input.cascade) {
    for (const [id, where] of removed) {
      if (idsOn(doc).has(id)) continue
      const refs = referencesTo(doc, id)
      if (refs.length === 0) continue
      const shown = refs.slice(0, 4).join(', ')
      opErrors.push({
        op: where.op,
        path: where.path,
        code: 'dangling-reference',
        message: `${where.path.slice(1)} is removed, but ${shown}${refs.length > 4 ? `, and ${refs.length - 4} more` : ''} still refer${refs.length > 1 ? '' : 's'} to it.`,
        hint: 'Remove or change those in the same patch, or add --cascade to drop them with it.',
      })
    }
  }
  const MAX = 25
  return {
    ok: false,
    opErrors: opErrors.slice(0, MAX),
    omittedOpErrors: Math.max(0, opErrors.length - MAX),
    errors: parsed.ok ? [] : parsed.errors.filter((e) => e.code !== 'more-problems'),
    omittedErrors: parsed.ok ? 0 : (parsed.omitted ?? 0),
  }
}

function staleRevision(actual: number, expected: number, path: string): OpProblem {
  return { op: undefined, path, code: 'stale-revision', message: `The board is at revision ${actual}, but the patch expects ${expected}.`, hint: 'Read the board again and make the patch from it.' }
}
