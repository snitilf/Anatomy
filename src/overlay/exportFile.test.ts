import { describe, expect, it } from 'vitest'
import anatomyText from '../examples/anatomy.board.json?raw'
import { makeExport, parseOpenedFile, serializeExport } from './exportFile'
import { addNote, setPosition } from './notes'
import { exportFileSchema, overlaySchema } from './schema'
import { anatomyBoard, clone } from './testBoards'
import { emptyOverlay } from './types'

const now = new Date('2026-03-04T05:06:07.000Z')

function sample() {
  const board = anatomyBoard()
  let overlay = emptyOverlay(board.id)
  overlay = setPosition(overlay, board.components[0]!.id, { x: 12.5, y: -40 })
  overlay = addNote(overlay, board, { kind: 'question', text: 'Why?', target: { type: 'board' } }, now, 'note-abcdef')
  return { board, overlay }
}

describe('export files', () => {
  it('round trips', () => {
    const { board, overlay } = sample()
    const file = makeExport(board, overlay, now)
    expect(exportFileSchema.safeParse(file).success).toBe(true)
    const text = serializeExport(file)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "format"')
    const r = parseOpenedFile(text)
    expect(r.ok).toBe(true)
    if (!r.ok || r.kind !== 'export') throw new Error('expected export')
    expect(r.board).toEqual(board)
    expect(r.overlay).toEqual(overlay)
    expect(makeExport(r.board, r.overlay, now)).toEqual(file)
  })

  it('opens a bare board as kind board, with a BOM too', () => {
    for (const text of [anatomyText, '﻿' + anatomyText]) {
      const r = parseOpenedFile(text)
      expect(r.ok && r.kind).toBe('board')
    }
  })

  it('opens an export file with a BOM', () => {
    const { board, overlay } = sample()
    const r = parseOpenedFile('﻿' + serializeExport(makeExport(board, overlay, now)))
    expect(r.ok && r.kind).toBe('export')
  })

  it('rejects a mismatched board id', () => {
    const { board, overlay } = sample()
    const file = makeExport(board, { ...overlay, boardId: 'another-board' }, now)
    const r = parseOpenedFile(serializeExport(file))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors[0]!.path).toBe('overlay.boardId')
    expect(r.errors[0]!.message).toContain('another-board')
  })

  it('prefixes board and overlay error paths', () => {
    const { board, overlay } = sample()
    const badBoard = clone(makeExport(board, overlay, now)) as any
    badBoard.board.components[0].label = ''
    const rb = parseOpenedFile(JSON.stringify(badBoard))
    expect(!rb.ok && rb.errors.every((e) => e.path.startsWith('board.'))).toBe(true)

    const badOverlay = clone(makeExport(board, overlay, now)) as any
    badOverlay.overlay.notes[0].text = ''
    const ro = parseOpenedFile(JSON.stringify(badOverlay))
    expect(!ro.ok && ro.errors[0]!.path).toBe('overlay.notes[0].text')
  })

  it('rejects a __proto__ position key and does not pollute', () => {
    const { board, overlay } = sample()
    const text = serializeExport(makeExport(board, overlay, now)).replace(
      /"positions": \{/,
      '"positions": {\n      "__proto__": { "x": 1, "y": 2 },',
    )
    expect(text).toContain('"__proto__"')
    const r = parseOpenedFile(text)
    expect(r.ok).toBe(false)
    expect(({} as Record<string, unknown>).x).toBeUndefined()
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'x')).toBe(false)

    const direct = JSON.parse('{"format":"anatomy-overlay","schemaVersion":1,"boardId":"a","positions":{"__proto__":{"x":1,"y":2}},"notes":[],"manualLinks":[]}')
    expect(overlaySchema.safeParse(direct).success).toBe(false)
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('enforces overlay limits', () => {
    const { board, overlay } = sample()
    const many = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`c${i}`, { x: 0, y: 0 }]))
    expect(overlaySchema.safeParse({ ...overlay, positions: many }).success).toBe(false)
    expect(overlaySchema.safeParse({ ...overlay, positions: { a: { x: 1e6, y: 0 } } }).success).toBe(false)
    expect(overlaySchema.safeParse({ ...overlay, extra: 1 }).success).toBe(false)
    expect(overlaySchema.safeParse({ ...overlay, notes: [{ ...overlay.notes[0], id: 'note-AB' }] }).success).toBe(false)
    expect(overlaySchema.safeParse({ ...overlay, notes: [{ ...overlay.notes[0], createdAt: 'yesterday' }] }).success).toBe(false)
    void board
  })

  it('never throws on bad input', () => {
    for (const text of ['', 'nope', '[]', 'null', '{"format":"anatomy-export"}', '{"format":"anatomy-export","schemaVersion":1,"exportedAt":"2026-01-01T00:00:00.000Z","board":5,"overlay":null}']) {
      const r = parseOpenedFile(text)
      expect(r.ok).toBe(false)
    }
  })

  it('applies the size limit', () => {
    const r = parseOpenedFile('x'.repeat(2_000_001))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.message).toContain('limit')
    const small = parseOpenedFile('{}', { maxExportBytes: 1 })
    expect(small.ok).toBe(false)
  })
})
