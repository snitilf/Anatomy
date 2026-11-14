import anatomyRaw from '../examples/anatomy.board.json?raw'
import exampleRaw from '../examples/example.board.json?raw'

export interface Example {
  id: string
  title: string
  description: string
  fileName: string
  raw: string
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'example',
    title: 'Example check-in',
    description: 'How a late order becomes an approved notice.',
    fileName: 'example.board.json',
    raw: exampleRaw,
  },
  {
    id: 'anatomy',
    title: 'Anatomy itself',
    description: 'How this app turns a board file into a map.',
    fileName: 'anatomy.board.json',
    raw: anatomyRaw,
  },
]

/** True when a board ID belongs to one of the examples, so a board reopened from browser storage still reads as one. */
export function isExampleBoard(boardId: string): boolean {
  return EXAMPLES.some((example) => (JSON.parse(example.raw) as { id?: unknown }).id === boardId)
}
