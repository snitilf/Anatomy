import { z } from 'zod'
import { LIMITS, type Board } from '../board/schema'
import { formatPath, parseBoard, type BoardProblem } from '../board/validate'
import type { Layer } from './model'
import { readLayer } from './upgrade'

export type OpenedFile =
  | { ok: true; kind: 'board'; board: Board; warnings: BoardProblem[] }
  | { ok: true; kind: 'export'; board: Board; layer: Layer; warnings: BoardProblem[] }
  | { ok: false; errors: BoardProblem[] }

/**
 * A board and the user's layer in one portable file. Version 2 holds a layer; version 1 held a human overlay,
 * which is upgraded when it is opened.
 */
export interface ExportFile {
  format: 'anatomy-export'
  schemaVersion: 2
  exportedAt: string
  board: Board
  layer: Layer
}

export interface OpenOptions {
  /** Byte limit for an export file. Defaults to twice the board file limit. */
  maxExportBytes?: number
}

export function makeExport(board: Board, layer: Layer, now: Date): ExportFile {
  return { format: 'anatomy-export', schemaVersion: 2, exportedAt: now.toISOString(), board, layer }
}

export function serializeExport(file: ExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

const shell = z.discriminatedUnion('schemaVersion', [
  z.strictObject({ format: z.literal('anatomy-export'), schemaVersion: z.literal(1), exportedAt: z.iso.datetime(), board: z.unknown(), overlay: z.unknown() }),
  z.strictObject({ format: z.literal('anatomy-export'), schemaVersion: z.literal(2), exportedAt: z.iso.datetime(), board: z.unknown(), layer: z.unknown() }),
])

function fail(path: string, message: string): OpenedFile {
  return { ok: false, errors: [{ path, message }] }
}

function prefixed(prefix: string, problems: BoardProblem[]): BoardProblem[] {
  return problems.map((p) => ({ ...p, path: p.path === '' ? prefix : p.path.startsWith('[') ? `${prefix}${p.path}` : `${prefix}.${p.path}` }))
}

/** Opens a bare board file or an export file. Never throws. */
export function parseOpenedFile(text: string, options: OpenOptions = {}): OpenedFile {
  try {
    return open(text, options)
  } catch (error) {
    return fail('', `The file could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Whole megabytes when they are whole, one decimal otherwise, rounded up so a file over the limit never reads as equal to it. */
function megabytes(bytes: number): string {
  const tenths = Math.ceil(bytes / 100_000)
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1)
}

function open(text: string, options: OpenOptions): OpenedFile {
  if (text.startsWith('﻿')) text = text.slice(1)

  const maxBytes = options.maxExportBytes ?? LIMITS.fileBytes * 2
  const bytes = new TextEncoder().encode(text).length
  if (bytes > maxBytes) {
    return fail('', `This file is ${megabytes(bytes)} MB. Anatomy opens files up to ${megabytes(maxBytes)} MB.`)
  }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    return fail('', `The file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const isExport =
    typeof data === 'object' && data !== null && !Array.isArray(data) && (data as Record<string, unknown>).format === 'anatomy-export'
  if (!isExport) {
    // A bare board file keeps the board limit.
    if (bytes > LIMITS.fileBytes) {
      return fail('', `This file is ${megabytes(bytes)} MB. Anatomy opens boards up to ${megabytes(LIMITS.fileBytes)} MB.`)
    }
    const parsed = parseBoard(text)
    return parsed.ok ? { ok: true, kind: 'board', board: parsed.board, warnings: parsed.warnings } : parsed
  }

  const top = shell.safeParse(data)
  if (!top.success) {
    return {
      ok: false,
      errors: top.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })),
    }
  }

  const boardResult = parseBoard(JSON.stringify(top.data.board))
  if (!boardResult.ok) return { ok: false, errors: prefixed('board', boardResult.errors) }

  const key = top.data.schemaVersion === 1 ? 'overlay' : 'layer'
  const layerResult = readLayer(top.data.schemaVersion === 1 ? top.data.overlay : top.data.layer, boardResult.board)
  if (!layerResult.ok) return { ok: false, errors: prefixed(key, layerResult.errors) }

  if (layerResult.layer.boardId !== boardResult.board.id) {
    return fail(
      `${key}.boardId`,
      `The notes in this file belong to the board "${layerResult.layer.boardId}", but the board in the file is "${boardResult.board.id}".`,
    )
  }

  return { ok: true, kind: 'export', board: boardResult.board, layer: layerResult.layer, warnings: boardResult.warnings }
}
