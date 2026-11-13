import { z } from 'zod'
import { board as boardSchema, LIMITS as BOARD_LIMITS } from '../board/schema'
import type { ExportFile, ManualLink, Note, Overlay, Point, Target } from './types'

export const OVERLAY_LIMITS = {
  notes: 500,
  manualLinks: 200,
  positions: 500,
  noteText: 2000,
  linkLabel: 60,
  coordinate: BOARD_LIMITS.coordinate,
} as const

const boardId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must use lowercase letters, digits, and single hyphens')
  .max(BOARD_LIMITS.id)

const noteId = z.string().regex(/^note-[a-z0-9]{6,32}$/, 'must look like "note-" followed by 6 to 32 lowercase letters or digits')
const linkId = z.string().regex(/^link-[a-z0-9]{6,32}$/, 'must look like "link-" followed by 6 to 32 lowercase letters or digits')

const coordinate = z.number().finite().min(-OVERLAY_LIMITS.coordinate).max(OVERLAY_LIMITS.coordinate)
const point = z.strictObject({ x: coordinate, y: coordinate })

const isoDate = z.iso.datetime()

const target = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('board') }),
  z.strictObject({ type: z.literal('component'), id: boardId }),
  z.strictObject({ type: z.literal('relationship'), id: boardId }),
])

const note = z.strictObject({
  id: noteId,
  kind: z.enum(['note', 'question']),
  text: z.string().trim().min(1, 'must not be empty').max(OVERLAY_LIMITS.noteText),
  target,
  targetFingerprint: z.string().min(1).max(64),
  createdAt: isoDate,
  updatedAt: isoDate,
})

const manualLink = z.strictObject({
  id: linkId,
  from: boardId,
  to: boardId,
  label: z.string().trim().max(OVERLAY_LIMITS.linkLabel),
  createdAt: isoDate,
})

/**
 * Keys are validated against the component ID pattern, so a key such as
 * "__proto__" is rejected instead of being copied into the result.
 */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const positions = z
  .custom<Record<string, unknown>>(
    (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
    'must be an object keyed by component ID',
  )
  // Checks the raw own keys: a JSON key named "__proto__" is an own key here, but a record parser may skip it silently.
  .superRefine((v, ctx) => {
    const bad = Object.keys(v).find((k) => !ID_PATTERN.test(k) || k.length > BOARD_LIMITS.id)
    if (bad !== undefined) {
      const shown = bad.length > 40 ? `${bad.slice(0, 40)}...` : bad
      ctx.addIssue({ code: 'custom', message: `has a key named "${shown}". Keys must be component IDs such as "rule-check".` })
    }
  })
  .pipe(
    z.record(boardId, point).refine((r) => Object.keys(r).length <= OVERLAY_LIMITS.positions, {
      message: `must have at most ${OVERLAY_LIMITS.positions} entries`,
    }),
  )

export const overlaySchema = z.strictObject({
  format: z.literal('anatomy-overlay'),
  schemaVersion: z.literal(1),
  boardId,
  positions,
  notes: z.array(note).max(OVERLAY_LIMITS.notes),
  manualLinks: z.array(manualLink).max(OVERLAY_LIMITS.manualLinks),
})

export const exportFileSchema = z.strictObject({
  format: z.literal('anatomy-export'),
  schemaVersion: z.literal(1),
  exportedAt: isoDate,
  board: boardSchema,
  overlay: overlaySchema,
})

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

// Compile-time checks: the schemas and the shared interfaces describe the same shapes.
export type _OverlayMatches = Assert<Equal<z.infer<typeof overlaySchema>, Overlay>>
export type _ExportMatches = Assert<Equal<z.infer<typeof exportFileSchema>, ExportFile>>
export type _NoteMatches = Assert<Equal<z.infer<typeof note>, Note>>
export type _LinkMatches = Assert<Equal<z.infer<typeof manualLink>, ManualLink>>
export type _TargetMatches = Assert<Equal<z.infer<typeof target>, Target>>
export type _PointMatches = Assert<Equal<z.infer<typeof point>, Point>>
