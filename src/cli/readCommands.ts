import type { Board } from '../board/schema.ts'
import { nearest } from '../board/suggest.ts'
import { parseBoard } from '../board/validate.ts'
import { LESSON_IDS } from '../lessons/ids.ts'
import { clip, count, cutText, jsonLine, safe, shown, type CliIo, type CliResult } from './output.ts'

// `feedback`, `outline`, and `show`: three read commands that give an agent only what it needs to answer feedback,
// so it never reads the whole board or the raw feedback.json. Both files are data from anywhere. Every string that
// reaches the output is escaped and cut, and nothing in them is run.

export interface ReadOptions {
  command: 'feedback' | 'outline' | 'show'
  board: string | undefined
  ids: readonly string[]
  json: boolean
}

/** `show` takes at most this many IDs, and prints at most this many lines, whole parts only. */
export const MAX_SHOW_IDS = 20
const MAX_SHOW_LINES = 400
/** Lines of one section of the outline, and IDs of one kind of item. */
const MAX_OUTLINE = 100
const MAX_ITEM_IDS = 20
/** The feedback file holds at most this many answers, so more items could not be answered anyway. */
const MAX_FEEDBACK_ITEMS = 300
/** Longest text of the user, and longest label or ID, in a printed line. */
const TEXT = 600
const NAME = 80
/** How many parts a list such as `encloses` names before it counts the rest. */
const MAX_REFS = 6

type Rec = Record<string, unknown>
const rec = (x: unknown): Rec | undefined => (x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : undefined)
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined)

function fail(code: 1 | 2, text: string, to: 'stdout' | 'stderr' = 'stderr'): CliResult {
  return { code, stdout: to === 'stdout' ? text : '', stderr: to === 'stderr' ? text : '' }
}

/** The board, valid, or the result to return. `text` is the file as it is, for commands that print it. */
function loadBoard(file: string, io: CliIo): { board: Board; text: string } | CliResult {
  const shownFile = io.display(file)
  const read = io.read(file)
  if (!read.ok) return fail(2, `Cannot read ${shownFile}: ${read.reason}.\n`)
  const result = parseBoard(read.text, { knownLessons: LESSON_IDS })
  if (!result.ok) {
    const total = result.errors.filter((e) => e.code !== 'more-problems').length + (result.omitted ?? 0)
    return fail(1, `${shownFile}: invalid, ${count(total, 'error')}. Run validate to see them.\n`, 'stdout')
  }
  return { board: result.board, text: read.text }
}

const isResult = (x: object): x is CliResult => 'code' in x

// ---- feedback ----

/** `id "Label"`, for a part or connection. */
function named(x: Rec): string {
  const id = str(x.id)
  const label = str(x.label)
  return `${id === undefined ? '?' : shown(id, NAME)}${label === undefined ? '' : ` ${shown(label, NAME, true)}`}`
}

/** What an item points at: `component payment "Payment"`, `board`, `missing old-part`, or `empty space`. */
function where(x: unknown): string {
  const r = rec(x)
  const type = str(r?.type)
  if (r === undefined || type === undefined) return '?'
  if (type === 'board') return 'board'
  if (type === 'point') return 'empty space'
  if (type === 'missing') return `missing ${shown(str(r.id) ?? '?', NAME)}`
  const at = typeof r.at === 'number' ? ` at ${Math.round(r.at * 100) / 100}` : ''
  return `${shown(type, 20)} ${named(r)}${at}`
}

/** Just the ID of an end of a connection. */
function end(x: unknown): string {
  const r = rec(x)
  const id = str(r?.id)
  return r?.type === 'missing' ? `missing ${shown(id ?? '?', NAME)}` : id === undefined ? '?' : shown(id, NAME)
}

/** A list of parts, as `id "Label"` each, with the rest counted. Undefined when it is empty or not a list. */
function list(x: unknown, name: string): string | undefined {
  if (!Array.isArray(x) || x.length === 0) return undefined
  const names = x.slice(0, MAX_REFS).map((r) => (rec(r) === undefined ? '?' : named(rec(r)!)))
  return `${name} ${names.join(', ')}${x.length > MAX_REFS ? `, ${x.length - MAX_REFS} more` : ''}`
}

