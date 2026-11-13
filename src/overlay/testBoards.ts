import anatomyText from '../examples/anatomy.board.json?raw'
import nordetText from '../examples/nordet.board.json?raw'
import type { Board } from '../board/schema'
import { parseBoard } from '../board/validate'

function load(text: string): Board {
  const r = parseBoard(text)
  if (!r.ok) throw new Error('example board is invalid')
  return r.board
}

export const anatomyBoard = (): Board => load(anatomyText)
export const nordetBoard = (): Board => load(nordetText)
export const clone = <T,>(v: T): T => structuredClone(v)
