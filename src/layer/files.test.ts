import { describe, expect, it } from 'vitest'
import anatomyText from '../examples/anatomy.board.json?raw'
import { placeCards } from '../layout/cards'
import { addNote, moveCards } from './edits'
import { makeExport, parseOpenedFile, serializeExport } from './files'
import { emptyLayer } from './model'
import { anatomyBoard, clone } from './testBoards'

const now = new Date('2026-03-04T05:06:07.000Z')

function sample() {
  const board = anatomyBoard()
  let layer = emptyLayer(board.id)
  layer = moveCards(layer, { [board.components[0]!.id]: { x: 12.5, y: -40 } })
  layer = addNote(layer, board, { kind: 'question', text: 'Why?', target: { type: 'board' } }, now, 'note-abcdef')
  return { board, layer }
}

/** An export file as version 1 wrote it: an overlay with every card's position frozen. */
function versionOne() {
  const { board, layer } = sample()
  const frozen = Object.fromEntries(Object.entries(placeCards(board, layer)).map(([id, r]) => [id, { x: r.x, y: r.y }]))
  return {
    board,
    text: JSON.stringify({
      format: 'anatomy-export',
      schemaVersion: 1,
      exportedAt: now.toISOString(),
      board,
      overlay: { format: 'anatomy-overlay', schemaVersion: 1, boardId: board.id, positions: frozen, notes: layer.notes, manualLinks: [] },
    }),
  }
}

describe('export files', () => {
  it('round trips a layer', () => {
    const { board, layer } = sample()
    const file = makeExport(board, layer, now)
    const text = serializeExport(file)
    expect(text.endsWith('}\n')).toBe(true)
    const r = parseOpenedFile(text)
    if (!r.ok || r.kind !== 'export') throw new Error('expected export')
    expect(r.board).toEqual(board)
    expect(r.layer).toEqual(layer)
    expect(makeExport(r.board, r.layer, now)).toEqual(file)
  })

  it('opens a version 1 export and keeps only the card the user moved', () => {
    const { board, text } = versionOne()
    const r = parseOpenedFile(text)
    if (!r.ok || r.kind !== 'export') throw new Error('expected export')
    expect(r.layer.schemaVersion).toBe(2)
    expect(r.layer.positions).toEqual({ [board.components[0]!.id]: { x: 12.5, y: -40 } })
    expect(r.layer.notes.map((n) => n.text)).toEqual(['Why?'])
  })

  it('opens a bare board as kind board, with a BOM too', () => {
    for (const text of [anatomyText, '﻿' + anatomyText]) {
      const r = parseOpenedFile(text)
      expect(r.ok && r.kind).toBe('board')
    }
  })

  it('rejects a mismatched board id, naming the right key for each version', () => {
    const { board, layer } = sample()
    const r = parseOpenedFile(serializeExport(makeExport(board, { ...layer, boardId: 'another-board' }, now)))
    expect(!r.ok && r.errors[0]).toMatchObject({ path: 'layer.boardId', message: expect.stringContaining('another-board') })
    const old = JSON.parse(versionOne().text)
    old.overlay.boardId = 'another-board'
    const r1 = parseOpenedFile(JSON.stringify(old))
    expect(!r1.ok && r1.errors[0]!.path).toBe('overlay.boardId')
  })

  it('prefixes board and layer error paths', () => {
    const { board, layer } = sample()
    const badBoard = clone(makeExport(board, layer, now)) as unknown as { board: { components: { label: string }[] } }
    badBoard.board.components[0]!.label = ''
    const rb = parseOpenedFile(JSON.stringify(badBoard))
    expect(!rb.ok && rb.errors.every((e) => e.path.startsWith('board.'))).toBe(true)

    const badLayer = clone(makeExport(board, layer, now)) as unknown as { layer: { notes: { text: string }[] } }
    badLayer.layer.notes[0]!.text = ''
    const rl = parseOpenedFile(JSON.stringify(badLayer))
    expect(!rl.ok && rl.errors[0]!.path).toBe('layer.notes[0].text')
  })

  it('never throws on bad input', () => {
    for (const text of ['', 'nope', '[]', 'null', '{"format":"anatomy-export"}', '{"format":"anatomy-export","schemaVersion":1,"exportedAt":"2026-01-01T00:00:00.000Z","board":5,"overlay":null}']) {
      expect(parseOpenedFile(text).ok).toBe(false)
    }
  })

  it('applies the size limit', () => {
    const r = parseOpenedFile('x'.repeat(2_000_001))
    expect(!r.ok && r.errors[0]!.message).toContain('Anatomy opens files up to 2 MB')
    expect(parseOpenedFile('{}', { maxExportBytes: 1 }).ok).toBe(false)
  })
})
