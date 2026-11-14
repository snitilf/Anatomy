import { z } from 'zod'
import { LIMITS as BOARD_LIMITS } from '../board/schema'

/**
 * The user layer, version 2: everything the user adds on top of a board.
 * It is stored apart from the board (in `.anatomy/layer.json` or in the browser) and never changes the board.
 * The types below are inferred from these schemas, so the two cannot drift apart.
 */

export const LAYER_FORMAT = 'anatomy-layer'
export const LAYER_VERSION = 2

export const LAYER_LIMITS = {
  notes: 500,
  links: 200,
  positions: 500,
  sizes: 500,
  marks: 500,
  strokePoints: 2000,
  proposals: 60,
  reconnects: 200,
  archive: 1000,
  answers: 1000,
  sentItems: 3000,
  noteText: 2000,
  markText: 2000,
  linkLabel: 60,
  partLabel: BOARD_LIMITS.label,
  partSummary: BOARD_LIMITS.summary,
  responseText: BOARD_LIMITS.shortText,
  changed: 60,
  coordinate: BOARD_LIMITS.coordinate,
  extent: BOARD_LIMITS.coordinate * 2,
} as const

/** The kinds of things a user makes. Each has its own ID prefix. */
const ID_PREFIX = {
  note: 'note',
  link: 'link',
  mark: 'mark',
  proposal: 'part',
  reconnect: 'edit',
  feedback: 'feedback',
} as const
export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX]

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const boardId = z.string().regex(ID_PATTERN, 'must use lowercase letters, digits, and single hyphens').max(BOARD_LIMITS.id)
const ownId = (prefix: IdPrefix) =>
  z.string().regex(new RegExp(`^${prefix}-[a-z0-9]{6,32}$`), `must look like "${prefix}-" followed by 6 to 32 lowercase letters or digits`)

/** A part on the map: a component of the board, or a part the user proposed. Proposal IDs fit the board ID pattern too. */
const partId = boardId

const coordinate = z.number().finite().min(-LAYER_LIMITS.coordinate).max(LAYER_LIMITS.coordinate)
const extent = z.number().finite().min(0).max(LAYER_LIMITS.extent)
const point = z.strictObject({ x: coordinate, y: coordinate })
const size = z.strictObject({ width: extent, height: extent })
const box = { x: coordinate, y: coordinate, width: extent, height: extent }
const isoDate = z.iso.datetime()
const text = (max: number) => z.string().trim().min(1, 'must not be empty').max(max)

/**
 * A record keyed by component ID. Keys are checked as raw own keys first, so a key such as "__proto__" is rejected
 * instead of being skipped or copied into the result.
 */
function byComponent<T extends z.ZodType>(value: T, max: number) {
  return z
    .custom<Record<string, unknown>>((v) => typeof v === 'object' && v !== null && !Array.isArray(v), 'must be an object keyed by component ID')
    .superRefine((v, ctx) => {
      const bad = Object.keys(v).find((k) => !ID_PATTERN.test(k) || k.length > BOARD_LIMITS.id)
      if (bad !== undefined) {
        const shown = bad.length > 40 ? `${bad.slice(0, 40)}...` : bad
        ctx.addIssue({ code: 'custom', message: `has a key named "${shown}". Keys must be component IDs such as "rule-check".` })
      }
    })
    .pipe(z.record(boardId, value).refine((r) => Object.keys(r).length <= max, { message: `must have at most ${max} entries` }))
}

export const target = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('board') }),
  z.strictObject({ type: z.literal('component'), id: boardId }),
  z.strictObject({ type: z.literal('relationship'), id: boardId }),
])

export const note = z.strictObject({
  id: ownId('note'),
  kind: z.enum(['note', 'question']),
  text: text(LAYER_LIMITS.noteText),
  target,
  /** Fingerprint of the target when the note was written or last confirmed. */
  targetFingerprint: z.string().min(1).max(64),
  createdAt: isoDate,
  updatedAt: isoDate,
})

/** A line the user drew between two parts. */
export const link = z.strictObject({
  id: ownId('link'),
  from: partId,
  to: partId,
  label: z.string().trim().max(LAYER_LIMITS.linkLabel),
  createdAt: isoDate,
})

/**
 * Where an arrow ends: on a part, on a connection, or at a free point.
 * On a connection, `t` is how far along the drawn line the end sits, from 0 at its start to 1 at its end.
 */
export const markEnd = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('part'), id: partId }),
  z.strictObject({ type: z.literal('relationship'), id: boardId, t: z.number().min(0).max(1).optional() }),
  z.strictObject({ type: z.literal('point'), x: coordinate, y: coordinate }),
])

const markBase = {
  id: ownId('mark'),
  createdAt: isoDate,
  /** What the user wants to say with the mark. */
  note: text(LAYER_LIMITS.noteText).optional(),
}

/** Something drawn on the whiteboard, in board coordinates. */
export const mark = z.discriminatedUnion('kind', [
  z.strictObject({ ...markBase, kind: z.literal('stroke'), points: z.array(point).min(1).max(LAYER_LIMITS.strokePoints) }),
  z.strictObject({ ...markBase, kind: z.literal('rect'), ...box }),
  z.strictObject({ ...markBase, kind: z.literal('ellipse'), ...box }),
  z.strictObject({ ...markBase, kind: z.literal('arrow'), from: markEnd, to: markEnd }),
  z.strictObject({ ...markBase, kind: z.literal('text'), ...box, text: text(LAYER_LIMITS.markText) }),
  z.strictObject({ ...markBase, kind: z.literal('sticky'), ...box, text: z.string().trim().max(LAYER_LIMITS.markText) }),
])

