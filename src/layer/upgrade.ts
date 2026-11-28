import { z } from 'zod'
import type { Board } from '../board/schema'
import { formatPath, type BoardProblem } from '../board/validate'
import { v1Placement } from './v1Layout'
import { boardId, emptyLayer, layerSchema, LAYER_FORMAT, link, note, type Layer } from './model'

/**
 * The human overlay, version 1. It is only read: the app writes version 2 and upgrades a version 1 overlay on read.
 * Version 1 saved the position of every card when a board opened, whether or not the user moved it.
 */
const overlayV1 = z.strictObject({
  format: z.literal('anatomy-overlay'),
  schemaVersion: z.literal(1),
  boardId,
  positions: layerSchema.shape.positions,
  notes: z.array(note).max(500),
  manualLinks: z.array(link).max(200),
})
type OverlayV1 = z.infer<typeof overlayV1>

/** `dropped` names the top-level fields a later version wrote, which this version left out. */
export type LayerResult = { ok: true; layer: Layer; dropped?: string[] } | { ok: false; errors: BoardProblem[] }

function problems(error: z.ZodError): BoardProblem[] {
  return error.issues.map((i) => ({ path: formatPath(i.path), message: i.message }))
}

/**
 * Keeps only the positions a user chose. A stored position that equals where the layout puts the card on its own is
 * a frozen default from version 1, so it is dropped and the card follows the layout again. Without the board nothing
 * can be told apart, so every position is kept.
 */
function movedOnly(positions: OverlayV1['positions'], board: Board | undefined): Layer['positions'] {
  if (!board) return positions
  const auto = v1Placement(board)
  const out: Layer['positions'] = {}
  for (const [id, p] of Object.entries(positions)) {
    const a = auto[id]
    if (!a || a.x !== p.x || a.y !== p.y) out[id] = p
  }
  return out
}

function upgrade(v1: OverlayV1, board: Board | undefined): Layer {
  return { ...emptyLayer(v1.boardId), positions: movedOnly(v1.positions, board), notes: v1.notes, links: v1.manualLinks }
}

/**
 * Reads a stored or opened layer, version 2 or a version 1 overlay. Pass the board the layer belongs to, so a
 * version 1 overlay drops the positions it froze. Stored data is untrusted, so everything is checked here.
 */
export function readLayer(data: unknown, board?: Board): LayerResult {
  const format = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).format : undefined
  if (format === LAYER_FORMAT) {
    const parsed = layerSchema.safeParse(data)
    if (!parsed.success) return { ok: false, errors: problems(parsed.error) }
    const dropped = Object.keys(data as object).filter((key) => !Object.hasOwn(layerSchema.shape, key))
    return dropped.length > 0 ? { ok: true, layer: parsed.data, dropped } : { ok: true, layer: parsed.data }
  }
  const old = overlayV1.safeParse(data)
  if (old.success) return { ok: true, layer: upgrade(old.data, board) }
  if (format === 'anatomy-overlay') return { ok: false, errors: problems(old.error) }
  return { ok: false, errors: [{ path: 'format', message: `This is not an Anatomy layer. Expected "format": "${LAYER_FORMAT}".` }] }
}