/** What the target of a note said when the user wrote it. Only shown when the target has changed since. */
function was(x: unknown): string | undefined {
  const s = rec(x)
  if (s === undefined) return undefined
  const text = (k: string) => (str(s[k]) === undefined ? '' : shown(str(s[k])!, TEXT, true))
  const parts = s.type === 'board' ? [text('title')] : s.type === 'component' ? [text('label'), text('summary')] : [text('label'), shown(str(s.kind) ?? '?', 20), `${shown(str(s.from) ?? '?', NAME)} > ${shown(str(s.to) ?? '?', NAME)}`]
  return `was ${parts.filter((p) => p !== '').join(' ')}`
}

const quoted = (x: unknown) => (typeof x === 'string' ? shown(x, TEXT, true) : undefined)

/** The part of an item line after its ID and type. Fields the file lacks are left out. */
function details(item: Rec, type: string): (string | undefined)[] {
  const note = quoted(item.note)
  switch (type) {
    case 'note':
    case 'question': {
      const status = str(item.status)
      return [`on ${where(item.about)}`, quoted(item.text), status === undefined ? undefined : shown(status, 30), status === undefined ? undefined : was(item.snapshot)]
    }
    case 'link':
      return [`${end(item.from)} > ${end(item.to)}`, quoted(item.label)]
    case 'reconnect': {
      const c = rec(item.connection)
      const was = rec(item.was)
      const now = rec(item.now)
      return [c === undefined ? undefined : `${named(c)} ${shown(str(c.kind) ?? '?', 20)}`, `was ${end(was?.from)} > ${end(was?.to)}`, `now ${end(now?.from)} > ${end(now?.to)}`]
    }
    case 'new-part': {
      const links = Array.isArray(item.links) ? item.links.map((l) => str(rec(l)?.id)).filter((id): id is string => id !== undefined) : []
      return [quoted(item.label), quoted(item.summary), list(item.near, 'near'), links.length === 0 ? undefined : `links ${links.map((id) => shown(id, NAME)).join(', ')}`]
    }
    case 'shape':
      return [str(item.shape) === undefined ? undefined : shown(str(item.shape)!, 20), note, list(item.encloses, 'encloses'), list(item.touches, 'touches')]
    case 'drawing':
      return [note, list(item.encloses, 'encloses'), list(item.touches, 'touches')]
    case 'arrow':
      return [`from ${where(item.from)}`, `to ${where(item.to)}`, note]
    case 'text':
    case 'sticky':
      return [quoted(item.text), note, list(item.on, 'on')]
    default:
      return []
  }
}

/** An item for `--json`: the item as the file holds it, escaped and cut, and without a snapshot that is still current. */
function cleaned(x: unknown, depth = 0): unknown {
  if (typeof x === 'string') return cutText(x, TEXT)
  if (typeof x !== 'object' || x === null) return x
  if (depth >= 6) return null
  if (Array.isArray(x)) return x.slice(0, 50).map((v) => cleaned(v, depth + 1))
  return Object.fromEntries(Object.entries(x).slice(0, 50).map(([k, v]) => [cutText(k, NAME), cleaned(v, depth + 1)]))
}

interface FeedbackFile {
  id: string
  boardId: string
  baseRevision: number
  items: unknown[]
  withdrawn: number
}

function readFeedbackFile(text: string): FeedbackFile | undefined {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return undefined
  }
  const r = rec(data)
  if (r === undefined || r.format !== 'anatomy-feedback' || typeof r.id !== 'string' || typeof r.boardId !== 'string' || typeof r.baseRevision !== 'number' || !Array.isArray(r.items)) return undefined
  return { id: r.id, boardId: r.boardId, baseRevision: r.baseRevision, items: r.items, withdrawn: Array.isArray(r.withdrawn) ? r.withdrawn.length : 0 }
}

/** The ID and revision of the board, read loosely: `feedback` still works when the board is broken or missing. */
function boardHead(file: string, io: CliIo): { id: string; revision: number } | undefined {
  const read = io.read(file)
  if (!read.ok) return undefined
  try {
    const r = rec(JSON.parse(read.text.replace(/^﻿/, '')))
    return typeof r?.id === 'string' && typeof r.revision === 'number' ? { id: r.id, revision: r.revision } : undefined
  } catch {
    return undefined
  }
}

