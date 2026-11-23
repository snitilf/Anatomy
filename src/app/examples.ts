import { toast } from 'sonner'

/**
 * What the menus need to list an example, kept apart from the boards. A board is about 20 kB, and the start screen
 * shows only titles, so a board loads when the user opens it (`loadExample`). `examples.test.ts` checks every entry
 * against the real board files.
 */
export interface Example {
  /** A short name for the command menu and for tests. */
  id: string
  /** The title in the menus. It need not be the title of the board. */
  title: string
  description: string
  fileName: string
  /** The `id` field of the board, so a board kept in the browser still reads as an example without loading the file. */
  boardId: string
  /** The text of the board file. Called once the user opens the example. */
  load: () => Promise<string>
  /**
   * Room for a small precomputed outline of the board, so the start screen can draw a preview without loading it.
   * Nothing reads it yet.
   */
  outline?: Readonly<Record<string, unknown>>
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'claude-code',
    title: 'How the Claude Code harness works',
    description: 'What happens between your prompt and a change in your repository.',
    fileName: 'claude-code-harness.board.json',
    boardId: 'claude-code-harness',
    load: () => import('../examples/claude-code-harness.board.json?raw').then((m) => m.default),
  },
  {
    id: 'anatomy',
    title: 'Anatomy itself',
    description: 'How this app turns a board file into a map.',
    fileName: 'anatomy.board.json',
    boardId: 'anatomy-app',
    load: () => import('../examples/anatomy.board.json?raw').then((m) => m.default),
  },
  {
    id: 'llm',
    title: 'How a large language model like Opus 5.5 works',
    description: 'How a model like Opus 5.5 turns a prompt into an answer.',
    fileName: 'how-an-llm-works.board.json',
    boardId: 'how-an-llm-works',
    load: () => import('../examples/how-an-llm-works.board.json?raw').then((m) => m.default),
  },
]

export function loadExample(example: Example): Promise<string> {
  return example.load()
}

/** Loads an example and hands its text on. When it cannot load, the user is told and nothing changes. */
export async function openExample(example: Example, open: (fileName: string, text: string) => void): Promise<void> {
  let text: string
  try {
    text = await loadExample(example)
  } catch {
    toast.error('Could not load that example. Reload the page and try again.')
    return
  }
  open(example.fileName, text)
}

/** Loads every example once the page is idle, so an example still opens if the local server has stopped. */
export function preloadExamples(): void {
  const run = () => {
    for (const example of EXAMPLES) void loadExample(example).catch(() => undefined)
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) window.requestIdleCallback(run)
  else setTimeout(run, 1000)
}

/** True when a board ID belongs to one of the examples, so a board reopened from browser storage still reads as one. */
export function isExampleBoard(boardId: string): boolean {
  return EXAMPLES.some((example) => example.boardId === boardId)
}
