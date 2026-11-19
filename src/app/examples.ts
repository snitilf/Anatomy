import anatomyRaw from '../examples/anatomy.board.json?raw'
import shortenerRaw from '../examples/external/url-shortener.board.json?raw'
import refundRaw from '../examples/refund-approval.board.json?raw'

export interface Example {
  id: string
  title: string
  description: string
  fileName: string
  raw: string
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'refund',
    title: 'Refund approval',
    description: 'How a refund request becomes an approved, simulated payout.',
    fileName: 'refund-approval.board.json',
    raw: refundRaw,
  },
  {
    id: 'anatomy',
    title: 'Anatomy itself',
    description: 'How this app turns a board file into a map.',
    fileName: 'anatomy.board.json',
    raw: anatomyRaw,
  },
  {
    id: 'url-shortener',
    title: 'URL shortener',
    description: 'How a short link is created and how a visitor opens it.',
    fileName: 'url-shortener.board.json',
    raw: shortenerRaw,
  },
]

/** True when a board ID belongs to one of the examples, so a board reopened from browser storage still reads as one. */
export function isExampleBoard(boardId: string): boolean {
  return EXAMPLES.some((example) => (JSON.parse(example.raw) as { id?: unknown }).id === boardId)
}