function runFeedback(boardFile: string, json: boolean, io: CliIo): CliResult {
  const path = io.sibling(boardFile, 'feedback.json')
  const file = io.display(path)
  const read = io.read(path)
  if (!read.ok) return fail(2, `Cannot read ${file}: ${read.reason}.${read.missing ? ' The user sends feedback from Anatomy.' : ''}\n`)
  const feedback = readFeedbackFile(read.text)
  if (feedback === undefined) return fail(2, `${file} is not a feedback file.\n`)

  // An item needs an ID and a type. Anything else is counted, never printed.
  const readable = feedback.items.map(rec).filter((r): r is Rec => r !== undefined && typeof r.id === 'string' && typeof r.type === 'string')
  const unreadable = feedback.items.length - readable.length
  const listed = readable.slice(0, MAX_FEEDBACK_ITEMS)
  const omitted = readable.length - listed.length
  const board = boardHead(boardFile, io)
  const sameBoard = board !== undefined && board.id === feedback.boardId

  if (json) {
    const items = listed.map((item) => {
      const { snapshot, ...rest } = item
      return cleaned(item.status === undefined ? rest : { ...rest, snapshot })
    })
    const report = {
      file,
      id: cutText(feedback.id, NAME),
      boardId: cutText(feedback.boardId, NAME),
      baseRevision: feedback.baseRevision,
      ...(sameBoard ? { boardRevision: board.revision } : {}),
      items,
      withdrawn: feedback.withdrawn,
      omittedItems: omitted,
      unreadableItems: unreadable,
    }
    return { code: 0, stdout: `${jsonLine(report)}\n`, stderr: '' }
  }

  const state = board === undefined ? '' : !sameBoard ? ` (board is ${shown(board.id, NAME, true)})` : board.revision === feedback.baseRevision ? '' : ` (board now rev ${board.revision})`
  const total = readable.length === 0 ? 'no open items' : count(readable.length, 'item')
  const left = feedback.withdrawn === 0 ? '' : `, ${feedback.withdrawn} withdrawn not shown`
  const lines = [`${shown(feedback.id, NAME)}  board ${shown(feedback.boardId, NAME)}  base rev ${feedback.baseRevision}${state}  ${total}${left}`]
  for (const item of listed) {
    const type = item.type as string
    lines.push([shown(item.id as string, NAME), shown(type, 20), ...details(item, type).filter((d): d is string => d !== undefined)].join('  '))
  }
  if (omitted > 0) lines.push(`${omitted} more items are not shown.`)
  if (unreadable > 0) lines.push(`${count(unreadable, 'item')} not readable.`)
  if (listed.length > 0) lines.push('Answer each item with an apply operation: {"op": "respond", "for": "<id>", "status": "adopted|declined|answered", "text": "..."}.')
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' }
}

// ---- outline ----

function runOutline(boardFile: string, json: boolean, io: CliIo): CliResult {
  const loaded = loadBoard(boardFile, io)
  if (isResult(loaded)) return loaded
  const { board } = loaded
  const kinds = new Map<string, string[]>()
  for (const item of board.items) kinds.set(item.kind, [...(kinds.get(item.kind) ?? []), item.id])

  if (json) {
    const report = {
      file: io.display(boardFile),
      id: board.id,
      revision: board.revision,
      title: board.title,
      groups: board.groups.map((g) => ({ id: g.id, label: g.label })),
      components: board.components.map((c) => ({ id: c.id, label: c.label, ...(c.group === undefined ? {} : { group: c.group }) })),
      connections: board.relationships.map((r) => ({ id: r.id, from: r.from, to: r.to, kind: r.kind, label: r.label })),
      items: Object.fromEntries(kinds),
      scenarios: board.scenarios.map((s) => ({ id: s.id, title: s.title, steps: s.steps.length })),
    }
    return { code: 0, stdout: `${jsonLine(report)}\n`, stderr: '' }
  }

  const q = (text: string) => shown(text, NAME, true)
  const part = (rows: string[], more: string): string[] => [...rows.slice(0, MAX_OUTLINE), ...(rows.length > MAX_OUTLINE ? [`${rows.length - MAX_OUTLINE} more ${more} are not shown.`] : [])]
  const lines = [`${shown(board.id, NAME)}  rev ${board.revision}  ${shown(board.title, 120, true)}`]
  if (board.groups.length > 0) lines.push(`groups  ${board.groups.map((g) => `${shown(g.id, NAME)} ${q(g.label)}`).join('  ')}`)
  lines.push(`components ${board.components.length}`)
  lines.push(...part(board.components.map((c) => `${shown(c.id, NAME)}  ${q(c.label)}${c.group === undefined ? '' : `  ${shown(c.group, NAME)}`}`), 'components'))
  if (board.relationships.length > 0) {
    lines.push(`connections ${board.relationships.length}`)
    lines.push(...part(board.relationships.map((r) => `${shown(r.id, NAME)}  ${shown(r.from, NAME)} > ${shown(r.to, NAME)}  ${r.kind}  ${q(r.label)}`), 'connections'))
  }
  if (board.items.length > 0) {
    lines.push(`items ${board.items.length}`)
    for (const [kind, ids] of kinds) lines.push(`${kind} ${ids.length}: ${ids.slice(0, MAX_ITEM_IDS).map((id) => shown(id, NAME)).join(', ')}${ids.length > MAX_ITEM_IDS ? `, ${ids.length - MAX_ITEM_IDS} more` : ''}`)
  }
  if (board.scenarios.length > 0) {
    lines.push(`scenarios ${board.scenarios.length}`)
    lines.push(...part(board.scenarios.map((s) => `${shown(s.id, NAME)}  ${shown(s.title, 120, true)}  ${count(s.steps.length, 'step')}`), 'scenarios'))
  }
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' }
}

