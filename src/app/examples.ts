import anatomyRaw from '../examples/anatomy.board.json?raw'
import claudeCodeRaw from '../examples/claude-code-harness.board.json?raw'
import llmRaw from '../examples/how-an-llm-works.board.json?raw'

export interface Example {
  id: string
  title: string
  description: string
  fileName: string
  raw: string
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'claude-code',
    title: 'How the Claude Code harness works',
    description: 'What happens between your prompt and a change in your repository.',
    fileName: 'claude-code-harness.board.json',
    raw: claudeCodeRaw,
  },
  {
    id: 'anatomy',
    title: 'Anatomy itself',
    description: 'How this app turns a board file into a map.',
    fileName: 'anatomy.board.json',
    raw: anatomyRaw,
  },
  {
    id: 'llm',
    title: 'How a large language model like Opus 5.5 works',
    description: 'How a model like Opus 5.5 turns a prompt into an answer.',
    fileName: 'how-an-llm-works.board.json',
    raw: llmRaw,
  },
]

/** True when a board ID belongs to one of the examples, so a board reopened from browser storage still reads as one. */
export function isExampleBoard(boardId: string): boolean {
  return EXAMPLES.some((example) => (JSON.parse(example.raw) as { id?: unknown }).id === boardId)
}