/** A new part the user sketched. It can be linked like any part. */
export const proposal = z.strictObject({
  id: ownId('part'),
  label: text(LAYER_LIMITS.partLabel),
  summary: z.string().trim().max(LAYER_LIMITS.partSummary),
  ...box,
  createdAt: isoDate,
})

/** Moves one or both ends of a connection the agent drew. */
export const reconnect = z
  .strictObject({
    id: ownId('edit'),
    relationshipId: boardId,
    from: partId.optional(),
    to: partId.optional(),
    createdAt: isoDate,
  })
  .refine((r) => r.from !== undefined || r.to !== undefined, { message: 'must change at least one end' })

/** The agent's answer to one item, from the `responses` of a board revision. */
export const response = z.strictObject({
  /** The feedback the answer belongs to, as the board names it. */
  respondsTo: boardId,
  status: z.enum(['adopted', 'declined', 'answered']),
  text: z.string().trim().max(LAYER_LIMITS.responseText),
  changed: z.array(boardId).max(LAYER_LIMITS.changed),
})

const archived = <T extends string, S extends z.ZodType>(type: T, item: S) =>
  z.strictObject({ type: z.literal(type), item, response, archivedAt: isoDate })

/** An item the agent resolved. It leaves the map but is kept, so it can be restored. */
export const archiveEntry = z.discriminatedUnion('type', [
  archived('note', note),
  archived('link', link),
  archived('mark', mark),
  archived('proposal', proposal),
  archived('reconnect', reconnect),
])

/** The agent's latest answer to one of the user's items that is still on the map. */
export const answer = z.strictObject({ id: z.string().max(64), response })

/** What the last sends to the agent contained, so the next send holds only what is new or changed. */
export const sent = z.strictObject({
  feedbackId: ownId('feedback'),
  baseRevision: z.number().int().min(1),
  at: isoDate,
  /** Every item sent so far, with its fingerprint at the time. */
  items: z.array(z.strictObject({ id: z.string().max(64), fingerprint: z.string().min(1).max(64) })).max(LAYER_LIMITS.sentItems),
})

export const layerSchema = z.strictObject({
  format: z.literal(LAYER_FORMAT),
  schemaVersion: z.literal(LAYER_VERSION),
  boardId,
  /** Only the cards the user moved. Every other card follows the layout. */
  positions: byComponent(point, LAYER_LIMITS.positions),
  /** Only the cards the user resized. */
  sizes: byComponent(size, LAYER_LIMITS.sizes),
  notes: z.array(note).max(LAYER_LIMITS.notes),
  links: z.array(link).max(LAYER_LIMITS.links),
  marks: z.array(mark).max(LAYER_LIMITS.marks),
  proposals: z.array(proposal).max(LAYER_LIMITS.proposals),
  reconnects: z.array(reconnect).max(LAYER_LIMITS.reconnects),
  archive: z.array(archiveEntry).max(LAYER_LIMITS.archive),
  /** Answers the agent gave to items still on the map. Layers written before answers were kept have none. */
  answers: z.array(answer).max(LAYER_LIMITS.answers).default([]),
  sent: sent.optional(),
})

export type Layer = z.infer<typeof layerSchema>
export type Target = z.infer<typeof target>
export type Note = z.infer<typeof note>
export type Link = z.infer<typeof link>
export type Mark = z.infer<typeof mark>
export type MarkEnd = z.infer<typeof markEnd>
export type Proposal = z.infer<typeof proposal>
export type Reconnect = z.infer<typeof reconnect>
export type Response = z.infer<typeof response>
export type ArchiveEntry = z.infer<typeof archiveEntry>
export type Answer = z.infer<typeof answer>
export type Sent = z.infer<typeof sent>
export type NoteStatus = 'current' | 'possibly-outdated' | 'needs-relinking'

/** The user's own items, by kind. Positions and sizes are layout, not items. */
export type ItemType = ArchiveEntry['type']
export type Item = { [K in ItemType]: { type: K; item: Extract<ArchiveEntry, { type: K }>['item'] } }[ItemType]

export function emptyLayer(boardId: string): Layer {
  return {
    format: LAYER_FORMAT,
    schemaVersion: LAYER_VERSION,
    boardId,
    positions: {},
    sizes: {},
    notes: [],
    links: [],
    marks: [],
    proposals: [],
    reconnects: [],
    archive: [],
    answers: [],
  }
}

/** Every item in the layer, in a fixed order. */
export function itemsOf(layer: Layer): Item[] {
  return [
    ...layer.notes.map((item) => ({ type: 'note' as const, item })),
    ...layer.links.map((item) => ({ type: 'link' as const, item })),
    ...layer.marks.map((item) => ({ type: 'mark' as const, item })),
    ...layer.proposals.map((item) => ({ type: 'proposal' as const, item })),
    ...layer.reconnects.map((item) => ({ type: 'reconnect' as const, item })),
  ]
}

/** True when the user has made anything at all in this layer. */
export function hasUserWork(layer: Layer): boolean {
  return itemsOf(layer).length > 0 || Object.keys(layer.positions).length > 0 || Object.keys(layer.sizes).length > 0 || layer.archive.length > 0
}

/** The layer as it is written to `.anatomy/layer.json`. */
export function serializeLayer(layer: Layer): string {
  return `${JSON.stringify(layer, null, 2)}\n`
}