// ---- show ----

const LISTS = ['components', 'relationships', 'items', 'groups', 'scenarios'] as const

function runShow(boardFile: string, ids: readonly string[], json: boolean, io: CliIo): CliResult {
  const loaded = loadBoard(boardFile, io)
  if (isResult(loaded)) return loaded
  const { board } = loaded
  // The file as it is, so a part prints exactly as its author wrote it. The board passed validation, so the lists are there.
  const raw = JSON.parse(loaded.text.replace(/^﻿/, '')) as Record<(typeof LISTS)[number], Rec[] | undefined>
  const known = new Map<string, { list: (typeof LISTS)[number]; index: number }>()
  for (const list of LISTS) (board[list] as { id: string }[]).forEach((x, index) => known.set(x.id, { list, index }))

  const wanted = [...new Set(ids)]
  const found: { list: string; id: string; value: unknown; text: string }[] = []
  const unknown: { id: string; hint?: string }[] = []
  for (const id of wanted) {
    const at = known.get(id)
    const value = at === undefined ? undefined : raw[at.list]?.[at.index]
    if (at === undefined || value === undefined) {
      const near = nearest(id.slice(0, 80), Array.from(known.keys()))
      unknown.push({ id, ...(near === undefined ? {} : { hint: `Did you mean "${near}"?` }) })
    } else found.push({ list: at.list, id, value, text: jsonLine(value, 2) })
  }

  // Whole parts only. The first always prints, so one large part is never refused.
  const printed: typeof found = []
  let used = 0
  for (const f of found) {
    const size = f.text.split('\n').length + 2
    if (printed.length > 0 && used + size > MAX_SHOW_LINES) break
    printed.push(f)
    used += size
  }
  const cut = found.slice(printed.length).map((f) => f.id)
  const code = unknown.length > 0 ? 1 : 0

  if (json) {
    const report = {
      file: io.display(boardFile),
      items: printed.map(({ list, id, value }) => ({ list, id, value })),
      notShown: cut,
      unknown,
    }
    return { code, stdout: `${jsonLine(report)}\n`, stderr: '' }
  }
  const blocks = printed.map((f) => `${f.list}/${safe(f.id)}\n${f.text}`)
  const notes = [
    ...(cut.length > 0 ? [`not shown: ${cut.map((id) => safe(id)).join(', ')}. Too many lines at once, so ask for fewer IDs.`] : []),
    ...unknown.map((u) => clip(`Unknown ID "${u.id}".${u.hint === undefined ? '' : ` ${u.hint}`}`)),
  ]
  return { code, stdout: `${[...blocks, ...(notes.length > 0 ? [notes.join('\n')] : [])].join('\n\n')}\n`, stderr: '' }
}

export function runRead(options: ReadOptions, io: CliIo): CliResult {
  const boardFile = options.board ?? io.defaultBoard
  if (options.command === 'feedback') return runFeedback(boardFile, options.json, io)
  if (options.command === 'outline') return runOutline(boardFile, options.json, io)
  return runShow(boardFile, options.ids, options.json, io)
}
