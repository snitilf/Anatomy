import anatomyText from '../examples/anatomy.board.json?raw'
import urlShortenerText from '../examples/external/url-shortener.board.json?raw'
import refundText from '../examples/refund-approval.board.json?raw'
import fortyText from '../../e2e/fixtures/forty-parts.board.json?raw'
import sixteenText from '../../e2e/fixtures/sixteen-parts.board.json?raw'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'

function load(text: string): Board {
  const r = parseBoard(text)
  if (!r.ok) throw new Error('example board is invalid')
  return r.board
}

export const anatomyBoard = (): Board => load(anatomyText)
export const refundBoard = (): Board => load(refundText)
export const urlShortenerBoard = (): Board => load(urlShortenerText)

/** Every example board and e2e fixture, for checks that must hold on any board. */
export const allBoards = (): Board[] => [anatomyText, refundText, urlShortenerText, sixteenText, fortyText].map(load)

export const clone = <T,>(v: T): T => structuredClone(v)
